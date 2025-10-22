// VisibilityGraphRouter.ts - Visibility Graph Algorithm (Phase 4.3)

import type { Point } from '../../types';
import type { ObstacleMap } from '../ObstacleMap';
import type { Obstacle } from '../types';

/**
 * Configuration options for Visibility Graph router
 */
export interface VisibilityGraphOptions {
  /** Margin around obstacles (default: 1) - corners placed outside obstacle bounds */
  obstacleMargin?: number;
}

/**
 * Edge in visibility graph
 */
interface GraphEdge {
  to: number; // Index of target vertex
  weight: number; // Distance
}

/**
 * Node for Dijkstra's algorithm on visibility graph
 */
interface PathNode {
  vertex: number; // Vertex index
  distance: number;
  parent: number | null;
}

/**
 * Min-heap priority queue
 */
class PriorityQueue {
  private heap: PathNode[] = [];

  push(node: PathNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): PathNode | undefined {
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
 * Visibility Graph Router
 * Optimal for environments with few obstacles and open spaces
 * Creates graph of obstacle corners and finds shortest geometric path
 */
export class VisibilityGraphRouter {
  private obstacleMap: ObstacleMap;
  private options: Required<VisibilityGraphOptions>;

  constructor(obstacleMap: ObstacleMap, options: VisibilityGraphOptions = {}) {
    this.obstacleMap = obstacleMap;
    this.options = {
      obstacleMargin: options.obstacleMargin ?? 1,
    };
  }

  /**
   * Find shortest geometric path using visibility graph
   */
  route(start: Point, end: Point): Point[] {
    // Early exit if start equals end
    if (this.pointsEqual(start, end)) {
      return [start];
    }

    // Check for direct line of sight
    if (this.hasLineOfSight(start, end)) {
      return [start, end];
    }

    // Get all obstacles from map
    const obstacles = this.obstacleMap.queryRegion({
      x: Math.min(start.x, end.x) - 1000,
      y: Math.min(start.y, end.y) - 1000,
      width: Math.abs(end.x - start.x) + 2000,
      height: Math.abs(end.y - start.y) + 2000,
    });

    if (obstacles.length === 0) {
      return [start, end];
    }

    // Extract vertices from obstacles
    const vertices = this.extractVertices(obstacles, start, end);

    // Build visibility graph
    const graph = this.buildVisibilityGraph(vertices, obstacles);

    // Find shortest path through graph
    const path = this.findShortestPath(graph, vertices, 0, 1); // 0 = start, 1 = end

    if (path.length === 0) {
      // Fallback to direct path if no path found
      return [start, end];
    }

    return path;
  }

  /**
   * Extract all vertices (corners) from obstacles plus start/end
   */
  private extractVertices(obstacles: Obstacle[], start: Point, end: Point): Point[] {
    const vertices: Point[] = [start, end];
    const margin = this.options.obstacleMargin;

    for (const obstacle of obstacles) {
      // Add four corners of obstacle (with margin)
      vertices.push(
        { x: obstacle.x - margin, y: obstacle.y - margin }, // Top-left
        { x: obstacle.x + obstacle.width + margin, y: obstacle.y - margin }, // Top-right
        { x: obstacle.x + obstacle.width + margin, y: obstacle.y + obstacle.height + margin }, // Bottom-right
        { x: obstacle.x - margin, y: obstacle.y + obstacle.height + margin } // Bottom-left
      );
    }

    return vertices;
  }

  /**
   * Build visibility graph - connect vertices with line-of-sight
   */
  private buildVisibilityGraph(vertices: Point[], obstacles: Obstacle[]): GraphEdge[][] {
    const graph: GraphEdge[][] = Array.from({ length: vertices.length }, () => []);

    // For each pair of vertices, check if they can see each other
    for (let i = 0; i < vertices.length; i++) {
      for (let j = i + 1; j < vertices.length; j++) {
        if (this.hasLineOfSight(vertices[i], vertices[j], obstacles)) {
          const distance = this.distance(vertices[i], vertices[j]);

          // Add bidirectional edge
          graph[i].push({ to: j, weight: distance });
          graph[j].push({ to: i, weight: distance });
        }
      }
    }

    return graph;
  }

  /**
   * Find shortest path through visibility graph using Dijkstra
   */
  private findShortestPath(
    graph: GraphEdge[][],
    vertices: Point[],
    startIdx: number,
    endIdx: number
  ): Point[] {
    const distances = new Array(vertices.length).fill(Infinity);
    const parents = new Array(vertices.length).fill(-1);
    const visited = new Set<number>();
    const queue = new PriorityQueue();

    distances[startIdx] = 0;
    queue.push({ vertex: startIdx, distance: 0, parent: null });

    while (!queue.isEmpty()) {
      const current = queue.pop()!;

      if (visited.has(current.vertex)) continue;
      visited.add(current.vertex);

      // Reached end
      if (current.vertex === endIdx) {
        break;
      }

      // Explore neighbors
      for (const edge of graph[current.vertex]) {
        if (visited.has(edge.to)) continue;

        const newDistance = distances[current.vertex] + edge.weight;

        if (newDistance < distances[edge.to]) {
          distances[edge.to] = newDistance;
          parents[edge.to] = current.vertex;
          queue.push({ vertex: edge.to, distance: newDistance, parent: current.vertex });
        }
      }
    }

    // Reconstruct path
    if (parents[endIdx] === -1) {
      return []; // No path found
    }

    const path: Point[] = [];
    let current = endIdx;

    while (current !== -1) {
      path.unshift(vertices[current]);
      current = parents[current];
    }

    return path;
  }

  /**
   * Check if two points have line-of-sight (no obstacles blocking)
   */
  private hasLineOfSight(a: Point, b: Point, obstacles?: Obstacle[]): boolean {
    const obs = obstacles || this.obstacleMap.queryRegion({
      x: Math.min(a.x, b.x) - 10,
      y: Math.min(a.y, b.y) - 10,
      width: Math.abs(b.x - a.x) + 20,
      height: Math.abs(b.y - a.y) + 20,
    });

    for (const obstacle of obs) {
      if (this.lineIntersectsRectangle(a, b, obstacle)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if line segment intersects with rectangle
   */
  private lineIntersectsRectangle(a: Point, b: Point, rect: Obstacle): boolean {
    // Check if line segment intersects any of the four edges of rectangle
    const edges = [
      { p1: { x: rect.x, y: rect.y }, p2: { x: rect.x + rect.width, y: rect.y } }, // Top
      { p1: { x: rect.x + rect.width, y: rect.y }, p2: { x: rect.x + rect.width, y: rect.y + rect.height } }, // Right
      { p1: { x: rect.x + rect.width, y: rect.y + rect.height }, p2: { x: rect.x, y: rect.y + rect.height } }, // Bottom
      { p1: { x: rect.x, y: rect.y + rect.height }, p2: { x: rect.x, y: rect.y } }, // Left
    ];

    for (const edge of edges) {
      if (this.lineSegmentsIntersect(a, b, edge.p1, edge.p2)) {
        return true;
      }
    }

    // Also check if line passes through interior
    const midpoint = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };

    if (
      midpoint.x > rect.x &&
      midpoint.x < rect.x + rect.width &&
      midpoint.y > rect.y &&
      midpoint.y < rect.y + rect.height
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if two line segments intersect
   */
  private lineSegmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
    const ccw = (a: Point, b: Point, c: Point): boolean => {
      return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    };

    return (
      ccw(a1, b1, b2) !== ccw(a2, b1, b2) &&
      ccw(a1, a2, b1) !== ccw(a1, a2, b2)
    );
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private distance(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if two points are equal
   */
  private pointsEqual(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
  }
}
