/**
 * Deep-graph regression tests for DagreLayoutAdapter.
 *
 * MEASURED DEFECT (2026-07): a 2000-node chain fed to `dagre.layout` either
 * hung for >25s or died with `RangeError: Maximum call stack size exceeded`
 * (dagre 0.8.5's `acyclic.js` dfs is recursive; recursion depth = chain
 * length). Profiling put the wall-clock blame on the ORDER phase:
 * `build-layer-graph` scans ALL nodes once per rank — O(ranks × V), quadratic
 * in depth. At 1000 nodes that was 865ms of a 955ms layout; the rank phase was
 * 31ms, so switching `ranker` cannot fix it.
 *
 * The fix: above `deepRankThreshold` ranks (default 300) the adapter bypasses
 * dagre and runs a linear longest-path + barycenter placement. These tests pin
 * down (a) the deep cases now complete, (b) the fast path produces real 2D
 * hierarchical geometry, (c) shallow graphs still go through dagre and get
 * byte-identical positions, (d) determinism.
 */

import * as dagre from 'dagre';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { perfBudget } from './perf-budget';

function mkNode(id: string): NodeModel {
  return new NodeModel({
    id,
    type: 'layout-test',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
  });
}

function mkLink(sourceId: string, targetId: string): LinkModel {
  const link = new LinkModel(`p-${sourceId}`, `p-${targetId}`);
  link.sourceNodeId = sourceId;
  link.targetNodeId = targetId;
  return link;
}

/** chain: n(i-1) -> n(i) */
function buildChain(n: number): { nodes: NodeModel[]; links: LinkModel[] } {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push(mkNode(`n${i}`));
    if (i > 0) links.push(mkLink(`n${i - 1}`, `n${i}`));
  }
  return { nodes, links };
}

/** R×C grid with right+down edges (the benchmark "mesh" shape) */
function buildMesh(rows: number, cols: number): { nodes: NodeModel[]; links: LinkModel[] } {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  const id = (r: number, c: number) => `m${r}_${c}`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push(mkNode(id(r, c)));
      if (c > 0) links.push(mkLink(id(r, c - 1), id(r, c)));
      if (r > 0) links.push(mkLink(id(r - 1, c), id(r, c)));
    }
  }
  return { nodes, links };
}

describe('DagreLayoutAdapter — deep-graph fast path', () => {
  let adapter: DagreLayoutAdapter;

  beforeEach(() => {
    adapter = new DagreLayoutAdapter();
  });

  describe('the reproduction: deep chains complete', () => {
    it('lays out a 2000-node chain in bounded time (was >25s hang or stack overflow)', async () => {
      const { nodes, links } = buildChain(2000);

      const t0 = performance.now();
      const result = await adapter.apply(nodes, links);
      const elapsed = performance.now() - t0;

      expect(result.nodePositions.size).toBe(2000);
      // Machine-scaled like its perf-family siblings: 3000ms on an idle box (so a
      // genuine regression from the ~50ms fast path still fails), lifted under load.
      expect(elapsed).toBeLessThan(perfBudget(3000)); // measured ~50ms
      expect(result.metadata?.['deepFastPath']).toBe(true);
      expect(result.metadata?.['ranker']).toBe('longest-path');
    });

    it('a deep cycle (chain closed into a loop) also completes — the depth estimate must be cycle-safe and iterative', async () => {
      const { nodes, links } = buildChain(400);
      links.push(mkLink('n399', 'n0')); // close the loop

      const t0 = performance.now();
      const result = await adapter.apply(nodes, links);
      const elapsed = performance.now() - t0;

      expect(result.nodePositions.size).toBe(400);
      expect(elapsed).toBeLessThan(perfBudget(3000));
      expect(result.metadata?.['deepFastPath']).toBe(true);
    });
  });

  describe('fast-path geometry is real hierarchical 2D layout', () => {
    it('TB chain: one straight centered column, ranks strictly descending the page, ranksep respected', async () => {
      const n = 500;
      const { nodes, links } = buildChain(n);
      const result = await adapter.apply(nodes, links, { rankdir: 'TB' });

      expect(result.metadata?.['deepFastPath']).toBe(true);

      const p = (i: number) => result.nodePositions.get(`n${i}`)!;
      for (let i = 0; i < n; i++) {
        // single column: every node at the same x
        expect(p(i).x).toBeCloseTo(p(0).x, 6);
      }
      for (let i = 1; i < n; i++) {
        // strictly increasing y with at least ranksep (default 50) of clear gap
        const gap = p(i).y - (p(i - 1).y + 50); // 50 = node height
        expect(gap).toBeGreaterThanOrEqual(50 - 1e-6);
      }

      // node ranks exposed for port assignment, monotone along the chain
      const ranks = result.metadata?.['nodeRanks'] as Map<string, number>;
      expect(ranks.get('n0')).toBe(0);
      expect(ranks.get(`n${n - 1}`)).toBe(n - 1);
    });

    it('LR chain: ranks advance along x, constant y', async () => {
      const n = 400;
      const { nodes, links } = buildChain(n);
      const result = await adapter.apply(nodes, links, { rankdir: 'LR' });

      expect(result.metadata?.['deepFastPath']).toBe(true);
      const p = (i: number) => result.nodePositions.get(`n${i}`)!;
      for (let i = 1; i < n; i++) {
        expect(p(i).x).toBeGreaterThan(p(i - 1).x);
        expect(p(i).y).toBeCloseTo(p(0).y, 6);
      }
    });

    it('deep sparse DAG: every edge points down the rank axis and siblings do not overlap', async () => {
      // chain with a side node hanging off every 5th node -> ~400 ranks, some
      // ranks hold 2 nodes.
      const nodes: NodeModel[] = [];
      const links: LinkModel[] = [];
      const n = 400;
      for (let i = 0; i < n; i++) {
        nodes.push(mkNode(`n${i}`));
        if (i > 0) links.push(mkLink(`n${i - 1}`, `n${i}`));
        if (i % 5 === 0) {
          nodes.push(mkNode(`s${i}`));
          links.push(mkLink(`n${i}`, `s${i}`));
        }
      }

      const result = await adapter.apply(nodes, links, { rankdir: 'TB' });
      expect(result.metadata?.['deepFastPath']).toBe(true);

      // every link flows strictly downward
      links.forEach((l) => {
        const s = result.nodePositions.get(l.sourceNodeId!)!;
        const t = result.nodePositions.get(l.targetNodeId!)!;
        expect(t.y).toBeGreaterThan(s.y);
      });

      // nodes sharing a rank (n{i+1} and s{i}) are separated by >= nodesep
      for (let i = 0; i < n - 1; i += 5) {
        const a = result.nodePositions.get(`n${i + 1}`)!;
        const b = result.nodePositions.get(`s${i}`)!;
        expect(a.y).toBeCloseTo(b.y, 6);
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(100 + 50 - 1e-6); // width + nodesep
      }
    });
  });

  describe('adaptivity seam', () => {
    it('shallow graph -> full dagre with the configured (default network-simplex) ranker', async () => {
      const { nodes, links } = buildChain(10);
      const result = await adapter.apply(nodes, links);

      expect(result.metadata?.['deepFastPath']).toBe(false);
      expect(result.metadata?.['ranker']).toBe('network-simplex');
    });

    it('deep graph -> fast path reports longest-path ranking', async () => {
      const { nodes, links } = buildChain(320); // 320 ranks > default 300
      const result = await adapter.apply(nodes, links);

      expect(result.metadata?.['deepFastPath']).toBe(true);
      expect(result.metadata?.['ranker']).toBe('longest-path');
    });

    it('deepRankThreshold is an override: a tiny graph can be forced onto the fast path', async () => {
      const { nodes, links } = buildChain(10);
      const result = await adapter.apply(nodes, links, { deepRankThreshold: 5 });

      expect(result.metadata?.['deepFastPath']).toBe(true);
      expect(result.nodePositions.size).toBe(10);
    });

    it('deepRankThreshold: Infinity opts out — full dagre even on a deep-ish graph', async () => {
      const { nodes, links } = buildChain(320);
      const result = await adapter.apply(nodes, links, { deepRankThreshold: Infinity });

      expect(result.metadata?.['deepFastPath']).toBe(false);
      expect(result.metadata?.['ranker']).toBe('network-simplex');
      expect(result.nodePositions.size).toBe(320);
    });

    it('validateOptions accepts sane thresholds and rejects negatives', () => {
      expect(adapter.validateOptions({ deepRankThreshold: 300 })).toBe(true);
      expect(adapter.validateOptions({ deepRankThreshold: Infinity })).toBe(true);
      expect(adapter.validateOptions({ deepRankThreshold: -1 })).toBe(false);
      expect(adapter.validateOptions({ deepRankThreshold: NaN })).toBe(false);
    });
  });

  describe('shallow graphs are untouched (no benchmark cheating)', () => {
    it('a small mesh through the adapter matches raw dagre.layout exactly', async () => {
      const { nodes, links } = buildMesh(5, 5); // depth ~9 ranks, well under 300

      const result = await adapter.apply(nodes, links);
      expect(result.metadata?.['deepFastPath']).toBe(false);

      // Replicate the adapter's historical dagre invocation verbatim.
      const g = new dagre.graphlib.Graph({ multigraph: true });
      g.setGraph({
        rankdir: 'TB',
        align: undefined,
        nodesep: 50,
        edgesep: 10,
        ranksep: 50,
        marginx: 0,
        marginy: 0,
        acyclicer: undefined,
        ranker: 'network-simplex',
      } as dagre.GraphLabel);
      g.setDefaultEdgeLabel(() => ({}));
      nodes.forEach((node) =>
        g.setNode(node.id, {
          width: node.size.width || 150,
          height: node.size.height || 50,
        })
      );
      links.forEach((link) =>
        g.setEdge(link.sourceNodeId!, link.targetNodeId!, {}, link.id)
      );
      dagre.layout(g);

      nodes.forEach((node) => {
        const expected = g.node(node.id);
        const actual = result.nodePositions.get(node.id)!;
        expect(actual.x).toBeCloseTo(expected.x - (expected.width || 0) / 2, 6);
        expect(actual.y).toBeCloseTo(expected.y - (expected.height || 0) / 2, 6);
      });
    });
  });

  describe('determinism', () => {
    it('same input twice -> identical fast-path positions', async () => {
      const build = () => {
        const nodes: NodeModel[] = [];
        const links: LinkModel[] = [];
        for (let i = 0; i < 500; i++) {
          nodes.push(mkNode(`n${i}`));
          if (i > 0) links.push(mkLink(`n${i - 1}`, `n${i}`));
          if (i >= 4 && i % 4 === 0) links.push(mkLink(`n${i - 3}`, `n${i}`)); // sparse-DAG chords
        }
        return { nodes, links };
      };

      const a = await adapter.apply(build().nodes, build().links);
      const b = await adapter.apply(build().nodes, build().links);

      expect(a.metadata?.['deepFastPath']).toBe(true);
      expect(a.nodePositions.size).toBe(b.nodePositions.size);
      a.nodePositions.forEach((pos, id) => {
        const other = b.nodePositions.get(id)!;
        expect(other.x).toBe(pos.x);
        expect(other.y).toBe(pos.y);
      });
    });
  });
});
