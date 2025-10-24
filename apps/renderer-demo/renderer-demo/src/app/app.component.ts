import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent, InteractionConfigPanelComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  LayoutAlgorithmType,
  GridLayoutOptions,
  type InteractionConfig,
  InteractionMode,
  PortVisibilityStrategy
} from '@grafloria/engine';
import { LIGHT_THEME, DARK_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent, InteractionConfigPanelComponent],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'Renderer Demo - @grafloria/renderer-angular';

  // Engine and rendering config
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  // Theme toggle
  isDarkTheme = false;

  // Command panel
  showCommandPanel = false;
  commandInput = '';
  commandOutput: string[] = [];

  // Control panel (right side)
  showControlPanel = true; // Open by default

  // Layout configuration
  currentLayout: LayoutAlgorithmType = 'grid';
  availableLayouts: LayoutAlgorithmType[] = ['grid', 'hierarchical', 'force-directed', 'hybrid'];

  // Link path type configuration
  currentLinkType: 'direct' | 'smooth' | 'orthogonal' | 'bezier' = 'orthogonal';

  // Routing algorithm configuration (for obstacle avoidance)
  currentRoutingAlgorithm: 'none' | 'straight' | 'orthogonal' | 'a-star' | 'dijkstra' | 'visibility-graph' = 'none';

  // Selection state (Option 1: Node Interaction)
  selectedNodeCount = 0;

  // Option 3: Animation configuration
  enableAnimation = true;
  animationDuration = 800; // milliseconds

  // History tracking
  private history: Array<{
    timestamp: Date;
    action: string;
    category: 'node' | 'link' | 'viewport' | 'layout' | 'config' | 'interaction' | 'command';
    details: any;
    before?: any;
    after?: any;
  }> = [];

  ngOnInit() {
    this.initializeEngine();
    this.createSampleDiagram();
    this.configureLayout();

    // Ensure all nodes are visible on initial load
    this.fitToView();

    // Subscribe to selection changes
    this.subscribeToSelectionEvents();

    // Subscribe to link creation to apply current link type
    this.subscribeToLinkCreation();
  }

  /**
   * Initialize the diagram engine
   */
  private initializeEngine(): void {
    this.engine = new DiagramEngine({
      interaction: {
        mode: InteractionMode.SMART, // Start with Smart/Visio-style mode
        portVisibility: PortVisibilityStrategy.ALWAYS, // CRITICAL FIX: Start with ALWAYS to debug visibility
        enableSmartAutoConnect: true,
      }
    });

    console.log('🔧 Engine initialized with port visibility:', this.engine.getInteractionConfig().portVisibility);
  }

  /**
   * Handle interaction config changes from the panel
   */
  onInteractionConfigChanged(config: Partial<InteractionConfig>): void {
    console.log('🎛️ Interaction config changed:', config);

    // CRITICAL FIX: Update engine config
    if (this.engine) {
      this.engine.setInteractionConfig(config);
      console.log('✅ Engine config updated. Current visibility:', this.engine.getInteractionConfig().portVisibility);
    }
  }

  /**
   * Configure the layout system
   */
  private configureLayout(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Configure grid layout with smart column calculation
    diagram.configureLayout({
      type: 'grid',
      options: {
        columns: 'auto', // Auto-calculate based on viewport
        horizontalSpacing: 20,
        verticalSpacing: 20,
        startPosition: { x: 100, y: 100 },
        nodeSize: { width: 200, height: 100 }
      } as GridLayoutOptions
    });

    console.log(`🎨 Layout configured: ${this.currentLayout}`);
    console.log(`📐 Configuration:`, diagram.getLayoutConfiguration());
  }

  /**
   * Create a sample diagram with nodes and links
   */
  private createSampleDiagram(): void {
    const diagram = this.engine.createDiagram('Sample Diagram');

    // Create nodes
    const node1 = new NodeModel({
      type: 'basic',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 },
    });
    node1.setMetadata('label', 'Start Node');

    const node2 = new NodeModel({
      type: 'basic',
      position: { x: 450, y: 100 },
      size: { width: 200, height: 100 },
    });
    node2.setMetadata('label', 'Process Node');

    const node3 = new NodeModel({
      type: 'basic',
      position: { x: 800, y: 100 },
      size: { width: 200, height: 100 },
    });
    node3.setMetadata('label', 'End Node');

    const node4 = new NodeModel({
      type: 'basic',
      position: { x: 450, y: 300 },
      size: { width: 200, height: 100 },
    });
    node4.setMetadata('label', 'Alternative Path');

    // Add nodes to diagram
    diagram.addNode(node1);
    diagram.addNode(node2);
    diagram.addNode(node3);
    diagram.addNode(node4);

    // Phase 0.5.1: Nodes automatically have 4 default ports (top, right, bottom, left)
    console.log('✨ Node 1 ports:', node1.getPorts().map(p => ({ side: p.side, type: p.type })));
    console.log('✨ Node 2 ports:', node2.getPorts().map(p => ({ side: p.side, type: p.type })));

    // Phase 0.5.3: Use simplified connection API with automatic port selection!
    // No need to manually get ports or create LinkModel instances
    // The diagram intelligently selects the best ports based on node positions

    console.log('\n🔗 Creating smart connections...');

    // Option 1: createSmartLink() - returns the created link
    const link1 = diagram.createSmartLink(node1, node2, this.currentLinkType);
    console.log('✅ Created smart link 1:', link1 ? 'Success' : 'Failed');
    // Option 2: Set link label to demonstrate link labels feature
    if (link1) {
      link1.setMetadata('label', 'Start');
    }

    // Option 2: connectNodes() - returns boolean success status (even simpler!)
    const success2 = diagram.connectNodes(node2, node3, this.currentLinkType);
    console.log('✅ Connected nodes 2→3:', success2);
    // Option 2: Add label to second link
    if (success2) {
      const link2 = diagram.getLinks().find(l =>
        l.sourcePortId && l.targetPortId &&
        node2.getPorts().some(p => p.id === l.sourcePortId) &&
        node3.getPorts().some(p => p.id === l.targetPortId)
      );
      if (link2) {
        link2.setMetadata('label', 'Next');
      }
    }

    const success3 = diagram.connectNodes(node2, node4, this.currentLinkType);
    console.log('✅ Connected nodes 2→4:', success3);
    // Option 2: Add label to third link
    if (success3) {
      const link3 = diagram.getLinks().find(l =>
        l.sourcePortId && l.targetPortId &&
        node2.getPorts().some(p => p.id === l.sourcePortId) &&
        node4.getPorts().some(p => p.id === l.targetPortId)
      );
      if (link3) {
        link3.setMetadata('label', 'Alt');
      }
    }

    // Query node connections (Phase 0.5.3 API)
    const node2Connections = diagram.getNodeConnections(node2);
    console.log('📊 Node 2 connections:', {
      incoming: node2Connections.incoming.length,
      outgoing: node2Connections.outgoing.length,
      total: node2Connections.all.length
    });
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    this.theme = this.isDarkTheme ? DARK_THEME : LIGHT_THEME;
  }

  /**
   * Zoom in (multiply by 1.1 for proportional zooming)
   */
  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.min(diagram.viewport.zoom * 1.1, 3.0);
      diagram.setZoom(newZoom);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Zoom out (divide by 1.1 for proportional zooming)
   */
  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.max(diagram.viewport.zoom / 1.1, 0.1);
      diagram.setZoom(newZoom);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Reset zoom to 100% and fit all nodes in view
   */
  resetZoom(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.setZoom(1.0);
      diagram.fitToView(100);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Fit viewport to show all nodes (without changing zoom)
   */
  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(100);
      this.updateViewportFromDiagram();
    }
  }

  /**
   * Update local viewport state from diagram (Phase 0.5 - Option B)
   */
  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const vp = diagram.getViewport();
      this.viewport = { x: vp.x, y: vp.y, width: vp.width, height: vp.height };
      this.zoom = vp.zoom;
    }
  }

  /**
   * Handle viewport changed event from canvas (Phase 0.5 - Option B)
   * Called when user pans with middle mouse button
   */
  onViewportChanged(rect: any): void {
    const before = { x: this.viewport.x, y: this.viewport.y };
    this.viewport = rect;
    this.logHistory('viewport-pan', 'viewport', 'User panned viewport', {
      position: { x: rect.x, y: rect.y }
    }, before, { x: rect.x, y: rect.y });
    console.log(`📷 Viewport panned to: (${rect.x.toFixed(1)}, ${rect.y.toFixed(1)})`);
  }

  /**
   * Handle zoom changed event from canvas (Phase 0.5 - Option B)
   * Called when user zooms with mouse wheel
   */
  onZoomChanged(newZoom: number): void {
    const before = this.zoom;
    this.zoom = newZoom;
    this.logHistory('viewport-zoom', 'viewport', 'User changed zoom', {
      zoom: newZoom,
      percentage: `${(newZoom * 100).toFixed(0)}%`
    }, before, newZoom);
    console.log(`🔍 Zoom changed to: ${(newZoom * 100).toFixed(0)}%`);
  }

  /**
   * Add a new node using engine's layout system
   */
  addRandomNode(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) {
      console.log('❌ No diagram available');
      return;
    }

    const currentCount = diagram.getNodes().length;
    console.log(`\n🔵 Adding node #${currentCount + 1} using ${this.currentLayout} layout...`);
    console.log(`Current nodes in diagram:`, currentCount);

    // Create node with temporary position
    const node = new NodeModel({
      type: 'basic',
      position: { x: 0, y: 0 }, // Will be calculated by layout engine
      size: { width: 200, height: 100 },
    });
    node.setMetadata('label', `Node ${currentCount + 1}`);

    // Use engine's layout system to calculate position
    const layoutManager = diagram.getLayoutManager();
    const placementResult = layoutManager.calculatePlacement(
      node,
      this.viewport,
      {
        spacing: 20,
        padding: 100
      }
    );

    if (placementResult.success) {
      console.log(`✅ Layout calculated position:`, placementResult.position);
      if (placementResult.metadata) {
        console.log(`📊 Placement metadata:`, placementResult.metadata);
      }

      // Set the calculated position
      node.setPosition(placementResult.position.x, placementResult.position.y);
    } else {
      console.warn('⚠️  Layout placement failed, using fallback position');
      node.setPosition(100, 100);
    }

    // Add node to diagram
    diagram.addNode(node);

    const newCount = diagram.getNodes().length;
    this.logHistory('node-add', 'node', 'Added new node', {
      nodeId: node.id,
      label: node.getMetadata('label'),
      position: node.position,
      layout: this.currentLayout,
      totalNodes: newCount
    }, currentCount, newCount);

    console.log(`✅ Node added! Total nodes: ${newCount}`);
    console.log(`Node list:`, diagram.getNodes().map((n: any) => ({
      id: n.id,
      label: n.getMetadata('label'),
      position: n.position
    })));

    // Auto-fit viewport to show all nodes
    this.fitToView();
  }

  /**
   * Change layout algorithm
   */
  setLayoutAlgorithm(algorithm: LayoutAlgorithmType): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const before = this.currentLayout;
    try {
      diagram.setLayoutAlgorithm(algorithm);
      this.currentLayout = algorithm;
      this.logHistory('layout-change', 'layout', 'Changed layout algorithm', {
        algorithm,
        config: diagram.getLayoutConfiguration()
      }, before, algorithm);
      console.log(`🎨 Layout algorithm changed to: ${algorithm}`);
      console.log(`📐 New configuration:`, diagram.getLayoutConfiguration());
    } catch (error) {
      console.error('Failed to set layout algorithm:', error);
    }
  }

  /**
   * Re-layout all nodes using current algorithm
   */
  async reLayoutDiagram(): Promise<void> {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    console.log(`\n🔄 Re-layouting diagram using ${this.currentLayout} algorithm...`);

    try {
      // Reset viewport to default canvas dimensions before re-layout
      // This prevents viewport from previous layout affecting the new layout's scaling
      const defaultViewport = { x: 0, y: 0, width: 1200, height: 800 };
      diagram.setViewport(
        defaultViewport.x,
        defaultViewport.y,
        defaultViewport.width,
        defaultViewport.height,
        this.zoom
      );

      // Option 3: Apply layout with animation if enabled
      await diagram.reLayout({
        animate: this.enableAnimation,
        animationDuration: this.animationDuration
      });
      console.log(`✅ Re-layout complete! ${this.enableAnimation ? `(animated in ${this.animationDuration}ms)` : '(instant)'}`);

      // Fit viewport to show all nodes after re-layout
      this.fitToView();
    } catch (error) {
      console.error('❌ Re-layout failed:', error);
    }
  }

  /**
   * Subscribe to selection events (Option 1: Node Interaction)
   */
  subscribeToSelectionEvents(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    diagram.on('selection:changed', (event: any) => {
      this.selectedNodeCount = diagram.getSelectedNodes().length;
      console.log(`🎯 Selection changed: ${this.selectedNodeCount} node(s) selected`);
    });
  }

  /**
   * Subscribe to link creation events to apply current link type
   * This ensures newly created links use the selected path type from the dropdown
   */
  subscribeToLinkCreation(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    diagram.on('link:added', (event: any) => {
      const link = event.link;
      if (link && link.pathType !== this.currentLinkType) {
        console.log(`🔗 New link created, applying current link type: ${this.currentLinkType}`);

        // Update the link's pathType to match the currently selected type
        link.pathType = this.currentLinkType;

        // Recalculate the path with the new type
        const sourceNode = diagram.getNodes().find((n: any) =>
          n.getPorts().some((p: any) => p.id === link.sourcePortId)
        );
        const targetNode = diagram.getNodes().find((n: any) =>
          n.getPorts().some((p: any) => p.id === link.targetPortId)
        );

        if (sourceNode && targetNode) {
          const sourcePort = sourceNode.getPorts().find((p: any) => p.id === link.sourcePortId);
          const targetPort = targetNode.getPorts().find((p: any) => p.id === link.targetPortId);

          if (sourcePort && targetPort) {
            const sourcePoint = sourcePort.getAbsolutePosition(sourceNode.getBoundingBox());
            const targetPoint = targetPort.getAbsolutePosition(targetNode.getBoundingBox());
            link.generatePath(sourcePoint, targetPoint);
            link.markDirty();

            console.log(`✅ Link path regenerated with ${this.currentLinkType} routing`);
          }
        }

        // Log to history
        this.logHistory('link-created', 'link', 'User created new link', {
          linkId: link.id,
          pathType: this.currentLinkType,
          sourcePortId: link.sourcePortId,
          targetPortId: link.targetPortId
        });
      }
    });
  }

  /**
   * Clear all node selections (Option 1: Node Interaction)
   */
  clearSelection(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    diagram.clearSelection();
    console.log('✨ Selection cleared');
  }

  /**
   * Delete all selected nodes (Option 1: Node Interaction)
   */
  deleteSelectedNodes(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const count = diagram.deleteSelected();
    if (count > 0) {
      console.log(`🗑️  Deleted ${count} selected node(s)`);
    }
  }

  /**
   * Lock/pin selected nodes (Option 3: Advanced Layout Features)
   */
  lockSelectedNodes(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const count = diagram.lockSelected();
    if (count > 0) {
      console.log(`📌 Locked ${count} selected node(s)`);
    }
  }

  /**
   * Unlock selected nodes (Option 3: Advanced Layout Features)
   */
  unlockSelectedNodes(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const count = diagram.unlockSelected();
    if (count > 0) {
      console.log(`🔓 Unlocked ${count} selected node(s)`);
    }
  }

  /**
   * Unlock all nodes (Option 3: Advanced Layout Features)
   */
  unlockAllNodes(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const count = diagram.unlockAll();
    if (count > 0) {
      console.log(`🔓 Unlocked ${count} node(s)`);
    }
  }

  /**
   * Get count of locked nodes (Option 3: Advanced Layout Features)
   */
  getLockedNodeCount(): number {
    const diagram = this.engine.getDiagram();
    if (!diagram) return 0;
    return diagram.getLockedNodes().length;
  }

  /**
   * Change link path type for all links
   */
  changeLinkType(type: 'direct' | 'smooth' | 'orthogonal' | 'bezier'): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const links = diagram.getLinks();
    links.forEach((link: any) => {
      link.pathType = type;
      // Recalculate path with new type
      const sourceNode = diagram.getNodes().find((n: any) =>
        n.getPorts().some((p: any) => p.id === link.sourcePortId)
      );
      const targetNode = diagram.getNodes().find((n: any) =>
        n.getPorts().some((p: any) => p.id === link.targetPortId)
      );
      if (sourceNode && targetNode) {
        const sourcePort = sourceNode.getPorts().find((p: any) => p.id === link.sourcePortId);
        const targetPort = targetNode.getPorts().find((p: any) => p.id === link.targetPortId);
        if (sourcePort && targetPort) {
          const sourcePoint = sourcePort.getAbsolutePosition(sourceNode.getBoundingBox());
          const targetPoint = targetPort.getAbsolutePosition(targetNode.getBoundingBox());
          link.generatePath(sourcePoint, targetPoint);
          link.markDirty();
        }
      }
    });
    console.log(`🔗 Changed ${links.length} links to ${type} path type`);
  }

  /**
   * Toggle command panel visibility
   */
  toggleCommandPanel(): void {
    this.showCommandPanel = !this.showCommandPanel;
  }

  /**
   * Toggle control panel visibility
   */
  toggleControlPanel(): void {
    this.showControlPanel = !this.showControlPanel;
  }

  /**
   * Change routing algorithm for obstacle avoidance
   */
  changeRoutingAlgorithm(algorithm: 'none' | 'straight' | 'orthogonal' | 'a-star' | 'dijkstra' | 'visibility-graph'): void {
    this.currentRoutingAlgorithm = algorithm;
    console.log(`🛣️ Routing algorithm changed to: ${algorithm}`);

    if (algorithm === 'none') {
      console.log('   Using simple path generation (no obstacle avoidance)');
    } else {
      console.log(`   ${algorithm} will avoid obstacles when routing links`);
      console.log('   Note: Full integration with link generation coming soon');
    }

    // TODO: Integrate with LinkModel to actually use routing algorithms
    // For now, this demonstrates the available options
    const availableAlgorithms = [
      'straight - Direct paths',
      'orthogonal - Right-angle paths',
      'a-star - Fast pathfinding with obstacle avoidance',
      'dijkstra - Guaranteed shortest path with obstacle avoidance',
      'visibility-graph - Optimal for sparse obstacles'
    ];
    console.log('   Available algorithms:', availableAlgorithms);
  }

  /**
   * Log an action to history for debugging and analysis
   */
  private logHistory(
    action: string,
    category: 'node' | 'link' | 'viewport' | 'layout' | 'config' | 'interaction' | 'command',
    details: string,
    data: any,
    before?: any,
    after?: any
  ): void {
    const entry = {
      timestamp: new Date(),
      action,
      category,
      details: typeof data === 'string' ? data : JSON.stringify(data),
      before,
      after
    };
    this.history.push(entry);

    // Keep only last 100 entries to avoid memory issues
    if (this.history.length > 100) {
      this.history.shift();
    }

    // Console log for debugging
    console.log(`📜 [${category.toUpperCase()}] ${action}:`, details, data);
  }

  /**
   * Map link path type to routing algorithm name
   * Matches the logic in SVGRenderer
   */
  private mapPathTypeToAlgorithm(pathType: string): string {
    switch (pathType) {
      case 'direct':
      case 'straight':
        return 'straight';
      case 'orthogonal':
      case 'ortho':
        return 'orthogonal';
      case 'smooth':
      case 'bezier':
      case 'curved':
      default:
        return 'straight (with bezier conversion)';
    }
  }

  /**
   * Get perpendicular angle from port side
   * Matches the logic in SVGRenderer.getPerpendicularAngleFromPortSide
   */
  private getPerpendicularAngleFromSide(portSide: 'left' | 'right' | 'top' | 'bottom'): number {
    switch (portSide) {
      case 'left':
        return 180; // Arrow points left
      case 'right':
        return 0;   // Arrow points right
      case 'top':
        return -90; // Arrow points up
      case 'bottom':
        return 90;  // Arrow points down
    }
  }

  /**
   * Execute command from input
   */
  async executeCommand(): Promise<void> {
    const command = this.commandInput.trim();
    if (!command) return;

    this.commandOutput.push(`> ${command}`);
    console.log(`\n💻 Command: ${command}`);

    try {
      const parts = command.split(' ');
      const cmd = parts[0].toLowerCase();

      switch (cmd) {
        case 'add':
        case 'addnode':
          const count = parseInt(parts[1]) || 1;
          for (let i = 0; i < count; i++) {
            this.addRandomNode();
          }
          this.commandOutput.push(`✅ Added ${count} node(s)`);
          break;

        case 'clear':
          const diagram = this.engine.getDiagram();
          if (diagram) {
            const nodes = [...diagram.getNodes()];
            nodes.forEach((n: any) => diagram.removeNode(n.id));
            this.commandOutput.push(`✅ Cleared all nodes`);
            console.log('🗑️  All nodes cleared');
          }
          break;

        case 'reset':
          this.resetZoom();
          this.commandOutput.push(`✅ Reset zoom and viewport`);
          break;

        case 'fit':
        case 'fitview':
          this.fitToView();
          this.commandOutput.push(`✅ Fit viewport to show all nodes`);
          break;

        case 'zoom':
          const zoomValue = parseFloat(parts[1]);
          if (zoomValue) {
            this.zoom = Math.max(0.1, Math.min(3.0, zoomValue));
            this.commandOutput.push(`✅ Set zoom to ${this.zoom}`);
          }
          break;

        case 'list':
          const diag = this.engine.getDiagram();
          if (diag) {
            const nodeList = diag.getNodes().map((n: any) => ({
              label: n.getMetadata('label'),
              position: `(${n.position.x}, ${n.position.y})`
            }));
            this.commandOutput.push(`📋 ${diag.getNodes().length} nodes:`);
            nodeList.forEach((n: any) => {
              this.commandOutput.push(`  • ${n.label} at ${n.position}`);
            });
            console.table(nodeList);
          }
          break;

        case 'relayout':
        case 'rearrange':
          this.commandOutput.push(`🔄 Re-layouting diagram...`);
          await this.reLayoutDiagram();
          this.commandOutput.push(`✅ Re-layout complete`);
          break;

        case 'layout':
          if (parts[1]) {
            const algo = parts[1] as LayoutAlgorithmType;
            this.setLayoutAlgorithm(algo);
            this.commandOutput.push(`✅ Layout algorithm set to: ${algo}`);
          } else {
            this.commandOutput.push(`Current layout: ${this.currentLayout}`);
            this.commandOutput.push(`Available: ${this.availableLayouts.join(', ')}`);
          }
          break;

        case 'help':
          this.commandOutput.push(`📋 Available Commands`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  🔹 add [count]`);
          this.commandOutput.push(`     ~Add nodes to diagram (default: 1)`);
          this.commandOutput.push(`  🔹 clear`);
          this.commandOutput.push(`     ~Remove all nodes from diagram`);
          this.commandOutput.push(`  🔹 fit`);
          this.commandOutput.push(`     ~Fit viewport to show all nodes`);
          this.commandOutput.push(`  🔹 relayout`);
          this.commandOutput.push(`     ~Re-arrange all nodes with current layout`);
          this.commandOutput.push(`  🔹 layout [type]`);
          this.commandOutput.push(`     ~Set/view layout algorithm (grid, hierarchical, force-directed, hybrid)`);
          this.commandOutput.push(`  🔹 reset`);
          this.commandOutput.push(`     ~Reset zoom to 100% and center viewport`);
          this.commandOutput.push(`  🔹 zoom [value]`);
          this.commandOutput.push(`     ~Set zoom level (0.1 to 3.0)`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  🔍 list`);
          this.commandOutput.push(`     ~List all nodes with basic info`);
          this.commandOutput.push(`  🔍 nodes`);
          this.commandOutput.push(`     ~Show all nodes with detailed properties`);
          this.commandOutput.push(`  🔍 node [id]`);
          this.commandOutput.push(`     ~Show specific node details (or selected)`);
          this.commandOutput.push(`  🔍 links`);
          this.commandOutput.push(`     ~Show all links with detailed properties`);
          this.commandOutput.push(`  🔍 link [id]`);
          this.commandOutput.push(`     ~Show specific link details`);
          this.commandOutput.push(`  🔍 connections (or conn)`);
          this.commandOutput.push(`     ~Comprehensive analysis of all links, arrows, ports, routing`);
          this.commandOutput.push(`  🔍 viewport`);
          this.commandOutput.push(`     ~Display viewport information`);
          this.commandOutput.push(`  🔍 history [category] [limit]`);
          this.commandOutput.push(`     ~Show action history timeline with timestamps and changes`);
          this.commandOutput.push(`     ~Categories: node, link, viewport, layout, config, interaction, command`);
          this.commandOutput.push(`     ~Example: history link 30 (show last 30 link actions)`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  🔗 linktype [type]`);
          this.commandOutput.push(`     ~Change link routing algorithm (RoutingEngine)`);
          this.commandOutput.push(`     ~Types: direct, orthogonal, smooth, bezier`);
          this.commandOutput.push(`  ⚙️  help`);
          this.commandOutput.push(`     ~Show this help message`);
          this.commandOutput.push(``);
          this.commandOutput.push(`💡 Tip: Try 'linktype orthogonal' to see right-angle routing!`);
          this.commandOutput.push(`💡 All commands are case-insensitive`);
          break;

        // DEBUG: Show selected or specific node details
        case 'node':
          const diag2 = this.engine.getDiagram();
          if (diag2) {
            let targetNode;
            if (parts[1]) {
              // Find node by ID or label
              targetNode = diag2.getNodes().find((n: any) =>
                n.id === parts[1] || n.getMetadata('label') === parts[1]
              );
            } else {
              // Use selected node
              const selected = diag2.getSelectedNodes();
              targetNode = selected.length > 0 ? selected[0] : null;
            }

            if (targetNode) {
              this.commandOutput.push(`🔍 Node Details:`);
              this.commandOutput.push(`  ID: ${targetNode.id}`);
              this.commandOutput.push(`  Label: ${targetNode.getMetadata('label')}`);
              this.commandOutput.push(`  Position: (${targetNode.position.x.toFixed(1)}, ${targetNode.position.y.toFixed(1)})`);
              this.commandOutput.push(`  Size: ${targetNode.size.width} x ${targetNode.size.height}`);
              this.commandOutput.push(`  Type: ${targetNode.type}`);
              this.commandOutput.push(`  State: ${JSON.stringify(targetNode.state)}`);
              this.commandOutput.push(`  Ports: ${targetNode.getPorts().length} ports`);
              targetNode.getPorts().forEach((p: any) => {
                this.commandOutput.push(`    - ${p.side}: ${p.type} (${p.id})`);
              });
              console.log('📊 Full Node Object:', targetNode);
            } else {
              this.commandOutput.push(`❌ No node found. Select a node or specify ID/label`);
            }
          }
          break;

        // DEBUG: Show all nodes with full details
        case 'nodes':
          const diag3 = this.engine.getDiagram();
          if (diag3) {
            const nodes = diag3.getNodes();
            this.commandOutput.push(`📋 All Nodes (${nodes.length}):`);
            nodes.forEach((n: any, index: number) => {
              this.commandOutput.push(`\n  [${index}] ${n.getMetadata('label') || 'Unnamed'}`);
              this.commandOutput.push(`      ID: ${n.id}`);
              this.commandOutput.push(`      Position: (${n.position.x.toFixed(1)}, ${n.position.y.toFixed(1)})`);
              this.commandOutput.push(`      Size: ${n.size.width} x ${n.size.height}`);
              this.commandOutput.push(`      Selected: ${n.state.selected}, Locked: ${n.state.locked}, Hovered: ${n.state.hovered}`);
            });
            console.log('📊 Full Nodes Array:', nodes);
          }
          break;

        // DEBUG: Show specific link details
        case 'link':
          const diag4 = this.engine.getDiagram();
          if (diag4 && parts[1]) {
            const link = diag4.getLinks().find((l: any) => l.id === parts[1]);
            if (link) {
              this.commandOutput.push(`🔍 Link Details:`);
              this.commandOutput.push(`  ID: ${link.id}`);
              this.commandOutput.push(`  Path Type: ${link.pathType}`);
              this.commandOutput.push(`  Source Port: ${link.sourcePortId}`);
              this.commandOutput.push(`  Target Port: ${link.targetPortId}`);
              this.commandOutput.push(`  Points: ${link.points.length} points`);
              link.points.forEach((p: any, i: number) => {
                this.commandOutput.push(`    [${i}] (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
              });
              this.commandOutput.push(`  Label: ${link.getMetadata('label') || 'none'}`);
              console.log('📊 Full Link Object:', link);
            } else {
              this.commandOutput.push(`❌ Link not found: ${parts[1]}`);
            }
          } else {
            this.commandOutput.push(`❌ Usage: link <id>`);
          }
          break;

        // DEBUG: Show all links
        case 'links':
          const diag5 = this.engine.getDiagram();
          if (diag5) {
            const links = diag5.getLinks();
            this.commandOutput.push(`🔗 All Links (${links.length}):`);
            links.forEach((l: any, index: number) => {
              const sourceNode = diag5.getNodes().find((n: any) =>
                n.getPorts().some((p: any) => p.id === l.sourcePortId)
              );
              const targetNode = diag5.getNodes().find((n: any) =>
                n.getPorts().some((p: any) => p.id === l.targetPortId)
              );
              this.commandOutput.push(`\n  [${index}] ${l.getMetadata('label') || 'Unnamed'}`);
              this.commandOutput.push(`      ID: ${l.id}`);
              this.commandOutput.push(`      Type: ${l.pathType}`);
              this.commandOutput.push(`      From: ${sourceNode?.getMetadata('label')} (${l.sourcePortId})`);
              this.commandOutput.push(`      To: ${targetNode?.getMetadata('label')} (${l.targetPortId})`);
              this.commandOutput.push(`      Points: ${l.points.length}`);
            });
            console.log('📊 Full Links Array:', links);
          }
          break;

        // DEBUG: Show viewport information
        case 'viewport':
          const diag6 = this.engine.getDiagram();
          if (diag6) {
            const vp = diag6.getViewport();
            this.commandOutput.push(`👁️  Viewport Information:`);
            this.commandOutput.push(`  Position: (${vp.x.toFixed(1)}, ${vp.y.toFixed(1)})`);
            this.commandOutput.push(`  Dimensions: ${vp.width.toFixed(1)} x ${vp.height.toFixed(1)}`);
            this.commandOutput.push(`  Zoom: ${vp.zoom.toFixed(3)} (${(vp.zoom * 100).toFixed(1)}%)`);
            this.commandOutput.push(`  Visible Area: ${(vp.width * vp.height).toFixed(0)} sq units`);
            console.log('📊 Viewport Object:', vp);
          }
          break;

        // DEBUG: Show action history timeline
        case 'history':
        case 'hist':
          const filterCategory = parts[1]?.toLowerCase();
          const limit = parseInt(parts[2]) || 20;

          let filteredHistory = this.history;
          if (filterCategory && ['node', 'link', 'viewport', 'layout', 'config', 'interaction', 'command'].includes(filterCategory)) {
            filteredHistory = this.history.filter(h => h.category === filterCategory);
          }

          const displayHistory = filteredHistory.slice(-limit);

          this.commandOutput.push(`╔═══════════════════════════════════════════════════════════════════╗`);
          this.commandOutput.push(`║  📜 ACTION HISTORY - Timeline of Visual Changes                  ║`);
          this.commandOutput.push(`╚═══════════════════════════════════════════════════════════════════╝`);
          this.commandOutput.push(``);
          this.commandOutput.push(`📊 Showing last ${displayHistory.length} of ${this.history.length} total entries`);
          if (filterCategory) {
            this.commandOutput.push(`   🔍 Filtered by category: ${filterCategory.toUpperCase()}`);
          }
          this.commandOutput.push(``);

          if (displayHistory.length === 0) {
            this.commandOutput.push(`   ⚠️  No history entries found`);
            this.commandOutput.push(``);
            this.commandOutput.push(`   Available categories: node, link, viewport, layout, config, interaction, command`);
          } else {
            const diag = this.engine.getDiagram();

            displayHistory.forEach((entry, index) => {
              const time = entry.timestamp.toISOString().split('T')[1].split('.')[0];
              const relativeIndex = filteredHistory.length - displayHistory.length + index;

              const categoryIcon = {
                'node': '🔷',
                'link': '🔗',
                'viewport': '👁️',
                'layout': '📐',
                'config': '⚙️',
                'interaction': '👆',
                'command': '💻'
              }[entry.category] || '📝';

              this.commandOutput.push(`━━━ Entry #${relativeIndex + 1} ━━━`);
              this.commandOutput.push(`  ⏰ Timestamp: ${time}`);
              this.commandOutput.push(`  ${categoryIcon} Category: ${entry.category.toUpperCase()}`);
              this.commandOutput.push(`  🎬 Action: ${entry.action}`);
              this.commandOutput.push(``);

              // Parse details if it's JSON
              let parsedDetails = null;
              try {
                parsedDetails = JSON.parse(entry.details);
              } catch {
                parsedDetails = null;
              }

              // Enhanced category-specific output
              if (entry.category === 'viewport') {
                this.commandOutput.push(`  📍 Viewport Details:`);
                if (parsedDetails?.position) {
                  this.commandOutput.push(`     Position: (${parsedDetails.position.x?.toFixed?.(1) || parsedDetails.position.x}, ${parsedDetails.position.y?.toFixed?.(1) || parsedDetails.position.y})`);
                }
                if (parsedDetails?.zoom !== undefined) {
                  this.commandOutput.push(`     Zoom: ${parsedDetails.zoom} (${(parsedDetails.zoom * 100).toFixed(0)}%)`);
                }
                if (entry.before && entry.after) {
                  if (typeof entry.before === 'object' && 'x' in entry.before) {
                    const dx = entry.after.x - entry.before.x;
                    const dy = entry.after.y - entry.before.y;
                    this.commandOutput.push(`     Delta: (Δx=${dx.toFixed(1)}, Δy=${dy.toFixed(1)})`);
                  }
                }
              } else if (entry.category === 'node') {
                this.commandOutput.push(`  📦 Node Details:`);
                if (parsedDetails?.nodeId) {
                  this.commandOutput.push(`     Node ID: ${parsedDetails.nodeId}`);
                }
                if (parsedDetails?.label) {
                  this.commandOutput.push(`     Label: "${parsedDetails.label}"`);
                }
                if (parsedDetails?.position) {
                  this.commandOutput.push(`     Position: (${parsedDetails.position.x?.toFixed?.(1) || parsedDetails.position.x}, ${parsedDetails.position.y?.toFixed?.(1) || parsedDetails.position.y})`);
                }
                if (parsedDetails?.layout) {
                  this.commandOutput.push(`     Layout Algorithm: ${parsedDetails.layout}`);
                }
                if (parsedDetails?.totalNodes !== undefined) {
                  this.commandOutput.push(`     Total Nodes in Diagram: ${parsedDetails.totalNodes}`);
                }
              } else if (entry.category === 'link') {
                this.commandOutput.push(`  🔗 Link Details:`);
                if (parsedDetails?.newType) {
                  this.commandOutput.push(`     New Path Type: ${parsedDetails.newType}`);
                }
                if (parsedDetails?.algorithm) {
                  this.commandOutput.push(`     Algorithm: ${parsedDetails.algorithm}`);
                }
                if (parsedDetails?.linkCount !== undefined) {
                  this.commandOutput.push(`     Links Affected: ${parsedDetails.linkCount}`);
                }
              } else if (entry.category === 'layout') {
                this.commandOutput.push(`  📐 Layout Details:`);
                if (parsedDetails?.algorithm) {
                  this.commandOutput.push(`     Algorithm: ${parsedDetails.algorithm}`);
                }
                if (parsedDetails?.config) {
                  this.commandOutput.push(`     Configuration: ${typeof parsedDetails.config === 'string' ? parsedDetails.config : JSON.stringify(parsedDetails.config).substring(0, 60)}`);
                }
              } else {
                // Generic details output
                if (entry.details && entry.details.length < 200) {
                  this.commandOutput.push(`  📝 Details: ${entry.details}`);
                } else if (entry.details) {
                  this.commandOutput.push(`  📝 Details: ${entry.details.substring(0, 100)}...`);
                }
              }

              // Before/After comparison
              if (entry.before !== undefined && entry.after !== undefined) {
                this.commandOutput.push(``);
                this.commandOutput.push(`  🔄 State Change:`);
                const beforeStr = typeof entry.before === 'string' ? entry.before : JSON.stringify(entry.before);
                const afterStr = typeof entry.after === 'string' ? entry.after : JSON.stringify(entry.after);

                if (beforeStr.length < 60 && afterStr.length < 60) {
                  this.commandOutput.push(`     Before: ${beforeStr}`);
                  this.commandOutput.push(`     After:  ${afterStr}`);
                } else {
                  this.commandOutput.push(`     Before: ${beforeStr.substring(0, 40)}...`);
                  this.commandOutput.push(`     After:  ${afterStr.substring(0, 40)}...`);
                }
              }

              this.commandOutput.push(``);
            });

            // Summary statistics
            this.commandOutput.push(`╔═══════════════════════════════════════════════════════════════════╗`);
            this.commandOutput.push(`║  📊 HISTORY SUMMARY                                               ║`);
            this.commandOutput.push(`╚═══════════════════════════════════════════════════════════════════╝`);
            this.commandOutput.push(``);

            const categoryCounts: any = {};
            this.history.forEach(h => {
              categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1;
            });

            this.commandOutput.push(`  📊 Actions by Category (all time):`);
            Object.entries(categoryCounts).sort(([,a], [,b]) => (b as number) - (a as number)).forEach(([cat, count]) => {
              const icon = {
                'node': '🔷',
                'link': '🔗',
                'viewport': '👁️',
                'layout': '📐',
                'config': '⚙️',
                'interaction': '👆',
                'command': '💻'
              }[cat] || '📝';
              this.commandOutput.push(`     ${icon} ${cat}: ${count} actions`);
            });
            this.commandOutput.push(``);

            // Time range
            if (this.history.length > 0) {
              const firstTime = this.history[0].timestamp;
              const lastTime = this.history[this.history.length - 1].timestamp;
              const duration = lastTime.getTime() - firstTime.getTime();
              const minutes = Math.floor(duration / 60000);
              const seconds = Math.floor((duration % 60000) / 1000);

              this.commandOutput.push(`  ⏱️  Session Duration: ${minutes}m ${seconds}s`);
              this.commandOutput.push(`  📅 First Action: ${firstTime.toISOString().split('T')[1].split('.')[0]}`);
              this.commandOutput.push(`  📅 Latest Action: ${lastTime.toISOString().split('T')[1].split('.')[0]}`);
            }
          }

          console.log('📜 Full History:', this.history);
          break;

        // DEBUG: Show comprehensive connection details (links, arrows, ports, routing)
        case 'connections':
        case 'conn':
          const diagConn = this.engine.getDiagram();
          if (diagConn) {
            const links = diagConn.getLinks();
            const viewport = diagConn.getViewport();
            const nodes = diagConn.getNodes();

            this.commandOutput.push(`╔═══════════════════════════════════════════════════════════════════╗`);
            this.commandOutput.push(`║  🔗 COMPLETE VISUAL RELATIONSHIP ANALYSIS                        ║`);
            this.commandOutput.push(`╚═══════════════════════════════════════════════════════════════════╝`);
            this.commandOutput.push(``);
            this.commandOutput.push(`📊 DIAGRAM OVERVIEW:`);
            this.commandOutput.push(`   • Total Nodes: ${nodes.length}`);
            this.commandOutput.push(`   • Total Links: ${links.length}`);
            this.commandOutput.push(`   • Viewport: (${viewport.x.toFixed(1)}, ${viewport.y.toFixed(1)}) @ ${(viewport.zoom * 100).toFixed(0)}% zoom`);
            this.commandOutput.push(`   • Canvas Dimensions: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)}`);
            this.commandOutput.push(``);

            // First show all nodes with complete geometry
            this.commandOutput.push(`╔═══════════════════════════════════════════════════════════════════╗`);
            this.commandOutput.push(`║  📦 NODES - Complete Geometry & Port Configuration               ║`);
            this.commandOutput.push(`╚═══════════════════════════════════════════════════════════════════╝`);
            this.commandOutput.push(``);

            nodes.forEach((node: any, nodeIndex: number) => {
              const bbox = node.getBoundingBox();
              const ports = node.getPorts();

              this.commandOutput.push(`━━━ Node ${nodeIndex + 1}: "${node.getMetadata('label')}" ━━━`);
              this.commandOutput.push(`  🆔 Identity:`);
              this.commandOutput.push(`     ID: ${node.id}`);
              this.commandOutput.push(`     Type: ${node.type}`);
              this.commandOutput.push(`     Label: ${node.getMetadata('label')}`);
              this.commandOutput.push(``);

              this.commandOutput.push(`  📐 Geometry:`);
              this.commandOutput.push(`     Position: (${node.position.x.toFixed(1)}, ${node.position.y.toFixed(1)})`);
              this.commandOutput.push(`     Size: ${node.size.width} x ${node.size.height}px`);
              this.commandOutput.push(`     Bounding Box:`);
              this.commandOutput.push(`       • Top-Left: (${bbox.left.toFixed(1)}, ${bbox.top.toFixed(1)})`);
              this.commandOutput.push(`       • Top-Right: (${bbox.right.toFixed(1)}, ${bbox.top.toFixed(1)})`);
              this.commandOutput.push(`       • Bottom-Left: (${bbox.left.toFixed(1)}, ${bbox.bottom.toFixed(1)})`);
              this.commandOutput.push(`       • Bottom-Right: (${bbox.right.toFixed(1)}, ${bbox.bottom.toFixed(1)})`);
              this.commandOutput.push(`       • Center: (${((bbox.left + bbox.right)/2).toFixed(1)}, ${((bbox.top + bbox.bottom)/2).toFixed(1)})`);
              this.commandOutput.push(``);

              this.commandOutput.push(`  🔌 Ports (${ports.length}):`);
              ports.forEach((port: any, portIndex: number) => {
                const portPos = port.getAbsolutePosition(bbox);
                const offset = port.offset || { x: 0, y: 0 };
                this.commandOutput.push(`     [${portIndex}] ${port.side?.toUpperCase() || 'UNKNOWN'} Port:`);
                this.commandOutput.push(`         ID: ${port.id}`);
                this.commandOutput.push(`         Type: ${port.type}`);
                this.commandOutput.push(`         Side: ${port.alignment.side}`);
                this.commandOutput.push(`         Alignment: horizontal=${port.alignment.horizontal}, vertical=${port.alignment.vertical}`);
                this.commandOutput.push(`         Offset: ${offset.x}, ${offset.y}`);
                this.commandOutput.push(`         Absolute Position: (${portPos.x.toFixed(1)}, ${portPos.y.toFixed(1)})`);
                this.commandOutput.push(`         Visual: ${port.alignment.side === 'top' ? '↑' : port.alignment.side === 'bottom' ? '↓' : port.alignment.side === 'left' ? '←' : '→'} on ${port.alignment.side} edge`);
              });
              this.commandOutput.push(``);

              this.commandOutput.push(`  🎯 State:`);
              this.commandOutput.push(`     Selected: ${node.state.selected}`);
              this.commandOutput.push(`     Locked: ${node.state.locked}`);
              this.commandOutput.push(`     Hovered: ${node.state.hovered}`);
              this.commandOutput.push(``);

              // Count connections
              const nodeConnections = diagConn.getNodeConnections(node);
              this.commandOutput.push(`  🔗 Connections:`);
              this.commandOutput.push(`     Incoming: ${nodeConnections.incoming.length}`);
              this.commandOutput.push(`     Outgoing: ${nodeConnections.outgoing.length}`);
              this.commandOutput.push(`     Total: ${nodeConnections.all.length}`);
              this.commandOutput.push(``);
            });

            // Now show all links with complete visual analysis
            this.commandOutput.push(`╔═══════════════════════════════════════════════════════════════════╗`);
            this.commandOutput.push(`║  🔗 LINKS - Complete Path, Arrow & Routing Analysis              ║`);
            this.commandOutput.push(`╚═══════════════════════════════════════════════════════════════════╝`);
            this.commandOutput.push(``);

            links.forEach((link: any, index: number) => {
              // Get source and target nodes
              const sourceNode = diagConn.getNodes().find((n: any) =>
                n.getPorts().some((p: any) => p.id === link.sourcePortId)
              );
              const targetNode = diagConn.getNodes().find((n: any) =>
                n.getPorts().some((p: any) => p.id === link.targetPortId)
              );

              // Get ports
              const sourcePort = sourceNode?.getPorts().find((p: any) => p.id === link.sourcePortId);
              const targetPort = targetNode?.getPorts().find((p: any) => p.id === link.targetPortId);

              // Calculate port absolute positions
              let sourcePortPos = null;
              let targetPortPos = null;
              let sourceBounds = null;
              let targetBounds = null;
              if (sourceNode && sourcePort) {
                sourceBounds = sourceNode.getBoundingBox();
                sourcePortPos = sourcePort.getAbsolutePosition(sourceBounds);
              }
              if (targetNode && targetPort) {
                targetBounds = targetNode.getBoundingBox();
                targetPortPos = targetPort.getAbsolutePosition(targetBounds);
              }

              // Display link info
              this.commandOutput.push(`━━━ Link ${index + 1}: "${link.getMetadata('label') || 'Unnamed'}" ━━━`);
              this.commandOutput.push(`  🆔 Identity:`);
              this.commandOutput.push(`     ID: ${link.id}`);
              this.commandOutput.push(`     Label: ${link.getMetadata('label') || '(none)'}`);
              this.commandOutput.push(``);

              this.commandOutput.push(`  🎯 Routing Configuration:`);
              this.commandOutput.push(`     Path Type: ${link.pathType}`);
              this.commandOutput.push(`     Algorithm: ${this.mapPathTypeToAlgorithm(link.pathType)}`);
              this.commandOutput.push(`     Points Count: ${link.points.length}`);
              this.commandOutput.push(``);

              // Source info
              this.commandOutput.push(`  📤 SOURCE NODE: "${sourceNode?.getMetadata('label') || 'Unknown'}"`);
              this.commandOutput.push(`     Node ID: ${sourceNode?.id || 'unknown'}`);
              this.commandOutput.push(`     Node Position: (${sourceNode?.position.x.toFixed(1)}, ${sourceNode?.position.y.toFixed(1)})`);
              this.commandOutput.push(`     Node Size: ${sourceNode?.size.width} x ${sourceNode?.size.height}px`);
              if (sourceBounds) {
                this.commandOutput.push(`     Node Bounds: [${sourceBounds.left.toFixed(1)}, ${sourceBounds.top.toFixed(1)}, ${sourceBounds.right.toFixed(1)}, ${sourceBounds.bottom.toFixed(1)}]`);
              }
              this.commandOutput.push(``);
              this.commandOutput.push(`  🔌 SOURCE PORT:`);
              this.commandOutput.push(`     Port ID: ${link.sourcePortId}`);
              this.commandOutput.push(`     Port Side: ${sourcePort?.alignment.side || 'unknown'} ${sourcePort ? (sourcePort.alignment.side === 'top' ? '↑' : sourcePort.alignment.side === 'bottom' ? '↓' : sourcePort.alignment.side === 'left' ? '←' : '→') : ''}`);
              this.commandOutput.push(`     Port Type: ${sourcePort?.type || 'unknown'}`);
              if (sourcePortPos && sourcePort?.offset) {
                this.commandOutput.push(`     Port Absolute Position: (${sourcePortPos.x.toFixed(1)}, ${sourcePortPos.y.toFixed(1)})`);
                this.commandOutput.push(`     Port Offset from Node: (${sourcePort.offset.x}, ${sourcePort.offset.y})`);
              }
              this.commandOutput.push(``);

              // Target info
              this.commandOutput.push(`  📥 TARGET NODE: "${targetNode?.getMetadata('label') || 'Unknown'}"`);
              this.commandOutput.push(`     Node ID: ${targetNode?.id || 'unknown'}`);
              this.commandOutput.push(`     Node Position: (${targetNode?.position.x.toFixed(1)}, ${targetNode?.position.y.toFixed(1)})`);
              this.commandOutput.push(`     Node Size: ${targetNode?.size.width} x ${targetNode?.size.height}px`);
              if (targetBounds) {
                this.commandOutput.push(`     Node Bounds: [${targetBounds.left.toFixed(1)}, ${targetBounds.top.toFixed(1)}, ${targetBounds.right.toFixed(1)}, ${targetBounds.bottom.toFixed(1)}]`);
              }
              this.commandOutput.push(``);
              this.commandOutput.push(`  🔌 TARGET PORT:`);
              this.commandOutput.push(`     Port ID: ${link.targetPortId}`);
              this.commandOutput.push(`     Port Side: ${targetPort?.alignment.side || 'unknown'} ${targetPort ? (targetPort.alignment.side === 'top' ? '↑' : targetPort.alignment.side === 'bottom' ? '↓' : targetPort.alignment.side === 'left' ? '←' : '→') : ''}`);
              this.commandOutput.push(`     Port Type: ${targetPort?.type || 'unknown'}`);
              if (targetPortPos && targetPort?.offset) {
                this.commandOutput.push(`     Port Absolute Position: (${targetPortPos.x.toFixed(1)}, ${targetPortPos.y.toFixed(1)})`);
                this.commandOutput.push(`     Port Offset from Node: (${targetPort.offset.x}, ${targetPort.offset.y})`);
              }
              this.commandOutput.push(``);

              // Spatial relationship
              if (sourcePortPos && targetPortPos) {
                const dx = targetPortPos.x - sourcePortPos.x;
                const dy = targetPortPos.y - sourcePortPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                this.commandOutput.push(`  📏 SPATIAL RELATIONSHIP:`);
                this.commandOutput.push(`     Port-to-Port Distance: ${distance.toFixed(1)}px`);
                this.commandOutput.push(`     Port-to-Port Delta: (Δx=${dx.toFixed(1)}, Δy=${dy.toFixed(1)})`);
                this.commandOutput.push(`     Port-to-Port Angle: ${angle.toFixed(1)}° ${angle >= -45 && angle < 45 ? '→ Right' : angle >= 45 && angle < 135 ? '↓ Down' : angle >= 135 || angle < -135 ? '← Left' : '↑ Up'}`);
                this.commandOutput.push(``);
              }

              // Path points
              this.commandOutput.push(`  📍 PATH POINTS (${link.points.length} points):`);
              link.points.forEach((p: any, i: number) => {
                const label = i === 0 ? 'START' : i === link.points.length - 1 ? 'END  ' : `MID-${i}`;
                const dx = i > 0 ? p.x - link.points[i-1].x : 0;
                const dy = i > 0 ? p.y - link.points[i-1].y : 0;
                const segmentLength = i > 0 ? Math.sqrt(dx*dx + dy*dy) : 0;
                const segmentAngle = i > 0 ? Math.atan2(dy, dx) * (180 / Math.PI) : 0;

                this.commandOutput.push(`     [${i}] ${label}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
                if (i > 0) {
                  this.commandOutput.push(`         └─ From point ${i-1}: Δ(${dx.toFixed(1)}, ${dy.toFixed(1)}) | ${segmentLength.toFixed(1)}px | ${segmentAngle.toFixed(1)}°`);
                }
              });
              this.commandOutput.push(``);

              // Arrow calculations (simulate what SVGRenderer does)
              const arrowLength = 10; // Standard arrow length
              if (link.points.length >= 2) {
                // Target arrow analysis
                const lastPoint = link.points[link.points.length - 1];
                const secondLastPoint = link.points[link.points.length - 2];
                const targetDx = lastPoint.x - secondLastPoint.x;
                const targetDy = lastPoint.y - secondLastPoint.y;
                const pathAngle = Math.atan2(targetDy, targetDx) * (180 / Math.PI);

                // Determine arrow angle based on path type
                let targetArrowAngle = pathAngle;
                let arrowLogic = 'Based on last path segment direction';

                if ((link.pathType === 'bezier' || link.pathType === 'smooth') && link.points.length === 2 && targetPort) {
                  const outwardAngle = this.getPerpendicularAngleFromSide(targetPort.alignment.side);
                  targetArrowAngle = (outwardAngle + 180) % 360;
                  arrowLogic = `Port-based (${targetPort.alignment.side} port → outward ${outwardAngle}° + 180° reversal = ${targetArrowAngle}°)`;
                } else if (link.pathType === 'orthogonal' && targetPort) {
                  const outwardAngle = this.getPerpendicularAngleFromSide(targetPort.alignment.side);
                  targetArrowAngle = (outwardAngle + 180) % 360;
                  arrowLogic = `Port-based orthogonal (${targetPort.alignment.side} port → outward ${outwardAngle}° + 180° reversal = ${targetArrowAngle}°)`;
                }

                const targetAngleRad = targetArrowAngle * (Math.PI / 180);
                const targetArrowBase = {
                  x: lastPoint.x + arrowLength * Math.cos(targetAngleRad + Math.PI),
                  y: lastPoint.y + arrowLength * Math.sin(targetAngleRad + Math.PI)
                };
                const targetArrowTip = lastPoint;

                // Calculate if arrow is inside or outside target node
                let arrowVisibility = 'UNKNOWN';
                if (targetBounds) {
                  const tipInside = targetArrowTip.x >= targetBounds.left && targetArrowTip.x <= targetBounds.right &&
                                   targetArrowTip.y >= targetBounds.top && targetArrowTip.y <= targetBounds.bottom;
                  const baseInside = targetArrowBase.x >= targetBounds.left && targetArrowBase.x <= targetBounds.right &&
                                    targetArrowBase.y >= targetBounds.top && targetArrowBase.y <= targetBounds.bottom;

                  if (tipInside && baseInside) {
                    arrowVisibility = '🔴 FULLY HIDDEN (both tip and base inside node)';
                  } else if (tipInside) {
                    arrowVisibility = '🟡 PARTIALLY HIDDEN (tip inside, base outside)';
                  } else if (baseInside) {
                    arrowVisibility = '🟡 PARTIALLY HIDDEN (base inside, tip outside)';
                  } else {
                    arrowVisibility = '🟢 FULLY VISIBLE (both tip and base outside node)';
                  }
                }

                this.commandOutput.push(`  ➡️  TARGET ARROW ANALYSIS:`);
                this.commandOutput.push(`     Logic: ${arrowLogic}`);
                this.commandOutput.push(`     Path Segment Angle: ${pathAngle.toFixed(1)}°`);
                this.commandOutput.push(`     Arrow Rotation Angle: ${targetArrowAngle.toFixed(1)}° ${targetArrowAngle >= -45 && targetArrowAngle < 45 ? '→' : targetArrowAngle >= 45 && targetArrowAngle < 135 ? '↓' : targetArrowAngle >= 135 && targetArrowAngle < 225 ? '←' : targetArrowAngle >= 225 && targetArrowAngle < 315 ? '↑' : '→'}`);
                this.commandOutput.push(`     Arrow Length: ${arrowLength}px`);
                this.commandOutput.push(`     Arrow Tip (Path End): (${targetArrowTip.x.toFixed(1)}, ${targetArrowTip.y.toFixed(1)})`);
                this.commandOutput.push(`     Arrow Base: (${targetArrowBase.x.toFixed(1)}, ${targetArrowBase.y.toFixed(1)})`);
                this.commandOutput.push(`     SVG Transform: translate(${targetArrowBase.x.toFixed(1)}, ${targetArrowBase.y.toFixed(1)}) rotate(${targetArrowAngle.toFixed(1)})`);
                this.commandOutput.push(`     SVG Polygon: '0,-5 10,0 0,5' (tip at x=10 relative to base)`);
                this.commandOutput.push(`     Visibility: ${arrowVisibility}`);
                this.commandOutput.push(``);
              }

              this.commandOutput.push(``);
            });

            // Summary statistics
            this.commandOutput.push(`╔═══════════════════════════════════════════════════════════════════╗`);
            this.commandOutput.push(`║  📊 SUMMARY STATISTICS                                            ║`);
            this.commandOutput.push(`╚═══════════════════════════════════════════════════════════════════╝`);
            this.commandOutput.push(``);

            const pathTypeCounts: any = {};
            links.forEach((l: any) => {
              pathTypeCounts[l.pathType] = (pathTypeCounts[l.pathType] || 0) + 1;
            });

            this.commandOutput.push(`  🔗 Links by Path Type:`);
            Object.entries(pathTypeCounts).forEach(([type, count]) => {
              this.commandOutput.push(`     • ${type}: ${count}`);
            });
            this.commandOutput.push(``);

            const totalPorts = nodes.reduce((sum: number, n: any) => sum + n.getPorts().length, 0);
            const usedSourcePorts = new Set(links.map((l: any) => l.sourcePortId)).size;
            const usedTargetPorts = new Set(links.map((l: any) => l.targetPortId)).size;
            this.commandOutput.push(`  🔌 Port Usage:`);
            this.commandOutput.push(`     • Total Ports: ${totalPorts}`);
            this.commandOutput.push(`     • Used as Source: ${usedSourcePorts}`);
            this.commandOutput.push(`     • Used as Target: ${usedTargetPorts}`);
            this.commandOutput.push(`     • Unused: ${totalPorts - usedSourcePorts - usedTargetPorts}`);
            this.commandOutput.push(``);

            // Full objects to console for deep inspection
            console.log('🔗 Full Connection Analysis:', {
              nodes: nodes.map((n: any) => ({
                id: n.id,
                label: n.getMetadata('label'),
                position: n.position,
                size: n.size,
                bbox: n.getBoundingBox(),
                ports: n.getPorts().map((p: any) => ({
                  id: p.id,
                  side: p.alignment.side,
                  type: p.type,
                  absolutePos: p.getAbsolutePosition(n.getBoundingBox())
                }))
              })),
              links: links.map((l: any) => ({
                id: l.id,
                label: l.getMetadata('label'),
                pathType: l.pathType,
                points: l.points,
                sourcePortId: l.sourcePortId,
                targetPortId: l.targetPortId
              })),
              viewport
            });
          }
          break;

        // Set link path type for all links
        case 'linktype':
          const diag7 = this.engine.getDiagram();
          if (diag7) {
            if (parts[1]) {
              const type = parts[1] as any;
              if (['direct', 'smooth', 'orthogonal', 'bezier'].includes(type)) {
                const links = diag7.getLinks();
                const oldTypes = links.map((l: any) => ({ id: l.id, type: l.pathType }));
                links.forEach((link: any) => {
                  link.pathType = type;
                  // Mark dirty - SVGRenderer will automatically use RoutingEngine to calculate path
                  link.markDirty();
                });
                this.logHistory('link-pathtype-change', 'link', 'Changed all link path types', {
                  newType: type,
                  linkCount: links.length,
                  algorithm: this.mapPathTypeToAlgorithm(type)
                }, oldTypes, type);
                this.commandOutput.push(`✅ Set all links to: ${type}`);
                this.commandOutput.push(`   Using RoutingEngine for dynamic path calculation`);
                console.log(`🔗 Changed ${links.length} links to ${type} path type (RoutingEngine enabled)`);
              } else {
                this.commandOutput.push(`❌ Invalid type. Use: direct, smooth, orthogonal, or bezier`);
              }
            } else {
              const links = diag7.getLinks();
              if (links.length > 0) {
                this.commandOutput.push(`Current link types:`);
                links.forEach((l: any, i: number) => {
                  this.commandOutput.push(`  [${i}] ${l.getMetadata('label') || l.id}: ${l.pathType}`);
                });
              }
              this.commandOutput.push(``);
              this.commandOutput.push(`Available types (RoutingEngine):`);
              this.commandOutput.push(`  🔹 direct      - Straight line (straight algorithm)`);
              this.commandOutput.push(`  🔹 orthogonal  - Right angles (orthogonal algorithm)`);
              this.commandOutput.push(`  🔹 smooth      - Curved path (straight + bezier)`);
              this.commandOutput.push(`  🔹 bezier      - Bezier curves (straight + bezier)`);
            }
          }
          break;

        default:
          this.commandOutput.push(`❌ Unknown command: ${cmd}`);
          this.commandOutput.push(`Type 'help' for available commands`);
      }
    } catch (error) {
      this.commandOutput.push(`❌ Error: ${error}`);
      console.error('Command error:', error);
    }

    this.commandInput = '';

    // Keep output scrolled to bottom
    setTimeout(() => {
      const output = document.querySelector('.command-output');
      if (output) {
        output.scrollTop = output.scrollHeight;
      }
    }, 0);
  }

  /**
   * Clear command output
   */
  clearOutput(): void {
    this.commandOutput = [];
  }

  /**
   * Format line for display (strip special markers)
   */
  formatLine(line: string): string {
    // Remove ~ prefix from description lines
    if (line.trim().startsWith('~')) {
      return line.replace('~', '');
    }
    return line;
  }

  /**
   * Get CSS class for command output line based on content
   */
  getLineClass(line: string): string {
    const classes = ['output-line'];

    // Description lines (start with spaces and ~)
    if (line.trim().startsWith('~')) {
      classes.push('description');
    }
    // Success messages
    else if (line.includes('✅')) {
      classes.push('success');
    }
    // Error messages
    else if (line.includes('❌')) {
      classes.push('error');
    }
    // Warning messages
    else if (line.includes('⚠️')) {
      classes.push('warning');
    }
    // Info/tip messages
    else if (line.includes('💡')) {
      classes.push('info');
    }
    // Command lines (blue)
    else if (line.includes('🔹')) {
      classes.push('command');
    }
    // Query lines (purple)
    else if (line.includes('🔍')) {
      classes.push('query');
    }
    // Config lines (green)
    else if (line.includes('⚙️')) {
      classes.push('config');
    }
    // User input echo (starts with >)
    else if (line.trim().startsWith('>')) {
      classes.push('user-input');
    }
    // Header (section titles)
    else if (line.includes('📋')) {
      classes.push('header');
    }

    return classes.join(' ');
  }
}
