// Wave 9 — Card 5: the SyncAdapter. Everything that is hard about collaboration, in one
// place, above the transport, so that every transport gets it right for free.
//
//        Replica (log · LWW gate · capture)         ← Card 0, not touched here
//            ▲                       │ onLocalOp
//            │ receive(ready)        ▼
//     ┌──────┴───────────────────────────────┐
//     │  CausalBuffer     OpBatcher          │   ← this file wires them
//     │  VersionVector    Awareness          │
//     └──────▲───────────────────────────────┘
//            │  SyncMessage                  │
//     ┌──────┴───────────────────────────────┐
//     │  SyncTransport  (memory · Broadcast  │   ← dumb pipes. Cannot get this wrong,
//     │                  Channel · WebSocket)│      because they are not told what it is.
//     └──────────────────────────────────────┘
//
// THE FIVE THINGS THIS FILE OWNS, none of which a transport is allowed to know about:
//
//  1. CATCH-UP.   Reconnect ⇒ exchange frontiers ⇒ each side ships the other exactly what
//                 it lacks. See version-vector.ts for why the obvious watermark is a trap.
//  2. CAUSALITY.  An op whose entity has not arrived is HELD, not dropped. See
//                 causal-buffer.ts for why dropping it is unrecoverable.
//  3. BATCHING.   60Hz of drag ops become one message a frame, last-write-wins per
//                 register, order preserved. See batcher.ts.
//  4. AWARENESS.  On the wire, never in the log. See awareness.ts.
//  5. RELAY.      In a mesh, forward what was new to us. `Replica.receive()` returns
//                 exactly that set, and returns EMPTY for a re-delivery, which is what
//                 makes the forwarding terminate instead of looping forever.
//
// THE REACHABILITY DISCIPLINE. This engine's signature bug — found in all eight previous
// waves — is machinery wired to nothing: a `setLayoutService()` nobody called, LOD presets
// that were all no-ops, a worker stack every test disabled, a `Command.serialize()` with
// no deserializer anywhere. So the load-bearing test for this card is NOT the unit tests
// below the fold. It is `reachability.spec.ts` and the two-pane e2e: mount a REAL
// `createDiagram`, drag a node with REAL pointer events, and assert the bytes come out of
// the OTHER pane's model. If that test is deleted, this file is decoration.

import type { DiagramModel } from '../models/DiagramModel';
import { Replica } from '../collab/replica';
import type { ActorId, Op } from '../collab/op';
import { Awareness, type AwarenessState } from './awareness';
import { OpBatcher, type OpBatcherOptions } from './batcher';
import { CausalBuffer } from './causal-buffer';
import type { SyncMessage } from './protocol';
import type { SyncTransport, TransportStatus, Unsubscribe } from './transport';
import { VersionVector, deltaFor, type VersionVectorJSON } from './version-vector';

export interface SyncAdapterOptions {
  /** Batching. `false` sends every op the instant it happens — legal, and a bad idea. */
  batch?: Omit<OpBatcherOptions, 'onFlush'> | false;

  /**
   * Forward ops that were NEW to us on to our other peers.
   *
   * OFF by default, because every transport shipped here is a BROADCAST bus — everyone
   * already got the message, so relaying it doubles the traffic to deliver nothing. Turn
   * it ON for a point-to-point mesh (WebRTC, a chain of relays) where a peer may be
   * reachable only through us. It terminates because `Replica.receive()` returns the ops
   * that were genuinely new, and a re-delivery is new to nobody.
   */
  relay?: boolean;

  /** Periodic anti-entropy, ms. 0 disables it (the tests drive `sync()` by hand). */
  syncIntervalMs?: number;

  /** Re-publish our awareness this often so peers do not time us out while we sit still. */
  heartbeatMs?: number;

  /** Minimum ms between awareness sends. 60Hz in, ~20Hz out. */
  awarenessThrottleMs?: number;

  /** Drop a peer's presence after this long without a word. */
  awarenessTimeoutMs?: number;

  /** Injectables, so every timing test is deterministic instead of a race. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  now?: () => number;
}

/** Counters. Every one of them is something a test asserts on, not decoration. */
export interface SyncStats {
  /** Messages handed to the transport. */
  messagesSent: number;
  /** Messages taken from the transport. */
  messagesReceived: number;
  /** Ops we put on the wire (post-coalescing). */
  opsSent: number;
  /** Ops that arrived. */
  opsReceived: number;
  /** …of which the log had already seen: duplicate delivery, absorbed. */
  opsDuplicate: number;
  /** Ops currently HELD by the causal buffer, waiting for an `add`. */
  opsHeld: number;
  /** Anti-entropy rounds we asked for. */
  syncsRequested: number;
  /**
   * Times a peer's frontier turned out to have a HOLE and we resent an actor's history.
   *
   * The number that proves the hostile-transport fuzz is not vacuous. If this is 0 after
   * a thousand lossy trials, the repair path never ran and the test proved nothing.
   */
  repairs: number;
  /** Ops the batcher swallowed because a later write superseded them. */
  opsCoalesced: number;
  /** Reconnects observed. */
  reconnects: number;
}

/**
 * Binds one `Replica` to one `SyncTransport`.
 *
 * The replica must be constructed with `onLocalOp` pointing at `adapter.publish` — use
 * {@link createSyncSession}, which does that wiring for you and cannot get it backwards.
 */
export class SyncAdapter {
  readonly awareness: Awareness;

  private readonly buffer: CausalBuffer;
  private readonly vv = new VersionVector();
  private readonly batcher: OpBatcher | null;
  private readonly unsubs: Unsubscribe[] = [];

  private syncTimer: unknown = null;
  private heartbeatTimer: unknown = null;
  private awarenessTimer: unknown = null;
  private awarenessPending = false;
  private lastAwarenessSend = 0;
  private joined = false;
  /** Have we ever successfully announced? Distinguishes the first connect from a RECONNECT. */
  private announced = false;
  private disposed = false;

  private readonly nowFn: () => number;
  private readonly setTimerFn: (cb: () => void, ms: number) => unknown;
  private readonly clearTimerFn: (h: unknown) => void;
  private readonly setIntervalFn: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (h: unknown) => void;

  readonly stats: SyncStats = {
    messagesSent: 0,
    messagesReceived: 0,
    opsSent: 0,
    opsReceived: 0,
    opsDuplicate: 0,
    opsHeld: 0,
    syncsRequested: 0,
    repairs: 0,
    opsCoalesced: 0,
    reconnects: 0,
  };

  constructor(
    readonly replica: Replica,
    private readonly transport: SyncTransport,
    private readonly options: SyncAdapterOptions = {}
  ) {
    this.nowFn = options.now ?? Date.now;
    this.setTimerFn = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms) as unknown);
    this.clearTimerFn =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.setIntervalFn =
      options.setInterval ?? ((cb, ms) => setInterval(cb, ms) as unknown);
    this.clearIntervalFn =
      options.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

    this.buffer = new CausalBuffer(replica.diagram);
    this.awareness = new Awareness({
      actor: replica.actor,
      timeoutMs: options.awarenessTimeoutMs,
      now: this.nowFn,
    });

    // The diagram may already have history (loaded from disk, or edited before anyone
    // else joined). Our frontier must reflect it, or our very first `sync` would ask a
    // peer to resend everything we already have.
    this.vv.observeAll(replica.history());

    this.batcher =
      options.batch === false
        ? null
        : new OpBatcher({
            ...(options.batch ?? {}),
            onFlush: (ops) => this.sendOps(ops),
            setTimer: options.setTimer,
            clearTimer: options.clearTimer,
          });

    this.unsubs.push(this.transport.onMessage((m) => this.onMessage(m)));
    this.unsubs.push(this.transport.onStatus((s) => this.onStatus(s)));
  }

  get actor(): ActorId {
    return this.replica.actor;
  }

  get diagram(): DiagramModel {
    return this.replica.diagram;
  }

  /** Ops still waiting on an `add` that has not arrived. Should return to 0. */
  get pendingOps(): Op[] {
    return this.buffer.pending();
  }

  /**
   * What we tell peers we have.
   *
   * THE INVARIANT, and it is worth stating as one because it is the whole correctness
   * condition of this layer in a single line:
   *
   *     frontier() === VersionVector.fromOps(replica.history())     — ALWAYS.
   *
   * The frontier is a CACHE of the log's own summary, maintained incrementally so we do not
   * rescan the history on every sync. A cache that disagrees with its source is not a
   * performance detail; it is a peer lying to the network about what it holds. Claim too
   * much and you never receive the op you are missing (silent data loss); claim too little
   * and every round resends an actor's entire history (a silent O(history) amplifier on the
   * flakiest connections, which is precisely where you can least afford it).
   *
   * `sync-adapter.spec.ts` asserts this equality after a full hostile session, which is what
   * makes it a checked invariant rather than a comment.
   */
  frontier(): VersionVectorJSON {
    return this.vv.toJSON();
  }

  // -- lifecycle -------------------------------------------------------------

  /**
   * Announce ourselves and ask for what we are missing.
   *
   * `hello` carries our frontier, so an existing peer can push us the history we lack
   * without a second round trip — a joining peer should see the document on the first
   * message, not the third.
   */
  join(): void {
    if (this.disposed) return;
    this.joined = true;

    // `connect()` may complete SYNCHRONOUSLY (the memory bus) or ASYNCHRONOUSLY (a real
    // socket, which opens some milliseconds later). Both must announce exactly once, and
    // neither may announce into a channel that is not up yet — a `hello` sent before the
    // socket opens is silently dropped and the peer never learns we exist.
    //
    // So the announcement is owned by the STATUS handler, which is the one place that
    // knows the channel is actually up, and it fires for both cases. The fallback below
    // covers only the third: a transport handed to us already connected, which therefore
    // never transitions and never fires.
    this.transport.connect();
    if (this.transport.status === 'connected' && !this.announced) this.announce();

    const interval = this.options.syncIntervalMs ?? 0;
    if (interval > 0 && this.syncTimer === null) {
      this.syncTimer = this.setIntervalFn(() => this.sync(), interval);
    }

    const beat = this.options.heartbeatMs ?? 0;
    if (beat > 0 && this.heartbeatTimer === null) {
      this.heartbeatTimer = this.setIntervalFn(() => {
        // A heartbeat is a re-send of the CURRENT state at the CURRENT sequence — it must
        // not bump `seq`, or every peer would think our cursor "changed" every 5 seconds
        // and repaint it. It refreshes their `lastSeen`, nothing more.
        this.sendAwareness();
        // …and it is where WE drop peers who have stopped heartbeating at us. Expiry has
        // to be driven by a timer: nothing arrives from a peer whose tab has crashed, so
        // there is no event to hang it on. That is precisely why their cursor would
        // otherwise hover on the canvas forever.
        this.awareness.prune();
      }, beat);
    }
  }

  /** Say goodbye and stop. Best-effort — the peers' TTL is what actually guarantees it. */
  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.batcher?.flush();
    this.send({ t: 'bye', from: this.actor });
    this.stopTimers();
    this.transport.disconnect();
    // We can no longer vouch for anyone: their cursors must go.
    this.awareness.clearPeers();
  }

  /**
   * An anti-entropy round: "here is my frontier; send me what I lack, and tell me yours."
   *
   * Called on join, on RECONNECT, and (optionally) on a timer. The timer is not paranoia:
   * a transport that can drop a message can drop an op, and the ONLY thing that ever
   * repairs that is asking again.
   */
  sync(): void {
    this.stats.syncsRequested++;
    this.send({ t: 'sync', from: this.actor, vv: this.vv.toJSON(), reply: true });
  }

  /** Push any queued local ops onto the wire now. */
  flush(): void {
    this.batcher?.flush();
  }

  /**
   * Our own edits. Wired to `Replica.onLocalOp` — see {@link createSyncSession}.
   *
   * The local op is ALREADY in our log and already applied (the Replica did both before
   * calling us). Our job is only to get it to the others, so a failure to send is not a
   * failure to edit — it is a divergence the next sync round will close.
   */
  publish(op: Op): void {
    if (this.disposed) return;

    // The causal buffer has to know about entities WE create, not just ones a peer told us
    // about. Skip this and a peer's edit to a node we made waits forever for an `add` that
    // nobody will ever send us — because we are the only one who has it. See
    // `CausalBuffer.noteLocal`; the fuzz found it, and it is the most ordinary interaction
    // there is: someone moving someone else's node.
    this.buffer.noteLocal(op);

    this.vv.observe(op);
    if (this.batcher) this.batcher.push(op);
    else this.sendOps([op]);
  }

  // -- awareness -------------------------------------------------------------

  /**
   * Publish our cursor / selection / name.
   *
   * THROTTLED, not debounced. A debounce would send nothing at all while the mouse keeps
   * moving — the cursor would only appear once you stopped, which is the exact opposite
   * of the feature. A throttle sends the newest sample at a bounded rate and drops the
   * ones in between, which is precisely correct for a value where only the latest matters.
   */
  setAwareness(patch: Partial<AwarenessState>): void {
    if (this.disposed) return;
    if (!this.awareness.setLocalState(patch)) return; // nothing actually changed

    const throttle = this.options.awarenessThrottleMs ?? 50;
    const since = this.nowFn() - this.lastAwarenessSend;

    if (since >= throttle) {
      this.sendAwareness();
      return;
    }
    if (this.awarenessPending) return;

    // Trailing edge: whatever the state IS when the timer fires is what goes out. Not the
    // state as of the call that scheduled it — that sample is already stale, and sending
    // it would make the remote cursor permanently lag by one throttle window.
    this.awarenessPending = true;
    this.awarenessTimer = this.setTimerFn(() => {
      this.awarenessTimer = null;
      this.awarenessPending = false;
      this.sendAwareness();
    }, throttle - since);
  }

  private sendAwareness(): void {
    if (!this.joined) return;
    this.lastAwarenessSend = this.nowFn();
    this.send({
      t: 'awareness',
      from: this.actor,
      state: this.awareness.getLocalState(),
      seq: this.awareness.localSeq,
    });
  }

  // -- the wire --------------------------------------------------------------

  private send(message: SyncMessage): void {
    if (this.disposed) return;
    this.stats.messagesSent++;
    this.transport.send(message);
  }

  private sendOps(ops: Op[]): void {
    if (ops.length === 0) return;
    this.stats.opsSent += ops.length;
    if (this.batcher) {
      this.stats.opsCoalesced = this.batcher.queued - this.batcher.sent;
    }
    this.send({ t: 'ops', from: this.actor, ops });
  }

  private onStatus(status: TransportStatus): void {
    if (this.disposed || !this.joined) return;

    if (status === 'disconnected') {
      // Do NOT flush: the transport is down, so a flush would drop the batch on the floor
      // and we would think we had sent it. Discard is safe because every op is already in
      // our log — the reconnect's sync round is what actually delivers them.
      this.batcher?.discard();
      this.awareness.clearPeers();
      return;
    }

    // BACK. `announce()` IS the whole reconnect story.
    if (this.announced) this.stats.reconnects++;
    this.announce();
  }

  /**
   * "Here I am; here is what I have."
   *
   * Fired on the first connect and on every RECONNECT, and it is the same two messages
   * both times — because "I have been away for 30 seconds" and "I have just arrived" are
   * the same question from the network's point of view, and answering them with one code
   * path is why the reconnect case cannot rot: it is exercised by every single join.
   *
   * Everything both sides did while apart is sitting in their logs. Nothing was lost; it
   * was only undelivered. `deltaFor` works out exactly what each side missed.
   */
  private announce(): void {
    this.announced = true;
    this.send({
      t: 'hello',
      from: this.actor,
      vv: this.vv.toJSON(),
      awareness: this.awareness.getLocalState(),
    });
    this.sync();
  }

  private onMessage(msg: SyncMessage): void {
    if (this.disposed) return;
    this.stats.messagesReceived++;

    switch (msg.t) {
      case 'ops':
        this.ingest(msg.ops);
        return;

      case 'hello':
        // Someone new (or someone back). Push them what they lack, unprompted — a joining
        // peer that has to ASK for the document sees a blank canvas until the round trip
        // completes.
        this.answer(msg.vv);
        if (msg.awareness) {
          this.awareness.applyRemote(msg.from, msg.awareness, 0);
        }
        // …and tell them ours, so THEY can push US what WE lack. Both directions, because
        // a rejoining peer has edits of its own.
        this.send({ t: 'sync', from: this.actor, vv: this.vv.toJSON(), reply: false });
        return;

      case 'sync':
        this.answer(msg.vv);
        // `reply: false` on the response, or two peers answer each other's sync requests
        // forever — a broadcast storm that looks exactly like a working system until you
        // count the messages.
        if (msg.reply) {
          this.send({ t: 'sync', from: this.actor, vv: this.vv.toJSON(), reply: false });
        }
        return;

      case 'awareness':
        // NOTE WHAT IS NOT HERE: no log, no clock, no causal buffer, no version vector.
        // Awareness stops at this line and never travels further into the document.
        this.awareness.applyRemote(msg.from, msg.state, msg.seq);
        return;

      case 'bye':
        this.awareness.remove(msg.from);
        return;
    }
  }

  /** Ship a peer exactly the ops its frontier says it does not have. */
  private answer(remoteVv: VersionVectorJSON): void {
    const { ops, repairedActors } = deltaFor(this.replica.history(), remoteVv);
    if (repairedActors.length > 0) this.stats.repairs++;
    if (ops.length > 0) this.sendOps(ops);
  }

  /**
   * The receive path, in the only order that works.
   *
   *   CausalBuffer → Replica → VersionVector → relay
   *
   * The buffer FIRST, and that ordering is the load-bearing part: an op that reaches the
   * Replica before its `add` is logged, stamped, and silently dropped, and no later
   * delivery can ever resurrect it (the log de-duplicates it, and the LWW gate now refuses
   * it as superseded by itself). Once it is past the Replica it is too late. See
   * causal-buffer.ts.
   */
  private ingest(ops: Op[]): void {
    this.stats.opsReceived += ops.length;

    const { ready } = this.buffer.admit(ops);
    this.stats.opsHeld = this.buffer.pendingCount;
    if (ready.length === 0) return;

    // `receive()` returns exactly the ops that were NEW — duplicates come back as nothing.
    const fresh = this.replica.receive(ready);
    this.stats.opsDuplicate += ready.length - fresh.length;
    if (fresh.length === 0) return;

    // The frontier advances ONLY on ops the log genuinely accepted. Counting a duplicate
    // here would inflate the digest, fake a hole, and make every subsequent sync round
    // "repair" a history that was never broken.
    this.vv.observeAll(fresh);

    // Mesh forwarding. Empty for a re-delivery, which is what makes it terminate.
    if (this.options.relay) this.sendOps(fresh);
  }

  private stopTimers(): void {
    if (this.syncTimer !== null) {
      this.clearIntervalFn(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      this.clearIntervalFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.awarenessTimer !== null) {
      this.clearTimerFn(this.awarenessTimer);
      this.awarenessTimer = null;
    }
    this.awarenessPending = false;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.joined) this.leave();
    this.disposed = true;
    this.stopTimers();
    this.batcher?.dispose();
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.transport.close();
  }
}

export interface SyncSessionOptions extends SyncAdapterOptions {
  actor: ActorId;
  /** Resume the Lamport clock from a persisted tail. */
  startClock?: number;
}

/**
 * Build a Replica and a SyncAdapter, correctly wired to each other.
 *
 * The wiring is one line and it is easy to forget, and forgetting it produces the exact
 * failure this codebase is famous for: everything green, every unit test passing, and not
 * one edit ever reaching the wire — because `onLocalOp` went nowhere.
 */
export function createSyncSession(
  diagram: DiagramModel,
  transport: SyncTransport,
  options: SyncSessionOptions
): SyncAdapter {
  let adapter: SyncAdapter | undefined;

  const replica = new Replica(diagram, {
    actor: options.actor,
    startClock: options.startClock,
    // The closure defers the lookup: the Replica needs the callback at construction and
    // the adapter needs the Replica. An edit cannot possibly happen between these two
    // statements, so the `?.` is a type formality, not a race.
    onLocalOp: (op) => adapter?.publish(op),
  });

  adapter = new SyncAdapter(replica, transport, options);
  return adapter;
}
