// Wave 7 — Card 7b follow-up: the auto-selector must SCALE.
//
// THE DEFECT (measured live, fixed viewport): `engine.layout()` — the zero-config
// path — took 16s at THREE HUNDRED nodes and never returned at 900 or 2,000. The
// bake-off runs EVERY candidate engine on the full graph, so its runtime is the
// SUM of the field, and the field contained engines that are seconds-to-minutes
// at scale. Root cause, from per-candidate instrumentation in this spec's
// development (times on the dev machine):
//
//   • elk:stress — 33,000ms at a 300-node chain, in EVERY bake-off unconditionally.
//   • dagre      — unbounded at a 2,000-rank chain (depth pathology).
//   • layered    — 5.3s at a 2,000-node tree, unbounded at a 2,000-node sparse
//                  DAG (rank-WIDTH pathology: ~1,000-node ranks).
//   • the classic quality metrics are O(n²)/O(m²): 1.2s+ per candidate at n=2,000.
//
// THE FIX: above BAKEOFF_NODE_LIMIT the graph is classified structurally
// (tree / DAG rank geometry / cyclic) and ONE engine that is measured-fast for
// that structure runs directly; quality for the report is scored on a bounded
// deterministic sample. Below the limit the bake-off is unchanged — and
// elk:stress is gated out of it above STRESS_NODE_LIMIT.
//
// The wall-clock caps here are GENEROUS (5s for what took 16-33s, 3s for what
// never returned); the sharp assertions are behavioural — which engine got
// picked, that exactly one engine ran, and that the choice is deterministic.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { createDefaultLayoutRegistry } from './layout-registry';
import {
  analyseGraphShape,
  buildCandidates,
  estimateLayering,
  pickEngineForScale,
  BAKEOFF_NODE_LIMIT,
  type AutoLayoutResult,
} from './layout-auto-select';

jest.setTimeout(120000);

// ---------------------------------------------------------------------------
// Graph builders — the pathological shapes from the live probes.
// ---------------------------------------------------------------------------

function makeNode(id: string, w = 100, h = 60): NodeModel {
  const node = new NodeModel({ id, type: 'default', position: { x: 0, y: 0 } });
  node.setSize(w, h);
  return node;
}

function connect(diagram: DiagramModel, id: string, from: string, to: string): LinkModel {
  const link = new LinkModel(`${id}-sp`, `${id}-tp`);
  (link as any).id = id;
  link.sourceNodeId = from;
  link.targetNodeId = to;
  diagram.addLink(link);
  return link;
}

const pad = (i: number) => String(i).padStart(5, '0');

/** n(i-1) -> n(i): the deep-rank pathology (and, structurally, a tree). */
function chain(n: number): DiagramModel {
  const d = new DiagramModel();
  for (let i = 0; i < n; i++) d.addNode(makeNode(`n${pad(i)}`));
  for (let i = 1; i < n; i++) connect(d, `l${pad(i)}`, `n${pad(i - 1)}`, `n${pad(i)}`);
  return d;
}

/** Binary tree n((i-1)>>1) -> n(i): shallow and VERY wide at the leaves. */
function tree(n: number): DiagramModel {
  const d = new DiagramModel();
  for (let i = 0; i < n; i++) d.addNode(makeNode(`n${pad(i)}`));
  for (let i = 1; i < n; i++) connect(d, `l${pad(i)}`, `n${pad((i - 1) >> 1)}`, `n${pad(i)}`);
  return d;
}

/** R×C grid with right+down edges: a DAG with narrow ranks. */
function mesh(rows: number, cols: number): DiagramModel {
  const d = new DiagramModel();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) d.addNode(makeNode(`n${pad(r * cols + c)}`));
  let l = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols)
        connect(d, `l${pad(l++)}`, `n${pad(r * cols + c)}`, `n${pad(r * cols + c + 1)}`);
      if (r + 1 < rows)
        connect(d, `l${pad(l++)}`, `n${pad(r * cols + c)}`, `n${pad((r + 1) * cols + c)}`);
    }
  return d;
}

/** Tree plus an extra edge n(i-3)->n(i) every 4th node: wide-rank sparse DAG. */
function sparseDag(n: number): DiagramModel {
  const d = tree(n);
  let l = 10000;
  for (let i = 4; i < n; i += 4) connect(d, `l${pad(l++)}`, `n${pad(i - 3)}`, `n${pad(i)}`);
  return d;
}

/** Chain with the loop closed: a large CYCLIC graph. */
function ring(n: number): DiagramModel {
  const d = chain(n);
  connect(d, `l${pad(99999)}`, `n${pad(n - 1)}`, `n${pad(0)}`);
  return d;
}

async function runAuto(diagram: DiagramModel): Promise<{ result: AutoLayoutResult; ms: number }> {
  const registry = createDefaultLayoutRegistry();
  const t0 = Date.now();
  const result = (await registry.get('auto')!.apply(diagram, { seed: 42 })) as AutoLayoutResult;
  return { result, ms: Date.now() - t0 };
}

function expectFinitePositions(result: AutoLayoutResult, n: number): void {
  expect(result.nodePositions.size).toBe(n);
  for (const p of result.nodePositions.values()) {
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Structural classification (pure, fast)
// ---------------------------------------------------------------------------

describe('estimateLayering — the rank geometry that predicts engine pathologies', () => {
  it('sees a chain as maximally deep and width-1', () => {
    const d = chain(50);
    const { depth, maxWidth } = estimateLayering(d.getNodes(), d.getLinks());
    expect(depth).toBe(50);
    expect(maxWidth).toBe(1);
  });

  it('sees a binary tree as shallow and wide', () => {
    const d = tree(15); // perfect binary tree: 4 levels, 8 leaves
    const { depth, maxWidth } = estimateLayering(d.getNodes(), d.getLinks());
    expect(depth).toBe(4);
    expect(maxWidth).toBe(8);
  });

  it('sees an R×C mesh as (R+C-1) deep with narrow diagonal ranks', () => {
    const d = mesh(4, 6);
    const { depth, maxWidth } = estimateLayering(d.getNodes(), d.getLinks());
    expect(depth).toBe(9); // ranks are the anti-diagonals: r + c
    expect(maxWidth).toBe(4); // min(R, C)
  });
});

describe('pickEngineForScale — structure decides, and the measured-fast engine wins', () => {
  const registry = createDefaultLayoutRegistry();

  const planFor = (d: DiagramModel) => {
    const nodes = [...d.getNodes()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const links = d.getLinks();
    return pickEngineForScale(analyseGraphShape(nodes, links), nodes, links, registry)!;
  };

  it('picks the portfolio tree layout for a tree', () => {
    expect(planFor(tree(500)).candidates[0].id).toBe('tree');
  });

  it('picks layered for a narrow-rank DAG (mesh)', () => {
    // A mesh is NOT a tree (in-degree 2), IS a DAG, and its ranks are narrow —
    // exactly where layered is measured fast and dagre is measured slow.
    expect(planFor(mesh(30, 30)).candidates[0].id).toBe('layered:TB');
  });

  it('picks dagre for a wide, shallow DAG (the sparse DAG that kills layered)', () => {
    expect(planFor(sparseDag(2000)).candidates[0].id).toBe('dagre:TB');
  });

  it('picks force for a large cyclic graph', () => {
    expect(planFor(ring(500)).candidates[0].id).toBe('force');
  });

  it('bumps port-aware ELK to the front when nodes declare ports', () => {
    const d = mesh(20, 20);
    const first = d.getNodes()[0];
    const port = new PortModel({ id: 'p0', type: 'output', side: 'right' });
    port.nodeId = first.id;
    first.addPort(port);
    expect(planFor(d).candidates[0].id).toBe('elk:layered:DOWN');
  });

  it('only ever proposes registered engines', () => {
    for (const build of [() => tree(300), () => mesh(20, 20), () => ring(300)]) {
      for (const c of planFor(build()).candidates) {
        expect(registry.has(c.name)).toBe(true);
      }
    }
  });
});

describe('bake-off candidate gating — no engine whose cost model predicts seconds', () => {
  const registry = createDefaultLayoutRegistry();

  it('excludes elk:stress above the stress limit (33s at n=300, measured)', () => {
    const d = chain(150);
    const shape = analyseGraphShape(d.getNodes(), d.getLinks());
    const ids = buildCandidates(shape, registry).map((c) => c.id);
    expect(ids).not.toContain('elk:stress');
  });

  it('still includes elk:stress for small graphs, so small-graph behaviour is intact', () => {
    const d = chain(20);
    const shape = analyseGraphShape(d.getNodes(), d.getLinks());
    const ids = buildCandidates(shape, registry).map((c) => c.id);
    expect(ids).toContain('elk:stress');
  });
});

// ---------------------------------------------------------------------------
// The live pathologies, as regression tests (generous CI caps)
// ---------------------------------------------------------------------------

describe('auto at scale — the graphs that hung it, with generous CI caps', () => {
  it('chain @ 300: was 16,000ms+, must now complete well under 5s and run ONE engine', async () => {
    const { result, ms } = await runAuto(chain(300));

    expect(ms).toBeLessThan(5000);
    // Bounded work, not just a faster stopwatch: exactly one engine ran.
    expect(result.selection.candidates).toHaveLength(1);
    // A chain is structurally a tree; the O(n) tree layout is the measured pick.
    expect(result.selection.chosen).toBe('tree');
    expect(result.metadata?.['autoSelected']).toBe('tree');
    expect(result.selection.reason).toMatch(/without a bake-off/);
    expectFinitePositions(result, 300);
  });

  it('mesh @ 900: was killed >22s, must complete < 1s and pick layered', async () => {
    const { result, ms } = await runAuto(mesh(30, 30));

    expect(ms).toBeLessThan(1000);
    expect(result.selection.chosen).toBe('layered:TB');
    expect(result.selection.candidates).toHaveLength(1);
    expectFinitePositions(result, 900);

    // A 2D graph must spread in 2D: a 30×30 mesh laid out sanely has real extent
    // on BOTH axes (this is the wedge/cigar assertion, applied to auto's pick).
    const xs = [...result.nodePositions.values()].map((p) => p.x);
    const ys = [...result.nodePositions.values()].map((p) => p.y);
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    expect(Math.min(xRange, yRange)).toBeGreaterThan(500);
    expect(Math.max(xRange, yRange) / Math.min(xRange, yRange)).toBeLessThan(20);
  });

  it('tree @ 2000: must complete < 3s via the O(n) tree layout', async () => {
    const { result, ms } = await runAuto(tree(2000));

    expect(ms).toBeLessThan(3000);
    expect(result.selection.chosen).toBe('tree');
    expectFinitePositions(result, 2000);
  });

  it('chain @ 2000: the shape that kills dagre must complete < 3s', async () => {
    const { result, ms } = await runAuto(chain(2000));

    expect(ms).toBeLessThan(3000);
    // Structurally a tree — and crucially NOT dagre (unbounded at 2,000 ranks).
    expect(result.selection.chosen).toBe('tree');
    expectFinitePositions(result, 2000);
  });

  it('sparse DAG @ 2000: the shape that kills layered must complete < 3s via dagre', async () => {
    const { result, ms } = await runAuto(sparseDag(2000));

    expect(ms).toBeLessThan(3000);
    expect(result.selection.chosen).toBe('dagre:TB');
    expectFinitePositions(result, 2000);
  });

  it('mesh @ 2025: must complete < 3s', async () => {
    const { result, ms } = await runAuto(mesh(45, 45));

    expect(ms).toBeLessThan(3000);
    expect(result.selection.chosen).toBe('layered:TB');
    expectFinitePositions(result, 2025);
  });
});

// ---------------------------------------------------------------------------
// The two properties the card promised, preserved at scale
// ---------------------------------------------------------------------------

describe('auto at scale — determinism and an honest report', () => {
  it('same graph + same seed => same pick and byte-identical coordinates', async () => {
    const a = await runAuto(mesh(30, 30));
    const b = await runAuto(mesh(30, 30));

    expect(b.result.selection.chosen).toBe(a.result.selection.chosen);
    expect([...b.result.nodePositions.entries()]).toEqual([
      ...a.result.nodePositions.entries(),
    ]);
  });

  it('still SHOWS ITS WORKING: the direct pick is scored and explained', async () => {
    const { result } = await runAuto(tree(500));
    const [winner] = result.selection.candidates;

    expect(result.selection.reason).toContain(String(BAKEOFF_NODE_LIMIT));
    expect(result.selection.shape.isTree).toBe(true);
    expect(winner.score).toBeGreaterThan(0);
    expect(winner.quality.metrics.edgeCrossings).toBeDefined();
    expect(winner.error).toBeUndefined();
  });

  it('below the limit the full bake-off still runs, unchanged', async () => {
    const { result } = await runAuto(tree(40));

    // Multiple candidates measured — the pre-existing behaviour and its report.
    expect(result.selection.candidates.length).toBeGreaterThan(1);
    expect(result.selection.chosen).toBe(result.selection.candidates[0].id);
    expectFinitePositions(result, 40);
  });
});
