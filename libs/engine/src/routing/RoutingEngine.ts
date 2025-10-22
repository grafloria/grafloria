// RoutingEngine - Main routing coordinator

import type {
  IRouter,
  RouteRequest,
  RoutedPath,
  Obstacle,
  RoutingAlgorithm,
} from './types';
import { ObstacleMap } from './ObstacleMap';
import { StraightRouter } from './algorithms/StraightRouter';
import { OrthogonalRouter } from './algorithms/OrthogonalRouter';
import { LRUCache } from '../performance/LRUCache'; // Phase 5.3

/**
 * RoutingEngine coordinates routing operations and manages obstacles
 */
export class RoutingEngine {
  private routers: Map<string, IRouter> = new Map();
  private obstacleMap: ObstacleMap = new ObstacleMap();
  private globalObstacles: Obstacle[] = []; // Simple array to avoid huge spatial queries
  private routeCache: LRUCache<string, RoutedPath | null>; // Phase 5.3: LRU cache prevents unbounded growth
  private defaultAlgorithm: RoutingAlgorithm = 'straight';

  constructor() {
    // Phase 5.3: Initialize LRU cache with capacity of 1000 routes
    // This prevents unbounded memory growth while maintaining good hit rate
    this.routeCache = new LRUCache<string, RoutedPath | null>(1000);

    // Register built-in routers
    this.registerRouter('straight', new StraightRouter());
    this.registerRouter('orthogonal', new OrthogonalRouter());
  }

  /**
   * Register a custom router
   */
  registerRouter(name: string, router: IRouter): void {
    if (this.routers.has(name)) {
      throw new Error(`Router '${name}' already registered`);
    }
    this.routers.set(name, router);
  }

  /**
   * Unregister a router
   */
  unregisterRouter(name: string): boolean {
    return this.routers.delete(name);
  }

  /**
   * Get list of available routing algorithms
   */
  getAvailableAlgorithms(): string[] {
    return Array.from(this.routers.keys());
  }

  /**
   * Set default routing algorithm
   */
  setDefaultAlgorithm(algorithm: RoutingAlgorithm): void {
    if (!this.routers.has(algorithm)) {
      throw new Error(`Router '${algorithm}' not found`);
    }
    this.defaultAlgorithm = algorithm;
  }

  /**
   * Get default algorithm
   */
  getDefaultAlgorithm(): RoutingAlgorithm {
    return this.defaultAlgorithm;
  }

  /**
   * Add a global obstacle
   */
  addObstacle(obstacle: Obstacle): void {
    this.obstacleMap.add(obstacle);
    this.globalObstacles.push(obstacle);
    this.clearCache(); // Invalidate cache when obstacles change
  }

  /**
   * Remove a global obstacle
   */
  removeObstacle(id: string): boolean {
    const removed = this.obstacleMap.remove(id);
    if (removed) {
      this.globalObstacles = this.globalObstacles.filter((o) => o.id !== id);
      this.clearCache();
    }
    return removed;
  }

  /**
   * Get number of global obstacles
   */
  getObstacleCount(): number {
    return this.globalObstacles.length;
  }

  /**
   * Clear all global obstacles
   */
  clearObstacles(): void {
    this.obstacleMap.clear();
    this.globalObstacles = [];
    this.clearCache();
  }

  /**
   * Clear route cache
   */
  clearCache(): void {
    this.routeCache.clear();
  }

  /**
   * Route from start to end
   */
  route(request: RouteRequest): RoutedPath | null {
    // Validate coordinates
    if (
      !isFinite(request.start.x) ||
      !isFinite(request.start.y) ||
      !isFinite(request.end.x) ||
      !isFinite(request.end.y)
    ) {
      throw new Error('Invalid coordinates');
    }

    // Handle same start and end point
    if (
      request.start.x === request.end.x &&
      request.start.y === request.end.y
    ) {
      return {
        points: [{ x: request.start.x, y: request.start.y }],
        totalLength: 0,
        bendCount: 0,
        cost: 0,
        segments: [],
      };
    }

    // Check cache
    const cacheKey = this.getCacheKey(request);
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    // Get algorithm
    const algorithm = request.options?.algorithm ?? this.defaultAlgorithm;
    const router = this.routers.get(algorithm);

    if (!router) {
      throw new Error(`Router '${algorithm}' not found`);
    }

    // Merge global and request obstacles
    const allObstacles = [
      ...this.getAllGlobalObstacles(),
      ...(request.obstacles ?? []),
    ];

    // Create enhanced request with all obstacles
    const enhancedRequest: RouteRequest = {
      ...request,
      obstacles: allObstacles,
    };

    // Perform routing
    const path = router.route(enhancedRequest);

    // Cache result
    this.routeCache.set(cacheKey, path);

    return path;
  }

  /**
   * Get routing engine statistics
   */
  getStats(): {
    obstacleCount: number;
    routerCount: number;
    cacheSize: number;
  } {
    return {
      obstacleCount: this.obstacleMap.size(),
      routerCount: this.routers.size,
      cacheSize: this.routeCache.size(), // Phase 5.3: LRUCache uses method instead of property
    };
  }

  /**
   * Get all global obstacles
   */
  private getAllGlobalObstacles(): Obstacle[] {
    return this.globalObstacles;
  }

  /**
   * Generate cache key for a route request
   */
  private getCacheKey(request: RouteRequest): string {
    const algo = request.options?.algorithm ?? this.defaultAlgorithm;
    const obstacleIds = (request.obstacles ?? [])
      .map((o) => o.id)
      .sort()
      .join(',');

    return `${request.start.x},${request.start.y}|${request.end.x},${request.end.y}|${algo}|${obstacleIds}`;
  }
}
