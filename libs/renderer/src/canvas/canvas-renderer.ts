// canvas-renderer.ts — the retained-mode Canvas 2D backend.
//
// The architecture, in one paragraph:
//
//   `SVGRenderer` is not really an SVG renderer — it is the VNODE PRODUCER. It
//   turns (diagram, viewport, zoom) into a backend-agnostic VNode tree, applying
//   the engine's spatial index, viewport culling, LOD tiers and per-entity VNode
//   caching along the way. `CanvasRenderer` CONSUMES that same tree and paints it
//   to a 2D context instead of reconciling it into SVG DOM. Both backends are
//   therefore, by construction, drawing exactly the same scene — and a diagram
//   can switch between them at runtime (see render-backend.ts) because there is
//   no second model, no second style pipeline and no second geometry pass.
//
// What this backend adds on top of the shared tree:
//
//   * a paired OFFSCREEN HIT CANVAS with colour-keyed picking — every pickable
//     element is painted a second time in a unique flat colour, so hit-testing is
//     one `getImageData(1,1)` read, O(1) in the number of elements. That is the
//     property that lets canvas mode scale past the point where an SVG DOM (with
//     one element per shape and CSS-driven hit regions) collapses;
//   * devicePixelRatio scaling — the backing store is sized in DEVICE pixels
//     while the element stays sized in CSS pixels, so lines are crisp on retina
//     instead of the blurry 1x upscale a naive canvas gives;
//   * DIRTY-RECTANGLE partial redraw — driven by VNode object identity, which the
//     producer's cache already gives us for free (see dirty-region.ts);
//   * a geometric picking fallback for headless use, which is also the oracle the
//     colour-key picker is tested against.

import type { DiagramEngine } from '@grafloria/engine';
import type {
  ExportFormat,
  ExportOptions,
  IRenderer,
  PerformanceMetrics,
  RendererCapabilities,
  SVGRendererConfig,
  TextStyle,
  TextMetrics,
} from '../types/renderer.interface';
import type { Rectangle } from '../types/geometry.types';
import type { Theme } from '../types/theme.types';
import type { VNode } from '../types/vnode.types';
import { LIGHT_THEME } from '../themes';
import { SVGRenderer } from '../svg/svg-renderer';
import { type Bounds, type Matrix, distanceToPath, pointInPath } from './path-geometry';
import { CanvasStyleResolver, readCssVarOverrides } from './style-resolution';
import { type Canvas2DLike, NULL_CONTEXT } from './canvas-context';
import { type HitRecord, VNodePainter, colorKeyFromPixel, nextColorKey } from './vnode-painter';
import { DirtyRegionTracker, collectEntities, previewIsActive } from './dirty-region';

/** A canvas element, structurally — so tests can hand in a fake. */
export interface CanvasLike {
  width: number;
  height: number;
  style?: { width?: string; height?: string; [key: string]: unknown };
  getContext(id: '2d', options?: unknown): Canvas2DLike | null;
  toDataURL?(type?: string, quality?: number): string;
}

export interface CanvasRendererOptions {
  /** The visible canvas. Required to paint; omit only for pure measurement. */
  canvas?: CanvasLike | null;
  /**
   * The offscreen picking canvas. Created from `canvas`'s document when absent.
   * Pass `null` (with `enableHitDetection: false`) to run without one.
   */
  hitCanvas?: CanvasLike | null;
  /** Default: `globalThis.devicePixelRatio ?? 1`. Overridable for tests. */
  devicePixelRatio?: number;
  theme?: Theme;
  /** Config for the VNode producer. Defaults match the SVG backend exactly. */
  producerConfig?: SVGRendererConfig;
  /**
   * Reuse an existing VNode producer — this is how a live diagram switches
   * backends without rebuilding its scene (render-backend.ts).
   */
  producer?: SVGRenderer;
  /** Enable the colour-keyed hit canvas. Default true. */
  enableHitDetection?: boolean;
  /**
   * Sub-sampling factor for the hit canvas. 1 = pixel-exact picking (default).
   * 0.5 halves its memory at the cost of ~1px of picking slop.
   */
  hitCanvasScale?: number;
  /** Enable dirty-rectangle partial redraw. Default true. */
  enableDirtyRegions?: boolean;
  /**
   * Element whose computed `--grafloria-*` custom properties override the theme —
   * normally the canvas's host. This is what lets a host theme canvas mode with
   * the same CSS variables it uses for SVG mode.
   */
  styleHost?: Element | null;
}

/** What was under the cursor. */
export interface CanvasPick {
  kind: HitRecord['kind'];
  id: string;
  vnode: VNode;
}

/** Per-frame numbers the dirty-redraw path actually produces. */
export interface CanvasFrameStats {
  /** Elements drawn this frame. */
  painted: number;
  /** Elements skipped because they fell outside every dirty rect. */
  culled: number;
  /** Dirty rects this frame; 0 means a full repaint. */
  dirtyRects: number;
  /** True when the whole canvas was repainted. */
  fullRepaint: boolean;
  /** Entities whose VNode changed. */
  changedEntities: number;
}

export class CanvasRenderer implements IRenderer {
  readonly mode = 'canvas' as const;

  readonly capabilities: RendererCapabilities;

  private readonly producer: SVGRenderer;
  private readonly ownsProducer: boolean;
  private readonly resolver: CanvasStyleResolver;
  private readonly painter: VNodePainter;
  private readonly tracker = new DirtyRegionTracker();

  private canvas: CanvasLike | null;
  private ctx: Canvas2DLike | null;
  private hitCanvas: CanvasLike | null = null;
  private hitCtx: Canvas2DLike | null = null;

  private theme: Theme;
  private dpr: number;
  private readonly enableHitDetection: boolean;
  private readonly enableDirtyRegions: boolean;
  private readonly hitCanvasScale: number;
  private readonly styleHost: Element | null;

  /** Colour keys, memoised on a STABLE element id — see PaintOptions.allocateColorKey. */
  private readonly colorKeys = new Map<string, string>();
  private colorKeyCounter = 0;

  private lastWorldToDevice: Matrix | null = null;
  private hitRecords: HitRecord[] = [];
  private colorKeyIndex = new Map<string, HitRecord>();
  private unpaintable: VNode[] = [];
  private readonly textCache = new Map<string, TextMetrics>();

  private lastViewportKey = '';
  private lastRenderTime = 0;
  private lastStats: CanvasFrameStats = {
    painted: 0,
    culled: 0,
    dirtyRects: 0,
    fullRepaint: true,
    changedEntities: 0,
  };
  private frameCount = 0;
  private fps = 0;
  private fpsTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(engine: DiagramEngine, options: CanvasRendererOptions = {}) {
    this.theme = options.theme ?? LIGHT_THEME;

    // ONE VNode contract: the canvas backend drives the SAME producer, with the
    // SAME config, that SVG mode drives. It does not get a private "canvas-
    // friendly" tree — if it did, backend parity would be a hope, not a property.
    this.producer = options.producer ?? new SVGRenderer(engine, options.producerConfig, this.theme);
    this.ownsProducer = !options.producer;

    this.styleHost = options.styleHost ?? null;
    this.resolver = new CanvasStyleResolver({
      theme: this.theme,
      varOverrides: readCssVarOverrides(this.styleHost),
    });
    this.painter = new VNodePainter(this.resolver);

    this.dpr = options.devicePixelRatio ?? readDevicePixelRatio();
    this.enableHitDetection = options.enableHitDetection ?? true;
    this.enableDirtyRegions = options.enableDirtyRegions ?? true;
    this.hitCanvasScale = clamp(options.hitCanvasScale ?? 1, 0.1, 1);

    this.canvas = options.canvas ?? null;
    this.ctx = safeGetContext(this.canvas);

    if (this.enableHitDetection) {
      this.hitCanvas = options.hitCanvas ?? createOffscreenCanvas(this.canvas);
      this.hitCtx = safeGetContext(this.hitCanvas);
    }

    this.capabilities = {
      supportsHitTest: true,
      supportsBatching: true,
      supportsExport: typeof this.canvas?.toDataURL === 'function',
      supportsMeasurement: true,
      // Canvas cannot rasterise a DOM subtree. Nodes that asked for
      // foreignObject are reported via `getUnpaintableNodes()` so a host can
      // overlay real HTML on top of the canvas — the hybrid answer — rather than
      // having them silently vanish.
      supportsForeignObject: false,
      supportsFilters: this.ctx ? 'filter' in this.ctx : false,
      supportsOffscreen: !!this.hitCtx,
    };

    this.startFPSTracking();
  }

  // =========================================================================
  // IRenderer
  // =========================================================================

  /**
   * Produce the frame's VNode tree and paint it.
   *
   * Returns the tree (rather than `void`) on purpose: it is the same tree SVG
   * mode would have reconciled, so a caller can assert parity, or hand it to the
   * SVG patcher, without re-rendering.
   */
  render(viewport: Rectangle, zoom: number): VNode {
    const start = now();

    const tree = this.producer.render(viewport, zoom);
    const worldToDevice = this.computeWorldToDevice(tree, viewport, zoom);

    // Any camera / DPR change invalidates every cached pixel on the canvas.
    const viewportKey = `${viewport.x},${viewport.y},${viewport.width},${viewport.height},${zoom},${this.dpr}`;
    if (viewportKey !== this.lastViewportKey) {
      this.lastViewportKey = viewportKey;
      this.tracker.invalidateAll();
      this.syncCanvasSize(viewport);
    }

    this.lastWorldToDevice = worldToDevice;

    this.paintFrame(tree, worldToDevice);

    this.lastRenderTime = now() - start;
    this.frameCount++;
    return tree;
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const producerMetrics = this.producer.getPerformanceMetrics();
    return {
      mode: 'canvas',
      nodeCount: producerMetrics.nodeCount,
      linkCount: producerMetrics.linkCount,
      renderTime: this.lastRenderTime,
      fps: this.fps,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * The topmost element at a WORLD coordinate.
   *
   * Colour-keyed pixel picking when a real hit canvas is available (O(1), and
   * exactly what was drawn); the geometric fallback otherwise. They are two
   * implementations of ONE geometry — both read the hit records the paint pass
   * produced — and they are pinned to each other, and to the engine's own
   * `getNodeAtPosition`, in `canvas-hit-parity.spec.ts` and in the browser e2e.
   */
  hitTest(x: number, y: number): VNode | null {
    return this.pick(x, y)?.vnode ?? null;
  }

  /** Hit-test, with the entity identity the interaction layer wants. */
  pick(x: number, y: number): CanvasPick | null {
    const record = this.pickPixel(x, y) ?? this.pickGeometric(x, y);
    if (!record) return null;
    return { kind: record.kind, id: record.id, vnode: record.vnode };
  }

  /**
   * Colour-key pick: read one pixel off the hit canvas and look the colour up.
   * `null` when there is no hit canvas (headless) OR when the pixel is empty.
   */
  pickPixel(x: number, y: number): HitRecord | null {
    const ctx = this.hitCtx as (Canvas2DLike & Partial<CanvasRenderingContext2D>) | null;
    if (!ctx || typeof ctx.getImageData !== 'function' || !this.lastWorldToDevice) return null;

    const m = this.lastWorldToDevice;
    const px = Math.round((m.a * x + m.c * y + m.e) * this.hitCanvasScale);
    const py = Math.round((m.b * x + m.d * y + m.f) * this.hitCanvasScale);

    const w = this.hitCanvas?.width ?? 0;
    const h = this.hitCanvas?.height ?? 0;
    if (px < 0 || py < 0 || px >= w || py >= h) return null;

    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(px, py, 1, 1).data;
    } catch {
      return null; // tainted canvas / no rasteriser
    }

    const key = colorKeyFromPixel(data[0], data[1], data[2], data[3]);
    if (!key) return null;
    // An antialiased edge pixel is a blend of two keys and matches no record —
    // which reads as "miss", never as "the wrong entity". See `nextColorKey`.
    return this.colorKeyIndex.get(key) ?? null;
  }

  /**
   * Geometric pick: reverse paint order over the hit records, point-in-path for
   * filled regions and distance-to-path for stroked ones. O(n), used headlessly
   * and as the oracle the pixel picker is checked against.
   */
  pickGeometric(x: number, y: number): HitRecord | null {
    const query = { x, y };
    for (let i = this.hitRecords.length - 1; i >= 0; i--) {
      const record = this.hitRecords[i];
      if (record.bounds && !withinPadded(record.bounds, query, record.tolerance)) continue;
      if (record.filled) {
        if (pointInPath(record.cmds, query)) return record;
      } else if (distanceToPath(record.cmds, query) <= record.tolerance) {
        return record;
      }
    }
    return null;
  }

  /**
   * Text measurement through the real 2D context when there is one (proper glyph
   * metrics), falling back to the same average-glyph estimate the SVG text-block
   * engine uses so headless measurement stays consistent with the wrapping the
   * producer already did.
   */
  measureText(text: string, style: TextStyle): TextMetrics {
    const fontSize = style.fontSize ?? 12;
    const cacheKey = `${text}|${fontSize}|${style.fontFamily ?? ''}|${style.fontWeight ?? ''}`;
    const cached = this.textCache.get(cacheKey);
    if (cached) return cached;

    let width: number;
    if (this.ctx) {
      const previous = this.ctx.font;
      this.ctx.font = `${style.fontWeight ?? 'normal'} ${fontSize}px ${
        style.fontFamily ?? 'sans-serif'
      }`;
      width = this.ctx.measureText(text).width;
      this.ctx.font = previous;
    } else {
      width = text.length * fontSize * 0.6;
    }

    const metrics: TextMetrics = {
      width,
      height: fontSize * (style.lineHeight ?? 1.2),
      baseline: fontSize * 0.8,
    };
    this.textCache.set(cacheKey, metrics);
    return metrics;
  }

  /** Export the CURRENT canvas contents. `svg` is not a canvas capability. */
  async export(format: ExportFormat, options: ExportOptions = {}): Promise<string> {
    if (format === 'svg') {
      throw new Error(
        'CanvasRenderer cannot export SVG — switch the backend to SVG mode (DiagramRenderBackend), or use the VNode → SVG serializer in export/.'
      );
    }
    if (!this.canvas || typeof this.canvas.toDataURL !== 'function') {
      throw new Error('CanvasRenderer.export requires a canvas with toDataURL');
    }
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    return this.canvas.toDataURL(mime, options.quality ?? 0.92);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.fpsTimer !== undefined) clearInterval(this.fpsTimer);
    this.fpsTimer = undefined;

    // Only tear down the producer we created — a producer shared with another
    // backend (a live mode switch) belongs to the caller.
    if (this.ownsProducer) this.producer.dispose();

    this.tracker.reset();
    this.hitRecords = [];
    this.colorKeyIndex.clear();
    this.colorKeys.clear();
    this.textCache.clear();
    this.ctx = null;
    this.canvas = null;
    this.hitCtx = null;
    this.hitCanvas = null;
  }

  // =========================================================================
  // Canvas-specific API
  // =========================================================================

  getTheme(): Theme {
    return this.theme;
  }

  /** Swap the theme. Repaints everything: every resolved colour just changed. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    this.producer.setTheme(theme);
    this.resolver.setTheme(theme, readCssVarOverrides(this.styleHost));
    this.tracker.invalidateAll();
  }

  /** The VNode producer — shared with the SVG backend on a mode switch. */
  getProducer(): SVGRenderer {
    return this.producer;
  }

  /** Attach (or replace) the canvas this renderer paints into. */
  setCanvas(canvas: CanvasLike | null, hitCanvas?: CanvasLike | null): void {
    this.canvas = canvas;
    this.ctx = safeGetContext(canvas);

    if (this.enableHitDetection) {
      this.hitCanvas = hitCanvas ?? createOffscreenCanvas(canvas);
      this.hitCtx = safeGetContext(this.hitCanvas);
    }

    this.lastViewportKey = '';
    this.tracker.reset();
  }

  /** Change the device pixel ratio (a window moved to a retina display). */
  setDevicePixelRatio(dpr: number): void {
    if (!isFinite(dpr) || dpr <= 0 || dpr === this.dpr) return;
    this.dpr = dpr;
    this.lastViewportKey = '';
    this.tracker.invalidateAll();
  }

  getDevicePixelRatio(): number {
    return this.dpr;
  }

  /** What the last frame actually repainted — the dirty-region proof. */
  getFrameStats(): CanvasFrameStats {
    return { ...this.lastStats };
  }

  /** Every pickable region of the current frame, in paint order. */
  getHitRecords(): readonly HitRecord[] {
    return this.hitRecords;
  }

  /**
   * Nodes the canvas could not paint (`foreignObject` — live HTML/components).
   * A host that uses them should mount an HTML overlay for exactly these.
   */
  getUnpaintableNodes(): readonly VNode[] {
    return this.unpaintable;
  }

  /** Force the next frame to repaint the whole canvas. */
  invalidate(): void {
    this.tracker.invalidateAll();
  }

  // =========================================================================
  // internals
  // =========================================================================

  /**
   * World → DEVICE pixels.
   *
   * Read straight off the tree's `viewBox`, so the canvas maps world space with
   * the exact same transform the SVG backend hands to the browser. If these two
   * ever disagreed, the picture and the hit-tester would silently drift apart at
   * zoom ≠ 1 — which is precisely the bug the shared `viewBox` convention in
   * `ViewportController` exists to prevent.
   */
  private computeWorldToDevice(tree: VNode, viewport: Rectangle, zoom: number): Matrix {
    const viewBox = parseViewBox(tree.props?.['viewBox']) ?? {
      x: viewport.x,
      y: viewport.y,
      width: viewport.width / zoom,
      height: viewport.height / zoom,
    };

    const scale = zoom * this.dpr;
    return {
      a: scale,
      b: 0,
      c: 0,
      d: scale,
      e: -viewBox.x * scale,
      f: -viewBox.y * scale,
    };
  }

  /**
   * High-DPI: the backing store is in DEVICE pixels, the element stays in CSS
   * pixels. Skipping this is what makes a naive canvas look soft on a retina
   * screen — the browser upscales a 1x bitmap into a 2x box.
   */
  private syncCanvasSize(viewport: Rectangle): void {
    const cssWidth = Math.max(1, Math.round(viewport.width));
    const cssHeight = Math.max(1, Math.round(viewport.height));

    if (this.canvas) {
      this.canvas.width = Math.round(cssWidth * this.dpr);
      this.canvas.height = Math.round(cssHeight * this.dpr);
      if (this.canvas.style) {
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;
      }
    }

    if (this.hitCanvas) {
      this.hitCanvas.width = Math.max(1, Math.round(cssWidth * this.dpr * this.hitCanvasScale));
      this.hitCanvas.height = Math.max(1, Math.round(cssHeight * this.dpr * this.hitCanvasScale));
    }
  }

  private paintFrame(tree: VNode, worldToDevice: Matrix): void {
    const entities = collectEntities(tree);

    // A live connection preview has no stable identity and follows the pointer,
    // so a frame carrying one is repainted whole.
    if (previewIsActive(tree)) this.tracker.invalidateAll();

    const diff = this.enableDirtyRegions
      ? this.tracker.diff(entities, (vnode) => this.painter.measure(vnode))
      : { rects: null, changed: [...entities.keys()], removed: [] };

    const full = diff.rects === null;
    const rects = diff.rects ?? [];

    if (!full && rects.length === 0) {
      // Nothing changed: the canvas already holds the right pixels. THIS is the
      // payoff of a retained-mode backend — a no-op frame costs a tree walk, not
      // a repaint.
      this.lastStats = {
        painted: 0,
        culled: 0,
        dirtyRects: 0,
        fullRepaint: false,
        changedEntities: 0,
      };
      return;
    }

    const paintOptions = {
      worldToDevice,
      dirtyWorld: full ? undefined : rects,
      allocateColorKey: (id: string) => this.colorKeyFor(id),
    };

    // --- visible canvas -----------------------------------------------------
    let painted = 0;
    let culled = 0;

    if (this.ctx) {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (full) {
        ctx.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
      } else {
        clipToRects(ctx, rects, worldToDevice, 1);
        for (const rect of rects) {
          const d = deviceRect(rect, worldToDevice, 1);
          ctx.clearRect(d.x, d.y, d.w, d.h);
        }
      }

      const result = this.painter.paint(ctx, tree, paintOptions);
      ctx.restore();

      painted = result.paintedCount;
      culled = result.culledCount;
      this.hitRecords = result.hitRecords;
      this.colorKeyIndex = result.colorKeyIndex;
      this.unpaintable = result.unpaintableNodes;
    } else {
      // No 2D context (headless): still build the hit index, so hit-testing and
      // measurement work without a rasteriser.
      const result = this.painter.paint(NULL_CONTEXT, tree, {
        ...paintOptions,
        dirtyWorld: undefined,
        measureOnly: true,
      });
      this.hitRecords = result.hitRecords;
      this.colorKeyIndex = result.colorKeyIndex;
      this.unpaintable = result.unpaintableNodes;
    }

    // --- offscreen picking canvas ------------------------------------------
    if (this.hitCtx) {
      const ctx = this.hitCtx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (full) {
        ctx.clearRect(0, 0, this.hitCanvas?.width ?? 0, this.hitCanvas?.height ?? 0);
      } else {
        clipToRects(ctx, rects, worldToDevice, this.hitCanvasScale);
        for (const rect of rects) {
          const d = deviceRect(rect, worldToDevice, this.hitCanvasScale);
          ctx.clearRect(d.x, d.y, d.w, d.h);
        }
      }

      this.painter.paint(ctx, tree, {
        ...paintOptions,
        worldToDevice: scaleMatrix(worldToDevice, this.hitCanvasScale),
        pickingPass: true,
      });
      ctx.restore();
    }

    this.lastStats = {
      painted,
      culled,
      dirtyRects: full ? 0 : rects.length,
      fullRepaint: full,
      changedEntities: diff.changed.length,
    };
  }

  /** Stable colour key for an element id, minted once and never recycled. */
  private colorKeyFor(stableId: string): string {
    let key = this.colorKeys.get(stableId);
    if (!key) {
      key = nextColorKey(this.colorKeyCounter++);
      this.colorKeys.set(stableId, key);
    }
    return key;
  }

  private startFPSTracking(): void {
    if (typeof setInterval !== 'function') return;
    this.fpsTimer = setInterval(() => {
      this.fps = this.frameCount;
      this.frameCount = 0;
    }, 1000);
    // Never hold a Node process open for a frame counter.
    (this.fpsTimer as unknown as { unref?: () => void })?.unref?.();
  }

  private estimateMemoryUsage(): number {
    const backing = (this.canvas?.width ?? 0) * (this.canvas?.height ?? 0) * 4;
    const hit = (this.hitCanvas?.width ?? 0) * (this.hitCanvas?.height ?? 0) * 4;
    // ~200 bytes per retained hit record (flattened command list + bookkeeping).
    return backing + hit + this.hitRecords.length * 200;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function readDevicePixelRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof dpr === 'number' && dpr > 0 ? dpr : 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * jsdom throws "not implemented" from `getContext('2d')` rather than returning
 * null. A headless renderer must degrade to the geometric picking path, not
 * explode — so the throw is absorbed here, in the one place that calls it.
 */
function safeGetContext(canvas: CanvasLike | null | undefined): Canvas2DLike | null {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  try {
    return canvas.getContext('2d') ?? null;
  } catch {
    return null;
  }
}

/** `"0 0 800 600"` → a rectangle. */
export function parseViewBox(raw: unknown): Rectangle | null {
  if (typeof raw !== 'string') return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((v) => parseFloat(v));
  if (parts.length < 4 || parts.some((v) => Number.isNaN(v))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function scaleMatrix(m: Matrix, s: number): Matrix {
  return { a: m.a * s, b: m.b * s, c: m.c * s, d: m.d * s, e: m.e * s, f: m.f * s };
}

function deviceRect(
  bounds: Bounds,
  m: Matrix,
  scale: number
): { x: number; y: number; w: number; h: number } {
  const x0 = (m.a * bounds.minX + m.c * bounds.minY + m.e) * scale;
  const y0 = (m.b * bounds.minX + m.d * bounds.minY + m.f) * scale;
  const x1 = (m.a * bounds.maxX + m.c * bounds.maxY + m.e) * scale;
  const y1 = (m.b * bounds.maxX + m.d * bounds.maxY + m.f) * scale;

  // Grow to whole pixels: a dirty rect that lands on a fraction would otherwise
  // leave a seam of stale pixels along its edge.
  const x = Math.floor(Math.min(x0, x1));
  const y = Math.floor(Math.min(y0, y1));
  return {
    x,
    y,
    w: Math.ceil(Math.max(x0, x1)) - x,
    h: Math.ceil(Math.max(y0, y1)) - y,
  };
}

/**
 * Clip subsequent painting to the dirty rects. The clip is set under the
 * IDENTITY transform and is stored in device space, so it survives the per-shape
 * `setTransform` calls the painter makes.
 */
function clipToRects(ctx: Canvas2DLike, rects: Bounds[], m: Matrix, scale: number): void {
  ctx.beginPath();
  for (const rect of rects) {
    const d = deviceRect(rect, m, scale);
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.w, d.y);
    ctx.lineTo(d.x + d.w, d.y + d.h);
    ctx.lineTo(d.x, d.y + d.h);
    ctx.closePath();
  }
  ctx.clip();
}

function withinPadded(bounds: Bounds, p: { x: number; y: number }, pad: number): boolean {
  return (
    p.x >= bounds.minX - pad &&
    p.x <= bounds.maxX + pad &&
    p.y >= bounds.minY - pad &&
    p.y <= bounds.maxY + pad
  );
}

/** Create the offscreen hit canvas next to the visible one. */
function createOffscreenCanvas(source: CanvasLike | null | undefined): CanvasLike | null {
  const doc =
    (source as unknown as { ownerDocument?: Document })?.ownerDocument ??
    (globalThis as { document?: Document }).document;
  if (!doc || typeof doc.createElement !== 'function') return null;
  return doc.createElement('canvas') as unknown as CanvasLike;
}
