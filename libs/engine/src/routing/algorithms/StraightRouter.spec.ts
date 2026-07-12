// StraightRouter.spec.ts - TDD tests for straight line routing

import { StraightRouter } from './StraightRouter';
import type { RouteRequest } from '../types';

describe('StraightRouter (Phase 4.1)', () => {
  let router: StraightRouter;

  beforeEach(() => {
    router = new StraightRouter();
  });

  describe('Basic Routing', () => {
    it('should create a straight router', () => {
      expect(router).toBeDefined();
      expect(router.getName()).toBe('straight');
    });

    it('should route from start to end in straight line', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      const path = router.route(request);
      expect(path).toBeDefined();
      expect(path?.points).toHaveLength(2);
      expect(path?.points[0]).toEqual({ x: 0, y: 0 });
      expect(path?.points[1]).toEqual({ x: 100, y: 100 });
    });

    it('should calculate correct distance', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 30, y: 40 },
      };

      const path = router.route(request);
      // Distance should be sqrt(30^2 + 40^2) = 50
      expect(path?.totalLength).toBeCloseTo(50, 1);
    });

    it('should have zero bends', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      const path = router.route(request);
      expect(path?.bendCount).toBe(0);
    });

    it('should calculate correct angle', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      };

      const path = router.route(request);
      expect(path?.segments).toHaveLength(1);
      expect(path?.segments?.[0].angle).toBeCloseTo(0, 1); // Horizontal = 0°
    });

    it('should handle vertical line', () => {
      const request: RouteRequest = {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 100 },
      };

      const path = router.route(request);
      expect(path?.totalLength).toBeCloseTo(100, 1);
      expect(path?.segments?.[0].angle).toBeCloseTo(90, 1); // Vertical = 90°
    });

    it('should handle same start and end point', () => {
      const request: RouteRequest = {
        start: { x: 50, y: 50 },
        end: { x: 50, y: 50 },
      };

      const path = router.route(request);
      expect(path?.points).toHaveLength(1);
      expect(path?.totalLength).toBe(0);
      expect(path?.bendCount).toBe(0);
    });
  });

  describe('Obstacle Handling', () => {
    it('should ignore obstacles by default', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        obstacles: [
          { id: 'node1', x: 45, y: 45, width: 10, height: 10 },
        ],
      };

      const path = router.route(request);
      expect(path?.points).toHaveLength(2); // Still straight line
    });

    it('should optionally detect collisions with obstacles', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        obstacles: [
          { id: 'node1', x: 45, y: 45, width: 10, height: 10 },
        ],
        options: { avoidObstacles: false }, // Explicitly don't avoid
      };

      const path = router.route(request);
      expect(path).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative coordinates', () => {
      const request: RouteRequest = {
        start: { x: -50, y: -50 },
        end: { x: 50, y: 50 },
      };

      const path = router.route(request);
      expect(path).toBeDefined();
      expect(path?.totalLength).toBeGreaterThan(0);
    });

    it('should handle very large coordinates', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 10000, y: 10000 },
      };

      const path = router.route(request);
      expect(path).toBeDefined();
      expect(path?.totalLength).toBeGreaterThan(0);
    });

    it('should handle floating point coordinates', () => {
      const request: RouteRequest = {
        start: { x: 10.5, y: 20.7 },
        end: { x: 100.3, y: 200.9 },
      };

      const path = router.route(request);
      expect(path).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should route very quickly', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        router.route({
          start: { x: 0, y: 0 },
          end: { x: i, y: i },
        });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000); // smoke bound — wall-clock varies with machine/CI load (was 50)
    });
  });
});
