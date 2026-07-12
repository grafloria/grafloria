// GroupModel - Entity for organizing nodes into groups (Phase 1.6c)
// Layout configuration storage added in Phase 1.7

import { DiagramEntity } from './DiagramEntity';
import type { DiagramModel } from './DiagramModel';
import type { NodeModel } from './NodeModel';
import type { SerializedEntity } from '../types';
import type {
  LayoutType,
  LayoutConfig,
  FlexboxLayoutConfig,
  GridLayoutConfig,
} from '../types/layout.types';

export interface SerializedGroup extends SerializedEntity {
  name: string;
  members: string[];
  isCollapsed: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  layoutType?: LayoutType; // Phase 1.7
  layoutConfig?: LayoutConfig; // Phase 1.7
  position?: { x: number; y: number }; // group geometry
  size?: { width: number; height: number; depth: number }; // group geometry
}

export class GroupModel extends DiagramEntity {
  name: string;
  members: Set<string> = new Set();
  isCollapsed: boolean = false;
  bounds?: { x: number; y: number; width: number; height: number };

  // Phase 1.7: Layout configuration storage
  layoutType: LayoutType = 'none';
  layoutConfig?: LayoutConfig;

  // Position and size for layout calculations
  position: { x: number; y: number } = { x: 0, y: 0 };
  size?: { width: number; height: number; depth: number };

  constructor(config: { id?: string; name: string }) {
    super(config.id);
    this.name = config.name;
  }

  /**
   * Add member to group
   */
  addMember(entityId: string): void {
    if (!this.members.has(entityId)) {
      this.members.add(entityId);
      this.trackChange('members', null, entityId);
      this.emitter.emit('member:added', entityId);

      // Auto-apply layout if enabled
      if (this.getMetadata('autoLayout') === true) {
        this.applyLayout();
      }
    }
  }

  /**
   * Remove member from group
   */
  removeMember(entityId: string): boolean {
    if (this.members.has(entityId)) {
      this.members.delete(entityId);
      this.trackChange('members', entityId, null);
      this.emitter.emit('member:removed', entityId);
      return true;
    }
    return false;
  }

  /**
   * Expand the group
   */
  expand(): void {
    if (this.isCollapsed) {
      this.isCollapsed = false;
      this.trackChange('isCollapsed', true, false);
      this.emitter.emit('expanded');
    }
  }

  /**
   * Collapse the group
   */
  collapse(): void {
    if (!this.isCollapsed) {
      this.isCollapsed = true;
      this.trackChange('isCollapsed', false, true);
      this.emitter.emit('collapsed');
    }
  }

  /**
   * Set layout configuration (Phase 1.7)
   * @param type - Layout type ('flexbox' or 'grid')
   * @param config - Layout configuration object
   */
  setLayout(type: 'flexbox', config: FlexboxLayoutConfig): void;
  setLayout(type: 'grid', config: GridLayoutConfig): void;
  setLayout(type: 'flexbox' | 'grid', config: LayoutConfig): void {
    const oldType = this.layoutType;
    const oldConfig = this.layoutConfig;

    this.layoutType = type;
    this.layoutConfig = config;
    this.version++;

    this.trackChange('layoutType', oldType, type);
    this.trackChange('layoutConfig', oldConfig, config);
    this.emitter.emit('layout:changed', { type, config });
  }

  /**
   * Clear layout configuration (Phase 1.7)
   */
  clearLayout(): void {
    const oldType = this.layoutType;
    const oldConfig = this.layoutConfig;

    this.layoutType = 'none';
    this.layoutConfig = undefined;
    this.version++;

    this.trackChange('layoutType', oldType, 'none');
    this.trackChange('layoutConfig', oldConfig, undefined);
    this.emitter.emit('layout:cleared');
  }

  /**
   * Get layout configuration (Phase 1.7)
   */
  getLayout(): { type: LayoutType; config?: LayoutConfig } {
    return {
      type: this.layoutType,
      config: this.layoutConfig,
    };
  }

  /**
   * Check if group has layout configured (Phase 1.7)
   */
  hasLayout(): boolean {
    return this.layoutType !== 'none' && this.layoutConfig !== undefined;
  }

  /**
   * Get layout as flexbox config (Phase 1.7)
   * @throws Error if layout is not flexbox
   */
  getFlexboxLayout(): FlexboxLayoutConfig {
    if (this.layoutType !== 'flexbox') {
      throw new Error(`Group ${this.id} does not have flexbox layout`);
    }
    return this.layoutConfig as FlexboxLayoutConfig;
  }

  /**
   * Get layout as grid config (Phase 1.7)
   * @throws Error if layout is not grid
   */
  getGridLayout(): GridLayoutConfig {
    if (this.layoutType !== 'grid') {
      throw new Error(`Group ${this.id} does not have grid layout`);
    }
    return this.layoutConfig as GridLayoutConfig;
  }

  /**
   * Calculate bounds from member nodes using global bounds
   */
  calculateBounds(diagram: DiagramModel): void {
    const nodes = Array.from(this.members)
      .map(id => diagram.getNode(id))
      .filter(n => n !== undefined) as NodeModel[];

    if (nodes.length === 0) {
      this.bounds = undefined;
      return;
    }

    // Use global bounds (accounts for transforms)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const bounds = node.getGlobalBounds();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    }

    this.bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Apply layout to member nodes (Phase 1.7+)
   * Positions child nodes based on flex or grid layout configuration
   */
  applyLayout(diagram?: DiagramModel): void {
    if (!this.hasLayout()) {
      return;
    }

    // Get diagram from metadata if not provided
    const diagramToUse = diagram || (this.metadata.get('diagram') as DiagramModel);
    if (!diagramToUse) {
      console.warn(`Cannot apply layout to group ${this.id}: diagram not available`);
      return;
    }

    // Get member entities (nodes and groups)
    const entities: Array<NodeModel | GroupModel> = [];
    for (const id of this.members) {
      const node = diagramToUse.getNode(id);
      if (node) {
        entities.push(node);
      } else {
        const group = diagramToUse.getGroup(id);
        if (group) {
          entities.push(group);
        }
      }
    }

    if (entities.length === 0) {
      return;
    }

    // Apply layout based on type
    if (this.layoutType === 'flexbox') {
      this.applyFlexboxLayout(entities);
    } else if (this.layoutType === 'grid') {
      this.applyGridLayout(entities);
    }
  }

  /**
   * Apply flexbox layout to entities (nodes or groups)
   */
  private applyFlexboxLayout(entities: Array<NodeModel | GroupModel>): void {
    const config = this.getFlexboxLayout();

    // Get padding values
    const padding = this.normalizePadding(config.padding);

    // Calculate starting position
    let currentX = this.position.x + padding.left;
    let currentY = this.position.y + padding.top;

    // Get gap value
    const gap = typeof config.gap === 'number' ? config.gap : config.gap.row;

    if (config.direction === 'column' || config.direction === 'column-reverse') {
      // Vertical stacking
      const orderedEntities = config.direction === 'column-reverse' ? entities.slice().reverse() : entities;

      for (const entity of orderedEntities) {
        if ('setPosition' in entity && typeof entity.setPosition === 'function') {
          entity.setPosition(currentX, currentY);
        } else {
          // GroupModel
          entity.position = { x: currentX, y: currentY };
        }
        const entityHeight = entity.size?.height || 50;
        currentY += entityHeight + gap;
      }
    } else {
      // Horizontal stacking (row or row-reverse)
      const orderedEntities = config.direction === 'row-reverse' ? entities.slice().reverse() : entities;

      // Check if using column-based layout (like Bootstrap grid)
      const useColumnLayout = config.columns !== undefined && config.columns > 0 && this.size;

      if (useColumnLayout && this.size) {
        // Column-based layout (e.g., 12-column grid)
        this.applyColumnBasedLayout(orderedEntities, config, padding, currentX, currentY);
      } else {
        // Standard flexbox layout
        // Handle justifyContent for horizontal centering
        if (config.justifyContent === 'center' && this.size) {
          const totalWidth = this.calculateTotalWidth(orderedEntities, gap);
          currentX = this.position.x + (this.size.width - totalWidth) / 2;
        }

        for (const entity of orderedEntities) {
          // Handle alignItems for vertical centering
          let entityY = currentY;
          if (config.alignItems === 'center' && this.size) {
            const entityHeight = entity.size?.height || 50;
            entityY = this.position.y + (this.size.height - entityHeight) / 2;
          }

          if ('setPosition' in entity && typeof entity.setPosition === 'function') {
            entity.setPosition(currentX, entityY);
          } else {
            // GroupModel
            entity.position = { x: currentX, y: entityY };
          }
          const entityWidth = entity.size?.width || 100;
          currentX += entityWidth + gap;
        }
      }
    }
  }

  /**
   * Apply column-based layout (like Bootstrap 12-column grid)
   */
  private applyColumnBasedLayout(
    entities: Array<NodeModel | GroupModel>,
    config: FlexboxLayoutConfig,
    padding: { top: number; right: number; bottom: number; left: number },
    startX: number,
    startY: number
  ): void {
    if (!this.size || !config.columns) return;

    const totalColumns = config.columns;
    const gap = typeof config.gap === 'number' ? config.gap : config.gap.column || 0;

    // Available width for content (excluding padding)
    const availableWidth = this.size.width - padding.left - padding.right;

    // Calculate column width (including gaps)
    const totalGaps = (totalColumns - 1) * gap;
    const columnWidth = (availableWidth - totalGaps) / totalColumns;

    let currentX = startX;
    let currentY = startY;
    let currentColumn = 0;
    let currentRowHeight = 0; // Track max height in current row
    const rowEntities: Array<NodeModel | GroupModel> = []; // Track entities in current row

    for (const entity of entities) {
      // Get column span from metadata (default = 1)
      const columnSpan = entity.getMetadata('columnSpan') as number || 1;
      const clampedSpan = Math.min(columnSpan, totalColumns);

      // Check if entity fits in current row
      if (currentColumn + clampedSpan > totalColumns) {
        // Move to next row
        currentColumn = 0;
        currentX = startX;
        currentY += currentRowHeight + gap;
        currentRowHeight = 0;
        rowEntities.length = 0; // Clear row entities
      }

      // Calculate entity width based on column span
      const entityWidth = columnWidth * clampedSpan + gap * (clampedSpan - 1);

      // Update entity size to match column width
      if (entity.size) {
        entity.size.width = entityWidth;
      }

      // Position entity
      if ('setPosition' in entity && typeof entity.setPosition === 'function') {
        entity.setPosition(currentX, currentY);
      } else {
        // GroupModel
        entity.position = { x: currentX, y: currentY };
      }

      // Track row height (max height in this row)
      const entityHeight = entity.size?.height || 100;
      currentRowHeight = Math.max(currentRowHeight, entityHeight);
      rowEntities.push(entity);

      // Move to next column position
      currentX += entityWidth + gap;
      currentColumn += clampedSpan;
    }
  }

  /**
   * Apply grid layout to entities (nodes or groups)
   */
  private applyGridLayout(entities: Array<NodeModel | GroupModel>): void {
    const config = this.getGridLayout();

    // Parse template columns to get column count
    const columns = this.parseGridColumns(config.templateColumns);

    // Get gaps
    const columnGap = config.columnGap || 0;
    const rowGap = config.rowGap || 0;

    // Get padding
    const padding = this.normalizePadding(config.padding);

    // Starting position
    const startX = this.position.x + padding.left;
    const startY = this.position.y + padding.top;

    // Position entities in grid
    entities.forEach((entity, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;

      const entityWidth = entity.size?.width || 100;
      const entityHeight = entity.size?.height || 100;

      const x = startX + col * (entityWidth + columnGap);
      const y = startY + row * (entityHeight + rowGap);

      if ('setPosition' in entity && typeof entity.setPosition === 'function') {
        entity.setPosition(x, y);
      } else {
        // GroupModel
        entity.position = { x, y };
      }
    });
  }

  /**
   * Normalize padding to all four sides
   */
  private normalizePadding(
    padding: number | { top: number; right: number; bottom: number; left: number } | undefined
  ): { top: number; right: number; bottom: number; left: number } {
    if (padding === undefined) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    if (typeof padding === 'number') {
      return { top: padding, right: padding, bottom: padding, left: padding };
    }
    return padding;
  }

  /**
   * Calculate total width of entities for centering
   */
  private calculateTotalWidth(entities: Array<NodeModel | GroupModel>, gap: number): number {
    let total = 0;
    for (let i = 0; i < entities.length; i++) {
      total += entities[i].size?.width || 100;
      if (i < entities.length - 1) {
        total += gap;
      }
    }
    return total;
  }

  /**
   * Parse grid template columns to get column count
   */
  private parseGridColumns(templateColumns: string): number {
    // Simple parser - count space-separated values
    // Example: "1fr 1fr 1fr" = 3 columns, "repeat(3, 1fr)" = 3 columns
    const repeatMatch = templateColumns.match(/repeat\((\d+),/);
    if (repeatMatch) {
      return parseInt(repeatMatch[1], 10);
    }
    return templateColumns.split(' ').length;
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedGroup {
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'group',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      name: this.name,
      members: Array.from(this.members),
      isCollapsed: this.isCollapsed,
      bounds: this.bounds,
      layoutType: this.layoutType, // Phase 1.7
      layoutConfig: this.layoutConfig, // Phase 1.7
      // Group geometry: round-trip position (always present) and size (optional)
      // so layout/placement survives save/load.
      position: { x: this.position.x, y: this.position.y },
      size: this.size
        ? { width: this.size.width, height: this.size.height, depth: this.size.depth }
        : undefined,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedGroup): GroupModel {
    const group = new GroupModel({ id: data.id, name: data.name });
    group.members = new Set(data.members);
    group.isCollapsed = data.isCollapsed;
    group.bounds = data.bounds;

    // Restore group geometry (position/size). Position defaults to origin when
    // absent so older serialized payloads keep working.
    if (data.position) {
      group.position = { x: data.position.x, y: data.position.y };
    }
    if (data.size) {
      group.size = {
        width: data.size.width,
        height: data.size.height,
        depth: data.size.depth,
      };
    }

    // Phase 1.7: Restore layout configuration
    if (data.layoutType) {
      group.layoutType = data.layoutType;
    }
    if (data.layoutConfig) {
      group.layoutConfig = data.layoutConfig;
    }

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      group.metadata.set(key, value);
    }

    return group;
  }
}
