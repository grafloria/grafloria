import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DiagramEngine, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { LIGHT_THEME, DARK_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
  standalone: true,
  imports: [CommonModule, DiagramCanvasComponent],
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

  ngOnInit() {
    this.initializeEngine();
    this.createSampleDiagram();
  }

  /**
   * Initialize the diagram engine
   */
  private initializeEngine(): void {
    this.engine = new DiagramEngine();
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
    const padding = 50;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    this.viewport = {
      x: minX - padding,
      y: minY - padding,
      width: width,
      height: height,
    };
  }

  /**
   * Add a new node with collision avoidance
   */
  addRandomNode(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const nodeWidth = 200;
    const nodeHeight = 100;
    const spacing = 20; // Minimum spacing between nodes

    // Try to find a non-overlapping position
    let position = this.findNonOverlappingPosition(diagram, nodeWidth, nodeHeight, spacing);

    const node = new NodeModel({
      type: 'basic',
      position,
      size: { width: nodeWidth, height: nodeHeight },
    });
    node.setMetadata('label', `Node ${diagram.getNodes().length + 1}`);

    diagram.addNode(node);
  }

  /**
   * Find a position for a new node that doesn't overlap existing nodes
   */
  private findNonOverlappingPosition(
    diagram: any,
    width: number,
    height: number,
    spacing: number
  ): { x: number; y: number } {
    const nodes = diagram.getNodes();

    // If no nodes, place at viewport center
    if (nodes.length === 0) {
      return {
        x: this.viewport.x + this.viewport.width / 2 - width / 2,
        y: this.viewport.y + this.viewport.height / 2 - height / 2,
      };
    }

    // Strategy 1: Try placing below the last added node
    const lastNode = nodes[nodes.length - 1];
    const lastBounds = lastNode.getBoundingBox();

    let candidateY = lastBounds.bottom + spacing;
    let candidateX = lastBounds.left;

    // Check if this position overlaps with any node
    let maxAttempts = 20;
    let attempt = 0;

    while (attempt < maxAttempts) {
      const testBounds = {
        left: candidateX,
        top: candidateY,
        right: candidateX + width,
        bottom: candidateY + height,
        width,
        height,
      };

      // Check for collision with existing nodes
      let hasCollision = false;
      for (const node of nodes) {
        const nodeBounds = node.getBoundingBox();
        const expandedBounds = {
          left: nodeBounds.left - spacing,
          top: nodeBounds.top - spacing,
          right: nodeBounds.right + spacing,
          bottom: nodeBounds.bottom + spacing,
          width: nodeBounds.width + spacing * 2,
          height: nodeBounds.height + spacing * 2,
        };

        if (this.boundsIntersect(testBounds, expandedBounds)) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        return { x: candidateX, y: candidateY };
      }

      // Strategy 2: Try moving to the right
      if (attempt < 10) {
        candidateX += width + spacing;
      }
      // Strategy 3: Try a new row
      else {
        candidateY += height + spacing;
        candidateX = this.viewport.x + 100;
      }

      attempt++;
    }

    // Fallback: Place at viewport center with random offset
    return {
      x: this.viewport.x + this.viewport.width / 2 - width / 2 + (Math.random() - 0.5) * 100,
      y: this.viewport.y + this.viewport.height / 2 - height / 2 + (Math.random() - 0.5) * 100,
    };
  }

  /**
   * Check if two bounding boxes intersect
   */
  private boundsIntersect(box1: any, box2: any): boolean {
    return !(
      box1.right < box2.left ||
      box1.left > box2.right ||
      box1.bottom < box2.top ||
      box1.top > box2.bottom
    );
  }
}
