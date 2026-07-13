// Wave 8 — Card 5: what the tier handoff is actually WORTH.
//
// The premise of a canvas far-zoom tier is that at high element counts the CONSUMER of
// the VNode tree — the thing that turns it into pixels — is the bottleneck, and that
// swapping the DOM for a canvas therefore buys back the frame.
//
// That premise is testable, so it gets tested rather than assumed. This splits a
// zoomed-out frame into its two halves and times them separately:
//
//   PRODUCER  SVGRenderer.render() — cull, route, style, build the VNode tree.
//             Identical in both tiers. Canvas mode calls the SAME producer.
//   CONSUMER  VNodePatcher.reconcile() -> SVG DOM   vs   CanvasRenderer -> pixels.
//             This is the ONLY thing a tier handoff changes.
//
// If the producer dwarfs the consumer, then a canvas handoff — however well built — can
// only ever shave the smaller number, and the honest thing to do is say so and go fix
// the producer instead.

import { DiagramEngine, NodeModel, PortModel } from '@grafloria/engine';
import { SVGRenderer, VNodePatcher, CanvasRenderer } from '@grafloria/renderer';
import { buildScene } from './perf-harness';

/**
 * The same grid, with NO links.
 *
 * Not a toy — an isolation. On the linked scene the router costs 30+ SECONDS and the
 * consumers cost tens of milliseconds, so "canvas paint = full frame − producer" is a
 * subtraction of two huge, high-variance numbers and it produces noise (the first run of
 * this benchmark reported a canvas frame FASTER than the producer it contains, which is
 * impossible, and was the tell).
 *
 * Strip the links and the producer becomes cheap while the VNode count stays enormous —
 * which isolates the one question Card 5's premise actually rests on: at N VNodes, which
 * CONSUMER is faster?
 */
function buildNodesOnlyScene(nodeCount: number): { engine: DiagramEngine } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram(`tier-${nodeCount}`)!;
  const cols = Math.ceil(Math.sqrt(nodeCount));

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
  }
  return { engine };
}

export interface TierSample {
  nodes: number;
  zoom: number;
  /** false = the links-free isolation scene (cheap producer, huge VNode count). */
  withLinks: boolean;
  /** Elements the frame actually draws. */
  visibleNodes: number;
  visibleLinks: number;
  vnodes: number;
  /** Build the VNode tree. Paid identically by BOTH tiers. */
  producerMs: number;
  /** Consumer A, cold: VNode tree -> a FRESH SVG DOM. What "first paint" pays. */
  svgMountMs: number;
  /** Consumer A, steady: the same tree reconciled again. What a repeat frame pays. */
  svgRepatchMs: number;
  /** Consumer B: VNode tree -> canvas pixels (incl. the colour-keyed hit canvas). */
  canvasPaintMs: number;
  /** Whole steady-state frame, each way. */
  svgFrameMs: number;
  canvasFrameMs: number;
  /** The consumer's share of a steady SVG frame — the handoff's entire addressable surface. */
  consumerShareOfFrame: number;
}

function countVNodes(tree: unknown): number {
  let n = 0;
  const walk = (v: any) => {
    if (!v || typeof v !== 'object') return;
    n++;
    for (const c of v.children ?? []) walk(c);
  };
  walk(tree);
  return n;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

/**
 * One scene, at a zoom that puts (almost) the whole diagram on screen — the far/low-LOD
 * tier canvas is supposed to own.
 */
export function runTierScene(
  container: HTMLElement,
  count: number,
  zoom: number,
  withLinks = true
): TierSample {
  const { engine } = withLinks ? buildScene(count) : buildNodesOnlyScene(count);

  const host = document.createElement('div');
  container.appendChild(host);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.appendChild(svg);

  const producer = new SVGRenderer(engine, {});
  const patcher = new VNodePatcher();

  // A viewport that, at this zoom, covers the whole grid.
  const viewport = { x: 0, y: 0, width: 6400, height: 3600 };

  // Warm both paths once: we are comparing steady-state consumers, and the first call
  // through anything in this stack pays one-time costs that belong to neither tier.
  patcher.reconcile(svg as unknown as Element, producer.render(viewport, zoom) as never);

  // ---- PRODUCER (paid by both tiers, identically) ----------------------------
  const producerRuns: number[] = [];
  let tree: unknown = null;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    tree = producer.render(viewport, zoom);
    producerRuns.push(performance.now() - t);
  }
  const producerMs = median(producerRuns);

  const metrics = producer.getPerformanceMetrics();

  // ---- CONSUMER A: SVG DOM ----------------------------------------------------
  //
  // TWO numbers, because the patcher has two wildly different jobs and conflating them
  // is how you talk yourself into a canvas rewrite you do not need:
  //
  //   MOUNT    building the DOM from nothing. What first paint pays.
  //   REPATCH  reconciling a tree against the DOM already on screen. What every frame
  //            after that pays — and the patcher DIFFS, so an unchanged tree costs
  //            almost nothing.
  //
  // (The first version of this benchmark reconciled the same tree three times into the
  // same <svg> and reported "svg patch: 0.0ms". That was not the DOM being fast, it was
  // me measuring a no-op.)
  const svgMountRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const fresh = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.appendChild(fresh);
    const freshPatcher = new VNodePatcher();
    const t = performance.now();
    freshPatcher.reconcile(fresh as unknown as Element, tree as never);
    svgMountRuns.push(performance.now() - t);
    fresh.remove();
  }
  const svgMountMs = median(svgMountRuns);

  const svgRepatchRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    patcher.reconcile(svg as unknown as Element, producer.render(viewport, zoom) as never);
    svgRepatchRuns.push(performance.now() - t);
  }
  // The producer ran inside that timing, so take it back out — we are timing the CONSUMER.
  const svgRepatchMs = Math.max(0, median(svgRepatchRuns) - producerMs);

  // ---- CONSUMER B: canvas pixels ----------------------------------------------
  // Driven through the real CanvasRenderer on the SHARED producer, exactly as the tier
  // handoff drives it, WITH dirty regions on — canvas's best case, so the comparison is
  // not rigged against it. Its render() = producer + paint, so the paint is the
  // difference against the producer median above (the same call).
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  host.appendChild(canvas);

  const canvasRenderer = new CanvasRenderer(engine, {
    canvas: canvas as never,
    producer,
    enableHitDetection: true,
    enableDirtyRegions: true,
  });

  canvasRenderer.render(viewport, zoom); // warm

  const canvasFrameRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    canvasRenderer.render(viewport, zoom);
    canvasFrameRuns.push(performance.now() - t);
  }
  const canvasFrameMs = median(canvasFrameRuns);
  const canvasPaintMs = Math.max(0, canvasFrameMs - producerMs);

  const svgFrameMs = producerMs + svgRepatchMs;

  const sample: TierSample = {
    nodes: count,
    zoom,
    withLinks,
    visibleNodes: metrics.nodeCount,
    visibleLinks: metrics.linkCount,
    vnodes: countVNodes(tree),
    producerMs,
    svgMountMs,
    svgRepatchMs,
    canvasPaintMs,
    svgFrameMs,
    canvasFrameMs,
    consumerShareOfFrame: svgRepatchMs / svgFrameMs,
  };

  canvasRenderer.dispose();
  producer.dispose();
  engine.destroy();
  host.remove();

  return sample;
}

(globalThis as unknown as { GrafloriaTier: unknown }).GrafloriaTier = { runTierScene };
