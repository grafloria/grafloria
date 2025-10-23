// DijkstraRouter.ts - Dijkstra's Shortest Path Algorithm (Phase 4.3)

import type { Point } from '../../types';
import type { ObstacleMap } from '../ObstacleMap';

/**
 * Configuration options for Dijkstra router
 */
export interface DijkstraOptions {
  /** Allow diagonal movement (default: true) */
  allowDiagonal?: boolean;
  /** Grid size for discretization (default: 5) */
  gridSize?: number;
  /** Enable path smoothing (default: true) */
  smoothing?: boolean;
  /** Margin around obstacles (default: 5) */
  obstacleMargin?: number;
  /** Maximum iterations before giving up (default: 10000) */
  maxIterations?: number;
}

/**
 * Internal node for Dijkstra's algorithm
 */
interface DijkstraNode {
  point: Point;
  distance: number; // Distance from start (g-score)
  parent: DijkstraNode | null;
}

/**
 * Min-heap priority queue for Dijkstra
 */
class PriorityQueue {
  private heap: DijkstraNode[] = [];

  push(node: DijkstraNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): DijkstraNode | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const result = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return result;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].distance >= this.heap[parentIndex].distance) break;

      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < this.heap.length && this.heap[leftChild].distance < this.heap[minIndex].distance) {
        minIndex = leftChild;
      }

      if (rightChild < this.heap.length && this.heap[rightChild].distance < this.heap[minIndex].distance) {
        minIndex = rightChild;
      }

      if (minIndex === index) break;

      [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
      index = minIndex;
    }
  }
}

/**
 * Dijkstra's Shortest Path Router
 * Guarantees shortest path but may be slower than A* for long distances
 */
export class DijkstraRouter {
  private obstacleMap: ObstacleMap;
  private options: Required<DijkstraOptions>;

  constructor(obstacleMap: ObstacleMap, options: DijkstraOptions = {}) {
    this.obstacleMap = obstacleMap;
    this.options = {
      allowDiagonal: options.allowDiagonal ?? true,
      gridSize: options.gridSize ?? 5,
      smoothing: options.smoothing ?? true,
      obstacleMargin: options.obstacleMargin ?? 5,
      maxIterations: options.maxIterations ?? 10000,
    };
  }

  /**
   * Get algorithm name
   */
  getName(): string {
    return 'dijkstra';
  }

  /**
   * Find shortest path from start to end using Dijkstra's algorithm
   */
  route(start: Point, end: Point): Point[] {
    // Early exit if start equals end
    if (this.pointsEqual(start, end)) {
      return [start];
    }

    // Snap points to grid
    const gridStart = this.snapToGrid(start);
    const gridEnd = this.snapToGrid(end);

    // If points snap to the same grid cell, return direct path
    if (this.pointsEqual(gridStart, gridEnd)) {
      return [start, end];
    }

    // Run Dijkstra's algorithm
    const path = this.findPath(gridStart, gridEnd);

    if (path.length === 0) {
      return [];
    }

    // Replace first and last points with original coordinates
    path[0] = start;
    path[path.length - 1] = end;

    // Apply path smoothing if enabled
    if (this.options.smoothing) {
      return this.smoothPath(path);
    }

    return path;
  }

  /**
   * Core Dijkstra's shortest path algorithm
   */
  private findPath(start: Point, end: Point): Point[] {
    const openSet = new PriorityQueue();
    const closedSet = new Set<string>();
    const distances = new Map<string, number>();

    // Initialize start node
    const startNode: DijkstraNode = {
      point: start,
      distance: 0,
      parent: null,
    };

    openSet.push(startNode);
    distances.set(this.pointKey(start), 0);

    let iterations = 0;

    while (!openSet.isEmpty() && iterations < this.options.maxIterations) {
      iterations++;

      const current = openSet.pop()!;
      const currentKey = this.pointKey(current.point);

      // Check if we reached the goal
      if (this.pointsEqual(current.point, end)) {
        return this.reconstructPath(current);
      }

      closedSet.add(currentKey);

      // Explore neighbors
      const neighbors = this.getNeighbors(current.point);

      for (const neighbor of neighbors) {
        const neighborKey = this.pointKey(neighbor);

        // Skip if in closed set
        if (closedSet.has(neighborKey)) continue;

        // Skip if collides with obstacle
        if (this.collidesWithObstacle(neighbor)) continue;

        // Calculate tentative distance
        const tentativeDistance = current.distance + this.distance(current.point, neighbor);

        // Check if this is a better path
        const existingDistance = distances.get(neighborKey);
        if (existingDistance !== undefined && tentativeDistance >= existingDistance) {
          continue;
        }

        // This is the best path so far
        distances.set(neighborKey, tentativeDistance);

        const neighborNode: DijkstraNode = {
          point: neighbor,
          distance: tentativeDistance,
          parent: current,
        };

        openSet.push(neighborNode);
      }
    }

    // No path found
    return [];
  }

  /**
   * Reconstruct path from end node
   */
  private reconstructPath(node: DijkstraNode): Point[] {
    const path: Point[] = [];
    let current: DijkstraNode | null = node;

    while (current !== null) {
      path.unshift(current.point);
      current = current.parent;
    }

    return path;
  }

  /**
   * Get neighbors of a point
   */
  private getNeighbors(point: Point): Point[] {
    const { gridSize } = this.options;
    const neighbors: Point[] = [];

    // 4-directional movement (orthogonal)
    const orthogonal = [
      { x: point.x + gridSize, y: point.y }, // Right
      { x: point.x - gridSize, y: point.y }, // Left
      { x: point.x, y: point.y + gridSize }, // Down
      { x: point.x, y: point.y - gridSize }, // Up
    ];

    neighbors.push(...orthogonal);

    // 8-directional movement (diagonal)
    if (this.options.allowDiagonal) {
      const diagonal = [
        { x: point.x + gridSize, y: point.y + gridSize }, // Down-right
        { x: point.x - gridSize, y: point.y + gridSize }, // Down-left
        { x: point.x + gridSize, y: point.y - gridSize }, // Up-right
        { x: point.x - gridSize, y: point.y - gridSize }, // Up-left
      ];

      neighbors.push(...diagonal);
    }

    return neighbors;
  }

  /**
   * Calculate distance between two points
   */
  private distance(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if point collides with obstacle (including margin)
   */
  private collidesWithObstacle(point: Point): boolean {
    const margin = this.options.obstacleMargin;

    // Query obstacles in region around point
    const obstacles = this.obstacleMap.queryRegion({
      x: point.x - margin,
      y: point.y - margin,
      width: margin * 2,
      height: margin * 2,
    });

    for (const obstacle of obstacles) {
      // Check if point is within obstacle bounds + margin
      if (
        point.x >= obstacle.x - margin &&
        point.x <= obstacle.x + obstacle.width + margin &&
        point.y >= obstacle.y - margin &&
        point.y <= obstacle.y + obstacle.height + margin
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Smooth path by removing unnecessary waypoints
   */
  private smoothPath(path: Point[]): Point[] {
    if (path.length <= 2) return path;

    const smoothed: Point[] = [path[0]];
    let currentIndex = 0;

    while (currentIndex < path.length - 1) {
      // Try to find the farthest point we can reach directly
      let farthestIndex = currentIndex + 1;

      for (let i = path.length - 1; i > currentIndex + 1; i--) {
        if (this.hasLineOfSight(path[currentIndex], path[i])) {
          farthestIndex = i;
          break;
        }
      }

      smoothed.push(path[farthestIndex]);
      currentIndex = farthestIndex;
    }

    return smoothed;
  }

  /**
   * Check if there's a clear line of sight between two points
   */
  private hasLineOfSight(a: Point, b: Point): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(distance / this.options.gridSize);

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const point = {
        x: a.x + dx * t,
        y: a.y + dy * t,
      };

      if (this.collidesWithObstacle(point)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Snap point to grid
   */
  private snapToGrid(point: Point): Point {
    const { gridSize } = this.options;
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  /**
   * Create unique key for point
   */
  private pointKey(point: Point): string {
    return `${point.x},${point.y}`;
  }

  /**
   * Check if two points are equal
   */
  private pointsEqual(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
  }
}
