// Wave 9 — Card 5: CAUSAL READINESS.
//
// This file closes a hole that Card 0 wrote down and explicitly left open:
//
//     "CAUSAL READINESS. An op for an entity that has not arrived yet is currently
//      DROPPED (applyOp returns false). Under a reliable, ordered transport that cannot
//      happen; under an unreliable one it can, and the op must be BUFFERED until its
//      dependency lands. Also Card 4/5."                       — op-log.ts, Card 0
//
// It is Card 5's, and it is worse than "the op is dropped", because of where the drop
// happens. Follow one reordered packet through `Replica.receive()`:
//
//     set(node n7, position, {x:900})   arrives BEFORE   add(node n7)
//
//   1. `log.appendAll()` accepts the `set`. It is new. The log now REMEMBERS it.
//   2. The LWW gate admits it and STAMPS the register — n7.position now belongs to that
//      write, at that clock.
//   3. `applyOp` looks for node n7, does not find it, and returns false. Nothing happens.
//
// Now the `add` arrives and the node appears — at its ORIGINAL position, because the
// `set` that was supposed to move it evaporated in step 3. And it can never be recovered:
//
//   • the LOG has already seen it, so a re-delivery is de-duplicated to nothing;
//   • the LWW REGISTER already belongs to it, so even a re-send would now be REFUSED as
//     superseded — by itself.
//
// One reordered packet, permanent divergence, and every layer below behaves exactly as
// designed. That is what makes it nasty: there is no bug in the log, no bug in the gate,
// and no bug in the reducer. The bug is that nothing owns the ORDER.
//
// So this does. An op is held until the entity it talks about has been ADDED, and it
// never reaches the replica until then — no log entry, no stamp, no silent no-op.
//
// ---------------------------------------------------------------------------
// "SEEN", NOT "PRESENT" — and the difference is a hang
// ---------------------------------------------------------------------------
//
// The readiness test is "have we ever seen an `add` for this id", NOT "does this entity
// exist right now". They differ for a DELETED entity, and getting it wrong is a deadlock:
// a `set` on a node that a peer legitimately deleted would wait for an `add` that is
// never coming, sit in the buffer forever, and — because it never reaches the log — get
// re-requested by every anti-entropy round for the rest of the session. An op for a
// deleted entity is released immediately and applies as the harmless no-op it is.

import type { DiagramModel } from '../models/DiagramModel';
import { compareOps, opId, type Op } from '../collab/op';

export interface CausalBufferOptions {
  /**
   * Hard cap on held ops. A malicious or badly broken peer must not be able to make us
   * buffer without limit; past the cap we release the oldest held op anyway (it will
   * apply as a no-op and be logged, which is exactly what would have happened before this
   * file existed — degraded, but bounded, and counted so it is visible).
   */
  maxPending?: number;
}

/** Where an op sits: released to the replica, or waiting on a dependency. */
export interface CausalSplit {
  /** Ready NOW, in total order. Hand straight to `Replica.receive()`. */
  ready: Op[];
  /** Newly held this round (diagnostics). */
  held: number;
}

/**
 * Holds ops whose entity has not been added yet, and releases them the instant it is.
 *
 * Sits BETWEEN the transport and the Replica. Nothing it holds has touched the log, the
 * clock or the LWW registry — which is the whole point: an op the replica has never seen
 * is an op that can still be applied later.
 */
export class CausalBuffer {
  /** Entity ids we have ever seen an `add` for — including ones since deleted. */
  private readonly known = new Set<string>();

  /** Held ops, keyed by the entity id they are waiting on. */
  private readonly waiting = new Map<string, Op[]>();

  /** opIds already held — a duplicate delivery must not double the buffer. */
  private readonly heldIds = new Set<string>();

  private readonly maxPending: number;

  /** Ops force-released because the buffer was full. Should be 0. Watch it. */
  overflowed = 0;

  constructor(
    private readonly diagram: DiagramModel,
    options: CausalBufferOptions = {}
  ) {
    this.maxPending = options.maxPending ?? 10_000;

    // Anything already on the diagram when we start collaborating was, as far as this
    // peer is concerned, added. Without this, the very first `set` on a pre-existing node
    // would be held forever waiting for an `add` that happened before the session began.
    for (const n of diagram.getNodes()) this.known.add(n.id);
    for (const l of diagram.getLinks()) this.known.add(l.id);
    for (const g of diagram.getGroups()) this.known.add(g.id);
  }

  get pendingCount(): number {
    return this.heldIds.size;
  }

  /**
   * WE created an entity. Record it — the transport will never tell us about it.
   *
   * THE FUZZ FOUND THIS ONE, AND IT IS A PERMANENT HANG, NOT A HICCUP.
   *
   * `known` was fed from exactly two places: entities on the diagram at construction, and
   * `add` ops that arrived from PEERS. A node the local user creates during the session is
   * in NEITHER — so as far as the buffer was concerned, an entity this peer invented did
   * not exist.
   *
   * Now watch a peer edit it. Bob creates node X. Alice learns about it, drags it, and
   * sends `set(X, position)`. It arrives at Bob, whose buffer asks "have I seen an `add`
   * for X?", answers NO, and holds it — waiting for an `add(X)` that is never coming, from
   * anyone, ever. It cannot come: the only `add(X)` in existence is Bob's OWN, it is
   * already in Bob's log, and Alice's anti-entropy correctly concludes that Bob already
   * has it and never echoes it back.
   *
   * So Bob's node freezes wherever it was when he made it, Alice watches it move, and the
   * two documents differ forever — over the single most ordinary interaction in a
   * collaborative editor: one person moving another person's node. On a healthy transport
   * it never fires (the `set` cannot overtake an `add` that was never sent), which is
   * exactly why it took a reordering channel to find it.
   *
   * No drain is needed. A peer can only `set` an entity it has learned about, which means
   * our `add` had already reached it — so nothing can be waiting on an id at the moment we
   * create it. The registration alone closes the hole.
   */
  noteLocal(op: Op): void {
    if (op.op === 'add') this.known.add(op.id);
  }

  /**
   * Split an arriving batch into what can be applied now and what must wait — and fold in
   * anything that was already waiting and has just become releasable.
   */
  admit(incoming: readonly Op[]): CausalSplit {
    const ready: Op[] = [];
    let held = 0;

    // Total order first. An `add` and the `set`s that depend on it routinely arrive in
    // the SAME batch (a catch-up delta is exactly that), and sorting means the add is
    // seen first and its dependants never touch the buffer at all.
    for (const op of [...incoming].sort(compareOps)) {
      if (this.isReady(op)) {
        this.release(op, ready);
        continue;
      }
      switch (this.hold(op)) {
        case 'held':
          held++;
          break;
        case 'overflow':
          // Bounded degradation: the buffer is full, so we stop protecting this op and
          // let it through as the no-op it will be. That is a genuine (if remote) lost
          // edit — hence `overflowed`, which is counted rather than swallowed.
          ready.push(op);
          break;
        case 'duplicate':
          break;
      }
    }

    return { ready, held };
  }

  /** Everything we are still holding — for a status panel, and for the tests. */
  pending(): Op[] {
    const out: Op[] = [];
    for (const list of this.waiting.values()) out.push(...list);
    return out.sort(compareOps);
  }

  // -------------------------------------------------------------------------

  private isReady(op: Op): boolean {
    // An `add` carries its own entity. A diagram-level `set` has no entity to wait on.
    if (op.op === 'add') return true;
    if (op.target === 'diagram') return true;
    return this.known.has(op.id);
  }

  /**
   * Emit a ready op, then drain anything that was waiting on it. Recursive in spirit
   * (a released `add` can free `set`s, and nothing else) but flat in code.
   */
  private release(op: Op, out: Op[]): void {
    out.push(op);
    if (op.op !== 'add') return;

    this.known.add(op.id);

    const freed = this.waiting.get(op.id);
    if (!freed) return;
    this.waiting.delete(op.id);

    // Sorted: the dependants must apply in total order among themselves, or two `set`s on
    // the same register could land in the wrong sequence. (The LWW gate would catch that
    // anyway — but relying on the gate to fix an ordering we control ourselves is how you
    // end up depending on a safety net you have never tested.)
    for (const f of freed.sort(compareOps)) {
      this.heldIds.delete(opId(f));
      out.push(f);
    }
  }

  private hold(op: Op): 'held' | 'duplicate' | 'overflow' {
    const id = opId(op);
    if (this.heldIds.has(id)) return 'duplicate';

    if (this.heldIds.size >= this.maxPending) {
      this.overflowed++;
      return 'overflow';
    }

    this.heldIds.add(id);
    const list = this.waiting.get(op.id);
    if (list) list.push(op);
    else this.waiting.set(op.id, [op]);
    return 'held';
  }
}
