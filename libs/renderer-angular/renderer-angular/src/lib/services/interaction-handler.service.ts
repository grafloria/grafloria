import { Injectable } from '@angular/core';
import type {
  DiagramEngine,
  NodeModel,
  LinkModel,
  InteractionMode,
} from '@grafloria/engine';
import { PortModel } from '@grafloria/engine';
import { WaypointEditor, ControlPointEditor } from '@grafloria/renderer';

/**
 * Phase 3: InteractionHandlerService
 *
 * Handles all mouse and keyboard interactions for the diagram canvas,
 * including port hover, connection dragging, and link reconnection.
 *
 * Supports three interaction modes:
 * - DIRECT: Drag node body to move, drag port to connect
 * - DELIBERATE: Select node first, then drag to move
 * - SMART: Visio-style with hover-based port visibility
 */
@Injectable({
  providedIn: 'root',
})
export class InteractionHandlerService {
  /**
   * Current hover state
   */
  private hoveredNode: NodeModel | null = null;
  private hoveredPort: PortModel | null = null;
  private hoveredLink: LinkModel | null = null;

  /**
   * Connection drag state
   */
  private isConnecting = false;
  private connectionSourcePort: PortModel | null = null;

  /**
   * Link reconnection state
   */
  private isReconnectingLink = false;
  private reconnectingLink: LinkModel | null = null;
  private reconnectingEndpoint: 'source' | 'target' | null = null;

  /**
   * Phase 2.3a: Waypoint editing state
   */
  private isDraggingWaypoint = false;
  private editingLink: LinkModel | null = null;
  private editingWaypointIndex: number | null = null;
  private waypointEditor: WaypointEditor | null = null;
  private hoveredWaypointIndex: number | null = null;
  private hoveredWaypointLink: LinkModel | null = null;

  /**
   * Phase 2.3b: Control point editing state
   */
  private isDraggingControlPoint = false;
  private editingControlPointLink: LinkModel | null = null;
  private editingControlPointSegmentIndex: number | null = null;
  private editingControlPointType: 'control1' | 'control2' | null = null;
  private controlPointEditor: ControlPointEditor | null = null;
  private hoveredControlPointSegmentIndex: number | null = null;
  private hoveredControlPointType: 'control1' | 'control2' | null = null;
  private hoveredControlPointLink: LinkModel | null = null;

  /**
   * Phase 5: Performance optimization - debounce hover detection
   */
  private hoverDebounceTimer: any = null;
  private readonly HOVER_DEBOUNCE_MS = 16; // ~60fps

  /**
   * Phase 5: Performance monitoring
   */
  private performanceMetrics = {
    hoverDetectionTime: 0,
    connectionUpdateTime: 0,
    portHitTestTime: 0,
  };

  /**
   * Phase 5: Port hit test cache for performance
   */
  private portHitCache = new Map<string, { x: number; y: number; radius: number }>();
  private portHitCacheInvalidated = false;

  constructor() {
    // Phase 2.3a: Initialize waypoint editor with default config
    this.waypointEditor = new WaypointEditor({
      snapToGrid: false,
      gridSize: 20,
      removeOnDoubleClick: true,
      handleRadius: 5,
      handleColor: '#3b82f6',
      handleStrokeColor: '#ffffff',
      minDistanceFromEndpoints: 30,
      clickDetectionRadius: 10,
    });

    // Phase 2.3b: Initialize control point editor with default config
    this.controlPointEditor = new ControlPointEditor({
      snapToGrid: false,
      gridSize: 20,
      handleRadius: 6,
      handleColor: '#10b981',
      handleStrokeColor: '#ffffff',
      controlLineColor: '#6b7280',
      controlLineWidth: 1,
      controlLineDash: [5, 5],
      clickDetectionRadius: 10,
      showControlLines: true,
      symmetricControls: false,
    });
  }

  /**
   * Phase 5: Dispose and cleanup resources
   */
  dispose(): void {
    if (this.hoverDebounceTimer) {
      clearTimeout(this.hoverDebounceTimer);
      this.hoverDebounceTimer = null;
    }
    this.portHitCache.clear();
    this.hoveredNode = null;
    this.hoveredPort = null;
    this.hoveredLink = null;
    this.connectionSourcePort = null;
    this.reconnectingLink = null;
    // Phase 2.3a: Clean up waypoint editing state
    this.editingLink = null;
    this.editingWaypointIndex = null;
    this.isDraggingWaypoint = false;
    this.hoveredWaypointIndex = null;
    this.hoveredWaypointLink = null;
    // Phase 2.3b: Clean up control point editing state
    this.editingControlPointLink = null;
    this.editingControlPointSegmentIndex = null;
    this.editingControlPointType = null;
    this.isDraggingControlPoint = false;
    this.hoveredControlPointSegmentIndex = null;
    this.hoveredControlPointType = null;
    this.hoveredControlPointLink = null;
  }

  /**
   * Phase 5: Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Phase 5: Invalidate port hit cache (call when nodes move or ports change)
   */
  invalidatePortHitCache(): void {
    this.portHitCacheInvalidated = true;
  }

  /**
   * Phase 3: Handle mouse move for hover detection
   * Phase 5: Enhanced with performance monitoring and validation
   * Updates hover states for nodes, ports, and links
   * CRITICAL FIX: Added comprehensive debugging
   */
  handleMouseMove(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    // Phase 5: Validate inputs
    if (!engine || !isFinite(worldX) || !isFinite(worldY)) {
      return false;
    }

    const diagram = engine.getDiagram();
    if (!diagram) return false;

    // Phase 5: Performance monitoring
    const startTime = performance.now();

    const config = engine.getInteractionConfig();
    let needsRender = false;

    // Find what's under the cursor
    const nodeAtPosition = diagram.getNodeAtPosition(worldX, worldY);
    const portAtPosition = this.findPortAtPosition(worldX, worldY, diagram, engine);
    const linkAtPosition = this.findLinkAtPosition(worldX, worldY, diagram);

    // CRITICAL FIX: Debug logging for port detection
    const debugPortDetection = false; // Disabled - working correctly now
    if (debugPortDetection && (portAtPosition || nodeAtPosition)) {
      console.log('🔍 Hover detection:', {
        worldPos: { x: worldX.toFixed(1), y: worldY.toFixed(1) },
        node: nodeAtPosition?.getMetadata('label') || 'none',
        port: portAtPosition ? `${portAtPosition.side} (${portAtPosition.id})` : 'none',
        portVisibility: config.portVisibility,
      });
    }

    // Update node hover state
    const allNodes = diagram.getNodes();
    allNodes.forEach((node) => {
      const wasHovered = node.state.hovered;
      const isHovered = node === nodeAtPosition;

      if (wasHovered !== isHovered) {
        node.setState({ hovered: isHovered });
        needsRender = true;
        if (debugPortDetection) {
          console.log(`  Node ${node.getMetadata('label')} hover: ${wasHovered} → ${isHovered}`);
        }
      }
    });

    // Update port hover state
    allNodes.forEach((node) => {
      node.getPorts().forEach((port) => {
        const wasHovered = port.isHovered;
        const isHovered = port === portAtPosition;

        if (wasHovered !== isHovered) {
          port.isHovered = isHovered;
          needsRender = true;
          // CRITICAL FIX: Mark node as dirty when port hover state changes
          // This forces the renderer to regenerate the port VNodes with updated styles
          node.markDirty('port-hover-changed');
          // TEMPORARY DEBUG: Always log port hover changes to see what's happening
          console.log(`🔘 Port ${port.side} hover: ${wasHovered} → ${isHovered}`, { nodeLabel: node.getMetadata('label') });
        }
      });
    });

    // Update link hover state
    const allLinks = diagram.getLinks();
    allLinks.forEach((link) => {
      const wasHovered = link.state === 'hovered';
      const isHovered = link === linkAtPosition;

      if (wasHovered !== isHovered) {
        link.setState(isHovered ? 'hovered' : 'default');
        needsRender = true;
      }
    });

    // Store current hover state
    this.hoveredNode = nodeAtPosition || null;
    this.hoveredPort = portAtPosition;
    this.hoveredLink = linkAtPosition;

    // Phase 5: Track performance
    this.performanceMetrics.hoverDetectionTime = performance.now() - startTime;

    return needsRender;
  }

  /**
   * Phase 3: Handle connection drag update
   * Phase 5: Enhanced with performance monitoring and validation
   * Updates connection preview during drag
   */
  handleConnectionDrag(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    // Phase 5: Validate state and inputs
    if (!this.isConnecting || !this.connectionSourcePort) {
      return false;
    }

    if (!engine || !isFinite(worldX) || !isFinite(worldY)) {
      return false;
    }

    // Phase 5: Performance monitoring
    const startTime = performance.now();

    try {
      const connectionStateManager = engine.getConnectionStateManager();
      const hoveredPort = this.hoveredPort;

      // Update connection state with current mouse position and hovered port
      connectionStateManager.updateConnection(
        { x: worldX, y: worldY },
        hoveredPort || undefined
      );

      // Update port highlight states
      this.updatePortHighlights(engine);

      // Phase 5: Track performance
      this.performanceMetrics.connectionUpdateTime = performance.now() - startTime;

      return true;
    } catch (error) {
      // Phase 5: Error handling
      console.error('Error during connection drag:', error);
      this.cancelConnection(engine);
      return false;
    }
  }

  /**
   * Phase 3: Start connection from port
   * Phase 5: Enhanced with validation and error handling
   * CRITICAL FIX: Added detailed logging
   */
  startConnection(port: PortModel, worldX: number, worldY: number, engine: DiagramEngine): void {
    // Phase 5: Validate inputs
    if (!port || !engine || !isFinite(worldX) || !isFinite(worldY)) {
      console.warn('❌ Invalid inputs for startConnection:', { port: !!port, engine: !!engine, worldX, worldY });
      return;
    }

    try {
      this.isConnecting = true;
      this.connectionSourcePort = port;

      const connectionStateManager = engine.getConnectionStateManager();
      connectionStateManager.startConnection(port, { x: worldX, y: worldY });

      console.log('🔌 Connection started:', {
        portId: port.id,
        portType: port.type,
        portSide: port.side,
        position: { x: worldX.toFixed(1), y: worldY.toFixed(1) }
      });
    } catch (error) {
      // Phase 5: Error recovery
      console.error('❌ Error starting connection:', error);
      this.isConnecting = false;
      this.connectionSourcePort = null;
    }
  }

  /**
   * Phase 3: Complete connection to target port
   * Phase 5: Enhanced with validation and error handling
   */
  completeConnection(engine: DiagramEngine): boolean {
    // Phase 5: Validate state
    if (!this.isConnecting || !this.connectionSourcePort) {
      return false;
    }

    if (!engine) {
      console.warn('Invalid engine in completeConnection');
      this.cancelConnection(engine);
      return false;
    }

    try {
      const config = engine.getInteractionConfig();
      const connectionStateManager = engine.getConnectionStateManager();
      let targetPort = this.hoveredPort;

    // Smart mode: Auto-connect to nearest port if dropping on node body
    if (config.mode === 'smart' && config.enableSmartAutoConnect) {
      if (!targetPort && this.hoveredNode) {
        // Find nearest port on hovered node
        const diagram = engine.getDiagram();
        if (diagram) {
          const dragState = connectionStateManager.getState();
          if (dragState.currentMousePosition) {
            const nodeBounds = this.hoveredNode.getBoundingBox();
            const portsData = this.hoveredNode.getPorts();
            // Convert array/iterable to Map if needed
            const portsMap = portsData instanceof Map
              ? portsData
              : new Map<string, PortModel>(
                  Array.from(portsData as Iterable<PortModel>).map((p) => [p.id, p])
                );
            targetPort = PortModel.findNearestPort(
              dragState.currentMousePosition,
              portsMap,
              nodeBounds
            );
          }
        }
      }
    }

    // Complete connection if we have a valid target port
    let success = false;
    if (targetPort) {
      const result = connectionStateManager.completeConnection(targetPort);
      success = result.success;

      if (success) {
        console.log('✅ Connection completed:', this.connectionSourcePort.id, '->', targetPort.id);
      } else {
        console.log('❌ Connection failed: Invalid connection');
      }
    }

      // Cleanup
      this.cancelConnection(engine);

      return success;
    } catch (error) {
      // Phase 5: Error recovery
      console.error('Error completing connection:', error);
      this.cancelConnection(engine);
      return false;
    }
  }

  /**
   * Phase 3: Cancel connection
   */
  cancelConnection(engine: DiagramEngine): void {
    if (!this.isConnecting) {
      return;
    }

    const connectionStateManager = engine.getConnectionStateManager();
    connectionStateManager.cancelConnection();

    this.isConnecting = false;
    this.connectionSourcePort = null;

    // Clear port highlights
    this.clearPortHighlights(engine);

    console.log('🚫 Connection cancelled');
  }

  /**
   * Phase 3: Start link reconnection
   */
  startLinkReconnection(
    link: LinkModel,
    endpoint: 'source' | 'target',
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): void {
    this.isReconnectingLink = true;
    this.reconnectingLink = link;
    this.reconnectingEndpoint = endpoint;

    // Select the endpoint on the link
    if (endpoint === 'source') {
      link.selectSourceEndpoint();
    } else {
      link.selectTargetEndpoint();
    }

    console.log(`🔗 Link reconnection started: ${endpoint} endpoint of link ${link.id}`);
  }

  /**
   * Phase 3: Complete link reconnection
   */
  completeLinkReconnection(engine: DiagramEngine): boolean {
    if (!this.isReconnectingLink || !this.reconnectingLink || !this.reconnectingEndpoint) {
      return false;
    }

    const targetPort = this.hoveredPort;
    if (!targetPort) {
      // Cancelled - restore original connection
      this.reconnectingLink.deselectEndpoints();
      this.isReconnectingLink = false;
      this.reconnectingLink = null;
      this.reconnectingEndpoint = null;
      console.log('🚫 Link reconnection cancelled: No target port');
      return false;
    }

    // Reconnect to new port
    const diagram = engine.getDiagram();
    if (!diagram) return false;

    // Find the node that owns the target port
    let targetNode: NodeModel | undefined;
    for (const node of diagram.getNodes()) {
      if (node.getPort(targetPort.id)) {
        targetNode = node;
        break;
      }
    }

    if (!targetNode) {
      console.log('❌ Link reconnection failed: Target node not found');
      return false;
    }

    // Reconnect the link
    if (this.reconnectingEndpoint === 'source') {
      this.reconnectingLink.reconnectSource(targetPort.id, targetNode.id);
    } else {
      this.reconnectingLink.reconnectTarget(targetPort.id, targetNode.id);
    }

    // Recalculate link path
    const reconnectedSourceNode = this.findNodeForPort(this.reconnectingLink.sourcePortId, diagram);
    const reconnectedTargetNode = this.findNodeForPort(this.reconnectingLink.targetPortId, diagram);

    if (reconnectedSourceNode && reconnectedTargetNode) {
      const sourcePort = reconnectedSourceNode.getPort(this.reconnectingLink.sourcePortId);
      const reconnectedTargetPort = reconnectedTargetNode.getPort(this.reconnectingLink.targetPortId);

      if (sourcePort && reconnectedTargetPort) {
        const sourceBounds = reconnectedSourceNode.getBoundingBox();
        const targetBounds = reconnectedTargetNode.getBoundingBox();
        const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
        const targetPoint = reconnectedTargetPort.getAbsolutePosition(targetBounds);

        // Get port directions for orthogonal routing
        const sourceDirection = sourcePort.alignment?.side;
        const targetDirection = reconnectedTargetPort.alignment?.side;

        this.reconnectingLink.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);
      }
    }

    console.log(`✅ Link reconnected: ${this.reconnectingEndpoint} endpoint to port ${targetPort.id}`);

    // Cleanup
    this.reconnectingLink.deselectEndpoints();
    this.isReconnectingLink = false;
    this.reconnectingLink = null;
    this.reconnectingEndpoint = null;

    return true;
  }

  /**
   * Phase 3: Handle link selection
   */
  selectLink(link: LinkModel, engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    // Clear other selections
    diagram.clearSelection();

    // Select the link
    link.setState('selected');

    console.log('🔗 Link selected:', link.id);
  }

  /**
   * Phase 3: Delete selected link
   */
  deleteSelectedLink(engine: DiagramEngine): boolean {
    const diagram = engine.getDiagram();
    if (!diagram) return false;

    // Find selected link
    const selectedLink = diagram.getLinks().find((link: LinkModel) => link.state === 'selected');
    if (!selectedLink) return false;

    // Remove the link
    diagram.removeLink(selectedLink.id);

    console.log('🗑️ Link deleted:', selectedLink.id);
    return true;
  }

  /**
   * Phase 3: Get current interaction state
   */
  getState() {
    return {
      isConnecting: this.isConnecting,
      isReconnectingLink: this.isReconnectingLink,
      hoveredNode: this.hoveredNode,
      hoveredPort: this.hoveredPort,
      hoveredLink: this.hoveredLink,
      // Phase 2.3a: Waypoint editing state
      isDraggingWaypoint: this.isDraggingWaypoint,
      editingLink: this.editingLink,
      editingWaypointIndex: this.editingWaypointIndex,
      hoveredWaypointIndex: this.hoveredWaypointIndex,
      hoveredWaypointLink: this.hoveredWaypointLink,
      // Phase 2.3b: Control point editing state
      isDraggingControlPoint: this.isDraggingControlPoint,
      editingControlPointLink: this.editingControlPointLink,
      editingControlPointSegmentIndex: this.editingControlPointSegmentIndex,
      editingControlPointType: this.editingControlPointType,
      hoveredControlPointSegmentIndex: this.hoveredControlPointSegmentIndex,
      hoveredControlPointType: this.hoveredControlPointType,
      hoveredControlPointLink: this.hoveredControlPointLink,
    };
  }

  /**
   * Phase 3: Check if currently interacting
   */
  isInteracting(): boolean {
    return this.isConnecting || this.isReconnectingLink || this.isDraggingWaypoint || this.isDraggingControlPoint;
  }

  /**
   * Phase 3: Get appropriate cursor for current state
   */
  getCursor(engine: DiagramEngine): string {
    if (this.isConnecting) {
      return 'crosshair';
    }

    if (this.isReconnectingLink) {
      return 'move';
    }

    if (this.hoveredPort) {
      return 'crosshair';
    }

    if (this.hoveredLink) {
      const config = engine.getInteractionConfig();
      if (config.enableLinkReconnection && this.hoveredLink.state === 'selected') {
        return 'pointer';
      }
      return 'pointer';
    }

    if (this.hoveredNode) {
      const config = engine.getInteractionConfig();
      if (config.mode === 'deliberate') {
        // In deliberate mode, only show move cursor if node is selected
        return this.hoveredNode.isSelected() ? 'move' : 'pointer';
      }
      return this.hoveredNode.isDraggable() ? 'pointer' : 'default';
    }

    return 'default';
  }

  // Private helper methods

  /**
   * Find port at world position
   * Phase 5: Optimized with performance monitoring and early exit
   * CRITICAL FIX: Accept engine parameter instead of calling diagram.getEngine()
   */
  private findPortAtPosition(
    worldX: number,
    worldY: number,
    diagram: any,
    engine: DiagramEngine
  ): PortModel | null {
    // Phase 5: Performance monitoring
    const startTime = performance.now();

    try {
      const config = engine.getInteractionConfig();
      const portRadius = config.portDefaultRadius * config.portHoverScaleFactor;
      const hitRadius = portRadius + 2; // Add 2px tolerance

      // Phase 5: Optimization - early exit if no nodes
      const nodes = diagram.getNodes();
      if (!nodes || nodes.length === 0) {
        return null;
      }

      for (const node of nodes) {
        // CRITICAL FIX: Always check for port hits regardless of visibility mode
        // Visibility affects RENDERING, not HIT DETECTION
        // This fixes the chicken-and-egg problem where ports couldn't be hovered
        // because the node wasn't hovered yet

        // Phase 5: Optimization - rough node bounds check first
        const nodeBounds = node.getBoundingBox();
        const nodeExpandedBounds = {
          left: nodeBounds.left - hitRadius,
          right: nodeBounds.right + hitRadius,
          top: nodeBounds.top - hitRadius,
          bottom: nodeBounds.bottom + hitRadius,
        };

        // Skip node if mouse is not even near it
        if (
          worldX < nodeExpandedBounds.left ||
          worldX > nodeExpandedBounds.right ||
          worldY < nodeExpandedBounds.top ||
          worldY > nodeExpandedBounds.bottom
        ) {
          continue;
        }

        const portsMap = node.getPorts();
        const ports: PortModel[] = Array.from((portsMap as Map<string, PortModel>).values());

        for (const port of ports) {
          // Get absolute port position
          const portPos = port.getAbsolutePosition(nodeBounds);

          // Check if mouse is within port radius
          const dx = worldX - portPos.x;
          const dy = worldY - portPos.y;
          const distanceSquared = dx * dx + dy * dy;

          // Phase 5: Optimization - compare squared distances to avoid sqrt
          if (distanceSquared <= hitRadius * hitRadius) {
            return port;
          }
        }
      }

      return null;
    } finally {
      // Phase 5: Track performance
      this.performanceMetrics.portHitTestTime = performance.now() - startTime;
    }
  }

  /**
   * Find link at world position
   * Uses simple distance-to-path calculation
   */
  private findLinkAtPosition(
    worldX: number,
    worldY: number,
    diagram: any
  ): LinkModel | null {
    const hitThreshold = 5; // 5px tolerance for clicking links

    for (const link of diagram.getLinks()) {
      const points = link.points;
      if (points.length < 2) continue;

      // Check distance to each segment
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        const distance = this.distanceToLineSegment(worldX, worldY, p1.x, p1.y, p2.x, p2.y);
        if (distance <= hitThreshold) {
          return link;
        }
      }
    }

    return null;
  }

  /**
   * Calculate distance from point to line segment
   */
  private distanceToLineSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Line segment is a point
      const dpx = px - x1;
      const dpy = py - y1;
      return Math.sqrt(dpx * dpx + dpy * dpy);
    }

    // Calculate projection of point onto line
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

    // Calculate closest point on segment
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    // Calculate distance
    const dpx = px - closestX;
    const dpy = py - closestY;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  /**
   * Update port highlight states during connection
   */
  private updatePortHighlights(engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    const dragState = engine.getConnectionStateManager().getState();

    // Clear all highlights first
    diagram.getNodes().forEach((node: NodeModel) => {
      node.getPorts().forEach((port: PortModel) => {
        port.isHighlighted = false;
        port.isValidTarget = false;
      });
    });

    // Highlight valid target ports
    dragState.validTargetPorts.forEach((portId) => {
      const port = this.findPortById(portId, diagram);
      if (port) {
        port.isValidTarget = true;
      }
    });

    // Highlight currently hovered port
    if (this.hoveredPort && dragState.isOverValidTarget) {
      this.hoveredPort.isHighlighted = true;
    }
  }

  /**
   * Clear all port highlights
   */
  private clearPortHighlights(engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    diagram.getNodes().forEach((node: NodeModel) => {
      node.getPorts().forEach((port: PortModel) => {
        port.isHighlighted = false;
        port.isValidTarget = false;
      });
    });
  }

  /**
   * Find port by ID
   */
  private findPortById(portId: string, diagram: any): PortModel | null {
    for (const node of diagram.getNodes()) {
      const port = node.getPort(portId);
      if (port) {
        return port;
      }
    }
    return null;
  }

  /**
   * Find node that owns a port
   */
  private findNodeForPort(portId: string, diagram: any): NodeModel | undefined {
    for (const node of diagram.getNodes()) {
      if (node.getPort(portId)) {
        return node;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Phase 2.3a: Waypoint Editing Methods
  // ============================================================================

  /**
   * Hit test for waypoint handle at mouse position
   * Returns the waypoint index if hit, null otherwise
   */
  hitTestWaypoint(mouseX: number, mouseY: number, link: LinkModel): number | null {
    if (!this.waypointEditor || !link.points || link.points.length < 3) {
      return null;
    }

    const hit = this.waypointEditor.hitTestWaypoint(mouseX, mouseY, link.points);
    return hit ? hit.waypointIndex : null;
  }

  /**
   * Hit test for clicking on link path (to add waypoint)
   */
  hitTestPath(mouseX: number, mouseY: number, link: LinkModel): boolean {
    if (!this.waypointEditor || !link.points || link.points.length < 2) {
      return false;
    }

    const hit = this.waypointEditor.hitTestPath(mouseX, mouseY, link.points);
    return hit !== null;
  }

  /**
   * Start dragging a waypoint
   */
  startWaypointDrag(waypointIndex: number, link: LinkModel): void {
    this.isDraggingWaypoint = true;
    this.editingLink = link;
    this.editingWaypointIndex = waypointIndex;
    console.log(`🔵 Started dragging waypoint ${waypointIndex} on link ${link.id}`);
  }

  /**
   * Move waypoint during drag
   */
  moveWaypoint(worldX: number, worldY: number, engine: DiagramEngine): boolean {
    if (!this.isDraggingWaypoint || !this.editingLink || this.editingWaypointIndex === null || !this.waypointEditor) {
      return false;
    }

    const newPosition = { x: worldX, y: worldY };
    const newPoints = this.waypointEditor.moveWaypoint(
      this.editingWaypointIndex,
      newPosition,
      this.editingLink.points
    );

    if (newPoints) {
      this.editingLink.setPoints(newPoints);
      console.log(`🔵 Moved waypoint ${this.editingWaypointIndex} to (${worldX.toFixed(1)}, ${worldY.toFixed(1)})`);
      return true;
    }

    return false;
  }

  /**
   * End waypoint drag
   */
  endWaypointDrag(): void {
    if (this.isDraggingWaypoint) {
      console.log(`🔵 Ended dragging waypoint ${this.editingWaypointIndex} on link ${this.editingLink?.id}`);
    }
    this.isDraggingWaypoint = false;
    this.editingLink = null;
    this.editingWaypointIndex = null;
  }

  /**
   * Add waypoint at click position on path
   */
  addWaypoint(clickX: number, clickY: number, link: LinkModel): boolean {
    if (!this.waypointEditor) {
      return false;
    }

    const result = this.waypointEditor.addWaypointAtPosition(clickX, clickY, link.points);

    if (result) {
      link.setPoints(result.newPoints);
      console.log(`🟢 Added waypoint at index ${result.waypointIndex} on link ${link.id}`);
      return true;
    }

    return false;
  }

  /**
   * Remove waypoint at index
   */
  removeWaypoint(waypointIndex: number, link: LinkModel): boolean {
    if (!this.waypointEditor) {
      return false;
    }

    const newPoints = this.waypointEditor.removeWaypoint(waypointIndex, link.points);

    if (newPoints) {
      link.setPoints(newPoints);
      console.log(`🔴 Removed waypoint at index ${waypointIndex} from link ${link.id}`);
      return true;
    }

    return false;
  }

  /**
   * Update waypoint editor configuration
   */
  updateWaypointEditorConfig(config: Partial<any>): void {
    if (this.waypointEditor) {
      this.waypointEditor.updateConfig(config);
    }
  }

  /**
   * Update hovered waypoint (for Delete key support)
   * Call this from mousemove to track which waypoint is under cursor
   */
  updateHoveredWaypoint(worldX: number, worldY: number, link: LinkModel | null): void {
    if (!link || !this.waypointEditor) {
      this.hoveredWaypointIndex = null;
      this.hoveredWaypointLink = null;
      return;
    }

    const waypointIndex = this.hitTestWaypoint(worldX, worldY, link);
    this.hoveredWaypointIndex = waypointIndex;
    this.hoveredWaypointLink = waypointIndex !== null ? link : null;
  }

  /**
   * Delete currently hovered waypoint (for Delete key)
   */
  deleteHoveredWaypoint(): boolean {
    if (this.hoveredWaypointIndex !== null && this.hoveredWaypointLink) {
      const removed = this.removeWaypoint(this.hoveredWaypointIndex, this.hoveredWaypointLink);
      if (removed) {
        this.hoveredWaypointIndex = null;
        this.hoveredWaypointLink = null;
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Phase 2.3b: Control Point Editing Methods
  // ============================================================================

  /**
   * Hit test for control point handle at mouse position
   * Returns the control point info if hit, null otherwise
   */
  hitTestControlPoint(
    mouseX: number,
    mouseY: number,
    link: LinkModel
  ): { segmentIndex: number; controlType: 'control1' | 'control2' } | null {
    if (!this.controlPointEditor || !link.segments || link.segments.length === 0) {
      return null;
    }

    const hit = this.controlPointEditor.hitTestControlPoint(mouseX, mouseY, link.segments);
    if (hit) {
      return {
        segmentIndex: hit.segmentIndex,
        controlType: hit.controlType,
      };
    }
    return null;
  }

  /**
   * Start dragging a control point
   */
  startControlPointDrag(
    segmentIndex: number,
    controlType: 'control1' | 'control2',
    link: LinkModel
  ): void {
    this.isDraggingControlPoint = true;
    this.editingControlPointLink = link;
    this.editingControlPointSegmentIndex = segmentIndex;
    this.editingControlPointType = controlType;
    console.log(`🟢 Started dragging ${controlType} of segment ${segmentIndex} on link ${link.id}`);
  }

  /**
   * Move control point during drag
   */
  moveControlPoint(worldX: number, worldY: number, engine: DiagramEngine): boolean {
    if (
      !this.isDraggingControlPoint ||
      !this.editingControlPointLink ||
      this.editingControlPointSegmentIndex === null ||
      !this.editingControlPointType ||
      !this.controlPointEditor
    ) {
      return false;
    }

    const newPosition = { x: worldX, y: worldY };
    const newSegments = this.controlPointEditor.moveControlPoint(
      this.editingControlPointSegmentIndex,
      this.editingControlPointType,
      newPosition,
      this.editingControlPointLink.segments
    );

    if (newSegments) {
      this.editingControlPointLink.segments = newSegments;
      this.editingControlPointLink.updateSegments();
      console.log(
        `🟢 Moved ${this.editingControlPointType} of segment ${this.editingControlPointSegmentIndex} to (${worldX.toFixed(1)}, ${worldY.toFixed(1)})`
      );
      return true;
    }

    return false;
  }

  /**
   * End control point drag
   */
  endControlPointDrag(): void {
    if (this.isDraggingControlPoint) {
      console.log(
        `🟢 Ended dragging ${this.editingControlPointType} of segment ${this.editingControlPointSegmentIndex} on link ${this.editingControlPointLink?.id}`
      );
    }
    this.isDraggingControlPoint = false;
    this.editingControlPointLink = null;
    this.editingControlPointSegmentIndex = null;
    this.editingControlPointType = null;
  }

  /**
   * Update control point editor configuration
   */
  updateControlPointEditorConfig(config: Partial<any>): void {
    if (this.controlPointEditor) {
      this.controlPointEditor.updateConfig(config);
    }
  }

  /**
   * Update hovered control point (for Delete key support)
   * Call this from mousemove to track which control point is under cursor
   */
  updateHoveredControlPoint(worldX: number, worldY: number, link: LinkModel | null): void {
    if (!link || !this.controlPointEditor) {
      this.hoveredControlPointSegmentIndex = null;
      this.hoveredControlPointType = null;
      this.hoveredControlPointLink = null;
      return;
    }

    const hit = this.hitTestControlPoint(worldX, worldY, link);
    if (hit) {
      this.hoveredControlPointSegmentIndex = hit.segmentIndex;
      this.hoveredControlPointType = hit.controlType;
      this.hoveredControlPointLink = link;
    } else {
      this.hoveredControlPointSegmentIndex = null;
      this.hoveredControlPointType = null;
      this.hoveredControlPointLink = null;
    }
  }

  /**
   * Reset control point to auto-generated position (for Delete key)
   * This removes custom control point adjustment, reverting to default bezier
   */
  resetHoveredControlPoint(): boolean {
    if (
      this.hoveredControlPointSegmentIndex !== null &&
      this.hoveredControlPointType &&
      this.hoveredControlPointLink
    ) {
      // For now, we don't support "deleting" control points
      // Control points are intrinsic to bezier curves
      // User would need to change pathType instead
      console.log('⚠️ Control points cannot be deleted, only moved');
      return false;
    }
    return false;
  }
}
