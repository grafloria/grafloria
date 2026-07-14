// Wave 9 — Card 0: the last-writer-wins register table.
//
// ---------------------------------------------------------------------------
// THIS FILE EXISTS BECAUSE A FUZZ TEST DEMOLISHED MY OWN CLAIM
// ---------------------------------------------------------------------------
//
// op-log.ts originally asserted, in a confident block comment, that a total order plus a
// deterministic reducer ALREADY gives convergence, and that a CRDT was a later card's
// problem. That is TRUE — and only true — if every peer REPLAYS THE ENTIRE LOG IN ORDER
// on every change. No live system does that; it is O(history) per keystroke. A live peer
// applies each op AS IT ARRIVES, and arrival order is not total order.
//
// The 200-trial randomised fuzz found the counterexample in seconds:
//
//     Alice sets position=(100,200)   |  Bob sets position=(300,400)      [concurrent]
//     Alice applies hers, then Bob's  →  (300,400)
//     Bob applies his, then Alice's   →  (100,200)
//                                        ^^^^^^^^^ DIVERGED
//
// Both peers saw the same two ops. Both applied both. They disagree. And nothing anywhere
// reports an error — the two users simply see different diagrams forever, which is the
// precise failure mode a collaboration engine exists to prevent.
//
// The fix is the one every CRDT text starts with, and it is small: each REGISTER (an
// entity's property path) remembers the stamp of the write that last won it. An arriving
// op that is OLDER than the register's current stamp is REFUSED — not applied and then
// overwritten, but never applied at all. Incremental application then produces exactly
// the state a full in-order replay would, which is what makes "apply as they arrive"
// safe.
//
// A stamp is (clock, actor) — the same total order the log sorts by. So "older" means the
// same thing everywhere, on every peer, which is the entire trick.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES AND DOES NOT SETTLE
// ---------------------------------------------------------------------------
// SETTLED: concurrent writes to the same property (LWW), concurrent writes to different
// properties of the same entity (no conflict — different registers, both survive), and
// add/remove races (presence is itself a register).
//
// ---------------------------------------------------------------------------
// CARD 4 SETTLED THE OPEN QUESTION: PRESENCE STAYS LWW.
// ---------------------------------------------------------------------------
// Card 0 asked whether an observed-remove set should replace LWW presence, and named the
// scenario: delete a node while a colleague attaches a link to it. Working that scenario
// through shows the framing is wrong. `remove node N` and `add link L` write DIFFERENT
// REGISTERS — they do not race at all. Both apply, on every peer, under LWW and under an
// OR-set alike, and the link is left dangling either way. AN OR-SET DOES NOT FIX IT.
//
// The real defect is a REFERENTIAL INTEGRITY violation ACROSS registers, which no
// per-register presence policy can address. So LWW presence stays — it is convergent, it
// is simple, and it is not the bug — and integrity.ts fixes the actual problem, as a
// DERIVED rule (a link is live iff its endpoints resolve) that needs no op of its own.
// The full user-facing argument is in the header of integrity.spec.ts.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE ADDED IN CARD 4: THE PRESENCE BARRIER
// ---------------------------------------------------------------------------
// A property write is refused if it is OLDER THAN THE ENTITY'S CURRENT PRESENCE STAMP.
//
// This is not tidiness; without it, resurrection diverges, and the fuzz proves it. A node
// is deleted and later brought back (an undo of the delete is exactly an `add` with a
// fresh clock). A peer that saw a colleague's property write BEFORE the delete dropped it
// (the entity was gone). A peer that receives that same write AFTER the resurrection — a
// partitioned peer, a re-delivery, a mesh relay — finds the entity present again and
// APPLIES it. Two peers, same ops, different documents, forever, and nothing reports an
// error.
//
// The barrier states the rule that was always implied: a write that predates the entity's
// current incarnation is not a write to THIS entity. The resurrected node comes back
// exactly as it was when it was deleted, on every peer, whatever the network did.

import type { ActorId, Op } from './op';

/** The stamp of the write that currently owns a register. */
export interface Stamp {
  clock: number;
  actor: ActorId;
}

/** Total order on stamps — identical to compareOps, and it must stay that way. */
function newer(a: Stamp, b: Stamp): boolean {
  if (a.clock !== b.clock) return a.clock > b.clock;
  return a.actor > b.actor;
}

/**
 * Which write currently owns each register.
 *
 * The key is (target, id, path) for a property, and (target, id, presence) for whether
 * the entity exists at all — because an add/remove race is the same kind of race as a
 * concurrent property write, and deserves the same machinery rather than a special case.
 */
export class LwwRegistry {
  private readonly stamps = new Map<string, Stamp>();

  /**
   * THE ONE PLACE A REGISTER KEY IS BUILT. Nothing else may construct one.
   *
   * The separator is NUL — it cannot occur in a property path, so a property register can
   * never collide with the presence slot of its own entity. It also RENDERS AS A SPACE in
   * every editor, terminal and diff, which is how all three of Card 4's new call sites came
   * to be written with a literal ' ' and to key a map that did not exist. The presence
   * barrier, the never-seen-yet check and the canonical entity order were ALL dead on
   * arrival; every unit test passed; and the fuzz found it in one trial. Hence: one builder,
   * no string literals, and a separator that is stated rather than typed.
   */
  private static readonly SEP = '\0';

  private static presenceKey(target: Op['target'], id: string): string {
    const s = LwwRegistry.SEP;
    return `${target}${s}${id}${s}${s}presence`;
  }

  private static key(op: Op): string {
    const s = LwwRegistry.SEP;
    return op.op === 'set'
      ? `${op.target}${s}${op.id}${s}${op.path}`
      : LwwRegistry.presenceKey(op.target, op.id);
  }

  /**
   * Should this op be applied?
   *
   * False when a NEWER write already owns the register — the op is not late, it is
   * SUPERSEDED, and applying it would move the register backwards. This is the single
   * check that makes arrival-order application equal to total-order replay.
   *
   * Records the stamp as a side effect when the answer is yes: an op that wins now owns
   * its register.
   */
  admit(op: Op): boolean {
    const key = LwwRegistry.key(op);
    const incoming: Stamp = { clock: op.clock, actor: op.actor };

    // THE PRESENCE BARRIER (Card 4). A property write that predates the entity's CURRENT
    // INCARNATION is not a write to this entity — it belongs to a version of it that was
    // deleted. Refuse it, permanently, and identically on every peer, whether or not this
    // particular peer happened to be holding the entity when the write first went past.
    //
    // Without this, RESURRECTION DIVERGES, and the fuzz finds it in a handful of trials.
    // A node is deleted and later brought back (an undo of a delete is exactly an `add`
    // with a fresh clock). A peer that saw a colleague's property write BEFORE the delete
    // dropped it — the entity was gone. A peer that receives that same write AFTER the
    // resurrection (a partitioned peer, a re-delivery, a mesh relay) finds the entity
    // present again and APPLIES it. Same ops, two documents, forever, no error anywhere.
    //
    // The barrier states the rule that was always implied: a resurrected node comes back
    // exactly as it was when it was deleted, on every peer, whatever the network did.
    if (op.op === 'set' && op.target !== 'diagram') {
      const presence = this.stamps.get(LwwRegistry.presenceKey(op.target, op.id));
      if (presence && newer(presence, incoming)) return false;
    }

    const current = this.stamps.get(key);
    if (current && !newer(incoming, current)) return false;

    this.stamps.set(key, incoming);
    return true;
  }

  /** Who currently owns a register — for debugging, and for a UI that shows attribution. */
  owner(op: Op): Stamp | undefined {
    return this.stamps.get(LwwRegistry.key(op));
  }

  /** The stamp that decided whether an entity exists. Undefined if never seen. */
  presenceOf(target: Op['target'], id: string): Stamp | undefined {
    if (target === 'diagram') return undefined;
    return this.stamps.get(LwwRegistry.presenceKey(target, id));
  }

  get size(): number {
    return this.stamps.size;
  }
}
