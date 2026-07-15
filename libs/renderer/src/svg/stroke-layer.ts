// wave10/whiteboard — RENDERING INK.
//
// A committed stroke is DOCUMENT CONTENT (see StrokeModel: it is a first-class entity, not
// a node, and not annotation smuggled through metadata), so it belongs in the VNode tree
// like every node and link — culled, patched and exported the same way. This module turns
// `diagram.getVisibleStrokes()` into that tree.
//
// The IN-PROGRESS stroke — the line being actively drawn, changing every pointermove — does
// NOT come through here. It lives on a separate overlay layer (`ink-overlay.ts`) for exactly
// the reason the presence cursors do: a picture that changes every pointermove without the
// model or viewport changing would either freeze (the frame gate skips it) or, if forced
// through `invalidateFrame()`, rebuild a 10k-node scene 120 times a second to move a pencil.
// Only the COMMITTED stroke, minted once at pointerup, moves the mutation epoch and lands
// here.
//
// =============================================================================
// A11Y: THE STORY FOR INK, ARGUED — NOT GUESSED
// =============================================================================
// A freehand mark is not text and it is not a shape with a name. Two cases, two answers:
//
//   • ANONYMOUS ink — the normal case, someone scribbling — carries no meaning a screen
//     reader can convey. Announcing "graphics-object" 40 times for the 40 marks on a
//     brainstorming board is pure noise, and worse than silence. So anonymous ink is
//     `aria-hidden="true"`: present for sighted users, invisible to AT. (This mirrors the
//     presence overlay's decision for live cursors, and for the same reason.)
//
//   • NAMED ink — a stroke the author gave a `label` ("Q3 target", "reject") — IS content
//     with meaning, so it is exposed as `role="img"` with that label as its accessible name.
//     An unlabelled `<path>` left in the a11y tree with no name is the worst of both worlds
//     (axe flags exactly that), which is why the default is to hide, and naming is opt-in.
//
// The a11y harness renders BOTH an anonymous and a named stroke into the audited page, so
// axe judges this story rather than us asserting it.

import type { VNode } from '../types/vnode.types';
import type { StrokeModel, StrokePoint, StrokeStyle } from '@grafloria/engine';

/** Trim a coordinate to at most 2dp (the model already quantizes; this drops trailing zeros). */
function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

/**
 * A plain polyline through the points: `M … L … L …`.
 *
 * This is the geometry the model hit-tests and the eraser sweeps against (StrokeModel walks
 * the same segments), so the picture and the interaction agree by construction — the ink you
 * see is the ink you can erase.
 */
export function strokePolylineData(points: readonly StrokePoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    // A single sample (a tap). A zero-length line with a round cap paints a filled dot of the
    // nib's width — which is exactly what a single dab of a pen looks like.
    const p = points[0];
    return `M ${n(p.x)} ${n(p.y)} L ${n(p.x)} ${n(p.y)}`;
  }
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length; i++) d += ` L ${n(points[i].x)} ${n(points[i].y)}`;
  return d;
}

/**
 * A CLOSED variable-width ribbon built from per-sample pressure.
 *
 * Pressure is not decoration: StrokeModel keeps it only when the device actually varied it,
 * and the whole point of keeping it is that it CHANGES THE PICTURE. A pen pressed harder
 * leaves a fatter mark. So a pressure-bearing stroke is drawn as a filled outline whose
 * half-width at each sample is the nib scaled by that sample's pressure, not as a
 * constant-width line that quietly ignores the data — which would be the "machinery wired to
 * nothing" this project has shipped in every prior wave.
 *
 * The outline walks up one side offsetting each point along the local normal, then back down
 * the other, and closes. A floor on the width keeps a near-zero-pressure sample from pinching
 * the ribbon to an invisible thread.
 */
export function strokeOutlineData(points: readonly StrokePoint[], width: number): string {
  if (points.length < 2) return strokePolylineData(points);

  const half = width / 2;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] ?? points[i];
    const next = points[i + 1] ?? points[i];
    // Direction is the average of the incoming and outgoing segments, so the normal at a
    // vertex bisects the corner rather than jumping between the two segment normals.
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // Perpendicular.
    const nx = -dy;
    const ny = dx;
    // 0.35 floor: a 0-pressure sample still leaves a visible mark, not a gap.
    const pressure = points[i].pressure ?? 1;
    const w = half * (0.35 + 0.65 * pressure);
    left.push({ x: points[i].x + nx * w, y: points[i].y + ny * w });
    right.push({ x: points[i].x - nx * w, y: points[i].y - ny * w });
  }

  let d = `M ${n(left[0].x)} ${n(left[0].y)}`;
  for (let i = 1; i < left.length; i++) d += ` L ${n(left[i].x)} ${n(left[i].y)}`;
  for (let i = right.length - 1; i >= 0; i--) d += ` L ${n(right[i].x)} ${n(right[i].y)}`;
  d += ' Z';
  return d;
}

/** Does this stroke carry pressure worth drawing a ribbon for? */
function hasVaryingPressure(points: readonly StrokePoint[]): boolean {
  let seen: number | undefined;
  for (const p of points) {
    if (p.pressure === undefined) return false;
    if (seen === undefined) seen = p.pressure;
    else if (Math.abs(p.pressure - seen) > 1e-6) return true;
  }
  return false;
}

/** The `<path>` (plus a11y wrapper when named) for one committed stroke. */
export function renderStroke(stroke: StrokeModel): VNode {
  const points = stroke.getPoints();
  const style: StrokeStyle = stroke.getStyle();
  const label = stroke.getLabel();

  const pressured = hasVaryingPressure(points);
  const pathProps: Record<string, unknown> = pressured
    ? {
        // A filled ribbon: the width lives in the geometry, so there is no strokeWidth.
        d: strokeOutlineData(points, style.width),
        fill: style.color,
        stroke: 'none',
      }
    : {
        d: strokePolylineData(points),
        fill: 'none',
        stroke: style.color,
        strokeWidth: style.width,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      };

  if (style.opacity !== undefined) pathProps['opacity'] = style.opacity;

  // Ink never eats a click. The eraser and any future selection hit-test the MODEL, not the
  // DOM, so making the path transparent to pointer events keeps nodes/links/pins underneath
  // it fully interactive even where ink is painted on top.
  pathProps['pointerEvents'] = 'none';
  pathProps['className'] = 'grafloria-stroke';
  pathProps['data-stroke-id'] = stroke.id;

  // A11Y — see the header. Named ink is an image with a name; anonymous ink is hidden.
  if (label !== undefined && label !== '') {
    pathProps['role'] = 'img';
    pathProps['aria-label'] = label;
  } else {
    pathProps['aria-hidden'] = 'true';
  }

  return { type: 'path', key: `stroke-${stroke.id}`, props: pathProps };
}

/**
 * The ink layer: a `<g>` of committed strokes.
 *
 * Returns `null` when there is no ink, so a canvas that has never been drawn on pays exactly
 * nothing — not a layer, not a group node. Painted LAST among the diagram layers (ink is
 * annotation ON the diagram — you circle a node in red and expect to see the circle), and its
 * paths are `pointer-events:none`, so nothing underneath becomes unclickable.
 */
export function renderStrokesLayer(strokes: readonly StrokeModel[]): VNode | null {
  if (strokes.length === 0) return null;
  return {
    type: 'g',
    key: 'strokes-layer',
    props: { className: 'grafloria-strokes-layer' },
    children: strokes.map(renderStroke),
  };
}
