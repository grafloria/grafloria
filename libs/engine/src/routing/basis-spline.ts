/**
 * Mermaid's curve (d3's curveBasis) through a route: a uniform cubic B-spline
 * that starts and ends ON the route's end points, straight along its first and
 * last legs, and between them stays inside the polygon of its points — so a
 * short leg beside a long one can never throw it past an end into a loop, as a
 * curve through every point (Catmull-Rom) does. It passes NEAR its bends, not
 * through them.
 *
 * One definition for both sides: the renderer draws a link styled
 * `spline: 'basis'` with it, and an import that places a label beside such a
 * line samples it to find where on the drawn line that label sits.
 */
import type { Point } from '../types/geometry.types';

/** One piece of the curve: a line to `to`, or a cubic to `to` through `c1`, `c2`. */
export interface BasisSegment {
  to: Point;
  c1?: Point;
  c2?: Point;
}

/** The curve's pieces after its first point (d3's curveBasis, piece for piece). */
export function basisSegments(points: ReadonlyArray<Point>): BasisSegment[] {
  const n = points.length;
  if (n < 3) return points.slice(1).map((to) => ({ to: { x: to.x, y: to.y } }));
  const mix = (a: Point, wa: number, b: Point, wb: number, c?: Point, wc = 0): Point => ({
    x: (a.x * wa + b.x * wb + (c ? c.x * wc : 0)) / (wa + wb + wc),
    y: (a.y * wa + b.y * wb + (c ? c.y * wc : 0)) / (wa + wb + wc),
  });
  const out: BasisSegment[] = [{ to: mix(points[0], 5, points[1], 1) }];
  for (let i = 2; i <= n; i++) {
    const a = points[i - 2];
    const b = points[i - 1];
    const p = points[i] ?? b;
    out.push({ c1: mix(a, 2, b, 1), c2: mix(a, 1, b, 2), to: mix(a, 1, b, 4, p, 1) });
  }
  out.push({ to: { x: points[n - 1].x, y: points[n - 1].y } });
  return out;
}

/** The curve as a polyline: each cubic sampled `stepsPerSegment` times (the renderer's painted path). */
export function sampleBasis(points: ReadonlyArray<Point>, stepsPerSegment = 8): Point[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: Point[] = [{ x: points[0].x, y: points[0].y }];
  for (const seg of basisSegments(points)) {
    const from = out[out.length - 1];
    if (!seg.c1 || !seg.c2) {
      out.push(seg.to);
      continue;
    }
    for (let s = 1; s <= stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const mt = 1 - t;
      out.push({
        x: mt * mt * mt * from.x + 3 * mt * mt * t * seg.c1.x + 3 * mt * t * t * seg.c2.x + t * t * t * seg.to.x,
        y: mt * mt * mt * from.y + 3 * mt * mt * t * seg.c1.y + 3 * mt * t * t * seg.c2.y + t * t * t * seg.to.y,
      });
    }
  }
  return out;
}
