// SpatialIndex.ts - Generic spatial indexing for viewport virtualization (Phase 5.1)

import type { Rectangle } from '../types/geometry.types';

/**
 * Configuration for SpatialIndex
 */
export interface SpatialIndexConfig<T> {
  /**
   * Size of grid cells for spatial partitioning (default: 100)
   */
  cellSize?: number;

  /**
   * Function to extract bounds from entity
   */
  getBounds: (entity: T) => Rectangle;
}

/**
 * Query options for spatial queries
 */
export interface QueryOptions<T> {
  /**
   * Filter function to exclude entities from results
   */
  filter?: (entity: T) => boolean;

  /**
   * Maximum number of entities to return
   */
  limit?: number;
}

/**
 * Grid cell coordinates
 */
interface CellCoord {
  row: number;
  col: number;
}

/**
 * Generic spatial index using grid-based partitioning
 * Enables fast viewport queries for virtualization (O(visible) instead of O(all))
 *
 * Phase 5.1: Viewport Virtualization
 *
 * @example
 * ```typescript
 * const index = new SpatialIndex<NodeModel>({
 *   cellSize: 100,
 *   getBounds: (node) => ({
 *     x: node.position.x,
 *     y: node.position.y,
 *     width: node.size.width,
 *     height: node.size.height,
 *   }),
 * });
 *
 * index.add(node);
 * const visible = index.queryRegion(viewport);
 * ```
 */
export class SpatialIndex<T extends { id: string }> {
  private readonly cellSize: number;
  private readonly getBounds: (entity: T) => Rectangle;

  /**
   * Map of entity ID to entity
   */
  private entities = new Map<string, T>();

  /**
   * Grid cells: cellKey -> Set<entityId>
   * cellKey format: "row,col"
   */
  private grid = new Map<string, Set<string>>();

  constructor(config: SpatialIndexConfig<T>) {
    this.cellSize = config.cellSize ?? 100;
    this.getBounds = config.getBounds;
  }

  /**
   * Add entity to spatial index
   */
  add(entity: T): void {
    if (this.entities.has(entity.id)) {
      // Update existing entity
      this.update(entity);
      return;
    }

    this.entities.set(entity.id, entity);
    this.addToGrid(entity);
  }

  /**
   * Update entity position in spatial index
   */
  update(entity: T): void {
    // Remove from old cells
    if (this.entities.has(entity.id)) {
      this.removeFromGrid(entity.id);
    }

    // Update entity
    this.entities.set(entity.id, entity);

    // Add to new cells
    this.addToGrid(entity);
  }

  /**
   * Remove entity from spatial index
   */
  remove(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) {
      return false;
    }

    this.entities.delete(id);
    this.removeFromGrid(id);
    return true;
  }

  /**
   * Get entity by ID
   */
  get(id: string): T | undefined {
    return this.entities.get(id);
  }

  /**
   * Get number of entities in index
   */
  size(): number {
    return this.entities.size;
  }

  /**
   * Clear all entities from index
   */
  clear(): void {
    this.entities.clear();
    this.grid.clear();
  }

  /**
   * Query entities in rectangular region (viewport)
   * This is the key method for viewport virtualization
   *
   * Time complexity: O(k) where k = entities in viewport
   * Instead of: O(n) where n = all entities
   */
  queryRegion(region: Rectangle, options?: QueryOptions<T>): T[] {
    const cells = this.getOverlappingCells(region);
    const candidates = new Set<string>();

    // Collect all entity IDs in overlapping cells
    for (const cellKey of cells) {
      const cellEntities = this.grid.get(cellKey);
      if (cellEntities) {
        cellEntities.forEach((id) => candidates.add(id));
      }
    }

    // Filter to entities that actually intersect the region
    const results: T[] = [];
    let count = 0;

    for (const id of candidates) {
      const entity = this.entities.get(id);
      if (!entity) continue;

      const bounds = this.getBounds(entity);
      if (!this.rectanglesIntersect(region, bounds)) continue;

      // Apply custom filter if provided
      if (options?.filter && !options.filter(entity)) continue;

      results.push(entity);
      count++;

      // Apply limit if provided
      if (options?.limit && count >= options.limit) break;
    }

    return results;
  }

  /**
   * Add entity to grid cells
   */
  private addToGrid(entity: T): void {
    const bounds = this.getBounds(entity);
    const cells = this.getOverlappingCells(bounds);

    for (const cellKey of cells) {
      let cellSet = this.grid.get(cellKey);
      if (!cellSet) {
        cellSet = new Set();
        this.grid.set(cellKey, cellSet);
      }
      cellSet.add(entity.id);
    }
  }

  /**
   * Remove entity from grid cells
   */
  private removeFromGrid(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    const bounds = this.getBounds(entity);
    const cells = this.getOverlappingCells(bounds);

    for (const cellKey of cells) {
      const cellSet = this.grid.get(cellKey);
      if (cellSet) {
        cellSet.delete(id);
        if (cellSet.size === 0) {
          this.grid.delete(cellKey);
        }
      }
    }
  }

  /**
   * Get all grid cells that overlap with rectangle
   */
  private getOverlappingCells(rect: Rectangle): string[] {
    const cells: string[] = [];

    const minCol = Math.floor(rect.x / this.cellSize);
    const maxCol = Math.floor((rect.x + rect.width) / this.cellSize);
    const minRow = Math.floor(rect.y / this.cellSize);
    const maxRow = Math.floor((rect.y + rect.height) / this.cellSize);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        cells.push(this.getCellKey(row, col));
      }
    }

    return cells;
  }

  /**
   * Get cell key for grid map
   */
  private getCellKey(row: number, col: number): string {
    return `${row},${col}`;
  }

  /**
   * Check if two rectangles intersect
   */
  private rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * Get all entities (for testing/debugging)
   */
  getAllEntities(): T[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get grid statistics (for performance monitoring)
   */
  getStats(): {
    entities: number;
    cells: number;
    averageEntitiesPerCell: number;
    maxEntitiesPerCell: number;
  } {
    const cellSizes: number[] = [];
    this.grid.forEach((cellSet) => {
      cellSizes.push(cellSet.size);
    });

    const maxEntitiesPerCell = cellSizes.length > 0 ? Math.max(...cellSizes) : 0;
    const averageEntitiesPerCell =
      cellSizes.length > 0
        ? cellSizes.reduce((sum, size) => sum + size, 0) / cellSizes.length
        : 0;

    return {
      entities: this.entities.size,
      cells: this.grid.size,
      averageEntitiesPerCell,
      maxEntitiesPerCell,
    };
  }
}
