// Content-aware auto-sizing (Wave 5 / Nodes & shapes — Card 7)
//
// A node opted into auto-sizing (`metadata.sizing.auto`) reports a DESIRED size
// that grows to fit its content: the wrapped label, plus any reserved space a
// composite panel declares (Card 5 — header band, image, badges). The desired
// content box is then expanded through the shape's `innerRect` inversion, so a
// diamond/ellipse/cylinder gets enough OUTER size for the text to clear its
// sloped/curved silhouette — not just a tight rectangle.
//
// The one hard rule (stated by the card): bounds changes go through the NORMAL
// `node.setSize()` path, so the spatial index and the routing orchestrator that
// reads it stay honest. `autoSizeNode` never pokes `node.size` directly and is
// idempotent — once a node is at its target size it reports "no change" and
// makes no mutation, so it cannot spin the render/route loop.

import type { NodeModel } from '@grafloria/engine';
import { getShape, getInnerRect, type ShapeDefinition } from './shape-registry';
import { wrapText, estimateTextWidth } from './text-block';
import {
  getNodeSizing,
  isAutoSized,
  clampSizeToConstraints,
  resolveAspectRatio,
  type NodeSizing,
} from './node-sizing';

/** The intrinsic content box a node needs (before shape-inset expansion). */
export interface ContentSize {
  width: number;
  height: number;
}

export interface MeasureLabelOptions {
  fontSize?: number;
  /** Line-height multiplier. Default 1.2. */
  lineHeight?: number;
  /** Wrap the label to this content width; omit to measure it on one line. */
  wrapWidth?: number;
}

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * The content box a label occupies: the widest wrapped line × the line count.
 * Uses the same `estimateTextWidth` heuristic the label renderer wraps with, so
 * the measured box and the rendered text agree about where lines break.
 */
export function measureLabelContent(text: string, opts: MeasureLabelOptions = {}): ContentSize {
  const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
  const lineHeightPx = fontSize * (opts.lineHeight ?? DEFAULT_LINE_HEIGHT);
  if (!text) return { width: 0, height: 0 };

  const lines = wrapText(text, opts.wrapWidth, fontSize);
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, estimateTextWidth(line, fontSize));
  return { width: widest, height: lines.length * lineHeightPx };
}

/**
 * Invert a shape's `innerRect`: the OUTER width/height whose label box is at
 * least `contentW × contentH`. `innerRect` is a monotone function of the outer
 * size (fractional insets for curved shapes, additive padding for the rect
 * default), so a few fixed-point steps converge — one step for the fractional
 * shapes, a handful for additive padding.
 */
export function outerSizeForInner(
  def: ShapeDefinition,
  contentW: number,
  contentH: number,
  seed?: { width: number; height: number }
): { width: number; height: number } {
  let w = Math.max(1, seed?.width ?? contentW, contentW);
  let h = Math.max(1, seed?.height ?? contentH, contentH);

  for (let i = 0; i < 6; i++) {
    const ir = getInnerRect(def, w, h);
    const rw = ir.w > 0.01 ? contentW / ir.w : 1;
    const rh = ir.h > 0.01 ? contentH / ir.h : 1;
    if (rw <= 1.0001 && rh <= 1.0001) break;
    if (rw > 1) w *= rw;
    if (rh > 1) h *= rh;
  }

  return { width: Math.ceil(w), height: Math.ceil(h) };
}

export interface AutoSizeOptions {
  fontSize?: number;
  lineHeight?: number;
  /**
   * Global resizer minimums, applied only where the node declares no per-node
   * min. Keeps auto-size and the interactive resizer on the same floor.
   */
  floorWidth?: number;
  floorHeight?: number;
  /**
   * Extra content a composite panel reserves around the label (Card 5). `top`
   * stacks above the label (header band + image), `width` widens the content box
   * to fit a horizontal row (icon + label + badge).
   */
  reserve?: { top?: number; bottom?: number; width?: number };
}

/**
 * Compute the desired OUTER size of an auto-sized node from its label + reserved
 * panel content, clamped to the node's sizing constraints and any aspect lock.
 * Pure — returns the size, mutates nothing.
 */
export function desiredNodeSize(
  node: NodeModel,
  opts: AutoSizeOptions = {}
): { width: number; height: number } {
  const sizing: NodeSizing = getNodeSizing(node);
  const def = getShape((node.getMetadata('shape') || { type: 'rect' }).type);

  const pad = sizing.padding ?? 8;
  const label = node.getMetadata('label');
  const labelText = label === undefined || label === null ? '' : String(label);

  // Wrap width: if a max width is set, wrap the label to fit inside it.
  const wrapWidth =
    typeof sizing.maxWidth === 'number' ? Math.max(1, sizing.maxWidth - 2 * pad) : undefined;
  const content = measureLabelContent(labelText, {
    fontSize: opts.fontSize,
    lineHeight: opts.lineHeight,
    wrapWidth,
  });

  const reserve = opts.reserve ?? {};
  const contentW = Math.max(content.width, reserve.width ?? 0) + 2 * pad;
  const contentH = content.height + (reserve.top ?? 0) + (reserve.bottom ?? 0) + 2 * pad;

  let { width, height } = outerSizeForInner(def, contentW, contentH, node.size);

  // Aspect lock (grow the deficient axis so content still fits).
  const aspect = resolveAspectRatio(sizing, node.size);
  if (aspect && aspect > 0) {
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
  }

  const clamped = clampSizeToConstraints(width, height, sizing, {
    floorWidth: opts.floorWidth,
    floorHeight: opts.floorHeight,
  });
  return { width: Math.ceil(clamped.width), height: Math.ceil(clamped.height) };
}

/**
 * Auto-size ONE node in place. No-op (returns false) when the node hasn't opted
 * in, or is already within half a pixel of its desired size — the idempotence
 * that keeps this safe to call every frame. Mutates strictly via `setSize`, so
 * the spatial index + routing observe the new bounds.
 */
export function autoSizeNode(node: NodeModel, opts: AutoSizeOptions = {}): boolean {
  if (!isAutoSized(node)) return false;

  const { width, height } = desiredNodeSize(node, opts);
  if (
    Math.abs(width - node.size.width) < 0.5 &&
    Math.abs(height - node.size.height) < 0.5
  ) {
    return false;
  }

  // Wave 9 — Card 7: a SYSTEM write. Auto-sizing measures the node's own content
  // and writes the size the document ALREADY implies — it is not a user edit. A
  // read-only/presentation diagram must still auto-size or it renders at the wrong
  // dimensions, so this write is explicitly exempted from the read-only lock.
  // (Detached nodes have no `diagram`; they are unlocked anyway.)
  const write = () => node.setSize(width, height, node.size.depth);
  node.diagram ? node.diagram.runSystemWrite(write) : write();
  node.markDirty('auto-sized');
  return true;
}

/**
 * Auto-size every opted-in node in a diagram. Returns the count that changed —
 * a host can skip a re-route when it is 0. Intended to run just before a frame
 * so routing consumes the settled bounds.
 */
export function autoSizeDiagram(
  nodes: Iterable<NodeModel>,
  opts: AutoSizeOptions = {}
): number {
  let changed = 0;
  for (const node of nodes) {
    if (autoSizeNode(node, opts)) changed++;
  }
  return changed;
}
