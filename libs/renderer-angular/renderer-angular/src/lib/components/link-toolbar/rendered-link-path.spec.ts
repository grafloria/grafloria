// Wave 3 (Edges & links), Card B — the rendered-route resolver.
//
// The whole point of this type is the STALE-SEGMENTS trap: the SVG renderer
// syncs a link's freshly-routed polyline onto `link.points` every frame but
// never touches `link.segments`, while LinkModel.getPointAtPosition() prefers
// `segments`. Anchoring a toolbar to the model's segments therefore drifts off
// the line. These specs pin that we read the DRAWN path (or, failing that, the
// synced polyline) and never the segments.

import { LinkModel } from '@grafloria/engine';
import {
  RenderedLinkPath,
  closestOnPolyline,
  pointAtFraction,
  polylineLength,
  splitPolylineAt,
  tangentAtFraction,
} from './rendered-link-path';

describe('polyline maths', () => {
  const L = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('measures arc length, not vertex count', () => {
    expect(polylineLength(L)).toBe(200);
  });

  it('interpolates by ARC LENGTH (the midpoint of an L is its corner)', () => {
    expect(pointAtFraction(L, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAtFraction(L, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAtFraction(L, 0.75)).toEqual({ x: 100, y: 50 });
  });

  it('clamps t and survives degenerate input', () => {
    expect(pointAtFraction(L, -5)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(L, 9)).toEqual({ x: 100, y: 100 });
    expect(pointAtFraction([], 0.5)).toBeNull();
    expect(pointAtFraction([{ x: 3, y: 4 }], 0.5)).toEqual({ x: 3, y: 4 });
  });

  it('gives the unit direction of travel at t', () => {
    expect(tangentAtFraction(L, 0.25)).toEqual({ x: 1, y: 0 });
    expect(tangentAtFraction(L, 0.9)).toEqual({ x: 0, y: 1 });
  });

  it('projects an arbitrary point onto the nearest segment', () => {
    const hit = closestOnPolyline(L, { x: 40, y: 12 })!;
    expect(hit.point).toEqual({ x: 40, y: 0 });
    expect(hit.distance).toBe(12);
    expect(hit.t).toBeCloseTo(0.2, 6); // 40 of 200
  });

  describe('splitPolylineAt — the waypoint-preserving cut', () => {
    it('keeps interior vertices on the correct side of the cut', () => {
      const split = splitPolylineAt(L, 0.75)!;
      // Cut at (100,50): the corner (100,0) belongs upstream.
      expect(split.point).toEqual({ x: 100, y: 50 });
      expect(split.before).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]);
      expect(split.after).toEqual([{ x: 100, y: 50 }, { x: 100, y: 100 }]);
    });

    it('cuts mid-segment, before any waypoint', () => {
      const split = splitPolylineAt(L, 0.25)!;
      expect(split.before).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
      expect(split.after).toEqual([{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    });

    it('both halves always join at the split point (no gap)', () => {
      for (const t of [0.1, 0.33, 0.5, 0.67, 0.9]) {
        const s = splitPolylineAt(L, t)!;
        expect(s.before[s.before.length - 1]).toEqual(s.point);
        expect(s.after[0]).toEqual(s.point);
      }
    });
  });
});

describe('RenderedLinkPath', () => {
  function link(points: Array<{ x: number; y: number }>): LinkModel {
    const l = new LinkModel('src', 'tgt', 'orthogonal');
    l.points = points;
    return l;
  }

  it('falls back to the per-frame POINT polyline when no drawn path is reachable', () => {
    const path = RenderedLinkPath.forLink(link([{ x: 0, y: 0 }, { x: 100, y: 0 }]), null);

    expect(path.isValid).toBe(true);
    expect(path.isDomMeasured).toBe(false);
    expect(path.pointAt(0.5)).toEqual({ x: 50, y: 0 });
    expect(path.normalAt(0.5)).toEqual({ x: -0, y: 1 });
  });

  it('IGNORES stale LinkModel.segments (the trap this class exists for)', () => {
    const l = link([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    // Geometry from BEFORE the node moved — exactly what the renderer leaves
    // behind, and what LinkModel.getPointAtPosition() would happily return.
    l.segments = [
      { type: 'line', from: { x: 0, y: 900 }, to: { x: 100, y: 900 } } as any,
    ];

    expect(l.getPointAtPosition(0.5)).toEqual({ x: 50, y: 900 }); // ← the stale answer
    expect(RenderedLinkPath.forLink(l, null).pointAt(0.5)).toEqual({ x: 50, y: 0 }); // ← the drawn one
  });

  it('is invalid (nothing to anchor to) for a link with no geometry', () => {
    expect(RenderedLinkPath.forLink(link([]), null).isValid).toBe(false);
  });

  describe('DOM measurement (a real browser measures the DRAWN curve)', () => {
    /**
     * jsdom has no SVG geometry API, so stand in a <g data-link-id> whose path
     * exposes getTotalLength/getPointAtLength — the same contract Chrome gives
     * us, and the reason a bezier's bulge and a jump arc are measured correctly
     * instead of being approximated by their chord.
     */
    function domRootFor(l: LinkModel, sample: (at: number) => { x: number; y: number }, total = 100) {
      const root = document.createElement('div');
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-link-id', l.id);

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('class', 'link-hit-area');
      (hit as any).getTotalLength = () => total;
      (hit as any).getPointAtLength = () => ({ x: -999, y: -999 }); // must never be chosen

      const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      (visible as any).getTotalLength = () => total;
      (visible as any).getPointAtLength = (at: number) => sample(at);

      g.appendChild(hit);
      g.appendChild(visible);
      root.appendChild(g);
      return root;
    }

    it('prefers the rendered <path> over the polyline, and skips the hit-area path', () => {
      const l = link([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      // A curve that bulges 40px off the chord at its midpoint.
      const root = domRootFor(l, at => ({ x: at, y: at === 50 ? 40 : 0 }));

      const path = RenderedLinkPath.forLink(l, root);
      expect(path.isDomMeasured).toBe(true);
      expect(path.length).toBe(100);
      // The polyline would say y=0 here; the DRAWN path bulges to y=40.
      expect(path.pointAt(0.5)).toEqual({ x: 50, y: 40 });
    });

    it('derives the tangent/normal from the drawn path', () => {
      const l = link([{ x: 0, y: 0 }, { x: 0, y: 100 }]);
      const root = domRootFor(l, at => ({ x: 0, y: at })); // travelling straight down

      const path = RenderedLinkPath.forLink(l, root);
      const tangent = path.tangentAt(0.5)!;
      expect(tangent.x).toBeCloseTo(0, 6);
      expect(tangent.y).toBeCloseTo(1, 6);

      const normal = path.normalAt(0.5)!;
      expect(normal.x).toBeCloseTo(-1, 6);
      expect(normal.y).toBeCloseTo(0, 6);
    });

    it('falls back to the polyline when the element cannot be measured', () => {
      const l = link([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const root = domRootFor(l, () => ({ x: 0, y: 0 }), 0); // zero length = unlaid-out

      const path = RenderedLinkPath.forLink(l, root);
      expect(path.isDomMeasured).toBe(false);
      expect(path.pointAt(0.5)).toEqual({ x: 50, y: 0 });
    });

    it('finds the closest point on the drawn path', () => {
      const l = link([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const root = domRootFor(l, at => ({ x: at, y: 0 }));

      const hit = RenderedLinkPath.forLink(l, root).closestTo({ x: 30, y: 10 })!;
      expect(hit.point.x).toBeCloseTo(30, 1);
      expect(hit.t).toBeCloseTo(0.3, 2);
      expect(hit.distance).toBeCloseTo(10, 1);
    });
  });
});
