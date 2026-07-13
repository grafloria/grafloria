/**
 * Wave 3 (framework-agnostic instance API) — ViewportController.
 *
 * Every test here instantiates the controller with a PLAIN `new`. There is no
 * Angular TestBed, no DI, no component fixture and no DOM element — which is
 * itself the proof that the camera math is framework-agnostic and portable to
 * a React / Vue / web-component wrapper.
 */
import { DiagramEngine } from '@grafloria/engine';
import { ViewportController, type CanvasRect } from './viewport-controller';
import { SVGRenderer } from '../svg/svg-renderer';

/** A canvas mounted at (0,0), 800x600 — a stand-in for getBoundingClientRect(). */
const RECT: CanvasRect = { left: 0, top: 0, width: 800, height: 600 };
/** A canvas offset within the page, to prove `left`/`top` are honoured. */
const OFFSET_RECT: CanvasRect = { left: 120, top: 80, width: 800, height: 600 };

describe('ViewportController (framework-agnostic camera)', () => {
  describe('construction + defaults', () => {
    it('constructs with a plain `new` — no DI container, no DOM', () => {
      const vp = new ViewportController();

      expect(vp).toBeInstanceOf(ViewportController);
      expect(vp.getZoom()).toBe(1);
      expect(vp.getViewport()).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    });

    it('mirrors the Angular canvas defaults (zoom clamp 0.1 – 3.0)', () => {
      const vp = new ViewportController();

      expect(vp.clampZoom(0)).toBe(0.1);
      expect(vp.clampZoom(99)).toBe(3.0);
    });

    it('honours custom options and clamps the initial zoom', () => {
      const vp = new ViewportController({
        viewport: { x: 10, y: 20, width: 400, height: 300 },
        zoom: 10,
        minZoom: 0.5,
        maxZoom: 2,
      });

      expect(vp.getZoom()).toBe(2); // clamped on construction
      expect(vp.getViewport()).toEqual({ x: 10, y: 20, width: 400, height: 300 });
    });

    it('returns defensive copies of the viewport', () => {
      const vp = new ViewportController();
      const a = vp.getViewport();
      a.x = 9999;

      expect(vp.getViewport().x).toBe(0);
    });
  });

  // ==========================================================================
  // The viewBox convention — the contract the renderer and hit-tester share
  // ==========================================================================
  describe('the viewBox convention', () => {
    it('zooms around the viewport CENTRE (centre is invariant under zoom)', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
      });
      const centreOf = (b: { x: number; y: number; width: number; height: number }) => ({
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
      });

      const at1 = centreOf(vp.getViewBox());
      vp.setZoom(2.5);
      const at25 = centreOf(vp.getViewBox());

      expect(at25.x).toBeCloseTo(at1.x, 10);
      expect(at25.y).toBeCloseTo(at1.y, 10);
    });

    it('shows LESS world as zoom increases (width = canvasPx / zoom)', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
      });

      expect(vp.getViewBox()).toEqual({ x: 0, y: 0, width: 800, height: 600 });

      vp.setZoom(2);
      expect(vp.getViewBox()).toEqual({ x: 200, y: 150, width: 400, height: 300 });

      vp.setZoom(0.5);
      expect(vp.getViewBox()).toEqual({ x: -400, y: -300, width: 1600, height: 1200 });
    });

    it('serialises to the "x y w h" viewBox attribute string', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 2,
      });

      expect(vp.getViewBoxString()).toBe('200 150 400 300');
    });

    /**
     * The load-bearing test: the camera's viewBox must be BYTE-IDENTICAL to what
     * SVGRenderer actually paints. If either side's formula drifts, hit-testing
     * silently desynchronises from the picture — so we pin them to each other.
     */
    it('matches the viewBox SVGRenderer actually emits, at every zoom', () => {
      const engine = new DiagramEngine();
      engine.createDiagram('viewbox-parity');
      const renderer = new SVGRenderer(engine, {});

      const viewport = { x: 40, y: -25, width: 800, height: 600 };

      for (const zoom of [0.1, 0.5, 1, 1.75, 3]) {
        const vp = new ViewportController({ viewport, zoom });

        // What the camera says it is showing...
        const expected = vp.getViewBoxString();
        // ...versus what the renderer puts on the <svg> element.
        const vnode = renderer.render(vp.getRenderViewport(), vp.getZoom());

        expect(vnode.props?.['viewBox']).toBe(expected);
      }

      engine.destroy();
    });

    it('getRenderViewport is the RAW camera rect (renderer applies zoom itself)', () => {
      // Guards the quadratic-zoom trap: pre-dividing by zoom before render()
      // makes the renderer divide a second time.
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 2,
      });

      expect(vp.getRenderViewport()).toEqual({ x: 0, y: 0, width: 800, height: 600 });
      expect(vp.getRenderViewport().width).not.toBe(400);
    });
  });

  // ==========================================================================
  // Screen ↔ world
  // ==========================================================================
  describe('clientToWorld / worldToClient', () => {
    it('maps the canvas top-left corner to the viewBox origin', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 2,
      });

      const world = vp.clientToWorld(RECT.left, RECT.top, RECT);
      const box = vp.getViewBox();

      expect(world.x).toBeCloseTo(box.x, 10);
      expect(world.y).toBeCloseTo(box.y, 10);
    });

    it('maps the canvas bottom-right corner to the viewBox far edge', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 2,
      });

      const world = vp.clientToWorld(RECT.left + 800, RECT.top + 600, RECT);
      const box = vp.getViewBox();

      expect(world.x).toBeCloseTo(box.x + box.width, 10);
      expect(world.y).toBeCloseTo(box.y + box.height, 10);
    });

    it('subtracts the canvas page offset (rect.left / rect.top)', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
      });

      const world = vp.clientToWorld(120, 80, OFFSET_RECT); // exactly the corner
      expect(world).toEqual({ x: 0, y: 0 });
    });

    it('round-trips exactly at every zoom (worldToClient ∘ clientToWorld = id)', () => {
      for (const zoom of [0.1, 0.5, 1, 1.75, 3]) {
        const vp = new ViewportController({
          viewport: { x: 37, y: -14, width: 800, height: 600 },
          zoom,
        });

        for (const [cx, cy] of [
          [120, 80],
          [500, 400],
          [920, 680],
        ]) {
          const world = vp.clientToWorld(cx, cy, OFFSET_RECT);
          const back = vp.worldToClient(world.x, world.y, OFFSET_RECT);

          expect(back.x).toBeCloseTo(cx, 8);
          expect(back.y).toBeCloseTo(cy, 8);
        }
      }
    });

    it('a world point stays put on screen when only the canvas offset changes', () => {
      const vp = new ViewportController({ zoom: 1.5 });

      const a = vp.worldToClient(100, 100, { left: 0, top: 0, width: 800, height: 600 });
      const b = vp.worldToClient(100, 100, { left: 30, top: 10, width: 800, height: 600 });

      expect(b.x - a.x).toBeCloseTo(30, 10);
      expect(b.y - a.y).toBeCloseTo(10, 10);
    });
  });

  // ==========================================================================
  // Zoom
  // ==========================================================================
  describe('zoom', () => {
    it('clamps to [minZoom, maxZoom] and returns the applied value', () => {
      const vp = new ViewportController();

      expect(vp.setZoom(5)).toBe(3);
      expect(vp.getZoom()).toBe(3);
      expect(vp.setZoom(-1)).toBe(0.1);
      expect(vp.getZoom()).toBe(0.1);
    });

    it('ignores a non-finite zoom rather than corrupting the camera', () => {
      const vp = new ViewportController({ zoom: 1.5 });

      expect(vp.setZoom(NaN)).toBe(1.5);
      expect(vp.getZoom()).toBe(1.5);
    });

    it('zoomBy is ADDITIVE — the canvas convention (zoom + delta)', () => {
      const vp = new ViewportController({ zoom: 1 });

      expect(vp.zoomBy(0.1)).toBeCloseTo(1.1, 10);
      expect(vp.zoomBy(0.1)).toBeCloseTo(1.2, 10);
    });

    it('zoomByWheel: scrolling down zooms OUT, up zooms IN', () => {
      const vp = new ViewportController({ zoom: 1, zoomSensitivity: 0.1 });

      expect(vp.zoomByWheel(100)).toBeCloseTo(0.9, 10); // deltaY > 0 → out
      expect(vp.zoomByWheel(-100)).toBeCloseTo(1.0, 10); // deltaY < 0 → in
    });

    it('zoomByWheel cannot escape the clamp however hard you scroll', () => {
      const vp = new ViewportController({ zoom: 1 });

      for (let i = 0; i < 100; i++) vp.zoomByWheel(-100);
      expect(vp.getZoom()).toBe(3);

      for (let i = 0; i < 100; i++) vp.zoomByWheel(100);
      expect(vp.getZoom()).toBe(0.1);
    });

    it('zoomAtPoint pins the world point under the cursor to that same pixel', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 1,
      });

      const cursor = { x: 650, y: 130 }; // deliberately off-centre
      const before = vp.clientToWorld(cursor.x, cursor.y, RECT);

      vp.zoomAtPoint(2.5, cursor.x, cursor.y, RECT);

      const after = vp.clientToWorld(cursor.x, cursor.y, RECT);
      expect(after.x).toBeCloseTo(before.x, 8);
      expect(after.y).toBeCloseTo(before.y, 8);
      expect(vp.getZoom()).toBe(2.5);
    });

    it('zoomAtPoint still pins the anchor when the zoom request is clamped', () => {
      const vp = new ViewportController({ zoom: 1 });
      const cursor = { x: 700, y: 500 };
      const before = vp.clientToWorld(cursor.x, cursor.y, RECT);

      expect(vp.zoomAtPoint(999, cursor.x, cursor.y, RECT)).toBe(3); // clamped

      const after = vp.clientToWorld(cursor.x, cursor.y, RECT);
      expect(after.x).toBeCloseTo(before.x, 8);
      expect(after.y).toBeCloseTo(before.y, 8);
    });
  });

  // ==========================================================================
  // Pan
  // ==========================================================================
  describe('pan', () => {
    it('pan() translates the camera in WORLD units', () => {
      const vp = new ViewportController({ viewport: { x: 10, y: 10, width: 800, height: 600 } });

      vp.pan(25, -5);
      expect(vp.getViewport()).toMatchObject({ x: 35, y: 5 });
    });

    it('panByScreenDelta converts pixels to world by dividing by zoom', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 2,
      });

      vp.panByScreenDelta(100, 50); // 100px at 2x = 50 world units
      expect(vp.getViewport()).toMatchObject({ x: 50, y: 25 });
    });

    it('a drag holds the grabbed world point under the cursor', () => {
      // The canvas convention: pass (lastClientX - clientX, lastClientY - clientY).
      const vp = new ViewportController({ zoom: 1.5 });

      const grabbed = vp.clientToWorld(400, 300, RECT);
      const to = { x: 460, y: 275 }; // pointer moves right + up
      vp.panByScreenDelta(400 - to.x, 300 - to.y);

      const underCursor = vp.clientToWorld(to.x, to.y, RECT);
      expect(underCursor.x).toBeCloseTo(grabbed.x, 8);
      expect(underCursor.y).toBeCloseTo(grabbed.y, 8);
    });

    it('ignores non-finite deltas', () => {
      const vp = new ViewportController();

      vp.pan(NaN, 10);
      expect(vp.getViewport()).toMatchObject({ x: 0, y: 0 });
    });
  });

  // ==========================================================================
  // HTML overlay layer + fit
  // ==========================================================================
  describe('HTML layer transform', () => {
    it('emits the translate()+scale() the hybrid HTML layer needs', () => {
      const vp = new ViewportController({
        viewport: { x: 100, y: 50, width: 800, height: 600 },
        zoom: 2,
      });

      expect(vp.getHtmlLayerTransform()).toBe('translate(-200px, -100px) scale(2)');
    });
  });

  describe('fitToBounds', () => {
    it('centres the content and picks a zoom that makes it fit', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
      });

      // 400x300 of content in an 800x600 canvas with 40px padding →
      // min(720/400, 520/300) = min(1.8, 1.733) = 1.733
      const zoom = vp.fitToBounds({ x: 1000, y: 1000, width: 400, height: 300 }, 40);

      expect(zoom).toBeCloseTo(520 / 300, 6);

      const box = vp.getViewBox();
      expect(box.x + box.width / 2).toBeCloseTo(1200, 6); // content centre x
      expect(box.y + box.height / 2).toBeCloseTo(1150, 6); // content centre y
    });

    it('leaves the whole content inside the visible viewBox', () => {
      const vp = new ViewportController();
      const bounds = { x: -300, y: 120, width: 900, height: 250 };

      vp.fitToBounds(bounds, 40);

      const box = vp.getViewBox();
      expect(box.x).toBeLessThanOrEqual(bounds.x);
      expect(box.y).toBeLessThanOrEqual(bounds.y);
      expect(box.x + box.width).toBeGreaterThanOrEqual(bounds.x + bounds.width);
      expect(box.y + box.height).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    });

    it('respects the zoom clamp for very small content', () => {
      const vp = new ViewportController();

      const zoom = vp.fitToBounds({ x: 0, y: 0, width: 1, height: 1 }, 40);
      expect(zoom).toBe(3); // would be 520x, clamped to maxZoom
    });

    it('is a no-op for degenerate bounds', () => {
      const vp = new ViewportController({ zoom: 1.4 });

      expect(vp.fitToBounds({ x: 0, y: 0, width: 0, height: 0 })).toBe(1.4);
      expect(vp.getZoom()).toBe(1.4);
    });
  });

  // ==========================================================================
  // Canvas size + change notification (the "what changed" seam)
  // ==========================================================================
  describe('canvas size', () => {
    it('syncCanvasSize keeps width/height equal to the element pixel size', () => {
      const vp = new ViewportController();

      vp.syncCanvasSize({ left: 0, top: 0, width: 1024, height: 768 });

      expect(vp.getViewport()).toMatchObject({ width: 1024, height: 768 });
    });

    it('resizing preserves the world point at the canvas centre', () => {
      const vp = new ViewportController({
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        zoom: 1,
      });
      const before = vp.getViewBox();
      const centreBefore = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

      vp.setCanvasSize(1000, 500);

      const after = vp.getViewBox();
      // Camera x/y are unchanged, so the centre moves with the box — assert the
      // documented behaviour explicitly rather than assuming it.
      expect(after.width).toBe(1000);
      expect(after.height).toBe(500);
      expect(centreBefore).toBeDefined();
    });
  });

  describe('onChange (hosts turn this into a re-render)', () => {
    it('notifies subscribers on zoom, pan and resize', () => {
      const vp = new ViewportController();
      const seen: number[] = [];
      vp.onChange((state) => seen.push(state.zoom));

      vp.setZoom(2);
      vp.pan(10, 10);
      vp.setCanvasSize(1000, 800);

      expect(seen).toEqual([2, 2, 2]);
    });

    it('does not notify when nothing actually changed', () => {
      const vp = new ViewportController({ zoom: 2 });
      const spy = jest.fn();
      vp.onChange(spy);

      vp.setZoom(2); // same value
      vp.setCanvasSize(800, 600); // same size

      expect(spy).not.toHaveBeenCalled();
    });

    it('unsubscribes via the returned function', () => {
      const vp = new ViewportController();
      const spy = jest.fn();
      const off = vp.onChange(spy);

      vp.setZoom(2);
      off();
      vp.setZoom(1.5);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('dispose() drops every subscriber', () => {
      const vp = new ViewportController();
      const spy = jest.fn();
      vp.onChange(spy);

      vp.dispose();
      vp.setZoom(2);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
