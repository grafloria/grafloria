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
   * Query entities in rectangular region (viewport).
   * This is the key method for viewport virtualization.
   *
   * Cost: O(cells(region) + k), where k = entities the region touches — EXCEPT
   * that the grid walk is skipped entirely when it would be the slower half (see
   * `shouldScanLinearly`), so the true bound is O(min(cells, n) + k).
   */
  queryRegion(region: Rectangle, options?: QueryOptions<T>): T[] {
    const results: T[] = [];
    let count = 0;

    // The one job of the grid is to answer without looking at every entity. When
    // the region is big enough that walking its cells costs MORE than looking at
    // every entity, the grid has stopped being an index and is just an expensive
    // way to enumerate the scene — so don't walk it.
    //
    // wave8/culling: this is not hypothetical. A viewport at 0.25 zoom is 16x the
    // world area, and at cellSize 100 a fit-to-content view of a 10k-node diagram
    // enumerates ~37,000 cell keys (allocating a string for each) to return the
    // 10,000 entities it was always going to return. A query that returns
    // everything is not a query, and it must not cost more than the scan it
    // replaced.
    const emit = (entity: T): boolean => {
      const bounds = this.getBounds(entity);
      if (!this.rectanglesIntersect(region, bounds)) return true;
      if (options?.filter && !options.filter(entity)) return true;
      results.push(entity);
      count++;
      return !(options?.limit && count >= options.limit);
    };

    if (this.shouldScanLinearly(region)) {
      for (const entity of this.entities.values()) {
        if (!emit(entity)) break;
      }
      return results;
    }

    const cells = this.getOverlappingCells(region);
    const candidates = new Set<string>();

    // Collect all entity IDs in overlapping cells
    for (const cellKey of cells) {
      const cellEntities = this.grid.get(cellKey);
      if (cellEntities) {
        cellEntities.forEach((id) => candidates.add(id));
      }
    }

    for (const id of candidates) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      if (!emit(entity)) break;
    }

    return results;
  }

  /**
   * All entities whose bounds fall within `radius` of `point`, nearest first.
   *
   * wave8/culling — Card 2. Exists so interactive hit-testing (the nearest PORT
   * to a dragged link end, the node under the cursor) is served by the index
   * instead of a linear scan of the scene: a drag is a per-pointermove query, so
   * an O(n) answer is O(n) sixty times a second.
   *
   * Distance is measured to the entity's bounding box (0 when the point is
   * inside it), which is the right metric for "what am I pointing at" and lets
   * a big entity win over a small distant one.
   */
  queryNear(point: { x: number; y: number }, radius: number, options?: QueryOptions<T>): T[] {
    const region: Rectangle = {
      x: point.x - radius,
      y: point.y - radius,
      width: radius * 2,
      height: radius * 2,
    };

    const scored: Array<{ entity: T; d: number }> = [];
    for (const entity of this.queryRegion(region, { filter: options?.filter })) {
      const d = this.distanceToBounds(point, this.getBounds(entity));
      if (d <= radius) scored.push({ entity, d });
    }

    scored.sort((a, b) => a.d - b.d);
    const limit = options?.limit ?? scored.length;
    return scored.slice(0, limit).map((s) => s.entity);
  }

  /**
   * True when walking the region's cells would touch more cells than the index
   * holds entities — i.e. when the grid has stopped paying for itself.
   *
   * Counted, never materialised: building the key array to measure it would be
   * the very cost we are avoiding.
   */
  private shouldScanLinearly(region: Rectangle): boolean {
    const n = this.entities.size;
    if (n === 0) return true;

    const cols =
      Math.floor((region.x + region.width) / this.cellSize) -
      Math.floor(region.x / this.cellSize) +
      1;
    const rows =
      Math.floor((region.y + region.height) / this.cellSize) -
      Math.floor(region.y / this.cellSize) +
      1;

    // A degenerate/NaN region (an un-laid-out viewport) must not become a
    // multi-million-cell walk; treat it as a scan.
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return true;

    return cols * rows > n;
  }

  /** Distance from a point to a rectangle; 0 when the point is inside it. */
  private distanceToBounds(point: { x: number; y: number }, b: Rectangle): number {
    const dx = Math.max(b.x - point.x, 0, point.x - (b.x + b.width));
    const dy = Math.max(b.y - point.y, 0, point.y - (b.y + b.height));
    return Math.sqrt(dx * dx + dy * dy);
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
