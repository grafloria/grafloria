// RoutingEngine - Main routing coordinator

import type {
  IRouter,
  RouteRequest,
  RoutedPath,
  Obstacle,
  RoutingAlgorithm,
} from './types';
import { ObstacleMap } from './ObstacleMap';
import { PathSimplifier } from './PathSimplifier'; // Phase 2.2
import { StraightRouter } from './algorithms/StraightRouter';
import { OrthogonalRouter } from './algorithms/OrthogonalRouter';
import { ElkRouter } from './algorithms/ElkRouter';
import { AStarRouter } from './algorithms/AStarRouter';
import { DijkstraRouter } from './algorithms/DijkstraRouter';
import { VisibilityGraphRouter } from './algorithms/VisibilityGraphRouter';
import { LRUCache } from '../performance/LRUCache'; // Phase 5.3

/**
 * Adapter for A* Router to match IRouter interface
 */
class AStarRouterAdapter implements IRouter {
  private router: AStarRouter;

  constructor(obstacleMap: ObstacleMap) {
    this.router = new AStarRouter(obstacleMap);
  }

  getName(): string {
    return 'a-star';
  }

  route(request: RouteRequest): RoutedPath | null {
    const points = this.router.route(request.start, request.end);
    if (points.length === 0) return null;

    // Calculate total length and bend count
    let totalLength = 0;
    let bendCount = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);

      // Count bends (direction changes)
      if (i > 0) {
        const prevDx = points[i].x - points[i - 1].x;
        const prevDy = points[i].y - points[i - 1].y;
        if (Math.abs(dx - prevDx) > 0.01 || Math.abs(dy - prevDy) > 0.01) {
          bendCount++;
        }
      }
    }

    return {
      points,
      totalLength,
      bendCount,
      cost: totalLength,
    };
  }
}

/**
 * Adapter for Dijkstra Router to match IRouter interface
 */
class DijkstraRouterAdapter implements IRouter {
  private router: DijkstraRouter;

  constructor(obstacleMap: ObstacleMap) {
    this.router = new DijkstraRouter(obstacleMap);
  }

  getName(): string {
    return 'dijkstra';
  }

  route(request: RouteRequest): RoutedPath | null {
    const points = this.router.route(request.start, request.end);
    if (points.length === 0) return null;

    let totalLength = 0;
    let bendCount = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);

      if (i > 0) {
        const prevDx = points[i].x - points[i - 1].x;
        const prevDy = points[i].y - points[i - 1].y;
        if (Math.abs(dx - prevDx) > 0.01 || Math.abs(dy - prevDy) > 0.01) {
          bendCount++;
        }
      }
    }

    return {
      points,
      totalLength,
      bendCount,
      cost: totalLength,
    };
  }
}

/**
 * Adapter for Visibility Graph Router to match IRouter interface
 */
class VisibilityGraphRouterAdapter implements IRouter {
  private router: VisibilityGraphRouter;

  constructor(obstacleMap: ObstacleMap) {
    this.router = new VisibilityGraphRouter(obstacleMap);
  }

  getName(): string {
    return 'visibility-graph';
  }

  route(request: RouteRequest): RoutedPath | null {
    const points = this.router.route(request.start, request.end);
    if (points.length === 0) return null;

    let totalLength = 0;
    let bendCount = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);

      if (i > 0) {
        const prevDx = points[i].x - points[i - 1].x;
        const prevDy = points[i].y - points[i - 1].y;
        if (Math.abs(dx - prevDx) > 0.01 || Math.abs(dy - prevDy) > 0.01) {
          bendCount++;
        }
      }
    }

    return {
      points,
      totalLength,
      bendCount,
      cost: totalLength,
    };
  }
}

/**
 * RoutingEngine coordinates routing operations and manages obstacles
 */
export class RoutingEngine {
  private routers: Map<string, IRouter> = new Map();
  private obstacleMap: ObstacleMap = new ObstacleMap();
  private globalObstacles: Obstacle[] = []; // Simple array to avoid huge spatial queries
  private routeCache: LRUCache<string, RoutedPath | null>; // Phase 5.3: LRU cache prevents unbounded growth
  private defaultAlgorithm: RoutingAlgorithm = 'straight';
  private pathSimplifier: PathSimplifier; // Phase 2.2: Path simplification

  constructor() {
    // Phase 5.3: Initialize LRU cache with capacity of 1000 routes
    // This prevents unbounded memory growth while maintaining good hit rate
    this.routeCache = new LRUCache<string, RoutedPath | null>(1000);

    // Phase 2.2: Initialize path simplifier
    this.pathSimplifier = new PathSimplifier();

    // Register built-in routers
    this.registerRouter('straight', new StraightRouter());
    this.registerRouter('orthogonal', new OrthogonalRouter());
    this.registerRouter('elk', new ElkRouter());

    // Register advanced routers with obstacle avoidance (using adapters)
    this.registerRouter('a-star', new AStarRouterAdapter(this.obstacleMap));
    this.registerRouter('dijkstra', new DijkstraRouterAdapter(this.obstacleMap));
    this.registerRouter('visibility-graph', new VisibilityGraphRouterAdapter(this.obstacleMap));
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
   * Update an existing obstacle's position/size
   * More efficient than remove + add
   */
  updateObstacle(obstacle: Obstacle): void {
    // Remove old version
    this.obstacleMap.remove(obstacle.id);
    // Add updated version
    this.obstacleMap.add(obstacle);

    // Update in global array
    const index = this.globalObstacles.findIndex((o) => o.id === obstacle.id);
    if (index !== -1) {
      this.globalObstacles[index] = obstacle;
    } else {
      this.globalObstacles.push(obstacle);
    }

    this.clearCache(); // Invalidate cache when obstacles change
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
   * Route from start to end (synchronous version)
   * Throws error if algorithm is async (like ELK)
   * Use routeAsync() for async routers
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

    // ELK is async-only
    if (algorithm === 'elk') {
      throw new Error('ELK router is async. Use routeAsync() instead or pre-calculate paths.');
    }

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

    // Perform routing (must be sync)
    const result = router.route(enhancedRequest);
    if (result instanceof Promise) {
      throw new Error(`Router '${algorithm}' is async. Use routeAsync() instead.`);
    }

    let path = result;

    // Apply path simplification if enabled
    if (path && request.options?.simplifyPath && path.points.length > 2) {
      const epsilon = request.options.simplificationEpsilon ?? 1.0;
      const simplifiedPoints = this.pathSimplifier.simplify(path.points, epsilon);

      // Recalculate path metrics after simplification
      let totalLength = 0;
      let bendCount = 0;
      for (let i = 0; i < simplifiedPoints.length - 1; i++) {
        const dx = simplifiedPoints[i + 1].x - simplifiedPoints[i].x;
        const dy = simplifiedPoints[i + 1].y - simplifiedPoints[i].y;
        totalLength += Math.sqrt(dx * dx + dy * dy);

        // Count bends (direction changes)
        if (i > 0) {
          const prevDx = simplifiedPoints[i].x - simplifiedPoints[i - 1].x;
          const prevDy = simplifiedPoints[i].y - simplifiedPoints[i - 1].y;
          if (Math.abs(dx - prevDx) > 0.01 || Math.abs(dy - prevDy) > 0.01) {
            bendCount++;
          }
        }
      }

      // Create new path with simplified points
      path = {
        ...path,
        points: simplifiedPoints,
        totalLength,
        bendCount,
      };
    }

    // Cache result
    this.routeCache.set(cacheKey, path);

    return path;
  }

  /**
   * Route from start to end (async version)
   * Supports both sync and async routers like ELK.js
   */
  async routeAsync(request: RouteRequest): Promise<RoutedPath | null> {
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

    // Perform routing (await in case router is async like ELK)
    let path = await router.route(enhancedRequest);

    // Phase 2.2: Apply path simplification if enabled
    if (path && request.options?.simplifyPath && path.points.length > 2) {
      const epsilon = request.options.simplificationEpsilon ?? 1.0;
      const simplifiedPoints = this.pathSimplifier.simplify(path.points, epsilon);

      // Recalculate path metrics after simplification
      let totalLength = 0;
      let bendCount = 0;
      for (let i = 0; i < simplifiedPoints.length - 1; i++) {
        const dx = simplifiedPoints[i + 1].x - simplifiedPoints[i].x;
        const dy = simplifiedPoints[i + 1].y - simplifiedPoints[i].y;
        totalLength += Math.sqrt(dx * dx + dy * dy);

        // Count bends (direction changes)
        if (i > 0) {
          const prevDx = simplifiedPoints[i].x - simplifiedPoints[i - 1].x;
          const prevDy = simplifiedPoints[i].y - simplifiedPoints[i - 1].y;
          if (Math.abs(dx - prevDx) > 0.01 || Math.abs(dy - prevDy) > 0.01) {
            bendCount++;
          }
        }
      }

      // Create new path with simplified points
      path = {
        ...path,
        points: simplifiedPoints,
        totalLength,
        bendCount,
      };
    }

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
    const simplify = request.options?.simplifyPath ?? false;
    const epsilon = request.options?.simplificationEpsilon ?? 1.0;
    const obstacleIds = (request.obstacles ?? [])
      .map((o) => o.id)
      .sort()
      .join(',');

    // Phase 2.2: Include simplification options in cache key to prevent incorrect cache hits
    return `${request.start.x},${request.start.y}|${request.end.x},${request.end.y}|${algo}|${obstacleIds}|${simplify}|${epsilon}`;
  }
}
