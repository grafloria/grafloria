import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramEngine } from '@grafloria/engine';
import { NodeModel } from '@grafloria/engine';
import { MobileManager } from '@grafloria/engine';
import { MobilePerformanceService } from '@grafloria/engine';
import { MobileToolbarComponent } from '@grafloria/renderer-angular';
import { ResponsiveCanvasDirective } from '@grafloria/renderer-angular';

@Component({
  selector: 'app-mobile-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, MobileToolbarComponent, ResponsiveCanvasDirective],
  template: `
    <div class="mobile-demo-container">
      <div class="demo-header">
        <h1>Mobile Touch Demo</h1>
        <p class="demo-description">
          This demo showcases mobile touch gestures and responsive design.
          Try pinch-to-zoom, two-finger pan, tap to select, and long-press for context menu.
        </p>

        <!-- Toggle Controls -->
        <div class="toggle-controls">
          <label class="toggle-label">
            <input type="checkbox" [(ngModel)]="mobileEnabled" (change)="toggleMobile()">
            <span class="toggle-text">Mobile Mode</span>
            <span class="toggle-status" [class.active]="mobileEnabled">
              {{ mobileEnabled ? 'ON' : 'OFF' }}
            </span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" [(ngModel)]="responsiveEnabled" (change)="toggleResponsive()">
            <span class="toggle-text">Auto-Resize</span>
            <span class="toggle-status" [class.active]="responsiveEnabled">
              {{ responsiveEnabled ? 'ON' : 'OFF' }}
            </span>
          </label>
          <button class="manual-btn" (click)="fitToScreen()">
            <i class="fa fa-expand"></i> Fit to Screen
          </button>
        </div>

        <div class="device-info" *ngIf="deviceInfo">
          <span class="info-badge" [class.mobile]="deviceInfo.isMobile">
            {{ deviceInfo.isMobile ? '📱 Mobile' : '🖥️ Desktop' }}
          </span>
          <span class="info-badge" [class.low-power]="deviceInfo.isLowPower">
            {{ deviceInfo.isLowPower ? '🔋 Low Power' : '⚡ Normal' }}
          </span>
          <span class="info-badge">
            Quality: {{ deviceInfo.renderQuality }}
          </span>
          <span class="info-badge" *ngIf="deviceInfo.supportsTouch">
            👆 Touch Supported
          </span>
        </div>
      </div>

      <div class="canvas-container" #canvasContainer
           grafloriaResponsiveCanvas
           [engine]="engine"
           [enabled]="responsiveEnabled"
           #responsiveDirective>
        <svg #canvas class="diagram-canvas" width="100%" height="600">
          <!-- Nodes will be rendered here -->
          <g *ngFor="let node of nodes">
            <rect
              [attr.x]="node.x"
              [attr.y]="node.y"
              [attr.width]="node.width"
              [attr.height]="node.height"
              [attr.fill]="node.selected ? '#667eea' : '#e2e8f0'"
              [attr.stroke]="node.selected ? '#5568d3' : '#cbd5e0'"
              [attr.stroke-width]="2"
              [attr.rx]="8"
            />
            <text
              [attr.x]="node.x + node.width / 2"
              [attr.y]="node.y + node.height / 2"
              text-anchor="middle"
              dominant-baseline="middle"
              [attr.fill]="node.selected ? 'white' : '#334155'"
              font-size="14"
              font-weight="600"
            >
              {{ node.label }}
            </text>
          </g>
        </svg>
      </div>

      <grafloria-mobile-toolbar
        [engine]="engine"
        [actions]="toolbarActions"
        (actionClicked)="handleAction($event)"
      ></grafloria-mobile-toolbar>

      <div class="gesture-log">
        <h3>Gesture Log</h3>
        <div class="log-entries">
          <div *ngFor="let log of gestureLogs.slice(-5)" class="log-entry">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-type">{{ log.type }}</span>
            <span class="log-detail">{{ log.detail }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .mobile-demo-container {
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: #f7fafc;
      overflow: hidden;
    }

    .demo-header {
      padding: 20px;
      background: white;
      border-bottom: 1px solid #e2e8f0;
    }

    .demo-header h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 700;
      color: #1a202c;
    }

    .demo-description {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: #64748b;
      line-height: 1.5;
    }

    .toggle-controls {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .toggle-label input[type="checkbox"] {
      width: 40px;
      height: 20px;
      cursor: pointer;
    }

    .toggle-text {
      font-size: 14px;
      font-weight: 500;
      color: #334155;
    }

    .toggle-status {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: #e2e8f0;
      color: #64748b;
      transition: all 0.2s;
    }

    .toggle-status.active {
      background: #22c55e;
      color: white;
    }

    .manual-btn {
      padding: 8px 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }

    .manual-btn:hover {
      background: #5568d3;
    }

    .manual-btn:active {
      transform: scale(0.98);
    }

    .device-info {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .info-badge {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      background: #e2e8f0;
      color: #334155;
    }

    .info-badge.mobile {
      background: #dbeafe;
      color: #1e40af;
    }

    .info-badge.low-power {
      background: #fef3c7;
      color: #92400e;
    }

    .canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      background: white;
      margin: 16px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .diagram-canvas {
      width: 100%;
      height: 100%;
      display: block;
      touch-action: none;
      user-select: none;
    }

    .gesture-log {
      padding: 16px 20px;
      background: white;
      border-top: 1px solid #e2e8f0;
      max-height: 150px;
      overflow-y: auto;
    }

    .gesture-log h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #1a202c;
    }

    .log-entries {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .log-entry {
      display: flex;
      gap: 12px;
      font-size: 12px;
      padding: 4px 0;
    }

    .log-time {
      color: #64748b;
      min-width: 60px;
    }

    .log-type {
      color: #667eea;
      font-weight: 600;
      min-width: 80px;
    }

    .log-detail {
      color: #334155;
      flex: 1;
    }

    @media (max-width: 768px) {
      .demo-header {
        padding: 16px;
      }

      .demo-header h1 {
        font-size: 20px;
      }

      .canvas-container {
        margin: 8px;
      }

      .gesture-log {
        max-height: 120px;
      }
    }
  `],
})
export class MobileDemoComponent implements OnInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<SVGElement>;
  @ViewChild('responsiveDirective') responsiveDirective!: ResponsiveCanvasDirective;

  engine!: DiagramEngine;
  mobileManager!: MobileManager;

  nodes: any[] = [];
  toolbarActions: any[] = [];
  gestureLogs: any[] = [];

  // Toggle states
  mobileEnabled = true;
  responsiveEnabled = true;

  deviceInfo = {
    isMobile: false,
    isLowPower: false,
    renderQuality: 'high' as 'high' | 'medium' | 'low',
    supportsTouch: false,
  };

  ngOnInit() {
    this.initializeEngine();
    this.createSampleDiagram();
    this.setupToolbarActions();
    this.initializeMobileManager();
    this.detectDeviceCapabilities();
  }

  ngOnDestroy() {
    if (this.mobileManager) {
      this.mobileManager.destroy();
    }
  }

  private initializeEngine() {
    this.engine = new DiagramEngine({
      mode: 'edit' as any,
      interaction: {
        enableZoom: true,
        enablePan: true,
      },
    });

    // Simple engine implementation for demo
    (this.engine as any).getZoom = () => 1;
    (this.engine as any).setZoom = (zoom: number) => {
      this.logGesture('zoom', `Zoom: ${Math.round(zoom * 100)}%`);
    };
    (this.engine as any).getPan = () => ({ x: 0, y: 0 });
    (this.engine as any).setPan = (x: number, y: number) => {
      this.logGesture('pan', `Pan: (${Math.round(x)}, ${Math.round(y)})`);
    };
    (this.engine as any).getCanvas = () => this.canvasRef?.nativeElement;
    (this.engine as any).getNodeAt = (x: number, y: number) => {
      return this.nodes.find(node =>
        x >= node.x && x <= node.x + node.width &&
        y >= node.y && y <= node.y + node.height
      );
    };
    (this.engine as any).selectNode = (node: any) => {
      this.nodes.forEach(n => n.selected = false);
      node.selected = true;
      this.logGesture('select', `Selected: ${node.label}`);
    };
    (this.engine as any).deselectAll = () => {
      this.nodes.forEach(n => n.selected = false);
      this.logGesture('deselect', 'All deselected');
    };
  }

  private initializeMobileManager() {
    // Initialize MobileManager with auto-enable
    this.mobileManager = new MobileManager(this.engine as any, {
      autoEnable: this.mobileEnabled,
      enableResponsive: this.responsiveEnabled,
      interaction: {
        enablePinchZoom: true,
        enableTwoFingerPan: true,
        enableDoubleTapZoom: true,
        enableLongPressMenu: true,
        minZoom: 0.5,
        maxZoom: 3,
      },
      onMobileEnabled: () => {
        this.logGesture('system', 'Mobile mode enabled');
      },
      onMobileDisabled: () => {
        this.logGesture('system', 'Mobile mode disabled');
      },
    });

    // Set canvas after view init
    setTimeout(() => {
      if (this.canvasRef) {
        this.mobileManager.setCanvas(this.canvasRef.nativeElement);
      }
    }, 100);
  }

  toggleMobile() {
    if (this.mobileEnabled) {
      this.mobileManager.enable();
    } else {
      this.mobileManager.disable();
    }
    this.logGesture('toggle', `Mobile mode: ${this.mobileEnabled ? 'ON' : 'OFF'}`);
  }

  toggleResponsive() {
    if (this.responsiveEnabled) {
      this.mobileManager.enableResponsive();
    } else {
      this.mobileManager.disableResponsive();
    }
    this.logGesture('toggle', `Responsive mode: ${this.responsiveEnabled ? 'ON' : 'OFF'}`);
  }

  fitToScreen() {
    this.mobileManager.triggerZoomToFit({ padding: 50 });
    this.logGesture('action', 'Fit to screen triggered');
  }

  private createSampleDiagram() {
    this.nodes = [
      {
        id: '1',
        label: 'Tap to Select',
        x: 50,
        y: 50,
        width: 150,
        height: 80,
        selected: false,
      },
      {
        id: '2',
        label: 'Pinch to Zoom',
        x: 250,
        y: 50,
        width: 150,
        height: 80,
        selected: false,
      },
      {
        id: '3',
        label: 'Two-Finger Pan',
        x: 50,
        y: 180,
        width: 150,
        height: 80,
        selected: false,
      },
      {
        id: '4',
        label: 'Long Press',
        x: 250,
        y: 180,
        width: 150,
        height: 80,
        selected: false,
      },
      {
        id: '5',
        label: 'Double Tap',
        x: 150,
        y: 310,
        width: 150,
        height: 80,
        selected: false,
      },
    ];
  }

  private setupToolbarActions() {
    this.toolbarActions = [
      {
        id: 'add-node',
        icon: 'fa-plus',
        label: 'Add Node',
        onClick: () => this.addNode(),
      },
      {
        id: 'reset',
        icon: 'fa-refresh',
        label: 'Reset View',
        onClick: () => this.resetView(),
      },
      {
        id: 'clear-log',
        icon: 'fa-trash',
        label: 'Clear Log',
        onClick: () => this.clearLog(),
      },
    ];
  }

  private detectDeviceCapabilities() {
    const info = this.mobileManager.getDeviceInfo();
    this.deviceInfo = {
      isMobile: info.isMobile,
      isLowPower: info.isLowPower,
      renderQuality: info.renderQuality,
      supportsTouch: info.supportsTouch,
    };

    this.logGesture('info', `Device: ${this.deviceInfo.isMobile ? 'Mobile' : 'Desktop'}, Touch: ${this.deviceInfo.supportsTouch}`);
  }

  private logGesture(type: string, detail: string) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    this.gestureLogs.push({ time, type, detail });

    // Keep only last 20 logs
    if (this.gestureLogs.length > 20) {
      this.gestureLogs.shift();
    }
  }

  handleAction(action: any) {
    this.logGesture('action', `Toolbar: ${action.label}`);
  }

  private addNode() {
    const newNode = {
      id: `${this.nodes.length + 1}`,
      label: `Node ${this.nodes.length + 1}`,
      x: Math.random() * 300 + 50,
      y: Math.random() * 300 + 50,
      width: 150,
      height: 80,
      selected: false,
    };
    this.nodes.push(newNode);
    this.logGesture('add', `Added: ${newNode.label}`);
  }

  private resetView() {
    this.logGesture('reset', 'View reset');
  }

  private clearLog() {
    this.gestureLogs = [];
  }
}
