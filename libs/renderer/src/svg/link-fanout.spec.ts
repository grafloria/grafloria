// link-fanout.spec.ts — Wave 4 (Edges & links), Card 4
//
// Parallel-link separation and self-loop routing. Pure geometry, so these are
// the tests that pin the RULES: a lone link never moves, an orthogonal route
// stays orthogonal after it has been fanned, and a self-loop always has a body.

import {
  DEFAULT_PARALLEL_SPACING,
  buildSelfLoopPoints,
  bundleNormal,
  parallelOffsets,
  separateParallelRoute,
  sideNormal,
  type FanoutPoint,
} from './link-fanout';

/** Every segment of an orthogonal route must be axis-aligned. */
function isOrthogonal(points: FanoutPoint[]): boolean {
  const EPS = 1e-6;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = Math.abs(points[i + 1].x - points[i].x);
    const dy = Math.abs(points[i + 1].y - points[i].y);
    if (dx > EPS && dy > EPS) return false;
  }
  return true;
}

describe('link-fanout — parallelOffsets', () => {
  it('leaves a LONE link exactly where it was — offset 0', () => {
    // The whole no-regression guarantee of Card 4 rests on this: every existing
    // single-link diagram must be pixel-identical.
    expect(parallelOffsets(1)).toEqual([0]);
  });

  it('fans a pair symmetrically around the un-separated route', () => {
    expect(parallelOffsets(2, 16)).toEqual([-8, 8]);
  });

  it('keeps the middle link of an odd bundle on the original centre line', () => {
    expect(parallelOffsets(3, 16)).toEqual([-16, 0, 16]);
  });

  it('spaces adjacent lanes by exactly `spacing`', () => {
    const offsets = parallelOffsets(5, 10);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i] - offsets[i - 1]).toBeCloseTo(10);
    }
  });

  it('defaults to the documented spacing', () => {
    expect(parallelOffsets(2)).toEqual([
      -DEFAULT_PARALLEL_SPACING / 2,
      DEFAULT_PARALLEL_SPACING / 2,
    ]);
  });

  it('returns nothing for an empty bundle', () => {
    expect(parallelOffsets(0)).toEqual([]);
  });
});

describe('link-fanout — bundleNormal', () => {
  it('is the LEFT normal of a → b', () => {
    expect(bundleNormal({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: -0, y: 1 });
  });

  it('is a unit vector', () => {
    const n = bundleNormal({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
  });

  it('falls back to "up" for coincident points instead of producing NaN', () => {
    const n = bundleNormal({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(n).toEqual({ x: 0, y: -1 });
  });

  it('FLIPS when the endpoints are swapped — which is exactly why the caller must pass the CANONICAL pair order', () => {
    // If each link of a bidirectional pair derived the normal from its OWN
    // source→target, the two would get opposite normals, their opposite lane
    // offsets would cancel, and both links would land back on top of each other.
    const forward = bundleNormal({ x: 0, y: 0 }, { x: 10, y: 0 });
    const backward = bundleNormal({ x: 10, y: 0 }, { x: 0, y: 0 });
    expect(backward.x).toBeCloseTo(-forward.x);
    expect(backward.y).toBeCloseTo(-forward.y);
  });
});

describe('link-fanout — separateParallelRoute', () => {
  const normal: FanoutPoint = { x: 0, y: 1 };

  it('returns the route UNTOUCHED at offset 0', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(separateParallelRoute(points, 0, normal, 'direct')).toBe(points);
  });

  describe('direct / smooth (freeform)', () => {
    it('bows a 2-point route by minting an offset midpoint', () => {
      const out = separateParallelRoute(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10,
        normal,
        'direct'
      );

      expect(out).toHaveLength(3);
      expect(out[1]).toEqual({ x: 50, y: 10 });
    });

    it('NEVER moves the endpoints — a fan that pulled the line off its port would be worse than the overlap', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 100, y: 40 };
      const out = separateParallelRoute([a, b], 25, normal, 'smooth');

      expect(out[0]).toEqual(a);
      expect(out[out.length - 1]).toEqual(b);
    });

    it('displaces the interior of a multi-point route along the bundle normal', () => {
      const out = separateParallelRoute(
        [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
        12,
        normal,
        'smooth'
      );

      expect(out[1]).toEqual({ x: 50, y: 12 });
      expect(out[0]).toEqual({ x: 0, y: 0 });
      expect(out[2]).toEqual({ x: 100, y: 0 });
    });

    it('sends opposite lanes to opposite sides', () => {
      const up = separateParallelRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }], 8, normal, 'direct');
      const down = separateParallelRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }], -8, normal, 'direct');

      expect(up[1].y).toBeGreaterThan(0);
      expect(down[1].y).toBeLessThan(0);
    });
  });

  describe('orthogonal', () => {
    it('slides the interior segment of a Z-route and STAYS ORTHOGONAL', () => {
      // A classic Z: right, down, right. Only the middle (vertical) segment is
      // interior, so only it slides — which moves it along x and leaves the two
      // horizontal stubs horizontal.
      const z = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 60 },
        { x: 100, y: 60 },
      ];
      const out = separateParallelRoute(z, 10, { x: 1, y: 0 }, 'orthogonal');

      expect(isOrthogonal(out)).toBe(true);
      expect(out[0]).toEqual(z[0]);
      expect(out[3]).toEqual(z[3]);
      // The middle segment moved bodily along the bundle normal.
      expect(out[1].x).toBeCloseTo(60);
      expect(out[2].x).toBeCloseTo(60);
      expect(out[1].y).toBeCloseTo(0);
      expect(out[2].y).toBeCloseTo(60);
    });

    it('inserts an S-jog when a straight orthogonal run has NO interior segment to slide', () => {
      // Aligned ports ⇒ a 2-point route ⇒ nothing to displace. Without the jog,
      // parallel links between aligned ports would still stack.
      const out = separateParallelRoute(
        [{ x: 0, y: 0 }, { x: 90, y: 0 }],
        12,
        { x: 0, y: 1 },
        'orthogonal'
      );

      expect(out.length).toBeGreaterThan(2);
      expect(isOrthogonal(out)).toBe(true);
      expect(out[0]).toEqual({ x: 0, y: 0 });
      expect(out[out.length - 1]).toEqual({ x: 90, y: 0 });
      // …and it actually leaves the centre line.
      expect(Math.max(...out.map(p => Math.abs(p.y)))).toBeCloseTo(12);
    });

    it('jogs a VERTICAL straight run along x (the jog axis is the one the run is not on)', () => {
      const out = separateParallelRoute(
        [{ x: 0, y: 0 }, { x: 0, y: 90 }],
        12,
        { x: 1, y: 0 },
        'orthogonal'
      );

      expect(isOrthogonal(out)).toBe(true);
      expect(Math.max(...out.map(p => Math.abs(p.x)))).toBeCloseTo(12);
    });

    it('stays orthogonal on a 5-segment route where several interior segments slide', () => {
      const route = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 50 },
        { x: 80, y: 50 },
        { x: 80, y: 100 },
        { x: 120, y: 100 },
      ];
      const out = separateParallelRoute(route, 9, { x: 1, y: -1 }, 'orthogonal');

      expect(isOrthogonal(out)).toBe(true);
      expect(out[0]).toEqual(route[0]);
      expect(out[out.length - 1]).toEqual(route[route.length - 1]);
    });
  });
});

describe('link-fanout — sideNormal', () => {
  it('points OUT of the node on every side', () => {
    expect(sideNormal('left')).toEqual({ x: -1, y: 0 });
    expect(sideNormal('right')).toEqual({ x: 1, y: 0 });
    expect(sideNormal('top')).toEqual({ x: 0, y: -1 });
    expect(sideNormal('bottom')).toEqual({ x: 0, y: 1 });
  });
});

describe('link-fanout — buildSelfLoopPoints', () => {
  const rect = { x: 100, y: 100, width: 120, height: 60 };

  it('gives a SAME-PORT loop a body by spreading its feet apart', () => {
    // Both ends on the identical point: a loop with zero area cannot be drawn at
    // all. The feet are spread along the side by `width`.
    const port = { x: 220, y: 130 }; // right edge, vertical centre
    const points = buildSelfLoopPoints({
      rect,
      start: port,
      end: port,
      sourceSide: 'right',
      targetSide: 'right',
      size: 40,
      width: 30,
    });

    expect(points).toHaveLength(4);
    expect(points[0].y).not.toBeCloseTo(points[3].y); // feet no longer coincide
    expect(Math.abs(points[0].y - points[3].y)).toBeCloseTo(30);
    expect(isOrthogonal(points)).toBe(true);
  });

  it('bulges a same-side loop OUT by `size`', () => {
    const port = { x: 220, y: 130 };
    const points = buildSelfLoopPoints({
      rect,
      start: port,
      end: port,
      sourceSide: 'right',
      targetSide: 'right',
      size: 40,
      width: 30,
    });

    const furthest = Math.max(...points.map(p => p.x));
    expect(furthest - rect.x - rect.width).toBeCloseTo(40);
  });

  it('keeps the feet of a spread loop ON the node', () => {
    const port = { x: 220, y: 130 };
    const points = buildSelfLoopPoints({
      rect,
      start: port,
      end: port,
      sourceSide: 'right',
      targetSide: 'right',
      // A width far wider than the node's side: the spread has to be clamped or
      // the loop's feet would float off the shape entirely.
      size: 40,
      width: 500,
    });

    for (const foot of [points[0], points[3]]) {
      expect(foot.y).toBeGreaterThanOrEqual(rect.y);
      expect(foot.y).toBeLessThanOrEqual(rect.y + rect.height);
    }
  });

  it('does NOT spread two same-side ports that are already far enough apart', () => {
    const a = { x: 220, y: 110 };
    const b = { x: 220, y: 150 };
    const points = buildSelfLoopPoints({
      rect,
      start: a,
      end: b,
      sourceSide: 'right',
      targetSide: 'right',
      size: 40,
      width: 30, // they are 40 apart, wider than this
    });

    expect(points[0]).toEqual(a);
    expect(points[3]).toEqual(b);
    expect(isOrthogonal(points)).toBe(true);
  });

  it('wraps the corner for PERPENDICULAR sides (right → top)', () => {
    const points = buildSelfLoopPoints({
      rect,
      start: { x: 220, y: 130 },
      end: { x: 160, y: 100 },
      sourceSide: 'right',
      targetSide: 'top',
      size: 40,
      width: 40,
    });

    expect(points).toHaveLength(5);
    expect(isOrthogonal(points)).toBe(true);
    // Out to the right of the node, and up above it.
    expect(Math.max(...points.map(p => p.x))).toBeCloseTo(260);
    expect(Math.min(...points.map(p => p.y))).toBeCloseTo(60);
  });

  it('runs a lane around the body for OPPOSITE sides (right → left)', () => {
    const points = buildSelfLoopPoints({
      rect,
      start: { x: 220, y: 130 },
      end: { x: 100, y: 130 },
      sourceSide: 'right',
      targetSide: 'left',
      size: 40,
      width: 40,
    });

    expect(points).toHaveLength(6);
    expect(isOrthogonal(points)).toBe(true);
    // The lane clears the node's TOP by `size` — it must not cut through the body.
    expect(Math.min(...points.map(p => p.y))).toBeCloseTo(rect.y - 40);
  });

  it('runs a VERTICAL lane for opposite top/bottom sides', () => {
    const points = buildSelfLoopPoints({
      rect,
      start: { x: 160, y: 100 },
      end: { x: 160, y: 160 },
      sourceSide: 'top',
      targetSide: 'bottom',
      size: 40,
      width: 40,
    });

    expect(isOrthogonal(points)).toBe(true);
    expect(Math.min(...points.map(p => p.x))).toBeCloseTo(rect.x - 40);
  });

  it('never lets the loop degenerate: at least 4 points, orthogonal, finite — for EVERY pairing of sides', () => {
    // This is the sweep that caught the real bug: a same-side loop whose two feet
    // did NOT share that side's coordinate came out DIAGONAL. That is precisely
    // what `selfLoop.side` produces — it forces a side the ports are not on.
    const sides = ['left', 'right', 'top', 'bottom'] as const;
    for (const s of sides) {
      for (const t of sides) {
        const points = buildSelfLoopPoints({
          rect,
          start: { x: 220, y: 130 },
          end: { x: 160, y: 160 },
          sourceSide: s,
          targetSide: t,
          size: 35,
          width: 35,
        });
        expect(points.length).toBeGreaterThanOrEqual(4);
        expect(isOrthogonal(points)).toBe(true);
        expect(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      }
    }
  });

  it('projects the feet onto the FORCED side when the ports are not actually on it', () => {
    // `selfLoop.side: 'top'` on a link whose ports sit on the right edge.
    const points = buildSelfLoopPoints({
      rect,
      start: { x: 220, y: 120 },
      end: { x: 220, y: 145 },
      sourceSide: 'top',
      targetSide: 'top',
      size: 30,
      width: 30,
    });

    expect(isOrthogonal(points)).toBe(true);
    // Both feet land on the node's TOP edge, not somewhere inside its body.
    expect(points[0].y).toBeCloseTo(rect.y);
    expect(points[points.length - 1].y).toBeCloseTo(rect.y);
    // …and the loop bulges upward, away from the body.
    expect(Math.min(...points.map(p => p.y))).toBeCloseTo(rect.y - 30);
  });
});
