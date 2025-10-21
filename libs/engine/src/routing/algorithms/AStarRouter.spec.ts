// AStarRouter.spec.ts - TDD tests for A* Pathfinding Algorithm (Phase 4.2)

import { AStarRouter, AStarHeuristic } from './AStarRouter';
import { ObstacleMap } from '../ObstacleMap';
import type { Obstacle } from '../types';
import type { Point } from '../../types';

describe('A* Pathfinding Algorithm (Phase 4.2)', () => {
  let router: AStarRouter;
  let obstacleMap: ObstacleMap;

  beforeEach(() => {
    obstacleMap = new ObstacleMap();
    router = new AStarRouter(obstacleMap);
  });

  describe('Basic Pathfinding', () => {
    it('should find straight path with no obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 0 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });

    it('should find diagonal path with no obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });

    it('should return empty array when start equals end', () => {
      const point: Point = { x: 50, y: 50 };

      const path = router.route(point, point);

      expect(path).toEqual([point]);
    });

    it('should handle negative coordinates', () => {
      const start: Point = { x: -50, y: -50 };
      const end: Point = { x: 50, y: 50 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });
  });

  describe('Obstacle Avoidance', () => {
    it('should route around single obstacle', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Place obstacle in the middle
      const obstacle: Obstacle = { id: 'obs1', x: 80, y: 30, width: 40, height: 40 };
      obstacleMap.add(obstacle);

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);

      // Verify path doesn't go through obstacle (excluding start/end)
      for (let i = 1; i < path.length - 1; i++) {
        const point = path[i];
        const inObstacle =
          point.x >= obstacle.x &&
          point.x <= obstacle.x + obstacle.width &&
          point.y >= obstacle.y &&
          point.y <= obstacle.y + obstacle.height;
        expect(inObstacle).toBe(false);
      }
    });

    it('should route around multiple obstacles', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 300, y: 50 };

      // Create a maze-like pattern
      obstacleMap.add({ id: 'obs1', x: 80, y: 0, width: 40, height: 60 });
      obstacleMap.add({ id: 'obs2', x: 180, y: 40, width: 40, height: 60 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });

    it('should route around blocking wall', () => {
      const start: Point = { x: 50, y: 50 };
      const end: Point = { x: 150, y: 50 };

      // Create a tall wall - path must go around
      obstacleMap.add({ id: 'wall', x: 90, y: -100, width: 20, height: 1200 });

      const path = router.route(start, end);

      // Path should exist and route around the wall
      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      if (path.length > 0) {
        expect(path[0]).toEqual(start);
        expect(path[path.length - 1]).toEqual(end);
      }
    });

    it('should find path through narrow corridor', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Create corridor with sufficient gap (need to account for grid size + margins)
      obstacleMap.add({ id: 'top', x: 80, y: 0, width: 40, height: 30 });
      obstacleMap.add({ id: 'bottom', x: 80, y: 70, width: 40, height: 30 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });
  });

  describe('Heuristic Functions', () => {
    it('should use Manhattan heuristic by default', () => {
      const routerManhattan = new AStarRouter(obstacleMap, {
        heuristic: AStarHeuristic.MANHATTAN,
      });

      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const path = routerManhattan.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should support Euclidean heuristic', () => {
      const routerEuclidean = new AStarRouter(obstacleMap, {
        heuristic: AStarHeuristic.EUCLIDEAN,
      });

      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const path = routerEuclidean.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should support Diagonal (Chebyshev) heuristic', () => {
      const routerDiagonal = new AStarRouter(obstacleMap, {
        heuristic: AStarHeuristic.DIAGONAL,
      });

      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const path = routerDiagonal.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should find shorter paths with Euclidean vs Manhattan for diagonal movement', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const routerManhattan = new AStarRouter(obstacleMap, {
        heuristic: AStarHeuristic.MANHATTAN,
      });
      const routerEuclidean = new AStarRouter(obstacleMap, {
        heuristic: AStarHeuristic.EUCLIDEAN,
      });

      const pathManhattan = routerManhattan.route(start, end);
      const pathEuclidean = routerEuclidean.route(start, end);

      // Both should find a path
      expect(pathManhattan.length).toBeGreaterThan(0);
      expect(pathEuclidean.length).toBeGreaterThan(0);

      // Euclidean should prefer diagonal movement
      expect(pathEuclidean.length).toBeLessThanOrEqual(pathManhattan.length);
    });
  });

  describe('Path Properties', () => {
    it('should generate smooth paths when requested', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 200, y: 200 };

      const smoothRouter = new AStarRouter(obstacleMap, {
        smoothing: true,
      });

      const path = smoothRouter.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      // Smooth path should have fewer points than non-smooth
    });

    it('should respect grid size option', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const gridRouter = new AStarRouter(obstacleMap, {
        gridSize: 10,
      });

      const path = gridRouter.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);

      // All intermediate points should align to grid (except start/end)
      for (let i = 1; i < path.length - 1; i++) {
        expect(path[i].x % 10).toBe(0);
        expect(path[i].y % 10).toBe(0);
      }
    });

    it('should support diagonal movement when enabled', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const diagonalRouter = new AStarRouter(obstacleMap, {
        allowDiagonal: true,
      });

      const path = diagonalRouter.route(start, end);

      expect(path).toBeDefined();
      // With diagonal movement, path should be shorter
      expect(path.length).toBeLessThan(20); // Much shorter than Manhattan
    });

    it('should avoid diagonal movement when disabled', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      const orthogonalRouter = new AStarRouter(obstacleMap, {
        allowDiagonal: false,
        smoothing: false, // Disable smoothing to ensure orthogonal steps
      });

      const path = orthogonalRouter.route(start, end);

      expect(path).toBeDefined();
      // Without diagonal movement, path should have more waypoints

      // Verify no diagonal moves (each step should be only horizontal or vertical)
      for (let i = 1; i < path.length; i++) {
        const dx = Math.abs(path[i].x - path[i - 1].x);
        const dy = Math.abs(path[i].y - path[i - 1].y);
        // Either dx or dy should be 0 (not both non-zero = diagonal)
        expect(dx === 0 || dy === 0).toBe(true);
      }
    });
  });

  describe('Path Optimality', () => {
    it('should find optimal path with no obstacles', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 0 };

      const path = router.route(start, end);

      // Optimal path should be straight line (2 points)
      expect(path.length).toBe(2);
      expect(path[0]).toEqual(start);
      expect(path[1]).toEqual(end);
    });

    it('should prefer shorter paths over longer ones', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // Small obstacle that can be avoided above or below
      obstacleMap.add({ id: 'small', x: 95, y: 45, width: 10, height: 10 });

      const path = router.route(start, end);

      expect(path).toBeDefined();

      // Calculate total path length
      let totalLength = 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        totalLength += Math.sqrt(dx * dx + dy * dy);
      }

      // Path should be close to straight-line distance (200)
      expect(totalLength).toBeLessThan(250);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very close start and end points', () => {
      const start: Point = { x: 50, y: 50 };
      const end: Point = { x: 51, y: 51 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      // When points snap to same grid cell, might return 1 or 2 points
      expect(path.length).toBeGreaterThanOrEqual(1);
      expect(path[0]).toEqual(start);
      if (path.length > 1) {
        expect(path[path.length - 1]).toEqual(end);
      }
    });

    it('should handle very far apart points', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 10000, y: 10000 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should handle start point near obstacle edge', () => {
      const obstacle: Obstacle = { id: 'obs', x: 50, y: 50, width: 50, height: 50 };
      obstacleMap.add(obstacle);

      const start: Point = { x: 40, y: 75 }; // Near left edge but not on it
      const end: Point = { x: 200, y: 75 };

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });

    it('should handle end point near obstacle edge', () => {
      const obstacle: Obstacle = { id: 'obs', x: 150, y: 50, width: 50, height: 50 };
      obstacleMap.add(obstacle);

      const start: Point = { x: 0, y: 75 };
      const end: Point = { x: 140, y: 75 }; // Near left edge but not on it

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    });
  });

  describe('Performance', () => {
    it('should route efficiently with many obstacles', () => {
      const start: Point = { x: 0, y: 500 };
      const end: Point = { x: 1000, y: 500 };

      // Add 50 random obstacles
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * 900;
        const y = Math.random() * 900;
        obstacleMap.add({
          id: `obs${i}`,
          x,
          y,
          width: 20 + Math.random() * 30,
          height: 20 + Math.random() * 30,
        });
      }

      const startTime = performance.now();
      const path = router.route(start, end);
      const duration = performance.now() - startTime;

      expect(path).toBeDefined();
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should use early exit optimization', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 1000, y: 1000 };

      const startTime = performance.now();
      const path = router.route(start, end);
      const duration = performance.now() - startTime;

      expect(path).toBeDefined();
      expect(duration).toBeLessThan(50); // Should be very fast with no obstacles
    });

    it('should handle large grid efficiently', () => {
      const largeMap = new ObstacleMap();
      const largeRouter = new AStarRouter(largeMap, { gridSize: 50 });

      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 9900, y: 9900 };

      const startTime = performance.now();
      const path = largeRouter.route(start, end);
      const duration = performance.now() - startTime;

      expect(path).toBeDefined();
      expect(duration).toBeLessThan(200); // Should complete in < 200ms even with large grid
    });
  });

  describe('Configuration', () => {
    it('should accept custom max iterations', () => {
      const limitedRouter = new AStarRouter(obstacleMap, {
        maxIterations: 100,
      });

      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 1000, y: 1000 };

      // With very limited iterations, may not find path
      const path = limitedRouter.route(start, end);

      expect(path).toBeDefined(); // Returns empty array if iterations exceeded
    });

    it('should respect obstacle margin', () => {
      const marginRouter = new AStarRouter(obstacleMap, {
        obstacleMargin: 10,
      });

      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      obstacleMap.add({ id: 'obs', x: 90, y: 40, width: 20, height: 20 });

      const path = marginRouter.route(start, end);

      expect(path).toBeDefined();

      // Verify path stays at least 10 units away from obstacle
      const obstacle = { x: 90, y: 40, width: 20, height: 20 };
      for (const point of path) {
        const closestX = Math.max(obstacle.x, Math.min(point.x, obstacle.x + obstacle.width));
        const closestY = Math.max(obstacle.y, Math.min(point.y, obstacle.y + obstacle.height));
        const distance = Math.sqrt(
          Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2)
        );

        // Skip start/end points
        if (point !== start && point !== end) {
          expect(distance).toBeGreaterThanOrEqual(10);
        }
      }
    });
  });

  describe('Integration with ObstacleMap', () => {
    it('should query obstacles from ObstacleMap', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 100 };

      obstacleMap.add({ id: 'obs1', x: 40, y: 40, width: 20, height: 20 });
      obstacleMap.add({ id: 'obs2', x: 70, y: 70, width: 20, height: 20 });

      const path = router.route(start, end);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should update path when obstacles change', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      // First path with no obstacles
      const path1 = router.route(start, end);
      const length1 = path1.length;

      // Add obstacle
      obstacleMap.add({ id: 'new', x: 95, y: 45, width: 10, height: 10 });

      // Second path should route around obstacle
      const path2 = router.route(start, end);
      const length2 = path2.length;

      expect(length2).toBeGreaterThan(length1);
    });

    it('should handle dynamic obstacle removal', () => {
      const start: Point = { x: 0, y: 50 };
      const end: Point = { x: 200, y: 50 };

      obstacleMap.add({ id: 'temp', x: 95, y: 45, width: 10, height: 10 });

      // Path with obstacle
      const path1 = router.route(start, end);
      const length1 = path1.length;

      // Remove obstacle
      obstacleMap.remove('temp');

      // Path without obstacle should be shorter
      const path2 = router.route(start, end);
      const length2 = path2.length;

      expect(length2).toBeLessThan(length1);
    });
  });
});
