// The retained-mode backend itself: high-DPI sizing, the world→device transform,
// dirty-rectangle partial redraw, capabilities, export, disposal.
//
// The canvas is a `RecordingContext2D` behind a fake canvas element, so "did the
// renderer repaint that region?" is answered by looking at the draw calls, not by
// diffing an image. (The PIXELS are checked for real in the browser e2e.)

import { RecordingContext2D } from './canvas-context';
import type { CanvasLike } from './canvas-renderer';
import { CanvasRenderer, parseViewBox } from './canvas-renderer';
import { DirtyRegionTracker, collectEntities, mergeRects, previewIsActive } from './dirty-region';
import { VIEWPORT, buildScene } from './test-scene';

/** A canvas element whose 2D context records instead of rasterising. */
function fakeCanvas(): CanvasLike & { ctx: RecordingContext2D } {
  const ctx = new RecordingContext2D();
  return {
    ctx,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,FAKE',
  };
}

describe('CanvasRenderer — high-DPI', () => {
  it('sizes the backing store in DEVICE pixels and the element in CSS pixels', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const canvas = fakeCanvas();

    const renderer = new CanvasRenderer(scene.engine, {
      canvas,
      hitCanvas: fakeCanvas(),
      devicePixelRatio: 2,
    });
    renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.style!.width).toBe('800px');
    expect(canvas.style!.height).toBe('600px');

    renderer.dispose();
  });

  it('folds dpr AND zoom into the world→device transform', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const canvas = fakeCanvas();

    const renderer = new CanvasRenderer(scene.engine, {
      canvas,
      hitCanvas: fakeCanvas(),
      devicePixelRatio: 2,
    });
    renderer.render(VIEWPORT, 2); // zoom 2, dpr 2 → scale 4

    const draws = canvas.ctx.paintCalls();
    expect(draws.length).toBeGreaterThan(0);
    for (const call of draws) {
      expect((call as { transform: { a: number } }).transform.a).toBeCloseTo(4);
    }

    renderer.dispose();
  });

  it('a dpr change re-sizes the backing store and forces a full repaint', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const canvas = fakeCanvas();

    const renderer = new CanvasRenderer(scene.engine, {
      canvas,
      hitCanvas: fakeCanvas(),
      devicePixelRatio: 1,
    });
    renderer.render(VIEWPORT, 1);
    expect(canvas.width).toBe(800);

    renderer.setDevicePixelRatio(3);
    renderer.render(VIEWPORT, 1);

    expect(canvas.width).toBe(2400);
    expect(renderer.getFrameStats().fullRepaint).toBe(true);

    renderer.dispose();
  });

  it('derives the transform from the tree viewBox, so it cannot drift from SVG mode', () => {
    expect(parseViewBox('10 20 800 600')).toEqual({ x: 10, y: 20, width: 800, height: 600 });
    expect(parseViewBox('nope')).toBeNull();
  });
});

describe('CanvasRenderer — dirty-region partial redraw', () => {
  const setup = () => {
    const scene = buildScene(
      [
        { name: 'a', x: 100, y: 100 },
        { name: 'b', x: 500, y: 400 },
      ],
      false
    );
    const canvas = fakeCanvas();
    const renderer = new CanvasRenderer(scene.engine, {
      canvas,
      hitCanvas: fakeCanvas(),
      devicePixelRatio: 1,
    });
    return { scene, canvas, renderer };
  };

  it('first frame is a full repaint', () => {
    const { renderer, canvas } = setup();
    renderer.render(VIEWPORT, 1);

    expect(renderer.getFrameStats().fullRepaint).toBe(true);
    expect(canvas.ctx.paintCalls().length).toBeGreaterThan(0);

    renderer.dispose();
  });

  it('an UNCHANGED frame repaints nothing at all', () => {
    const { renderer, canvas } = setup();
    renderer.render(VIEWPORT, 1);

    canvas.ctx.reset();
    renderer.render(VIEWPORT, 1);

    // This is the whole point of a retained-mode backend: the pixels are already
    // right, so the second frame costs a tree walk and zero draw calls.
    expect(canvas.ctx.paintCalls()).toHaveLength(0);
    expect(renderer.getFrameStats()).toMatchObject({
      painted: 0,
      dirtyRects: 0,
      fullRepaint: false,
    });

    renderer.dispose();
  });

  it('moving ONE node repaints only that region — not the whole canvas', () => {
    const { scene, renderer, canvas } = setup();
    renderer.render(VIEWPORT, 1);

    canvas.ctx.reset();
    scene.nodes['a'].setPosition(150, 120);
    renderer.render(VIEWPORT, 1);

    const stats = renderer.getFrameStats();
    expect(stats.fullRepaint).toBe(false);
    expect(stats.changedEntities).toBe(1);
    expect(stats.dirtyRects).toBeGreaterThan(0);

    // The far node fell outside every dirty rect and was skipped.
    expect(stats.culled).toBeGreaterThan(0);
    expect(stats.painted).toBeGreaterThan(0);

    // ...and the canvas really was cleared only over the dirty rects.
    const clears = canvas.ctx.calls.filter((c) => c.op === 'clearRect');
    expect(clears.length).toBeGreaterThan(0);
    for (const clear of clears) {
      expect((clear as { w: number }).w).toBeLessThan(800);
    }

    renderer.dispose();
  });

  it("the dirty rect spans the node's OLD and NEW position, so no ghost is left behind", () => {
    const tracker = new DirtyRegionTracker();

    tracker.diff(new Map([['node-a', { type: 'g', key: 'node-a', props: {} }]]), () => ({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    }));

    const moved = tracker.diff(
      new Map([['node-a', { type: 'g', key: 'node-a', props: { moved: true } }]]),
      () => ({ minX: 100, minY: 100, maxX: 110, maxY: 110 })
    );

    expect(moved.rects).toEqual([{ minX: 0, minY: 0, maxX: 110, maxY: 110 }]);
  });

  it('a viewport pan forces a full repaint (every pixel moved)', () => {
    const { renderer } = setup();
    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);
    expect(renderer.getFrameStats().fullRepaint).toBe(false);

    renderer.render({ ...VIEWPORT, x: 50 }, 1);
    expect(renderer.getFrameStats().fullRepaint).toBe(true);

    renderer.dispose();
  });

  it('a theme swap forces a full repaint (every resolved colour changed)', async () => {
    const { renderer } = setup();
    renderer.render(VIEWPORT, 1);

    const { DARK_THEME } = await import('../themes');
    renderer.setTheme(DARK_THEME);
    renderer.render(VIEWPORT, 1);

    expect(renderer.getFrameStats().fullRepaint).toBe(true);

    renderer.dispose();
  });

  it('can be turned off, in which case every frame is full', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const renderer = new CanvasRenderer(scene.engine, {
      canvas: fakeCanvas(),
      hitCanvas: fakeCanvas(),
      devicePixelRatio: 1,
      enableDirtyRegions: false,
    });

    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);
    expect(renderer.getFrameStats().fullRepaint).toBe(true);

    renderer.dispose();
  });
});

describe('DirtyRegionTracker', () => {
  const vnode = (key: string, tag = 0) => ({ type: 'g', key, props: { tag } });

  it('treats an identical VNode object as unchanged — the producer cache IS the change test', () => {
    const tracker = new DirtyRegionTracker();
    const a = vnode('node-a');

    tracker.diff(new Map([['node-a', a]]), () => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 }));

    const measure = jest.fn(() => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 }));
    const second = tracker.diff(new Map([['node-a', a]]), measure);

    expect(second.changed).toEqual([]);
    expect(second.rects).toEqual([]);
    // an unchanged entity is never even measured
    expect(measure).not.toHaveBeenCalled();
  });

  it('reports a removed entity so its pixels get cleared', () => {
    const tracker = new DirtyRegionTracker();
    tracker.diff(new Map([['node-a', vnode('node-a')]]), () => ({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    }));

    const diff = tracker.diff(new Map(), () => null);
    expect(diff.removed).toEqual(['node-a']);
    expect(diff.rects).toEqual([{ minX: 0, minY: 0, maxX: 10, maxY: 10 }]);
  });

  it('falls back to a full repaint when too much changed to be worth clipping', () => {
    const tracker = new DirtyRegionTracker();
    const bounds = () => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 });

    tracker.diff(
      new Map(Array.from({ length: 100 }, (_, i) => [`node-${i}`, vnode(`node-${i}`)] as const)),
      bounds
    );
    const diff = tracker.diff(
      new Map(Array.from({ length: 100 }, (_, i) => [`node-${i}`, vnode(`node-${i}`, 1)] as const)),
      bounds
    );

    expect(diff.rects).toBeNull(); // null = repaint everything
  });

  it('merges overlapping rects instead of clipping a dozen slivers', () => {
    const merged = mergeRects([
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      { minX: 8, minY: 8, maxX: 20, maxY: 20 },
      { minX: 500, minY: 500, maxX: 510, maxY: 510 },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
  });

  it('collects entities from the links and nodes layers only', () => {
    const entities = collectEntities({
      type: 'svg',
      props: {},
      children: [
        {
          type: 'g',
          key: 'links-layer',
          props: {},
          children: [{ type: 'g', key: 'link-1', props: {} }],
        },
        {
          type: 'g',
          key: 'nodes-layer',
          props: {},
          children: [{ type: 'g', key: 'node-1', props: {} }],
        },
        { type: 'g', key: 'connection-preview-layer', props: {}, children: [] },
        { type: 'defs', key: 'defs', props: {}, children: [] },
      ],
    });

    expect([...entities.keys()].sort()).toEqual(['link-1', 'node-1']);
  });

  it('detects a live connection preview (which has no stable identity)', () => {
    const tree = (children: unknown[]) => ({
      type: 'svg',
      props: {},
      children: [{ type: 'g', key: 'connection-preview-layer', props: {}, children }],
    });

    expect(previewIsActive(tree([]) as never)).toBe(false);
    expect(previewIsActive(tree([{ type: 'path', props: {} }]) as never)).toBe(true);
  });
});

describe('CanvasRenderer — contract', () => {
  it('declares honest capabilities (foreignObject is NOT one of them)', () => {
    const scene = buildScene([{ name: 'a', x: 0, y: 0 }], false);
    const renderer = new CanvasRenderer(scene.engine, {
      canvas: fakeCanvas(),
      hitCanvas: fakeCanvas(),
    });

    expect(renderer.capabilities).toMatchObject({
      supportsHitTest: true,
      supportsBatching: true,
      supportsExport: true,
      supportsMeasurement: true,
      supportsForeignObject: false,
      supportsOffscreen: true,
    });
    expect(renderer.mode).toBe('canvas');

    renderer.dispose();
  });

  it('reports foreignObject nodes it could not paint, so a host can overlay them', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    scene.nodes['a'].setMetadata('useForeignObject', true);

    const renderer = new CanvasRenderer(scene.engine, {
      canvas: fakeCanvas(),
      hitCanvas: fakeCanvas(),
    });
    renderer.render(VIEWPORT, 1);

    expect(renderer.getUnpaintableNodes()).toHaveLength(1);
    expect(renderer.getUnpaintableNodes()[0].type).toBe('foreignObject');

    renderer.dispose();
  });

  it('measures text through the real context when it has one', () => {
    const scene = buildScene([{ name: 'a', x: 0, y: 0 }], false);
    const renderer = new CanvasRenderer(scene.engine, { canvas: fakeCanvas() });

    const metrics = renderer.measureText('hello', { fontSize: 20 });
    expect(metrics.width).toBeCloseTo(5 * 20 * 0.6);
    expect(metrics.height).toBeCloseTo(24);

    renderer.dispose();
  });

  it('exports a PNG data URL, and refuses to fake an SVG export', async () => {
    const scene = buildScene([{ name: 'a', x: 0, y: 0 }], false);
    const renderer = new CanvasRenderer(scene.engine, { canvas: fakeCanvas() });
    renderer.render(VIEWPORT, 1);

    await expect(renderer.export('png')).resolves.toContain('data:image/png');
    await expect(renderer.export('svg')).rejects.toThrow(/cannot export SVG/i);

    renderer.dispose();
  });

  it('reports metrics from the shared producer', () => {
    const scene = buildScene([
      { name: 'a', x: 100, y: 100 },
      { name: 'b', x: 400, y: 300 },
    ]);
    const renderer = new CanvasRenderer(scene.engine, { canvas: fakeCanvas() });
    renderer.render(VIEWPORT, 1);

    const metrics = renderer.getPerformanceMetrics();
    expect(metrics.mode).toBe('canvas');
    expect(metrics.nodeCount).toBe(2);
    expect(metrics.linkCount).toBe(1);
    expect(metrics.memoryUsage).toBeGreaterThan(0);

    renderer.dispose();
  });

  it('runs with NO canvas at all (headless): still measures and hit-tests', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const renderer = new CanvasRenderer(scene.engine, { enableHitDetection: false });

    expect(() => renderer.render(VIEWPORT, 1)).not.toThrow();
    expect(renderer.pick(150, 130)).toMatchObject({ kind: 'node' });
    expect(renderer.capabilities.supportsOffscreen).toBe(false);

    renderer.dispose();
  });

  it('disposing twice is safe', () => {
    const scene = buildScene([{ name: 'a', x: 0, y: 0 }], false);
    const renderer = new CanvasRenderer(scene.engine, { canvas: fakeCanvas() });
    renderer.render(VIEWPORT, 1);

    expect(() => {
      renderer.dispose();
      renderer.dispose();
    }).not.toThrow();
  });
});
