/**
 * link-fanout.ts — Wave 4 (Edges & links), Card 4
 *
 * Parallel-link auto-separation and self-loop routing. PURE GEOMETRY: no engine
 * models, no DOM, no framework — points in, points out — so every rule below is
 * unit-testable on its own and the SVG renderer only has to decide WHEN to call
 * it, not HOW the shape is built.
 *
 * Why this is the biggest structural edge gap Grafloria had:
 *   • Two links between the same pair of nodes were drawn on the same centre
 *     line, one exactly on top of the other. ERD (two FKs between the same
 *     tables), BPMN (a flow and its compensation) and state machines (a→b and
 *     b→a) all produce that shape constantly.
 *   • A link whose source node IS its target node was handed to the router as an
 *     ordinary A→B route. The router excludes the link's own nodes from its
 *     obstacle set, so the "route" was a degenerate stub inside the node body.
 *
 * The output of both routines is a POLYLINE, not a path string. That is
 * deliberate: the renderer's existing path emitters already turn a polyline into
 * the right shape per path type (rounded corners for `orthogonal`, a Catmull-Rom
 * spline for `smooth`/`bezier`, straight segments for `direct`), and hit
 * testing, jump-point detection, label placement and the edge toolbar all read
 * the same polyline. One geometry, every consumer.
 */

export interface FanoutPoint {
  x: number;
  y: number;
}

export interface FanoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FanoutSide = 'left' | 'right' | 'top' | 'bottom';

/** Below this, an offset is "no offset" and the route is returned untouched. */
const EPSILON = 1e-6;

/** Default gap between adjacent links of a parallel bundle. */
export const DEFAULT_PARALLEL_SPACING = 16;

/** Default self-loop bulge / lateral span / per-loop growth. */
export const DEFAULT_SELF_LOOP_SIZE = 40;
export const DEFAULT_SELF_LOOP_SPACING = 18;

// ===========================================================================
// Parallel links
// ===========================================================================

/**
 * The signed lane offsets for a bundle of `count` parallel links, spaced
 * `spacing` apart and centred on the un-separated route.
 *
 *   count 1 → [0]                     (a lone link NEVER moves — this is what
 *                                      keeps every existing diagram pixel-identical)
 *   count 2 → [-s/2, +s/2]
 *   count 3 → [-s, 0, +s]
 *
 * Centred rather than one-sided so a bundle stays visually anchored on the line
 * the single link used to occupy: adding a second relationship between two
 * entities nudges both apart instead of shunting the diagram sideways.
 */
export function parallelOffsets(count: number, spacing = DEFAULT_PARALLEL_SPACING): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    offsets.push((i - (count - 1) / 2) * spacing);
  }
  return offsets;
}

/**
 * The unit LEFT normal of a → b, i.e. the axis a parallel bundle fans along.
 *
 * The caller must derive `a`/`b` from the bundle's CANONICAL node order (e.g.
 * lower node id first), not from each link's own source → target. Otherwise the
 * two halves of a bidirectional pair compute opposite normals, their opposite
 * lane offsets cancel out, and both links land back on top of each other — the
 * exact bug the card exists to fix.
 *
 * Degenerate input (coincident points) falls back to "up", so a bundle between
 * two concentric nodes still fans instead of collapsing to NaN.
 */
export function bundleNormal(a: FanoutPoint, b: FanoutPoint): FanoutPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPSILON) return { x: 0, y: -1 };
  return { x: -dy / len, y: dx / len };
}

/**
 * Push a routed polyline onto its lane in a parallel bundle.
 *
 * The two ENDPOINTS never move: they are the ports, and a fan that pulled the
 * line off its port would be worse than the overlap it fixes. Only the interior
 * of the route is displaced.
 *
 *   • `orthogonal` — every INTERIOR segment is slid along its own normal. A
 *     segment's neighbours run perpendicular to it, so sliding it only makes
 *     them longer or shorter: the route stays exactly orthogonal (no diagonal
 *     ever appears). A route with no interior segment (a straight 2-point
 *     orthogonal run between aligned ports) gets an S-jog inserted instead,
 *     because there is otherwise nothing to displace.
 *   • `direct` / `smooth` / `bezier` — the interior points are displaced along
 *     the bundle normal; a bare 2-point route gets an offset midpoint, which the
 *     path emitters turn into a bow (a spline for smooth, a shallow V for
 *     direct). This is the "curviness" fan GoJS and React Flow draw.
 *
 * `offset === 0` returns the input untouched (same array contents), so a link
 * that is not part of a bundle is byte-identical to the pre-Wave-4 renderer.
 */
export function separateParallelRoute(
  points: FanoutPoint[],
  offset: number,
  normal: FanoutPoint,
  pathType: string
): FanoutPoint[] {
  if (!points || points.length < 2 || Math.abs(offset) < EPSILON) {
    return points;
  }

  return pathType === 'orthogonal'
    ? separateOrthogonal(points, offset, normal)
    : separateFreeform(points, offset, normal);
}

/** direct / smooth / bezier: bow the interior out along the bundle normal. */
function separateFreeform(
  points: FanoutPoint[],
  offset: number,
  normal: FanoutPoint
): FanoutPoint[] {
  const dx = normal.x * offset;
  const dy = normal.y * offset;

  if (points.length === 2) {
    // Nothing interior to move — mint a midpoint and displace THAT. The path
    // emitters read >2 points as "curve through these", so this becomes a bow.
    const a = points[0];
    const b = points[1];
    return [
      { ...a },
      { x: (a.x + b.x) / 2 + dx, y: (a.y + b.y) / 2 + dy },
      { ...b },
    ];
  }

  return points.map((p, i) =>
    i === 0 || i === points.length - 1 ? { ...p } : { x: p.x + dx, y: p.y + dy }
  );
}

/**
 * orthogonal: slide interior segments along their own normals.
 *
 * Segments s0..s(k-1) for points p0..pk. Interior = s1..s(k-2): the segments
 * that touch neither endpoint. Sliding s_i moves p_i and p_{i+1} together, and
 * because s_{i-1} and s_{i+1} are perpendicular to s_i, they simply grow or
 * shrink — orthogonality is preserved exactly.
 *
 * The slide DIRECTION of each interior segment is chosen so it agrees with the
 * bundle normal (positive dot product), which keeps the whole route on one side.
 */
function separateOrthogonal(
  points: FanoutPoint[],
  offset: number,
  normal: FanoutPoint
): FanoutPoint[] {
  const out = points.map(p => ({ x: p.x, y: p.y }));
  const segCount = out.length - 1;

  // Fewer than 4 points ⇒ no interior segment ⇒ nothing to slide.
  if (segCount < 3) {
    return orthogonalJog(points, offset, normal);
  }

  for (let i = 1; i <= segCount - 2; i++) {
    const a = out[i];
    const b = out[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < EPSILON) continue;

    // The segment's own left normal, flipped to agree with the bundle normal so
    // every interior segment of the route slides to the SAME side of the bundle.
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * normal.x + ny * normal.y < 0) {
      nx = -nx;
      ny = -ny;
    }

    // `offset` carries the lane's sign, so a negative lane slides the other way.
    a.x += nx * offset;
    a.y += ny * offset;
    b.x += nx * offset;
    b.y += ny * offset;
  }

  return out;
}

/**
 * An orthogonal route with no interior segment (straight run between aligned
 * ports) has nothing to displace, so give it one: an S-jog that leaves the
 * endpoints alone, steps sideways by `offset` for the middle third, and steps
 * back. Every segment stays axis-aligned because the jog axis is the axis the
 * run is NOT on.
 */
function orthogonalJog(
  points: FanoutPoint[],
  offset: number,
  normal: FanoutPoint
): FanoutPoint[] {
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Axis of travel (the dominant one — a 2-point orthogonal run is axis-aligned
  // anyway, and if it somehow is not, we still emit an orthogonal jog).
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  // Jog along the OTHER axis. Sign comes from the bundle normal so a bundle's
  // lanes stay ordered.
  const jog = horizontal
    ? offset * (normal.y >= 0 ? 1 : -1)
    : offset * (normal.x >= 0 ? 1 : -1);

  if (horizontal) {
    const x1 = a.x + dx / 3;
    const x2 = a.x + (2 * dx) / 3;
    return [
      { ...a },
      { x: x1, y: a.y },
      { x: x1, y: a.y + jog },
      { x: x2, y: b.y + jog },
      { x: x2, y: b.y },
      { ...b },
    ];
  }

  const y1 = a.y + dy / 3;
  const y2 = a.y + (2 * dy) / 3;
  return [
    { ...a },
    { x: a.x, y: y1 },
    { x: a.x + jog, y: y1 },
    { x: b.x + jog, y: y2 },
    { x: b.x, y: y2 },
    { ...b },
  ];
}

// ===========================================================================
// Self-loops
// ===========================================================================

export interface SelfLoopSpec {
  /** World rect of the node both ends live on. */
  rect: FanoutRect;
  /** Source attachment point (world, on the node outline). */
  start: FanoutPoint;
  /** Target attachment point (world, on the node outline). */
  end: FanoutPoint;
  sourceSide: FanoutSide;
  targetSide: FanoutSide;
  /** How far the loop bulges away from the node body (px). */
  size: number;
  /** Lateral span used when the two ends coincide (or nearly do). */
  width: number;
}

/** Outward unit normal of a node side. */
export function sideNormal(side: FanoutSide): FanoutPoint {
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

/** True when the side runs along the x axis (its normal is vertical). */
function isHorizontalSide(side: FanoutSide): boolean {
  return side === 'top' || side === 'bottom';
}

/**
 * Route a self-loop as a polyline: out of the source port, around, back into the
 * target port. EVERY segment is axis-aligned, which is what lets the three path
 * emitters each do the right thing with the same points — rounded rectangle for
 * `orthogonal`, a smooth closed-looking curve for `smooth`/`bezier`, a hard
 * polygon for `direct`.
 *
 * Three cases, and they cover every port pairing:
 *
 *  A. SAME side (incl. the same port twice — the common case). The loop bulges
 *     straight out and spans laterally. When the two attachment points coincide
 *     (or sit closer together than `width`) they are SPREAD apart along the side
 *     by `width`, clamped to the node's own span: a loop whose feet are the same
 *     point has zero area and cannot be drawn at all.
 *
 *  B. PERPENDICULAR sides (right → top, …). Out of the source, one corner, into
 *     the target. An L that wraps the node's corner.
 *
 *  C. OPPOSITE sides (left → right, …). Out of the source, over/around the node
 *     body in a lane `size` clear of it, and back in the far side.
 */
export function buildSelfLoopPoints(spec: SelfLoopSpec): FanoutPoint[] {
  const { rect, sourceSide, targetSide } = spec;
  const size = Math.max(1, spec.size);
  const width = Math.max(1, spec.width);

  const nS = sideNormal(sourceSide);
  const nT = sideNormal(targetSide);

  // ---- A. same side -------------------------------------------------------
  if (sourceSide === targetSide) {
    // Lateral axis of that side: x for top/bottom, y for left/right.
    const lateral: 'x' | 'y' = isHorizontalSide(sourceSide) ? 'x' : 'y';
    const normalAxis: 'x' | 'y' = lateral === 'x' ? 'y' : 'x';
    const spanLo = lateral === 'x' ? rect.x : rect.y;
    const spanHi = lateral === 'x' ? rect.x + rect.width : rect.y + rect.height;

    const a = { ...spec.start };
    const b = { ...spec.end };

    // Both feet must sit on the SAME line for the loop's out-and-back segments
    // to be axis-aligned. They normally do — two ports on one side share that
    // side's coordinate. They do NOT when `selfLoop.side` FORCES a side the
    // ports are not actually on, and the loop then came out diagonal (which is
    // wrong for `orthogonal` links and just ugly for the rest). Project them
    // onto the forced side's edge.
    if (Math.abs(a[normalAxis] - b[normalAxis]) > EPSILON) {
      const edge =
        sourceSide === 'left' ? rect.x
        : sourceSide === 'right' ? rect.x + rect.width
        : sourceSide === 'top' ? rect.y
        : rect.y + rect.height;
      a[normalAxis] = edge;
      b[normalAxis] = edge;
    }

    if (Math.abs(a[lateral] - b[lateral]) < width) {
      // Spread the feet apart so the loop has a body. Centre the spread on the
      // midpoint of the two ends, then clamp it inside the node's own side.
      const mid = (a[lateral] + b[lateral]) / 2;
      const half = Math.min(width / 2, Math.max(1, (spanHi - spanLo) / 2 - 1));
      const lo = Math.max(spanLo + 1, Math.min(mid - half, spanHi - 1 - 2 * half));
      a[lateral] = lo;
      b[lateral] = lo + 2 * half;
    }

    const aOut = { x: a.x + nS.x * size, y: a.y + nS.y * size };
    const bOut = { x: b.x + nS.x * size, y: b.y + nS.y * size };
    return [a, aOut, bOut, b];
  }

  const a = { ...spec.start };
  const b = { ...spec.end };
  const aOut = { x: a.x + nS.x * size, y: a.y + nS.y * size };
  const bOut = { x: b.x + nT.x * size, y: b.y + nT.y * size };

  // ---- C. opposite sides --------------------------------------------------
  if (nS.x === -nT.x && nS.y === -nT.y) {
    if (isHorizontalSide(sourceSide)) {
      // top ↔ bottom: run around the node in a vertical lane to its LEFT.
      const laneX = rect.x - size;
      return [
        a,
        aOut,
        { x: laneX, y: aOut.y },
        { x: laneX, y: bOut.y },
        bOut,
        b,
      ];
    }
    // left ↔ right: run over the node in a horizontal lane ABOVE it.
    const laneY = rect.y - size;
    return [
      a,
      aOut,
      { x: aOut.x, y: laneY },
      { x: bOut.x, y: laneY },
      bOut,
      b,
    ];
  }

  // ---- B. perpendicular sides --------------------------------------------
  // One normal is horizontal and the other vertical, so the corner is simply
  // "source's out-x, target's out-y" (or the mirror).
  const corner = isHorizontalSide(sourceSide)
    ? { x: bOut.x, y: aOut.y } // source normal vertical, target normal horizontal
    : { x: aOut.x, y: bOut.y }; // source normal horizontal, target normal vertical

  return [a, aOut, corner, bOut, b];
}
