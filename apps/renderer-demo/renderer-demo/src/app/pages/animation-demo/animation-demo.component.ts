import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramEngine, NodeModel, LinkModel } from '@grafloria/engine';
import { AnimationPresets, LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';

@Component({
    selector: 'app-animation-demo',
    imports: [CommonModule, FormsModule, DiagramCanvasComponent],
    template: `
    <div class="animation-demo">
      <div class="header">
        <h1>🎨 Practical Animation Demo</h1>
        <p class="subtitle">Interactive diagram with animated nodes and edges</p>
      </div>

      <div class="demo-container">
        <!-- Canvas -->
        <div class="canvas-area">
          <grafloria-diagram-canvas
            *ngIf="engine"
            [engine]="engine"
            [viewport]="viewport"
            [zoom]="zoom"
            [theme]="theme"
            class="diagram-canvas">
          </grafloria-diagram-canvas>
        </div>

        <!-- Control Panel -->
        <div class="control-panel">
          <h3>Animation Controls</h3>

          <!-- Node Selection -->
          <div class="control-section">
            <h4>Select Node</h4>
            <div class="btn-group">
              <button
                *ngFor="let node of nodes"
                [class.active]="selectedNode?.id === node.id"
                (click)="selectNode(node)"
              >
                {{ node.getMetadata('label') }}
              </button>
            </div>
          </div>

          <!-- Node Border Animation -->
          <div class="control-section" *ngIf="selectedNode">
            <h4>Node Border Animation</h4>
            <div class="form-group">
              <label>
                <input
                  type="checkbox"
                  [(ngModel)]="selectedNode.style.animatedBorder"
                  (ngModelChange)="updateNodeAnimation()"
                >
                Enable Border Animation
              </label>
            </div>

            <div class="form-group" *ngIf="selectedNode.style.animatedBorder">
              <label>Animation Type:</label>
              <select
                [(ngModel)]="selectedNode.style.borderAnimationType"
                (ngModelChange)="updateNodeAnimation()"
              >
                <option value="gradient">Gradient (Rotating)</option>
                <option value="pulse">Pulse (Shadow)</option>
                <option value="breathe">Breathe (Scale)</option>
                <option value="shimmer">Shimmer (Highlight)</option>
              </select>
            </div>

            <div class="form-group" *ngIf="selectedNode.style.animatedBorder">
              <label>Speed:</label>
              <select
                [(ngModel)]="selectedNode.style.borderAnimationSpeed"
                (ngModelChange)="updateNodeAnimation()"
              >
                <option [ngValue]="0.5">Slow (0.5x)</option>
                <option [ngValue]="1">Normal (1x)</option>
                <option [ngValue]="1.5">Fast (1.5x)</option>
                <option [ngValue]="2">Very Fast (2x)</option>
              </select>
            </div>
          </div>

          <!-- Node Status Animation -->
          <div class="control-section" *ngIf="selectedNode">
            <h4>Node Status Animation</h4>
            <div class="form-group">
              <label>
                <input
                  type="checkbox"
                  [(ngModel)]="selectedNode.state.animateStatus"
                  (ngModelChange)="updateNodeAnimation()"
                >
                Enable Status Animation
              </label>
            </div>

            <div class="form-group" *ngIf="selectedNode.state.animateStatus">
              <label>Status:</label>
              <select
                [(ngModel)]="selectedNode.state.status"
                (ngModelChange)="updateNodeAnimation()"
              >
                <option value="idle">Idle (No animation)</option>
                <option value="pending">Pending (Pulse)</option>
                <option value="running">Running (Active)</option>
                <option value="warning">Warning (Blink)</option>
                <option value="error">Error (Shake)</option>
                <option value="completed">Completed (Fade-in)</option>
              </select>
            </div>
          </div>

          <!-- Link Animation -->
          <div class="control-section">
            <h4>Link Animation</h4>
            <div class="form-group" *ngIf="link && link.style && link.style.animation">
              <label>Animation Type:</label>
              <select
                [(ngModel)]="link.style.animation!.type"
                (ngModelChange)="updateLinkAnimation()"
              >
                <option value="none">None</option>
                <option value="marching-ants">Marching Ants</option>
                <option value="flow">Flow</option>
                <option value="pulse">Pulse</option>
                <option value="dash-flow">Dash Flow</option>
              </select>
            </div>

            <div class="form-group" *ngIf="link && link.style && link.style.animation && link.style.animation!.type !== 'none'">
              <label>Speed:</label>
              <select
                [(ngModel)]="link.style.animation!.speed"
                (ngModelChange)="updateLinkAnimation()"
              >
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </div>

            <div class="form-group" *ngIf="link && link.style && link.style.animation && link.style.animation!.type !== 'none'">
              <label>Direction:</label>
              <select
                [(ngModel)]="link.style.animation!.direction"
                (ngModelChange)="updateLinkAnimation()"
              >
                <option value="forward">Forward →</option>
                <option value="reverse">Reverse ←</option>
              </select>
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="control-section">
            <h4>Quick Presets</h4>
            <div class="preset-buttons">
              <button (click)="applyWorkflowPreset('RUNNING')" class="preset-btn running">
                ⚙️ Running
              </button>
              <button (click)="applyWorkflowPreset('ERROR')" class="preset-btn error">
                ❌ Error
              </button>
              <button (click)="applyWorkflowPreset('WARNING')" class="preset-btn warning">
                ⚠️ Warning
              </button>
              <button (click)="applyWorkflowPreset('COMPLETED')" class="preset-btn success">
                ✅ Completed
              </button>
            </div>
          </div>

          <!-- Global Controls -->
          <div class="control-section">
            <h4>Global Controls</h4>
            <button (click)="clearAllAnimations()" class="btn-secondary">
              Clear All Animations
            </button>
            <button (click)="resetDiagram()" class="btn-secondary">
              Reset Diagram
            </button>
          </div>

          <!-- Info -->
          <div class="info-panel">
            <h4>💡 Tip</h4>
            <p>Select a node to configure its animations. Changes apply in real-time!</p>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .animation-demo {
      padding: 20px;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      text-align: center;
      margin-bottom: 20px;
    }

    .header h1 {
      color: #667eea;
      font-size: 2em;
      margin-bottom: 5px;
    }

    .subtitle {
      color: #6c757d;
      font-size: 1.1em;
    }

    .demo-container {
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 20px;
      flex: 1;
      overflow: hidden;
    }

    .canvas-area {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
      position: relative;
      display: flex;
    }

    .diagram-canvas {
      width: 100%;
      height: 100%;
    }

    .control-panel {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 20px;
      overflow-y: auto;
    }

    .control-panel h3 {
      color: #667eea;
      margin-bottom: 20px;
      font-size: 1.3em;
    }

    .control-panel h4 {
      color: #495057;
      margin-bottom: 12px;
      font-size: 1em;
      border-bottom: 2px solid #e9ecef;
      padding-bottom: 8px;
    }

    .control-section {
      margin-bottom: 25px;
    }

    .btn-group {
      display: flex;
      gap: 8px;
      margin-bottom: 15px;
    }

    .btn-group button {
      flex: 1;
      padding: 10px;
      background: #f8f9fa;
      border: 2px solid #dee2e6;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .btn-group button:hover {
      background: #e7f1ff;
      border-color: #667eea;
    }

    .btn-group button.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .form-group {
      margin-bottom: 15px;
    }

    .form-group label {
      display: block;
      color: #495057;
      font-size: 0.9em;
      margin-bottom: 6px;
      font-weight: 500;
    }

    .form-group input[type="checkbox"] {
      margin-right: 8px;
    }

    .form-group select {
      width: 100%;
      padding: 8px 12px;
      border: 2px solid #dee2e6;
      border-radius: 6px;
      font-size: 14px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .form-group select:focus {
      outline: none;
      border-color: #667eea;
    }

    .preset-buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .preset-btn {
      padding: 12px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
      color: white;
    }

    .preset-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .preset-btn.running {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .preset-btn.error {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    }

    .preset-btn.warning {
      background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
    }

    .preset-btn.success {
      background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
    }

    .btn-secondary {
      width: 100%;
      padding: 10px;
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: #5a6268;
      transform: translateY(-1px);
    }

    .info-panel {
      background: #e7f1ff;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 15px;
      margin-top: 20px;
    }

    .info-panel h4 {
      color: #667eea;
      margin: 0 0 8px 0;
      border: none;
      padding: 0;
    }

    .info-panel p {
      color: #495057;
      font-size: 0.9em;
      margin: 0;
      line-height: 1.5;
    }
  `]
})
export class AnimationDemoComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1;
  theme: Theme = LIGHT_THEME;

  nodes: NodeModel[] = [];
  link: LinkModel | undefined = undefined;
  selectedNode: NodeModel | null = null;

  ngOnInit() {
    this.engine = new DiagramEngine();
    this.initializeDiagram();
  }

  initializeDiagram() {
    // Create diagram
    const diagram = this.engine.createDiagram('Animation Demo');

    // Create two nodes with animations
    const node1 = new NodeModel({
      type: 'basic',
      position: { x: 150, y: 300 },
      size: { width: 180, height: 100 }
    });
    node1.setMetadata('label', 'Source Node');
    node1.style = {
      fill: '#667eea',
      stroke: '#5568d3',
      strokeWidth: 2,
      borderRadius: 8,
      animatedBorder: true,
      borderAnimationType: 'gradient',
      borderAnimationSpeed: 1.5
    };
    node1.state = {
      visible: true,
      locked: false,
      selected: false,
      hovered: false,
      focused: false,
      expanded: false,
      enabled: true,
      status: 'running',
      animateStatus: true
    };

    const node2 = new NodeModel({
      type: 'basic',
      position: { x: 550, y: 300 },
      size: { width: 180, height: 100 }
    });
    node2.setMetadata('label', 'Target Node');
    node2.style = {
      fill: '#764ba2',
      stroke: '#653a8f',
      strokeWidth: 2,
      borderRadius: 8,
      animatedBorder: true,
      borderAnimationType: 'pulse',
      borderAnimationSpeed: 2
    };
    node2.state = {
      visible: true,
      locked: false,
      selected: false,
      hovered: false,
      focused: false,
      expanded: false,
      enabled: true,
      status: 'idle',
      animateStatus: false
    };

    // Add nodes to diagram
    diagram.addNode(node1);
    diagram.addNode(node2);

    // Create link with animation
    this.link = diagram.createSmartLink(node1, node2, 'orthogonal');
    if (this.link && this.link.style) {
      this.link.style.animation = {
        type: 'flow',
        speed: 'normal',
        direction: 'forward'
      };
    }

    this.nodes = [node1, node2];
    this.selectedNode = node1;

    console.log('✨ Animation demo initialized with 2 nodes and 1 animated link');
  }

  selectNode(node: NodeModel) {
    // Deselect all nodes
    this.nodes.forEach(n => {
      if (n.state) {
        n.state.selected = false;
      }
    });

    // Select clicked node
    if (node.state) {
      node.state.selected = true;
    }

    this.selectedNode = node;
  }

  updateNodeAnimation() {
    // DiagramCanvasComponent will auto-update on changes
  }

  updateLinkAnimation() {
    // DiagramCanvasComponent will auto-update on changes
  }

  applyWorkflowPreset(presetName: string) {
    if (!this.selectedNode) return;

    const presets: any = {
      'RUNNING': AnimationPresets.WORKFLOW.RUNNING,
      'ERROR': AnimationPresets.WORKFLOW.ERROR,
      'WARNING': AnimationPresets.WORKFLOW.WARNING,
      'COMPLETED': AnimationPresets.WORKFLOW.COMPLETED
    };

    const preset = presets[presetName];
    if (preset && preset.node) {
      // Apply preset to selected node
      if (this.selectedNode.state && preset.node.status) {
        this.selectedNode.state.status = preset.node.status as any;
        this.selectedNode.state.animateStatus = preset.node.animateStatus || false;
      }

      if (preset.node.style) {
        this.selectedNode.style = {
          ...this.selectedNode.style,
          ...preset.node.style
        };
      }

      // Apply link animation if available
      if (this.link && preset.link) {
        this.link.style = this.link.style || {};
        this.link.style.animation = preset.link;
      }
    }
  }

  clearAllAnimations() {
    this.nodes.forEach(node => {
      if (node.style) {
        node.style.animatedBorder = false;
      }
      if (node.state) {
        node.state.animateStatus = false;
        node.state.status = 'idle';
      }
    });

    if (this.link && this.link.style && this.link.style.animation) {
      this.link.style.animation.type = 'none';
    }
  }

  resetDiagram() {
    // Reset to initial state
    if (this.nodes[0]) {
      this.nodes[0].style = {
        ...this.nodes[0].style,
        animatedBorder: true,
        borderAnimationType: 'gradient',
        borderAnimationSpeed: 1.5
      };
      if (this.nodes[0].state) {
        this.nodes[0].state.status = 'running';
        this.nodes[0].state.animateStatus = true;
      }
    }

    if (this.nodes[1]) {
      this.nodes[1].style = {
        ...this.nodes[1].style,
        animatedBorder: true,
        borderAnimationType: 'pulse',
        borderAnimationSpeed: 2
      };
      if (this.nodes[1].state) {
        this.nodes[1].state.status = 'idle';
        this.nodes[1].state.animateStatus = false;
      }
    }

    if (this.link && this.link.style) {
      this.link.style.animation = {
        type: 'flow',
        speed: 'normal',
        direction: 'forward'
      };
    }
  }
}
