// Wave 9 — Card 5, part B: AWARENESS. Who else is here, where are they looking, what
// have they got selected.
//
// ---------------------------------------------------------------------------
// AWARENESS IS NOT A DOCUMENT EDIT, AND THE DAY IT BECOMES ONE IS THE DAY THE
// DOCUMENT IS RUINED
// ---------------------------------------------------------------------------
//
// It is genuinely tempting to reuse the op log. It is right there; it already has
// ordering, delivery, de-duplication and catch-up; a cursor is "just" a property of a
// peer. Do it and here is what you have built:
//
//   • A 60Hz write stream into an APPEND-ONLY, PERSISTED, REPLAYABLE log. Ten minutes of
//     four people moving their mice is ~150,000 permanent entries in a document whose
//     actual content is forty nodes.
//   • A Lamport clock in the millions, because every mouse sample ticks it — so every
//     real edit now sorts against a clock dominated by mouse jitter.
//   • "Replay the document" now literally re-enacts someone's mouse movements from last
//     March, and the byte-identical-replay contract has to reproduce them exactly.
//   • And a cursor that has to be UNDONE, because it is in the undo stack.
//
// None of that is recoverable later: the log is append-only, so a bad decision here is
// permanent by construction. Hence: separate message kind, separate store, separate
// lifecycle. This class cannot reach the op log — it holds no Replica and is handed no
// log — and there is a test that drives a thousand cursor moves through a live adapter
// and asserts the log is still EMPTY.
//
// ---------------------------------------------------------------------------
// THE LIFECYCLE, WHICH IS THE OPPOSITE OF THE LOG'S IN EVERY RESPECT
// ---------------------------------------------------------------------------
//
//   log:        durable · causally ordered · de-duplicated · every op matters · forever
//   awareness:  ephemeral · LWW per peer · lossy on purpose · only the LATEST matters ·
//               expires
//
// LOSSY ON PURPOSE is the load-bearing one. Dropping a cursor sample costs nothing — the
// next is 16ms behind it. So awareness needs no retransmission, no acknowledgement, no
// catch-up and no buffering, and building any of those would be pure waste.
//
// EXPIRES is the other. A tab that crashes sends no `bye`, and a peer whose ghost cursor
// hovers over the canvas forever is worse than no cursor at all. So every peer's state
// carries a `lastSeen`, a heartbeat refreshes it, and anything stale is dropped. The
// explicit `bye` is a fast path, never the guarantee.

import type { ActorId } from '../collab/op';
import type { AwarenessState } from './protocol';

export type { AwarenessState };

/** Another peer, as far as we know. */
export interface PeerPresence {
  actor: ActorId;
  state: AwarenessState;
  /** Wall-clock ms of the last message from them. NOT a Lamport clock — see below. */
  lastSeen: number;
  /** Their sequence number for `state`. Guards against a reordered cursor sample. */
  seq: number;
}

export interface AwarenessChange {
  added: ActorId[];
  updated: ActorId[];
  removed: ActorId[];
}

export interface AwarenessOptions {
  actor: ActorId;
  /** Drop a peer we have not heard from in this long. */
  timeoutMs?: number;
  /** Wall clock — injectable so the expiry tests are not a race against real time. */
  now?: () => number;
}

/**
 * The presence store for one peer: our own state, and everyone else's.
 *
 * Deliberately transport-free. `SyncAdapter` wires it to a channel; a test wires it to
 * nothing and drives it directly. It never sees an Op, a Replica or an OpLog, and that
 * is not an accident — it is the containment.
 *
 * ---------------------------------------------------------------------------
 * WHY `lastSeen` IS A WALL CLOCK WHEN THE LOG WENT TO SUCH LENGTHS TO AVOID ONE
 * ---------------------------------------------------------------------------
 * Because the question is different. The log asks "did A happen before B?", which a wall
 * clock cannot answer across machines (they disagree, and they run backwards). Expiry
 * asks "has it been 15 seconds since I last heard from Bob?" — measured entirely on MY
 * clock, about MY receipts, comparing my own `now()` to my own earlier `now()`. Bob's
 * clock is never consulted, so its wrongness cannot infect anything. Using a Lamport
 * clock for a TIMEOUT would be the actual mistake: it has no relationship to seconds.
 */
export class Awareness {
  private readonly peers = new Map<ActorId, PeerPresence>();
  private local: AwarenessState = {};
  private seq = 0;

  private readonly listeners = new Set<(change: AwarenessChange) => void>();
  private readonly timeoutMs: number;
  private readonly nowFn: () => number;

  constructor(private readonly options: AwarenessOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.nowFn = options.now ?? Date.now;
  }

  get actor(): ActorId {
    return this.options.actor;
  }

  /** Our own published state, and the sequence a peer will LWW it by. */
  getLocalState(): AwarenessState {
    return this.local;
  }

  get localSeq(): number {
    return this.seq;
  }

  /**
   * Merge a patch into our own state and bump the sequence.
   *
   * Returns false when nothing actually changed — a mouse that has not moved must not
   * burn a sequence number, wake the throttle, or send a message. (A `mousemove` fires
   * on sub-pixel jitter and on scroll; without this guard an idle user with a resting
   * hand is a 60Hz broadcaster.)
   */
  setLocalState(patch: Partial<AwarenessState>): boolean {
    let changed = false;
    const next: AwarenessState = { ...this.local };

    for (const [k, v] of Object.entries(patch)) {
      if (!shallowEqual(next[k], v)) {
        next[k] = v;
        changed = true;
      }
    }
    if (!changed) return false;

    this.local = next;
    this.seq++;
    return true;
  }

  /**
   * Take a peer's published state.
   *
   * `seq` is the whole reason a reordered transport does not make a cursor jump
   * backwards: a sample older than the one we already hold is REFUSED, exactly as the LWW
   * gate refuses a superseded op. Same idea, one scope down, and no shared machinery
   * because the lifecycles have nothing in common.
   */
  applyRemote(actor: ActorId, state: AwarenessState | null, seq: number): AwarenessChange | null {
    if (actor === this.options.actor) return null; // our own echo; ignore

    if (state === null) {
      return this.remove(actor);
    }

    const existing = this.peers.get(actor);
    if (existing && seq < existing.seq) return null; // a stale sample overtook a fresh one

    const now = this.nowFn();
    if (existing) {
      // Even a same-seq message refreshes lastSeen: that is what a HEARTBEAT is — "still
      // here, nothing new". Without this an idle-but-present peer times out and their
      // cursor vanishes while they are staring at it.
      existing.lastSeen = now;
      if (seq === existing.seq) return null;
      existing.seq = seq;
      existing.state = state;
      this.emit({ added: [], updated: [actor], removed: [] });
      return { added: [], updated: [actor], removed: [] };
    }

    this.peers.set(actor, { actor, state, lastSeen: now, seq });
    const change = { added: [actor], updated: [], removed: [] };
    this.emit(change);
    return change;
  }

  /** An explicit `bye`, or a transport that told us the peer is gone. */
  remove(actor: ActorId): AwarenessChange | null {
    if (!this.peers.delete(actor)) return null;
    const change = { added: [], updated: [], removed: [actor] };
    this.emit(change);
    return change;
  }

  /**
   * Drop peers we have not heard from inside the timeout.
   *
   * THE GUARANTEE, as opposed to `bye`, which is merely the optimisation. A crashed tab,
   * a closed laptop, a killed process and a severed cable all send no `bye` whatsoever,
   * and every one of them must eventually stop showing a cursor.
   */
  prune(): AwarenessChange | null {
    const cutoff = this.nowFn() - this.timeoutMs;
    const removed: ActorId[] = [];
    for (const [actor, p] of this.peers) {
      if (p.lastSeen < cutoff) {
        this.peers.delete(actor);
        removed.push(actor);
      }
    }
    if (removed.length === 0) return null;
    const change = { added: [], updated: [], removed };
    this.emit(change);
    return change;
  }

  /** Everyone but us. */
  getPeers(): PeerPresence[] {
    return [...this.peers.values()];
  }

  getPeer(actor: ActorId): PeerPresence | undefined {
    return this.peers.get(actor);
  }

  get peerCount(): number {
    return this.peers.size;
  }

  /** Everyone is gone (we disconnected — we can no longer vouch for anyone). */
  clearPeers(): AwarenessChange | null {
    if (this.peers.size === 0) return null;
    const removed = [...this.peers.keys()];
    this.peers.clear();
    const change = { added: [], updated: [], removed };
    this.emit(change);
    return change;
  }

  onChange(listener: (change: AwarenessChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: AwarenessChange): void {
    for (const l of [...this.listeners]) l(change);
  }
}

/** Enough to tell "the cursor moved" from "the cursor did not". Selections are arrays. */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every(
      (k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]
    );
  }
  return false;
}
