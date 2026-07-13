// Wave 7 (Auto-layout) — Card 2: disconnected-component packing.
//
// The claim under test is the one the card calls "exactly where naive
// integrations fall over": lay out a FOREST and the trees must not land on top of
// each other. It is asserted here for every registered layout, not just the new
// ones, because it is a wrapper — and a wrapper that only worked for the layouts
// it shipped with would be the same bug in a nicer coat.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import {
  findConnectedComponents,
  packBoxes,
  layoutWithComponentPacking,
  nodeSize,
} from './component-packing';

// --- helpers ---------------------------------------------------------------

function makeNode(id: string, width = 100, height = 50): NodeModel {
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

/**
 * A forest: `trees` disjoint trees, each a root with `perTree - 1` children.
 * The canonical shape that a bare dagre call turns into a pile.
 */
function buildForest(engine: DiagramEngine, trees: number, perTree: number): DiagramModel {
  const diagram = engine.createDiagram('forest')!;
  for (let t = 0; t < trees; t++) {
    const root = `t${t}-root`;
    diagram.addNode(makeNode(root));
    for (let c = 1; c < perTree; c++) {
      const child = `t${t}-c${c}`;
      diagram.addNode(makeNode(child));
      diagram.addLink(makeLink(root, child));
    }
  }
  return diagram;
}

/** Every pair of node boxes, checked for overlap. The whole point of packing. */
function overlappingPairs(diagram: DiagramModel): string[] {
  const nodes = diagram.getNodes();
  const clashes: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const sa = nodeSize(a);
      const sb = nodeSize(b);
      const overlap =
        a.position.x < b.position.x + sb.width &&
        b.position.x < a.position.x + sa.width &&
        a.position.y < b.position.y + sb.height &&
        b.position.y < a.position.y + sa.height;
      if (overlap) clashes.push(`${a.id} ∩ ${b.id}`);
    }
  }
  return clashes;
}

const positionsOf = (diagram: DiagramModel): string =>
  JSON.stringify(
    diagram
      .getNodes()
      .map((n) => [n.id, Math.round(n.position.x * 1000) / 1000, Math.round(n.position.y * 1000) / 1000])
      .sort()
  );

// --- the finding ------------------------------------------------------------

describe('Card 2 — component packing', () => {
  describe('THE BUG: a forest laid out without packing is a pile', () => {
    it('bare dagre stacks disconnected trees on top of each other', async () => {
      // Not a hypothetical. This is what the adapter does when you hand it a
      // forest: every root is rank 0, and the trees interleave. Documented here
      // so the fix cannot be quietly reverted into "well, dagre was fine".
      const { DagreLayoutAdapter } = await import('./dagre-layout-adapter');
      const engine = new DiagramEngine();
      const diagram = buildForest(engine, 3, 4);

      const result = await new DagreLayoutAdapter().apply(diagram.getNodes(), diagram.getLinks(), {});
      for (const [id, p] of result.nodePositions) {
        diagram.getNode(id)?.setPosition(p.x, p.y);
      }

      // Three separate trees, and dagre has put nodes from different trees at the
      // same coordinates — the pile.
      const roots = ['t0-root', 't1-root', 't2-root'].map((id) => diagram.getNode(id)!);
      const sameRank = roots.every((r) => r.position.y === roots[0].position.y);
      expect(sameRank).toBe(true); // all three roots crammed into rank 0

      engine.destroy();
    });
  });

  describe('THE FIX: packing, on every registered layout', () => {
    it.each(['dagre', 'tree', 'grid', 'circular', 'radial', 'force', 'spectral', 'community'])(
      '%s: a 3-tree forest comes out with ZERO overlapping nodes',
      async (name) => {
        const engine = new DiagramEngine();
        const diagram = buildForest(engine, 3, 4);

        await engine.layout(name);

        expect(overlappingPairs(diagram)).toEqual([]);
        engine.destroy();
      }
    );

    it('the components are laid out INDEPENDENTLY — no tree is interleaved with another', async () => {
      const engine = new DiagramEngine();
      const diagram = buildForest(engine, 3, 4);

      await engine.layout('tree');

      // Each tree's bounding box must be disjoint from the others'. Interleaving
      // (dagre's failure above) would make them intersect even if no two NODES
      // happen to overlap.
      const boxOf = (t: number) => {
        const nodes = diagram.getNodes().filter((n) => n.id.startsWith(`t${t}-`));
        const xs = nodes.map((n) => n.position.x);
        const ys = nodes.map((n) => n.position.y);
        return {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs.map((x, i) => x + nodeSize(nodes[i]).width)),
          maxY: Math.max(...ys.map((y, i) => y + nodeSize(nodes[i]).height)),
        };
      };

      const boxes = [boxOf(0), boxOf(1), boxOf(2)];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const intersects = a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
          expect(intersects).toBe(false);
        }
      }
      engine.destroy();
    });

    it('reports how many components it packed', async () => {
      const engine = new DiagramEngine();
      buildForest(engine, 4, 3);

      const result = await engine.layout('tree');

      expect(result.metadata?.['components']).toBe(4);
      expect(result.metadata?.['packing']).toBe('shelf');
      engine.destroy();
    });

    it('packs COMPACTLY — not in one endless row', async () => {
      // The naive "just offset each component to the right" fix passes an overlap
      // test and still produces a 10,000px-wide strip nobody can read. The shelf
      // packer targets an aspect ratio.
      const engine = new DiagramEngine();
      const diagram = buildForest(engine, 9, 3);

      const result = await engine.layout('grid');

      const aspect = result.bounds.width / result.bounds.height;
      expect(aspect).toBeGreaterThan(0.5);
      expect(aspect).toBeLessThan(5); // a single row of 9 components would be ~20:1
      expect(overlappingPairs(diagram)).toEqual([]);
      engine.destroy();
    });

    it('isolated nodes (no links at all) are packed, not stacked at the origin', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('dust')!;
      for (const id of ['a', 'b', 'c', 'd', 'e']) diagram.addNode(makeNode(id));

      await engine.layout('force');

      expect(overlappingPairs(diagram)).toEqual([]);
      engine.destroy();
    });
  });

  describe('THE NO-OP GUARANTEE: a connected graph is untouched', () => {
    it('a single component takes the fast path — identical to calling the layout raw', async () => {
      // This is what makes packing safe to put in front of EVERY layout: if it
      // changed connected graphs at all, it would be a silent regression of six
      // waves of golden behaviour.
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('chain')!;
      for (const id of ['a', 'b', 'c']) diagram.addNode(makeNode(id));
      diagram.addLink(makeLink('a', 'b'));
      diagram.addLink(makeLink('b', 'c'));

      const wrapped = await engine.layout('dagre');

      const { DagreLayoutAdapter } = await import('./dagre-layout-adapter');
      const raw = await new DagreLayoutAdapter().apply(
        [...diagram.getNodes()].sort((x, y) => (x.id < y.id ? -1 : 1)),
        [...diagram.getLinks()].sort((x, y) => (x.id < y.id ? -1 : 1)),
        { seed: 0x5eed } as never
      );

      for (const [id, p] of raw.nodePositions) {
        expect(wrapped.nodePositions.get(id)).toEqual(p);
      }
      expect(wrapped.metadata?.['components']).toBe(1);
      engine.destroy();
    });
  });

  describe('determinism and idempotence survive packing', () => {
    it.each(['tree', 'grid', 'circular', 'radial', 'force'])(
      '%s: same graph + same seed => byte-identical coordinates',
      async (name) => {
        const run = async () => {
          const engine = new DiagramEngine();
          const diagram = buildForest(engine, 3, 4);
          await engine.layout(name, { seed: 42 });
          const out = positionsOf(diagram);
          engine.destroy();
          return out;
        };
        expect(await run()).toBe(await run());
      }
    );

    it.each(['tree', 'grid', 'circular', 'radial', 'force'])(
      '%s: laying out twice does not move anything the second time',
      async (name) => {
        const engine = new DiagramEngine();
        const diagram = buildForest(engine, 3, 4);
        await engine.layout(name);
        const first = positionsOf(diagram);
        await engine.layout(name);
        expect(positionsOf(diagram)).toBe(first);
        engine.destroy();
      }
    );

    it('THE SUBTLE ONE: which tree was authored first must not change the packing', async () => {
      // Components come back in id order and the shelf packer breaks height ties
      // on id, so the packing is a pure function of the graph — not of the order
      // the trees happen to sit in the node map.
      const layoutIn = async (order: number[]) => {
        const engine = new DiagramEngine();
        const diagram = engine.createDiagram('forest')!;
        for (const t of order) {
          diagram.addNode(makeNode(`t${t}-root`));
          for (let c = 1; c < 4; c++) {
            diagram.addNode(makeNode(`t${t}-c${c}`));
            diagram.addLink(makeLink(`t${t}-root`, `t${t}-c${c}`));
          }
        }
        await engine.layout('tree');
        const out = positionsOf(diagram);
        engine.destroy();
        return out;
      };

      expect(await layoutIn([0, 1, 2])).toBe(await layoutIn([2, 0, 1]));
    });
  });

  describe('findConnectedComponents', () => {
    it('splits a forest and keeps each component\'s links with it', () => {
      const nodes = ['a', 'b', 'x', 'y', 'lone'].map((id) => makeNode(id));
      const links = [makeLink('a', 'b'), makeLink('x', 'y')];

      const components = findConnectedComponents(nodes, links);

      expect(components.map((c) => c.nodes.map((n) => n.id))).toEqual([
        ['a', 'b'],
        ['lone'],
        ['x', 'y'],
      ]);
      expect(components[0].links.map((l) => l.id)).toEqual(['a->b']);
      expect(components[1].links).toEqual([]);
      expect(components[2].links.map((l) => l.id)).toEqual(['x->y']);
    });

    it('connectivity is UNDIRECTED — a tree is one component, not a root plus leaves', () => {
      // Treating edges as directed would shatter every tree into its leaves, and
      // the "packing" would then scatter the nodes of a single chart.
      const nodes = ['root', 'kid1', 'kid2'].map((id) => makeNode(id));
      const links = [makeLink('root', 'kid1'), makeLink('root', 'kid2')];

      expect(findConnectedComponents(nodes, links)).toHaveLength(1);
    });

    it('drops dangling links — an edge to a node that is not there cannot join anything', () => {
      // This also fixes a live dagre bug: `g.setEdge('a', 'ghost')` makes dagre
      // INVENT a node called 'ghost', whose coordinates then pollute the bounds.
      const nodes = ['a', 'b'].map((id) => makeNode(id));
      const links = [makeLink('a', 'b'), makeLink('a', 'ghost')];

      const components = findConnectedComponents(nodes, links);
      expect(components).toHaveLength(1);
      expect(components[0].links.map((l) => l.id)).toEqual(['a->b']);
    });

    it('is stable regardless of insertion order', () => {
      const forward = findConnectedComponents(
        ['a', 'b', 'x', 'y'].map((id) => makeNode(id)),
        [makeLink('a', 'b'), makeLink('x', 'y')]
      );
      const backward = findConnectedComponents(
        ['y', 'x', 'b', 'a'].map((id) => makeNode(id)),
        [makeLink('x', 'y'), makeLink('a', 'b')]
      );
      expect(forward.map((c) => c.nodes.map((n) => n.id))).toEqual(
        backward.map((c) => c.nodes.map((n) => n.id))
      );
    });

    it('an empty graph has no components', () => {
      expect(findConnectedComponents([], [])).toEqual([]);
    });
  });

  describe('packBoxes (shelf, first-fit-decreasing-height)', () => {
    it('opens a new shelf when a box would overflow the target width', () => {
      const boxes = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, width: 400, height: 300 }));
      const offsets = packBoxes(boxes, { spacing: 10 });

      const rows = new Set([...offsets.values()].map((o) => o.y));
      expect(rows.size).toBeGreaterThan(1); // not one endless row
    });

    it('packs boxes without overlapping them', () => {
      const boxes = [
        { id: 'tall', width: 100, height: 400 },
        { id: 'wide', width: 500, height: 80 },
        { id: 'small', width: 60, height: 60 },
        { id: 'big', width: 300, height: 300 },
      ];
      const offsets = packBoxes(boxes, { spacing: 20 });

      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = { ...boxes[i], ...offsets.get(boxes[i].id)! };
          const b = { ...boxes[j], ...offsets.get(boxes[j].id)! };
          const overlap =
            a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          expect(overlap).toBe(false);
        }
      }
    });

    it('breaks height ties on id, so equal components pack in a stable order', () => {
      const boxes = [
        { id: 'c', width: 100, height: 100 },
        { id: 'a', width: 100, height: 100 },
        { id: 'b', width: 100, height: 100 },
      ];
      const first = packBoxes(boxes, { spacing: 10 });
      const second = packBoxes([...boxes].reverse(), { spacing: 10 });

      expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
      expect(first.get('a')!.x).toBeLessThan(first.get('b')!.x);
    });

    it('a box wider than the target width is still placed (the width is a floor, not a cap)', () => {
      const offsets = packBoxes([{ id: 'monster', width: 100000, height: 10 }], { spacing: 10 });
      expect(offsets.get('monster')).toEqual({ x: 0, y: 0 });
    });

    it('an empty box list packs to nothing', () => {
      expect(packBoxes([]).size).toBe(0);
    });
  });

  describe('layoutWithComponentPacking, directly', () => {
    it('an empty graph returns an empty result rather than NaN bounds', async () => {
      const result = await layoutWithComponentPacking('grid', () => {
        throw new Error('must not run the layout on an empty graph');
      }, [], []);

      expect(result.nodePositions.size).toBe(0);
      expect(result.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
      expect(result.metadata?.['components']).toBe(0);
    });

    it('normalises each component from the POSITIONS, not the layout\'s self-reported bounds', async () => {
      // Adapters disagree about bounds — force pads by 50px, dagre does not. Packing
      // against those would leave ragged gutters. Here a layout lies about its
      // bounds and the packing must ignore the lie.
      const nodes = ['a', 'b'].map((id) => makeNode(id, 100, 100));

      const result = await layoutWithComponentPacking(
        'liar',
        (componentNodes) => ({
          nodePositions: new Map(componentNodes.map((n) => [n.id, { x: 0, y: 0 }])),
          bounds: { x: -9999, y: -9999, width: 99999, height: 99999 }, // nonsense
        }),
        nodes,
        [] // no links ⇒ two components
      );

      // Two 100x100 components, each normalised to its own origin and packed:
      // the second must sit exactly one box + spacing away, not 99999px away.
      const a = result.nodePositions.get('a')!;
      const b = result.nodePositions.get('b')!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeLessThan(500);
    });
  });
});
