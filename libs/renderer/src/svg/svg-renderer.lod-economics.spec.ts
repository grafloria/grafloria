// svg-renderer.lod-economics.spec.ts
//
// wave8/culling — Card 4: LOD MUST BE ECONOMIC, NOT COSMETIC.
//
// Before this wave, the LOD tiers gated a handful of ATTRIBUTES at the very end
// of the pipeline while every expensive thing upstream ran regardless. The
// benchmark said so in the plainest possible terms: one zoom-out frame of a 10k
// diagram took 63 SECONDS, against 124ms for the near view of the same scene.
// Zooming out — which shows LESS detail — was 500x more expensive than zooming in.
// The reason was that the renderer still routed every edge around every obstacle
// to draw detours that were sub-pixel on screen.
//
// So these tests do not assert that far-zoom output LOOKS simpler. They assert
// that the WORK IS NOT DONE. A test that only checked the output would have
// passed against the 63-second renderer.

import { SVGRenderer } from './svg-renderer';
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  PortModel,
  PortVisibilityStrategy,
} from '@grafloria/engine';
import { LIGHT_THEME } from '../themes';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 1600, height: 900 };

/**
 * Zooms that resolve to each default tier.
 *
 * LOW_ZOOM WAS 0.25 AND IS NOW 0.12, and that is not a test tweak — it is the
 * design being corrected underneath these tests. 0.25 is the zoom fit-to-content
 * lands on for a large diagram, and it is now 'sketch': text and chrome are gone
 * (a 12px label is 3.6px there) but the graph's SHAPE — its routed edges — is
 * still perfectly legible, so it stays.
 *
 * Dropping routing at 0.25 made every diagram snap its edge shapes on crossing a
 * zoom threshold, and charged that to 30-node flowcharts with no performance
 * problem at all, purely to rescue 10k ones. That is a COST problem being solved
 * with a PERCEPTUAL lever, and the two do not line up. Cost is now the quality
 * governor's job: it measures the frame and steps a scene down when — and only
 * when — that scene on that machine cannot afford what the zoom asked for.
 *
 * So 'low' now means what it says: below 0.2, where a node is under 24px wide, an
 * edge is a hairline, and a routing detour around a node body really is sub-pixel.
 * Everything these tests claim about 'low' is still true OF 'low'. They were just
 * pointing at the wrong zoom.
 */
const HIGH_ZOOM = 1.0;
const MEDIUM_ZOOM = 0.6;
/** [0.2, 0.5): unreadable text, readable topology. Routes are KEPT. */
const SKETCH_ZOOM = 0.25;
/** < 0.2: the detour is sub-pixel. Routes collapse to straight lines. */
const LOW_ZOOM = 0.12;

/**
 * A scene that fits INSIDE the viewport at zoom 1.
 *
 * That matters: culling is doing its job, so a scene laid out in a long row would
 * have most of its nodes off-screen and most of its links unrouted — and a test
 * that expected N routes would fail for a reason that has nothing to do with LOD.
 * A 4-column grid of 140x70 nodes keeps everything on screen up to ~24 nodes.
 */
function scene(nodeCount: number): { engine: DiagramEngine; diagram: DiagramModel } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('lod-econ')!;
  // Ports are on-hover by default, so nothing would draw a glyph to gate.
  engine.setInteractionConfig({ portVisibility: PortVisibilityStrategy.ALWAYS });

  const cols = 4;
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
  for (let i = 0; i + 1 < nodeCount; i++) {
    const link = new LinkModel(`n${i}-out`, `n${i + 1}-in`, 'orthogonal');
    (link as unknown as { id: string }).id = `l${i}`;
    diagram.addLink(link);
  }

  return { engine, diagram };
}

/** Count calls into the routing engine — the thing that actually costs the 63s. */
function countRoutes(engine: DiagramEngine): () => number {
  const routingEngine = engine.getRoutingEngine();
  let calls = 0;
  const original = routingEngine.route.bind(routingEngine);
  (routingEngine as unknown as { route: unknown }).route = (...args: unknown[]) => {
    calls++;
    return (original as (...a: unknown[]) => unknown)(...args);
  };
  return () => calls;
}

function walk(vnode: VNode, visit: (v: VNode) => void): void {
  visit(vnode);
  for (const child of vnode.children ?? []) {
    if (child && typeof child === 'object') walk(child as VNode, visit);
  }
}

function countType(root: VNode, type: string): number {
  let n = 0;
  walk(root, (v) => {
    if (v.type === type) n++;
  });
  return n;
}

function allPathData(root: VNode): string[] {
  const out: string[] = [];
  walk(root, (v) => {
    const d = (v.props as { d?: string } | undefined)?.d;
    if (v.type === 'path' && typeof d === 'string') out.push(d);
  });
  return out;
}

/**
 * Every string a VNode paints with — whether it arrived as a `fill` attribute or
 * inside the inline `style` CSS string, which is where the programmatic-mode
 * style cascade actually puts it.
 */
function allPaintStrings(root: VNode): string[] {
  const out: string[] = [];
  walk(root, (v) => {
    for (const value of Object.values(v.props ?? {})) {
      if (typeof value === 'string') out.push(value);
    }
  });
  return out;
}

describe('LOD economics (wave8/culling — Card 4)', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;

  afterEach(() => {
    renderer?.dispose();
    engine?.destroy();
  });

  // =======================================================================
  // THE headline. This is the assertion that would have caught the bug.
  // =======================================================================
  describe('routing', () => {
    test('routes every link at HIGH zoom', () => {
      ({ engine } = scene(20));
      const routes = countRoutes(engine);
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      renderer.render(VIEWPORT, HIGH_ZOOM);

      // 19 links, each routed at least once (the router retries on failure).
      expect(routes()).toBeGreaterThanOrEqual(19);
    });

    test('routes NOTHING at low zoom — this is the 63 seconds', () => {
      ({ engine } = scene(20));
      const routes = countRoutes(engine);
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      renderer.render(VIEWPORT, LOW_ZOOM);

      expect(routes()).toBe(0);
    });

    // The [0.5, 1.0) band must render EXACTLY as it did before this wave. The
    // economic features are deliberately present on 'medium' for precisely this
    // reason: the fix must buy performance at a zoom nobody can read, and change
    // nothing at a zoom they can.
    test('still routes at MEDIUM zoom — the near view is untouched', () => {
      ({ engine } = scene(20));
      const routes = countRoutes(engine);
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      renderer.render(VIEWPORT, MEDIUM_ZOOM);

      expect(routes()).toBeGreaterThanOrEqual(19);
    });

    // …AND SO DOES SKETCH, which is the correction to this card. A 20-node scene at
    // zoom 0.25 renders in single-digit milliseconds and has no performance problem
    // to solve. Flattening its routes bought nothing and cost fidelity: you could
    // watch the edges change shape as you crossed a zoom threshold.
    //
    // The governor is off here, deliberately — the point of this test is that the
    // TIER routes at 0.25. Whether a given scene can AFFORD to is measured at
    // runtime, per machine, and is a different question with a different mechanism.
    test('still routes at SKETCH zoom — a small diagram keeps its shape', () => {
      ({ engine } = scene(20));
      const routes = countRoutes(engine);
      renderer = new SVGRenderer(
        engine,
        { enableCaching: false, qualityGovernor: false },
        LIGHT_THEME
      );

      renderer.render(VIEWPORT, SKETCH_ZOOM);

      expect(routes()).toBeGreaterThanOrEqual(19);
    });

    // The mirror, and the reason 'sketch' is safe to ship: a scene that CANNOT
    // afford its tier does not keep it. The governor watches the frame, and a
    // catastrophically over-budget one drops the tier within three frames — so the
    // 10k scene still gets the cheap picture that made the 63-second frame a 124ms
    // one, without every small diagram paying for its rescue.
    test('…but the governor takes it away from a scene that cannot afford it', () => {
      ({ engine } = scene(20));
      renderer = new SVGRenderer(
        engine,
        // A budget of 0 means every frame is catastrophically over it. This stands in
        // for "10,000 nodes on a laptop" without needing 10,000 nodes in a unit test:
        // the governor's input is frame time, and this is the honest way to say the
        // frames are too slow.
        { enableCaching: false, qualityGovernor: { budgetMs: 0 } },
        LIGHT_THEME
      );

      renderer.render(VIEWPORT, SKETCH_ZOOM);
      renderer.render(VIEWPORT, SKETCH_ZOOM);
      renderer.render(VIEWPORT, SKETCH_ZOOM); // three strikes → escalate
      expect(renderer.getQualityState().governor?.lastDecision).toBe('escalated');

      // The decision lands on the NEXT frame, not the one that provoked it — a
      // frame's tier is chosen before the frame is timed, so the earliest a verdict
      // can be acted on is the frame after it. `getQualityState().tier` therefore
      // reports the tier LAST RENDERED, which is what a HUD wants to display.
      const routes = countRoutes(engine);
      renderer.render(VIEWPORT, SKETCH_ZOOM);

      expect(renderer.getQualityState().tier).not.toBe('sketch'); // stepped down
      expect(routes()).toBe(0); // and at the cheaper tier, nothing routes
    });

    // THE GOVERNOR (Card 7) THROUGH THE FRAME GATE (Card 0) — the two halves of this
    // wave, meeting. The real user scenario: a heavy scene being PANNED. Every frame
    // is genuinely built (the viewport moves, so the gate cannot skip), every frame
    // is over budget, and the governor must make the picture cheaper *on screen* —
    // not merely decide to.
    test('a step-down reaches the screen while the user is panning a scene they cannot afford', () => {
      ({ engine } = scene(20));
      renderer = new SVGRenderer(
        engine,
        // Caching ON: the frame gate is live. It must not be able to swallow this.
        { enableCaching: true, qualityGovernor: { budgetMs: 0 } },
        LIGHT_THEME
      );

      const pan = (f: number) =>
        renderer.render({ ...VIEWPORT, x: VIEWPORT.x + f }, SKETCH_ZOOM);

      pan(0);
      pan(1);
      pan(2); // three over-budget frames → escalate
      expect(renderer.getQualityState().governor?.lastDecision).toBe('escalated');

      const routes = countRoutes(engine);
      pan(3);

      expect(renderer.getQualityState().tier).not.toBe('sketch');
      expect(routes()).toBe(0); // the cheaper picture is the one actually drawn
    });

    // …AND THE RULE THAT MAKES THE ABOVE SAFE, which is easy to get backwards.
    //
    // A skipped frame costs ~0ms. Feed that to the governor and an IDLE canvas drives
    // the median toward zero — so the governor patiently concludes the machine has
    // headroom, restores detail the scene cannot actually afford, and the very next
    // pan blows the budget again. The canvas would breathe in and out of detail
    // whenever the user paused. The governor must only ever judge frames it PAID FOR.
    //
    // (This is also why the seam above is milder than it first looks: an idle canvas
    // never advances the governor at all, so a step-down cannot be "stranded" behind
    // the gate — the only frames that could strand it are frames nobody asked for.)
    test('an idle skipped frame does not feed the governor free headroom', () => {
      ({ engine } = scene(20));
      renderer = new SVGRenderer(
        engine,
        {
          enableCaching: true,
          // A governor that never acts and only ever counts: a window long enough to
          // never close and a panic threshold nothing can reach. `samples` then IS
          // the number of frames it has been shown, which is exactly the invariant
          // under test — and it cannot be confused by a window rolling over.
          qualityGovernor: { window: 1000, panicFactor: 1e9 },
        },
        LIGHT_THEME
      );

      const frame = () => renderer.render(VIEWPORT, SKETCH_ZOOM);
      for (let i = 0; i < 25; i++) frame();

      const { built, skipped } = renderer.getFrameStats();
      expect(skipped).toBeGreaterThan(20); // the gate is doing its job
      // THE INVARIANT: the governor has seen the frames we PAID FOR, and not one of
      // the free ones. Not "≤ built" — exactly built. A skipped frame is not evidence
      // of anything, and must not be counted as evidence of headroom.
      expect(renderer.getQualityState().governor?.samples).toBe(built);
    });

    // The claim under the whole card: far-zoom cost stops depending on scene size.
    // Routing was O(nodes) per edge — an obstacle rect built for every node, for
    // every link, every frame — so a 4x scene cost 16x. Now it is O(1) per edge.
    test('far-zoom routing cost no longer scales with the scene', () => {
      const small = scene(10);
      const smallRoutes = countRoutes(small.engine);
      const smallRenderer = new SVGRenderer(small.engine, { enableCaching: false }, LIGHT_THEME);
      smallRenderer.render(VIEWPORT, LOW_ZOOM);
      smallRenderer.dispose();
      small.engine.destroy();

      ({ engine } = scene(200));
      const routes = countRoutes(engine);
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);
      renderer.render(VIEWPORT, LOW_ZOOM);

      expect(smallRoutes()).toBe(0);
      expect(routes()).toBe(0);
    });

    test('a link still spans its two ports at low zoom (a cheap route is still a route)', () => {
      let diagram: DiagramModel;
      ({ engine, diagram } = scene(2));
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      renderer.render(VIEWPORT, LOW_ZOOM);

      // n0 is at (0,0) 140x70 → out port on the right edge; n1 at (220,140).
      const points = diagram.getLink('l0')!.points;
      expect(points.length).toBeGreaterThanOrEqual(2);

      const start = points[0];
      const end = points[points.length - 1];
      expect(start.x).toBeCloseTo(140, 0); // n0 right edge
      expect(end.x).toBeCloseTo(220, 0); // n1 left edge
    });

    // The policy is DATA, not a hardcoded rule. An app that genuinely wants
    // obstacle-aware routing at far zoom must be able to buy it back.
    test('an app can buy routing back at low zoom through LODConfig', () => {
      let diagram: DiagramModel;
      ({ engine, diagram } = scene(20));
      const config = diagram.getLODConfig();
      config.tiers.find((t) => t.name === 'low')!.features.add('routing');
      diagram.setLODConfig(config);

      const routes = countRoutes(engine);
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);
      renderer.render(VIEWPORT, LOW_ZOOM);

      expect(routes()).toBeGreaterThanOrEqual(19);
    });
  });

  // =======================================================================
  // Text is the other unbounded cost: measuring a label is not free, and a
  // 12px label at 0.25 zoom is 3px tall.
  // =======================================================================
  describe('labels and ports', () => {
    test('emits label text and port glyphs at HIGH zoom', () => {
      ({ engine } = scene(5));
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, HIGH_ZOOM);

      expect(countType(vnode, 'text')).toBeGreaterThan(0);
      expect(countType(vnode, 'circle')).toBeGreaterThan(0); // port glyphs
    });

    test('emits no label text and no port glyphs at LOW zoom', () => {
      ({ engine } = scene(5));
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, LOW_ZOOM);

      expect(countType(vnode, 'text')).toBe(0);
      expect(countType(vnode, 'circle')).toBe(0);
    });
  });

  // =======================================================================
  // Gradients. The saving is NOT the `<defs>` entry (deduped, cheap) — it is
  // that a paint-server entity deliberately BYPASSES the VNode cache to keep
  // its url(#…) ref alive, so every gradient node in the scene is rebuilt from
  // scratch on every frame. Flatten the paint and the cache works again.
  // =======================================================================
  describe('gradients', () => {
    const gradient = {
      type: 'linear' as const,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 0.5, color: '#00ff00' },
        { offset: 1, color: '#0000ff' },
      ],
    };

    const gradientScene = () => {
      const e = new DiagramEngine();
      const d = e.createDiagram('grad')!;
      const node = new NodeModel({
        type: 'basic',
        position: { x: 10, y: 10 },
        size: { width: 140, height: 70 },
      });
      (node as unknown as { id: string }).id = 'g0';
      node.style = { ...node.style, fill: gradient };
      d.addNode(node);
      return e;
    };

    test('emits a paint server and a url(#…) fill at HIGH zoom', () => {
      engine = gradientScene();
      renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, HIGH_ZOOM);

      expect(countType(vnode, 'linearGradient')).toBe(1);
      expect(allPaintStrings(vnode).some((s) => s.includes('fill: url(#grafloria-def-'))).toBe(true);
    });

    test('flattens to a colour and emits no paint server at LOW zoom', () => {
      engine = gradientScene();
      renderer = new SVGRenderer(engine, { enableCaching: false, useCSSMode: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, LOW_ZOOM);

      expect(countType(vnode, 'linearGradient')).toBe(0);

      const paints = allPaintStrings(vnode);
      // The MIDDLE stop, not the first: reading a red→green→blue gradient as
      // "red" is a bigger lie than reading it as green.
      expect(paints.some((s) => s.includes('fill: #00ff00'))).toBe(true);
      expect(paints.some((s) => s.includes('url(#'))).toBe(false);
    });

    // The invariant that makes the cache-bypass safe to lift: when gradients are
    // off, NOTHING registers a def, so no cached VNode can be left pointing at
    // one that was never emitted.
    test('no VNode holds a url(#…) that <defs> does not contain, at any tier', () => {
      engine = gradientScene();
      renderer = new SVGRenderer(engine, { enableCaching: true, useCSSMode: false }, LIGHT_THEME);

      for (const zoom of [HIGH_ZOOM, MEDIUM_ZOOM, LOW_ZOOM, HIGH_ZOOM]) {
        const vnode = renderer.render(VIEWPORT, zoom);

        const defIds = new Set<string>();
        walk(vnode, (v) => {
          const id = (v.props as { id?: string } | undefined)?.id;
          if (id?.startsWith('grafloria-def-')) defIds.add(id);
        });

        const refs: string[] = [];
        for (const value of allPaintStrings(vnode)) {
          for (const m of value.matchAll(/url\(#(grafloria-def-[a-z0-9]+)\)/g)) {
            refs.push(m[1]);
          }
        }

        for (const ref of refs) {
          expect(defIds.has(ref)).toBe(true);
        }
      }
    });
  });

  // =======================================================================
  // Path detail: a cubic needs control points per segment and emits a `C` per
  // bend. At 0.25 zoom a curve and its chord are the same pixels.
  // =======================================================================
  describe('path detail', () => {
    const curveScene = () => {
      const e = new DiagramEngine();
      const d = e.createDiagram('curve')!;
      for (const [id, x] of [
        ['a', 0],
        ['b', 400],
      ] as const) {
        const node = new NodeModel({
          type: 'basic',
          position: { x, y: 100 },
          size: { width: 100, height: 44 },
        });
        (node as unknown as { id: string }).id = id;
        node.addPort(new PortModel({ id: `${id}-r`, type: 'output', side: 'right' }));
        node.addPort(new PortModel({ id: `${id}-l`, type: 'input', side: 'left' }));
        d.addNode(node);
      }
      const link = new LinkModel('a-r', 'b-l', 'smooth');
      (link as unknown as { id: string }).id = 'curve-link';
      d.addLink(link);
      return e;
    };

    test('emits a curve at HIGH zoom', () => {
      engine = curveScene();
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, HIGH_ZOOM);

      expect(allPathData(vnode).some((d) => d.includes('C'))).toBe(true);
    });

    test('emits a polyline at LOW zoom', () => {
      engine = curveScene();
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, LOW_ZOOM);

      const ds = allPathData(vnode);
      expect(ds.length).toBeGreaterThan(0);
      expect(ds.some((d) => d.includes('C'))).toBe(false);
    });

    // Orthogonal stays orthogonal. Its right angles are its MEANING — a flowchart
    // that goes diagonal at low zoom has changed what it says, not how finely it
    // says it — and the orthogonal emitter is a cheap `L` walk regardless.
    test('an orthogonal link keeps its right angles at LOW zoom', () => {
      let diagram: DiagramModel;
      ({ engine, diagram } = scene(2));
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      renderer.render(VIEWPORT, LOW_ZOOM);

      expect(diagram.getLink('l0')!.pathType).toBe('orthogonal');
    });
  });

  // =======================================================================
  // The line the whole wave walks: cheaper must not mean WRONG. Culling drops
  // what is off-screen; LOD drops DETAIL. Neither may drop an entity that is on
  // screen — an edge that blinks out of existence is not a performance win.
  // =======================================================================
  describe('correctness at low zoom', () => {
    test('every on-screen node and link is still rendered', () => {
      let diagram: DiagramModel;
      ({ engine, diagram } = scene(6));
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      const vnode = renderer.render(VIEWPORT, LOW_ZOOM);

      const linksLayer = vnode.children![0];
      const nodesLayer = vnode.children![1];

      expect(nodesLayer.children!.length).toBe(diagram.getNodes().length);
      expect(linksLayer.children!.length).toBe(diagram.getLinks().length);
    });

    test('the model keeps true geometry — the simplification is draw-time only', () => {
      let diagram: DiagramModel;
      ({ engine, diagram } = scene(3));
      renderer = new SVGRenderer(engine, { enableCaching: false }, LIGHT_THEME);

      renderer.render(VIEWPORT, LOW_ZOOM);

      // Points must still run between the LIVE ports, so link bounds (and hence
      // culling, and hit-testing) stay correct at any tier.
      for (const link of diagram.getLinks()) {
        expect(link.points.length).toBeGreaterThanOrEqual(2);
        for (const p of link.points) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
    });

    test('zooming back in restores full detail (the tier is not sticky)', () => {
      ({ engine } = scene(5));
      renderer = new SVGRenderer(engine, { enableCaching: true }, LIGHT_THEME);

      renderer.render(VIEWPORT, HIGH_ZOOM);
      const low = renderer.render(VIEWPORT, LOW_ZOOM);
      const backToHigh = renderer.render(VIEWPORT, HIGH_ZOOM);

      expect(countType(low, 'text')).toBe(0);
      expect(countType(backToHigh, 'text')).toBeGreaterThan(0);
    });

    // A coarse route is a STRAIGHT line, so it writes a SMALLER polyline into
    // link.points than the real route did — which shrinks the link's bounding box
    // in the spatial index. The frame you zoom back in on is culled against those
    // shrunken bounds, before anything has re-routed. If that box were the whole
    // story, a link whose real route detours outside its port-to-port box could
    // blink out for one frame on zoom-in.
    //
    // It is not the whole story, and this pins both reasons: link bounds are the
    // union of the points AND the live port endpoints (so the box is always
    // anchored to where the edge really starts and ends), and the link query is
    // padded by LINK_CULL_MARGIN. Belt and braces — an edge that vanishes for a
    // frame is exactly the kind of "performance win" nobody wants.
    test('no link is culled on the frame after zooming back in', () => {
      let diagram: DiagramModel;
      ({ engine, diagram } = scene(6));
      renderer = new SVGRenderer(engine, { enableCaching: true }, LIGHT_THEME);

      renderer.render(VIEWPORT, HIGH_ZOOM);
      renderer.render(VIEWPORT, LOW_ZOOM); // coarse routes shrink every link's bounds
      const backToHigh = renderer.render(VIEWPORT, HIGH_ZOOM);

      const linksLayer = backToHigh.children![0];
      expect(linksLayer.children!.length).toBe(diagram.getLinks().length);
    });
  });
});
