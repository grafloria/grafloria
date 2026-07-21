// Wave 9 — Card 0/4: a Replica — one peer's view of a shared diagram.
//
// This is the object the rest of the wave actually programs against. It binds the pieces
// that are useless alone:
//
//     the DIAGRAM    — the live model the user edits
//     the LOG        — every op this peer knows about, in total order, de-duplicated
//     the CAPTURE    — local edits → ops (and the re-entrancy guard that stops echoes)
//     the LWW GATE   — which write owns each register (arrival order ⇒ total order)
//     INTEGRITY      — the one invariant a diagram cannot survive breaking (Card 4)
//     the UNDO STACK — per-actor, supersession-aware (Card 4)
//
// ---------------------------------------------------------------------------
// WHERE IDEMPOTENCE ACTUALLY LIVES, AND WHY IT IS NOT IN THE REDUCER
// ---------------------------------------------------------------------------
//
// The byte-identical replay test caught this and it is worth writing down, because the
// obvious fix is the wrong one.
//
// Replaying a log twice through `replay()` does NOT leave the diagram untouched. Content
// converges — but consider a session that ADDED a node and then DELETED it. On a second
// pass, `add c` legitimately succeeds again (c is not there), and `remove c` deletes it
// again. The end state is identical, and yet the diagram's `version` counter has moved,
// because two real mutations really did happen.
//
// The tempting fix is to make the REDUCER idempotent — have applyOp remember what it has
// seen. That is the wrong layer: applyOp's whole job is "given a model and an op, produce
// the next state", and giving it memory would make it stateful, untestable, and no longer
// a pure function of (model, op).
//
// Idempotence belongs to the LOG. A peer already has to remember which ops it has seen —
// that is what makes `OpLog.append()` return false on a duplicate — so the rule is simply:
//
//     APPLY ONLY WHAT THE LOG HAS NOT SEEN BEFORE.
//
// Then a duplicate delivery, a reconnect that replays the whole history, and a peer
// catching up from a snapshot that already contains half the ops are all the same thing
// and all free. `replay()` stays a dumb, honest primitive that does exactly what it is
// told, which is what you want from the piece everything else is tested against.

import { DiagramModel } from '../models/DiagramModel';
import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { GroupModel } from '../models/GroupModel';
import type { StrokeModel } from '../models/StrokeModel';
import { applyOp, applyEntitySet } from './apply-op';
import { OpCapture, type OpBefore } from './capture';
import { ReferentialIntegrity } from './integrity';
import { LwwRegistry, type Stamp } from './lww';
import { OpLog } from './op-log';
import { UndoStack } from './undo';
import { compareOps, setValueOf, type ActorId, type Op } from './op';

export interface ReplicaOptions {
  /** This peer's identity. MUST be unique across peers — the total order depends on it. */
  actor: ActorId;
  /** Called with each op this peer produces locally. Hand it to a transport (Card 5). */
  onLocalOp?: (op: Op) => void;
  /** Resume the Lamport clock from a persisted tail. */
  startClock?: number;
}

/**
 * One peer.
 *
 * Local edits to `diagram` are captured, appended to `log`, and handed to `onLocalOp`.
 * Remote ops arrive at `receive()`, are de-duplicated, applied, and NOT echoed back.
 */
export class Replica {
  readonly log = new OpLog();

  /**
   * Which write owns each register. THE piece that makes arrival-order application equal
   * to total-order replay — see lww.ts, and the fuzz test that proved it is not optional.
   */
  private readonly lww: LwwRegistry;

  private readonly capture: OpCapture;
  private readonly integrity: ReferentialIntegrity;
  private readonly undoStack: UndoStack;

  /**
   * Per entity, the highest clock of any `set` the log holds for it.
   *
   * The O(1) question "could an `add` that just landed have clobbered a write NEWER than
   * itself?" — see repair(). Without it the answer costs a scan of the whole log on every
   * single `add`, which is a per-node cost paid for a case that almost never arises.
   */
  private readonly newestSet = new Map<string, number>();

  /**
   * nodeId → the port ids each node had BEFORE the log's first op — i.e. at the moment
   * this replica attached (a snapshot load, or the live document collaboration started
   * on).
   *
   * canonicalizePortOrder() needs it to tell a port ADD from a port UPDATE in the log: a
   * `ports.<id>` value-write is an add only if the port was not already present, and
   * presence has to be simulated from somewhere. For a node whose `add` op is in the log,
   * the op's data is that starting point; for a node that predates the log, this is.
   * Peers that join from the same snapshot record the same sets, so the derivation stays
   * identical everywhere — which is the one property canonical order actually needs.
   */
  private readonly basePorts = new Map<string, Set<string>>();

  constructor(
    readonly diagram: DiagramModel,
    private readonly options: ReplicaOptions
  ) {
    this.lww = new LwwRegistry();
    this.integrity = new ReferentialIntegrity(diagram, this.lww);
    for (const n of diagram.getNodes()) {
      this.basePorts.set(n.id, new Set(n.getPorts().map((p) => p.id)));
    }
    this.undoStack = new UndoStack(this.log, options.actor, (op) => this.applyLocalInverse(op));

    this.capture = new OpCapture(diagram, {
      actor: options.actor,
      startClock: options.startClock,
      onOp: (op, before) => this.onLocalOp(op, before),
    });
  }

  get actor(): ActorId {
    return this.options.actor;
  }

  /** The clock to resume from, and the watermark a peer asks us to catch up past. */
  get clock(): number {
    return this.capture.lamport.peek();
  }

  /** Links held out of the document because an endpoint node is missing. See integrity.ts. */
  get quarantinedLinks(): string[] {
    return this.integrity.quarantined;
  }

  get canUndo(): boolean {
    return this.undoStack.canUndo;
  }

  get canRedo(): boolean {
    return this.undoStack.canRedo;
  }

  /**
   * Take ops from a peer.
   *
   * Returns the ops that were actually NEW to us — which is what you forward to other
   * peers in a mesh, and which is exactly nothing when the same batch arrives twice.
   */
  receive(ops: readonly Op[]): Op[] {
    // The log is the memory. Anything it has already seen is applied to nothing.
    const fresh = this.log.appendAll(ops);
    if (fresh.length === 0) return [];

    // IN TOTAL ORDER, NOT ARRIVAL ORDER — `appendAll` hands them back in the order the
    // network chose. The LWW gate makes REGISTER writes order-independent, but not
    // everything a peer does is a register write: a link installed before its node has
    // arrived caches `undefined` endpoint node ids, and those ids are in serialize(). Two
    // peers given the same ops in different orders would then hold different documents.
    // Integrity re-derives those ids anyway, so this is belt to that braces — but applying
    // a batch in the one order every peer agrees on costs a sort and removes a whole class
    // of order-dependence at the source.
    fresh.sort(compareOps);

    // BEFORE any of them is applied: the repair check asks whether the log holds a write
    // NEWER than an `add` that is about to land, and the answer must account for the ops in
    // this very batch — the resurrection and the writes it displaces routinely arrive
    // together.
    for (const op of fresh) this.note(op);

    // REMOTE OPS BYPASS THE READ-ONLY LOCK — and this is the whole reason a locked replica
    // is a VIEWER of a live session rather than a document frozen at join. The lock refuses
    // THIS user's document writes (drag, delete, paste); a remote op is not this user's
    // intent, it is the document already meaning something new on a peer, mirrored here. So
    // the entire apply window — the reducer, the integrity sweep it may trigger (evicting an
    // orphaned link is a locked-guarded removeLink), and the port re-canonicalization —
    // runs as a SYSTEM write, exactly the door auto-size and portal placement already use.
    //
    // Scoped to THIS boundary only. runSystemWrite is a synchronous try/finally depth
    // counter and everything inside is synchronous, so the window is exactly the apply and
    // closes before this method returns — a subsequent LOCAL edit is refused as ever. The
    // local-edit paths (onLocalOp, applyLocalInverse, undo/redo/transact) are deliberately
    // OUTSIDE this wrap: they carry user intent and must keep hitting the lock. This and
    // op-log.ts's replay() are the entire remote-apply allowlist — greppable, not ambient,
    // exactly as models/readonly-lock.ts demands of its bypass.
    this.diagram.runSystemWrite(() => {
      // Suppressed capture: applying these must not re-emit them as OUR edits, or two peers
      // relay the same op back and forth forever.
      this.capture.applyRemote(fresh, (op) => this.applyRemote(op));

      // ONCE per batch, not once per op: reconcile is O(links), and a 10k-op catch-up that
      // swept after every op would be quadratic. Safe because the invariant is a function of
      // the batch's FINAL state — a link orphaned in the middle of a batch and re-parented by
      // the end of it was never really orphaned.
      //
      // SILENTLY, and this is not hygiene — it is the difference between converging and not.
      // With capture live, evicting an orphaned link emits a LOCAL `remove link` op. That op
      // is broadcast, and on the peer that receives it the link is not quarantined but
      // DESTROYED: its presence register now says "removed", permanently. Undo the node delete
      // and the link comes back on the peer that quarantined it and stays dead on the peer
      // that was told to remove it. Two documents, no error. Integrity is DERIVED — every peer
      // computes it for itself — so putting any of it on the wire is not redundancy, it is a
      // race against the very ops it was derived from.
      this.capture.silently(() => this.integrity.reconcile());

      // Ports have per-port registers (wave14), so their ORDER inside the node's Map — which
      // is serialize() order, i.e. part of the document — is no longer carried by any single
      // op. Derive it, exactly as integrity derives entity order. Only nodes this batch
      // touched; local edits never de-canonicalize (a local op has the newest stamp this
      // peer has seen, so its append position IS its canonical position).
      const portNodes = new Set<string>();
      for (const op of fresh) {
        if (op.target !== 'node') continue;
        if (op.op === 'add' || (op.op === 'set' && op.path.startsWith('ports'))) {
          portNodes.add(op.id);
        }
      }
      if (portNodes.size > 0) this.canonicalizePortOrder(portNodes);
    });

    return fresh;
  }

  /**
   * UNDO MY LAST EDIT — not the last edit.
   *
   * The per-actor property is structural: capture only ever sees LOCAL mutations (remote
   * ops are applied with capture suppressed), so nothing another peer did can be on this
   * stack to begin with. See undo.ts for what happens when my edit has already been
   * superseded by someone else's — the short version is that it does nothing, on purpose.
   */
  undo(): Op[] {
    const ops = this.undoStack.undo();
    this.capture.silently(() => this.integrity.reconcile());
    return ops;
  }

  redo(): Op[] {
    const ops = this.undoStack.redo();
    this.capture.silently(() => this.integrity.reconcile());
    return ops;
  }

  /**
   * Group everything `fn` does into ONE undo step.
   *
   * Deleting a node with three links is four ops and, without this, four presses of Ctrl-Z.
   * Grouping is a LOCAL concern — it changes what one keypress takes back, never what goes
   * on the wire — so two peers may group differently and still converge.
   */
  transact<T>(fn: () => T): T {
    const result = this.undoStack.transact(fn);
    this.capture.silently(() => this.integrity.reconcile());
    return result;
  }

  /** Everything we know, in total order — the catch-up payload for a joining peer. */
  history(): readonly Op[] {
    return this.log.toArray();
  }

  /**
   * Card 1: adopt a persisted op-log tail whose EFFECTS ARE ALREADY IN THE MODEL.
   *
   * This is `receive()`'s quiet twin, and the difference is the whole point. `receive()` is
   * for ops the model has not seen: it applies them. `adopt()` is for reopening a saved
   * document, where the snapshot ALREADY CONTAINS everything the ops did — so it seeds the
   * log (so a duplicate re-delivery is recognised), the LWW stamps (so a straggling older
   * write is still refused after a reload) and the repair index, and applies NOTHING.
   *
   * Re-applying them would be harmless for content — the reducer's redundant-write guard
   * would drop every one — but it would bump every version counter and fire a full repaint
   * for a document that has not changed. Worse, it would make opening a file look like an
   * edit to anyone watching the model's change events.
   */
  adopt(ops: readonly Op[]): void {
    for (const op of [...ops].sort(compareOps)) {
      this.log.append(op);
      this.lww.admit(op);
      this.note(op);
      this.integrity.note(op);
    }
  }

  dispose(): void {
    this.capture.stop();
  }

  // -------------------------------------------------------------------------

  /** Track the newest `set` the log holds per entity. See repair(). */
  private note(op: Op): void {
    if (op.op !== 'set' || op.target === 'diagram') return;
    const key = `${op.target}\0${op.id}`;
    const seen = this.newestSet.get(key) ?? -1;
    if (op.clock > seen) this.newestSet.set(key, op.clock);
  }

  /** A local edit: gate it, log it, remember it for undo, broadcast it. */
  private onLocalOp(op: Op, before: OpBefore): void {
    this.note(op);
    // A LOCAL op goes through the same gate as a remote one. It always wins (its clock is
    // fresh, so it is newer than anything it could be racing), but claiming the register
    // here is what lets a LATE remote write with an older stamp be refused afterwards. Skip
    // this and a straggler from a peer would silently overwrite an edit the user just made.
    this.lww.admit(op);
    this.log.append(op);
    this.integrity.note(op);
    this.undoStack.record(op, before);
    this.options.onLocalOp?.(op);

    // A LOCAL structural edit breaks the invariant just as easily as a remote one:
    // DiagramModel.removeNode() does not touch the node's links, and neither does
    // RemoveNodeCommand. Reconcile here and a solo user cannot strand a link either.
    //
    // NOT for property writes: those cannot orphan anything, and reconciling on every one
    // would put an O(links) sweep inside the drag loop.
    // INCREMENTAL, not a full sweep: settle() pays only for what this op could have broken.
    // A sweep here is O(links), and a bulk load is n ops long — 2,000 nodes took 8.5 SECONDS
    // through a Replica before this, and no perf gate in the repo drives one.
    this.capture.silently(() => this.integrity.settle(op));
  }

  /**
   * Apply an undo's inverse through the model, with capture LIVE — so the op that reaches
   * the log and the wire is minted by the ordinary local-edit path, with a fresh clock.
   *
   * The one thing the undo stack cannot know: the link it is about to act on may be in
   * QUARANTINE, i.e. not in the document at all. `removeLink()` on a link that is not there
   * mutates nothing, so capture mints nothing, so the link's presence register still says
   * "present" — and resurrecting its node would bring back a link the user explicitly took
   * back. Putting it in the document first makes the removal real. reconcile() re-quarantines
   * it afterwards if it is still orphaned.
   */
  private applyLocalInverse(op: Op): void {
    if (op.target === 'link' && this.integrity.isHeld(op.id)) {
      this.capture.silently(() => this.integrity.release(op.id));
    }
    applyOp(this.diagram, op);
  }

  /** A remote op: buffer it, gate it, apply it, repair what it displaced. */
  private applyRemote(op: Op): void {
    // A write to a link that integrity is HOLDING goes to the held instance, not to the
    // document it is not in. (There used to be a second job here — buffering writes that
    // outran their own entity — and repair() below turned out to subsume it entirely. The
    // buffer was deleted rather than left in to be admired.)
    if (this.integrity.divert(op)) return;

    // THE CONVERGENCE GATE. An op that is SUPERSEDED — a newer write already owns its
    // register — is refused outright, not applied and then corrected. Without this, two
    // peers that saw the same ops in different orders end up with different diagrams and
    // nothing anywhere reports an error. The fuzz finds it in seconds; a human would find
    // it in production.
    if (!this.lww.admit(op)) return;

    applyOp(this.diagram, op);
    this.integrity.note(op);
    this.integrity.forget(op); // a removed link is not coming back from quarantine

    if (op.op === 'add') this.repair(op);

    // A LEGACY whole-collection `ports` write (pre-wave14 logs, or an old peer still in
    // the room) rebuilds the ENTIRE collection — clobbering any port whose per-port
    // register holds a write NEWER than the collection op. Those writes are not
    // superseded; they are the truth, and only the log still knows it. Same shape as
    // repair() for a late `add`, one level down. (The opposite direction — a per-port
    // write older than the newest whole-collection write — is refused at the gate; see
    // the ports-collection barrier in lww.ts.)
    if (op.op === 'set' && op.target === 'node' && op.path === 'ports') {
      this.repairPorts(op);
    }
  }

  /**
   * REBUILD AN ENTITY'S REGISTERS FROM THE LOG.
   *
   * An entity's state is not "whatever we applied in the order it arrived". It is:
   *
   *     the data of the newest `add` (its current INCARNATION)
   *       + every `set` on it that is NEWER than that add
   *
   * Applied in total order that is the same on every peer, whatever the network did — which
   * is the entire claim being made. Applying ops AS THEY ARRIVE computes it correctly only if
   * nothing was lost on the way, and an `add` that lands LATE loses things:
   *
   *     Bob holds node C and has been editing it: ports@14, size@15, position@16.
   *     Alice, elsewhere, deleted C and pressed Ctrl-Z — remove@10, then add@11 carrying her
   *     snapshot of it.
   *     Those two reach Bob together, LONG after his own edits.
   *
   * Sorted, Bob applies remove@10 (C goes) then add@11 (C returns, as Alice's snapshot). His
   * own writes at 14, 15, 16 are NEWER than the incarnation — they are not superseded, they
   * are the truth — but they were applied to a C that no longer exists, and their registers
   * are already CLAIMED, so re-delivering them changes nothing. Bob is left holding a C that
   * exists nowhere else in the system, with a log identical to Alice's, and nothing anywhere
   * reports a problem.
   *
   * So after an `add`, the entity is REBUILT: its data, plus every write in the log that is
   * newer than it, in total order. Both peers then compute the same thing from the same log,
   * which is what "converges" was supposed to mean all along.
   *
   * (My first attempt at this only repaired when the add REPLACED a live entity. The fuzz
   * kept failing: in the trace above the remove is applied first, so by the time the add
   * lands there is nothing to replace, and the condition never fired. The question is not
   * "did I overwrite something" — it is "does the log contain writes newer than this
   * incarnation".)
   *
   * Bounded, not blanket: `newestSet` answers that in O(1), so an `add` for something
   * genuinely new — every add, essentially always — costs one map lookup.
   */
  private repair(add: Extract<Op, { op: 'add' }>): void {
    // Nothing in the log writes this entity later than the incarnation that just landed, so
    // there is nothing it could have clobbered. This is the case essentially every time.
    if ((this.newestSet.get(`${add.target}\0${add.id}`) ?? -1) < add.clock) return;

    const entity = this.find(add.target, add.id);
    if (!entity) return;

    for (const o of this.log.toArray()) {
      // toArray() is in TOTAL ORDER, so a superseded write is simply overwritten by the one
      // that beat it, and the last one standing is the register's rightful owner.
      if (o.op !== 'set' || o.id !== add.id || o.target !== add.target) continue;
      if (compareOps(o, add) <= 0) continue; // older than this incarnation: void, by the barrier
      applyEntitySet(entity, o.path, setValueOf(o));
    }
  }

  /**
   * Re-apply the per-port writes a LEGACY whole-collection `ports` op just clobbered.
   *
   * The whole-collection op asserts every port at its own stamp, but a per-port register
   * NEWER than it still owns its port. Applying the log's `ports.*` writes newer than the
   * collection op, in total order, restores exactly those — an add comes back, a newer
   * removal stays removed, a newer edit re-lands. Both delivery orders then compute the
   * same collection, which is what the mixed-history spec drives.
   */
  private repairPorts(whole: Extract<Op, { op: 'set' }>): void {
    const entity = this.find(whole.target, whole.id);
    if (!entity) return;

    for (const o of this.log.toArray()) {
      if (o.op !== 'set' || o.id !== whole.id || o.target !== whole.target) continue;
      if (!o.path.startsWith('ports.')) continue;
      if (compareOps(o, whole) <= 0) continue; // superseded by the collection write: void
      applyEntitySet(entity, o.path, setValueOf(o));
    }
  }

  /**
   * CANONICAL PORT ORDER — integrity.order()'s argument, one level down.
   *
   * serialize() writes a node's ports in Map insertion order, and order is part of the
   * document (the byte oracle sees it; multi-port sides render by it). With per-port
   * registers, insertion order is a function of ARRIVAL order: two peers that applied
   * concurrent port adds in a different order hold the same ports in a different
   * sequence — same content, byte-different files. So the order is DERIVED from the
   * converged log instead: a port ranks by the stamp of the write that ESTABLISHED its
   * current incarnation (the first surviving value-write after the last clear), which is
   * identical on every peer. Ports that predate the log (the node's add op, a snapshot)
   * have no rank and keep their existing relative order, first — the stable-sort trick
   * integrity uses for the same problem.
   *
   * In the ordinary case — adds with ever-increasing clocks — this reproduces insertion
   * order exactly and rewrites nothing.
   */
  private canonicalizePortOrder(nodeIds: Iterable<string>): void {
    for (const nodeId of nodeIds) {
      const node = this.diagram.getNode(nodeId);
      if (!node || node.ports.size < 2) continue;

      // Birth stamps, derived by SIMULATING MEMBERSHIP through the log in total order.
      // A value-write is a port's birth only if the port was NOT already present — an
      // UPDATE must never re-rank a port (the author edited it in place; a receiver that
      // moved it would save a byte-different file). Membership starts from the node's
      // ports at the moment the log began (basePorts / the add op's data), and each
      // `add` op resets it: a new incarnation starts a new membership world, exactly as
      // the presence barrier voids the old one's writes.
      const birth = new Map<string, Stamp>();
      let existing = new Set(this.basePorts.get(nodeId) ?? []);
      for (const o of this.log.toArray()) {
        if (o.target !== 'node' || o.id !== nodeId) continue;
        if (o.op === 'add') {
          const ports = (o.data as { ports?: Array<{ id?: string }> }).ports ?? [];
          existing = new Set(ports.map((p) => p?.id).filter((x): x is string => !!x));
          birth.clear();
          continue;
        }
        if (o.op !== 'set') continue;
        if (o.path === 'ports') {
          // legacy whole-collection: every port it lists exists as of this stamp; every
          // port it does not is gone
          if (!Array.isArray(o.value)) continue;
          const listed = new Set(
            (o.value as Array<{ id?: string }>).map((p) => p?.id).filter((x): x is string => !!x)
          );
          for (const pid of [...existing]) {
            if (!listed.has(pid)) {
              existing.delete(pid);
              birth.delete(pid);
            }
          }
          for (const pid of listed) {
            if (!existing.has(pid)) {
              existing.add(pid);
              birth.set(pid, { clock: o.clock, actor: o.actor });
            }
          }
        } else if (o.path.startsWith('ports.')) {
          const pid = o.path.slice('ports.'.length);
          if (setValueOf(o) === undefined) {
            existing.delete(pid);
            birth.delete(pid);
          } else if (!existing.has(pid)) {
            existing.add(pid);
            birth.set(pid, { clock: o.clock, actor: o.actor });
          }
        }
      }

      const cmp = (a: Stamp | undefined, b: Stamp | undefined): number => {
        if (!a && !b) return 0; // both predate the log — stable sort keeps them put
        if (!a) return -1;
        if (!b) return 1;
        if (a.clock !== b.clock) return a.clock - b.clock;
        return a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0;
      };

      const entries = [...node.ports.entries()];
      entries.sort((a, b) => cmp(birth.get(a[0]), birth.get(b[0])));

      let inPlace = true;
      let i = 0;
      for (const key of node.ports.keys()) {
        if (entries[i++][0] !== key) {
          inPlace = false;
          break;
        }
      }
      if (inPlace) continue;

      node.ports.clear();
      for (const [k, v] of entries) node.ports.set(k, v);
    }
  }

  /** An entity of the document, or one integrity is holding aside. */
  private find(
    target: Op['target'],
    id: string
  ): NodeModel | LinkModel | GroupModel | StrokeModel | undefined {
    if (target === 'link') return this.diagram.getLink(id) ?? this.integrity.held(id);
    if (target === 'node') return this.diagram.getNode(id);
    if (target === 'group') return this.diagram.getGroup(id);
    if (target === 'stroke') return this.diagram.getStroke(id);
    return undefined;
  }
}
