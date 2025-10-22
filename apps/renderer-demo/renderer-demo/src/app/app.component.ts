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
    const port1Out = new PortModel('output', { x: 1, y: 0.5 });
    const port2In = new PortModel('input', { x: 0, y: 0.5 });
    const port2Out = new PortModel('output', { x: 1, y: 0.5 });
    const port3In = new PortModel('input', { x: 0, y: 0.5 });
    const port4In = new PortModel('input', { x: 0, y: 0.5 });
    const port2OutAlt = new PortModel('output', { x: 0.5, y: 1 });

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
   * Zoom in
   */
  zoomIn(): void {
    this.zoom = Math.min(this.zoom + 0.1, 3.0);
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    this.zoom = Math.max(this.zoom - 0.1, 0.1);
  }

  /**
   * Reset zoom
   */
  resetZoom(): void {
    this.zoom = 1.0;
  }

  /**
   * Add a random node
   */
  addRandomNode(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const x = Math.random() * 1000 + 100;
    const y = Math.random() * 600 + 100;

    const node = new NodeModel({
      type: 'basic',
      position: { x, y },
      size: { width: 200, height: 100 },
    });
    node.setMetadata('label', `Node ${diagram.getNodes().length + 1}`);

    diagram.addNode(node);
  }
}
