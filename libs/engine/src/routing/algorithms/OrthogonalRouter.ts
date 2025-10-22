// OrthogonalRouter - Right-angle routing with obstacle avoidance

import type { IRouter, RouteRequest, RoutedPath, RoutePoint, Obstacle } from '../types';
import type { Point } from '../../types';

/**
 * OrthogonalRouter creates paths with only 90-degree angles
 * Supports obstacle avoidance using A* on a grid
 */
export class OrthogonalRouter implements IRouter {
  getName(): string {
    return 'orthogonal';
  }

  route(request: RouteRequest): RoutedPath | null {
    const { start, end, obstacles = [], options = {} } = request;

    // Handle same start and end point
    if (start.x === end.x && start.y === end.y) {
      return {
        points: [{ x: start.x, y: start.y }],
        totalLength: 0,
        bendCount: 0,
        cost: 0,
        segments: [],
      };
    }

    // Simple orthogonal routing without obstacles
    if (!options.avoidObstacles || obstacles.length === 0) {
      const bendCost = options.costs?.bends ?? 10;
      return this.simpleOrthogonalRoute(start, end, options.gridSize, bendCost);
    }

    // Complex routing with obstacle avoidance
    return this.avoidObstaclesRoute(start, end, obstacles, options);
  }

  /**
   * Simple 3-point orthogonal route (no obstacles)
   */
  private simpleOrthogonalRoute(
    start: Point,
    end: Point,
    gridSize?: number,
    bendCost = 10
  ): RoutedPath {
    // If already aligned horizontally or vertically, use direct route
    if (start.x === end.x || start.y === end.y) {
      const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
      return {
        points: [
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
        ],
        totalLength: length,
        bendCount: 0,
        cost: length,
        segments: this.calculateSegments([start, end]),
      };
    }

    // Create 3-point path with midpoint
    // Go horizontal first, then vertical
    const midpoint: Point = { x: (start.x + end.x) / 2, y: start.y };

    const points: RoutePoint[] = [
      { x: start.x, y: start.y },
      midpoint,
      { x: midpoint.x, y: end.y },
      { x: end.x, y: end.y },
    ];

    // Snap to grid if specified
    if (gridSize && gridSize > 1) {
      points.forEach((p) => {
        p.x = Math.round(p.x / gridSize) * gridSize;
        p.y = Math.round(p.y / gridSize) * gridSize;
      });
    }

    // Remove duplicate consecutive points
    const uniquePoints = this.removeDuplicatePoints(points);

    const totalLength = this.calculatePathLength(uniquePoints);
    const bendCount = uniquePoints.length - 2;

    return {
      points: uniquePoints,
      totalLength,
      bendCount: Math.max(0, bendCount),
      cost: totalLength + bendCount * bendCost,
      segments: this.calculateSegments(uniquePoints),
    };
  }

  /**
   * Orthogonal routing with obstacle avoidance using A*
   */
  private avoidObstaclesRoute(
    start: Point,
    end: Point,
    obstacles: Obstacle[],
    options: any
  ): RoutedPath | null {
    const gridSize = options.gridSize ?? 10;
    const margin = options.obstacleMargin ?? 5;
    const maxIterations = options.maxIterations ?? 10000;

    // Snap start and end to grid
    const gridStart = this.snapToGrid(start, gridSize);
    const gridEnd = this.snapToGrid(end, gridSize);

    // Use A* to find path
    const path = this.aStarPathfinding(
      gridStart,
      gridEnd,
      obstacles,
      gridSize,
      margin,
      maxIterations
    );

    if (!path || path.length === 0) {
      // Fallback to simple route if pathfinding fails
      return this.simpleOrthogonalRoute(start, end, gridSize);
    }

    const totalLength = this.calculatePathLength(path);
    const bendCount = this.countBends(path);
    const bendCost = options.costs?.bends ?? 10;

    return {
      points: path,
      totalLength,
      bendCount,
      cost: totalLength + bendCount * bendCost,
      segments: this.calculateSegments(path),
    };
  }

  /**
   * A* pathfinding on a grid
   */
  private aStarPathfinding(
    start: Point,
    end: Point,
    obstacles: Obstacle[],
    gridSize: number,
    margin: number,
    maxIterations: number
  ): RoutePoint[] | null {
    const openSet = new Set<string>();
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, Point>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    const startKey = this.pointToKey(start);
    const endKey = this.pointToKey(end);

    openSet.add(startKey);
    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(start, end));

    let iterations = 0;

    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest fScore
      let currentKey = '';
      let lowestF = Infinity;
      for (const key of openSet) {
        const f = fScore.get(key) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentKey = key;
        }
      }

      if (!currentKey) break;

      const current = this.keyToPoint(currentKey);

      // Reached goal
      if (currentKey === endKey) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.delete(currentKey);
      closedSet.add(currentKey);

      // Check neighbors (4-directional: up, down, left, right)
      const neighbors = this.getOrthogonalNeighbors(current, gridSize);

      for (const neighbor of neighbors) {
        const neighborKey = this.pointToKey(neighbor);

        if (closedSet.has(neighborKey)) continue;

        // Check if neighbor collides with obstacle
        if (this.collidesWithObstacles(neighbor, obstacles, margin)) {
          closedSet.add(neighborKey);
          continue;
        }

        const tentativeG = (gScore.get(currentKey) ?? Infinity) + gridSize;

        if (!openSet.has(neighborKey)) {
          openSet.add(neighborKey);
        } else if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) {
          continue;
        }

        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + this.heuristic(neighbor, end));
      }
    }

    // No path found
    return null;
  }

  /**
   * Reconstruct path from A* came-from map
   */
  private reconstructPath(cameFrom: Map<string, Point>, current: Point): RoutePoint[] {
    const path: RoutePoint[] = [current];
    let currentKey = this.pointToKey(current);

    while (cameFrom.has(currentKey)) {
      const point = cameFrom.get(currentKey)!;
      path.unshift(point);
      currentKey = this.pointToKey(point);
    }

    return path;
  }

  /**
   * Manhattan distance heuristic
   */
  private heuristic(a: Point, b: Point): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * Get 4-directional orthogonal neighbors
   */
  private getOrthogonalNeighbors(point: Point, gridSize: number): Point[] {
    return [
      { x: point.x + gridSize, y: point.y }, // Right
      { x: point.x - gridSize, y: point.y }, // Left
      { x: point.x, y: point.y + gridSize }, // Down
      { x: point.x, y: point.y - gridSize }, // Up
    ];
  }

  /**
   * Check if point collides with any obstacle
   */
  private collidesWithObstacles(
    point: Point,
    obstacles: Obstacle[],
    margin: number
  ): boolean {
    for (const obstacle of obstacles) {
      const expanded = {
        x: obstacle.x - margin,
        y: obstacle.y - margin,
        width: obstacle.width + margin * 2,
        height: obstacle.height + margin * 2,
      };

      if (
        point.x >= expanded.x &&
        point.x <= expanded.x + expanded.width &&
        point.y >= expanded.y &&
        point.y <= expanded.y + expanded.height
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Snap point to grid
   */
  private snapToGrid(point: Point, gridSize: number): Point {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  /**
   * Convert point to map key
   */
  private pointToKey(point: Point): string {
    return `${point.x},${point.y}`;
  }

  /**
   * Convert map key to point
   */
  private keyToPoint(key: string): Point {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  /**
   * Calculate total path length
   */
  private calculatePathLength(points: Point[]): number {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  /**
   * Count bends in path
   */
  private countBends(points: Point[]): number {
    if (points.length < 3) return 0;

    let bends = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      // Check if direction changed
      const dir1 = this.getDirection(prev, curr);
      const dir2 = this.getDirection(curr, next);

      if (dir1 !== dir2) {
        bends++;
      }
    }

    return bends;
  }

  /**
   * Get direction between two points ('h' or 'v')
   */
  private getDirection(a: Point, b: Point): 'h' | 'v' {
    return Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'h' : 'v';
  }

  /**
   * Remove duplicate consecutive points
   */
  private removeDuplicatePoints(points: Point[]): RoutePoint[] {
    const result: RoutePoint[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i === 0 || points[i].x !== points[i - 1].x || points[i].y !== points[i - 1].y) {
        result.push({ ...points[i] });
      }
    }
    return result;
  }

  /**
   * Calculate segments from points
   */
  private calculateSegments(points: Point[]): any[] {
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      segments.push({
        start: { ...start },
        end: { ...end },
        length,
        angle,
      });
    }
    return segments;
  }
}
