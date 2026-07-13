// Wave 8 — Card 3: the LAZY-MOUNT benchmark, and its correctness proof.
//
// Same scene builder as the baseline (`perf-harness.ts` exports it) so the before and
// the after are the same graph, measured the same way, in the same browser.
//
// It measures the only number that matters here — TIME TO FIRST PAINT, the gap between
// "I opened the file" and "I can see my diagram" — and it proves, in the same run, that
// nothing was lost to get it: after the mount settles, the DOM must contain exactly the
// entities a blocking render produces. A fast first paint that drops half the graph is
// not a win, it is a bug with a good stopwatch.

import { ProgressiveMounter, SVGRenderer, ViewLifecycle, VNodePatcher } from '@grafloria/renderer';
import { buildScene } from './perf-harness';

const VIEWPORT = { x: 0, y: 0, width: 1600, height: 900 };

/** Entity ids actually present in the rendered DOM, by kind. */
function domEntities(svg: Element): { nodes: Set<string>; links: Set<string> } {
  const nodes = new Set<string>();
  const links = new Set<string>();
  for (const el of Array.from(svg.querySelectorAll('[data-node-id]'))) {
    nodes.add(el.getAttribute('data-node-id')!);
  }
  for (const el of Array.from(svg.querySelectorAll('[data-link-id]'))) {
    links.add(el.getAttribute('data-link-id')!);
  }
  return { nodes, links };
}

function mountHost(container: HTMLElement): { host: HTMLElement; svg: Element } {
  const host = document.createElement('div');
  container.appendChild(host);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.appendChild(svg);
  return { host, svg };
}

/**
 * ONE scene, ONE mode, in a FRESH page.
 *
 * Deliberately not a loop over counts in a single context. The first version of this
 * benchmark measured blocking and progressive back to back in one page and reported the
 * progressive mount COMPLETING faster than the blocking render that produced the same
 * picture — which is impossible, and was the tell: the second scene inherits a warm JIT
 * and a warm routing engine from the first. Every number below is taken in a page that
 * has rendered nothing else, which is the only way "before" and "after" mean anything.
 */
export async function runLazyScene(
  container: HTMLElement,
  count: number,
  mode: 'blocking' | 'progressive'
): Promise<LazyRun> {
  const { engine, diagram } = buildScene(count);
  const { svg } = mountHost(container);
  const renderer = new SVGRenderer(engine, {});
  const patcher = new VNodePatcher();

  if (mode === 'blocking') {
    const t0 = performance.now();
    patcher.reconcile(svg, renderer.render(VIEWPORT, 1) as never);
    const firstPaintMs = performance.now() - t0;

    const dom = domEntities(svg);
    return {
      nodes: count,
      links: diagram.getLinks().length,
      firstPaintMs,
      completeMs: firstPaintMs,
      cpuMs: firstPaintMs,
      worstSliceMs: firstPaintMs,
      slices: 1,
      domNodes: dom.nodes.size,
      domLinks: dom.links.size,
      entityIds: [...dom.nodes].map((i) => `node:${i}`).concat([...dom.links].map((i) => `link:${i}`)).sort(),
    };
  }

  const lifecycle = new ViewLifecycle();
  renderer.setViewLifecycle(lifecycle);

  const mounter = new ProgressiveMounter(
    engine,
    lifecycle,
    (vp, zoom) => patcher.reconcile(svg, renderer.render(vp, zoom) as never),
    () => renderer.getDeferredEntities()
  );

  const stats = await mounter.mount(VIEWPORT, 1, { sliceMs: 8 });
  const dom = domEntities(svg);

  return {
    nodes: count,
    links: diagram.getLinks().length,
    firstPaintMs: stats.firstPaintMs,
    completeMs: stats.completeMs,
    cpuMs: stats.cpuMs,
    worstSliceMs: stats.worstSliceMs,
    slices: stats.slices,
    domNodes: dom.nodes.size,
    domLinks: dom.links.size,
    entityIds: [...dom.nodes].map((i) => `node:${i}`).concat([...dom.links].map((i) => `link:${i}`)).sort(),
  };
}

export interface LazyRun {
  nodes: number;
  links: number;
  firstPaintMs: number;
  completeMs: number;
  /** CPU actually spent (sum of slices) — wall clock minus the rAF waits. */
  cpuMs: number;
  worstSliceMs: number;
  slices: number;
  domNodes: number;
  domLinks: number;
  /** Every entity the DOM actually contains — the parity check compares these sets. */
  entityIds: string[];
}

(globalThis as unknown as { GrafloriaLazy: unknown }).GrafloriaLazy = { runLazyScene };
