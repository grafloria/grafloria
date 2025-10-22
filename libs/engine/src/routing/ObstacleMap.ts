// ObstacleMap - Spatial indexing for efficient obstacle queries

import type { Obstacle, Rectangle } from './types';
import type { Point } from '../types';

/**
 * ObstacleMap manages spatial indexing of obstacles for efficient queries
 * Uses a simple grid-based spatial index for O(1) lookups
 */
export class ObstacleMap {
  private obstacles: Map<string, Obstacle> = new Map();
  private gridCellSize = 100; // Grid cell size for spatial indexing
  private spatialGrid: Map<string, Set<string>> = new Map();

  /**
   * Get number of obstacles in the map
   */
  size(): number {
    return this.obstacles.size;
  }

  /**
   * Add an obstacle to the map
   */
  add(obstacle: Obstacle): void {
    this.obstacles.set(obstacle.id, obstacle);
    this.addToSpatialGrid(obstacle);
  }

  /**
   * Remove an obstacle from the map
   */
  remove(id: string): boolean {
    const obstacle = this.obstacles.get(id);
    if (!obstacle) {
      return false;
    }

    this.removeFromSpatialGrid(obstacle);
    return this.obstacles.delete(id);
  }

  /**
   * Get an obstacle by ID
   */
  get(id: string): Obstacle | undefined {
    return this.obstacles.get(id);
  }

  /**
   * Update an obstacle (remove and re-add to update spatial index)
   */
  update(obstacle: Obstacle): void {
    this.remove(obstacle.id);
    this.add(obstacle);
  }

  /**
   * Clear all obstacles
   */
  clear(): void {
    this.obstacles.clear();
    this.spatialGrid.clear();
  }

  /**
   * Query obstacles in a rectangular region
   */
  queryRegion(region: Rectangle): Obstacle[] {
    const result: Obstacle[] = [];
    const seen = new Set<string>();

    // Get all grid cells that overlap the region
    const cells = this.getOverlappingCells(region);

    for (const cellKey of cells) {
      const obstacleIds = this.spatialGrid.get(cellKey);
      if (!obstacleIds) continue;

      for (const id of obstacleIds) {
        if (seen.has(id)) continue;
        seen.add(id);

        const obstacle = this.obstacles.get(id);
        if (obstacle && this.rectanglesOverlap(region, obstacle)) {
          result.push(obstacle);
        }
      }
    }

    return result;
  }

  /**
   * Query obstacles near a point within a given radius
   */
  queryNearPoint(point: Point, radius: number): Obstacle[] {
    const region: Rectangle = {
      x: point.x - radius,
      y: point.y - radius,
      width: radius * 2,
      height: radius * 2,
    };

    return this.queryRegion(region).filter((obstacle) => {
      const center = this.getObstacleCenter(obstacle);
      const distance = this.distance(point, center);
      return distance <= radius;
    });
  }

  /**
   * Query obstacles along a line segment
   */
  queryLine(start: Point, end: Point): Obstacle[] {
    // Create bounding box for the line
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxX = Math.max(start.x, end.x);
    const maxY = Math.max(start.y, end.y);

    const region: Rectangle = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    // Get obstacles in bounding box, then filter by line intersection
    return this.queryRegion(region).filter((obstacle) => {
      return this.lineIntersectsRectangle(start, end, obstacle);
    });
  }

  /**
   * Get all obstacles as an array (Phase 1.6b)
   */
  getObstacles(): Obstacle[] {
    return Array.from(this.obstacles.values());
  }

  /**
   * Check if a point is inside any obstacle
   */
  isPointInside(point: Point, respectMargin = false): boolean {
    // Query nearby obstacles
    const nearby = this.queryRegion({
      x: point.x - 1,
      y: point.y - 1,
      width: 2,
      height: 2,
    });

    for (const obstacle of nearby) {
      const margin = respectMargin ? (obstacle.margin ?? 0) : 0;
      const expanded: Rectangle = {
        x: obstacle.x - margin,
        y: obstacle.y - margin,
        width: obstacle.width + margin * 2,
        height: obstacle.height + margin * 2,
      };

      if (this.pointInRectangle(point, expanded)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a line segment intersects any obstacle
   */
  doesLineIntersect(start: Point, end: Point, margin = 0): boolean {
    const obstacles = this.queryLine(start, end);

    for (const obstacle of obstacles) {
      const expanded: Rectangle = {
        x: obstacle.x - margin,
        y: obstacle.y - margin,
        width: obstacle.width + margin * 2,
        height: obstacle.height + margin * 2,
      };

      if (this.lineIntersectsRectangle(start, end, expanded)) {
        return true;
      }
    }

    return false;
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  private addToSpatialGrid(obstacle: Obstacle): void {
    const cells = this.getOverlappingCells(obstacle);
    for (const cellKey of cells) {
      if (!this.spatialGrid.has(cellKey)) {
        this.spatialGrid.set(cellKey, new Set());
      }
      this.spatialGrid.get(cellKey)!.add(obstacle.id);
    }
  }

  private removeFromSpatialGrid(obstacle: Obstacle): void {
    const cells = this.getOverlappingCells(obstacle);
    for (const cellKey of cells) {
      const cell = this.spatialGrid.get(cellKey);
      if (cell) {
        cell.delete(obstacle.id);
        if (cell.size === 0) {
          this.spatialGrid.delete(cellKey);
        }
      }
    }
  }

  private getOverlappingCells(rect: Rectangle): string[] {
    const cells: string[] = [];

    const minCellX = Math.floor(rect.x / this.gridCellSize);
    const minCellY = Math.floor(rect.y / this.gridCellSize);
    const maxCellX = Math.floor((rect.x + rect.width) / this.gridCellSize);
    const maxCellY = Math.floor((rect.y + rect.height) / this.gridCellSize);

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        cells.push(`${x},${y}`);
      }
    }

    return cells;
  }

  private rectanglesOverlap(a: Rectangle, b: Rectangle): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  private pointInRectangle(point: Point, rect: Rectangle): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  private lineIntersectsRectangle(start: Point, end: Point, rect: Rectangle): boolean {
    // Check if either endpoint is inside the rectangle
    if (this.pointInRectangle(start, rect) || this.pointInRectangle(end, rect)) {
      return true;
    }

    // Check if line's bounding box overlaps with rectangle
    const lineMinX = Math.min(start.x, end.x);
    const lineMaxX = Math.max(start.x, end.x);
    const lineMinY = Math.min(start.y, end.y);
    const lineMaxY = Math.max(start.y, end.y);

    const rectMinX = rect.x;
    const rectMaxX = rect.x + rect.width;
    const rectMinY = rect.y;
    const rectMaxY = rect.y + rect.height;

    // No overlap if bounding boxes don't intersect
    if (lineMaxX < rectMinX || lineMinX > rectMaxX ||
        lineMaxY < rectMinY || lineMinY > rectMaxY) {
      return false;
    }

    // Check if line intersects any of the four edges
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];

    for (let i = 0; i < 4; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 4];
      if (this.lineSegmentsIntersect(start, end, c1, c2)) {
        return true;
      }
    }

    // If bounding boxes overlap but no edge intersections found, assume no collision
    return false;
  }

  private lineSegmentsIntersect(
    a1: Point,
    a2: Point,
    b1: Point,
    b2: Point
  ): boolean {
    const ccw = (A: Point, B: Point, C: Point) => {
      return (C.y - A.y) * (B.x - A.x) - (B.y - A.y) * (C.x - A.x);
    };

    const d1 = ccw(b1, b2, a1);
    const d2 = ccw(b1, b2, a2);
    const d3 = ccw(a1, a2, b1);
    const d4 = ccw(a1, a2, b2);

    // Standard intersection check
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }

    // Check for colinear overlapping segments
    if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
      // Segments are colinear, check if they overlap
      const overlap1D = (min1: number, max1: number, min2: number, max2: number) => {
        return Math.max(min1, min2) <= Math.min(max1, max2);
      };

      const a1x = Math.min(a1.x, a2.x);
      const a2x = Math.max(a1.x, a2.x);
      const a1y = Math.min(a1.y, a2.y);
      const a2y = Math.max(a1.y, a2.y);

      const b1x = Math.min(b1.x, b2.x);
      const b2x = Math.max(b1.x, b2.x);
      const b1y = Math.min(b1.y, b2.y);
      const b2y = Math.max(b1.y, b2.y);

      return overlap1D(a1x, a2x, b1x, b2x) && overlap1D(a1y, a2y, b1y, b2y);
    }

    return false;
  }

  private getObstacleCenter(obstacle: Obstacle): Point {
    return {
      x: obstacle.x + obstacle.width / 2,
      y: obstacle.y + obstacle.height / 2,
    };
  }

  private distance(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
