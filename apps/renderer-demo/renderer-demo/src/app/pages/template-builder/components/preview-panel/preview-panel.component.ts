import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramCanvasComponent } from '@grafloria/angular';
import {
  DiagramEngine,
  NodeModel,
  NodeFactory,
  TemplateRegistry,
  LinkModel,
  type NodeTemplate
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { PerformanceMonitorService } from '../../services/performance-monitor.service';
import {
  type PreviewNodeInfo,
  type ConnectionInfo,
  type ConnectionStyle,
  type CanvasLayoutConfig,
  DEFAULT_LAYOUT_CONFIG
} from '../../models/multi-node-state.model';
import { MinimapComponent } from '../minimap/minimap.component';

/**
 * Preview Panel Component
 *
 * Live preview of the node template being edited.
 * Renders the node in a diagram canvas with zoom and pan controls.
 *
 * Features:
 * - Real-time preview updates
 * - Multi-node canvas support
 * - Connection rendering
 * - Enhanced zoom/pan controls
 * - Performance measurement
 *
 * Phase 8 Enhancement: Multi-Node Preview & Connections
 * - Support multiple nodes in canvas
 * - Create connections between nodes
 * - Advanced zoom/pan with keyboard shortcuts
 * - Mouse wheel zoom support
 *
 * ~500 lines (enhanced from ~180)
 */
@Component({
    imports: [CommonModule, DiagramCanvasComponent, MinimapComponent],
    selector: 'app-preview-panel',
    templateUrl: './preview-panel.component.html',
    styleUrl: './preview-panel.component.css'
})
export class PreviewPanelComponent implements OnInit, OnDestroy, OnChanges {

  @Input() template = '';
  @Input() htmlLayer = '';
  @Input() cssLayer = '';
  @Input() multiNodeMode = false; // Toggle between single-node and multi-node mode

  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 800, height: 600 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  templateRegistry!: TemplateRegistry;
  nodeFactory!: NodeFactory;
  previewNode: NodeModel | null = null; // Used in single-node mode

  errorMessage = '';

  // Multi-node state (Phase 8)
  nodes: Map<string, PreviewNodeInfo> = new Map();
  connections: Map<string, ConnectionInfo> = new Map();
  selectedNodeIds = new Set<string>();
  layoutConfig: CanvasLayoutConfig = DEFAULT_LAYOUT_CONFIG;

  // Zoom presets
  zoomPresets = [25, 50, 75, 100, 125, 150, 200, 300, 400, 500];

  // Minimap
  minimapVisible = true;

  private performanceMonitor = inject(PerformanceMonitorService);
  private isCanvasFocused = false;

  ngOnInit(): void {
    this.initializeEngine();
    this.updatePreview();
  }

  ngOnDestroy(): void {
    // Cleanup
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['template'] && !changes['template'].firstChange) ||
        (changes['htmlLayer'] && !changes['htmlLayer'].firstChange) ||
        (changes['cssLayer'] && !changes['cssLayer'].firstChange)) {
      this.updatePreview();
    }
  }

  /**
   * Initialize diagram engine
   */
  private initializeEngine(): void {
    this.engine = new DiagramEngine();
    const diagram = this.engine.createDiagram('Template Preview');

    this.templateRegistry = new TemplateRegistry(this.engine.eventBus);
    this.nodeFactory = new NodeFactory(this.templateRegistry, diagram);

    console.log('✅ Preview engine initialized');
  }

  /**
   * Update preview with current template
   */
  private updatePreview(): void {
    let measurementStarted = false;
    try {
      this.performanceMonitor.startMeasure('template-preview');
      measurementStarted = true;

      // Parse template
      const templateData: NodeTemplate = JSON.parse(this.template);

      // Apply HTML layer if provided
      if (this.htmlLayer && this.htmlLayer.trim()) {
        if (!templateData.structure.html) {
          templateData.structure.html = {
            mode: 'template' as const,
            template: this.htmlLayer
          };
        } else {
          templateData.structure.html.template = this.htmlLayer;
          templateData.structure.html.mode = 'template';
        }
      }

      // Apply CSS layer if provided (inject as style tag in template)
      if (this.cssLayer && this.cssLayer.trim()) {
        if (!templateData.structure.html) {
          templateData.structure.html = {
            mode: 'template' as const,
            template: `<style>${this.cssLayer}</style>`
          };
        } else {
          // Prepend style tag to existing template
          const existingTemplate = templateData.structure.html.template || '';
          templateData.structure.html.template = `<style>${this.cssLayer}</style>${existingTemplate}`;
        }
      }

      // Clear entire diagram (removes all nodes including children/repeaters)
      const diagram = this.engine.getDiagram();
      if (!diagram) {
        throw new Error('Diagram not initialized');
      }

      // Clear ALL nodes, links, and groups from previous template
      diagram.clear();
      this.previewNode = null;

      // Register template
      this.templateRegistry.register(templateData);

      // Create node from template
      this.previewNode = this.nodeFactory.createFromTemplate(
        templateData.id,
        templateData.defaultData || {},
        { x: 400, y: 300 } // Center position
      );

      // Fit to view
      diagram.fitToView(50);
      this.updateViewportFromDiagram();

      this.errorMessage = '';

      // End performance measurement after a short delay to capture render time
      if (measurementStarted) {
        setTimeout(() => {
          this.performanceMonitor.endMeasure('template-preview');
        }, 100);
      }

      console.log('✅ Preview updated - diagram cleared');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Invalid template JSON';
      console.error('❌ Preview update failed:', error);

      // Only reset if measurement was started
      if (measurementStarted) {
        this.performanceMonitor.reset();
      }
    }
  }

  /**
   * Update viewport from diagram
   */
  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      this.viewport = diagram.getViewport();
      this.zoom = diagram.getViewport().zoom;
    }
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const currentZoom = diagram.getViewport().zoom;
      diagram.setZoom(Math.min(4.0, currentZoom + 0.1));
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const currentZoom = diagram.getViewport().zoom;
      diagram.setZoom(Math.max(0.25, currentZoom - 0.1));
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Reset zoom
   */
  resetZoom(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.setZoom(1.0);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Fit to view
   */
  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(50);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Refresh preview
   */
  refresh(): void {
    this.updatePreview();
  }

  // ==================== Multi-Node Management (Phase 8) ====================

  /**
   * Add a node to the canvas from current template
   * @param position Optional position, otherwise uses auto-layout
   * @returns The ID of the added node
   */
  addNodeToCanvas(position?: { x: number; y: number }): string {
    try {
      // Parse current template
      const templateData: NodeTemplate = JSON.parse(this.template);

      // Apply HTML and CSS layers
      this.applyLayersToTemplate(templateData);

      // Register template if not already registered
      this.templateRegistry.register(templateData);

      // Determine position
      const nodePosition = position || this.getNextAutoPosition();

      // Create node from template
      const nodeModel = this.nodeFactory.createFromTemplate(
        templateData.id,
        templateData.defaultData || {},
        nodePosition
      );

      // Create preview node info
      const nodeId = `preview-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nodeInfo: PreviewNodeInfo = {
        id: nodeId,
        templateId: templateData.id,
        position: nodePosition,
        nodeModel,
        data: templateData.defaultData || {},
        createdAt: Date.now()
      };

      this.nodes.set(nodeId, nodeInfo);

      console.log(`✅ Node added to canvas: ${nodeId} at (${nodePosition.x}, ${nodePosition.y})`);

      return nodeId;
    } catch (error) {
      console.error('❌ Failed to add node to canvas:', error);
      this.errorMessage = error instanceof Error ? error.message : 'Failed to add node';
      return '';
    }
  }

  /**
   * Remove a node from the canvas
   * @param nodeId The ID of the node to remove
   */
  removeNodeFromCanvas(nodeId: string): void {
    const nodeInfo = this.nodes.get(nodeId);
    if (!nodeInfo) {
      console.warn(`Node ${nodeId} not found in canvas`);
      return;
    }

    // Remove all connections involving this node
    const connectionsToRemove: string[] = [];
    this.connections.forEach((connection, connId) => {
      if (connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId) {
        connectionsToRemove.push(connId);
      }
    });

    connectionsToRemove.forEach(connId => this.removeConnection(connId));

    // Remove node from diagram
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.removeNode(nodeInfo.nodeModel.id);
    }

    // Remove from state
    this.nodes.delete(nodeId);
    this.selectedNodeIds.delete(nodeId);

    console.log(`✅ Node removed from canvas: ${nodeId}`);
  }

  /**
   * Remove selected nodes from canvas
   */
  removeSelectedNodes(): void {
    const idsToRemove = Array.from(this.selectedNodeIds);
    idsToRemove.forEach(nodeId => this.removeNodeFromCanvas(nodeId));
  }

  /**
   * Clear all nodes and connections from canvas
   */
  clearCanvas(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.clear();
    }

    this.nodes.clear();
    this.connections.clear();
    this.selectedNodeIds.clear();
    this.previewNode = null;

    console.log('✅ Canvas cleared');
  }

  /**
   * Get next auto-layout position for new node
   */
  private getNextAutoPosition(): { x: number; y: number } {
    const { columns = 3, spacing = { x: 300, y: 250 }, startOffset = { x: 150, y: 150 } } = this.layoutConfig;

    const existingCount = this.nodes.size;
    const row = Math.floor(existingCount / columns);
    const col = existingCount % columns;

    return {
      x: startOffset.x + (col * spacing.x),
      y: startOffset.y + (row * spacing.y)
    };
  }

  /**
   * Apply HTML and CSS layers to template
   */
  private applyLayersToTemplate(templateData: NodeTemplate): void {
    // Apply HTML layer if provided
    if (this.htmlLayer && this.htmlLayer.trim()) {
      if (!templateData.structure.html) {
        templateData.structure.html = {
          mode: 'template' as const,
          template: this.htmlLayer
        };
      } else {
        templateData.structure.html.template = this.htmlLayer;
        templateData.structure.html.mode = 'template';
      }
    }

    // Apply CSS layer if provided
    if (this.cssLayer && this.cssLayer.trim()) {
      if (!templateData.structure.html) {
        templateData.structure.html = {
          mode: 'template' as const,
          template: `<style>${this.cssLayer}</style>`
        };
      } else {
        // Prepend style tag to existing template
        const existingTemplate = templateData.structure.html.template || '';
        templateData.structure.html.template = `<style>${this.cssLayer}</style>${existingTemplate}`;
      }
    }
  }

  /**
   * Auto-layout all nodes in grid pattern
   */
  autoLayoutNodes(): void {
    const nodeArray = Array.from(this.nodes.values());
    const { columns = 3, spacing = { x: 300, y: 250 }, startOffset = { x: 150, y: 150 } } = this.layoutConfig;

    nodeArray.forEach((nodeInfo, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;

      const newPosition = {
        x: startOffset.x + (col * spacing.x),
        y: startOffset.y + (row * spacing.y)
      };

      // Update position in node model
      nodeInfo.nodeModel.position = newPosition;
      nodeInfo.position = newPosition;
    });

    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(50);
      this.updateViewportFromDiagram();
    }

    console.log('✅ Nodes auto-laid out in grid');
  }

  // ==================== Connection Management ====================

  /**
   * Add a connection between two nodes
   * @param sourceNodeId ID of source node
   * @param targetNodeId ID of target node
   * @param style Connection line style
   * @param label Optional connection label
   * @returns The ID of the connection, or empty string if failed
   */
  addConnection(
    sourceNodeId: string,
    targetNodeId: string,
    style: ConnectionStyle = 'curved',
    label?: string
  ): string {
    const sourceNode = this.nodes.get(sourceNodeId);
    const targetNode = this.nodes.get(targetNodeId);

    if (!sourceNode || !targetNode) {
      console.error('Source or target node not found');
      return '';
    }

    // Get output port from source, input port from target
    const sourcePorts = sourceNode.nodeModel.getPorts();
    const targetPorts = targetNode.nodeModel.getPorts();

    const sourcePort = sourcePorts.find(p => p.type === 'output') || sourcePorts[sourcePorts.length - 1];
    const targetPort = targetPorts.find(p => p.type === 'input') || targetPorts[0];

    if (!sourcePort || !targetPort) {
      console.error('Nodes must have ports for connections');
      return '';
    }

    // Map connection style to LinkModel style
    const linkStyle = style === 'straight' ? 'direct' :
                     style === 'curved' ? 'smooth' :
                     'orthogonal';

    // Create link model
    const linkModel = new LinkModel(sourcePort.id, targetPort.id, linkStyle as any);
    if (label) {
      linkModel.setMetadata('label', label);
    }

    // Add link to diagram
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.addLink(linkModel);
    }

    // Create connection info
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const connectionInfo: ConnectionInfo = {
      id: connectionId,
      sourceNodeId,
      targetNodeId,
      sourcePortId: sourcePort.id,
      targetPortId: targetPort.id,
      style,
      linkModel,
      label,
      createdAt: Date.now()
    };

    this.connections.set(connectionId, connectionInfo);

    console.log(`✅ Connection added: ${sourceNodeId} → ${targetNodeId}`);

    return connectionId;
  }

  /**
   * Remove a connection
   * @param connectionId The ID of the connection to remove
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`Connection ${connectionId} not found`);
      return;
    }

    // Remove link from diagram
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.removeLink(connection.linkModel.id);
    }

    // Remove from state
    this.connections.delete(connectionId);

    console.log(`✅ Connection removed: ${connectionId}`);
  }

  // ==================== Enhanced Zoom and Pan (Phase 8) ====================

  /**
   * Handle mouse wheel zoom
   */
  @HostListener('wheel', ['$event'])
  onMouseWheel(event: WheelEvent): void {
    if (!this.isCanvasFocused) return;

    event.preventDefault();

    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    const currentZoom = diagram.getViewport().zoom;
    const newZoom = Math.max(0.1, Math.min(5.0, currentZoom + delta));

    diagram.setZoom(newZoom);
    this.updateViewportFromDiagram();
  }

  /**
   * Handle keyboard shortcuts
   */
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.isCanvasFocused) return;

    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Zoom controls (Ctrl/Cmd + +/-)
    if (event.ctrlKey || event.metaKey) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.zoomIn();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        this.zoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        this.resetZoom();
      }
    }

    // Pan with Shift + Arrow keys
    if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const panAmount = 50;
      const viewport = diagram.getViewport();

      const panDeltas: { [key: string]: { x: number; y: number } } = {
        ArrowUp: { x: 0, y: panAmount },
        ArrowDown: { x: 0, y: -panAmount },
        ArrowLeft: { x: panAmount, y: 0 },
        ArrowRight: { x: -panAmount, y: 0 }
      };

      const delta = panDeltas[event.key];
      const newX = viewport.x + delta.x;
      const newY = viewport.y + delta.y;
      diagram.setViewport(newX, newY, viewport.width, viewport.height, viewport.zoom);

      this.updateViewportFromDiagram();
    }

    // Delete selected nodes (Del key)
    if (event.key === 'Delete' && this.selectedNodeIds.size > 0) {
      event.preventDefault();
      this.removeSelectedNodes();
    }
  }

  /**
   * Set zoom to specific percentage
   * @param percentage Zoom level (25-500)
   */
  setZoomPercentage(percentage: number): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.setZoom(percentage / 100);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Fit selected nodes to view
   */
  fitToSelection(): void {
    if (this.selectedNodeIds.size === 0) {
      this.fitToView();
      return;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const selectedNodes = Array.from(this.selectedNodeIds)
      .map(id => this.nodes.get(id))
      .filter(Boolean)
      .map(nodeInfo => nodeInfo!.nodeModel);

    if (selectedNodes.length > 0) {
      // Calculate bounding box of selected nodes
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      selectedNodes.forEach(node => {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.size.width);
        maxY = Math.max(maxY, node.position.y + node.size.height);
      });

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const width = maxX - minX;
      const height = maxY - minY;

      // Calculate zoom to fit
      const viewportWidth = this.viewport.width;
      const viewportHeight = this.viewport.height;
      const padding = 100;

      const zoomX = (viewportWidth - padding) / width;
      const zoomY = (viewportHeight - padding) / height;
      const zoom = Math.min(zoomX, zoomY, 2.0); // Max zoom 200%

      diagram.setZoom(zoom);
      const newX = centerX - (viewportWidth / (2 * zoom));
      const newY = centerY - (viewportHeight / (2 * zoom));
      diagram.setViewport(newX, newY, this.viewport.width, this.viewport.height, zoom);

      this.updateViewportFromDiagram();
    }
  }

  /**
   * Track canvas focus for keyboard shortcuts
   */
  onCanvasFocus(): void {
    this.isCanvasFocused = true;
  }

  /**
   * Track canvas blur
   */
  onCanvasBlur(): void {
    this.isCanvasFocused = false;
  }

  // ==================== Node Selection ====================

  /**
   * Select a node
   * @param nodeId Node ID to select
   * @param multi Whether to allow multi-select (Ctrl/Cmd held)
   */
  selectNode(nodeId: string, multi: boolean = false): void {
    if (!multi) {
      this.selectedNodeIds.clear();
    }

    if (this.selectedNodeIds.has(nodeId)) {
      this.selectedNodeIds.delete(nodeId);
    } else {
      this.selectedNodeIds.add(nodeId);
    }

    console.log(`Selected nodes: ${Array.from(this.selectedNodeIds).join(', ')}`);
  }

  /**
   * Deselect all nodes
   */
  deselectAll(): void {
    this.selectedNodeIds.clear();
  }

  /**
   * Get count of nodes in canvas
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get count of connections in canvas
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  // ==================== Minimap Integration ====================

  /**
   * Handle viewport change from minimap
   * @param position New viewport position
   */
  onMinimapViewportChange(position: { x: number; y: number }): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    diagram.setViewport(position.x, position.y, this.viewport.width, this.viewport.height, this.zoom);

    this.updateViewportFromDiagram();
  }

  /**
   * Handle minimap visibility change
   * @param visible New visibility state
   */
  onMinimapVisibilityChange(visible: boolean): void {
    this.minimapVisible = visible;
  }

  /**
   * Toggle minimap visibility
   */
  toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
  }
}
