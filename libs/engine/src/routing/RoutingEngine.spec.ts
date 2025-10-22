// RoutingEngine.spec.ts - TDD tests for main routing coordinator

import { RoutingEngine } from './RoutingEngine';
import type { RouteRequest, RoutedPath, Obstacle, IRouter } from './types';

describe('RoutingEngine (Phase 4.1)', () => {
  let routingEngine: RoutingEngine;

  beforeEach(() => {
    routingEngine = new RoutingEngine();
  });

  describe('Initialization', () => {
    it('should create a routing engine', () => {
      expect(routingEngine).toBeDefined();
    });

    it('should have default algorithm registered', () => {
      const algorithms = routingEngine.getAvailableAlgorithms();
      expect(algorithms).toContain('straight');
    });
  });

  describe('Algorithm Registration', () => {
    it('should register a custom router', () => {
      const customRouter: IRouter = {
        getName: () => 'custom',
        route: jest.fn(() => ({
          points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
          totalLength: 141.42,
          bendCount: 0,
        })),
      };

      routingEngine.registerRouter('custom', customRouter);
      const algorithms = routingEngine.getAvailableAlgorithms();
      expect(algorithms).toContain('custom');
    });

    it('should throw when registering router with duplicate name', () => {
      const router: IRouter = {
        getName: () => 'straight',
        route: jest.fn(),
      };

      expect(() => {
        routingEngine.registerRouter('straight', router);
      }).toThrow(/Router.*already registered/);
    });

    it('should unregister a router', () => {
      const customRouter: IRouter = {
        getName: () => 'custom',
        route: jest.fn(),
      };

      routingEngine.registerRouter('custom', customRouter);
      expect(routingEngine.getAvailableAlgorithms()).toContain('custom');

      const removed = routingEngine.unregisterRouter('custom');
      expect(removed).toBe(true);
      expect(routingEngine.getAvailableAlgorithms()).not.toContain('custom');
    });

    it('should return false when unregistering non-existent router', () => {
      const removed = routingEngine.unregisterRouter('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('Basic Routing', () => {
    it('should route with straight algorithm', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        options: { algorithm: 'straight' },
      };

      const path = routingEngine.route(request);
      expect(path).toBeDefined();
      expect(path?.points.length).toBeGreaterThanOrEqual(2);
      expect(path?.points[0]).toEqual({ x: 0, y: 0 });
      expect(path?.points[path.points.length - 1]).toEqual({ x: 100, y: 100 });
    });

    it('should use default algorithm when not specified', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      const path = routingEngine.route(request);
      expect(path).toBeDefined();
      expect(path?.points).toBeDefined();
    });

    it('should throw when algorithm not found', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        options: { algorithm: 'nonexistent' as any },
      };

      expect(() => routingEngine.route(request)).toThrow(/Router.*not found/);
    });

    it('should calculate total length correctly', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        options: { algorithm: 'straight' },
      };

      const path = routingEngine.route(request);
      expect(path?.totalLength).toBeCloseTo(100, 1);
    });
  });

  describe('Obstacle Handling', () => {
    it('should accept obstacles in route request', () => {
      const obstacles: Obstacle[] = [
        { id: 'node1', x: 40, y: 40, width: 20, height: 20 },
      ];

      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        obstacles,
        options: { algorithm: 'straight' },
      };

      const path = routingEngine.route(request);
      expect(path).toBeDefined();
    });

    it('should manage global obstacles', () => {
      const obstacle: Obstacle = {
        id: 'node1',
        x: 50,
        y: 50,
        width: 30,
        height: 30,
      };

      routingEngine.addObstacle(obstacle);
      expect(routingEngine.getObstacleCount()).toBe(1);

      routingEngine.removeObstacle('node1');
      expect(routingEngine.getObstacleCount()).toBe(0);
    });

    it('should use global obstacles in routing', () => {
      routingEngine.addObstacle({
        id: 'node1',
        x: 45,
        y: 45,
        width: 10,
        height: 10,
      });

      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        options: { algorithm: 'straight', avoidObstacles: true },
      };

      const path = routingEngine.route(request);
      expect(path).toBeDefined();
    });

    it('should clear all global obstacles', () => {
      routingEngine.addObstacle({ id: 'node1', x: 0, y: 0, width: 10, height: 10 });
      routingEngine.addObstacle({ id: 'node2', x: 10, y: 10, width: 10, height: 10 });
      expect(routingEngine.getObstacleCount()).toBe(2);

      routingEngine.clearObstacles();
      expect(routingEngine.getObstacleCount()).toBe(0);
    });

    it('should merge global and request obstacles', () => {
      // Add global obstacle
      routingEngine.addObstacle({
        id: 'global',
        x: 30,
        y: 30,
        width: 10,
        height: 10,
      });

      // Request with additional obstacle
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        obstacles: [{ id: 'local', x: 60, y: 60, width: 10, height: 10 }],
        options: { avoidObstacles: true },
      };

      const path = routingEngine.route(request);
      expect(path).toBeDefined();
    });
  });

  describe('Route Caching', () => {
    it('should cache route results', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      const path1 = routingEngine.route(request);
      const path2 = routingEngine.route(request);

      // Should return same cached result
      expect(path1).toBe(path2);
    });

    it('should invalidate cache when obstacles change', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      routingEngine.route(request);

      // Add obstacle - should invalidate cache
      routingEngine.addObstacle({
        id: 'new',
        x: 50,
        y: 50,
        width: 10,
        height: 10,
      });

      // This should recalculate, not use cache
      const path = routingEngine.route(request);
      expect(path).toBeDefined();
    });

    it('should clear route cache', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      routingEngine.route(request);
      routingEngine.clearCache();

      // Should recalculate after cache clear
      const path = routingEngine.route(request);
      expect(path).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should set default algorithm', () => {
      routingEngine.setDefaultAlgorithm('straight');
      const algo = routingEngine.getDefaultAlgorithm();
      expect(algo).toBe('straight');
    });

    it('should throw when setting invalid default algorithm', () => {
      expect(() => {
        routingEngine.setDefaultAlgorithm('nonexistent' as any);
      }).toThrow(/Router.*not found/);
    });

    it('should get routing engine stats', () => {
      routingEngine.addObstacle({ id: 'n1', x: 0, y: 0, width: 10, height: 10 });

      const customRouter: IRouter = {
        getName: () => 'custom',
        route: jest.fn(),
      };
      routingEngine.registerRouter('custom', customRouter);

      const stats = routingEngine.getStats();
      expect(stats.obstacleCount).toBe(1);
      expect(stats.routerCount).toBeGreaterThan(1);
      expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance', () => {
    it('should route efficiently with many obstacles', () => {
      // Add 100 obstacles
      for (let i = 0; i < 100; i++) {
        routingEngine.addObstacle({
          id: `node${i}`,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          width: 20,
          height: 20,
        });
      }

      const start = performance.now();

      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 1000 },
        options: { algorithm: 'straight' },
      };

      routingEngine.route(request);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // < 100ms with 100 obstacles
    });

    it('should benefit from caching on repeated routes', () => {
      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 500, y: 500 },
      };

      // First call - no cache, does actual routing
      routingEngine.route(request);

      // Second call - should be cached (just lookup, no routing)
      const start = performance.now();
      const cachedResult = routingEngine.route(request);
      const duration = performance.now() - start;

      // Cached call should be very fast (<1ms) since it's just a Map lookup
      expect(cachedResult).not.toBeNull();
      expect(duration).toBeLessThan(1); // LRU cache lookup is O(1)
    });
  });

  describe('Error Handling', () => {
    it('should return null when route cannot be found', () => {
      const impossibleRouter: IRouter = {
        getName: () => 'impossible',
        route: () => null, // Always fails
      };

      routingEngine.registerRouter('impossible', impossibleRouter);

      const request: RouteRequest = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        options: { algorithm: 'impossible' as any },
      };

      const path = routingEngine.route(request);
      expect(path).toBeNull();
    });

    it('should handle invalid coordinates gracefully', () => {
      const request: RouteRequest = {
        start: { x: NaN, y: NaN },
        end: { x: 100, y: 100 },
      };

      expect(() => routingEngine.route(request)).toThrow('Invalid coordinates');
    });

    it('should handle same start and end points', () => {
      const request: RouteRequest = {
        start: { x: 100, y: 100 },
        end: { x: 100, y: 100 },
      };

      const path = routingEngine.route(request);
      expect(path?.points.length).toBe(1);
      expect(path?.totalLength).toBe(0);
    });
  });
});
