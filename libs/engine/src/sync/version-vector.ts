// Wave 9 — Card 5: WHAT DOES THIS PEER ALREADY HAVE?
//
// Every reconnect, every join and every anti-entropy round asks that one question, and
// answering it wrong is how a collaboration engine silently diverges. This file is the
// answer, and it took three attempts to get right. Both wrong ones are written down,
// because both look correct and one of them is already in the codebase.
//
// ---------------------------------------------------------------------------
// WRONG ANSWER #1 — THE SCALAR WATERMARK. (`OpLog.since(clock)`, which exists TODAY.)
// ---------------------------------------------------------------------------
//
// "Ask for everything with a clock greater than mine." It is the obvious thing, the log
// already has the method, and it is BROKEN — because a Lamport clock is not a timeline.
// Two peers hold the same clock value at the same time all the time; that is what
// "concurrent" MEANS.
//
//     Alice and Bob are both at clock 10 (they have seen each other's work).
//     The network drops.
//     Alice edits → her op is clock 11.   Bob edits → his op is ALSO clock 11.
//     They reconnect. Alice asks Bob: "everything after 11, please."
//     Bob's op IS 11. `o.clock > 11` is false. Bob sends NOTHING.
//     Alice never learns Bob's edit. Forever. No error anywhere.
//
// One dropped connection and two users are permanently editing different documents.
// `version-vector.spec.ts` reproduces exactly this, against the real `since()`, and it
// is the reason this file exists.
//
// ---------------------------------------------------------------------------
// WRONG ANSWER #2 — THE PLAIN VERSION VECTOR. (per-actor max clock)
// ---------------------------------------------------------------------------
//
// "Per actor, remember the highest clock I have seen from them; send me anything above
// it." This is what Yjs and Automerge do, and for THEM it is exactly right — because
// their per-actor counters are CONTIGUOUS (1,2,3,…), so "I have up to 7 from Bob" really
// does mean "I have 1..7 from Bob".
//
// A Lamport clock is NOT contiguous. It leaps whenever its owner observes a peer:
// Bob's own ops might be clocked 3, 5, 12, 13, 40. So "my max from Bob is 40" says
// nothing at all about whether I have Bob's op at 12. Reorder or drop one op in the
// middle and the max keeps rising right over the hole:
//
//     I hold Bob@3 and Bob@40. Bob@12 was dropped in transit.
//     My vector says max[Bob] = 40. I ask for "> 40". I get nothing.
//     Bob@12 is gone forever, and my vector cheerfully reports that I am fully caught up.
//
// That hole is not hypothetical — the hostile-transport fuzz drills it in the first
// dozen trials.
//
// ---------------------------------------------------------------------------
// THE ANSWER: A DIGESTED FRONTIER
// ---------------------------------------------------------------------------
//
// Per actor we keep three numbers instead of one:
//
//     max    — highest clock seen from that actor   (the cheap "send me the tail" filter)
//     count  — HOW MANY ops we hold from that actor (detects a hole below the max)
//     hash   — an order-independent fold of their clocks (detects a hole that `count`
//              cannot see: I have Bob@{3,40}, you have Bob@{12,40} — same count, same
//              max, DIFFERENT SETS)
//
// The responder compares its own three numbers, restricted to `clock <= remote.max`,
// against the requester's. If they agree, the requester's frontier is TRUSTWORTHY and we
// send only the tail above `max` — the cheap path, and the only path a healthy FIFO
// transport ever takes. If they disagree there is a hole, and we send EVERY op we have
// from that actor. The requester's log de-duplicates, so over-sending costs bandwidth and
// nothing else, while under-sending costs the document.
//
// Cost: O(number of actors) on the wire, always. The expensive repair fires only when the
// network actually lost something in the middle, which is precisely when you want to pay
// for it.
//
// (Why not a Merkle tree, which is what a database would do? Because the whole delta here
// is "the ops from one actor", the actor count is a handful, and a tree would be a
// hundred lines of machinery to save a payload nobody has ever measured. When the log is
// big enough for that to hurt, the right move is a compacted snapshot, not a fancier
// digest — and that is a different card.)

import type { ActorId, Op } from '../collab/op';
import { compareOps } from '../collab/op';

/** What one peer holds from one actor. Three numbers; see the header for why not one. */
export interface ActorFrontier {
  /** Highest clock seen from this actor. */
  max: number;
  /** How many of this actor's ops we hold. A hole below `max` shows up here. */
  count: number;
  /** Order-independent fold of the clocks held. Catches a hole `count` cannot see. */
  hash: number;
}

export type VersionVectorJSON = Record<ActorId, ActorFrontier>;

/**
 * Mix one clock into a 32-bit avalanche.
 *
 * XOR-folding raw clocks would be a disaster — {3,40} and {40,3} are the same set (fine)
 * but {1,2} and {3,0} would collide (not fine). A real avalanche makes an accidental
 * collision a ~2^-32 event, and a collision merely means we take the CHEAP path when we
 * should have repaired — which the next anti-entropy round, with a different set, catches
 * anyway. Failure is delayed, never permanent.
 */
function mix32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

const EMPTY: ActorFrontier = { max: 0, count: 0, hash: 0 };

/**
 * A peer's exact position in the shared history, per actor.
 *
 * Fed ONLY with ops the log genuinely accepted (`Replica.receive()` returns exactly
 * those). Feed it a duplicate and `count` over-counts, which fakes a hole and triggers a
 * pointless repair — wasteful, not wrong, but the discipline is worth keeping.
 */
export class VersionVector {
  private readonly actors = new Map<ActorId, ActorFrontier>();

  /** Record ONE op we now hold. Must be genuinely new — see the class doc. */
  observe(op: Op): void {
    const f = this.actors.get(op.actor);
    if (!f) {
      this.actors.set(op.actor, {
        max: op.clock,
        count: 1,
        hash: mix32(op.clock),
      });
      return;
    }
    if (op.clock > f.max) f.max = op.clock;
    f.count++;
    // XOR, so the fold is order-independent: two peers that received the same ops in
    // different orders must produce the SAME digest, or every sync round would "repair"
    // a hole that is not there.
    f.hash = (f.hash ^ mix32(op.clock)) >>> 0;
  }

  observeAll(ops: Iterable<Op>): void {
    for (const op of ops) this.observe(op);
  }

  frontier(actor: ActorId): ActorFrontier {
    return this.actors.get(actor) ?? EMPTY;
  }

  get actorCount(): number {
    return this.actors.size;
  }

  toJSON(): VersionVectorJSON {
    const out: VersionVectorJSON = {};
    for (const [actor, f] of this.actors) out[actor] = { ...f };
    return out;
  }

  /** Rebuild from a log — used on resume-from-disk, and by the tests as an oracle. */
  static fromOps(ops: Iterable<Op>): VersionVector {
    const vv = new VersionVector();
    vv.observeAll(ops);
    return vv;
  }
}

/**
 * THE CATCH-UP DELTA: which of `ours` does a peer with frontier `remote` not have?
 *
 * Two tiers, and the tier is chosen PER ACTOR:
 *
 *   FAST  — our digest of that actor's ops at-or-below the peer's `max` matches theirs.
 *           Their frontier is honest; send only the tail above `max`.
 *   REPAIR— it does not match. There is a hole somewhere below their max and neither of
 *           us can say where. Send everything we have from that actor and let their log
 *           de-duplicate. Over-sending is free. Under-sending loses the document.
 *
 * Returns ops in TOTAL ORDER — so a receiver that applies them in array order applies an
 * `add` before the `set`s that depend on it, and the causal buffer has nothing to do.
 */
export function deltaFor(
  ours: readonly Op[],
  remote: VersionVectorJSON
): { ops: Op[]; repairedActors: ActorId[] } {
  // Group our log by actor once — the alternative is a full scan per actor.
  const byActor = new Map<ActorId, Op[]>();
  for (const op of ours) {
    const list = byActor.get(op.actor);
    if (list) list.push(op);
    else byActor.set(op.actor, [op]);
  }

  const out: Op[] = [];
  const repairedActors: ActorId[] = [];

  for (const [actor, ops] of byActor) {
    const rf = remote[actor] ?? EMPTY;

    // Our own digest of this actor's history, RESTRICTED to what the peer claims to
    // have covered (clock <= their max). Anything above their max is the tail and is
    // not evidence of anything.
    let count = 0;
    let hash = 0;
    for (const op of ops) {
      if (op.clock <= rf.max) {
        count++;
        hash = (hash ^ mix32(op.clock)) >>> 0;
      }
    }

    // ANY disagreement below their frontier means "we do not hold the same ops down
    // there", and that is enough — we must not try to be clever about WHO is missing
    // WHAT.
    //
    // The tempting shortcut is `count > rf.count` — "they're behind me, repair; they're
    // ahead of me, not my problem". It is WRONG, and subtly. I hold Bob@{5}; they hold
    // Bob@{3,40}. Their count is bigger, so the shortcut concludes they are ahead and
    // sends nothing — but they are missing Bob@5, which only I have. Both peers reason
    // that way, both send nothing, and the two edits never meet.
    //
    // Count OR hash disagreeing ⇒ repair. When they are genuinely ahead of us we resend a
    // subset they already have; their log drops it on the floor. Over-sending is free.
    const holed = count !== rf.count || hash !== rf.hash;

    if (holed) {
      repairedActors.push(actor);
      out.push(...ops);
      continue;
    }

    for (const op of ops) if (op.clock > rf.max) out.push(op);
  }

  out.sort(compareOps);
  return { ops: out, repairedActors };
}
