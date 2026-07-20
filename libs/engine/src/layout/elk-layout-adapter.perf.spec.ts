/**
 * ELK adapter — performance audit + no-regression guard.
 *
 * The live-probe defect table showed elk as CORRECT everywhere but the slowest
 * correct engine (~672ms @ 900-node mesh at a fixed viewport). This spec
 * (a) profiles where that time goes — translation vs the ELK algorithm itself
 *     vs result mapping — so the audit is empirical, not guessed;
 * (b) pins a generous completion cap for the 900-mesh so a future change that
 *     makes ELK pathological fails CI;
 * (c) pins determinism (two runs, identical positions) and a small-graph
 *     position snapshot so optimization work cannot silently change output.
 */

import ElkConstructor from 'elkjs/lib/elk.bundled';
import { ELKLayoutAdapter } from './elk-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { perfBudget } from './perf-budget';

/** R×C mesh with right+down edges — the probe's 900-node shape. */
function buildMesh(rows: number, cols: number) {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  const id = (r: number, c: number) => `n${r * cols + c}`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push(
        new NodeModel({
          id: id(r, c),
          type: 'layout-test',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 },
        })
      );
      if (c + 1 < cols) {
        const link = new LinkModel(`p${id(r, c)}`, `p${id(r, c + 1)}`);
        link.sourceNodeId = id(r, c);
        link.targetNodeId = id(r, c + 1);
        links.push(link);
      }
      if (r + 1 < rows) {
        const link = new LinkModel(`p${id(r, c)}`, `p${id(r + 1, c)}`);
        link.sourceNodeId = id(r, c);
        link.targetNodeId = id(r + 1, c);
        links.push(link);
      }
    }
  }
  return { nodes, links };
}

describe('ELKLayoutAdapter performance audit', () => {
  it('900-node mesh: profiles adapter overhead vs raw ELK, and completes under a generous cap', async () => {
    const adapter = new ELKLayoutAdapter();
    const { nodes, links } = buildMesh(30, 30);

    // Warm the lazy ELK engine (GWT module init) so we measure steady state,
    // the way the cached registry adapter behaves after its first layout.
    await adapter.apply(nodes.slice(0, 2), []);

    // --- adapter end-to-end ---
    const t0 = performance.now();
    const result = await adapter.apply(nodes, links);
    const adapterMs = performance.now() - t0;

    // --- raw ELK on the equivalent bare graph, same layoutOptions the adapter sends ---
    const elk = new ElkConstructor();
    const rawGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.edgeLabels.placement': 'CENTER',
        'elk.edgeLabels.inline': 'false',
        'elk.spacing.edgeLabel': '6',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '80',
      },
      children: nodes.map((n) => ({ id: n.id, width: 100, height: 50 })),
      edges: links.map((l) => ({
        id: l.id,
        sources: [l.sourceNodeId!],
        targets: [l.targetNodeId!],
      })),
    };
    await elk.layout(JSON.parse(JSON.stringify(rawGraph))); // warm this instance too
    const t1 = performance.now();
    await elk.layout(JSON.parse(JSON.stringify(rawGraph)));
    const rawMs = performance.now() - t1;

    // eslint-disable-next-line no-console
    console.log(
      `[elk-perf] 900-mesh: adapter=${adapterMs.toFixed(0)}ms raw-elk=${rawMs.toFixed(
        0
      )}ms translation+mapping overhead=${(adapterMs - rawMs).toFixed(0)}ms`
    );

    expect(result.nodePositions.size).toBe(900);
    // Generous CI-safe cap: live probe measured ~672ms; anything near this cap
    // means the adapter or elkjs went pathological.
    expect(adapterMs).toBeLessThan(perfBudget(10000));
    // The adapter's own translation + result mapping must stay a small fraction
    // of the run — the algorithm, not our plumbing, is allowed to be the cost.
    expect(adapterMs - rawMs).toBeLessThan(Math.max(500, rawMs));
  }, 60000);

  it('small-graph output is byte-identical to the pre-optimization adapter (snapshot)', async () => {
    // These numbers were captured from the adapter BEFORE the translation
    // optimizations (port grouping, single label-box pass) on elkjs 0.11.0.
    // The optimizations must not move a single node, port, or label box.
    const adapter = new ELKLayoutAdapter();

    const mk = (id: string) =>
      new NodeModel({
        id,
        type: 'layout-test',
        position: { x: 0, y: 0 },
        size: { width: 120, height: 60 },
      });
    const a = mk('a');
    const b = mk('b');
    const c = mk('c');
    const d = mk('d');
    const e = mk('e');

    // Declared (author) ports on two nodes exercise the port-aware path.
    a.addPort(new PortModel({ id: 'a-out', type: 'output', side: 'right', index: 0 }));
    b.addPort(new PortModel({ id: 'b-in', type: 'input', side: 'left', index: 0 }));
    b.addPort(new PortModel({ id: 'b-out', type: 'output', side: 'right', index: 1 }));

    const link = (s: NodeModel, t: NodeModel, sp?: string, tp?: string) => {
      const l = new LinkModel(sp ?? `p-${s.id}`, tp ?? `p-${t.id}`);
      l.sourceNodeId = s.id;
      l.targetNodeId = t.id;
      return l;
    };
    const l1 = link(a, b, 'a-out', 'b-in');
    const l2 = link(b, c, 'b-out');
    // A labelled edge exercises the label-aware path.
    l2.labels.push({ id: 'l2-label', text: 'transforms', position: 0.5, offset: { x: 0, y: 0 } });
    const links = [l1, l2, link(b, d), link(c, e), link(d, e)];

    const result = await adapter.apply([a, b, c, d, e], links);

    const expectPos = (id: string, x: number, y: number) => {
      const p = result.nodePositions.get(id)!;
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
    };
    expectPos('a', 12, 24.666666666666668);
    expectPos('b', 168, 24.666666666666668);
    expectPos('c', 420, 152);
    expectPos('d', 420, 12);
    expectPos('e', 560, 22);

    expect(result.metadata?.['portConstrainedNodes']).toBe(2);
    expect(result.metadata?.['labelledEdges']).toBe(1);
    expect(result.bounds).toEqual({ x: 12, y: 12, width: 668, height: 200 });
    expect(result.routing!.edgeRoutes.size).toBe(5);

    const expectPort = (id: string, x: number, y: number, side: string) => {
      const p = result.routing!.portPositions.get(id)!;
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
      expect(p.side).toBe(side);
    };
    expectPort('a-out', 132, 50.66666666666667, 'right');
    expectPort('b-in', 160, 50.66666666666667, 'left');
    expectPort('b-out', 288, 59.33333333333333, 'right');

    // The labelled edge's reservation survives into the routing hints.
    expect(result.routing!.labelSpace.get(l2.id)).toBeDefined();
    expect(result.routing!.labelSpace.size).toBe(1);
  }, 30000);

  it('port-heavy graph: translation stays linear (900 nodes with declared ports complete fast)', async () => {
    // Guards the O(nodes × ports) translation hazard: every node declares two
    // ports, so the old per-node `portInfos.filter` would have run 900 × 1800
    // = 1.6M predicate calls before ELK even started.
    const adapter = new ELKLayoutAdapter();
    const { nodes, links } = buildMesh(30, 30);
    for (const n of nodes) {
      n.addPort(new PortModel({ id: `${n.id}-in`, type: 'input', side: 'left', index: 0 }));
      n.addPort(new PortModel({ id: `${n.id}-out`, type: 'output', side: 'right', index: 1 }));
    }

    await adapter.apply(nodes.slice(0, 2), []); // warm the engine

    const t0 = performance.now();
    const result = await adapter.apply(nodes, links);
    const ms = performance.now() - t0;

    expect(result.nodePositions.size).toBe(900);
    expect(result.metadata?.['portConstrainedNodes']).toBe(900);
    // Generous CI cap — port constraints make ELK itself work harder, but the
    // run must stay the same order of magnitude as the unported mesh.
    expect(ms).toBeLessThan(perfBudget(15000));
  }, 60000);

  it('is deterministic: two runs on the same graph produce identical positions', async () => {
    const adapter = new ELKLayoutAdapter();
    const { nodes, links } = buildMesh(8, 8);

    const a = await adapter.apply(nodes, links);
    const b = await adapter.apply(nodes, links);

    expect(a.nodePositions.size).toBe(b.nodePositions.size);
    for (const [id, pos] of a.nodePositions) {
      expect(b.nodePositions.get(id)).toEqual(pos);
    }
  }, 30000);
});
