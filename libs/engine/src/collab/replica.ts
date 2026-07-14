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
import { applyOp } from './apply-op';
import { OpCapture, type OpBefore } from './capture';
import { ReferentialIntegrity } from './integrity';
import { LwwRegistry } from './lww';
import { OpLog } from './op-log';
import { UndoStack } from './undo';
import { compareOps, type ActorId, type Op } from './op';

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

  constructor(
    readonly diagram: DiagramModel,
    private readonly options: ReplicaOptions
  ) {
    this.lww = new LwwRegistry();
    this.integrity = new ReferentialIntegrity(diagram, this.lww);
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

  dispose(): void {
    this.capture.stop();
  }

  // -------------------------------------------------------------------------

  /** A local edit: gate it, log it, remember it for undo, broadcast it. */
  private onLocalOp(op: Op, before: OpBefore): void {
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
    if (op.op === 'add' || op.op === 'remove') {
      this.capture.silently(() => this.integrity.reconcile());
    }
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

  /** A remote op: buffer it, gate it, apply it. */
  private applyRemote(op: Op): void {
    // BEFORE the gate. A write that has to wait for its entity has not been applied, so it
    // must not claim its register yet — claiming it would refuse the very re-delivery, and
    // the very flush, that are supposed to repair it.
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
    this.integrity.flush(op); // …and an arrived entity takes delivery of its held writes
  }
}
