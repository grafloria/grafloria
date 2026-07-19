import type { Rectangle } from '../types/geometry.types';

/**
 * A point in world space. Declared structurally (rather than imported from
 * `@grafloria/engine`) so the viewport module stays dependency-free: camera math
 * needs no diagram model. Structurally identical to `Point` from `@grafloria/engine`,
 * so the two interoperate without conversion.
 */
export interface ViewportPoint {
  x: number;
  y: number;
}

/**
 * The subset of `DOMRect` the camera actually needs. Any `getBoundingClientRect()`
 * result satisfies it; tests can pass a plain object. Keeping it structural is
 * what lets this class run in Node with no DOM.
 */
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Immutable snapshot of the camera. */
export interface ViewportState {
  viewport: Rectangle;
  zoom: number;
}

export interface ViewportControllerOptions {
  /**
   * Camera rectangle. `x`/`y` are WORLD coordinates; `width`/`height` are the
   * canvas's CSS-PIXEL dimensions (see the coordinate contract below).
   */
  viewport?: Rectangle;
  zoom?: number;
  /** Default 0.1 — matches `DiagramCanvasComponent.minZoom`. */
  minZoom?: number;
  /** Default 3.0 — matches `DiagramCanvasComponent.maxZoom`. */
  maxZoom?: number;
  /** Additive step applied per wheel notch. Default 0.1. */
  zoomSensitivity?: number;
}

export type ViewportChangeListener = (state: ViewportState) => void;

/** Remove a previously registered listener. */
export type Unsubscribe = () => void;

const DEFAULT_VIEWPORT: Rectangle = { x: 0, y: 0, width: 800, height: 600 };

/**
 * ViewportController — the framework-agnostic camera.
 *
 * This is the piece every framework wrapper otherwise re-implements (and gets
 * subtly wrong): screen↔world conversion, zoom clamping, pan accumulation, and
 * the `viewBox` convention that the SVG renderer and the hit-tester MUST agree
 * on. Owning it here means a React/Vue/web-component host inherits pixel-exact
 * hit-testing for free.
 *
 * Like {@link InteractionController} it answers **"what is the camera now?"** and
 * never **"who should re-render?"** — hosts subscribe via {@link onChange} and
 * translate that into their own render trigger (`markForCheck`, `setState`, …).
 * It has zero framework imports, zero engine imports, and no DOM dependency:
 * callers hand it a plain {@link CanvasRect}, not an element.
 *
 * ## The coordinate contract
 *
 * `viewport.x/y` are WORLD coordinates. `viewport.width/height` are the canvas's
 * **CSS-pixel** size — NOT a world-space span. The world span actually shown is
 * derived by dividing by `zoom`, which is exactly what {@link getViewBox} does:
 *
 * ```text
 *   center      = (viewport.x + w/2, viewport.y + h/2)      // zoom is centre-preserving
 *   viewBox.w/h = (w / zoom, h / zoom)                      // higher zoom ⇒ less world visible
 *   viewBox.x/y = center − viewBox.w/h / 2
 * ```
 *
 * This is the identical formula `SVGRenderer.render()` applies to the viewport
 * it is handed (`libs/renderer/src/svg/svg-renderer.ts`, "Apply zoom to viewBox"),
 * and the one {@link clientToWorld} inverts. Because both sides derive from the
 * same {@link getViewBox}, screen→world round-trips exactly at any zoom — see
 * the round-trip tests in `viewport-controller.spec.ts`.
 *
 * ⚠️ Feed {@link getRenderViewport} — not a pre-scaled rectangle — to
 * `IRenderer.render(viewport, zoom)`. Dividing width/height by `zoom` *before*
 * calling `render()` makes the renderer divide by `zoom` a second time, applying
 * zoom quadratically and desynchronising the picture from the hit-tester at any
 * zoom ≠ 1. (`DiagramCanvasComponent.calculateActualViewport()` currently does
 * exactly that; the fix belongs to the zoom card and is why this convention now
 * lives in one place.)
 */
export class ViewportController {
  protected viewport: Rectangle;
  protected zoom: number;
  protected readonly minZoom: number;
  protected readonly maxZoom: number;
  protected readonly zoomSensitivity: number;

  private readonly listeners = new Set<ViewportChangeListener>();

  constructor(options: ViewportControllerOptions = {}) {
    this.viewport = { ...(options.viewport ?? DEFAULT_VIEWPORT) };
    this.minZoom = options.minZoom ?? 0.1;
    this.maxZoom = options.maxZoom ?? 3.0;
    this.zoomSensitivity = options.zoomSensitivity ?? 0.1;
    this.zoom = this.clampZoom(options.zoom ?? 1.0);
  }

  // ==========================================================================
  // State
  // ==========================================================================

  getViewport(): Rectangle {
    return { ...this.viewport };
  }

  getZoom(): number {
    return this.zoom;
  }

  getState(): ViewportState {
    return { viewport: this.getViewport(), zoom: this.zoom };
  }

  /** Replace the camera rectangle wholesale. */
  setViewport(viewport: Rectangle): void {
    this.viewport = { ...viewport };
    this.emit();
  }

  /**
   * Track the canvas element's pixel size. Call on mount and on resize: the
   * width/height of the camera rect must stay equal to the canvas's CSS-pixel
   * size for {@link clientToWorld} to be the true inverse of the rendered
   * `viewBox` (see the coordinate contract).
   */
  setCanvasSize(width: number, height: number): void {
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { ...this.viewport, width, height };
    this.emit();
  }

  /** Convenience form of {@link setCanvasSize} taking a `getBoundingClientRect()`. */
  syncCanvasSize(rect: CanvasRect): void {
    this.setCanvasSize(rect.width, rect.height);
  }

  // ==========================================================================
  // Zoom
  // ==========================================================================

  /** Clamp to `[minZoom, maxZoom]`. Non-finite input falls back to the current zoom. */
  clampZoom(zoom: number): number {
    if (!isFinite(zoom)) return this.zoom ?? 1;
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /** Set zoom (centre-preserving), clamped. Returns the zoom actually applied. */
  setZoom(zoom: number): number {
    const next = this.clampZoom(zoom);
    if (next === this.zoom) return next;
    this.zoom = next;
    this.emit();
    return next;
  }

  /**
   * Additive zoom step, clamped — the convention the Angular canvas's wheel
   * handler uses (`zoom + delta`, not `zoom * factor`). Returns the applied zoom.
   */
  zoomBy(delta: number): number {
    return this.setZoom(this.zoom + delta);
  }

  /**
   * Apply one wheel notch. Mirrors `DiagramCanvasComponent.onWheel`: scrolling
   * DOWN (`deltaY > 0`) zooms OUT by `zoomSensitivity`, scrolling up zooms in.
   */
  zoomByWheel(deltaY: number): number {
    return this.zoomBy(deltaY > 0 ? -this.zoomSensitivity : this.zoomSensitivity);
  }

  /**
   * Cursor-anchored zoom: change zoom while keeping the world point currently
   * under `(clientX, clientY)` pinned to that same screen pixel. This is the
   * standard "zoom towards the pointer" behaviour; the plain {@link setZoom} /
   * {@link zoomByWheel} pair is centre-anchored instead.
   *
   * Returns the zoom actually applied (clamped).
   */
  zoomAtPoint(zoom: number, clientX: number, clientY: number, rect: CanvasRect): number {
    const next = this.clampZoom(zoom);
    const anchor = this.clientToWorld(clientX, clientY, rect);

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const { width, height } = this.viewport;

    // worldX = centerX + (localX - width/2) / zoom  ⇒  solve for the centre that
    // holds `anchor` fixed at the new zoom, then convert centre back to origin.
    const centerX = anchor.x - (localX - width / 2) / next;
    const centerY = anchor.y - (localY - height / 2) / next;

    this.viewport = {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
    this.zoom = next;
    this.emit();
    return next;
  }

  // ==========================================================================
  // Pan
  // ==========================================================================

  /** Translate the camera by a WORLD-space delta. */
  pan(dx: number, dy: number): void {
    if (!isFinite(dx) || !isFinite(dy)) return;
    this.viewport = { ...this.viewport, x: this.viewport.x + dx, y: this.viewport.y + dy };
    this.emit();
  }

  /**
   * Translate the camera by a SCREEN-space (pixel) drag delta, converting to
   * world units by dividing by zoom.
   *
   * Sign convention matches the canvas's middle-drag handler: pass
   * `(lastClientX - clientX, lastClientY - clientY)`, i.e. dragging the pointer
   * RIGHT moves the camera LEFT, so the content appears to follow the cursor.
   */
  panByScreenDelta(dxPx: number, dyPx: number): void {
    this.pan(dxPx / this.zoom, dyPx / this.zoom);
  }

  // ==========================================================================
  // The viewBox convention
  // ==========================================================================

  /**
   * The world-space rectangle actually visible — centre-preserving zoom applied
   * to the camera rect. Identical to the `viewBox` `SVGRenderer` emits, and the
   * basis of {@link clientToWorld}.
   */
  getViewBox(): Rectangle {
    const { x, y, width, height } = this.viewport;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    const viewBoxWidth = width / this.zoom;
    const viewBoxHeight = height / this.zoom;

    return {
      x: centerX - viewBoxWidth / 2,
      y: centerY - viewBoxHeight / 2,
      width: viewBoxWidth,
      height: viewBoxHeight,
    };
  }

  /** The `viewBox` attribute string: `"x y width height"`. */
  getViewBoxString(): string {
    const b = this.getViewBox();
    return `${b.x} ${b.y} ${b.width} ${b.height}`;
  }

  /**
   * The rectangle to hand to `IRenderer.render(viewport, zoom)` alongside
   * {@link getZoom}. The renderer applies the zoom itself, so this is the raw
   * camera rect — do NOT pre-divide it by zoom (see the class docs).
   */
  getRenderViewport(): Rectangle {
    return this.getViewport();
  }

  /**
   * CSS transform that keeps an HTML overlay layer registered with the SVG
   * layer in the hybrid renderer: `translate(...) scale(zoom)`.
   *
   * MUST be driven off the same {@link getViewBox} the SVG viewBox and
   * {@link worldToClient} use — NOT the raw `viewport.x/y`. Since the camera
   * rect's width/height became CANVAS PIXELS (see setCanvasSize), the visible
   * world box is the pixel rect expanded around its centre by 1/zoom; the SVG
   * renderer applies exactly that expansion (svg-renderer.ts `viewBoxX =
   * centerX - width/zoom/2`). Using the raw `viewport.x` here omitted the
   * `width*(1-zoom)/2` centring term, so the HTML custom-node layer drifted
   * from the SVG at any zoom != 1 — invisible until a custom-node dashboard was
   * framed with fitToBounds. Routing through getViewBox() makes a host at world
   * W land at the identical pixel worldToClient(W) reports. Identical at zoom 1.
   */
  getHtmlLayerTransform(): string {
    const box = this.getViewBox();
    const translateX = -box.x * this.zoom;
    const translateY = -box.y * this.zoom;
    return `translate(${translateX}px, ${translateY}px) scale(${this.zoom})`;
  }

  // ==========================================================================
  // Screen ↔ world
  // ==========================================================================

  /**
   * Convert a client/screen point (e.g. `event.clientX/Y`) into world space.
   * Exact inverse of {@link worldToClient} at any zoom.
   */
  clientToWorld(clientX: number, clientY: number, rect: CanvasRect): ViewportPoint {
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const box = this.getViewBox();

    return {
      x: box.x + localX / this.zoom,
      y: box.y + localY / this.zoom,
    };
  }

  /**
   * Convert a world point into client/screen coordinates — for positioning
   * overlays, toolbars and tooltips over the canvas. Exact inverse of
   * {@link clientToWorld}.
   */
  worldToClient(worldX: number, worldY: number, rect: CanvasRect): ViewportPoint {
    const box = this.getViewBox();

    return {
      x: (worldX - box.x) * this.zoom + rect.left,
      y: (worldY - box.y) * this.zoom + rect.top,
    };
  }

  // ==========================================================================
  // Fit
  // ==========================================================================

  /**
   * Frame `bounds` (a world-space content rectangle): pick the largest clamped
   * zoom at which it fits inside the canvas with `padding` CSS pixels of margin
   * on every side, and centre it. A zero-area canvas or bounds is a no-op.
   *
   * Returns the zoom actually applied.
   */
  fitToBounds(bounds: Rectangle, padding = 40, options?: { maxZoom?: number }): number {
    const { width, height } = this.viewport;
    if (width <= 0 || height <= 0) return this.zoom;
    if (bounds.width <= 0 || bounds.height <= 0) return this.zoom;

    const usableWidth = Math.max(1, width - padding * 2);
    const usableHeight = Math.max(1, height - padding * 2);

    // `options.maxZoom` caps how far a fit may zoom IN (it never limits zooming
    // out). Fitting a small graph without a cap magnifies it wall-to-wall —
    // eight nodes at 288% look broken, and every routed edge fattens with them.
    const raw = Math.min(usableWidth / bounds.width, usableHeight / bounds.height);
    const capped = options?.maxZoom !== undefined ? Math.min(raw, options.maxZoom) : raw;
    const next = this.clampZoom(capped);

    // Centre the content: choose the camera origin whose viewBox centre lands on
    // the bounds centre. The camera centre IS the viewBox centre (zoom is
    // centre-preserving), so this reduces to a straight offset.
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    this.zoom = next;
    this.viewport = {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
    this.emit();
    return next;
  }

  // ==========================================================================
  // Change notification (the "what changed" seam — hosts turn this into a render)
  // ==========================================================================

  /** Subscribe to camera changes. Returns an unsubscribe function. */
  onChange(listener: ViewportChangeListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Drop all subscribers. */
  dispose(): void {
    this.listeners.clear();
  }

  protected emit(): void {
    if (this.listeners.size === 0) return;
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
