// Wave 5 (Edge routing) — Card 1: port-anchor jetty + dynamic exit-side.
//
// The contract: with `options.jetty` set, the route leaves the source and
// enters the target PERPENDICULAR to the port side for at least `jetty` px
// before the first bend — on WHICHEVER branch produced the route (simple,
// A*-avoidance, collision fallback). A floating (direction-less) anchor derives
// its exit side from the relative geometry instead of the stub-less midline.
// With jetty UNSET, behaviour is the legacy one, byte-for-byte.

import { OrthogonalRouter } from './OrthogonalRouter';
import type { RoutedPath } from '../types';
import type { Point } from '../../types';

type Side = 'left' | 'right' | 'top' | 'bottom';

const DIR: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** Signed length of the first segment along the port normal; NaN if not perpendicular. */
function stubAlong(path: RoutedPath, anchor: Point, side: Side, fromEnd = false): number {
  const pts = fromEnd ? [...path.points].reverse() : path.points;
  expect(pts[0]).toEqual(expect.objectContaining({ x: anchor.x, y: anchor.y }));
  const v = DIR[side];
  const seg = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
  const perpendicular = v.x !== 0 ? seg.y === 0 : seg.x === 0;
  if (!perpendicular) return NaN;
  return seg.x * v.x + seg.y * v.y;
}

describe('OrthogonalRouter — jetty + dynamic exit-side (Wave 5, Card 1)', () => {
  let router: OrthogonalRouter;

  beforeEach(() => {
    router = new OrthogonalRouter();
  });

  describe('the guarantee', () => {
    it('a SHORT link (where the legacy gap clamp shrinks the stub) still gets the full jetty', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 30, y: 8 }; // closer than 2×jetty
      const path = router.route({
        start, end,
        sourceDirection: 'right',
        targetDirection: 'left',
        options: { jetty: 40 },
      }) as RoutedPath;

      expect(stubAlong(path, start, 'right')).toBeGreaterThanOrEqual(40);
      expect(stubAlong(path, end, 'left', true)).toBeGreaterThanOrEqual(40);
    });

    it('holds on the OBSTACLE-AVOIDANCE branch too', () => {
      const start = { x: 0, y: 50 };
      const end = { x: 400, y: 50 };
      const wall = { id: 'wall', x: 180, y: 0, width: 40, height: 100 };
      const path = router.route({
        start, end,
        sourceDirection: 'right',
        targetDirection: 'left',
        obstacles: [wall],
        options: { jetty: 35, avoidObstacles: true },
      }) as RoutedPath;

      expect(stubAlong(path, start, 'right')).toBeGreaterThanOrEqual(35);
      expect(stubAlong(path, end, 'left', true)).toBeGreaterThanOrEqual(35);
      // and every segment stays orthogonal after the joint re-orthogonalisation
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i];
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    });

    it('a stub pointing the WRONG WAY is corrected, not just lengthened', () => {
      // Target is to the LEFT of the source, but the source port faces RIGHT:
      // the route must still leave rightward for the jetty before doubling back.
      const start = { x: 200, y: 0 };
      const end = { x: 0, y: 120 };
      const path = router.route({
        start, end,
        sourceDirection: 'right',
        targetDirection: 'right',
        options: { jetty: 25 },
      }) as RoutedPath;

      expect(stubAlong(path, start, 'right')).toBeGreaterThanOrEqual(25);
      expect(stubAlong(path, end, 'right', true)).toBeGreaterThanOrEqual(25);
    });
  });

  describe('dynamic exit-side for floating anchors', () => {
    it('derives horizontal exits for a mostly-horizontal pair (and stubs them)', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 300, y: 40 };
      const path = router.route({
        start, end,
        options: { jetty: 30 }, // NO directions given
      }) as RoutedPath;

      // source exits right (toward the target), target enters from its left side
      expect(stubAlong(path, start, 'right')).toBeGreaterThanOrEqual(30);
      expect(stubAlong(path, end, 'left', true)).toBeGreaterThanOrEqual(30);
    });

    it('derives vertical exits for a mostly-vertical pair', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 40, y: 300 };
      const path = router.route({
        start, end,
        options: { jetty: 30 },
      }) as RoutedPath;

      expect(stubAlong(path, start, 'bottom')).toBeGreaterThanOrEqual(30);
      expect(stubAlong(path, end, 'top', true)).toBeGreaterThanOrEqual(30);
    });

    it('deriveExitSide: dominant axis wins, ties break horizontal (matching the midline fallback)', () => {
      expect(OrthogonalRouter.deriveExitSide({ x: 0, y: 0 }, { x: 10, y: 5 })).toBe('right');
      expect(OrthogonalRouter.deriveExitSide({ x: 0, y: 0 }, { x: -10, y: 5 })).toBe('left');
      expect(OrthogonalRouter.deriveExitSide({ x: 0, y: 0 }, { x: 5, y: 10 })).toBe('bottom');
      expect(OrthogonalRouter.deriveExitSide({ x: 0, y: 0 }, { x: 5, y: -10 })).toBe('top');
      expect(OrthogonalRouter.deriveExitSide({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe('right');
    });
  });

  describe('legacy byte-stability (jetty unset)', () => {
    it('directed short link: identical to the pre-card route', () => {
      const args = {
        start: { x: 0, y: 0 },
        end: { x: 30, y: 8 },
        sourceDirection: 'right' as const,
        targetDirection: 'left' as const,
      };
      const legacy = router.route({ ...args, options: {} }) as RoutedPath;
      // The pre-card behaviour is pinned structurally: the 20px gap clamp is
      // allowed to shrink the stub on a link this short. If this assertion ever
      // fails, the DEFAULT geometry changed — which this card promises not to do.
      const first = { x: legacy.points[1].x - legacy.points[0].x, y: legacy.points[1].y - legacy.points[0].y };
      expect(Math.abs(first.x)).toBeLessThanOrEqual(20);
    });

    it('undirected pair: still the stub-less midline route', () => {
      const legacy = router.route({
        start: { x: 0, y: 0 },
        end: { x: 300, y: 200 },
        options: {},
      }) as RoutedPath;
      // classic HVH through the midline: elbows at midX
      expect(legacy.points.length).toBe(4);
      expect(legacy.points[1].x).toBe(150);
      expect(legacy.points[2].x).toBe(150);
    });
  });
});
