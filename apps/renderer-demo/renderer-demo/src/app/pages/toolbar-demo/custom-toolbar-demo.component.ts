import { Component, OnInit, ViewContainerRef, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramEngine } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { NodeToolbarService, AutoToolbarDirective } from '@grafloria/renderer-angular';

/**
 * Custom Toolbar Template Demo
 *
 * Demonstrates the NodeToolbar component with a custom template
 * showing color picker and status selector
 */
@Component({
  selector: 'app-custom-toolbar-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent, AutoToolbarDirective],
  template: `
    <div class="demo-container">
      <div class="controls">
        <h2>Custom Toolbar Template</h2>
        <p class="description">
          This demo shows a custom toolbar with color picker and status selector.
        </p>
        <p class="description">
          Click on a node to see the custom toolbar appear.
        </p>
        <button (click)="addNode()">Add Node</button>
      </div>

      <div
        class="diagram-container"
        grafloriaAutoToolbar
        [engine]="engine"
        [viewport]="viewport"
        [zoom]="zoom"
        [toolbarTemplate]="customToolbar"
      >
        <grafloria-diagram-canvas
          [engine]="engine"
          [viewport]="viewport"
          [zoom]="zoom"
        ></grafloria-diagram-canvas>
      </div>
    </div>

    <!-- Custom toolbar template -->
    <ng-template #customToolbar let-node let-actions="actions">
      <div class="custom-toolbar">
        <div class="toolbar-section">
          <label class="toolbar-label">Color:</label>
          <input
            type="color"
            [value]="node.data?.color || '#667eea'"
            (change)="updateNodeColor(node, $event)"
            class="color-input"
          />
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-section">
          <button
            (click)="updateStatus(node, 'pending')"
            class="status-btn pending"
            [class.active]="node.data?.status === 'pending'"
          >
            Pending
          </button>
          <button
            (click)="updateStatus(node, 'running')"
            class="status-btn running"
            [class.active]="node.data?.status === 'running'"
          >
            Running
          </button>
          <button
            (click)="updateStatus(node, 'completed')"
            class="status-btn completed"
            [class.active]="node.data?.status === 'completed'"
          >
            Done
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-section">
          <button (click)="deleteNode(node)" class="danger-btn" title="Delete node">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    </ng-template>
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
      margin-bottom: 15px;
      color: #333;
    }

    .description {
      font-size: 14px;
      color: #666;
      line-height: 1.5;
      margin-bottom: 15px;
    }

    .diagram-container {
      flex: 1;
      position: relative;
      background: #fafafa;
    }

    button {
      width: 100%;
      padding: 10px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: background-color 0.2s;
    }

    button:hover {
      background: #5568d3;
    }

    /* Custom toolbar styles */
    .custom-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
    }

    .toolbar-section {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .toolbar-label {
      font-size: 12px;
      color: #555;
      font-weight: 600;
    }

    .color-input {
      width: 40px;
      height: 32px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }

    .toolbar-divider {
      width: 1px;
      height: 24px;
      background: #e2e8f0;
    }

    .status-btn {
      padding: 6px 12px;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.15s;
      width: auto;
    }

    .status-btn.pending {
      background: #fef3c7;
      color: #92400e;
    }

    .status-btn.pending:hover {
      background: #fde68a;
    }

    .status-btn.pending.active {
      border-color: #f59e0b;
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
    }

    .status-btn.running {
      background: #dbeafe;
      color: #1e40af;
    }

    .status-btn.running:hover {
      background: #bfdbfe;
    }

    .status-btn.running.active {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .status-btn.completed {
      background: #d1fae5;
      color: #065f46;
    }

    .status-btn.completed:hover {
      background: #a7f3d0;
    }

    .status-btn.completed.active {
      border-color: #10b981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
    }

    .danger-btn {
      padding: 6px 10px;
      background: #fee2e2;
      color: #991b1b;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.15s;
      width: auto;
    }

    .danger-btn:hover {
      background: #fecaca;
    }

    .danger-btn i {
      font-size: 14px;
    }
  `],
})
export class CustomToolbarDemoComponent implements OnInit {
  engine!: DiagramEngine;
  viewport = { x: 0, y: 0, width: 800, height: 600 };
  zoom = 1.0;

  @ViewChild('customToolbar', { static: true }) customToolbar!: TemplateRef<any>;

  private nodeCount = 0;

  constructor(
    private toolbarService: NodeToolbarService,
    private vcr: ViewContainerRef
  ) {}

  ngOnInit() {
    this.toolbarService.setViewContainer(this.vcr);
    this.engine = new DiagramEngine();

    // Create sample nodes
    this.createInitialNodes();
  }

  createInitialNodes() {
    const model = this.engine.getModel();
    if (!model) {
      return;
    }

    model.addNode({
      type: 'default',
      data: { label: 'Task 1', status: 'pending', color: '#667eea' },
      position: { x: 100, y: 100 },
      size: { width: 150, height: 50 },
    });

    model.addNode({
      type: 'default',
      data: { label: 'Task 2', status: 'running', color: '#48bb78' },
      position: { x: 300, y: 100 },
      size: { width: 150, height: 50 },
    });

    model.addNode({
      type: 'default',
      data: { label: 'Task 3', status: 'completed', color: '#ed8936' },
      position: { x: 200, y: 250 },
      size: { width: 150, height: 50 },
    });

    this.engine.eventBus.emit('diagram:changed', { source: 'demo-init' });
  }

  addNode() {
    this.nodeCount++;
    const model = this.engine.getModel();
    if (!model) {
      return;
    }

    model.addNode({
      type: 'default',
      data: {
        label: `Task ${this.nodeCount + 3}`,
        status: 'pending',
        color: '#667eea',
      },
      position: {
        x: Math.random() * 400 + 50,
        y: Math.random() * 300 + 50,
      },
      size: { width: 150, height: 50 },
    });

    this.engine.eventBus.emit('diagram:changed', { source: 'add-node' });
  }

  updateNodeColor(node: any, event: any) {
    node.data = {
      ...node.data,
      color: event.target.value,
    };
    this.engine.eventBus.emit('diagram:changed', { source: 'color-change' });
  }

  updateStatus(node: any, status: string) {
    node.data = {
      ...node.data,
      status,
    };
    this.engine.eventBus.emit('diagram:changed', { source: 'status-change' });
  }

  deleteNode(node: any) {
    const model = this.engine.getModel();
    if (model) {
      model.removeNode(node.id);
      this.toolbarService.hide(node.id);
      this.engine.eventBus.emit('diagram:changed', { source: 'delete-node' });
    }
  }
}
