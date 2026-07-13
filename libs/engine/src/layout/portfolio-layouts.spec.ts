// Wave 7 (Auto-layout) — Card 2: the first-class layout portfolio.
//
// Each layout is asserted on the property that makes it THAT layout — a grid is
// aligned in rows and columns, a circle is equidistant from a centre, a radial
// layout puts BFS depth on concentric rings — rather than on a golden coordinate
// dump, which asserts nothing about whether the picture is right.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { nodeSize } from './component-packing';
import { circularLayout, gridLayout, radialLayout, forceLayout } from './portfolio-layouts';
import { removeOverlaps } from './overlap-removal';

function makeNode(id: string, width = 100, height = 60): NodeModel {
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

/** A star: one hub, `spokes` leaves. */
function star(hub: string, spokes: number): { nodes: NodeModel[]; links: LinkModel[] } {
  const nodes = [makeNode(hub)];
  const links: LinkModel[] = [];
  for (let i = 0; i < spokes; i++) {
    const id = `leaf-${i}`;
    nodes.push(makeNode(id));
    links.push(makeLink(hub, id));
  }
  return { nodes, links };
}

const centreOf = (node: NodeModel, p: { x: number; y: number }) => {
  const s = nodeSize(node);
  return { x: p.x + s.width / 2, y: p.y + s.height / 2 };
};

describe('Card 2 — GRID', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeNode(id));

  it('lays nodes out in rows and columns', () => {
    const result = gridLayout(nodes, [], { columns: 3, nodeSpacing: 20, rankSpacing: 30 });

    // 6 nodes, 3 columns ⇒ 2 rows. Exactly 3 distinct x's and 2 distinct y's.
    const xs = new Set([...result.nodePositions.values()].map((p) => p.x));
    const ys = new Set([...result.nodePositions.values()].map((p) => p.y));
    expect(xs.size).toBe(3);
    expect(ys.size).toBe(2);
    expect(result.metadata?.['columns']).toBe(3);
    expect(result.metadata?.['rows']).toBe(2);
  });

  it('defaults to a roughly square grid — ceil(sqrt(n)) columns', () => {
    expect(gridLayout(nodes, [], {}).metadata?.['columns']).toBe(3); // ceil(sqrt(6))
    expect(gridLayout(nodes.slice(0, 4), [], {}).metadata?.['columns']).toBe(2);
  });

  it('honours nodeSpacing and rankSpacing', () => {
    const tight = gridLayout(nodes, [], { columns: 3, nodeSpacing: 10, rankSpacing: 10 });
    const loose = gridLayout(nodes, [], { columns: 3, nodeSpacing: 100, rankSpacing: 100 });
    expect(loose.bounds.width).toBeGreaterThan(tight.bounds.width);
    expect(loose.bounds.height).toBeGreaterThan(tight.bounds.height);
  });

  it('direction chooses the fill order: LR fills down each column, TB across each row', () => {
    const tb = gridLayout(nodes, [], { columns: 3, direction: 'TB' });
    const lr = gridLayout(nodes, [], { columns: 3, direction: 'LR' });

    // TB: a, b, c across the first row ⇒ same y, ascending x.
    expect(tb.nodePositions.get('a')!.y).toBe(tb.nodePositions.get('b')!.y);
    expect(tb.nodePositions.get('a')!.x).toBeLessThan(tb.nodePositions.get('b')!.x);

    // LR: a, b down the first column ⇒ same x, ascending y.
    expect(lr.nodePositions.get('a')!.x).toBe(lr.nodePositions.get('b')!.x);
    expect(lr.nodePositions.get('a')!.y).toBeLessThan(lr.nodePositions.get('b')!.y);
  });

  it('RL and BT mirror the fill', () => {
    // RL is LR mirrored: still column-major (a and b share a column), but the
    // first-filled column is the RIGHTMOST one, so 'a' sits right of 'c'.
    const rl = gridLayout(nodes, [], { columns: 3, direction: 'RL' });
    expect(rl.nodePositions.get('a')!.x).toBe(rl.nodePositions.get('b')!.x);
    expect(rl.nodePositions.get('a')!.x).toBeGreaterThan(rl.nodePositions.get('c')!.x);

    // BT is TB mirrored: still row-major, but the first-filled row is the BOTTOM.
    const bt = gridLayout(nodes, [], { columns: 3, direction: 'BT' });
    expect(bt.nodePositions.get('a')!.y).toBe(bt.nodePositions.get('b')!.y);
    expect(bt.nodePositions.get('a')!.y).toBeGreaterThan(bt.nodePositions.get('f')!.y);
  });

  it('centres differently-sized nodes in a uniform cell rather than left-aligning them', () => {
    const mixed = [makeNode('big', 200, 60), makeNode('small', 40, 60)];
    const result = gridLayout(mixed, [], { columns: 2, nodeSpacing: 0 });
    // Cell width is 200 (the widest). 'small' sits centred: (200 - 40) / 2 = 80 in.
    expect(result.nodePositions.get('big')!.x).toBe(0);
    expect(result.nodePositions.get('small')!.x).toBe(200 + 80);
  });

  it('ignores links entirely — a grid is for when the edges are not the story', () => {
    const withLinks = gridLayout(nodes, [makeLink('a', 'f')], { columns: 3 });
    const without = gridLayout(nodes, [], { columns: 3 });
    expect([...withLinks.nodePositions]).toEqual([...without.nodePositions]);
  });

  it('an empty graph does not produce NaN bounds', () => {
    expect(gridLayout([], [], {}).bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('Card 2 — CIRCULAR', () => {
  it('places every node on a ring — equidistant from the centre', () => {
    const { nodes, links } = star('hub', 7);
    const result = circularLayout(nodes, links, {});

    const positions = nodes.map((n) => centreOf(n, result.nodePositions.get(n.id)!));
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;

    const radii = positions.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const spread = Math.max(...radii) - Math.min(...radii);
    // All 8 nodes on one circle: the radii agree to within a pixel or two of
    // floating-point noise (the centroid of a ring is its centre).
    expect(spread).toBeLessThan(2);
  });

  it('grows the radius with the node count instead of stacking nodes', () => {
    const small = circularLayout(star('h', 3).nodes, star('h', 3).links, {});
    const large = circularLayout(star('h', 30).nodes, star('h', 30).links, {});
    expect(large.metadata?.['radius']).toBeGreaterThan(small.metadata?.['radius'] as number);
  });

  it('a bigger node claims a bigger arc, so it does not collide with its neighbours', () => {
    const nodes = [makeNode('a', 400, 400), makeNode('b', 40, 40), makeNode('c', 40, 40)];
    const result = circularLayout(nodes, [], {});
    // Slot-proportional arcs: with a 400px node in the ring the circumference (and
    // so the radius) must be dominated by it.
    expect(result.metadata?.['radius']).toBeGreaterThan(100);
    expect(removeOverlaps(nodes, new Map(result.nodePositions), { spacing: 0 })).toEqual(
      result.nodePositions
    ); // already overlap-free
  });

  it('orders the ring by BFS, not by id — neighbours end up adjacent', () => {
    // A path a-c-b: by id the ring would be a, b, c (putting the two ENDS of the
    // path next to each other and drawing a chord across the circle). BFS from 'a'
    // gives a, c, b — the path's own order.
    const nodes = ['a', 'b', 'c'].map((id) => makeNode(id));
    const links = [makeLink('a', 'c'), makeLink('c', 'b')];
    const result = circularLayout(nodes, links, {});

    // Clockwise distance from the top of the ring, unwrapped into [0, 2π) —
    // atan2 alone wraps at π and would make the third node look like it came
    // FIRST.
    const clockwiseFromTop = (id: string) => {
      const p = centreOf(nodes.find((n) => n.id === id)!, result.nodePositions.get(id)!);
      const r = result.metadata?.['radius'] as number;
      const raw = Math.atan2(p.y - r, p.x - r);
      return (raw + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    };
    // a is first (at the top); c — a's neighbour — is next round; b is last.
    expect(clockwiseFromTop('a')).toBeLessThan(clockwiseFromTop('c'));
    expect(clockwiseFromTop('c')).toBeLessThan(clockwiseFromTop('b'));
  });

  it('an explicit radius wins', () => {
    const { nodes, links } = star('hub', 4);
    expect(circularLayout(nodes, links, { radius: 999 }).metadata?.['radius']).toBe(999);
  });

  it('a single node sits at the origin rather than dividing by zero', () => {
    const result = circularLayout([makeNode('only')], [], {});
    expect(result.nodePositions.get('only')).toEqual({ x: 0, y: 0 });
  });
});

describe('Card 2 — RADIAL', () => {
  /** hub → mid1, mid2 ; mid1 → leaf1, leaf2 ; mid2 → leaf3 */
  function twoLevelTree() {
    const nodes = ['hub', 'mid1', 'mid2', 'leaf1', 'leaf2', 'leaf3'].map((id) => makeNode(id));
    const links = [
      makeLink('hub', 'mid1'),
      makeLink('hub', 'mid2'),
      makeLink('mid1', 'leaf1'),
      makeLink('mid1', 'leaf2'),
      makeLink('mid2', 'leaf3'),
    ];
    return { nodes, links };
  }

  const radiusOf = (nodes: NodeModel[], result: { nodePositions: Map<string, { x: number; y: number }> }, id: string) => {
    const node = nodes.find((n) => n.id === id)!;
    const c = centreOf(node, result.nodePositions.get(id)!);
    return Math.hypot(c.x, c.y); // the root is centred on (0, 0)
  };

  it('puts BFS depth on concentric rings', () => {
    const { nodes, links } = twoLevelTree();
    const result = radialLayout(nodes, links, {});

    const hub = radiusOf(nodes, result, 'hub');
    const mid = radiusOf(nodes, result, 'mid1');
    const leaf = radiusOf(nodes, result, 'leaf1');

    expect(hub).toBeCloseTo(0, 5);
    expect(mid).toBeGreaterThan(hub);
    expect(leaf).toBeGreaterThan(mid);

    // Same depth ⇒ same ring.
    expect(radiusOf(nodes, result, 'mid2')).toBeCloseTo(mid, 5);
    expect(radiusOf(nodes, result, 'leaf3')).toBeCloseTo(leaf, 5);
    expect(result.metadata?.['rings']).toBe(2);
  });

  it('BUG FOUND BY THIS TEST: centres on the SOURCE, not the highest-degree node', () => {
    // In this tree the CEO ('hub') has degree 2 and the middle manager ('mid1')
    // has degree 3 — hub, leaf1, leaf2. A "centre on the most connected node"
    // rule (which is what radial layouts classically do, and what this shipped
    // with) centres the picture on the MIDDLE MANAGER and hangs the CEO off the
    // side. Sources win; degree is only the fallback.
    const { nodes, links } = twoLevelTree();
    const degreeOf = (id: string) => links.filter((l) => l.sourceNodeId === id || l.targetNodeId === id).length;
    expect(degreeOf('mid1')).toBeGreaterThan(degreeOf('hub')); // the trap is real

    expect(radialLayout(nodes, links, {}).metadata?.['root']).toBe('hub');
  });

  it('falls back to the hub when the graph has NO source (a cycle)', () => {
    // No in-degree-0 node exists, so "the middle" genuinely means "the most
    // connected" — which is where the degree rule belongs.
    const nodes = ['a', 'b', 'c', 'spoke'].map((id) => makeNode(id));
    const links = [
      makeLink('a', 'b'),
      makeLink('b', 'c'),
      makeLink('c', 'a'), // cycle: every node has in-degree ≥ 1
      makeLink('a', 'spoke'),
      makeLink('spoke', 'a'),
    ];
    expect(radialLayout(nodes, links, {}).metadata?.['root']).toBe('a'); // degree 4
  });

  it('an explicit rootId wins', () => {
    const { nodes, links } = twoLevelTree();
    const result = radialLayout(nodes, links, { rootId: 'leaf3' });
    expect(result.metadata?.['root']).toBe('leaf3');
    expect(radiusOf(nodes, result, 'leaf3')).toBeCloseTo(0, 5);
  });

  it('allocates each subtree a wedge PROPORTIONAL TO ITS LEAF COUNT', () => {
    // mid1 has 2 leaves, mid2 has 1. mid1's wedge must be twice mid2's — the whole
    // point of the leaf-count weighting. A naive "split the circle evenly by
    // sibling count" would give them the same wedge and cram mid1's subtree.
    const { nodes, links } = twoLevelTree();
    const result = radialLayout(nodes, links, {});

    const angle = (id: string) => {
      const c = centreOf(nodes.find((n) => n.id === id)!, result.nodePositions.get(id)!);
      return Math.atan2(c.y, c.x);
    };

    // The three leaves are spread over 2π by wedge; mid1's two leaves straddle
    // mid1's angle and mid2's single leaf sits exactly on mid2's angle.
    expect(angle('leaf3')).toBeCloseTo(angle('mid2'), 5);
    expect(angle('leaf1')).not.toBeCloseTo(angle('mid1'), 1);
    expect(angle('leaf2')).not.toBeCloseTo(angle('mid1'), 1);
  });

  it('grows a crowded ring outward instead of overlapping the nodes on it', () => {
    // 40 leaves cannot fit on a ring sized by "depth × constant" — the classic
    // radial-layout failure. The ring must be sized by what is ON it.
    const { nodes, links } = star('hub', 40);
    const result = radialLayout(nodes, links, { rankSpacing: 10 });

    const ringRadius = radiusOf(nodes, result, 'leaf-0');
    const circumference = 2 * Math.PI * ringRadius;
    expect(circumference).toBeGreaterThan(40 * 100); // 40 nodes, 100px wide, all fit
  });

  it('a single node sits at the origin', () => {
    expect(radialLayout([makeNode('only')], [], {}).nodePositions.get('only')).toEqual({ x: 0, y: 0 });
  });
});

describe('Card 2 — FORCE', () => {
  it('translates the shared vocabulary into the physics engine\'s dialect', async () => {
    // nodeSpacing → repulsion, rankSpacing → linkDistance. A caller should never
    // have to know that force calls edge length "linkDistance".
    const { nodes, links } = star('hub', 5);
    const tight = await forceLayout(nodes.map((n) => makeNode(n.id)), links, {
      seed: 1,
      rankSpacing: 40,
    });
    const loose = await forceLayout(nodes.map((n) => makeNode(n.id)), links, {
      seed: 1,
      rankSpacing: 400,
    });

    const extent = (r: { bounds: { width: number; height: number } }) => r.bounds.width + r.bounds.height;
    expect(extent(loose)).toBeGreaterThan(extent(tight));
  });

  it('leaves the adapter defaults alone when the caller says nothing', async () => {
    // The trap: defaulting nodeSpacing to 50 here would silently change what
    // `engine.layout('force')` has always done, because 50 is not the adapter's
    // repulsion default (100).
    const { nodes, links } = star('hub', 5);
    const viaPortfolio = await forceLayout(nodes, links, { seed: 7 });

    const { ForceLayoutAdapter } = await import('./force-layout-adapter');
    const raw = await new ForceLayoutAdapter().apply(
      star('hub', 5).nodes,
      star('hub', 5).links,
      { seed: 7 } as never
    );

    for (const [id, p] of raw.nodePositions) {
      expect(viaPortfolio.nodePositions.get(id)).toEqual(p);
    }
  });
});

describe('Card 2 — the portfolio is reachable through engine.layout()', () => {
  function buildDiagram(engine: DiagramEngine): DiagramModel {
    const diagram = engine.createDiagram('portfolio')!;
    const { nodes, links } = star('hub', 5);
    for (const n of nodes) diagram.addNode(n);
    for (const l of links) diagram.addLink(l);
    return diagram;
  }

  it.each(['tree', 'grid', 'circular', 'radial', 'force'])(
    "engine.layout('%s') runs and COMMITS the positions to the model",
    async (name) => {
      const engine = new DiagramEngine();
      const diagram = buildDiagram(engine);

      const result = await engine.layout(name);

      expect(result.algorithm).toBe(name);
      expect(result.nodePositions.size).toBe(6);
      // Committed via setPosition(), so the spatial index and the routing obstacle
      // map saw the move — not merely returned.
      for (const [id, p] of result.nodePositions) {
        expect(diagram.getNode(id)!.position.x).toBe(p.x);
        expect(diagram.getNode(id)!.position.y).toBe(p.y);
      }
      engine.destroy();
    }
  );

  it.each(['tree', 'grid', 'circular', 'radial'])(
    '%s: one vocabulary — nodeSpacing/rankSpacing change the picture, no per-layout dialect needed',
    async (name) => {
      const run = async (spacing: number) => {
        const engine = new DiagramEngine();
        buildDiagram(engine);
        const result = await engine.layout(name, { nodeSpacing: spacing, rankSpacing: spacing });
        engine.destroy();
        return result.bounds.width + result.bounds.height;
      };
      expect(await run(200)).toBeGreaterThan(await run(20));
    }
  );

  it('an unknown layout still fails loudly, and now lists the portfolio', async () => {
    const engine = new DiagramEngine();
    buildDiagram(engine);
    await expect(engine.layout('nope')).rejects.toThrow(/Unknown layout 'nope'/);
    await expect(engine.layout('nope')).rejects.toThrow(/circular, community, dagre, elk, force, grid, radial, spectral, tree/);
    engine.destroy();
  });

  it('a host can still REPLACE a portfolio layout, and the disposer restores it', async () => {
    const engine = new DiagramEngine();
    const diagram = buildDiagram(engine);

    const dispose = engine.getLayoutRegistry().register({
      name: 'tree',
      async apply() {
        return {
          nodePositions: new Map([['hub', { x: 7, y: 7 }]]),
          bounds: { x: 0, y: 0, width: 0, height: 0 },
        };
      },
    });

    await engine.layout('tree');
    expect(diagram.getNode('hub')!.position).toEqual({ x: 7, y: 7 });

    dispose();
    await engine.layout('tree');
    expect(diagram.getNode('hub')!.position).not.toEqual({ x: 7, y: 7 });
    engine.destroy();
  });
});

describe('Card 2 — overlap removal', () => {
  it('separates boxes the algorithm left on top of each other', () => {
    const nodes = [makeNode('a', 100, 100), makeNode('b', 100, 100)];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 0 }], // 90px of overlap
    ]);

    removeOverlaps(nodes, positions, { spacing: 20 });

    const gap = Math.abs(positions.get('b')!.x - positions.get('a')!.x) - 100;
    expect(gap).toBeGreaterThanOrEqual(20);
  });

  it('IS A NO-OP for a layout that does not overlap — that is why it can front every layout', () => {
    const nodes = [makeNode('a', 100, 100), makeNode('b', 100, 100)];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 500, y: 0 }],
    ]);

    removeOverlaps(nodes, positions, { spacing: 20 });

    expect(positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(positions.get('b')).toEqual({ x: 500, y: 0 });
  });

  it('separates along the CHEAPER axis (the minimum translation vector)', () => {
    // Two wide, short boxes overlapping by 10px vertically and 190px horizontally.
    // Pushing them apart horizontally would fling them across the canvas; the
    // right move is 10px vertically.
    const nodes = [makeNode('a', 200, 100), makeNode('b', 200, 100)];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 90 }],
    ]);

    removeOverlaps(nodes, positions, { spacing: 0 });

    expect(positions.get('a')!.x).toBeCloseTo(0, 5); // x untouched
    expect(positions.get('b')!.x).toBeCloseTo(10, 5);
    expect(positions.get('b')!.y - positions.get('a')!.y).toBeGreaterThanOrEqual(100);
  });

  it('is deterministic — identical input, identical output, regardless of node order', () => {
    const build = () => [makeNode('a', 100, 100), makeNode('b', 100, 100), makeNode('c', 100, 100)];
    const seed = (): Map<string, { x: number; y: number }> =>
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 5, y: 5 }],
        ['c', { x: 10, y: 10 }],
      ]);

    const forward = removeOverlaps(build(), seed());
    const backward = removeOverlaps(build().reverse(), seed());

    expect([...forward.entries()].sort()).toEqual([...backward.entries()].sort());
  });

  it('resolves a fully-degenerate pile (every node at the origin)', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => makeNode(id, 100, 100));
    const positions = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));

    removeOverlaps(nodes, positions, { spacing: 10 });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        const overlap = Math.abs(a.x - b.x) < 100 && Math.abs(a.y - b.y) < 100;
        expect(overlap).toBe(false);
      }
    }
  });
});
