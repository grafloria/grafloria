// DiagramModel - Root container for all diagram entities

import { DiagramEntity } from './DiagramEntity';
import { NodeModel, SerializedNode } from './NodeModel';
import { LinkModel, SerializedLink } from './LinkModel';
import { GroupModel, SerializedGroup } from './GroupModel'; // Phase 1.6c
import type { SerializedEntity, Point } from '../types';
import { SpatialIndex } from '../performance/SpatialIndex'; // Phase 5.1
import type { Rectangle } from '../types/geometry.types'; // Phase 5.1
import type { LODLevel, EntityWithLOD } from '../types/performance.types'; // Phase 5.3
import { LayoutManager } from '../layout/LayoutManager'; // Layout system
import type { LayoutAlgorithmType, LayoutConfiguration } from '../layout/types';

export interface SerializedDiagram extends SerializedEntity {
  name: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: SerializedGroup[]; // Phase 1.6c
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export class DiagramModel extends DiagramEntity {
  name: string = 'Untitled Diagram';
  nodes: Map<string, NodeModel> = new Map();
  links: Map<string, LinkModel> = new Map();
  groups: Map<string, GroupModel> = new Map(); // Phase 1.6c

  viewport = {
    x: 0,
    y: 0,
    zoom: 1,
  };

  // Phase 5.1: Spatial indexing for viewport virtualization
  private nodeSpatialIndex: SpatialIndex<NodeModel>;
  private linkSpatialIndex: SpatialIndex<LinkModel>;

  // Layout system
  private _layoutManager: LayoutManager;
  private _autoLayoutEnabled: boolean = false;

  constructor(name?: string) {
    super();
    if (name) this.name = name;

    // Initialize layout manager
    this._layoutManager = new LayoutManager(this, 'grid');

    // Phase 5.1: Initialize spatial indices
    this.nodeSpatialIndex = new SpatialIndex<NodeModel>({
      cellSize: 100,
      getBounds: (node) => {
        // Get bounds considering rotation and scale
        const bounds = node.getBoundingBox();
        return {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        };
      },
    });

    this.linkSpatialIndex = new SpatialIndex<LinkModel>({
      cellSize: 100,
      getBounds: (link) => {
        // Calculate bounding box from points
        if (link.points.length === 0) {
          return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const point of link.points) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      },
    });
  }

  /**
   * Add node to diagram
   */
  addNode(node: NodeModel): void {
    this.assertNotDisposed(); // Phase 5.4

    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id ${node.id} already exists`);
    }

    // Set diagram reference (Phase 1.6a)
    node.diagram = this;

    this.nodes.set(node.id, node);
    this.trackChange('nodes', null, node);
    this.emitter.emit('node:added', node);

    // Phase 5.1: Add to spatial index and listen for spatial changes
    // Do this AFTER trackChange to avoid cloning issues
    this.nodeSpatialIndex.add(node);
    const updateSpatialIndex = () => this.nodeSpatialIndex.update(node);
    node.on('change:position', updateSpatialIndex);
    node.on('change:size', updateSpatialIndex);
    node.on('change:rotation', updateSpatialIndex);
    node.on('change:scale', updateSpatialIndex);
  }

  /**
   * Remove node from diagram
   */
  removeNode(nodeId: string): NodeModel | undefined {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);

      // Phase 5.1: Remove from spatial index
      this.nodeSpatialIndex.remove(nodeId);

      this.trackChange('nodes', node, null);
      this.emitter.emit('node:removed', node);
    }
    return node;
  }

  /**
   * Restore node from serialized data (Phase 1.8)
   */
  restoreNode(data: any): NodeModel | undefined {
    try {
      const node = NodeModel.fromJSON(data);
      node.diagram = this;
      this.nodes.set(node.id, node);
      this.trackChange('nodes', null, node);
      this.emitter.emit('node:added', node);

      // Phase 5.1: Add to spatial index and listen - AFTER trackChange
      this.nodeSpatialIndex.add(node);
      const updateSpatialIndex = () => this.nodeSpatialIndex.update(node);
      node.on('change:position', updateSpatialIndex);
      node.on('change:size', updateSpatialIndex);
      node.on('change:rotation', updateSpatialIndex);
      node.on('change:scale', updateSpatialIndex);

      return node;
    } catch (error) {
      console.error('Failed to restore node:', error);
      return undefined;
    }
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): NodeModel | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getNodes(): NodeModel[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Clear all nodes
   */
  clearNodes(): void {
    this.nodes.clear();
    this.emitter.emit('nodes:cleared');
  }

  /**
   * Add link to diagram
   */
  addLink(link: LinkModel): void {
    this.assertNotDisposed(); // Phase 5.4

    if (this.links.has(link.id)) {
      throw new Error(`Link with id ${link.id} already exists`);
    }

    this.links.set(link.id, link);
    this.trackChange('links', null, link);
    this.emitter.emit('link:added', link);

    // Phase 5.1: Add to spatial index and listen - AFTER trackChange
    this.linkSpatialIndex.add(link);
    link.on('change:points', () => this.linkSpatialIndex.update(link));
  }

  /**
   * Remove link from diagram
   */
  removeLink(linkId: string): LinkModel | undefined {
    const link = this.links.get(linkId);
    if (link) {
      this.links.delete(linkId);

      // Phase 5.1: Remove from spatial index
      this.linkSpatialIndex.remove(linkId);

      this.trackChange('links', link, null);
      this.emitter.emit('link:removed', link);
    }
    return link;
  }

  /**
   * Restore link from serialized data (Phase 1.8)
   */
  restoreLink(data: any): LinkModel | undefined {
    try {
      const link = LinkModel.fromJSON(data);
      this.links.set(link.id, link);
      this.trackChange('links', null, link);
      this.emitter.emit('link:added', link);

      // Phase 5.1: Add to spatial index and listen - AFTER trackChange
      this.linkSpatialIndex.add(link);
      link.on('change:points', () => this.linkSpatialIndex.update(link));

      return link;
    } catch (error) {
      console.error('Failed to restore link:', error);
      return undefined;
    }
  }

  /**
   * Get link by ID
   */
  getLink(linkId: string): LinkModel | undefined {
    return this.links.get(linkId);
  }

  /**
   * Get all links
   */
  getLinks(): LinkModel[] {
    return Array.from(this.links.values());
  }

  /**
   * Clear all links
   */
  clearLinks(): void {
    this.links.clear();
    this.emitter.emit('links:cleared');
  }

  /**
   * Add group (Phase 1.6c)
   */
  addGroup(group: GroupModel): void {
    this.assertNotDisposed(); // Phase 5.4

    if (this.groups.has(group.id)) {
      throw new Error(`Group with id ${group.id} already exists`);
    }

    this.groups.set(group.id, group);
    this.trackChange('groups', null, group);
    this.emitter.emit('group:added', group);
  }

  /**
   * Remove group (Phase 1.6c)
   */
  removeGroup(groupId: string): GroupModel | undefined {
    const group = this.groups.get(groupId);
    if (group) {
      this.groups.delete(groupId);
      this.trackChange('groups', group, null);
      this.emitter.emit('group:removed', group);
    }
    return group;
  }

  /**
   * Restore group from serialized data (Phase 1.8)
   */
  restoreGroup(data: any): GroupModel | undefined {
    try {
      const group = GroupModel.fromJSON(data);
      this.groups.set(group.id, group);
      this.trackChange('groups', null, group);
      this.emitter.emit('group:added', group);
      return group;
    } catch (error) {
      console.error('Failed to restore group:', error);
      return undefined;
    }
  }

  /**
   * Get group by ID (Phase 1.6c)
   */
  getGroup(groupId: string): GroupModel | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get all groups (Phase 1.6c)
   */
  getGroups(): GroupModel[] {
    return Array.from(this.groups.values());
  }

  /**
   * Clear all groups (Phase 1.6c)
   */
  clearGroups(): void {
    this.groups.clear();
    this.emitter.emit('groups:cleared');
  }

  /**
   * Set viewport
   */
  setViewport(x: number, y: number, zoom: number): void {
    const oldViewport = { ...this.viewport };
    this.viewport = { x, y, zoom };
    this.trackChange('viewport', oldViewport, this.viewport);
    this.emitter.emit('viewport:changed', this.viewport);
  }

  /**
   * Pan viewport
   */
  pan(dx: number, dy: number): void {
    this.setViewport(this.viewport.x + dx, this.viewport.y + dy, this.viewport.zoom);
  }

  /**
   * Zoom viewport
   */
  zoom(delta: number, center?: Point): void {
    const newZoom = Math.max(0.1, Math.min(10, this.viewport.zoom + delta));
    this.setViewport(this.viewport.x, this.viewport.y, newZoom);
  }

  /**
   * Clear all nodes, links, and groups (Phase 1.6c)
   */
  clear(): void {
    // Remove all links first
    const linkIds = Array.from(this.links.keys());
    for (const linkId of linkIds) {
      this.removeLink(linkId);
    }

    // Remove all nodes
    const nodeIds = Array.from(this.nodes.keys());
    for (const nodeId of nodeIds) {
      this.removeNode(nodeId);
    }

    // Remove all groups (Phase 1.6c)
    const groupIds = Array.from(this.groups.keys());
    for (const groupId of groupIds) {
      this.removeGroup(groupId);
    }

    // Phase 5.1: Clear spatial indices
    this.nodeSpatialIndex.clear();
    this.linkSpatialIndex.clear();

    this.emitter.emit('diagram:cleared');
  }

  /**
   * Get nodes visible in viewport (Phase 5.1)
   * This enables viewport virtualization - only render visible nodes
   *
   * @param viewport - Rectangular viewport region in world coordinates
   * @returns Array of nodes that intersect with the viewport
   *
   * @example
   * ```typescript
   * const viewport = {
   *   x: camera.x,
   *   y: camera.y,
   *   width: canvas.width / camera.zoom,
   *   height: canvas.height / camera.zoom,
   * };
   * const visibleNodes = diagram.getVisibleNodes(viewport);
   * // Only render visibleNodes instead of all nodes
   * ```
   */
  getVisibleNodes(viewport: Rectangle): NodeModel[] {
    return this.nodeSpatialIndex.queryRegion(viewport, {
      filter: (node) => node.state.visible !== false,
    });
  }

  /**
   * Get links visible in viewport (Phase 5.1)
   * This enables viewport virtualization - only render visible links
   *
   * @param viewport - Rectangular viewport region in world coordinates
   * @returns Array of links that intersect with the viewport
   */
  getVisibleLinks(viewport: Rectangle): LinkModel[] {
    return this.linkSpatialIndex.queryRegion(viewport);
  }

  /**
   * Get bounding box of all visible entities (Phase 5.1)
   * Useful for "fit to viewport" operations
   *
   * @param viewport - Rectangular viewport region
   * @returns Bounding rectangle of visible entities, or null if none visible
   */
  getVisibleBounds(viewport: Rectangle): Rectangle | null {
    const visibleNodes = this.getVisibleNodes(viewport);
    const visibleLinks = this.getVisibleLinks(viewport);

    if (visibleNodes.length === 0 && visibleLinks.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Include visible nodes
    for (const node of visibleNodes) {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    }

    // Include visible links
    for (const link of visibleLinks) {
      for (const point of link.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Get all dirty nodes (Phase 5.2)
   * Returns nodes that need re-rendering
   */
  getDirtyNodes(): NodeModel[] {
    return this.getNodes().filter((node) => node.isDirty);
  }

  /**
   * Get all dirty links (Phase 5.2)
   * Returns links that need re-rendering
   */
  getDirtyLinks(): LinkModel[] {
    return this.getLinks().filter((link) => link.isDirty);
  }

  /**
   * Get all dirty groups (Phase 5.2)
   * Returns groups that need re-rendering
   */
  getDirtyGroups(): GroupModel[] {
    return this.getGroups().filter((group) => group.isDirty);
  }

  /**
   * Mark all entities as clean (Phase 5.2)
   * Call this after rendering to reset dirty flags
   */
  markAllClean(): void {
    // Mark all nodes clean
    for (const node of this.nodes.values()) {
      node.markClean();
    }

    // Mark all links clean
    for (const link of this.links.values()) {
      link.markClean();
    }

    // Mark all groups clean
    for (const group of this.groups.values()) {
      group.markClean();
    }

    // Emit event
    this.emitter.emit('dirty:cleared');
  }

  /**
   * Get total count of dirty entities (Phase 5.2)
   * Useful for monitoring render performance
   */
  getDirtyCount(): number {
    let count = 0;

    for (const node of this.nodes.values()) {
      if (node.isDirty) count++;
    }

    for (const link of this.links.values()) {
      if (link.isDirty) count++;
    }

    for (const group of this.groups.values()) {
      if (group.isDirty) count++;
    }

    return count;
  }

  /**
   * Get visible dirty nodes (Phase 5.2)
   * Combines viewport virtualization with dirty marking
   * Only returns nodes that are both visible AND need re-rendering
   *
   * @param viewport - Rectangular viewport region
   * @returns Array of nodes that are visible and dirty
   *
   * @example
   * ```typescript
   * const viewport = { x: 0, y: 0, width: 800, height: 600 };
   * const dirtyVisible = diagram.getVisibleDirtyNodes(viewport);
   * // Only re-render these nodes - maximum efficiency!
   * ```
   */
  getVisibleDirtyNodes(viewport: Rectangle): NodeModel[] {
    return this.getVisibleNodes(viewport).filter((node) => node.isDirty);
  }

  /**
   * Get visible dirty links (Phase 5.2)
   * Combines viewport virtualization with dirty marking
   * Only returns links that are both visible AND need re-rendering
   *
   * @param viewport - Rectangular viewport region
   * @returns Array of links that are visible and dirty
   */
  getVisibleDirtyLinks(viewport: Rectangle): LinkModel[] {
    return this.getVisibleLinks(viewport).filter((link) => link.isDirty);
  }

  /**
   * Get LOD level based on zoom (Phase 5.3)
   *
   * @param zoom - Current zoom level
   * @returns LOD level (high/medium/low)
   *
   * NOTE: Threshold lowered from 0.5 to 0.2 for better label visibility in demos
   */
  getLODLevel(zoom: number): LODLevel {
    if (zoom > 1.0) {
      return 'high';
    } else if (zoom > 0.2) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get visible nodes with LOD information (Phase 5.3)
   * Combines viewport virtualization with Level of Detail
   *
   * @param viewport - Rectangular viewport region
   * @param zoom - Current zoom level
   * @returns Array of nodes with LOD level
   */
  getNodesWithLOD(viewport: Rectangle, zoom: number): EntityWithLOD<NodeModel>[] {
    const lod = this.getLODLevel(zoom);
    const visibleNodes = this.getVisibleNodes(viewport);

    return visibleNodes.map((node) => ({
      entity: node,
      lod,
    }));
  }

  /**
   * Get visible links with LOD information (Phase 5.3)
   * Combines viewport virtualization with Level of Detail
   *
   * @param viewport - Rectangular viewport region
   * @param zoom - Current zoom level
   * @returns Array of links with LOD level
   */
  getLinksWithLOD(viewport: Rectangle, zoom: number): EntityWithLOD<LinkModel>[] {
    const lod = this.getLODLevel(zoom);
    const visibleLinks = this.getVisibleLinks(viewport);

    return visibleLinks.map((link) => ({
      entity: link,
      lod,
    }));
  }

  /**
   * Check if labels should be rendered at this LOD level (Phase 5.3)
   */
  shouldRenderLabels(lod: LODLevel): boolean {
    return lod === 'high' || lod === 'medium';
  }

  /**
   * Check if icons should be rendered at this LOD level (Phase 5.3)
   */
  shouldRenderIcons(lod: LODLevel): boolean {
    return lod === 'high';
  }

  /**
   * Check if borders should be rendered at this LOD level (Phase 5.3)
   */
  shouldRenderBorders(lod: LODLevel): boolean {
    return lod === 'high' || lod === 'medium';
  }

  /**
   * Check if shadows should be rendered at this LOD level (Phase 5.3)
   */
  shouldRenderShadows(lod: LODLevel): boolean {
    return lod === 'high';
  }

  // =============================================================================
  // Layout Management API
  // =============================================================================

  /**
   * Get the layout manager for this diagram
   */
  getLayoutManager(): LayoutManager {
    return this._layoutManager;
  }

  /**
   * Set layout algorithm
   * @param type - Algorithm type ('grid', 'force-directed', 'hierarchical', 'hybrid')
   * @param config - Optional configuration
   */
  setLayoutAlgorithm(type: LayoutAlgorithmType, config?: LayoutConfiguration): void {
    this._layoutManager.setAlgorithm(type, config);
  }

  /**
   * Get current layout algorithm type
   */
  getLayoutAlgorithm(): LayoutAlgorithmType {
    return this._layoutManager.getCurrentAlgorithmType();
  }

  /**
   * Configure current layout algorithm
   */
  configureLayout(config: LayoutConfiguration): void {
    this._layoutManager.configure(config);
  }

  /**
   * Get layout configuration
   */
  getLayoutConfiguration(): LayoutConfiguration {
    return this._layoutManager.getConfiguration();
  }

  /**
   * Enable or disable automatic layout for new nodes
   * When enabled, newly added nodes will be automatically positioned using the current layout algorithm
   */
  setAutoLayout(enabled: boolean): void {
    this._autoLayoutEnabled = enabled;
  }

  /**
   * Check if auto-layout is enabled
   */
  isAutoLayoutEnabled(): boolean {
    return this._autoLayoutEnabled;
  }

  /**
   * Re-layout all nodes using current algorithm
   * This will recalculate positions for all nodes in the diagram
   */
  async reLayout(config?: LayoutConfiguration): Promise<void> {
    return this._layoutManager.reLayout(config);
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedDiagram {
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'diagram',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      name: this.name,
      nodes: Array.from(this.nodes.values()).map((n) => n.serialize()),
      links: Array.from(this.links.values()).map((l) => l.serialize()),
      groups: Array.from(this.groups.values()).map((g) => g.serialize()), // Phase 1.6c
      viewport: { ...this.viewport },
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedDiagram): DiagramModel {
    const diagram = new DiagramModel(data.name);

    diagram.viewport = data.viewport;

    // Restore nodes
    for (const nodeData of data.nodes) {
      const node = NodeModel.fromJSON(nodeData);
      diagram.nodes.set(node.id, node);
    }

    // Restore links
    for (const linkData of data.links) {
      const link = LinkModel.fromJSON(linkData);
      diagram.links.set(link.id, link);
    }

    // Restore groups (Phase 1.6c)
    if (data.groups) {
      for (const groupData of data.groups) {
        const group = GroupModel.fromJSON(groupData);
        diagram.groups.set(group.id, group);
      }
    }

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      diagram.metadata.set(key, value);
    }

    return diagram;
  }

  /**
   * Dispose diagram and all child entities (Phase 5.4)
   * Prevents memory leaks by:
   * - Disposing all nodes, links, and groups
   * - Breaking circular references
   * - Clearing spatial indices
   * - Calling parent dispose()
   */
  override dispose(): void {
    this.assertNotDisposed();

    // Dispose all child entities first (children before parent)
    // This ensures proper cleanup order and prevents orphaned listeners

    // Dispose all nodes
    for (const node of this.nodes.values()) {
      // Break circular reference before disposal
      node.diagram = undefined;
      node.dispose();
    }

    // Dispose all links
    for (const link of this.links.values()) {
      link.dispose();
    }

    // Dispose all groups
    for (const group of this.groups.values()) {
      group.dispose();
    }

    // Clear collections
    this.nodes.clear();
    this.links.clear();
    this.groups.clear();

    // Clear spatial indices (prevents memory leaks from indexed entities)
    this.nodeSpatialIndex.clear();
    this.linkSpatialIndex.clear();

    // Dispose layout manager
    this._layoutManager.dispose();

    // Call parent dispose (removes listeners, clears metadata, etc.)
    super.dispose();
  }
}
