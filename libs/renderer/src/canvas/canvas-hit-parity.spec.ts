// HIT PARITY — the contract that makes the backend switch safe.
//
// A second renderer is only useful if it agrees with the first one about what is
// under the cursor. "Agrees" is not a vibe here, it is a property we SWEEP for:
// across a grid of world points on a real diagram, the Canvas backend's pick must
// return the SAME entity as the SVG backend's hit resolution.
//
// SVG mode's hit resolution is NOT the DOM's — `patch.ts` binds no per-element
// listeners, so the app resolves a pointer through the model:
//     nodes → `DiagramModel.getNodeAtPosition` (shape-aware, topmost-first)
//     links → `InteractionController.findLinkAtPosition` → `hitTestLink`, at
//              DEFAULT_LINK_HIT_TOLERANCE world units
// Those two functions ARE the oracle below. The canvas backend never sees them:
// it picks from the geometry it actually painted.
//
// This sweep is what found the engine's hexagon hit-region bug.

import { NodeModel } from '@grafloria/engine';
import { InteractionController } from '../interaction/interaction-controller';
import { DEFAULT_LINK_HIT_TOLERANCE, pointAtPositionOnPolyline } from '../svg/link-hit-test';
import { CanvasRenderer } from './canvas-renderer';
import { VIEWPORT, buildScene, portOn } from './test-scene';

/** Reaches the protected link resolution the app uses in SVG mode. */
class OracleController extends InteractionController {
  linkAt(x: number, y: number, diagram: unknown) {
    return this.findLinkAtPosition(x, y, diagram);
  }
}

describe('canvas hit-testing agrees with SVG-mode hit resolution', () => {
  // Every shape the ENGINE models exactly (`isPointInShape`). These are the
  // shapes SVG mode can hit-test, so these are the shapes parity is defined for.
  const shapes = ['rect', 'circle', 'ellipse', 'diamond', 'hexagon'] as const;

  describe.each(shapes)('%s nodes', (shape) => {
    it('picks the same node as DiagramModel.getNodeAtPosition, over a 40x30 grid', () => {
      const scene = buildScene(
        [
          { name: 'a', x: 100, y: 100, width: 160, height: 100, shape },
          { name: 'b', x: 420, y: 260, width: 160, height: 100, shape },
        ],
        false
      );

      const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
      renderer.render(VIEWPORT, 1);

      const disagreements: string[] = [];
      let hits = 0;

      for (let gx = 0; gx < 40; gx++) {
        for (let gy = 0; gy < 30; gy++) {
          const x = 60 + gx * 14;
          const y = 60 + gy * 11;

          const expected = scene.diagram!.getNodeAtPosition(x, y);
          if (expected) hits++;

          // Points within a pixel of the outline are genuinely ambiguous — a
          // rasterised edge and an analytic inequality can legitimately disagree
          // there — so they are excluded, and ONLY there.
          if (nearBoundary(scene.diagram!, x, y)) continue;

          const actual = renderer.pick(x, y);
          const actualNode = actual?.kind === 'node' ? actual.id : undefined;

          if ((expected?.id ?? undefined) !== actualNode) {
            disagreements.push(
              `(${x},${y}): engine=${expected?.id ?? 'none'} canvas=${actualNode ?? 'none'}`
            );
          }
        }
      }

      expect(hits).toBeGreaterThan(50); // the sweep really does cover the shapes
      expect(disagreements).toEqual([]);

      renderer.dispose();
    });
  });

  it('picks the topmost node where two overlap — the same one the engine picks', () => {
    const scene = buildScene(
      [
        { name: 'under', x: 100, y: 100, width: 200, height: 120 },
        { name: 'over', x: 150, y: 130, width: 200, height: 120 },
      ],
      false
    );

    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    // A point inside BOTH nodes.
    expect(scene.diagram!.getNodeAtPosition(200, 160)!.id).toBe(scene.nodes['over'].id);
    expect(renderer.pick(200, 160)).toMatchObject({ kind: 'node', id: scene.nodes['over'].id });

    renderer.dispose();
  });

  it('picks the link body at exactly the tolerance the interaction layer uses', () => {
    const scene = buildScene([
      { name: 'a', x: 100, y: 300, width: 100, height: 60 },
      { name: 'b', x: 500, y: 300, width: 100, height: 60 },
    ]);

    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    const controller = new OracleController();
    const points = scene.links['main'].points;
    expect(points.length).toBeGreaterThanOrEqual(2);

    // The MIDPOINT of the polyline — well clear of both nodes, so the only thing
    // that can be picked there is the link. (The stored points are the endpoints,
    // which sit ON the node edges; probing one of those would be comparing "which
    // link?" against "which entity?" and proves nothing.)
    const mid = pointAtPositionOnPolyline(points, 0.5)!;
    expect(scene.diagram!.getNodeAtPosition(mid.x, mid.y)).toBeUndefined();

    const disagreements: string[] = [];

    // Sweep across the tolerance boundary: inside it both must say "the link",
    // outside it both must say "nothing".
    for (const offset of [0, 2, 4, 4.9, 5.5, 8, 20]) {
      const svgLink = controller.linkAt(mid.x, mid.y + offset, scene.diagram);
      const canvasPick = renderer.pick(mid.x, mid.y + offset);
      const canvasLink = canvasPick?.kind === 'link' ? canvasPick.id : null;

      if ((svgLink?.id ?? null) !== canvasLink) {
        disagreements.push(
          `offset ${offset}: svg=${svgLink?.id ?? 'none'} canvas=${canvasLink ?? 'none'}`
        );
      }
    }

    expect(disagreements).toEqual([]);

    // ...and the sweep really did straddle the boundary rather than being
    // uniformly hit-or-miss.
    expect(renderer.pick(mid.x, mid.y + 4.9)?.kind).toBe('link');
    expect(renderer.pick(mid.x, mid.y + 8)).toBeNull();
    expect(DEFAULT_LINK_HIT_TOLERANCE).toBe(5);

    renderer.dispose();
  });

  it('a node covering a link wins the pick in both backends (nodes paint on top)', () => {
    const scene = buildScene([
      { name: 'a', x: 100, y: 300, width: 100, height: 60 },
      { name: 'b', x: 500, y: 300, width: 100, height: 60 },
    ]);

    // Drop a node right on top of the link's path.
    const blocker = new NodeModel({
      type: 'basic',
      position: { x: 280, y: 300 },
      size: { width: 80, height: 60 },
    });
    scene.diagram!.addNode(blocker);

    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    expect(scene.diagram!.getNodeAtPosition(320, 330)!.id).toBe(blocker.id);
    expect(renderer.pick(320, 330)).toMatchObject({ kind: 'node', id: blocker.id });

    renderer.dispose();
  });

  it('picks a VISIBLE port over the node it sits on', () => {
    const scene = buildScene([{ name: 'a', x: 200, y: 200, width: 120, height: 60 }], false);
    scene.engine.setInteractionConfig({ portVisibility: 'always' } as any);

    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    const port = portOn(scene.nodes['a'], 'right');

    // The right-side port is centred ON the node's right edge midpoint (320,230),
    // so it half-overhangs the body. A point just OUTSIDE the body but inside the
    // port disc can only resolve to the port...
    expect(renderer.pick(323, 230)).toMatchObject({ kind: 'port', id: port.id });

    // ...and a point inside BOTH resolves to the port, because ports are painted
    // after the body and picking is topmost-wins.
    expect(renderer.pick(317, 230)).toMatchObject({ kind: 'port', id: port.id });

    // Away from any port, the body picks as the node.
    expect(renderer.pick(260, 230)).toMatchObject({ kind: 'node', id: scene.nodes['a'].id });

    renderer.dispose();
  });

  it('does NOT pick a port that is not painted — and that is correct', () => {
    // Default portVisibility is 'on-hover', so an unhovered port is in NEITHER
    // backend's picture. Canvas picks what is painted, so it reports the node.
    //
    // This is not a parity hole: port interaction does not go through the
    // renderer's hit-test in either mode. `InteractionController.findPortAtPosition`
    // resolves ports from the MODEL (so you can grab a hidden port to start a
    // connection), and it is backend-agnostic — canvas mode inherits it unchanged.
    const scene = buildScene([{ name: 'a', x: 200, y: 200, width: 120, height: 60 }], false);
    expect(scene.engine.getInteractionConfig().portVisibility).toBe('on-hover');

    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    expect(renderer.pick(317, 230)).toMatchObject({ kind: 'node', id: scene.nodes['a'].id });
    expect(renderer.getHitRecords().some((r) => r.kind === 'port')).toBe(false);
    // and just outside the body, where the port disc would have been, nothing.
    expect(renderer.pick(323, 230)).toBeNull();

    renderer.dispose();
  });

  it('agrees at zoom != 1 — where a mis-derived transform would silently drift', () => {
    const scene = buildScene(
      [{ name: 'a', x: 300, y: 200, width: 160, height: 100, shape: 'diamond' }],
      false
    );

    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 2 });

    for (const zoom of [0.4, 1, 2.5]) {
      renderer.render(VIEWPORT, zoom);

      const disagreements: string[] = [];
      for (let gx = 0; gx < 24; gx++) {
        for (let gy = 0; gy < 18; gy++) {
          const x = 280 + gx * 8;
          const y = 180 + gy * 8;
          if (nearBoundary(scene.diagram!, x, y)) continue;

          const expected = scene.diagram!.getNodeAtPosition(x, y)?.id;
          const pick = renderer.pick(x, y);
          const actual = pick?.kind === 'node' ? pick.id : undefined;
          if (expected !== actual) disagreements.push(`zoom ${zoom} (${x},${y})`);
        }
      }
      expect(disagreements).toEqual([]);
    }

    renderer.dispose();
  });
});

describe('the two canvas picking strategies', () => {
  it('geometric pick is the headless path; both answer from ONE hit index', () => {
    // jsdom has no rasteriser, so `pickPixel` returns null here and `pick` falls
    // back to the geometric path — the documented behaviour. The PIXEL path is
    // exercised against a REAL 2D context in the browser e2e
    // (`libs/renderer/e2e/canvas-run.mjs`), where the two are compared over
    // thousands of points.
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    expect(renderer.pickPixel(150, 130)).toBeNull(); // no rasteriser in jsdom
    expect(renderer.pickGeometric(150, 130)).toMatchObject({ kind: 'node' });
    expect(renderer.pick(150, 130)).toMatchObject({ kind: 'node', id: scene.nodes['a'].id });

    // Every pick region has a colour key, and the keys are unique — which is what
    // makes the pixel path resolvable at all.
    const keys = renderer.getHitRecords().map((r) => r.colorKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);

    renderer.dispose();
  });

  it('hitTest() returns the VNode the IRenderer contract promises', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const renderer = new CanvasRenderer(scene.engine, { devicePixelRatio: 1 });
    renderer.render(VIEWPORT, 1);

    const vnode = renderer.hitTest(150, 130);
    expect(vnode).not.toBeNull();
    expect(vnode!.type).toBe('rect');
    expect(renderer.hitTest(-500, -500)).toBeNull();

    renderer.dispose();
  });
});

/**
 * Is the point within a pixel of a node's outline?
 *
 * A rasteriser and an analytic point-in-shape test are allowed to disagree on
 * the boundary itself (that is what antialiasing IS), so boundary points are
 * excluded from the sweep. Everything else must agree exactly. Excluding a 1px
 * band is the honest thing to do; excluding more would be hiding a bug.
 */
function nearBoundary(diagram: any, x: number, y: number): boolean {
  const eps = 1.5;
  const inside = (px: number, py: number) => !!diagram.getNodeAtPosition(px, py);
  const here = inside(x, y);
  return (
    inside(x + eps, y) !== here ||
    inside(x - eps, y) !== here ||
    inside(x, y + eps) !== here ||
    inside(x, y - eps) !== here
  );
}
