import type { LinkModel } from '@grafloria/engine';

export interface Point {
  x: number;
  y: number;
}

export interface ClosestHit {
  /** Fraction along the path, 0-1. */
  t: number;
  point: Point;
  distance: number;
}

/**
 * Wave 3 (Edges & links), Card B — the RENDERED route of a link.
 *
 * THE GOTCHA THIS TYPE EXISTS FOR
 * -------------------------------
 * `LinkModel.getPointAtPosition()` walks `link.segments` whenever they are
 * non-empty. But the SVG renderer NEVER writes `segments`: every frame it
 * assigns the freshly-routed polyline straight onto `link.points`
 * (`syncLinkPoints`, deliberately bypassing `setPoints()` to avoid a
 * re-render loop). `segments` therefore keeps whatever `generatePath()` last
 * left there — geometry from before the node moved, before the detour, before
 * the reroute. Anchoring a toolbar to it makes the toolbar drift OFF the line.
 *
 * So this class reads, in order of truth:
 *
 *   1. THE RENDERED <path> ELEMENT. The renderer tags each link group with
 *      `data-link-id`, so the browser's own path measurement
 *      (getTotalLength / getPointAtLength) can be used. This is the literal
 *      drawn curve: bezier bulge, rounded corners and jump arcs included.
 *   2. `link.points` — the polyline the renderer synced THIS frame. Exact for
 *      orthogonal/direct links, a chord approximation for a curve. Used in
 *      jsdom (no SVG geometry API) and before the first paint.
 *
 * `link.segments` is never consulted.
 */
export class RenderedLinkPath {
  private constructor(
    private readonly points: Point[],
    private readonly pathEl: SVGPathElement | null,
    private readonly totalLength: number
  ) {}

  /**
   * Resolve a link's rendered route.
   *
   * @param link the link to measure
   * @param root any ancestor of the rendered SVG (usually the canvas container).
   *             When omitted — or when it has no measurable <path> for this link
   *             — the polyline fallback is used.
   */
  static forLink(link: LinkModel, root?: Element | null): RenderedLinkPath {
    const points = (link.points ?? [])
      .filter(p => p && isFinite(p.x) && isFinite(p.y))
      .map(p => ({ x: p.x, y: p.y }));

    const pathEl = RenderedLinkPath.findPathElement(link, root);
    let totalLength = 0;
    if (pathEl) {
      try {
        totalLength = pathEl.getTotalLength();
      } catch {
        totalLength = 0;
      }
    }

    // A zero/NaN length means the element exists but cannot be measured
    // (jsdom, or not laid out yet) → fall back to the polyline.
    const usable = pathEl && isFinite(totalLength) && totalLength > 0 ? pathEl : null;
    return new RenderedLinkPath(points, usable, usable ? totalLength : 0);
  }

  /** True when measuring the real drawn path rather than the point polyline. */
  get isDomMeasured(): boolean {
    return this.pathEl !== null;
  }

  /** False when the link has no usable geometry at all (nothing to anchor to). */
  get isValid(): boolean {
    return this.pathEl !== null || this.points.length >= 2;
  }

  get length(): number {
    return this.pathEl ? this.totalLength : polylineLength(this.points);
  }

  /** Point at fraction `t` (0-1) along the rendered path. */
  pointAt(t: number): Point | null {
    const clamped = clamp01(t);
    if (this.pathEl) {
      try {
        const p = this.pathEl.getPointAtLength(this.totalLength * clamped);
        return { x: p.x, y: p.y };
      } catch {
        /* fall through to the polyline */
      }
    }
    return pointAtFraction(this.points, clamped);
  }

  /**
   * Unit normal at `t` — the tangent rotated 90° CCW, matching
   * `LinkModel.getNormalAt`. Used to lift the toolbar OFF the line.
   */
  normalAt(t: number): Point | null {
    const tangent = this.tangentAt(t);
    if (!tangent) return null;
    return { x: -tangent.y, y: tangent.x };
  }

  /** Unit tangent at `t` (direction of travel). */
  tangentAt(t: number): Point | null {
    const clamped = clamp01(t);
    if (this.pathEl) {
      // Central difference over a small arc window — works for curves as well
      // as straight runs, and never divides by zero at the endpoints.
      const eps = Math.min(1, this.totalLength * 0.01) || 1;
      const at = this.totalLength * clamped;
      const a = this.samplePath(Math.max(0, at - eps));
      const b = this.samplePath(Math.min(this.totalLength, at + eps));
      if (a && b) {
        const v = normalize({ x: b.x - a.x, y: b.y - a.y });
        if (v) return v;
      }
    }
    return tangentAtFraction(this.points, clamped);
  }

  /**
   * Closest point on the rendered path to an arbitrary world point — the
   * "where did the user click on this edge" query behind insert-node-on-edge.
   */
  closestTo(point: Point, samples = 100): ClosestHit | null {
    if (this.pathEl) {
      let best: ClosestHit | null = null;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const p = this.samplePath(this.totalLength * t);
        if (!p) continue;
        const distance = Math.hypot(p.x - point.x, p.y - point.y);
        if (!best || distance < best.distance) {
          best = { t, point: p, distance };
        }
      }
      if (best) return best;
    }
    return closestOnPolyline(this.points, point);
  }

  /** The polyline this path was resolved from (never `link.segments`). */
  toPolyline(): Point[] {
    return this.points.map(p => ({ ...p }));
  }

  private samplePath(at: number): Point | null {
    try {
      const p = this.pathEl!.getPointAtLength(at);
      return { x: p.x, y: p.y };
    } catch {
      return null;
    }
  }

  /**
   * The VISIBLE path of a link group. The group carries `data-link-id`; its
   * first child path is the wide transparent hit area (`.link-hit-area`), which
   * traces the same route but must not be preferred — skip it and take the
   * stroked path itself.
   */
  private static findPathElement(link: LinkModel, root?: Element | null): SVGPathElement | null {
    if (!root || typeof root.querySelector !== 'function') return null;

    let group: Element | null = null;
    try {
      group = root.querySelector(`[data-link-id="${cssEscape(link.id)}"]`);
    } catch {
      return null;
    }
    if (!group) return null;

    const paths = Array.from(group.querySelectorAll('path'));
    const visible = paths.find(p => !p.classList.contains('link-hit-area')) ?? paths[0];
    if (!visible) return null;

    // jsdom creates SVG elements without the geometry API — treat as absent.
    const el = visible as unknown as SVGPathElement;
    return typeof el.getTotalLength === 'function' && typeof el.getPointAtLength === 'function'
      ? el
      : null;
  }
}

// ---------------------------------------------------------------------------
// Pure polyline helpers (exported: the fallback maths is worth testing alone)
// ---------------------------------------------------------------------------

export function clamp01(t: number): number {
  if (!isFinite(t)) return 0;
  return Math.max(0, Math.min(1, t));
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

/** Arc-length interpolation along a polyline (NOT index interpolation). */
export function pointAtFraction(points: Point[], t: number): Point | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0] };

  const total = polylineLength(points);
  if (total <= 0) return { ...points[0] };

  let remaining = clamp01(t) * total;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segLen || i === points.length - 2) {
      const st = segLen > 0 ? Math.min(1, remaining / segLen) : 0;
      return { x: a.x + (b.x - a.x) * st, y: a.y + (b.y - a.y) * st };
    }
    remaining -= segLen;
  }
  return { ...points[points.length - 1] };
}

/** Unit direction of travel at fraction `t`. */
export function tangentAtFraction(points: Point[], t: number): Point | null {
  if (points.length < 2) return null;

  const total = polylineLength(points);
  if (total <= 0) {
    return normalize({
      x: points[points.length - 1].x - points[0].x,
      y: points[points.length - 1].y - points[0].y,
    }) ?? { x: 1, y: 0 };
  }

  let remaining = clamp01(t) * total;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segLen || i === points.length - 2) {
      return normalize({ x: b.x - a.x, y: b.y - a.y }) ?? { x: 1, y: 0 };
    }
    remaining -= segLen;
  }
  return { x: 1, y: 0 };
}

export function closestOnPolyline(points: Point[], target: Point): ClosestHit | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      t: 0,
      point: { ...points[0] },
      distance: Math.hypot(points[0].x - target.x, points[0].y - target.y),
    };
  }

  const total = polylineLength(points);
  let best: ClosestHit | null = null;
  let travelled = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);

    // Project the target onto the segment, clamped to its extent.
    let st = 0;
    if (segLen > 0) {
      st = ((target.x - a.x) * dx + (target.y - a.y) * dy) / (segLen * segLen);
      st = Math.max(0, Math.min(1, st));
    }
    const point = { x: a.x + dx * st, y: a.y + dy * st };
    const distance = Math.hypot(point.x - target.x, point.y - target.y);

    if (!best || distance < best.distance) {
      best = {
        distance,
        point,
        t: total > 0 ? (travelled + segLen * st) / total : 0,
      };
    }
    travelled += segLen;
  }

  return best;
}

/**
 * Split a polyline at fraction `t`, keeping every interior vertex on the
 * correct side. This is what lets insert-node-on-edge RESPECT MANUAL
 * WAYPOINTS: the waypoints before the split stay on the upstream link, the
 * ones after it move to the downstream link.
 */
export function splitPolylineAt(
  points: Point[],
  t: number
): { before: Point[]; after: Point[]; point: Point } | null {
  if (points.length < 2) return null;

  const total = polylineLength(points);
  const point = pointAtFraction(points, t);
  if (!point || total <= 0) return null;

  const cut = clamp01(t) * total;
  const before: Point[] = [{ ...points[0] }];
  const after: Point[] = [];
  let travelled = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const segEnd = travelled + segLen;

    if (segEnd <= cut) {
      // Whole segment is upstream of the cut.
      before.push({ ...b });
    } else if (travelled >= cut) {
      // Whole segment is downstream.
      if (after.length === 0) after.push({ ...a });
      after.push({ ...b });
    } else {
      // The cut lands INSIDE this segment.
      before.push({ ...point });
      after.push({ ...point }, { ...b });
    }
    travelled = segEnd;
  }

  if (after.length === 0) after.push({ ...point }, { ...points[points.length - 1] });
  if (before.length === 1) before.push({ ...point });

  return { before, after, point };
}

function normalize(v: Point): Point | null {
  const len = Math.hypot(v.x, v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : null;
}

/** Minimal attribute-selector escaping (CSS.escape is not in jsdom). */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
