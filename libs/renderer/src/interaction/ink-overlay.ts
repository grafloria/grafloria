// wave10/whiteboard — THE IN-PROGRESS STROKE LAYER.
//
// This is the presence-overlay pattern (see presence/presence-overlay.ts) applied to the
// line a user is ACTIVELY DRAWING, and it exists for the identical reason.
//
// =============================================================================
// WHY THE LIVE STROKE IS NOT A VNODE
// =============================================================================
// The renderer has a FRAME GATE (Wave 8): render() skips a frame outright when the model and
// the viewport are unchanged. A line being drawn changes the PICTURE on every pointermove
// while — until pointerup — changing NEITHER the model NOR the viewport. So a live stroke
// routed through the VNode tree would hit one of two failures, both already seen in this repo:
//
//   • if it did not invalidate the frame, the gate would skip it and the line would FREEZE
//     mid-drag until the next unrelated repaint;
//   • if it DID call invalidateFrame() on every pointermove, it would rebuild and reconcile
//     the ENTIRE scene (10k nodes and all) 120 times a second to extend a pencil by 3px —
//     which is exactly the trap the presence overlay's header spends a page warning against.
//
// So the live stroke is drawn on a SEPARATE SVG LAYER, a sibling of the diagram's own layers,
// updated by ONE attribute write per pointermove. It touches no VNode, trips no epoch, and
// schedules no frame. On pointerup the tool commits ONE StrokeModel to the document — THAT
// moves the mutation epoch, the gate opens once, and the committed ink renders through the
// normal VNode path (stroke-layer.ts). The overlay is then cleared.
//
// The layer is `aria-hidden` and `pointer-events:none`: a half-drawn line is transient visual
// feedback, not content and not a hit target. The committed stroke carries the a11y story.

import type { ViewportController } from '../viewport/viewport-controller';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const INK_OVERLAY_CLASS = 'grafloria-ink-overlay';

export interface InkOverlayOptions {
  /** The mounted diagram's root (`.grafloria-diagram-root`). */
  root: HTMLElement;
  viewport: ViewportController;
}

/** How a preview should look while it is being drawn. */
export interface InkPreviewStyle {
  color: string;
  width: number;
  opacity?: number;
  /** Dashed outline, for the rectangle tool's rubber-band. */
  dashed?: boolean;
}

/**
 * A camera-registered SVG scratch layer for transient drawing feedback.
 *
 * Draws in WORLD coordinates: the layer's `<g>` carries the same translate+scale the SVG
 * layer's viewBox implies, so a pan or a zoom re-registers every preview with ONE transform
 * write instead of re-projecting points in JS.
 */
export class InkOverlay {
  private readonly layer: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly doc: Document;
  private readonly unsubViewport: () => void;
  private disposed = false;

  /** Reused elements — updated by attribute, never recreated per pointermove. */
  private path: SVGPathElement | null = null;
  private rect: SVGRectElement | null = null;

  constructor(private readonly options: InkOverlayOptions) {
    this.doc = options.root.ownerDocument;

    this.layer = this.doc.createElementNS(SVG_NS, 'svg');
    this.layer.setAttribute('class', INK_OVERLAY_CLASS);
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.setAttribute(
      'style',
      'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none'
    );

    this.world = this.doc.createElementNS(SVG_NS, 'g');
    this.world.setAttribute('transform', this.cameraTransform());
    this.layer.appendChild(this.world);
    options.root.appendChild(this.layer);

    // A pan/zoom mid-gesture (two-finger + pen, a trackpad scroll) must keep the preview
    // registered. Like the presence overlay, we only rewrite OUR transform — the diagram is
    // already repainting for the viewport change, whose gate it DOES see.
    this.unsubViewport = options.viewport.onChange(() => {
      if (!this.disposed) this.world.setAttribute('transform', this.cameraTransform());
    });
  }

  /** For tests and the a11y audit — the DOM this owns. */
  get element(): SVGSVGElement {
    return this.layer;
  }

  /** SVG transform (unitless) equivalent to the SVG layer's viewBox: world → container px. */
  private cameraTransform(): string {
    const v = this.options.viewport.getViewport();
    const z = this.options.viewport.getZoom();
    return `translate(${-v.x * z} ${-v.y * z}) scale(${z})`;
  }

  private ensurePath(): SVGPathElement {
    if (!this.path) {
      this.path = this.doc.createElementNS(SVG_NS, 'path');
      this.path.setAttribute('fill', 'none');
      this.path.setAttribute('stroke-linecap', 'round');
      this.path.setAttribute('stroke-linejoin', 'round');
      this.world.appendChild(this.path);
    }
    return this.path;
  }

  private ensureRect(): SVGRectElement {
    if (!this.rect) {
      this.rect = this.doc.createElementNS(SVG_NS, 'rect');
      this.world.appendChild(this.rect);
    }
    return this.rect;
  }

  /**
   * Paint (or repaint) the in-progress freehand line through `points` (world coordinates).
   * ONE `d` attribute write — no VNode, no frame.
   */
  drawPolyline(points: ReadonlyArray<{ x: number; y: number }>, style: InkPreviewStyle): void {
    if (this.disposed) return;
    const path = this.ensurePath();
    path.setAttribute('d', polyline(points));
    path.setAttribute('stroke', style.color);
    path.setAttribute('stroke-width', String(style.width));
    path.setAttribute('opacity', String(style.opacity ?? 1));
    path.setAttribute('stroke-dasharray', style.dashed ? '6 4' : 'none');
  }

  /** Paint the rubber-band rectangle for the rectangle tool (world coordinates). */
  drawRect(x: number, y: number, width: number, height: number, style: InkPreviewStyle): void {
    if (this.disposed) return;
    const rect = this.ensureRect();
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(Math.max(0, width)));
    rect.setAttribute('height', String(Math.max(0, height)));
    rect.setAttribute('fill', style.opacity !== undefined ? style.color : 'none');
    rect.setAttribute('fill-opacity', String(style.opacity ?? 0));
    rect.setAttribute('stroke', style.color);
    rect.setAttribute('stroke-width', String(style.width));
    rect.setAttribute('stroke-dasharray', style.dashed ? '6 4' : 'none');
  }

  /** Remove all preview geometry. Called on pointerup/cancel, once per gesture. */
  clear(): void {
    if (this.path) {
      this.path.remove();
      this.path = null;
    }
    if (this.rect) {
      this.rect.remove();
      this.rect = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.unsubViewport();
    this.layer.remove();
  }
}

function polyline(points: ReadonlyArray<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  const r = (v: number) => Math.round(v * 100) / 100;
  if (points.length === 1) return `M ${r(points[0].x)} ${r(points[0].y)} L ${r(points[0].x)} ${r(points[0].y)}`;
  let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
  for (let i = 1; i < points.length; i++) d += ` L ${r(points[i].x)} ${r(points[i].y)}`;
  return d;
}
