import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  LinkModel,
  PortModel,
  LayoutAlgorithmType,
  GridLayoutOptions
} from '@grafloria/engine';
import { LIGHT_THEME, DARK_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent],
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

  // Layout configuration
  currentLayout: LayoutAlgorithmType = 'grid';
  availableLayouts: LayoutAlgorithmType[] = ['grid', 'hierarchical'];

  ngOnInit() {
    this.initializeEngine();
    this.createSampleDiagram();
    this.configureLayout();
  }

  /**
   * Initialize the diagram engine
   */
  private initializeEngine(): void {
    this.engine = new DiagramEngine();
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

    // Create ports
    const port1Out = new PortModel({ type: 'output', position: { x: 1, y: 0.5 } });
    const port2In = new PortModel({ type: 'input', position: { x: 0, y: 0.5 } });
    const port2Out = new PortModel({ type: 'output', position: { x: 1, y: 0.5 } });
    const port3In = new PortModel({ type: 'input', position: { x: 0, y: 0.5 } });
    const port4In = new PortModel({ type: 'input', position: { x: 0, y: 0.5 } });
    const port2OutAlt = new PortModel({ type: 'output', position: { x: 0.5, y: 1 } });

    // Add ports to nodes
    node1.addPort(port1Out);
    node2.addPort(port2In);
    node2.addPort(port2Out);
    node2.addPort(port2OutAlt);
    node3.addPort(port3In);
    node4.addPort(port4In);

    // Create links
    const link1 = new LinkModel(port1Out.id, port2In.id, 'smooth');
    link1.points = [
      { x: 300, y: 150 },
      { x: 450, y: 150 },
    ];

    const link2 = new LinkModel(port2Out.id, port3In.id, 'smooth');
    link2.points = [
      { x: 650, y: 150 },
      { x: 800, y: 150 },
    ];

    const link3 = new LinkModel(port2OutAlt.id, port4In.id, 'smooth');
    link3.points = [
      { x: 550, y: 200 },
      { x: 550, y: 350 },
      { x: 450, y: 350 },
    ];

    // Add links to diagram
    diagram.addLink(link1);
    diagram.addLink(link2);
    diagram.addLink(link3);
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
    this.zoom = Math.min(this.zoom * 1.1, 3.0);
  }

  /**
   * Zoom out (divide by 1.1 for proportional zooming)
   */
  zoomOut(): void {
    this.zoom = Math.max(this.zoom / 1.1, 0.1);
  }

  /**
   * Reset zoom to 100% and fit all nodes in view
   */
  resetZoom(): void {
    this.zoom = 1.0;
    this.fitToView();
  }

  /**
   * Fit viewport to show all nodes (without changing zoom)
   */
  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) {
      this.viewport = { x: 0, y: 0, width: 1200, height: 800 };
      return;
    }

    const nodes = diagram.getNodes();
    if (nodes.length === 0) {
      this.viewport = { x: 0, y: 0, width: 1200, height: 800 };
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

    // Add padding around nodes
    const padding = 100; // Increased padding for better visibility
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate viewport size to fit content with padding
    const viewportWidth = contentWidth + padding * 2;
    const viewportHeight = contentHeight + padding * 2;

    // Center the viewport on the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.viewport = {
      x: centerX - viewportWidth / 2,
      y: centerY - viewportHeight / 2,
      width: viewportWidth,
      height: viewportHeight,
    };

    console.log(`📐 Fit to view: bounds=(${minX}, ${minY}) to (${maxX}, ${maxY}), viewport=${JSON.stringify(this.viewport)}`);
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
      await diagram.reLayout();
      console.log(`✅ Re-layout complete!`);

      // Fit viewport to show all nodes after re-layout
      this.fitToView();
    } catch (error) {
      console.error('❌ Re-layout failed:', error);
    }
  }

  /**
   * Toggle command panel visibility
   */
  toggleCommandPanel(): void {
    this.showCommandPanel = !this.showCommandPanel;
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
          this.commandOutput.push(`Available commands:`);
          this.commandOutput.push(`  add [count] - Add nodes (default 1)`);
          this.commandOutput.push(`  clear - Remove all nodes`);
          this.commandOutput.push(`  fit - Fit viewport to show all nodes`);
          this.commandOutput.push(`  relayout - Re-arrange all nodes`);
          this.commandOutput.push(`  layout [type] - Set/view layout algorithm`);
          this.commandOutput.push(`  reset - Reset zoom and viewport`);
          this.commandOutput.push(`  zoom [value] - Set zoom level`);
          this.commandOutput.push(`  list - List all nodes`);
          this.commandOutput.push(`  help - Show this help`);
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
}
