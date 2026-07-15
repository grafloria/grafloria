// wave10/whiteboard — THE TOOLS THAT MAKE INK REACHABLE.
//
// A StrokeModel that no gesture ever creates is machinery wired to nothing — the exact
// failure this project has shipped in every prior wave. These three tools are the wire:
// pointer input → the tool registry (Wave 6) → the ToolManager arbitration in the
// DomEventBinder / TouchGestureController → the model. They add NO new input path; they plug
// into the one that already arbitrates gestures.
//
//   DRAW      freehand ink → ONE StrokeModel, simplified, committed at pointerup
//   RECTANGLE a dragged box → a NODE (a rectangle IS a box: connectable, resizable, laid out)
//   ERASER    wipe over ink → the swept strokes removed, as ONE undo step
//
// The live feedback (the line as it grows, the rubber-band box, the eraser trail) is drawn on
// a SEPARATE overlay layer (ink-overlay.ts), NOT through the VNode tree, so a stroke in
// progress cannot dirty a 10k-node frame. Only the committed result — one add, or a batch of
// removes — touches the model and the frame gate.

import { StrokeModel, NodeModel, type DiagramModel, type StrokePoint, type StrokeStyle } from '@grafloria/engine';
import type { ViewportController } from '../viewport/viewport-controller';
import type { CanvasTool, ToolPointerEvent, ToolHitContext } from '../ext/tools';
import { InkOverlay, type InkPreviewStyle } from './ink-overlay';
import { ROOT_CLASS } from '../instance/layers';

/**
 * The slice of a mounted diagram the whiteboard tools need. `DiagramInstance` satisfies it
 * structurally, but a test can hand over a fake with four members instead of forty.
 */
export interface WhiteboardHost {
  getModel(): DiagramModel;
  readonly viewport: ViewportController;
  readonly container: HTMLElement;
  /** Queue a repaint after a commit. */
  render(): void;
  /**
   * Run a multi-op commit as ONE undo step. A collab/undo-aware host passes
   * `replica.transact`; the default runs it inline (a plain instance has no undo stack, and
   * one add / N removes are still atomic to the model either way).
   */
  batch?: (fn: () => void) => void;
}

/** Common base: an overlay, an active flag, and the ROOT lookup. */
abstract class WhiteboardTool {
  abstract readonly id: string;
  readonly priority = 1;

  /** When false, the tool declines every gesture — this is how a host switches tools. */
  protected active = true;

  private overlayInstance: InkOverlay | null = null;

  constructor(protected readonly host: WhiteboardHost) {}

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.overlay().clear();
  }

  isActive(): boolean {
    return this.active;
  }

  hitTest(): boolean {
    return this.active;
  }

  /** Lazily mount the scratch layer on the diagram root the first time it is needed. */
  protected overlay(): InkOverlay {
    if (!this.overlayInstance) {
      const root =
        (this.host.container.querySelector(`.${ROOT_CLASS}`) as HTMLElement | null) ??
        this.host.container;
      this.overlayInstance = new InkOverlay({ root, viewport: this.host.viewport });
    }
    return this.overlayInstance;
  }

  protected model(): DiagramModel {
    return this.host.getModel();
  }

  protected commit(fn: () => void): void {
    (this.host.batch ?? ((f: () => void) => f()))(fn);
  }

  dispose(): void {
    this.overlayInstance?.dispose();
    this.overlayInstance = null;
  }

  onCancel(): void {
    this.overlay().clear();
  }
}

// ===========================================================================
// DRAW — freehand ink
// ===========================================================================

export interface DrawToolOptions {
  color?: string;
  width?: number;
  /** Highlighter ink is translucent. */
  opacity?: number;
  /** Douglas-Peucker tolerance at commit. Omit to use the model's tuned default. */
  simplifyEpsilon?: number;
  /** An author label for the committed ink — makes it a NAMED annotation in the a11y tree. */
  label?: string;
  active?: boolean;
}

export class DrawTool extends WhiteboardTool implements CanvasTool {
  readonly id = 'whiteboard-draw';
  private raw: StrokePoint[] = [];

  constructor(host: WhiteboardHost, private readonly opts: DrawToolOptions = {}) {
    super(host);
    if (opts.active === false) this.active = false;
  }

  private style(): StrokeStyle {
    const s: StrokeStyle = { color: this.opts.color ?? '#1f2933', width: this.opts.width ?? 3 };
    if (this.opts.opacity !== undefined) s.opacity = this.opts.opacity;
    return s;
  }

  private preview(): InkPreviewStyle {
    return { color: this.opts.color ?? '#1f2933', width: this.opts.width ?? 3, opacity: this.opts.opacity };
  }

  onPointerDown(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    this.raw = [sample(ev)];
    this.overlay().drawPolyline(this.raw, this.preview());
  }

  onPointerMove(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    if (this.raw.length === 0) return;
    this.raw.push(sample(ev));
    // ONE attribute write. No VNode, no frame, no epoch.
    this.overlay().drawPolyline(this.raw, this.preview());
  }

  onPointerUp(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    if (this.raw.length === 0) return;
    this.raw.push(sample(ev));

    // A pointerdown+up with no travel is a dot; anything else is a line. Either way the raw
    // trace — hundreds of samples on a real drag — is SIMPLIFIED at commit through the
    // engine's PathSimplifier (fromRawPoints). A 500-point stroke persisted as 500 points is
    // a bug the model's own docstring names; this is where that is prevented.
    const raw = this.raw;
    this.raw = [];
    this.overlay().clear();

    const stroke = StrokeModel.fromRawPoints(raw, this.style(), {
      epsilon: this.opts.simplifyEpsilon,
      label: this.opts.label,
    });
    // A degenerate stroke (all samples identical, simplified to <1 real point) is not ink.
    if (stroke.pointCount === 0) return;

    this.commit(() => this.model().addStroke(stroke));
    this.host.render();
  }
}

// ===========================================================================
// RECTANGLE — a dragged box becomes a NODE
// ===========================================================================
//
// This goes the OPPOSITE way from the draw tool, and StrokeModel's header argues why: a
// rectangle you drag out IS a box — you want to connect it, resize it, label it, lay it out —
// so it is a NODE, not a stroke. Same reasoning, opposite answer, because they are genuinely
// different objects.

export interface RectangleToolOptions {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Below this size (world px) the drag is treated as a mis-click and no node is made. */
  minSize?: number;
  label?: string;
  active?: boolean;
}

export class RectangleTool extends WhiteboardTool implements CanvasTool {
  readonly id = 'whiteboard-rectangle';
  private start: { x: number; y: number } | null = null;

  constructor(host: WhiteboardHost, private readonly opts: RectangleToolOptions = {}) {
    super(host);
    if (opts.active === false) this.active = false;
  }

  private preview(): InkPreviewStyle {
    return { color: this.opts.stroke ?? '#2563eb', width: this.opts.strokeWidth ?? 2, dashed: true, opacity: 0.08 };
  }

  onPointerDown(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    this.start = { x: ev.world.x, y: ev.world.y };
  }

  onPointerMove(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    if (!this.start) return;
    const r = normRect(this.start, ev.world);
    this.overlay().drawRect(r.x, r.y, r.width, r.height, this.preview());
  }

  onPointerUp(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    if (!this.start) return;
    const r = normRect(this.start, ev.world);
    this.start = null;
    this.overlay().clear();

    const min = this.opts.minSize ?? 4;
    if (r.width < min || r.height < min) return; // a click, not a rectangle

    const node = new NodeModel({
      type: 'basic',
      position: { x: r.x, y: r.y },
      size: { width: r.width, height: r.height },
    });
    // The Wave-5 shape machinery, used for what it is actually for: a named silhouette. The
    // renderer's cascade reads `style.shape`, so this is a real rectangle, not a metadata
    // note nothing looks at.
    const style: Record<string, unknown> = { shape: 'rectangle' };
    if (this.opts.fill) style['fill'] = this.opts.fill;
    if (this.opts.stroke) style['stroke'] = this.opts.stroke;
    if (this.opts.strokeWidth !== undefined) style['strokeWidth'] = this.opts.strokeWidth;
    node.setStyle(style as never);
    if (this.opts.label !== undefined) node.setMetadata('label', this.opts.label);

    this.commit(() => this.model().addNode(node));
    this.host.render();
  }
}

// ===========================================================================
// ERASER — wipe over ink
// ===========================================================================
//
// WHOLE-STROKE DELETE vs SPLIT-AT-CROSSING — argued from the user's side.
//
// Split-at-crossing (the eraser cuts a stroke into two shorter strokes where it crosses) is
// what a raster paint program does, because there the ink is pixels and "half a stroke" is a
// coherent thing. Here ink is a VECTOR ENTITY with an identity, a style, an author label and
// an undo history. Splitting it would: mint two new ids for something the user drew as one;
// force a re-simplification of each fragment (so the surviving ink is no longer the geometry
// they drew); orphan the label (which fragment keeps "Q3 target"?); and turn one convergent
// `add`/`remove` into a delete-plus-two-adds that has to converge under concurrency. For a
// diagram-annotation eraser, none of that is what the user means by "rub this out" — they
// mean the mark they made is gone. So: WHOLE-STROKE DELETE. A stroke the eraser sweeps
// through is removed entire.
//
// And the whole sweep is ONE undo step: the doomed set is accumulated across the gesture and
// removed in a single batch at pointerup, so one Ctrl-Z brings back everything the sweep
// wiped — never one stroke per press.

export interface EraserToolOptions {
  /** Extra hit radius in world units around the eraser path. Default 8. */
  radius?: number;
  active?: boolean;
}

export class EraserTool extends WhiteboardTool implements CanvasTool {
  readonly id = 'whiteboard-eraser';
  private last: { x: number; y: number } | null = null;
  private doomed = new Set<string>();
  private trail: Array<{ x: number; y: number }> = [];

  constructor(host: WhiteboardHost, private readonly opts: EraserToolOptions = {}) {
    super(host);
    if (opts.active === false) this.active = false;
  }

  private radius(): number {
    return this.opts.radius ?? 8;
  }

  private sweep(from: { x: number; y: number }, to: { x: number; y: number }): void {
    // Segment-vs-segment, NOT point-vs-segment: a fast flick lands samples 80px apart, and a
    // point test would jump clean over a stroke the eraser visibly swept through. The model's
    // getStrokesAlongSegment asks the right question — "what did the pointer travel through".
    for (const s of this.model().getStrokesAlongSegment(from, to, this.radius())) {
      this.doomed.add(s.id);
    }
  }

  private previewStyle(): InkPreviewStyle {
    return { color: 'rgba(120,120,120,0.35)', width: this.radius() * 2 };
  }

  onPointerDown(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    this.last = { x: ev.world.x, y: ev.world.y };
    this.doomed = new Set();
    this.trail = [this.last];
    this.sweep(this.last, this.last); // a tap erases the stroke under it
    this.overlay().drawPolyline(this.trail, this.previewStyle());
  }

  onPointerMove(ev: ToolPointerEvent, _hit?: ToolHitContext): void {
    if (!this.last) return;
    const pt = { x: ev.world.x, y: ev.world.y };
    this.sweep(this.last, pt);
    this.last = pt;
    this.trail.push(pt);
    this.overlay().drawPolyline(this.trail, this.previewStyle());
  }

  onPointerUp(_ev?: ToolPointerEvent, _hit?: ToolHitContext): void {
    if (!this.last) return;
    const ids = [...this.doomed];
    this.last = null;
    this.doomed = new Set();
    this.trail = [];
    this.overlay().clear();

    if (ids.length === 0) return;
    // ONE undo step for the whole sweep — see the header.
    this.commit(() => {
      for (const id of ids) this.model().removeStroke(id);
    });
    this.host.render();
  }

  override onCancel(): void {
    this.last = null;
    this.doomed = new Set();
    this.trail = [];
    super.onCancel();
  }
}

// ===========================================================================
// Factories — the public seam
// ===========================================================================

export function createDrawTool(host: WhiteboardHost, options?: DrawToolOptions): DrawTool {
  return new DrawTool(host, options);
}
export function createRectangleTool(host: WhiteboardHost, options?: RectangleToolOptions): RectangleTool {
  return new RectangleTool(host, options);
}
export function createEraserTool(host: WhiteboardHost, options?: EraserToolOptions): EraserTool {
  return new EraserTool(host, options);
}

// ---------------------------------------------------------------------------

/** A pointer sample in world space, carrying pen pressure when the device reports it. */
function sample(ev: ToolPointerEvent): StrokePoint {
  const p: StrokePoint = { x: ev.world.x, y: ev.world.y };
  const src = ev.source as (PointerEvent & { pointerType?: string }) | undefined;
  // Pressure is kept ONLY for a pen — a mouse reports a constant 0.5 (noise), and touch
  // "force" is wildly inconsistent across hardware. StrokeModel drops constant pressure
  // anyway, but not recording it keeps the wire clean at the source.
  if (src && src.pointerType === 'pen' && typeof src.pressure === 'number' && src.pressure > 0) {
    p.pressure = src.pressure;
  }
  return p;
}

/** A normalized rectangle from two corners (drag in any direction). */
function normRect(
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
