// Wave 9 — Card 0: the log itself, and deterministic replay.
//
// ---------------------------------------------------------------------------
// CONVERGENCE, AND WHAT THIS FILE DOES *NOT* CLAIM
// ---------------------------------------------------------------------------
//
// Card 0 is the substrate: a totally-ordered, replayable log. The merge SEMANTICS
// (Card 4) build on it. It is worth being exact about what is already guaranteed here,
// because "we have an op log" is the kind of sentence that quietly gets read as "we
// have collaboration", and the gap between those is where the silent data loss lives.
//
// WHAT IS GUARANTEED HERE:
//   • A TOTAL ORDER on ops — (lamport clock, actor id) — identical on every peer.
//   • DETERMINISTIC REPLAY: same start state + same ordered log ⇒ byte-identical
//     diagram, on any peer, any number of times.
//   • IDEMPOTENCE: the same op delivered twice is applied once (opId dedupe), because
//     any real transport will duplicate.
//
// WHAT THAT ALREADY BUYS YOU, WITHOUT ANY CRDT MACHINERY: because every peer sorts the
// same ops into the same sequence and the reducer is deterministic, two peers that have
// seen the SAME SET of ops hold the SAME diagram — regardless of the order those ops
// ARRIVED in. That is convergence for the property-register case, and it falls out of
// the total order rather than being bolted on.
//
// The reason it works is the design decision in op.ts: ops are PER-PROPERTY. `set(n1,
// position)` and `set(n1, metadata.label)` are different registers, so a concurrent
// move and rename BOTH survive. The engine's existing DiagramIncremental could never do
// this — it reports `modified: [<the whole node>]`, so whole-entity last-writer-wins
// silently throws one of the two edits away.
//
// WHAT IS *NOT* SETTLED HERE, and belongs to Card 4:
//   • ADD/REMOVE RACES. Right now presence is decided by the last op on that id in the
//     total order, which makes it last-writer-wins: a `remove` that sorts after an `add`
//     wins, and vice versa. That is convergent (every peer agrees) but it is not
//     necessarily what a USER wants — the literature prefers an observed-remove set,
//     where a remove only cancels the adds it actually SAW, so a concurrent add
//     survives a delete it never knew about. Choosing between "remove wins" and
//     "add wins" is a product decision with real consequences (delete a node while a
//     colleague is attaching a link to it — what should happen to the link?), and it is
//     Card 4's to make. It is called out here rather than left as an accident.
//   • CAUSAL READINESS. An op for an entity that has not arrived yet is currently
//     DROPPED (applyOp returns false). Under a reliable, ordered transport that cannot
//     happen; under an unreliable one it can, and the op must be BUFFERED until its
//     dependency lands. Also Card 4/5.
//
// Saying this out loud costs nothing and prevents the next person from believing the
// log is a merge engine.

import { DiagramModel } from '../models/DiagramModel';
import { applyOp } from './apply-op';
import { ReferentialIntegrity } from './integrity';
import { LwwRegistry } from './lww';
import { compareOps, opId, type Op } from './op';

/**
 * An append-only, totally-ordered, de-duplicating op log.
 *
 * Kept SORTED rather than merely appended, because "the order ops arrived in" is a
 * property of the network and "the order ops apply in" must not be.
 */
export class OpLog {
  private readonly ops: Op[] = [];
  private readonly seen = new Set<string>();

  /**
   * Add an op. Returns false if it was already present.
   *
   * Idempotence is not a nicety here: every real transport redelivers (a WebSocket
   * reconnect replays, a peer re-sends on timeout, two peers relay the same op to each
   * other). An op log that applied a duplicate `add` twice, or double-counted a move,
   * would diverge on nothing more exotic than a flaky wifi connection.
   */
  append(op: Op): boolean {
    const id = opId(op);
    if (this.seen.has(id)) return false;
    this.seen.add(id);

    // Insert in order. Ops usually arrive nearly-sorted (clocks advance), so a linear
    // scan from the end is O(1) amortised in the common case and correct in the worst.
    let i = this.ops.length;
    while (i > 0 && compareOps(this.ops[i - 1], op) > 0) i--;
    this.ops.splice(i, 0, op);
    return true;
  }

  appendAll(ops: Iterable<Op>): Op[] {
    const added: Op[] = [];
    for (const op of ops) if (this.append(op)) added.push(op);
    return added;
  }

  has(op: Op): boolean {
    return this.seen.has(opId(op));
  }

  /** The ops, in total order. */
  toArray(): readonly Op[] {
    return this.ops;
  }

  get size(): number {
    return this.ops.length;
  }

  /** Ops strictly after `clock` — the tail a peer needs to catch up. */
  since(clock: number): Op[] {
    return this.ops.filter((o) => o.clock > clock);
  }

  /** The highest clock in the log — what a peer should observe on catch-up. */
  maxClock(): number {
    let max = 0;
    for (const o of this.ops) if (o.clock > max) max = o.clock;
    return max;
  }
}

/**
 * Replay an ordered log into a diagram.
 *
 * Sorts defensively rather than trusting the caller: replay determinism is the property
 * every later card stands on, and it would be silly to lose it because someone handed us
 * an array in arrival order.
 *
 * Card 4: and it ENFORCES THE INVARIANT at the end, because a peer that joins by replaying
 * a log must arrive exactly where a peer that was in the room the whole time already is. If
 * integrity only ran in `Replica.receive()`, a log containing "delete a node that had links"
 * would replay into a document with a dangling link, and the newcomer would be the only one
 * holding it. One sweep, once, over the final state — the invariant is a function of that
 * state and of nothing on the way to it.
 *
 * NOTE this is the DOCUMENT, not a live peer: the quarantine it builds is discarded with the
 * temporary registry. A peer that intends to go on editing should be seeded through
 * `Replica.receive(history)`, which keeps it — and can therefore still bring an orphaned
 * link back if someone undoes the delete.
 */
export function replay(diagram: DiagramModel, ops: readonly Op[]): number {
  const lww = new LwwRegistry();
  const integrity = new ReferentialIntegrity(diagram, lww);

  let applied = 0;
  // A REMOTE OP IS NOT A LOCAL USER'S WRITE — it is the document already meaning something
  // new, mirrored from a peer — so the read-only lock (which exists to refuse THIS user's
  // intent) must not block it. Replaying a log into a LOCKED document is exactly how a
  // viewer who joins an already-read-only session catches up; honour the lock here and that
  // viewer receives an empty document and diverges forever. The bypass is scoped to this
  // apply loop only (runSystemWrite is a synchronous try/finally depth counter, and applyOp
  // is fully synchronous) — it never reaches a local edit. See models/readonly-lock.ts and
  // the two remote-apply call sites (here and Replica.receive), the entire allowlist.
  diagram.runSystemWrite(() => {
    for (const op of [...ops].sort(compareOps)) {
      // The gate's ANSWER is ignored — in TOTAL ORDER it can never refuse anything, because
      // every register is written oldest-first by construction. What we want is its
      // book-keeping: the presence stamps, which are what the canonical entity ORDER is
      // derived from. Without them reconcile() has nothing to sort by and a replayed document
      // would keep the arbitrary order its ops happened to build, while a live peer holds the
      // canonical one. replay() stays the dumb, honest primitive it is documented to be.
      lww.admit(op);
      if (applyOp(diagram, op)) applied++;
      integrity.note(op);
    }

    integrity.reconcile();
  });
  return applied;
}
