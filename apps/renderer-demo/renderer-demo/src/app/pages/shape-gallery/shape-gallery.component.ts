// Shape Gallery Demo (Phase 3.6)
// Demonstrates all shape system features from Phases 3.1-3.5

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DiagramCanvasComponent,
  ComponentRendererService,
} from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeFactory,
  type NodeTemplate,
  type ShapeType,
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent],
  selector: 'app-shape-gallery',
  templateUrl: './shape-gallery.component.html',
  styleUrl: './shape-gallery.component.css',
})
export class ShapeGalleryComponent implements OnInit, OnDestroy {
  title = 'Shape Gallery - Phases 3.1-3.5 Demo';

  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1400, height: 900 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  // Demo sections
  sections = [
    { id: 'shapes', name: '3.1: Shapes', active: true },
    { id: 'ports', name: '3.2: Port Positioning', active: true },
    { id: 'hitdetection', name: '3.3: Hit Detection', active: true },
    { id: 'templates', name: '3.4: HTML Templates', active: true },
    { id: 'hybrid', name: '3.5: Hybrid Rendering', active: true },
  ];

  // Shape types to demonstrate
  shapeTypes: ShapeType[] = ['rect', 'circle', 'diamond', 'ellipse', 'hexagon'];

  // Selected shape for interaction
  selectedShape: ShapeType = 'circle';

  // Event log
  eventLog: string[] = [];
  maxLogEntries = 10;

  // Stats
  stats = {
    totalNodes: 0,
    clicksRecorded: 0,
    eventsEmitted: 0,
  };

  constructor(private componentRenderer: ComponentRendererService) {}

  ngOnInit(): void {
    this.engine = new DiagramEngine();
    this.engine.createDiagram('shape-gallery');

    // Subscribe to events to demonstrate Phase 3.4
    this.subscribeToEvents();

    // Create all demo nodes
    this.createPhase31Demo(); // Shape types
    this.createPhase32Demo(); // Port positioning
    this.createPhase33Demo(); // Hit detection
    this.createPhase34Demo(); // HTML templates with events
    this.createPhase35Demo(); // Hybrid rendering

    this.updateStats();
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
  }

  /**
   * Phase 3.1 Demo: All 5 shape types
   */
  private createPhase31Demo(): void {
    const colors = ['#e3f2fd', '#fff3e0', '#f3e5f5', '#e8f5e9', '#fce4ec'];
    const strokes = ['#2196f3', '#ff9800', '#9c27b0', '#4caf50', '#e91e63'];

    this.shapeTypes.forEach((shapeType, index) => {
      const template: NodeTemplate = {
        id: `shape-${shapeType}`,
        version: '1.0.0',
        meta: {
          name: `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} Shape`,
          category: 'shapes',
          description: `Phase 3.1: ${shapeType} shape rendering`,
        },
        structure: {
          type: shapeType,
          size: { width: 120, height: 100 },
          shape: {
            type: shapeType,
            fill: colors[index],
            stroke: strokes[index],
            strokeWidth: 3,
            cornerRadius: shapeType === 'rect' ? 12 : undefined,
          },
          ports: {
            enabled: true,
            defaultVisibility: 'on-hover',
            top: { enabled: true },
            right: { enabled: true },
            bottom: { enabled: true },
            left: { enabled: true },
          },
        },
        defaultData: {
          shapeName: shapeType,
          phase: '3.1',
        },
      };

      const node = NodeFactory.createFromTemplate(template, {
        position: { x: 50 + index * 150, y: 50 },
      });

      this.engine.diagram?.addNode(node);
    });
  }

  /**
   * Phase 3.2 Demo: Port positioning on different shapes
   */
  private createPhase32Demo(): void {
    const template: NodeTemplate = {
      id: 'port-demo-circle',
      version: '1.0.0',
      meta: {
        name: 'Circle with Ports',
        category: 'ports',
        description: 'Phase 3.2: Ports positioned on circle circumference',
      },
      structure: {
        type: 'circle',
        size: { width: 150, height: 150 },
        shape: {
          type: 'circle',
          fill: '#fff3e0',
          stroke: '#ff9800',
          strokeWidth: 3,
        },
        ports: {
          enabled: true,
          defaultVisibility: 'always',
          top: { enabled: true },
          right: { enabled: true },
          bottom: { enabled: true },
          left: { enabled: true },
        },
      },
      defaultData: {
        description: 'Ports at cardinal points',
        phase: '3.2',
      },
    };

    const node = NodeFactory.createFromTemplate(template, {
      position: { x: 50, y: 220 },
    });

    this.engine.diagram?.addNode(node);

    // Diamond with ports
    const diamondTemplate: NodeTemplate = {
      id: 'port-demo-diamond',
      version: '1.0.0',
      meta: {
        name: 'Diamond with Ports',
        category: 'ports',
        description: 'Phase 3.2: Ports at diamond vertices',
      },
      structure: {
        type: 'diamond',
        size: { width: 140, height: 120 },
        shape: {
          type: 'diamond',
          fill: '#f3e5f5',
          stroke: '#9c27b0',
          strokeWidth: 3,
        },
        ports: {
          enabled: true,
          defaultVisibility: 'always',
          top: { enabled: true },
          right: { enabled: true },
          bottom: { enabled: true },
          left: { enabled: true },
        },
      },
      defaultData: {
        description: 'Ports at vertices',
        phase: '3.2',
      },
    };

    const diamondNode = NodeFactory.createFromTemplate(diamondTemplate, {
      position: { x: 250, y: 220 },
    });

    this.engine.diagram?.addNode(diamondNode);
  }

  /**
   * Phase 3.3 Demo: Hit detection (interactive)
   */
  private createPhase33Demo(): void {
    const template: NodeTemplate = {
      id: 'hit-detection-circle',
      version: '1.0.0',
      meta: {
        name: 'Click Me (Circle)',
        category: 'interaction',
        description: 'Phase 3.3: Accurate hit detection on circle',
      },
      structure: {
        type: 'circle',
        size: { width: 130, height: 130 },
        shape: {
          type: 'circle',
          fill: '#e8f5e9',
          stroke: '#4caf50',
          strokeWidth: 3,
        },
      },
      defaultData: {
        clicks: 0,
        phase: '3.3',
        instruction: 'Click corners (miss) or center (hit)',
      },
    };

    const node = NodeFactory.createFromTemplate(template, {
      position: { x: 450, y: 220 },
    });

    this.engine.diagram?.addNode(node);
  }

  /**
   * Phase 3.4 Demo: HTML templates with EventBus integration
   */
  private createPhase34Demo(): void {
    const template: NodeTemplate = {
      id: 'user-card',
      version: '1.0.0',
      meta: {
        name: 'User Card',
        category: 'interactive',
        description: 'Phase 3.4: HTML template with event integration',
      },
      structure: {
        type: 'user-card',
        size: { width: 220, height: 160 },
        shape: {
          type: 'rect',
          cornerRadius: 16,
          fill: '#ffffff',
          stroke: '#e0e0e0',
          strokeWidth: 2,
        },
        html: {
          mode: 'template',
          template: `
            <div class="user-card-content" style="padding: 15px; font-family: system-ui;">
              <div style="text-align: center; margin-bottom: 10px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: #2196f3; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
                  {{data.initials}}
                </div>
              </div>
              <h4 style="margin: 0; text-align: center; font-size: 14px;">{{data.name}}</h4>
              <p style="margin: 5px 0; text-align: center; font-size: 12px; color: #666;">{{data.role}}</p>
              <div style="text-align: center; margin-top: 10px;">
                <span style="font-size: 11px; color: #999;">Phase 3.4</span>
              </div>
            </div>
          `,
          events: {
            click: 'user:clicked',
            mouseenter: 'user:hovered',
          },
          zIndex: 1,
          pointerEvents: true,
        },
        ports: {
          enabled: true,
          defaultVisibility: 'on-hover',
          top: { enabled: true },
          bottom: { enabled: true },
        },
      },
      defaultData: {
        name: 'John Doe',
        role: 'Software Engineer',
        initials: 'JD',
        phase: '3.4',
      },
    };

    const node = NodeFactory.createFromTemplate(template, {
      position: { x: 50, y: 450 },
    });

    this.engine.diagram?.addNode(node);
  }

  /**
   * Phase 3.5 Demo: Hybrid rendering (SVG + HTML)
   */
  private createPhase35Demo(): void {
    const template: NodeTemplate = {
      id: 'dashboard-card',
      version: '1.0.0',
      meta: {
        name: 'Dashboard Card',
        category: 'hybrid',
        description: 'Phase 3.5: Hybrid SVG + HTML rendering',
      },
      structure: {
        type: 'dashboard-card',
        size: { width: 240, height: 180 },
        shape: {
          type: 'rect',
          cornerRadius: 12,
          fill: '#fafafa',
          stroke: '#d0d0d0',
          strokeWidth: 2,
        },
        html: {
          mode: 'template',
          template: `
            <div style="padding: 20px; font-family: system-ui;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">{{data.title}}</h3>
              <div style="display: flex; gap: 20px; margin-bottom: 15px;">
                <div style="flex: 1; text-align: center;">
                  <div style="font-size: 24px; font-weight: bold; color: #2196f3;">{{data.users}}</div>
                  <div style="font-size: 11px; color: #999;">Users</div>
                </div>
                <div style="flex: 1; text-align: center;">
                  <div style="font-size: 24px; font-weight: bold; color: #4caf50;">{{data.revenue}}</div>
                  <div style="font-size: 11px; color: #999;">Revenue</div>
                </div>
              </div>
              <div style="text-align: center; font-size: 10px; color: #999;">
                Phase 3.5 - Hybrid Rendering
              </div>
            </div>
          `,
          events: {
            click: 'dashboard:clicked',
          },
          zIndex: 1,
          pointerEvents: true,
        },
        ports: {
          enabled: true,
          defaultVisibility: 'on-hover',
          top: { enabled: true },
          right: { enabled: true },
          bottom: { enabled: true },
          left: { enabled: true },
        },
      },
      defaultData: {
        title: 'Metrics',
        users: '1,234',
        revenue: '$45K',
        phase: '3.5',
      },
    };

    const node = NodeFactory.createFromTemplate(template, {
      position: { x: 320, y: 450 },
    });

    this.engine.diagram?.addNode(node);
  }

  /**
   * Subscribe to events for demo
   */
  private subscribeToEvents(): void {
    // User card events
    this.engine.eventBus.on('user:clicked', (data: any) => {
      this.logEvent(`User card clicked: ${data.nodeData?.name || 'Unknown'}`);
      this.stats.eventsEmitted++;
    });

    this.engine.eventBus.on('user:hovered', (data: any) => {
      this.logEvent(`User card hovered: ${data.nodeData?.name || 'Unknown'}`);
      this.stats.eventsEmitted++;
    });

    // Dashboard events
    this.engine.eventBus.on('dashboard:clicked', (data: any) => {
      this.logEvent(`Dashboard clicked: ${data.nodeData?.title || 'Unknown'}`);
      this.stats.eventsEmitted++;
    });

    // Node selection events
    this.engine.eventBus.on('node:selected', (node: any) => {
      this.logEvent(`Node selected: ${node.data?.shapeName || node.data?.title || node.id}`);
      this.stats.eventsEmitted++;
    });

    // Node click events for hit detection demo
    this.engine.eventBus.on('node:clicked', (event: any) => {
      const node = event.node;
      if (node?.data?.phase === '3.3') {
        node.data.clicks = (node.data.clicks || 0) + 1;
        this.logEvent(`Hit detection: ${node.data.clicks} clicks on circle`);
        this.stats.clicksRecorded++;
      }
    });
  }

  /**
   * Log event to display
   */
  private logEvent(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.eventLog.unshift(`[${timestamp}] ${message}`);

    // Keep only last N entries
    if (this.eventLog.length > this.maxLogEntries) {
      this.eventLog = this.eventLog.slice(0, this.maxLogEntries);
    }
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalNodes = this.engine.diagram?.getNodes().length || 0;
  }

  /**
   * Reset demo
   */
  resetDemo(): void {
    this.engine.diagram?.clear();
    this.createPhase31Demo();
    this.createPhase32Demo();
    this.createPhase33Demo();
    this.createPhase34Demo();
    this.createPhase35Demo();
    this.updateStats();
    this.eventLog = [];
    this.stats.clicksRecorded = 0;
    this.stats.eventsEmitted = 0;
    this.logEvent('Demo reset');
  }

  /**
   * Clear event log
   */
  clearLog(): void {
    this.eventLog = [];
  }

  /**
   * Toggle section visibility
   */
  toggleSection(sectionId: string): void {
    const section = this.sections.find(s => s.id === sectionId);
    if (section) {
      section.active = !section.active;
    }
  }
}
