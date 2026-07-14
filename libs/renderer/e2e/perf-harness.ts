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

import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel, CommentStore } from '@grafloria/engine';
import {
  SVGRenderer,
  VNodePatcher,
  CommentOverlayController,
  PresenceOverlay,
  ViewportController,
} from '@grafloria/renderer';

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
  /** the LOD tier actually rendered — NOT necessarily the one the zoom asked for */
  tier?: string;
  /** the governor's last verdict, so a fast number can be explained rather than assumed */
  governor?: string;
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
    //
    // wave8/dirty: each iteration nudges the viewport by ONE pixel. That pixel is
    // load-bearing. Before it, this loop rendered the IDENTICAL view ten times —
    // which was harmless while every frame was rebuilt from scratch, but the
    // moment a renderer learns to skip an unchanged frame (the frame gate, Card 0)
    // nine of these ten become idle frames and the median collapses to 0ms. The
    // scenario would then report a spectacular speedup while measuring nothing at
    // all. A 1px pan changes nothing about the work — same cull set, same routes,
    // same LOD tier — but it makes every frame a REAL zoomed-out render, which is
    // what this number is supposed to be. (Left as a warning: a benchmark that an
    // optimisation can satisfy without doing the work is worse than no benchmark.)
    const zoomFrames: number[] = [];
    for (let f = 0; f < 10; f++) {
      const t = now();
      const vnode = renderer.render({ x: f, y: 0, width: 6400, height: 3600 }, 0.25) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      zoomFrames.push(now() - t);
    }
    // WHAT DID THE GOVERNOR ACTUALLY DO? The zoom-out number above is only
    // trustworthy if we know WHY it is fast, and the two possible reasons are very
    // different: either the tier was cheap enough to begin with, or the governor
    // watched three catastrophic frames and stepped the scene down. Recording the
    // verdict is what keeps "the governor rescues the 10k scene" an OBSERVATION
    // rather than a story told over a number that happens to look right.
    //
    // At 0.25 zoom the tier the ZOOM asks for is always 'sketch' (which routes).
    // A small scene affords it and stays there; a large one blows the budget by 4x
    // and lands in 'low' within three frames. Same policy, different outcomes,
    // decided by measurement.
    const quality = renderer.getQualityState();
    record({
      scenario: 'zoom-out-frame',
      nodes: count,
      links: linkCount,
      ms: median(zoomFrames),
      worstMs: Math.max(...zoomFrames),
      frames: zoomFrames.length,
      tier: quality.tier,
      governor: quality.governor?.lastDecision,
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

    // ------------------------------------------------- wave9/comments (Card 6)
    // THE CLAIM UNDER TEST: putting 200 anchored comment threads on this scene does not
    // cost the scene anything when nobody is doing anything.
    //
    // This is the number that matters, and it is the one an overlay usually gets wrong.
    // The frame gate skips an idle frame outright — but ONLY if the overlay's state is
    // visible to it. An overlay that lives outside the model either (a) never redraws,
    // which is the bug, or (b) "fixes" that by invalidating the frame on a timer/every
    // frame, which silently DISARMS THE GATE and turns a 0.0ms idle frame back into a
    // 130ms one for the whole scene. Both failures are invisible to a functional test and
    // both show up right here.
    const commentStore = new CommentStore(diagram, { viewer: 'perf' });
    const nodesForComments = diagram.getNodes();
    for (let i = 0; i < 200; i++) {
      const target = nodesForComments[(i * 37) % nodesForComments.length];
      const tid = commentStore.createThread({ kind: 'node', id: target.id }, `thread ${i}`);
      if (i % 3 === 0) commentStore.reply(tid, 'and another thing');
    }
    const overlay = new CommentOverlayController(commentStore, renderer);

    const cPan: number[] = [];
    for (let f = 0; f < 30; f++) {
      const vp = { ...viewport, x: viewport.x + f * 40, y: viewport.y + f * 12 };
      const t = now();
      const vnode = renderer.render(vp, 1) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      cPan.push(now() - t);
    }
    record({
      scenario: 'pan-frame+200-comments',
      nodes: count,
      links: linkCount,
      ms: median(cPan),
      worstMs: Math.max(...cPan),
      frames: cPan.length,
    });

    const cIdle: number[] = [];
    for (let f = 0; f < 20; f++) {
      const t = now();
      const vnode = renderer.render(viewport, 1) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      cIdle.push(now() - t);
    }
    record({
      scenario: 'idle-frame+200-comments',
      nodes: count,
      links: linkCount,
      ms: median(cIdle),
      worstMs: Math.max(...cIdle),
      frames: cIdle.length,
    });

    overlay.dispose();
    commentStore.dispose();

    // ------------------------------------------- idle frame, WITH LIVE PRESENCE
    // =========================================================================
    // Wave 9 (Collaboration), Card 5. THE NUMBER THIS CARD LIVES OR DIES ON.
    //
    // The claim being tested is not "presence is fast". It is: FOUR REMOTE CURSORS MOVING AT
    // 60Hz OVER A 10,000-NODE DIAGRAM COST THE DIAGRAM NOTHING AT ALL.
    //
    // That claim is only true because the presence overlay is a separate DOM layer that
    // never enters the VNode tree. Had the cursors been VNodes, the frame gate — which
    // cannot see them, since neither the model nor the viewport changed — would have SKIPPED
    // the frame and frozen them; and the honest fix for that, `invalidateFrame()`, would
    // instead force a full VNode rebuild + reconcile of a 10k-node scene 240 times a second
    // to move a 12-pixel arrow. Either way the previous wave's headline result is gone.
    //
    // So: mount the real overlay on the real scene, drive four cursors through 20 real
    // interpolation frames, and then measure the DIAGRAM's idle frame. It must still be
    // 0.0ms. If this row ever diverges from `idle-frame` above, presence has started paying
    // for itself out of the renderer's budget, and that is exactly the regression the fence
    // below exists to catch.
    // =========================================================================
    const presenceRoot = document.createElement('div');
    presenceRoot.style.position = 'relative';
    host.appendChild(presenceRoot);

    const camera = new ViewportController({ viewport, zoom: 1 });
    const presenceOverlay = new PresenceOverlay({
      root: presenceRoot,
      viewport: camera,
      smoothing: 0.4,
      // SYNCHRONOUS frames, and this is the difference between a measurement and a lie.
      //
      // The presenceOverlay's interpolation runs on rAF. This benchmark loop is synchronous, so with
      // the real rAF the cursor callbacks would be QUEUED and never run — every DOM write the
      // presenceOverlay does would happen after the last measurement, and `idle-frame-presence` would
      // report 0.0ms because the presenceOverlay had done NOTHING. A green number measuring an
      // presenceOverlay that never drew anything is worse than no number at all.
      //
      // Driving the frames inline means the transform writes, the element creation and the
      // selection-outline restyle all land BETWEEN the measured renders — so the 0.0ms below
      // means "the presenceOverlay did all of its real work and the diagram still paid nothing",
      // which is the claim.
      requestFrame: (cb) => {
        cb();
        return 0;
      },
      cancelFrame: () => undefined,
      getBounds: (id) => {
        const n = diagram.getNode(id);
        return n
          ? { x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height }
          : null;
      },
    });

    const cursorPeers = ['ana', 'bo', 'cy', 'dee'];
    const presenceIdleFrames: number[] = [];
    const presenceOverlayFrames: number[] = [];

    for (let f = 0; f < 20; f++) {
      // Every peer's cursor moves, every frame. The worst realistic case: four people sweeping
      // the canvas at once, which is also exactly when the machine is busiest.
      const tOverlay = now();
      presenceOverlay.setPeers(
        cursorPeers.map((actor, i) => ({
          actor,
          name: actor,
          cursor: { x: 200 + f * 17 + i * 90, y: 150 + f * 9 + i * 40 },
          selection: i === 0 ? ['n0'] : undefined,
        }))
      );
      presenceOverlayFrames.push(now() - tOverlay);

      // …and NOW time the DIAGRAM's frame. Nothing in the model or the viewport moved, so the
      // gate must still close and hand the patcher back the identical VNode object.
      const t = now();
      const vnode = renderer.render(viewport, 1) as never;
      patcher.reconcile(svg as unknown as Element, vnode);
      presenceIdleFrames.push(now() - t);
    }

    record({
      scenario: 'idle-frame-presence',
      nodes: count,
      links: linkCount,
      ms: median(presenceIdleFrames),
      worstMs: Math.max(...presenceIdleFrames),
      frames: presenceIdleFrames.length,
    });

    // WHAT PRESENCE ITSELF COSTS. Reported so the 0.0ms above cannot be read as "the presenceOverlay
    // did nothing" — `framesRun` proves the interpolation loop really ran, and this row is
    // the price of four cursors, four badges and a selection outline, per frame, INDEPENDENT
    // of scene size (it is four divs; the 10k nodes are not in this number and that is the
    // whole point).
    record({
      scenario: 'presence-overlay-frame',
      nodes: count,
      links: linkCount,
      ms: median(presenceOverlayFrames),
      worstMs: Math.max(...presenceOverlayFrames),
      frames: presenceOverlay.framesRun,
    });

    presenceOverlay.dispose();
    presenceRoot.remove();


    renderer.dispose();
    engine.destroy();
    host.remove();
  }

  return results;
}
