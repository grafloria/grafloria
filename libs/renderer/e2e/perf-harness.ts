// Wave 8 (Performance & scale) — the benchmark harness.
//
// FIRST, BEFORE ANY OPTIMISATION. Four agents are about to claim speedups; without
// a baseline measured on the real engine in a real browser, every one of those
// claims is unfalsifiable. This file exists so they are not.
//
// It measures what a USER feels, not what is convenient to instrument:
//
//   BUILD      — constructing a 1k/5k/10k-node model. (Not the interesting number,
//                but it bounds everything else, and a quadratic here is invisible
//                in a 50-node demo and fatal in production.)
//   FIRST PAINT— the first render() of a cold scene. This is "I opened the file".
//   STEADY PAN — frame times while panning. This is "I am using the tool", and it
//                is the number the 60fps claim lives or dies on (16.7ms budget).
//   ZOOM OUT   — a render at low zoom, where culling and LOD are supposed to save
//                us. If this is slower than the near view, the LOD tiers are a lie.
//   ONE DRAG   — re-render after moving ONE node. THE headline number for this
//                capability: the whole premise of "only touch what changed" is that
//                this is O(changed), not O(scene). Today the renderer re-routes
//                EVERY visible link on EVERY frame, so we expect this to be flat in
//                the scene size — and that is precisely the bug.
//
// The numbers are reported, not asserted, on the first run: this run establishes the
// baseline. `perf-run.mjs` then gates against budgets so a regression fails CI.

import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { SVGRenderer, VNodePatcher } from '@grafloria/renderer';

export interface PerfSample {
  scenario: string;
  nodes: number;
  links: number;
  /** milliseconds */
  ms: number;
  /** for multi-frame scenarios: the worst frame, which is what a user actually notices */
  worstMs?: number;
  /** frames measured */
  frames?: number;
}

const results: PerfSample[] = [];
(globalThis as unknown as { PERF: PerfSample[] }).PERF = results;

/**
 * A grid of nodes wired into a chain — dense enough to be honest, regular enough to be
 * reproducible.
 *
 * Exported so the lazy-mount benchmark (`lazy-harness.ts`) measures the SAME scene this
 * baseline was taken on. A "before/after" across two different scene builders is not a
 * comparison, it is a coincidence.
 */
export function buildScene(nodeCount: number): { engine: DiagramEngine; diagram: DiagramModel } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram(`perf-${nodeCount}`)!;

  const cols = Math.ceil(Math.sqrt(nodeCount));
  const nodes: NodeModel[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const node = new NodeModel({
      type: 'basic',
      position: { x: (i % cols) * 220, y: Math.floor(i / cols) * 140 },
      size: { width: 140, height: 70 },
    });
    (node as unknown as { id: string }).id = `n${i}`;
    node.addPort(new PortModel({ id: `n${i}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `n${i}-in`, type: 'input', side: 'left' }));
    node.setMetadata('label', `Node ${i}`);
    diagram.addNode(node);
    nodes.push(node);
  }

  // one link per node (to its right neighbour, wrapping rows) — a realistic edge
  // density, and enough that link work dominates if it is O(scene)
  for (let i = 0; i + 1 < nodes.length; i++) {
    const link = new LinkModel(`n${i}-out`, `n${i + 1}-in`, 'orthogonal');
    (link as unknown as { id: string }).id = `l${i}`;
    diagram.addLink(link);
  }

  return { engine, diagram };
}

const now = () => performance.now();

/** Median is the honest centre for frame times; the mean is dragged by one GC pause. */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

function record(sample: PerfSample): void {
  results.push(sample);
}

export function runPerfSuite(container: HTMLElement, counts: number[]): PerfSample[] {
  for (const count of counts) {
    // ---------------------------------------------------------------- build
    const t0 = now();
    const { engine, diagram } = buildScene(count);
    const buildMs = now() - t0;
    const linkCount = diagram.getLinks().length;
    record({ scenario: 'build-model', nodes: count, links: linkCount, ms: buildMs });

    const host = document.createElement('div');
    container.appendChild(host);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.appendChild(svg);

    const renderer = new SVGRenderer(engine, {});
    const patcher = new VNodePatcher();

    // A viewport that shows a realistic slice — roughly a screenful.
    const viewport = { x: 0, y: 0, width: 1600, height: 900 };

    // ---------------------------------------------------------- first paint
    const t1 = now();
    const first = renderer.render(viewport, 1) as never;
    patcher.reconcile(svg as unknown as Element, first);
    record({ scenario: 'first-paint', nodes: count, links: linkCount, ms: now() - t1 });

    // ------------------------------------------------------------ steady pan
    // 30 frames of panning: the number the 60fps claim lives on (16.7ms budget).
    const panFrames: number[] = [];
    for (let f = 0; f < 30; f++) {
      const vp = { ...viewport, x: viewport.x + f * 40, y: viewport.y + f * 12 };
      const t = now();
      const vnode = renderer.render(vp, 1) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      panFrames.push(now() - t);
    }
    record({
      scenario: 'pan-frame',
      nodes: count,
      links: linkCount,
      ms: median(panFrames),
      worstMs: Math.max(...panFrames),
      frames: panFrames.length,
    });

    // -------------------------------------------------------------- zoom out
    // At 0.25 zoom the viewport covers 16x the area: culling and LOD are supposed
    // to keep this cheap. If it is SLOWER than the near view, the LOD tiers are a
    // lie and this number says so.
    const zoomFrames: number[] = [];
    for (let f = 0; f < 10; f++) {
      const t = now();
      const vnode = renderer.render({ x: 0, y: 0, width: 6400, height: 3600 }, 0.25) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      zoomFrames.push(now() - t);
    }
    record({
      scenario: 'zoom-out-frame',
      nodes: count,
      links: linkCount,
      ms: median(zoomFrames),
      worstMs: Math.max(...zoomFrames),
      frames: zoomFrames.length,
    });

    // ------------------------------------------------------------- one drag
    // THE headline number. Move ONE node and re-render. "Only touch what changed"
    // means this should be roughly constant in the scene size. If it scales with
    // the node count, the renderer is doing O(scene) work for an O(1) edit — which
    // is exactly what a per-frame re-route of every visible link would produce.
    const dragFrames: number[] = [];
    const victim = diagram.getNode('n0')!;
    for (let f = 0; f < 20; f++) {
      victim.setPosition(victim.position.x + 2, victim.position.y + 1);
      const t = now();
      const vnode = renderer.render(viewport, 1) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      dragFrames.push(now() - t);
    }
    record({
      scenario: 'one-node-drag-frame',
      nodes: count,
      links: linkCount,
      ms: median(dragFrames),
      worstMs: Math.max(...dragFrames),
      frames: dragFrames.length,
    });

    // ------------------------------------------------------------ idle frame
    // Nothing changed at all. A renderer that "only touches what changed" should do
    // almost nothing here. This is the cleanest possible measure of fixed per-frame
    // overhead — the work the scene costs you for existing.
    const idleFrames: number[] = [];
    for (let f = 0; f < 20; f++) {
      const t = now();
      const vnode = renderer.render(viewport, 1) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      idleFrames.push(now() - t);
    }
    record({
      scenario: 'idle-frame',
      nodes: count,
      links: linkCount,
      ms: median(idleFrames),
      worstMs: Math.max(...idleFrames),
      frames: idleFrames.length,
    });

    renderer.dispose();
    engine.destroy();
    host.remove();
  }

  return results;
}
