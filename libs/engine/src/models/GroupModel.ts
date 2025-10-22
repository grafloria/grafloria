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
}

export class GroupModel extends DiagramEntity {
  name: string;
  members: Set<string> = new Set();
  isCollapsed: boolean = false;
  bounds?: { x: number; y: number; width: number; height: number };

  // Phase 1.7: Layout configuration storage
  layoutType: LayoutType = 'none';
  layoutConfig?: LayoutConfig;

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
