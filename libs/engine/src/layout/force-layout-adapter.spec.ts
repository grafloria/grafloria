// wave: layout-cigar — force must spread in TWO dimensions, at every scale.
//
// THE MEASURED DEFECT THIS PINS DOWN. `engine.layout('force')` collapsed every
// graph — trees, chains, meshes, at 300 and at 2000 nodes — into a horizontal
// wedge: x-range enormous, y-range tiny. The physics was innocent (its raw
// output measured aspect ~1.0); the collapse was manufactured downstream. The
// simulation lays out dimensionless points whose default-sized BOXES overlap
// massively, and overlap-removal.ts resolves every box overlap by pushing
// strictly along X — measured on a 15x15 mesh, an aspect-1.003 force layout
// (685x683) left the wrapper at aspect 6.68 (4442x665). Two compounding causes
// inside the adapter: initial positions seeded into a FIXED ±250 square (2000
// nodes cannot expand to box density within the cooling schedule's ~2000px
// travel budget), and gravity growing linearly with distance forever (crushes
// any large graph into an overlapping blob no matter what).
//
// The fix, all inside force-layout-adapter.ts: density-correct sunflower
// initialisation, box-gap (size-aware) repulsion and spring rest lengths,
// saturated gravity, and an axis-symmetric residual-overlap cleanup at
// snapshot time (uniform zoom + local pair separation) so the x-only
// downstream sweep has nothing to do.
//
// These tests exercise BOTH the raw adapter and the real
// packing-wrapper path that `engine.layout('force')` takes.

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { ForceLayoutAdapter } from './force-layout-adapter';
import { layoutWithComponentPacking } from './component-packing';
import { forceLayout } from './portfolio-layouts';
import { isSteppable } from './steppable-layout';
import { packAdapter } from './layout-registry';

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

/** R×C grid with right+down edges — the shape the cigar was measured on. */
function mesh(rows: number, cols: number) {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) nodes.push(makeNode(`n${r * cols + c}`));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) links.push(makeLink(`n${i}`, `n${i + 1}`));
      if (r + 1 < rows) links.push(makeLink(`n${i}`, `n${i + cols}`));
    }
  return { nodes, links };
}

/** A deterministic "random" tree: node i hangs off a pseudo-random earlier node. */
function randomTree(n: number) {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push(makeNode(`n${i}`));
    if (i > 0) {
      const parent = ((i * 48271) % 65537) % i;
      links.push(makeLink(`n${parent}`, `n${i}`));
    }
  }
  return { nodes, links };
}

function spreadStats(positions: Iterable<{ x: number; y: number }>) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of positions) {
    xs.push(p.x);
    ys.push(p.y);
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const variance = (a: number[]) => {
    const m = mean(a);
    return mean(a.map(v => (v - m) * (v - m)));
  };
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return { width, height, aspect: width / height, varX: variance(xs), varY: variance(ys) };
}

/** The 2D-spread contract: neither axis degenerate, neither axis dominant. */
function expect2D(s: ReturnType<typeof spreadStats>) {
  expect(s.aspect).toBeGreaterThanOrEqual(0.25);
  expect(s.aspect).toBeLessThanOrEqual(4.0);
  expect(s.varX).toBeGreaterThan(0);
  expect(s.varY).toBeGreaterThan(0);
  expect(s.varX / s.varY).toBeGreaterThanOrEqual(0.1);
  expect(s.varX / s.varY).toBeLessThanOrEqual(10);
}

/** Count strictly intersecting node boxes (the trigger of the x-only sweep). */
function countBoxOverlaps(
  nodes: NodeModel[],
  positions: Map<string, { x: number; y: number }>
): number {
  const boxes = nodes.map(n => {
    const p = positions.get(n.id)!;
    return { x: p.x, y: p.y, w: n.size!.width, h: n.size!.height };
  });
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps++;
    }
  return overlaps;
}

describe('force layout spreads in 2D (the cigar regression)', () => {
  const adapter = new ForceLayoutAdapter();

  it('15x15 mesh through the REAL packing path keeps a ~square aspect', async () => {
    // Pre-fix this measured aspect 6.68 — pure horizontal wedge.
    const { nodes, links } = mesh(15, 15);
    const result = await layoutWithComponentPacking('force', forceLayout, nodes, links, {
      seed: 42,
    });
    expect2D(spreadStats(result.nodePositions.values()));
  });

  it('200-node random tree through the REAL packing path keeps a ~square aspect', async () => {
    const { nodes, links } = randomTree(200);
    const result = await layoutWithComponentPacking('force', forceLayout, nodes, links, {
      seed: 42,
    });
    expect2D(spreadStats(result.nodePositions.values()));
  });

  it('900-node mesh stays 2D and completes fast (was a wedge; keep < 6s CI-safe)', async () => {
    const { nodes, links } = mesh(30, 30);
    const started = Date.now();
    const result = await adapter.apply(nodes, links, { seed: 42 });
    expect(Date.now() - started).toBeLessThan(6000);
    expect2D(spreadStats(result.nodePositions.values()));
    // Bounded work: the cooling schedule, not graph size, ends the run.
    expect(result.metadata?.['iterations']).toBeLessThanOrEqual(300);
  });

  it('hands over ZERO strictly-overlapping boxes, so the x-only sweep is a no-op', async () => {
    // This is the property that kills the cigar at its root: whatever box
    // overlap survives the physics is resolved AXIS-SYMMETRICALLY inside the
    // adapter (zoom + local pair pushes), never left for overlap-removal.ts
    // to shove into pure x-spread.
    const { nodes, links } = mesh(15, 15);
    const result = await adapter.apply(nodes, links, { seed: 42 });
    expect(countBoxOverlaps(nodes, result.nodePositions)).toBe(0);

    const t = randomTree(200);
    const treeResult = await adapter.apply(t.nodes, t.links, { seed: 42 });
    expect(countBoxOverlaps(t.nodes, treeResult.nodePositions)).toBe(0);
  });

  it('keeps the graph structure: linked pairs sit closer than the average pair', async () => {
    // Guards against "fixing" overlap by scattering nodes arbitrarily: edges
    // must still pull their endpoints together relative to the field.
    const { nodes, links } = randomTree(80);
    const result = await adapter.apply(nodes, links, { seed: 42 });
    const pos = (id: string) => result.nodePositions.get(id)!;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    let linked = 0;
    for (const l of links) linked += dist(pos(l.sourceNodeId!), pos(l.targetNodeId!));
    linked /= links.length;

    let all = 0;
    let pairs = 0;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        all += dist(pos(nodes[i].id), pos(nodes[j].id));
        pairs++;
      }
    all /= pairs;

    expect(linked).toBeLessThan(all * 0.8);
  });
});

describe('force layout determinism (Card 0 contract survives the fix)', () => {
  const adapter = new ForceLayoutAdapter();

  it('same seed ⇒ byte-identical positions; different seed ⇒ different but still 2D', async () => {
    const a = await adapter.apply(mesh(8, 8).nodes, mesh(8, 8).links, { seed: 7 });
    const b = await adapter.apply(mesh(8, 8).nodes, mesh(8, 8).links, { seed: 7 });
    expect([...a.nodePositions.entries()]).toEqual([...b.nodePositions.entries()]);

    const c = await adapter.apply(mesh(8, 8).nodes, mesh(8, 8).links, { seed: 99 });
    const moved = [...a.nodePositions.entries()].some(([id, p]) => {
      const q = c.nodePositions.get(id)!;
      return p.x !== q.x || p.y !== q.y;
    });
    expect(moved).toBe(true);
    expect2D(spreadStats(c.nodePositions.values()));
  });

  it('honours linkDistance: looser edges ⇒ larger picture', async () => {
    const tight = await adapter.apply(mesh(6, 6).nodes, mesh(6, 6).links, {
      seed: 1,
      linkDistance: 40,
    });
    const loose = await adapter.apply(mesh(6, 6).nodes, mesh(6, 6).links, {
      seed: 1,
      linkDistance: 400,
    });
    const extent = (r: typeof tight) => r.bounds.width + r.bounds.height;
    expect(extent(loose)).toBeGreaterThan(extent(tight));
  });
});

describe('force layout steppable contract (host/worker path)', () => {
  const adapter = new ForceLayoutAdapter();

  it('is steppable, and stays steppable through packAdapter (prototype delegation)', () => {
    expect(isSteppable(adapter)).toBe(true);
    expect(isSteppable(packAdapter(adapter))).toBe(true);
  });

  it('snapshot() is valid mid-run: every node placed, all coordinates finite', () => {
    const { nodes, links } = mesh(10, 10);
    const run = adapter.createRun(nodes, links, { seed: 42 });
    for (let i = 0; i < 5; i++) run.step();

    const snap = run.snapshot();
    expect(snap.nodePositions.size).toBe(nodes.length);
    for (const p of snap.nodePositions.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // ...and the run can continue after being observed
    expect(run.step()).toBe(true);
  });

  it('a pinned node is exactly where the constraint pinned it', async () => {
    const { nodes, links } = mesh(4, 4);
    const result = await adapter.apply(nodes, links, {
      seed: 42,
      constraints: {
        constraints: [{ type: 'pin', nodeId: 'n5', position: { x: 123, y: -456 } }],
      },
    } as never);
    expect(result.nodePositions.get('n5')).toEqual({ x: 123, y: -456 });
  });
});
