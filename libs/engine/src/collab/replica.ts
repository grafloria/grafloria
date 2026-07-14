// Wave 9 — Card 0: a Replica — one peer's view of a shared diagram.
//
// This is the object the rest of the wave actually programs against. It binds the three
// pieces that are useless alone:
//
//     the DIAGRAM   — the live model the user edits
//     the LOG       — every op this peer knows about, in total order, de-duplicated
//     the CAPTURE   — local edits → ops (and the re-entrancy guard that stops echoes)
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
import { OpCapture } from './capture';
import { LwwRegistry } from './lww';
import { OpLog } from './op-log';
import type { ActorId, Op } from './op';

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
  private readonly lww = new LwwRegistry();

  private readonly capture: OpCapture;

  constructor(
    readonly diagram: DiagramModel,
    private readonly options: ReplicaOptions
  ) {
    this.capture = new OpCapture(diagram, {
      actor: options.actor,
      startClock: options.startClock,
      onOp: (op) => {
        // A LOCAL op goes through the same gate as a remote one. It always wins (its
        // clock is fresh, so it is newer than anything it could be racing), but claiming
        // the register here is what lets a LATE remote write with an older stamp be
        // refused afterwards. Skip this and a straggler from a peer would silently
        // overwrite an edit the user made after it.
        this.lww.admit(op);
        this.log.append(op);
        this.options.onLocalOp?.(op);
      },
    });
  }

  get actor(): ActorId {
    return this.options.actor;
  }

  /** The clock to resume from, and the watermark a peer asks us to catch up past. */
  get clock(): number {
    return this.capture.lamport.peek();
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

    // Suppressed capture: applying these must not re-emit them as OUR edits, or two
    // peers relay the same op back and forth forever.
    this.capture.applyRemote(fresh, (op) => {
      // THE CONVERGENCE GATE. An op that is SUPERSEDED — a newer write already owns its
      // register — is refused outright, not applied and then corrected. Without this,
      // two peers that saw the same ops in different orders end up with different
      // diagrams and nothing anywhere reports an error. The fuzz test finds it in
      // seconds; a human would find it in production.
      if (!this.lww.admit(op)) return;
      applyOp(this.diagram, op);
    });
    return fresh;
  }

  /** Everything we know, in total order — the catch-up payload for a joining peer. */
  history(): readonly Op[] {
    return this.log.toArray();
  }

  dispose(): void {
    this.capture.stop();
  }
}
