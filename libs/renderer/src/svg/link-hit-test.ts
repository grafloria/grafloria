import type { Point } from '@grafloria/engine';

/**
 * Part-aware link hit-testing (Wave 1 — Edges & links foundation).
 *
 * Classic link hit-testing only answers "was the link hit?". Every downstream
 * edge feature — inline label editing, endpoint reconnection, edge-toolbar
 * placement — needs to know WHICH sub-part of the link was hit. This module is
 * a pure, framework-agnostic geometry primitive that reports the sub-part plus
 * useful local info (which label, or the 0-1 position along the path).
 *
 * It is deliberately side-effect free and model-free: callers pass the already
 * routed points, label placements, endpoint/arrow anchor points and a query
 * point, so the same logic can back both the SVG hit-area path and the
 * interaction-handler's geometric distance checks.
 */

/** The sub-part of a link that a query point resolved to. */
export type LinkPart =
  | 'body'
  | 'label'
  | 'source-endpoint'
  | 'target-endpoint'
  | 'source-arrow'
  | 'target-arrow';

/** Result of a part-aware link hit-test. */
export interface LinkHitResult {
  /** Which sub-part of the link was hit. */
  part: LinkPart;
  /** Index into the supplied labels array — present only for `part === 'label'`. */
  labelIndex?: number;
  /**
   * Position along the whole path in [0, 1] where the body was hit — present
   * only for `part === 'body'`. Useful for inserting waypoints / positioning
   * an edge toolbar on the segment under the cursor.
   */
  t?: number;
}

/** A label placement, expressed independently of the model. */
export interface LinkHitLabel {
  /** Position along the path in [0, 1] (the label's on-path anchor). */
  position: number;
  /** Offset of the label box centre from its on-path anchor. */
  offset?: Point;
  /** Label box width in world units (falls back to {@link DEFAULT_LABEL_WIDTH}). */
  width?: number;
  /** Label box height in world units (falls back to {@link DEFAULT_LABEL_HEIGHT}). */
  height?: number;
}

/** Inputs describing a single link's geometry for hit-testing. */
export interface LinkHitTestOptions {
  /** Routed points of the link, in world coordinates (>= 2 for a body). */
  points: Point[];
  /** Label placements, in render order (later entries drawn on top). */
  labels?: LinkHitLabel[];
  /** Source endpoint anchor (defaults to `points[0]`). Pass `null` to disable. */
  sourceEndpoint?: Point | null;
  /** Target endpoint anchor (defaults to last point). Pass `null` to disable. */
  targetEndpoint?: Point | null;
  /** Source arrowhead anchor. Omit / `null` when there is no source arrow. */
  sourceArrow?: Point | null;
  /** Target arrowhead anchor. Omit / `null` when there is no target arrow. */
  targetArrow?: Point | null;
  /** Grab radius around endpoint anchors (default {@link DEFAULT_ENDPOINT_RADIUS}). */
  endpointRadius?: number;
  /** Grab radius around arrowhead anchors (default {@link DEFAULT_ARROW_RADIUS}). */
  arrowRadius?: number;
  /** Fallback label box width when a label omits one. */
  defaultLabelWidth?: number;
  /** Fallback label box height when a label omits one. */
  defaultLabelHeight?: number;
}

export const DEFAULT_ENDPOINT_RADIUS = 8;
export const DEFAULT_ARROW_RADIUS = 10;
export const DEFAULT_LABEL_WIDTH = 40;
export const DEFAULT_LABEL_HEIGHT = 18;

/**
 * Grab distance (WORLD units) for a link body — "how close to the line counts
 * as clicking it".
 *
 * Exported because it is now a CROSS-BACKEND contract, not an implementation
 * detail of one hit path: `InteractionController` applies it to resolve a link
 * in SVG mode, and the Canvas backend strokes each link's pick region with
 * exactly `2 x` this width on the colour-keyed hit canvas. If the two ever
 * disagreed, switching backend would change which link is under the cursor.
 * (It was previously a bare `5` inlined in the controller.)
 */
export const DEFAULT_LINK_HIT_TOLERANCE = 5;

/**
 * Arc-length interpolation of a point at position `t` (0-1) along a polyline.
 * Mirrors {@link LinkModel.getPointAtPosition}'s polyline fallback so label
 * anchors line up with what the renderer draws. Returns `null` for < 2 points.
 */
export function pointAtPositionOnPolyline(points: Point[], t: number): Point | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0]! };

  const clamped = Math.max(0, Math.min(1, t));

  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
  }
  if (total <= 0) return { ...points[0]! };

  let remaining = total * clamped;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segLen) {
      const st = segLen > 0 ? remaining / segLen : 0;
      return { x: a.x + (b.x - a.x) * st, y: a.y + (b.y - a.y) * st };
    }
    remaining -= segLen;
  }
  return { ...points[points.length - 1]! };
}

/** Closest-point projection of `q` onto segment `a`->`b`. */
function projectOntoSegment(
  q: Point,
  a: Point,
  b: Point
): { distance: number; s: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let s = lenSq === 0 ? 0 : ((q.x - a.x) * dx + (q.y - a.y) * dy) / lenSq;
  s = Math.max(0, Math.min(1, s));
  const cx = a.x + s * dx;
  const cy = a.y + s * dy;
  return { distance: Math.hypot(q.x - cx, q.y - cy), s };
}

/**
 * Part-aware link hit-test.
 *
 * Precedence (highest first): endpoint / arrow handles (small grab radius) >
 * labels (bounding box) > body (near the path). Within the handle tier the
 * nearest handle wins, tie-broken by declaration order
 * (source-endpoint, target-endpoint, source-arrow, target-arrow).
 *
 * @param options  the link geometry to test against
 * @param query    the world-space point to test
 * @param tolerance grab distance for the body (and label box padding)
 * @returns the hit part with local info, or `null` when nothing is within reach
 */
export function hitTestLink(
  options: LinkHitTestOptions,
  query: Point,
  tolerance: number
): LinkHitResult | null {
  const { points } = options;

  const endpointRadius = options.endpointRadius ?? DEFAULT_ENDPOINT_RADIUS;
  const arrowRadius = options.arrowRadius ?? DEFAULT_ARROW_RADIUS;
  const labelW = options.defaultLabelWidth ?? DEFAULT_LABEL_WIDTH;
  const labelH = options.defaultLabelHeight ?? DEFAULT_LABEL_HEIGHT;

  // --- Tier 1: endpoint / arrow handles (nearest within its radius wins) ---
  const sourceEndpoint =
    options.sourceEndpoint === undefined ? points[0] : options.sourceEndpoint;
  const targetEndpoint =
    options.targetEndpoint === undefined
      ? points[points.length - 1]
      : options.targetEndpoint;

  const handles: Array<{ part: LinkPart; point: Point | null | undefined; radius: number }> = [
    { part: 'source-endpoint', point: sourceEndpoint, radius: endpointRadius },
    { part: 'target-endpoint', point: targetEndpoint, radius: endpointRadius },
    { part: 'source-arrow', point: options.sourceArrow, radius: arrowRadius },
    { part: 'target-arrow', point: options.targetArrow, radius: arrowRadius },
  ];

  let bestHandle: { part: LinkPart; distance: number } | null = null;
  for (const handle of handles) {
    if (!handle.point) continue;
    const distance = Math.hypot(query.x - handle.point.x, query.y - handle.point.y);
    if (distance <= handle.radius && (bestHandle === null || distance < bestHandle.distance)) {
      bestHandle = { part: handle.part, distance };
    }
  }
  if (bestHandle) return { part: bestHandle.part };

  // --- Tier 2: labels (bounding box, topmost-drawn first) ---
  if (options.labels && options.labels.length > 0) {
    for (let i = options.labels.length - 1; i >= 0; i--) {
      const label = options.labels[i]!;
      const anchor = pointAtPositionOnPolyline(points, label.position);
      if (!anchor) continue;
      const cx = anchor.x + (label.offset?.x ?? 0);
      const cy = anchor.y + (label.offset?.y ?? 0);
      const halfW = (label.width ?? labelW) / 2 + tolerance;
      const halfH = (label.height ?? labelH) / 2 + tolerance;
      if (Math.abs(query.x - cx) <= halfW && Math.abs(query.y - cy) <= halfH) {
        return { part: 'label', labelIndex: i };
      }
    }
  }

  // --- Tier 3: body (nearest point on the polyline) ---
  if (points.length >= 2) {
    const segLengths: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
      segLengths.push(len);
      totalLength += len;
    }

    let bestDistance = Infinity;
    let bestArcLength = 0;
    let cumulative = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const { distance, s } = projectOntoSegment(query, points[i]!, points[i + 1]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestArcLength = cumulative + s * segLengths[i]!;
      }
      cumulative += segLengths[i]!;
    }

    if (bestDistance <= tolerance) {
      const t = totalLength > 0 ? bestArcLength / totalLength : 0;
      return { part: 'body', t };
    }
  }

  return null;
}
