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
  currentLinkType: 'direct' | 'smooth' | 'orthogonal' | 'bezier' = 'smooth';

  // Routing algorithm configuration (for obstacle avoidance)
  currentRoutingAlgorithm: 'none' | 'straight' | 'orthogonal' | 'a-star' | 'dijkstra' | 'visibility-graph' = 'none';

  // Selection state (Option 1: Node Interaction)
  selectedNodeCount = 0;

  // Option 3: Animation configuration
  enableAnimation = true;
  animationDuration = 800; // milliseconds

  ngOnInit() {
    this.initializeEngine();
    this.createSampleDiagram();
    this.configureLayout();

    // Ensure all nodes are visible on initial load
    this.fitToView();

    // Subscribe to selection changes
    this.subscribeToSelectionEvents();
  }

  /**
   * Initialize the diagram engine
   */
  private initializeEngine(): void {
    this.engine = new DiagramEngine({
      interaction: {
        mode: InteractionMode.SMART, // Start with Smart/Visio-style mode
        portVisibility: PortVisibilityStrategy.ON_HOVER,
        enableSmartAutoConnect: true,
      }
    });
  }

  /**
   * Handle interaction config changes from the panel
   */
  onInteractionConfigChanged(config: Partial<InteractionConfig>): void {
    console.log('🎛️ Interaction config changed:', config);
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
    const link1 = diagram.createSmartLink(node1, node2, 'smooth');
    console.log('✅ Created smart link 1:', link1 ? 'Success' : 'Failed');
    // Option 2: Set link label to demonstrate link labels feature
    if (link1) {
      link1.setMetadata('label', 'Start');
    }

    // Option 2: connectNodes() - returns boolean success status (even simpler!)
    const success2 = diagram.connectNodes(node2, node3, 'smooth');
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

    const success3 = diagram.connectNodes(node2, node4, 'smooth');
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
    this.viewport = rect;
    console.log(`📷 Viewport panned to: (${rect.x.toFixed(1)}, ${rect.y.toFixed(1)})`);
  }

  /**
   * Handle zoom changed event from canvas (Phase 0.5 - Option B)
   * Called when user zooms with mouse wheel
   */
  onZoomChanged(newZoom: number): void {
    this.zoom = newZoom;
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

    try {
      diagram.setLayoutAlgorithm(algorithm);
      this.currentLayout = algorithm;
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
          this.commandOutput.push(`╔════════════════════════════════════════════════════════════════════╗`);
          this.commandOutput.push(`║                    📋 Available Commands                          ║`);
          this.commandOutput.push(`╚════════════════════════════════════════════════════════════════════╝`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  🔹 add [count]           Add nodes to diagram (default: 1)`);
          this.commandOutput.push(`  🔹 clear                 Remove all nodes from diagram`);
          this.commandOutput.push(`  🔹 fit                   Fit viewport to show all nodes`);
          this.commandOutput.push(`  🔹 relayout              Re-arrange all nodes with current layout`);
          this.commandOutput.push(`  🔹 layout [type]         Set/view layout algorithm`);
          this.commandOutput.push(`                             (grid, hierarchical, force-directed, hybrid)`);
          this.commandOutput.push(`  🔹 reset                 Reset zoom to 100% and center viewport`);
          this.commandOutput.push(`  🔹 zoom [value]          Set zoom level (0.1 to 3.0)`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  🔍 list                  List all nodes with basic info`);
          this.commandOutput.push(`  🔍 nodes                 Show all nodes with detailed properties`);
          this.commandOutput.push(`  🔍 node [id]             Show specific node details (or selected)`);
          this.commandOutput.push(`  🔍 links                 Show all links with detailed properties`);
          this.commandOutput.push(`  🔍 link [id]             Show specific link details`);
          this.commandOutput.push(`  🔍 viewport              Display viewport information`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  ⚙️  linktype [type]      Set link path type`);
          this.commandOutput.push(`                             (direct, smooth, orthogonal, bezier)`);
          this.commandOutput.push(`  ⚙️  help                 Show this help message`);
          this.commandOutput.push(``);
          this.commandOutput.push(`  💡 Tip: Commands are case-insensitive`);
          this.commandOutput.push(`─────────────────────────────────────────────────────────────────────`);
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

        // Set link path type for all links
        case 'linktype':
          const diag7 = this.engine.getDiagram();
          if (diag7) {
            if (parts[1]) {
              const type = parts[1] as any;
              if (['direct', 'smooth', 'orthogonal', 'bezier'].includes(type)) {
                const links = diag7.getLinks();
                links.forEach((link: any) => {
                  link.pathType = type;
                  // Recalculate path
                  const sourceNode = diag7.getNodes().find((n: any) =>
                    n.getPorts().some((p: any) => p.id === link.sourcePortId)
                  );
                  const targetNode = diag7.getNodes().find((n: any) =>
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
                this.commandOutput.push(`✅ Set all links to: ${type}`);
                console.log(`🔗 Changed ${links.length} links to ${type} path type`);
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
              this.commandOutput.push(`Available types: direct, smooth, orthogonal, bezier`);
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
   * Get CSS class for command output line based on content
   */
  getLineClass(line: string): string {
    const classes = ['output-line'];

    // Success messages
    if (line.includes('✅')) {
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
    // Box drawing / headers
    else if (line.includes('╔') || line.includes('║') || line.includes('╚') || line.includes('─')) {
      classes.push('header');
    }
    // User input echo (starts with >)
    else if (line.trim().startsWith('>')) {
      classes.push('user-input');
    }

    return classes.join(' ');
  }
}
