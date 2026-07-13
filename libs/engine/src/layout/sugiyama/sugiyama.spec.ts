// Wave 7 (Auto-layout) — Cards 1 & 5.
//
// Card 1: a clean layered DAG with NO configuration.
// Card 5: semantic constraints honoured DURING the algorithm.
//
// The Card-5 assertions are the point of this file. Every one of them would FAIL
// under the old system, where `ConstraintManager.applyConstraints(nodeId, pos)`
// took an already-computed position and clamped it: a pinned node had no influence
// on where anything else went, so the others simply landed on top of it, and
// "same rank as B" / "left of C" / "keep this cluster together" could not even be
// expressed — they are decisions taken in ranking and ordering, and by the time
// you hold coordinates the information needed to honour them is gone.

import { sugiyama, inferDirection, type SugiyamaEdge, type SugiyamaNode } from './sugiyama';

const N = (id: string, w = 100, h = 50): SugiyamaNode => ({ id, width: w, height: h });
const E = (source: string, target: string): SugiyamaEdge => ({ id: `${source}->${target}`, source, target });

/** Do these two boxes overlap? */
function overlaps(
  a: { x: number; y: number },
  an: SugiyamaNode,
  b: { x: number; y: number },
  bn: SugiyamaNode
): boolean {
  return (
    a.x < b.x + bn.width && a.x + an.width > b.x && a.y < b.y + bn.height && a.y + an.height > b.y
  );
}

describe('Card 1 — the layered (Sugiyama) default', () => {
  it('layers a DAG: every edge points strictly downward in rank', () => {
    const nodes = [N('a'), N('b'), N('c'), N('d')];
    const edges = [E('a', 'b'), E('a', 'c'), E('b', 'd'), E('c', 'd')];
    const { ranks } = sugiyama(nodes, edges, { direction: 'TB' });

    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(1);
    expect(ranks.get('d')).toBe(2);
  });

  it('never overlaps nodes', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => N(id));
    const edges = [E('a', 'b'), E('a', 'c'), E('a', 'd'), E('b', 'e'), E('c', 'e'), E('d', 'f')];
    const { positions } = sugiyama(nodes, edges);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pa = positions.get(nodes[i].id)!;
        const pb = positions.get(nodes[j].id)!;
        expect(overlaps(pa, nodes[i], pb, nodes[j])).toBe(false);
      }
    }
  });

  it('breaks cycles instead of losing edges or hanging', () => {
    // a → b → c → a  (a pure cycle: there is no "correct" layering, but there IS
    // a wrong behaviour — hanging, or dropping an edge)
    const nodes = [N('a'), N('b'), N('c')];
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a')];
    const { positions, ranks } = sugiyama(nodes, edges);

    expect(positions.size).toBe(3);
    expect(new Set(ranks.values()).size).toBeGreaterThan(1); // it really layered them
  });

  it('splits long edges into bend chains — the phase naive implementations skip', () => {
    // a → d spans three ranks. Without dummy nodes, crossing minimisation cannot
    // see this edge at all and coordinate assignment has nowhere to bend it, so it
    // cuts straight through whatever sits at ranks 1 and 2.
    const nodes = [N('a'), N('b'), N('c'), N('d')];
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd'), E('a', 'd')];
    const { bends } = sugiyama(nodes, edges);

    expect(bends.get('a->d')).toBeDefined();
    expect(bends.get('a->d')!.length).toBe(2); // one bend per intermediate rank
    expect(bends.get('a->b')).toBeUndefined(); // adjacent ranks need no bend
  });

  it('minimises crossings (the median sweeps actually do something)', () => {
    // A deliberately crossed bipartite graph: a→y, b→x. A layout that keeps the
    // input order crosses; the sweeps should untangle it.
    const nodes = [N('a'), N('b'), N('x'), N('y')];
    const edges = [E('a', 'y'), E('b', 'x')];
    const { crossings } = sugiyama(nodes, edges);
    expect(crossings).toBe(0);
  });

  it('is deterministic and idempotent', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => N(id));
    const edges = [E('a', 'b'), E('a', 'c'), E('b', 'd'), E('c', 'd'), E('d', 'e')];
    const run = () => JSON.stringify([...sugiyama(nodes, edges).positions].sort());
    expect(run()).toBe(run());

    // and insertion order must not matter (Card 0's lesson)
    const shuffled = [...nodes].reverse();
    expect(JSON.stringify([...sugiyama(shuffled, edges).positions].sort())).toBe(run());
  });

  describe('direction', () => {
    it('lays out LR by transforming the SAME algorithm, not a second copy', () => {
      const nodes = [N('a'), N('b')];
      const edges = [E('a', 'b')];
      const tb = sugiyama(nodes, edges, { direction: 'TB' });
      const lr = sugiyama(nodes, edges, { direction: 'LR' });

      // TB: b is below a. LR: b is to the right of a.
      expect(tb.positions.get('b')!.y).toBeGreaterThan(tb.positions.get('a')!.y);
      expect(lr.positions.get('b')!.x).toBeGreaterThan(lr.positions.get('a')!.x);
    });

    it('infers LR for a pipeline and TB for a tree (zero-config)', () => {
      const chain = ['a', 'b', 'c', 'd', 'e'].map((id) => N(id));
      const chainEdges = [E('a', 'b'), E('b', 'c'), E('c', 'd'), E('d', 'e')];
      expect(inferDirection(chain, chainEdges)).toBe('LR');

      const tree = ['r', 'a', 'b', 'c', 'd'].map((id) => N(id));
      const treeEdges = [E('r', 'a'), E('r', 'b'), E('r', 'c'), E('r', 'd')];
      expect(inferDirection(tree, treeEdges)).toBe('TB');
    });
  });
});

describe('Card 5 — semantic constraints, honoured INSIDE the algorithm', () => {
  it('SAME-RANK: two nodes the graph would rank apart share a rank', () => {
    // Left to itself, c ranks below b (a→b→c). Asking for b and c on the same rank
    // is a statement about the RANKING — it is applied by contracting the graph
    // before ranking, which is the only way to honour it rather than approximate it.
    const nodes = [N('a'), N('b'), N('c')];
    const edges = [E('a', 'b'), E('a', 'c'), E('b', 'c')];

    const free = sugiyama(nodes, edges);
    expect(free.ranks.get('b')).not.toBe(free.ranks.get('c')); // b→c forces them apart

    const constrained = sugiyama(nodes, edges, { constraints: { sameRank: [['b', 'c']] } });
    expect(constrained.ranks.get('b')).toBe(constrained.ranks.get('c'));
    // …and they still do not overlap
    const pb = constrained.positions.get('b')!;
    const pc = constrained.positions.get('c')!;
    expect(overlaps(pb, N('b'), pc, N('c'))).toBe(false);
  });

  it('ORDER: "b before c" survives the crossing-minimisation sweeps', () => {
    // The sweeps are free to explore, but they may never PUBLISH an ordering that
    // violates the constraint — it is re-imposed after every sweep. (Imposing it
    // once at the start would let the first sweep undo it.)
    const nodes = [N('a'), N('b'), N('c')];
    const edges = [E('a', 'b'), E('a', 'c')];

    const constrained = sugiyama(nodes, edges, {
      direction: 'TB',
      constraints: { order: [['c', 'b']] }, // c to the LEFT of b
    });
    expect(constrained.positions.get('c')!.x).toBeLessThan(constrained.positions.get('b')!.x);

    // and the reverse constraint reverses the picture — proving it is the
    // constraint doing the work, not a lucky default ordering
    const flipped = sugiyama(nodes, edges, {
      direction: 'TB',
      constraints: { order: [['b', 'c']] },
    });
    expect(flipped.positions.get('b')!.x).toBeLessThan(flipped.positions.get('c')!.x);
  });

  it('KEEP-TOGETHER: a cluster is not split by the sweeps', () => {
    // x, y and z all sit on rank 1. Without the constraint the median heuristic is
    // free to interleave `other` between them.
    const nodes = [N('root'), N('x'), N('y'), N('z'), N('other')];
    const edges = [E('root', 'x'), E('root', 'y'), E('root', 'z'), E('root', 'other')];

    const { positions } = sugiyama(nodes, edges, {
      constraints: { keepTogether: [['x', 'y', 'z']] },
    });

    const xs = ['x', 'y', 'z'].map((id) => positions.get(id)!.x).sort((a, b) => a - b);
    const otherX = positions.get('other')!.x;
    // `other` must not sit strictly between two cluster members
    const between = otherX > xs[0] && otherX < xs[xs.length - 1];
    expect(between).toBe(false);
  });

  it('ANCHOR: a pinned node does not move — and everything else is laid out AROUND it', () => {
    // THE Card-5 test. Under the old system a pin was applied by clamping the node
    // back to its position AFTER an unconstrained layout — so whatever the layout
    // had put there stayed there too, and the pinned node landed on top of it.
    const nodes = [N('a'), N('b'), N('c')];
    const edges = [E('a', 'b'), E('a', 'c')];

    const { positions } = sugiyama(nodes, edges, {
      direction: 'TB',
      constraints: { anchors: { b: { x: 500 } } },
    });

    // the anchor held (positions are top-left; the anchor names the centre)
    expect(positions.get('b')!.x + 50).toBe(500);

    // …and c did NOT land on top of it — the non-overlap pass saw the anchor as an
    // immovable obstacle rather than discovering it afterwards.
    expect(overlaps(positions.get('b')!, N('b'), positions.get('c')!, N('c'))).toBe(false);
  });

  it('an UNSATISFIABLE same-rank demand degrades predictably instead of hanging', () => {
    // "a and b share a rank" when a → b: contraction creates a self-loop in the
    // quotient graph. There is no valid layering; the layout must still terminate
    // and place every node.
    const nodes = [N('a'), N('b')];
    const edges = [E('a', 'b')];
    const { positions } = sugiyama(nodes, edges, { constraints: { sameRank: [['a', 'b']] } });
    expect(positions.size).toBe(2);
  });
});
