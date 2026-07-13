// Wave 5 (Edge routing) — Card 3: Manhattan router parity.
//
// The knobs under test map onto the existing RoutingOptions vocabulary:
// step=gridSize, padding=obstacleMargin, maximumLoops=maxIterations, turn
// penalty=costs.bends. Perpendicular ends hold BY CONSTRUCTION (the search
// starts from a jetty stub with a fixed initial direction and U-turns are
// illegal moves).

import { ManhattanRouter } from './ManhattanRouter';
import type { RoutedPath } from '../types';
import type { Point } from '../../types';

function isOrthogonal(path: RoutedPath): boolean {
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

function crossesRect(path: RoutedPath, r: { x: number; y: number; width: number; height: number }): boolean {
  // segment-vs-rect for orthogonal segments (strict interior)
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    if (maxX <= r.x || minX >= r.x + r.width || maxY <= r.y || minY >= r.y + r.height) continue;
    return true;
  }
  return false;
}

describe('ManhattanRouter (Wave 5, Card 3)', () => {
  let router: ManhattanRouter;

  beforeEach(() => {
    router = new ManhattanRouter();
  });

  it('routes orthogonally around an obstacle, clearing it by the padding', () => {
    const wall = { id: 'wall', x: 180, y: 0, width: 40, height: 200 };
    const path = router.route({
      start: { x: 0, y: 100 },
      end: { x: 400, y: 100 },
      sourceDirection: 'right',
      targetDirection: 'left',
      obstacles: [wall],
      options: { gridSize: 20, obstacleMargin: 10 },
    }) as RoutedPath;

    expect(path).not.toBeNull();
    expect(isOrthogonal(path)).toBe(true);
    expect(crossesRect(path, wall)).toBe(false);
    // padding respected: no interior point sits inside the inflated band either
    const inflated = { x: wall.x - 10, y: wall.y - 10, width: wall.width + 20, height: wall.height + 20 };
    for (const p of path.points.slice(2, -2)) {
      const inside =
        p.x > inflated.x && p.x < inflated.x + inflated.width &&
        p.y > inflated.y && p.y < inflated.y + inflated.height;
      expect(inside).toBe(false);
    }
  });

  it('leaves and enters PERPENDICULAR to the port sides — by construction, not rectification', () => {
    const path = router.route({
      start: { x: 5, y: 7 }, // deliberately off-grid
      end: { x: 333, y: 219 },
      sourceDirection: 'bottom',
      targetDirection: 'top',
      options: { gridSize: 20, jetty: 30 },
    }) as RoutedPath;

    expect(isOrthogonal(path)).toBe(true);
    const first = { x: path.points[1].x - path.points[0].x, y: path.points[1].y - path.points[0].y };
    expect(first.x).toBe(0);
    expect(first.y).toBeGreaterThanOrEqual(30); // exits 'bottom'
    const n = path.points.length;
    const last = { x: path.points[n - 1].x - path.points[n - 2].x, y: path.points[n - 1].y - path.points[n - 2].y };
    expect(last.x).toBe(0);
    expect(last.y).toBeGreaterThanOrEqual(30); // enters from 'top' side: final move is downward
  });

  it('never U-turns: no out-and-back retrace survives in any produced route', () => {
    // A tight pocket that tempts a naive search into backtracking.
    const path = router.route({
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      sourceDirection: 'right',
      targetDirection: 'left',
      obstacles: [
        { id: 'a', x: 60, y: -40, width: 30, height: 80 },
        { id: 'b', x: 120, y: -10, width: 30, height: 80 },
      ],
      options: { gridSize: 10, obstacleMargin: 5 },
    }) as RoutedPath;

    expect(path).not.toBeNull();
    for (let i = 2; i < path.points.length; i++) {
      const a = path.points[i - 2], b = path.points[i - 1], c = path.points[i];
      const ab = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
      const bc = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
      const reversed = ab.x === -bc.x && ab.y === -bc.y && (ab.x !== 0 || ab.y !== 0);
      expect(reversed).toBe(false);
    }
  });

  it('the turn penalty biases toward fewer bends', () => {
    const route = (bends: number) =>
      router.route({
        start: { x: 0, y: 0 },
        end: { x: 200, y: 100 },
        sourceDirection: 'right',
        targetDirection: 'left',
        options: { gridSize: 20, costs: { bends } },
      }) as RoutedPath;

    const cheapTurns = route(0);
    const dearTurns = route(500);
    expect(dearTurns.bendCount).toBeLessThanOrEqual(cheapTurns.bendCount);
    // and with punitive turn cost the route reaches the minimum possible for
    // opposite ports with a lateral offset: 2 bends (Z shape)
    expect(dearTurns.bendCount).toBeLessThanOrEqual(2 + 2); // + the two stub joints
  });

  it('maximumLoops: an impossible/exhausted search returns null instead of spinning', () => {
    // Fully box in the target so no route exists; a tiny loop cap must bail.
    const path = router.route({
      start: { x: 0, y: 0 },
      end: { x: 400, y: 0 },
      sourceDirection: 'right',
      targetDirection: 'left',
      obstacles: [{ id: 'box', x: 300, y: -100, width: 200, height: 200 }],
      options: { gridSize: 20, maxIterations: 50 },
    });
    expect(path).toBeNull();
  });

  it('is deterministic: identical requests produce byte-identical routes', () => {
    const req = {
      start: { x: 0, y: 0 },
      end: { x: 260, y: 140 },
      sourceDirection: 'right' as const,
      targetDirection: 'left' as const,
      obstacles: [{ id: 'o', x: 100, y: 20, width: 60, height: 60 }],
      options: { gridSize: 20, obstacleMargin: 10 },
    };
    const a = router.route(req) as RoutedPath;
    const b = router.route(req) as RoutedPath;
    expect(JSON.stringify(a.points)).toBe(JSON.stringify(b.points));
  });

  it('floating anchors derive their sides from geometry (Card 1 semantics carry over)', () => {
    const path = router.route({
      start: { x: 0, y: 0 },
      end: { x: 300, y: 30 },
      options: { gridSize: 20 },
    }) as RoutedPath;
    const first = { x: path.points[1].x - path.points[0].x, y: path.points[1].y - path.points[0].y };
    expect(first.y).toBe(0);
    expect(first.x).toBeGreaterThan(0); // exits toward the target
  });
});
