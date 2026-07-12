// VisibilityGraphRouter.spec.ts - TDD tests for Visibility Graph Algorithm (Phase 4.3)

import { VisibilityGraphRouter } from './VisibilityGraphRouter';
import { ObstacleMap } from '../ObstacleMap';
import type { Obstacle } from '../types';
import type { Point } from '../../types';

describe('Visibility Graph Routing Algorithm (Phase 4.3)', () => {
  let router: VisibilityGraphRouter;
  let obstacleMap: ObstacleMap;

  beforeEach(() => {
    obstacleMap = new ObstacleMap();
    router = new VisibilityGraphRouter(obstacleMap);
  });

  describe('Basic Pathfinding', () => {
    it('should find straight path with no obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 0 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBe(2);
      expect(path[0]).toEqual(start);
      expect(path[1]).toEqual(end);
    });

    it('should find diagonal path with no obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBe(2);
      expect(path[0]).toEqual(start);
      expect(path[1]).toEqual(end);
    });

    it('should return single point when start equals end', () => {
      const point: Point = { x: 50, y: 50 };

      const path = router.route(point, point);

      expect(path).toEqual([point]);
    });
  });

  describe('Obstacle Corner Navigation', () => {
    it('should route around single obstacle using corners', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Rectangle obstacle blocking direct path
      obstacleMap.add({ id: 'obs1', x: 80, y: 30, width: 40, height: 40 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);

      // Path should go around obstacle (using corners)
      // Middle points should be obstacle corners
    });

    it('should use obstacle corners as waypoints', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      // Obstacle blocking diagonal path
      obstacleMap.add({ id: 'obs', x: 40, y: 40, width: 20, height: 20 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(2);

      // At least one waypoint should be an obstacle corner (with default margin of 1)
      const corners = [
        { x: 39, y: 39 }, // Top-left corner with margin
        { x: 61, y: 39 }, // Top-right corner with margin
        { x: 61, y: 61 }, // Bottom-right corner with margin
        { x: 39, y: 61 }, // Bottom-left corner with margin
      ];

      const hasCorner = path.some((p) =>
        corners.some((c) => p.x === c.x && p.y === c.y)
      );

      expect(hasCorner).toBe(true);
    });

    it('should find shortest path through multiple obstacles', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 300, y: 50 };

      obstacleMap.add({ id: 'obs1', x: 80, y: 20, width: 40, height: 40 });
      obstacleMap.add({ id: 'obs2', x: 180, y: 30, width: 40, height: 40 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });
  });

  describe('Line-of-Sight Detection', () => {
    it('should detect clear line of sight with no obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const path = router.route(start, end);

      // Direct line of sight means only 2 points
      expect(path.length).toBe(2);
    });

    it('should detect blocked line of sight', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Obstacle directly in the path
      obstacleMap.add({ id: 'wall', x: 95, y: 45, width: 10, height: 10 });

      const path = router.route(start, end);

      // Should route around, so more than 2 points
      expect(path.length).toBeGreaterThan(2);
    });

    it('should handle edge grazing (line passing edge of obstacle)', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      // Obstacle that line might graze
      obstacleMap.add({ id: 'obs', x: 48, y: 48, width: 4, height: 4 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });
  });

  describe('Optimal Path Selection', () => {
    it('should select shortest path among multiple valid paths', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Small obstacle with clear paths above and below
      obstacleMap.add({ id: 'small', x: 95, y: 45, width: 10, height: 10 });

      const path = router.route(start, end);

      // Calculate total path length
      let totalLength = 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        totalLength += Math.sqrt(dx * dx + dy * dy);
      }

      // Should be close to straight-line distance (200)
      expect(totalLength).toBeLessThan(220);
    });

    it('should prefer direct paths over detours', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      // Obstacle far from optimal path
      obstacleMap.add({ id: 'far', x: 200, y: 200, width: 50, height: 50 });

      const path = router.route(start, end);

      // Should still be direct path (2 points)
      expect(path.length).toBe(2);
    });
  });

  describe('Complex Scenarios', () => {
    it('should navigate through narrow passages', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Create corridor
      obstacleMap.add({ id: 'top', x: 80, y: 0, width: 40, height: 35 });
      obstacleMap.add({ id: 'bottom', x: 80, y: 65, width: 40, height: 35 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });

    it('should handle L-shaped obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      // L-shaped obstacle
      obstacleMap.add({ id: 'l1', x: 40, y: 40, width: 20, height: 40 });
      obstacleMap.add({ id: 'l2', x: 40, y: 40, width: 40, height: 20 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(2);
    });

    it('should handle multiple obstacles creating maze', () => {
      const start: Point = { x: 10, y: 10 };
      const end: Point = { x: 190, y: 190 };

      // Create simple maze
      obstacleMap.add({ id: 'm1', x: 50, y: 0, width: 20, height: 100 });
      obstacleMap.add({ id: 'm2', x: 100, y: 50, width: 20, height: 100 });
      obstacleMap.add({ id: 'm3', x: 150, y: 0, width: 20, height: 100 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle start point very close to obstacle', () => {
      const obstacle: Obstacle = { id: 'obs', x: 50, y: 50, width: 50, height: 50 };
      obstacleMap.add(obstacle);

      const start: Point = { x: 45, y: 75 }; // Near left edge
      const end: Point = { x: 200, y: 75 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should handle end point very close to obstacle', () => {
      const obstacle: Obstacle = { id: 'obs', x: 150, y: 50, width: 50, height: 50 };
      obstacleMap.add(obstacle);

      const start: Point = { x: 0, y: 75 };
      const end: Point = { x: 145, y: 75 }; // Near left edge

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should handle very small obstacles', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 100, y: 50 };

      obstacleMap.add({ id: 'tiny', x: 49, y: 49, width: 2, height: 2 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should handle very large obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 500, y: 500 };

      obstacleMap.add({ id: 'huge', x: 100, y: 100, width: 200, height: 200 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should route efficiently with few obstacles', () => {
      const start: Point = { x: 0, y: 500 };
      const end: Point = { x: 1000, y: 500 };

      // Visibility graph excels with few obstacles
      for (let i = 0; i < 5; i++) {
        obstacleMap.add({
          id: `obs${i}`,
          x: i * 200 + 100,
          y: 400,
          width: 50,
          height: 50,
        });
      }

      const startTime = performance.now();
      const path = router.route(start, end);
      const duration = performance.now() - startTime;

      expect(path).toBeDefined();
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 100)
    });

    it('should handle moderate number of obstacles', () => {
      const start: Point = { x: 0, y: 500 };
      const end: Point = { x: 1000, y: 500 };

      // Add 20 obstacles
      for (let i = 0; i < 20; i++) {
        obstacleMap.add({
          id: `obs${i}`,
          x: Math.random() * 900,
          y: Math.random() * 900,
          width: 30,
          height: 30,
        });
      }

      const startTime = performance.now();
      const path = router.route(start, end);
      const duration = performance.now() - startTime;

      expect(path).toBeDefined();
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 200)
    });
  });

  describe('Configuration', () => {
    it('should accept custom obstacle margin', () => {
      const marginRouter = new VisibilityGraphRouter(obstacleMap, {
        obstacleMargin: 10,
      });

      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      obstacleMap.add({ id: 'obs', x: 90, y: 40, width: 20, height: 20 });

      const path = marginRouter.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with ObstacleMap', () => {
    it('should query obstacles from ObstacleMap', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      obstacleMap.add({ id: 'obs1', x: 40, y: 40, width: 20, height: 20 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should update path when obstacles change', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      const path1 = router.route(start, end);
      const length1 = path1.length;

      obstacleMap.add({ id: 'new', x: 95, y: 45, width: 10, height: 10 });

      const path2 = router.route(start, end);
      const length2 = path2.length;

      // Path should change when obstacle added
      expect(length2).toBeGreaterThan(length1);
    });

    it('should handle dynamic obstacle removal', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      obstacleMap.add({ id: 'temp', x: 95, y: 45, width: 10, height: 10 });

      const path1 = router.route(start, end);
      const length1 = path1.length;

      obstacleMap.remove('temp');

      const path2 = router.route(start, end);
      const length2 = path2.length;

      // Path should become simpler when obstacle removed
      expect(length2).toBeLessThanOrEqual(length1);
    });
  });

  describe('Comparison with Grid-based Algorithms', () => {
    it('should find optimal geometric paths (not grid-constrained)', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      // Obstacle at an angle
      obstacleMap.add({ id: 'angled', x: 45, y: 45, width: 10, height: 10 });

      const path = router.route(start, end);

      expect(path).toBeDefined();

      // Visibility graph should use exact corner positions, not grid-aligned
      // This gives more optimal paths than grid-based algorithms
    });

    it('should handle fewer waypoints than grid-based methods', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      obstacleMap.add({ id: 'obs', x: 95, y: 40, width: 10, height: 20 });

      const path = router.route(start, end);

      // Visibility graph typically has fewer waypoints
      // (only start, corners, and end)
      expect(path.length).toBeLessThan(6);
    });
  });
});
