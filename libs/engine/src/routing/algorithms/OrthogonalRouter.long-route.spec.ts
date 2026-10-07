// A* at DISTANCE — the frontier heap and the adaptive search grid.
//
// The contract these guard: a link does not stop avoiding obstacles just because
// it got long. It used to. The frontier was a Set scanned for its minimum on
// every iteration, and the grid was a fixed 10 units regardless of span, so a
// route beyond roughly 2,200 world units exhausted the 10,000-iteration budget,
// gave up, and let the caller fall back to a straight line — drawn straight
// through the very obstacles the route existed to avoid. It was slow on the way
// to being wrong: ~1,097ms of pathfinding across a 40-move drag, with dropped
// frames on a ten-node scene.
//
// So the assertions below are about the PICTURE (does the path enter an
// obstacle) rather than about the heap, because the heap is an implementation
// detail and "the link goes through the box" is the thing a user sees.

import { OrthogonalRouter } from './OrthogonalRouter';
import type { RouteRequest, Obstacle, RoutePoint } from '../types';

/** A vertical wall of boxes centred at `x`, with a gap too narrow to squeeze through. */
function wall(x: number, count = 8): Obstacle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w${i}`,
    x: x - 40,
    y: -300 + i * 80,
    width: 80,
    height: 60,
  }));
}

/** Does any segment of the path pass through the obstacle's body? */
function pathEnters(points: RoutePoint[], box: Obstacle): boolean {
  const STEPS = 200;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
        return true;
      }
    }
  }
  return false;
}

describe('OrthogonalRouter — A* at distance', () => {
  let router: OrthogonalRouter;

  beforeEach(() => {
    router = new OrthogonalRouter();
  });

  // The distances that mattered: 2,000 was the last one that worked before, and
  // everything from ~2,200 up silently degraded to a line through the wall.
  for (const span of [1200, 2400, 3200, 5000]) {
    it(`routes AROUND a wall ${span} units away, not through it`, () => {
      const obstacles = wall(span / 2);
      const request: RouteRequest = {
        start: { x: 0, y: 30 },
        end: { x: span, y: 30 },
        obstacles,
        options: { avoidObstacles: true },
      };

      const path = router.route(request);
      expect(path).toBeDefined();

      const breached = obstacles.filter((o) => pathEnters(path!.points, o)).map((o) => o.id);
      expect(breached).toEqual([]);
    });
  }

  it('stays fast as the span grows — the cost curve is not the one a linear frontier scan gives', () => {
    // Not a wall-clock threshold (those are flaky on shared CI), but a SHAPE
    // check: quadrupling the distance must not multiply the cost by an order of
    // magnitude. With the Set-scan frontier this ratio ran away; with a heap and
    // an adaptive grid it stays close to flat.
    const time = (span: number): number => {
      const obstacles = wall(span / 2);
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) {
        router.route({
          start: { x: 0, y: 30 },
          end: { x: span, y: 30 },
          obstacles,
          options: { avoidObstacles: true },
        });
      }
      return (performance.now() - t0) / 3;
    };

    const near = Math.max(time(800), 0.01);
    const far = time(3200);

    expect(far / near).toBeLessThan(10);
  });

  it('still routes around a short obstacle exactly as before — the fine grid is untouched below the coarsening threshold', () => {
    // Everything in an ordinary diagram is short enough that the adaptive grid
    // never engages, so this is the "did you change what was already working"
    // guard.
    const box: Obstacle = { id: 'block', x: 90, y: 40, width: 20, height: 20 };
    const path = router.route({
      start: { x: 0, y: 50 },
      end: { x: 200, y: 50 },
      obstacles: [box],
      options: { avoidObstacles: true, obstacleMargin: 5 },
    });

    expect(path).toBeDefined();
    expect(path!.points.length).toBeGreaterThan(2);
    expect(pathEnters(path!.points, box)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Descending clearance — tight layouts get a real route, not a shrug.
//
// The requested 20-unit margin seals a 20-unit gap from both sides, and the
// fixed 30-unit port offset used to land the A* start inside the neighbouring
// node's body. One attempt was made, it failed, and the "avoidance" route came
// back identical to the no-avoidance one: drawn straight through the neighbour.
// This is the four-nodes-in-a-row scene from the theme-bound demo, verbatim.
describe('OrthogonalRouter — descending clearance in tight layouts', () => {
  const ROW: Obstacle[] = [
    { id: 'critical', x: 60, y: 90, width: 170, height: 76 },
    { id: 'warning', x: 250, y: 90, width: 170, height: 76 },
    { id: 'success', x: 440, y: 90, width: 170, height: 76 },
    { id: 'info', x: 630, y: 90, width: 170, height: 76 },
    { id: 'sink', x: 340, y: 280, width: 200, height: 76 },
  ];

  it('threads the 20-unit corridor instead of routing through the neighbour', () => {
    const router = new OrthogonalRouter();
    // critical's right port → sink's left port: the neighbour (warning) starts
    // 20 units from the port.
    const path = router.route({
      start: { x: 230, y: 128 },
      end: { x: 340, y: 318 },
      sourceDirection: 'right',
      targetDirection: 'left',
      obstacles: ROW,
      options: { avoidObstacles: true, gridSize: 10 },
    });

    expect(path).toBeDefined();
    const breached = ROW.filter(
      (o) => o.id !== 'critical' && o.id !== 'sink' && pathEnters(path!.points, o)
    ).map((o) => o.id);
    expect(breached).toEqual([]);
  });

  it('a spacious scene still routes at the full requested clearance', () => {
    // Control: with room everywhere, the first attempt must succeed and the
    // route must not hug obstacles any tighter than it used to.
    const router = new OrthogonalRouter();
    const spread: Obstacle[] = [{ id: 'block', x: 400, y: 150, width: 80, height: 60 }];
    const path = router.route({
      start: { x: 0, y: 180 },
      end: { x: 900, y: 180 },
      obstacles: spread,
      options: { avoidObstacles: true, gridSize: 10 },
    });

    expect(path).toBeDefined();
    expect(pathEnters(path!.points, spread[0])).toBe(false);
    // Full clearance honoured: no point within 10 of the block's body.
    const near = path!.points.some(
      (p) => p.x > 390 && p.x < 490 && p.y > 140 && p.y < 220
    );
    expect(near).toBe(false);
  });
});
