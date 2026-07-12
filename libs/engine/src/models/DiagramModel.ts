// DiagramModel - Root container for all diagram entities

import { DiagramEntity } from './DiagramEntity';
import { NodeModel, SerializedNode } from './NodeModel';
import { LinkModel, SerializedLink } from './LinkModel';
import type { PortModel } from './PortModel';
import { GroupModel, SerializedGroup } from './GroupModel'; // Phase 1.6c
import type { SerializedEntity, Point } from '../types';
import { SpatialIndex } from '../performance/SpatialIndex'; // Phase 5.1
import type { Rectangle } from '../types/geometry.types'; // Phase 5.1
import type { LODLevel, EntityWithLOD } from '../types/performance.types'; // Phase 5.3
import { LayoutManager } from '../layout/LayoutManager'; // Layout system
import type { LayoutAlgorithmType, LayoutConfiguration } from '../layout/types';
import { isPointInShape } from '../utils/geometry'; // Phase 3.3

export interface SerializedDiagram extends SerializedEntity {
  name: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: SerializedGroup[]; // Phase 1.6c
  viewport: {
    x: number;
    y: number;
    width: number;   // Phase 0.5 - Viewport-aware layout
    height: number;  // Phase 0.5 - Viewport-aware layout
    zoom: number;
  };
}

export class DiagramModel extends DiagramEntity {
  name: string = 'Untitled Diagram';
  nodes: Map<string, NodeModel> = new Map();
  links: Map<string, LinkModel> = new Map();
  groups: Map<string, GroupModel> = new Map(); // Phase 1.6c

  // O(1) port -> owning node/port lookup. Maintained whenever nodes or ports
  // are added/removed so callers (renderer per-frame link resolution, routing,
  // connection validation) never linear-scan every node's ports.
  private portIndex: Map<string, { node: NodeModel; port: PortModel }> = new Map();

  viewport = {
    x: 0,
    y: 0,
    width: 1200,  // Default viewport width
    height: 800,  // Default viewport height
    zoom: 1,
  };

  // Phase 5.1: Spatial indexing for viewport virtualization
  private nodeSpatialIndex: SpatialIndex<NodeModel>;
  private linkSpatialIndex: SpatialIndex<LinkModel>;

  // Layout system
  private _layoutManager: LayoutManager;
  private _autoLayoutEnabled: boolean = false;

  // Batch update support for event queueing
  private _pendingEvents: Array<{ type: string; data?: any }> = [];

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
    this.emitOrQueue('node:added', node);

    // Maintain O(1) port -> node index (covers ports added before AND after
    // the node joins the diagram)
    this.indexNodePorts(node);

    // Phase 5.1: Add to spatial index and listen for spatial changes
    // Do this AFTER trackChange to avoid cloning issues
    this.nodeSpatialIndex.add(node);
    const updateSpatialIndex = () => this.nodeSpatialIndex.update(node);
    node.on('change:position', updateSpatialIndex);
    node.on('change:size', updateSpatialIndex);
    node.on('change:rotation', updateSpatialIndex);
    node.on('change:scale', updateSpatialIndex);

    // Phase 0.2: Forward position and size changes as diagram-level events for LiveReroutingEngine
    node.on('change:position', () => {
      this.emitOrQueue('node:moved', { nodeId: node.id, position: node.position });
    });
    node.on('change:size', () => {
      this.emitOrQueue('node:resized', { nodeId: node.id, size: node.size });
    });

    // Listen for any node changes and forward as diagram-level 'node:changed' event
    // This allows components like diagram-canvas to re-render when node properties change
    node.on('change', () => {
      this.emitOrQueue('node:changed', node);
    });
  }

  /**
   * Remove node from diagram
   */
  removeNode(nodeId: string): NodeModel | undefined {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);

      // Drop this node's ports from the O(1) port index
      this.unindexNodePorts(node);

      // Phase 5.1: Remove from spatial index
      this.nodeSpatialIndex.remove(nodeId);

      this.trackChange('nodes', node, null);
      this.emitOrQueue('node:removed', node);
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
      this.emitOrQueue('node:added', node);

      // Maintain O(1) port -> node index for restored nodes too
      this.indexNodePorts(node);

      // Phase 5.1: Add to spatial index and listen - AFTER trackChange
      this.nodeSpatialIndex.add(node);
      const updateSpatialIndex = () => this.nodeSpatialIndex.update(node);
      node.on('change:position', updateSpatialIndex);
      node.on('change:size', updateSpatialIndex);

      // Phase 0.2: Forward position and size changes as diagram-level events
      node.on('change:position', () => {
        this.emitOrQueue('node:moved', { nodeId: node.id, position: node.position });
      });
      node.on('change:size', () => {
        this.emitOrQueue('node:resized', { nodeId: node.id, size: node.size });
      });
      node.on('change:rotation', updateSpatialIndex);
      node.on('change:scale', updateSpatialIndex);

      // Listen for any node changes and forward as diagram-level 'node:changed' event
      node.on('change', () => {
        this.emitOrQueue('node:changed', node);
      });

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
   * Phase 3: Get node that owns a specific port
   * Used for connection group validation and other port-based queries.
   * O(1) via the portIndex (was an O(nodes×ports) linear scan).
   */
  getNodeByPortId(portId: string): NodeModel | undefined {
    return this.portIndex.get(portId)?.node;
  }

  /**
   * Get the port model for a port id, O(1) via the portIndex.
   * Companion to getNodeByPortId for callers that need the port itself.
   */
  getPortById(portId: string): PortModel | undefined {
    return this.portIndex.get(portId)?.port;
  }

  /**
   * Index every current port of a node and keep the index current as ports are
   * added/removed on that node. Called from addNode/restoreNode/fromJSON.
   * Listeners are guarded so a removed node can never re-pollute the index.
   */
  private indexNodePorts(node: NodeModel): void {
    for (const port of node.getPorts()) {
      this.portIndex.set(port.id, { node, port });
    }

    // Keep the index correct when ports change AFTER the node is in the diagram.
    node.on('port:added', (port: PortModel) => {
      // Ignore late additions from a node that is no longer this diagram's.
      if (this.nodes.get(node.id) === node) {
        this.portIndex.set(port.id, { node, port });
      }
    });
    node.on('port:removed', (port: PortModel) => {
      const entry = this.portIndex.get(port.id);
      if (entry && entry.node === node) {
        this.portIndex.delete(port.id);
      }
    });
  }

  /**
   * Drop a node's ports from the index (called on removeNode).
   */
  private unindexNodePorts(node: NodeModel): void {
    for (const port of node.getPorts()) {
      const entry = this.portIndex.get(port.id);
      if (entry && entry.node === node) {
        this.portIndex.delete(port.id);
      }
    }
  }

  /**
   * Clear all nodes
   */
  clearNodes(): void {
    this.nodes.clear();
    this.portIndex.clear();
    this.emitOrQueue('nodes:cleared');
  }

  /**
   * Add link to diagram
   */
  addLink(link: LinkModel): void {
    this.assertNotDisposed(); // Phase 5.4

    if (this.links.has(link.id)) {
      throw new Error(`Link with id ${link.id} already exists`);
    }

    // Cache the owning node ids (renderers resolve port sides through them —
    // without this, links built via `new LinkModel()` + addLink never resolve
    // port direction, unlike connectNodes() which sets the ids itself)
    if (!link.sourceNodeId) {
      link.sourceNodeId = this.getNodeByPortId(link.sourcePortId)?.id;
    }
    if (!link.targetNodeId) {
      link.targetNodeId = this.getNodeByPortId(link.targetPortId)?.id;
    }

    this.links.set(link.id, link);
    this.trackChange('links', null, link);
    this.emitOrQueue('link:added', link);

    // Phase 5.1: Add to spatial index and listen - AFTER trackChange
    this.linkSpatialIndex.add(link);
    link.on('change:points', () => this.linkSpatialIndex.update(link));

    // Listen for any link changes and forward as diagram-level 'link:changed' event
    link.on('change', () => {
      this.emitOrQueue('link:changed', link);
    });
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
      this.emitOrQueue('link:removed', link);
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
      this.emitOrQueue('link:added', link);

      // Phase 5.1: Add to spatial index and listen - AFTER trackChange
      this.linkSpatialIndex.add(link);
      link.on('change:points', () => this.linkSpatialIndex.update(link));

      // Listen for any link changes and forward as diagram-level 'link:changed' event
      link.on('change', () => {
        this.emitOrQueue('link:changed', link);
      });

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
   * Phase 0.2: Get all links connected to a specific port
   */
  getLinksForPort(portId: string): LinkModel[] {
    return this.getLinks().filter(link =>
      link.sourcePortId === portId || link.targetPortId === portId
    );
  }

  /**
   * Clear all links
   */
  clearLinks(): void {
    this.links.clear();
    this.emitOrQueue('links:cleared');
  }

  /**
   * Phase 0.5.3: Create a smart link with automatic port selection
   *
   * This high-level API simplifies link creation by:
   * - Automatically selecting optimal ports based on node geometry
   * - Creating the link with proper port connections
   * - Registering connections in port models
   * - Generating the initial path
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @param pathType - Path rendering type (default: 'smooth')
   * @returns The created link, or undefined if port selection failed
   *
   * @example
   * ```typescript
   * const link = diagram.createSmartLink(node1, node2, 'smooth');
   * if (link) {
   *   console.log('Connected with optimal ports!');
   * }
   * ```
   */
  createSmartLink(
    sourceNode: NodeModel,
    targetNode: NodeModel,
    pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth'
  ): LinkModel | undefined {
    // Use layout manager's intelligent port selection
    const optimalPorts = this._layoutManager.selectOptimalPorts(sourceNode, targetNode);

    if (!optimalPorts) {
      console.warn(`⚠️ Could not select optimal ports for nodes ${sourceNode.id} → ${targetNode.id}`);
      return undefined;
    }

    const { sourcePort, targetPort } = optimalPorts;

    // Validate port compatibility
    if (!sourcePort.canConnectTo(targetPort)) {
      console.warn(`⚠️ Ports are not compatible: ${sourcePort.type} → ${targetPort.type}`);
      return undefined;
    }

    // Create the link
    const link = new LinkModel(sourcePort.id, targetPort.id, pathType);
    link.sourceNodeId = sourceNode.id;
    link.targetNodeId = targetNode.id;

    // Register connections in ports
    sourcePort.addConnection(link.id);
    targetPort.addConnection(link.id);

    // Calculate initial path
    const sourceBounds = sourceNode.getBoundingBox();
    const targetBounds = targetNode.getBoundingBox();
    const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
    const targetPoint = targetPort.getAbsolutePosition(targetBounds);

    // Get port directions for orthogonal routing
    const sourceDirection = sourcePort.alignment?.side;
    const targetDirection = targetPort.alignment?.side;

    link.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);

    // Add to diagram
    this.addLink(link);

    return link;
  }

  /**
   * Phase 0.5.3: High-level API to connect two nodes
   *
   * Convenience method that creates a smart link and returns success status.
   * This is the simplest way to connect nodes.
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @param pathType - Path rendering type (default: 'smooth')
   * @returns true if connection was successful, false otherwise
   *
   * @example
   * ```typescript
   * if (diagram.connectNodes(node1, node2)) {
   *   console.log('Nodes connected successfully!');
   * }
   * ```
   */
  connectNodes(
    sourceNode: NodeModel,
    targetNode: NodeModel,
    pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth'
  ): boolean {
    const link = this.createSmartLink(sourceNode, targetNode, pathType);
    return link !== undefined;
  }

  /**
   * Phase 0.5.3: Get all connections for a node
   *
   * Returns all links where the node is either source or target.
   * Useful for querying node connectivity.
   *
   * @param node - The node to query
   * @returns Object containing incoming and outgoing links
   *
   * @example
   * ```typescript
   * const connections = diagram.getNodeConnections(node);
   * console.log(`Incoming: ${connections.incoming.length}`);
   * console.log(`Outgoing: ${connections.outgoing.length}`);
   * console.log(`Total: ${connections.all.length}`);
   * ```
   */
  getNodeConnections(node: NodeModel): {
    incoming: LinkModel[];
    outgoing: LinkModel[];
    all: LinkModel[];
  } {
    const incoming: LinkModel[] = [];
    const outgoing: LinkModel[] = [];

    // Get node's port IDs
    const portIds = new Set(node.getPorts().map((p) => p.id));

    // Check all links
    for (const link of this.links.values()) {
      const isTarget = portIds.has(link.targetPortId);
      const isSource = portIds.has(link.sourcePortId);

      if (isTarget) {
        incoming.push(link);
      }
      if (isSource) {
        outgoing.push(link);
      }
    }

    return {
      incoming,
      outgoing,
      all: [...incoming, ...outgoing],
    };
  }

  /**
   * Phase 0.5.3: Disconnect two nodes
   *
   * Removes all links between the specified nodes.
   * Handles cleanup of port connections.
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @returns Number of links removed
   *
   * @example
   * ```typescript
   * const removed = diagram.disconnectNodes(node1, node2);
   * console.log(`Removed ${removed} connections`);
   * ```
   */
  disconnectNodes(sourceNode: NodeModel, targetNode: NodeModel): number {
    const sourcePortIds = new Set(sourceNode.getPorts().map((p) => p.id));
    const targetPortIds = new Set(targetNode.getPorts().map((p) => p.id));

    const linksToRemove: string[] = [];

    // Find all links between these nodes
    for (const link of this.links.values()) {
      const hasSourcePort = sourcePortIds.has(link.sourcePortId);
      const hasTargetPort = targetPortIds.has(link.targetPortId);

      if (hasSourcePort && hasTargetPort) {
        linksToRemove.push(link.id);
      }
    }

    // Remove the links
    for (const linkId of linksToRemove) {
      const link = this.getLink(linkId);
      if (link) {
        // Clean up port connections
        const sourcePort = sourceNode.getPorts().find((p) => p.id === link.sourcePortId);
        const targetPort = targetNode.getPorts().find((p) => p.id === link.targetPortId);

        if (sourcePort) {
          sourcePort.removeConnection(link.id);
        }
        if (targetPort) {
          targetPort.removeConnection(link.id);
        }

        // Remove link from diagram
        this.removeLink(linkId);
      }
    }

    return linksToRemove.length;
  }

  /**
   * Add group (Phase 1.6c)
   */
  addGroup(group: GroupModel): void {
    this.assertNotDisposed(); // Phase 5.4

    if (this.groups.has(group.id)) {
      throw new Error(`Group with id ${group.id} already exists`);
    }

    // Store diagram reference for layout operations
    group.setMetadata('diagram', this);

    this.groups.set(group.id, group);
    this.trackChange('groups', null, group);
    this.emitOrQueue('group:added', group);
  }

  /**
   * Remove group (Phase 1.6c)
   */
  removeGroup(groupId: string): GroupModel | undefined {
    const group = this.groups.get(groupId);
    if (group) {
      this.groups.delete(groupId);
      this.trackChange('groups', group, null);
      this.emitOrQueue('group:removed', group);
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
      this.emitOrQueue('group:added', group);
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
    this.emitOrQueue('groups:cleared');
  }

  /**
   * Selection Management
   */

  /**
   * Get all selected nodes
   */
  getSelectedNodes(): NodeModel[] {
    return this.getNodes().filter((node) => node.isSelected());
  }

  /**
   * Select a single node (clears previous selection)
   * @param node - Node to select
   */
  selectNode(node: NodeModel): void {
    if (!node.isSelectable()) {
      return;
    }

    // Clear previous selection
    this.clearSelection();

    // Select the node
    node.setSelected(true);

    // Emit selection changed event
    this.emitOrQueue('selection:changed', {
      selected: [node],
      deselected: []
    });
  }

  /**
   * Add node to selection (multi-select)
   * @param node - Node to add to selection
   */
  addToSelection(node: NodeModel): void {
    if (!node.isSelectable() || node.isSelected()) {
      return;
    }

    node.setSelected(true);

    this.emitOrQueue('selection:changed', {
      selected: [node],
      deselected: []
    });
  }

  /**
   * Remove node from selection
   * @param node - Node to remove from selection
   */
  removeFromSelection(node: NodeModel): void {
    if (!node.isSelected()) {
      return;
    }

    node.setSelected(false);

    this.emitOrQueue('selection:changed', {
      selected: [],
      deselected: [node]
    });
  }

  /**
   * Toggle node selection (add if not selected, remove if selected)
   * @param node - Node to toggle
   */
  toggleNodeSelection(node: NodeModel): void {
    if (!node.isSelectable()) {
      return;
    }

    if (node.isSelected()) {
      this.removeFromSelection(node);
    } else {
      this.addToSelection(node);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    selectedNodes.forEach((node) => node.setSelected(false));

    this.emitOrQueue('selection:changed', {
      selected: [],
      deselected: selectedNodes
    });
  }

  /**
   * Select all nodes
   */
  selectAll(): void {
    const selectableNodes = this.getNodes().filter((node) => node.isSelectable());
    const previouslySelected = this.getSelectedNodes();
    const newlySelected = selectableNodes.filter((node) => !node.isSelected());

    newlySelected.forEach((node) => node.setSelected(true));

    if (newlySelected.length > 0) {
      this.emitOrQueue('selection:changed', {
        selected: newlySelected,
        deselected: []
      });
    }
  }

  /**
   * Delete all selected nodes and their connected links
   * @returns Number of nodes deleted
   */
  deleteSelected(): number {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return 0;
    }

    // Delete nodes (this will also trigger link cleanup via events)
    selectedNodes.forEach((node) => {
      this.removeNode(node.id);
    });

    return selectedNodes.length;
  }

  /**
   * Get node at position (for click detection)
   * Returns the topmost node at the given position
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Node at position, or undefined if none found
   * Phase 3.3: Uses shape-aware hit detection
   */
  getNodeAtPosition(x: number, y: number): NodeModel | undefined {
    const nodes = this.getNodes();

    // Iterate in reverse order (topmost node first)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const bounds = node.getBoundingBox();

      // Phase 3.3: Use shape-aware hit detection
      const shapeConfig = node.getMetadata('shape');
      if (isPointInShape(x, y, bounds, shapeConfig)) {
        return node;
      }
    }

    return undefined;
  }

  /**
   * Option 3: Lock/pin selected nodes
   * Locked nodes will not move during layout operations
   */
  lockSelected(): number {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return 0;
    }

    selectedNodes.forEach((node) => {
      node.setState({ locked: true });
    });

    return selectedNodes.length;
  }

  /**
   * Option 3: Unlock selected nodes
   */
  unlockSelected(): number {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return 0;
    }

    selectedNodes.forEach((node) => {
      node.setState({ locked: false });
    });

    return selectedNodes.length;
  }

  /**
   * Option 3: Get locked nodes
   */
  getLockedNodes(): NodeModel[] {
    return this.getNodes().filter((node) => node.state.locked);
  }

  /**
   * Option 3: Unlock all nodes
   */
  unlockAll(): number {
    const lockedNodes = this.getLockedNodes();
    lockedNodes.forEach((node) => {
      node.setState({ locked: false });
    });
    return lockedNodes.length;
  }

  /**
   * Set viewport (Phase 0.5 - Viewport-Aware Layout)
   */
  setViewport(x: number, y: number, width: number, height: number, zoom?: number): void {
    const oldViewport = { ...this.viewport };
    this.viewport = {
      x,
      y,
      width,
      height,
      zoom: zoom !== undefined ? zoom : this.viewport.zoom
    };
    this.trackChange('viewport', oldViewport, this.viewport);
    this.emitOrQueue('viewport:changed', this.viewport);
  }

  /**
   * Get current viewport
   */
  getViewport(): { x: number; y: number; width: number; height: number; zoom: number } {
    return { ...this.viewport };
  }

  /**
   * Pan viewport
   */
  pan(dx: number, dy: number): void {
    this.setViewport(
      this.viewport.x + dx,
      this.viewport.y + dy,
      this.viewport.width,
      this.viewport.height,
      this.viewport.zoom
    );
  }

  /**
   * Zoom viewport (relative adjustment)
   */
  zoom(delta: number, center?: Point): void {
    const newZoom = Math.max(0.1, Math.min(10, this.viewport.zoom + delta));
    this.setViewport(
      this.viewport.x,
      this.viewport.y,
      this.viewport.width,
      this.viewport.height,
      newZoom
    );
  }

  /**
   * Set absolute zoom level
   * Phase 0.5 - Option B: Pan/Zoom controls
   * @param level - Zoom level (0.1 to 10.0)
   * @param center - Optional center point for zoom (defaults to viewport center)
   */
  setZoom(level: number, center?: Point): void {
    const newZoom = Math.max(0.1, Math.min(10, level));
    this.setViewport(
      this.viewport.x,
      this.viewport.y,
      this.viewport.width,
      this.viewport.height,
      newZoom
    );
  }

  /**
   * Fit viewport to show all nodes (without changing zoom level)
   * Phase 0.5 - Option B: Pan/Zoom controls
   * @param padding - Padding around content (default 100)
   */
  fitToView(padding: number = 100): void {
    const nodes = this.getNodes();

    if (nodes.length === 0) {
      // No nodes - reset to default viewport
      this.setViewport(0, 0, 1200, 800, this.viewport.zoom);
      return;
    }

    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    });

    // Calculate content dimensions
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate viewport size to fit content with padding
    const viewportWidth = contentWidth + padding * 2;
    const viewportHeight = contentHeight + padding * 2;

    // Center the viewport on the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.setViewport(
      centerX - viewportWidth / 2,
      centerY - viewportHeight / 2,
      viewportWidth,
      viewportHeight,
      this.viewport.zoom
    );

    console.log(`📐 Fit to view: ${nodes.length} nodes, bounds=(${minX.toFixed(1)}, ${minY.toFixed(1)}) to (${maxX.toFixed(1)}, ${maxY.toFixed(1)})`);
  }

  /**
   * Fit viewport to show all nodes AND adjust zoom to fit screen
   * Phase 0.5 - Option B: Pan/Zoom controls
   * @param targetWidth - Target viewport width (e.g. screen width)
   * @param targetHeight - Target viewport height (e.g. screen height)
   * @param padding - Padding around content (default 100)
   */
  zoomToFit(targetWidth: number, targetHeight: number, padding: number = 100): void {
    const nodes = this.getNodes();

    if (nodes.length === 0) {
      // No nodes - reset to default
      this.setViewport(0, 0, targetWidth, targetHeight, 1.0);
      return;
    }

    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    });

    // Calculate content dimensions
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate zoom level to fit content in target viewport
    const availableWidth = targetWidth - padding * 2;
    const availableHeight = targetHeight - padding * 2;

    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1.0); // Don't zoom in beyond 1.0, only zoom out

    // Center the content in the target viewport
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.setViewport(
      centerX - targetWidth / 2,
      centerY - targetHeight / 2,
      targetWidth,
      targetHeight,
      Math.max(0.1, Math.min(10, newZoom))
    );

    console.log(`🔍 Zoom to fit: ${nodes.length} nodes, zoom=${newZoom.toFixed(2)}, content=${contentWidth.toFixed(1)}x${contentHeight.toFixed(1)}`);
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

    this.emitOrQueue('diagram:cleared');
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
    this.emitOrQueue('dirty:cleared');
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
    // >= so the DEFAULT zoom (1.0) gets full detail — with a strict > the
    // 'high' tier (link labels etc.) was unreachable until the user zoomed in
    if (zoom >= 1.0) {
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
   * Override: End batch update mode
   * Fires accumulated events when all batches complete
   */
  override endBatch(): void {
    // Call parent to handle dirty state
    super.endBatch();

    // When all batches complete (check parent's isBatching), fire queued events
    if (!this.isBatching() && this._pendingEvents.length > 0) {
      // Fire all queued events individually
      const events = [...this._pendingEvents];
      this._pendingEvents = [];

      for (const event of events) {
        this.emitter.emit(event.type, event.data);
      }

      // Also fire a batch:complete event for listeners that want to know
      this.emitter.emit('batch:complete', {
        eventCount: events.length,
        events: events
      });
    }
  }

  /**
   * Emit event, respecting batch mode
   * During batch mode, events are queued instead of fired immediately
   */
  private emitOrQueue(eventType: string, data?: any): void {
    const batching = this.isBatching();
    if (batching) {
      // Queue event for later
      this._pendingEvents.push({ type: eventType, data });
    } else {
      // Emit immediately
      this.emitter.emit(eventType, data);
    }
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

    // Restore viewport with backward compatibility
    diagram.viewport = {
      x: data.viewport.x,
      y: data.viewport.y,
      width: data.viewport.width || 1200,   // Default for old diagrams
      height: data.viewport.height || 800,  // Default for old diagrams
      zoom: data.viewport.zoom
    };

    // Restore nodes
    for (const nodeData of data.nodes) {
      const node = NodeModel.fromJSON(nodeData);
      diagram.nodes.set(node.id, node);
      // Keep the O(1) port index consistent for deserialized diagrams
      diagram.indexNodePorts(node);
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
    this.portIndex.clear();

    // Clear spatial indices (prevents memory leaks from indexed entities)
    this.nodeSpatialIndex.clear();
    this.linkSpatialIndex.clear();

    // Dispose layout manager
    this._layoutManager.dispose();

    // Call parent dispose (removes listeners, clears metadata, etc.)
    super.dispose();
  }
}
