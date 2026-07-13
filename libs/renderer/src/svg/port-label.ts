// port-label.ts — Wave 6 (Ports & connections), Card 1.
//
// A text label per port, laid out relative to the glyph.
//
// This does NOT contain a text renderer. Line-breaking, wrapping, multi-line
// `tspan` emission, ellipsis truncation and vertical alignment all belong to
// `text-block.ts`, the engine that node labels and link labels (LabelRenderer)
// already share — so a port label wraps by exactly the same rules as every other
// piece of text in the diagram, and there is still exactly ONE place that knows
// how to break a line. What lives here is only the part that is genuinely about
// PORTS: where the label sits relative to the glyph, which way it faces, and what
// to do when a column of them crowds together.
//
// PURE GEOMETRY + one call into the shared text engine. No models, no DOM.

import type { PortLabelSpec } from '@grafloria/engine';
import { DEFAULT_PORT_LABEL_OFFSET } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import { estimateTextWidth, renderTextBlock } from './text-block';

export interface PortLabelInput {
  spec: PortLabelSpec;
  /** Node-local anchor of the port's glyph. */
  x: number;
  y: number;
  /** Half-extents of the glyph box — the label clears the glyph, not its centre. */
  hw: number;
  hh: number;
  /** The port's side: the outward normal. */
  side: 'left' | 'right' | 'top' | 'bottom';
  /** Node box, for the `radial` layout's centre and for `inside` clamping. */
  width: number;
  height: number;
  /** Vertical nudge applied by collision resolution (see `nudgePortLabels`). */
  nudge?: number;
  fontSize: number;
  fontFamily?: string;
  color?: string;
  className?: string;
}

/** The unit outward normal of a side. */
function outwardNormal(side: PortLabelInput['side']): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

/** The glyph half-extent along a direction — how far the label must clear. */
function clearance(direction: { x: number; y: number }, hw: number, hh: number): number {
  return Math.abs(direction.x) * hw + Math.abs(direction.y) * hh;
}

export interface PortLabelGeometry {
  x: number;
  y: number;
  /** Total rotation in degrees (0 when the label is horizontal). */
  rotation: number;
  align: 'start' | 'middle' | 'end';
  valign: 'top' | 'middle' | 'bottom';
}

/**
 * Where does the label go, which way does it point, and how does it hang off its
 * anchor?
 *
 * The `align`/`valign` choice matters as much as the position: a label to the
 * LEFT of a port must be right-aligned (`end`), or it grows away from the port
 * and collides with the node.
 */
export function portLabelGeometry(input: PortLabelInput): PortLabelGeometry {
  const { spec, x, y, hw, hh, side, width, height } = input;
  const layout = spec.layout ?? 'outside';
  const offset = spec.offset ?? DEFAULT_PORT_LABEL_OFFSET;
  const nudge = input.nudge ?? 0;

  const normal = outwardNormal(side);

  let direction: { x: number; y: number };

  switch (layout) {
    case 'inside':
      direction = { x: -normal.x, y: -normal.y };
      break;

    case 'orthogonal': {
      // Perpendicular to the outward normal: the label reads ALONG the edge.
      // Pick the perpendicular that points into the node's long axis so the text
      // runs down a side-port column rather than off the top of it.
      direction = { x: -normal.y, y: normal.x };
      break;
    }

    case 'radial': {
      // Along the ray from the node's centre through the port. On a circle or an
      // ellipse this is the ONLY layout that reads right — `outside` would push
      // every label along its side's normal and stack the diagonal ones.
      const dx = x - width / 2;
      const dy = y - height / 2;
      const length = Math.hypot(dx, dy);
      direction = length < 1e-6 ? normal : { x: dx / length, y: dy / length };
      break;
    }

    case 'outside':
    default:
      direction = normal;
      break;
  }

  const distance = clearance(direction, hw, hh) + offset;
  const px = x + direction.x * distance;
  const py = y + direction.y * distance + nudge;

  // Anchor the text so it GROWS AWAY from the port, never back over it.
  let align: PortLabelGeometry['align'] = 'middle';
  if (direction.x > 0.3) align = 'start';
  else if (direction.x < -0.3) align = 'end';

  let valign: PortLabelGeometry['valign'] = 'middle';
  if (Math.abs(direction.x) <= 0.3) {
    valign = direction.y > 0 ? 'top' : 'bottom';
  }

  // `inside` on a side port must not run out of the node: flip the anchor so the
  // text reads back toward the body.
  const rotation = resolveRotation(spec, direction);

  return { x: px, y: py, rotation, align, valign };
}

/**
 * Total label rotation, with keep-upright auto-flip.
 *
 * `angle` rotates the label. `keepUpright` (default ON) then adds 180° to any
 * label that would end up reading upside-down — the standard trick, and the
 * reason a `radial` label on the LEFT half of a circle still reads
 * left-to-right instead of mirror-written.
 */
export function resolveRotation(spec: PortLabelSpec, direction: { x: number; y: number }): number {
  const explicit = spec.angle ?? 0;
  if (explicit === 0) return 0;

  let total = explicit;
  if (spec.keepUpright !== false) {
    // Normalise to (-180, 180] and flip the upside-down half.
    total = ((total % 360) + 540) % 360 - 180;
    if (total > 90 || total < -90) {
      total += total > 0 ? -180 : 180;
    }
  }
  return total;
}

/**
 * Collision-aware nudging: when several port labels crowd, push them apart along
 * the axis they stack on.
 *
 * Deliberately a ONE-AXIS resolver over labels that share a side. That is the
 * shape the crowding actually has — a column of inputs down the left edge whose
 * labels overlap vertically — and a general 2-D label-placement solver would be
 * both slower and less predictable (labels would visibly hop sideways as you
 * dragged a node). Returns a per-label nudge, so the caller can decide whether
 * to apply it.
 *
 * `heights` are the labels' rendered heights, `centres` their unnudged centre
 * coordinates on the stacking axis, both in the SAME order.
 */
export function nudgePortLabels(centres: number[], heights: number[], gap = 2): number[] {
  const count = centres.length;
  const nudges = new Array<number>(count).fill(0);
  if (count < 2) return nudges;

  // Resolve in visual order, not declaration order.
  const order = centres.map((c, i) => i).sort((a, b) => centres[a]! - centres[b]!);

  let previousBottom = -Infinity;
  for (const i of order) {
    const half = (heights[i] ?? 0) / 2;
    const wanted = centres[i]!;
    const top = wanted - half;

    if (top < previousBottom + gap) {
      // Overlaps the label above: push it down just enough to clear.
      nudges[i] = previousBottom + gap - top;
    }
    previousBottom = wanted + nudges[i]! + half;
  }

  // Re-centre the whole stack on its original centroid, so a crowded column
  // spreads symmetrically instead of drifting downward off the node.
  const mean = nudges.reduce((sum, n) => sum + n, 0) / count;
  return nudges.map((n) => n - mean);
}

/** The label's rendered width, using the shared text engine's estimator. */
export function portLabelWidth(spec: PortLabelSpec, fontSize: number): number {
  return estimateTextWidth(spec.text, spec.fontSize ?? fontSize);
}

/**
 * Render the port's label as a `<text>` (or a `<g>` when it is rotated — a
 * rotation needs a transform, and putting it on the text itself would fight the
 * `x`/`y` the text-block engine emits for its tspans).
 */
export function renderPortLabel(input: PortLabelInput): VNode {
  const { spec } = input;
  const fontSize = spec.fontSize ?? input.fontSize;
  const geometry = portLabelGeometry(input);

  const text = renderTextBlock({
    text: spec.text,
    x: geometry.x,
    y: geometry.y,
    align: geometry.align,
    valign: geometry.valign,
    fontSize,
    fontFamily: spec.fontFamily ?? input.fontFamily,
    fontWeight: spec.fontWeight,
    color: spec.color ?? input.color,
    maxWidth: spec.maxWidth,
    className: spec.className ?? input.className,
    // A label must never eat the port's pointer events — the port under it is
    // the whole point of the drag.
    nonInteractive: true,
  });

  if (!geometry.rotation) return text;

  return {
    type: 'g',
    props: { transform: `rotate(${geometry.rotation} ${geometry.x} ${geometry.y})` },
    children: [text],
  };
}
