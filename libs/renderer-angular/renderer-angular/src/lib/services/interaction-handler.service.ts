import { Injectable } from '@angular/core';
import type {
  DiagramEngine,
  NodeModel,
  LinkModel,
  InteractionMode,
} from '@grafloria/engine';
import { PortModel } from '@grafloria/engine';

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

  constructor() {}

  /**
   * Phase 3: Handle mouse move for hover detection
   * Updates hover states for nodes, ports, and links
   */
  handleMouseMove(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    const diagram = engine.getDiagram();
    if (!diagram) return false;

    const config = engine.getInteractionConfig();
    let needsRender = false;

    // Find what's under the cursor
    const nodeAtPosition = diagram.getNodeAtPosition(worldX, worldY);
    const portAtPosition = this.findPortAtPosition(worldX, worldY, diagram);
    const linkAtPosition = this.findLinkAtPosition(worldX, worldY, diagram);

    // Update node hover state
    const allNodes = diagram.getNodes();
    allNodes.forEach((node) => {
      const wasHovered = node.state.hovered;
      const isHovered = node === nodeAtPosition;

      if (wasHovered !== isHovered) {
        node.setState({ hovered: isHovered });
        needsRender = true;
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

    return needsRender;
  }

  /**
   * Phase 3: Handle connection drag update
   * Updates connection preview during drag
   */
  handleConnectionDrag(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    if (!this.isConnecting || !this.connectionSourcePort) {
      return false;
    }

    const connectionStateManager = engine.getConnectionStateManager();
    const hoveredPort = this.hoveredPort;

    // Update connection state with current mouse position and hovered port
    connectionStateManager.updateConnection(
      { x: worldX, y: worldY },
      hoveredPort || undefined
    );

    // Update port highlight states
    this.updatePortHighlights(engine);

    return true;
  }

  /**
   * Phase 3: Start connection from port
   */
  startConnection(port: PortModel, worldX: number, worldY: number, engine: DiagramEngine): void {
    this.isConnecting = true;
    this.connectionSourcePort = port;

    const connectionStateManager = engine.getConnectionStateManager();
    connectionStateManager.startConnection(port, { x: worldX, y: worldY });

    console.log('🔌 Connection started from port:', port.id);
  }

  /**
   * Phase 3: Complete connection to target port
   */
  completeConnection(engine: DiagramEngine): boolean {
    if (!this.isConnecting || !this.connectionSourcePort) {
      return false;
    }

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

        this.reconnectingLink.generatePath(sourcePoint, targetPoint);
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
    };
  }

  /**
   * Phase 3: Check if currently interacting
   */
  isInteracting(): boolean {
    return this.isConnecting || this.isReconnectingLink;
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
   */
  private findPortAtPosition(
    worldX: number,
    worldY: number,
    diagram: any
  ): PortModel | null {
    const config = diagram.getEngine().getInteractionConfig();
    const portRadius = config.portDefaultRadius * config.portHoverScaleFactor;
    const hitRadius = portRadius + 2; // Add 2px tolerance

    for (const node of diagram.getNodes()) {
      // Skip if node is not hovered and ports are not always visible
      if (config.portVisibility === 'on-hover' && !node.state.hovered) {
        continue;
      }

      const nodeBounds = node.getBoundingBox();
      const portsMap = node.getPorts();
      const ports: PortModel[] = Array.from((portsMap as Map<string, PortModel>).values());

      for (const port of ports) {
        // Get absolute port position
        const portPos = port.getAbsolutePosition(nodeBounds);

        // Check if mouse is within port radius
        const dx = worldX - portPos.x;
        const dy = worldY - portPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= hitRadius) {
          return port;
        }
      }
    }

    return null;
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
}
