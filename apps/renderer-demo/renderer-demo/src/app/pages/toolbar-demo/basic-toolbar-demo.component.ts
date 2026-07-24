import { Component, OnInit, ViewContainerRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramEngine, DiagramModel } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { NodeToolbarService, AutoToolbarDirective, createStandardActions } from '@grafloria/angular';

/**
 * Basic NodeToolbar Demo
 *
 * Demonstrates the NodeToolbar component with auto show/hide on selection
 */
@Component({
  selector: 'app-basic-toolbar-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent, AutoToolbarDirective],
  template: `
    <div class="demo-container">
      <div class="controls">
        <h2>NodeToolbar Demo</h2>

        <div class="info">
          <p>Click on any node to show its toolbar.</p>
          <p>The toolbar stays visible at all zoom levels.</p>
        </div>

        <div class="control-group">
          <label>Toolbar Position:</label>
          <select [(ngModel)]="toolbarPosition" (change)="onPositionChange()">
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>

        <div class="control-group">
          <label>Zoom: {{ zoom.toFixed(2) }}</label>
          <input
            type="range"
            [min]="0.5"
            [max]="2.0"
            [step]="0.1"
            [(ngModel)]="zoom"
            (input)="onZoomChange()"
          />
        </div>

        <button (click)="createNode()">Add Node</button>
        <button (click)="clearSelection()">Clear Selection</button>
      </div>

      <div
        class="diagram-container"
        grafloriaAutoToolbar
        [engine]="engine"
        [viewport]="viewport"
        [zoom]="zoom"
        [toolbarPosition]="toolbarPosition"
        [toolbarActions]="actions"
      >
        <grafloria-diagram-canvas
          [engine]="engine"
          [viewport]="viewport"
          [zoom]="zoom"
          (viewportChanged)="onViewportChanged($event)"
          (zoomChanged)="onZoomChanged($event)"
        ></grafloria-diagram-canvas>
      </div>
    </div>
  `,
  styles: [`
    .demo-container {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    .controls {
      width: 300px;
      padding: 20px;
      background: #f5f5f5;
      overflow-y: auto;
      border-right: 1px solid #ddd;
    }

    .controls h2 {
      margin-top: 0;
      margin-bottom: 20px;
      color: #333;
    }

    .diagram-container {
      flex: 1;
      position: relative;
      background: #fafafa;
    }

    .control-group {
      margin-bottom: 20px;
    }

    .control-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #555;
    }

    .control-group select,
    .control-group input[type="range"] {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .info {
      padding: 15px;
      background: #e3f2fd;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .info p {
      margin: 5px 0;
      font-size: 14px;
      color: #1976d2;
    }

    button {
      width: 100%;
      padding: 10px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 10px;
      font-size: 14px;
      font-weight: 600;
      transition: background-color 0.2s;
    }

    button:hover {
      background: #5568d3;
    }

    button:active {
      background: #4451b8;
    }
  `],
})
export class BasicToolbarDemoComponent implements OnInit {
  engine!: DiagramEngine;
  viewport = { x: 0, y: 0, width: 800, height: 600 };
  zoom = 1.0;
  toolbarPosition: 'top' | 'bottom' | 'left' | 'right' = 'top';
  actions: any[] = [];

  private nodeCount = 0;

  constructor(
    private toolbarService: NodeToolbarService,
    private vcr: ViewContainerRef
  ) {}

  ngOnInit() {
    // Initialize toolbar service
    this.toolbarService.setViewContainer(this.vcr);

    // Create engine
    this.engine = new DiagramEngine();

    // Create actions
    this.actions = createStandardActions(this.engine, (node) => {
      alert(`Editing node: ${node.data.label || node.id}`);
    });

    // Create initial nodes
    this.createInitialNodes();
  }

  createInitialNodes() {
    const model = this.engine.getModel();
    if (!model) {
      return;
    }

    model.addNode({
      type: 'default',
      data: { label: 'Node 1' },
      position: { x: 100, y: 100 },
      size: { width: 150, height: 50 },
    });

    model.addNode({
      type: 'default',
      data: { label: 'Node 2' },
      position: { x: 300, y: 100 },
      size: { width: 150, height: 50 },
    });

    model.addNode({
      type: 'default',
      data: { label: 'Node 3' },
      position: { x: 200, y: 250 },
      size: { width: 150, height: 50 },
    });

    // Trigger repaint
    this.engine.eventBus.emit('diagram:changed', { source: 'demo-init' });
  }

  createNode() {
    this.nodeCount++;
    const model = this.engine.getModel();
    if (!model) {
      return;
    }

    model.addNode({
      type: 'default',
      data: { label: `New Node ${this.nodeCount}` },
      position: {
        x: Math.random() * 400 + 50,
        y: Math.random() * 300 + 50,
      },
      size: { width: 150, height: 50 },
    });

    this.engine.eventBus.emit('diagram:changed', { source: 'add-node' });
  }

  clearSelection() {
    // Emit deselect events for all nodes
    const model = this.engine.getModel();
    if (model) {
      const nodes = model.getNodes();
      nodes.forEach(node => {
        if (node.state.selected) {
          node.state.selected = false;
          this.engine.eventBus.emit('node:deselected', { node });
        }
      });
    }
  }

  onPositionChange() {
    // Position will be picked up by the directive via input binding
    this.toolbarService.hideAll();
  }

  onZoomChange() {
    this.toolbarService.setZoom(this.zoom);
  }

  onViewportChanged(viewport: any) {
    this.viewport = viewport;
    this.toolbarService.setViewport(viewport);
  }

  onZoomChanged(zoom: number) {
    this.zoom = zoom;
    this.toolbarService.setZoom(zoom);
  }
}
