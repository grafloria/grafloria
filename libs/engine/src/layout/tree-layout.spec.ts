// Wave 7 (Auto-layout) — Card 2: the Tree layout.
//
// The properties that make a tree layout a TREE layout, rather than "a
// hierarchical layout we called tree": parents are centred over their children,
// siblings never overlap, subtree extents are reserved (not guessed), and
// branches can flow in DIFFERENT DIRECTIONS — which is what a mind map is.

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { nodeSize } from './component-packing';
import { treeLayout, type FlowDirection } from './tree-layout';

function makeNode(id: string, width = 100, height = 40): NodeModel {
  const node = new NodeModel({
    type: 'basic',
    position: { x: 0, y: 0 },
    size: { width, height },
  });
  (node as unknown as { id: string }).id = id;
  node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  return node;
}

function makeLink(source: string, target: string): LinkModel {
  const link = new LinkModel(`${source}-out`, `${target}-in`, 'orthogonal');
  (link as unknown as { id: string }).id = `${source}->${target}`;
  link.sourceNodeId = source;
  link.targetNodeId = target;
  return link;
}

/** Build a tree from `parent → child` pairs. */
function tree(edges: Array<[string, string]>, sizes: Record<string, [number, number]> = {}) {
  const ids = new Set<string>();
  for (const [p, c] of edges) {
    ids.add(p);
    ids.add(c);
  }
  const nodes = [...ids].map((id) => makeNode(id, sizes[id]?.[0] ?? 100, sizes[id]?.[1] ?? 40));
  const links = edges.map(([p, c]) => makeLink(p, c));
  return { nodes, links };
}

const centre = (nodes: NodeModel[], positions: Map<string, { x: number; y: number }>, id: string) => {
  const node = nodes.find((n) => n.id === id)!;
  const p = positions.get(id)!;
  const s = nodeSize(node);
  return { x: p.x + s.width / 2, y: p.y + s.height / 2 };
};

/** Every pair of node boxes, checked for overlap. */
function overlaps(nodes: NodeModel[], positions: Map<string, { x: number; y: number }>): string[] {
  const clashes: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const pa = positions.get(a.id)!;
      const pb = positions.get(b.id)!;
      const sa = nodeSize(a);
      const sb = nodeSize(b);
      if (
        pa.x < pb.x + sb.width &&
        pb.x < pa.x + sa.width &&
        pa.y < pb.y + sb.height &&
        pb.y < pa.y + sa.height
      ) {
        clashes.push(`${a.id} ∩ ${b.id}`);
      }
    }
  }
  return clashes;
}

describe('Card 2 — TREE (org chart)', () => {
  const orgChart = (): Array<[string, string]> => [
    ['ceo', 'vp1'],
    ['ceo', 'vp2'],
    ['vp1', 'eng1'],
    ['vp1', 'eng2'],
    ['vp2', 'sales1'],
  ];

  it('flows top-to-bottom by default, one rank per level', () => {
    const { nodes, links } = tree(orgChart());
    const { nodePositions } = treeLayout(nodes, links, {});

    const y = (id: string) => centre(nodes, nodePositions, id).y;

    expect(y('ceo')).toBeLessThan(y('vp1'));
    expect(y('vp1')).toBe(y('vp2')); // siblings share a rank
    expect(y('vp1')).toBeLessThan(y('eng1'));
    expect(y('eng1')).toBe(y('eng2'));
    expect(y('eng1')).toBe(y('sales1')); // same DEPTH ⇒ same rank, different branch
  });

  it('CENTRES a parent over its children — the thing that makes it tidy', () => {
    const { nodes, links } = tree(orgChart());
    const { nodePositions } = treeLayout(nodes, links, {});

    const x = (id: string) => centre(nodes, nodePositions, id).x;

    expect(x('vp1')).toBeCloseTo((x('eng1') + x('eng2')) / 2, 5);
    expect(x('vp2')).toBeCloseTo(x('sales1'), 5); // an only child: parent sits on it
    expect(x('ceo')).toBeCloseTo((x('vp1') + x('vp2')) / 2, 5);
  });

  it('never overlaps siblings, even when one branch is far bushier than the other', () => {
    // The failure mode of a naive tree layout: reserve one node's width per child
    // instead of the SUBTREE's extent, and the bushy branch grows over its
    // neighbour.
    const { nodes, links } = tree([
      ['root', 'wide'],
      ['root', 'thin'],
      ['wide', 'w1'],
      ['wide', 'w2'],
      ['wide', 'w3'],
      ['wide', 'w4'],
      ['thin', 't1'],
    ]);

    const { nodePositions } = treeLayout(nodes, links, {});
    expect(overlaps(nodes, nodePositions)).toEqual([]);
  });

  it('reserves the extent of DIFFERENTLY-SIZED nodes', () => {
    const { nodes, links } = tree(
      [
        ['root', 'huge'],
        ['root', 'tiny'],
      ],
      { huge: [400, 200], tiny: [30, 20] }
    );

    const { nodePositions } = treeLayout(nodes, links, { nodeSpacing: 10 });
    expect(overlaps(nodes, nodePositions)).toEqual([]);
  });

  it('honours direction: LR flows left-to-right', () => {
    const { nodes, links } = tree(orgChart());
    const { nodePositions } = treeLayout(nodes, links, { direction: 'LR' });

    const x = (id: string) => centre(nodes, nodePositions, id).x;
    const y = (id: string) => centre(nodes, nodePositions, id).y;

    expect(x('ceo')).toBeLessThan(x('vp1'));
    expect(x('vp1')).toBe(x('vp2')); // same rank ⇒ same x now
    expect(y('ceo')).toBeCloseTo((y('vp1') + y('vp2')) / 2, 5); // centred across the breadth axis
  });

  it.each<FlowDirection>(['TB', 'BT', 'LR', 'RL'])('%s: no overlaps, and the root leads', (direction) => {
    const { nodes, links } = tree(orgChart());
    const { nodePositions } = treeLayout(nodes, links, { direction });

    expect(overlaps(nodes, nodePositions)).toEqual([]);

    const root = centre(nodes, nodePositions, 'ceo');
    const leaf = centre(nodes, nodePositions, 'eng1');
    if (direction === 'TB') expect(root.y).toBeLessThan(leaf.y);
    if (direction === 'BT') expect(root.y).toBeGreaterThan(leaf.y);
    if (direction === 'LR') expect(root.x).toBeLessThan(leaf.x);
    if (direction === 'RL') expect(root.x).toBeGreaterThan(leaf.x);
  });

  it('nodeSpacing separates siblings, rankSpacing separates levels', () => {
    const { nodes, links } = tree(orgChart());

    const tight = treeLayout(nodes, links, { nodeSpacing: 10, rankSpacing: 10 });
    const loose = treeLayout(nodes, links, { nodeSpacing: 200, rankSpacing: 200 });

    expect(loose.bounds.width).toBeGreaterThan(tight.bounds.width);
    expect(loose.bounds.height).toBeGreaterThan(tight.bounds.height);
  });

  it('an explicit rootId re-roots the tree', () => {
    const { nodes, links } = tree(orgChart());
    expect(treeLayout(nodes, links, {}).metadata?.['root']).toBe('ceo');
    expect(treeLayout(nodes, links, { rootId: 'vp1' }).metadata?.['root']).toBe('vp1');
  });

  it('reports the tree depth', () => {
    const { nodes, links } = tree(orgChart());
    expect(treeLayout(nodes, links, {}).metadata?.['depth']).toBe(2);
  });
});

describe('Card 2 — TREE: per-branch direction', () => {
  it('MIND MAP: half the branches flow left, half flow right, around a central root', () => {
    // GoJS ships this as a separate DoubleTree extension. Here it is one option.
    const { nodes, links } = tree([
      ['idea', 'left'],
      ['idea', 'right'],
      ['left', 'l1'],
      ['left', 'l2'],
      ['right', 'r1'],
      ['right', 'r2'],
    ]);

    const { nodePositions } = treeLayout(nodes, links, {
      branchDirections: { left: 'RL', right: 'LR' },
    });

    const x = (id: string) => centre(nodes, nodePositions, id).x;

    // The root is genuinely in the MIDDLE: one branch grows left, the other right.
    expect(x('left')).toBeLessThan(x('idea'));
    expect(x('right')).toBeGreaterThan(x('idea'));
    // …and each branch keeps growing outward in its own direction.
    expect(x('l1')).toBeLessThan(x('left'));
    expect(x('l2')).toBeLessThan(x('left'));
    expect(x('r1')).toBeGreaterThan(x('right'));
    expect(x('r2')).toBeGreaterThan(x('right'));

    expect(overlaps(nodes, nodePositions)).toEqual([]);
  });

  it('DOUBLE TREE: branches above and below a central root', () => {
    const { nodes, links } = tree([
      ['centre', 'up'],
      ['centre', 'down'],
      ['up', 'u1'],
      ['down', 'd1'],
    ]);

    const { nodePositions } = treeLayout(nodes, links, {
      direction: 'TB',
      branchDirections: { up: 'BT' },
    });

    const y = (id: string) => centre(nodes, nodePositions, id).y;

    expect(y('up')).toBeLessThan(y('centre'));
    expect(y('u1')).toBeLessThan(y('up'));
    expect(y('down')).toBeGreaterThan(y('centre'));
    expect(y('d1')).toBeGreaterThan(y('down'));

    expect(overlaps(nodes, nodePositions)).toEqual([]);
  });

  it('ASSISTANT NODE: one branch hangs off to the SIDE of a top-down chart', () => {
    // The perpendicular case — a 'LR' branch inside a 'TB' tree. The two groups
    // share a quadrant, and the push-out pass is what stops them colliding.
    const { nodes, links } = tree([
      ['ceo', 'chief-of-staff'],
      ['ceo', 'vp1'],
      ['ceo', 'vp2'],
      ['vp1', 'e1'],
      ['vp1', 'e2'],
      ['vp2', 'e3'],
    ]);

    const { nodePositions } = treeLayout(nodes, links, {
      direction: 'TB',
      branchDirections: { 'chief-of-staff': 'LR' },
    });

    const x = (id: string) => centre(nodes, nodePositions, id).x;
    const y = (id: string) => centre(nodes, nodePositions, id).y;

    // The assistant is beside the CEO, the VPs are below.
    expect(x('chief-of-staff')).toBeGreaterThan(x('ceo'));
    expect(y('vp1')).toBeGreaterThan(y('ceo'));

    // And crucially, nothing collides: the assistant's box must clear the whole
    // VP subtree, which a naive "just put it to the right" would not.
    expect(overlaps(nodes, nodePositions)).toEqual([]);
  });

  it('a per-branch direction applies to the WHOLE subtree, at any depth', () => {
    const { nodes, links } = tree([
      ['root', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);

    const { nodePositions } = treeLayout(nodes, links, {
      direction: 'TB',
      branchDirections: { b: 'LR' }, // b and everything under it turns the corner
    });

    const x = (id: string) => centre(nodes, nodePositions, id).x;
    const y = (id: string) => centre(nodes, nodePositions, id).y;

    expect(y('a')).toBeGreaterThan(y('root')); // still flowing down
    expect(x('b')).toBeGreaterThan(x('a')); // b turned right
    expect(x('c')).toBeGreaterThan(x('b')); // and c inherited the turn
    expect(x('d')).toBeGreaterThan(x('c'));

    expect(overlaps(nodes, nodePositions)).toEqual([]);
  });

  it('no overlaps for EVERY mix of branch directions off one root', () => {
    // The exhaustive version of the assistant case: all 4×4 pairs of perpendicular
    // and opposing groups, each with a subtree of its own.
    const directions: FlowDirection[] = ['TB', 'BT', 'LR', 'RL'];
    for (const first of directions) {
      for (const second of directions) {
        const { nodes, links } = tree([
          ['root', 'p'],
          ['root', 'q'],
          ['p', 'p1'],
          ['p', 'p2'],
          ['q', 'q1'],
          ['q', 'q2'],
        ]);
        const { nodePositions } = treeLayout(nodes, links, {
          branchDirections: { p: first, q: second },
        });
        expect({ first, second, clashes: overlaps(nodes, nodePositions) }).toEqual({
          first,
          second,
          clashes: [],
        });
      }
    }
  });
});

describe('Card 2 — TREE: graphs that are not tidy trees', () => {
  it('respects EDGE DIRECTION — the CEO does not end up hanging off an intern', () => {
    // BFS from the lowest id over an UNDIRECTED graph would root this at 'a-intern'
    // (alphabetically first) and draw the org chart upside down.
    const { nodes, links } = tree([
      ['z-ceo', 'm-vp'],
      ['m-vp', 'a-intern'],
    ]);

    const result = treeLayout(nodes, links, {});
    expect(result.metadata?.['root']).toBe('z-ceo');

    const y = (id: string) => centre(nodes, result.nodePositions, id).y;
    expect(y('z-ceo')).toBeLessThan(y('m-vp'));
    expect(y('m-vp')).toBeLessThan(y('a-intern'));
  });

  it('a CYCLE does not hang the layout — it is spanned, not followed', () => {
    const { nodes, links } = tree([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'], // back edge
    ]);

    const result = treeLayout(nodes, links, {});
    expect(result.nodePositions.size).toBe(3);
    expect(overlaps(nodes, result.nodePositions)).toEqual([]);
  });

  it('a DAG (a node with two parents) places every node exactly once', () => {
    // A diamond: d has two parents. A tree can only draw it under one of them —
    // but it must not draw it twice, and it must not DROP it.
    const { nodes, links } = tree([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);

    const result = treeLayout(nodes, links, {});
    expect(result.nodePositions.size).toBe(4);
    expect(overlaps(nodes, result.nodePositions)).toEqual([]);
  });

  it('a node reachable only against the arrows is still attached, not dropped', () => {
    // 'orphan' points AT the root, so the directed walk from the root can never
    // reach it. The undirected pass must pick it up — a connected component has to
    // come out as one tree.
    const { nodes, links } = tree([
      ['root', 'child'],
      ['orphan', 'root'],
    ]);

    // (root selection: 'orphan' has in-degree 0, so it is the source and the root)
    const result = treeLayout(nodes, links, {});
    expect(result.nodePositions.size).toBe(3);
    expect(result.nodePositions.has('orphan')).toBe(true);
    expect(overlaps(nodes, result.nodePositions)).toEqual([]);
  });

  it('A DEEP CHAIN DOES NOT BLOW THE STACK', () => {
    // The recursive tidy-tree this shipped with threw `RangeError: Maximum call
    // stack size exceeded` at a depth of ~1,000. That is not a theoretical input:
    // a 5,000-step process flow laid out with direction 'LR' IS a 5,000-deep tree,
    // and crashing is a much worse failure than an ugly picture. The traversal is
    // an explicit stack now.
    const depth = 5000;
    const nodes = Array.from({ length: depth }, (_, i) => makeNode(`n${String(i).padStart(6, '0')}`));
    const links = Array.from({ length: depth - 1 }, (_, i) =>
      makeLink(`n${String(i).padStart(6, '0')}`, `n${String(i + 1).padStart(6, '0')}`)
    );

    const result = treeLayout(nodes, links, { direction: 'LR' });

    expect(result.nodePositions.size).toBe(depth);
    expect(result.metadata?.['depth']).toBe(depth - 1);
  });

  it('a single node lays out at the origin', () => {
    const result = treeLayout([makeNode('only')], [], {});
    expect(result.nodePositions.get('only')).toEqual({ x: 0, y: 0 });
  });

  it('an empty graph does not produce NaN bounds', () => {
    expect(treeLayout([], [], {}).bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('Card 2 — TREE: determinism', () => {
  it('insertion order does not change the picture', () => {
    const edges: Array<[string, string]> = [
      ['ceo', 'vp1'],
      ['ceo', 'vp2'],
      ['vp1', 'eng1'],
    ];
    const forward = treeLayout(...Object.values(tree(edges)) as [NodeModel[], LinkModel[]], {});
    const reversed = tree(edges);
    reversed.nodes.reverse();
    reversed.links.reverse();
    const backward = treeLayout(reversed.nodes, reversed.links, {});

    expect([...forward.nodePositions.entries()].sort()).toEqual(
      [...backward.nodePositions.entries()].sort()
    );
  });

  it('is idempotent — a second run over the already-laid-out graph is identical', () => {
    const { nodes, links } = tree([
      ['ceo', 'vp1'],
      ['ceo', 'vp2'],
    ]);

    const first = treeLayout(nodes, links, {});
    for (const [id, p] of first.nodePositions) {
      nodes.find((n) => n.id === id)!.setPosition(p.x, p.y);
    }
    const second = treeLayout(nodes, links, {});

    expect([...second.nodePositions.entries()]).toEqual([...first.nodePositions.entries()]);
  });
});
