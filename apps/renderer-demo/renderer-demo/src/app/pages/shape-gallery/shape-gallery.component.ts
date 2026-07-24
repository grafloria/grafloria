// Shape Gallery Demo (Phase 3.6)
// Demonstrates all shape system features from Phases 3.1-3.5

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DiagramCanvasComponent,
  ComponentRendererService,
} from '@grafloria/angular';
import {
  DiagramEngine,
  NodeModel,
  GroupModel,
  type NodeTemplate,
  type ShapeType,
  type FlexboxLayoutConfig,
  type GridLayoutConfig,
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
    imports: [CommonModule, FormsModule, DiagramCanvasComponent],
    selector: 'app-shape-gallery',
    templateUrl: './shape-gallery.component.html',
    styleUrl: './shape-gallery.component.css'
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
    { id: 'layouts', name: 'Composite Layouts', active: true },
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

  constructor(
    private componentRenderer: ComponentRendererService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.engine = new DiagramEngine();
    this.engine.createDiagram('shape-gallery');

    // Enable automatic link rerouting when nodes move (Observer Pattern)
    this.engine.enableLiveRerouting();

    // Subscribe to events to demonstrate Phase 3.4
    this.subscribeToEvents();

    // Create all demo nodes
    this.createPhase31Demo(); // Shape types
    this.createPhase32Demo(); // Port positioning
    this.createPhase33Demo(); // Hit detection
    this.createPhase34Demo(); // HTML templates with events
    this.createPhase35Demo(); // Hybrid rendering
    this.createCompositeLayoutsDemo(); // Composite node layouts

    this.updateStats();

    // Force change detection to ensure initial render
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
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

      // Create node directly since we're not using a template registry
      const node = new NodeModel({
        id: `shape-${shapeType}-${index}`,
        type: shapeType,
        position: { x: 50 + index * 150, y: 50 },
        size: { width: 120, height: 100 },
      });

      // Set metadata from template
      node.setMetadata('templateId', template.id);

      // CRITICAL: Set shape metadata for SVGRenderer
      if (template.structure.shape) {
        node.setMetadata('shape', template.structure.shape);
      }

      if (template.defaultData) {
        Object.entries(template.defaultData).forEach(([key, value]) => {
          node.setMetadata(key, value);
        });
      }

      this.engine.getDiagram()?.addNode(node);
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

    const node = this.createNodeFromTemplate(template, {
      position: { x: 50, y: 220 },
    });

    this.engine.getDiagram()?.addNode(node);

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

    const diamondNode = this.createNodeFromTemplate(diamondTemplate, {
      position: { x: 250, y: 220 },
    });

    this.engine.getDiagram()?.addNode(diamondNode);
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

    const node = this.createNodeFromTemplate(template, {
      position: { x: 450, y: 220 },
    });

    this.engine.getDiagram()?.addNode(node);
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

    const node = this.createNodeFromTemplate(template, {
      position: { x: 50, y: 450 },
    });

    this.engine.getDiagram()?.addNode(node);
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

    const node = this.createNodeFromTemplate(template, {
      position: { x: 320, y: 450 },
    });

    this.engine.getDiagram()?.addNode(node);
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
   * Helper to create a node from a template definition
   * Since we're not using a template registry, we create nodes directly
   */
  private createNodeFromTemplate(
    template: NodeTemplate,
    options: {
      position: { x: number; y: number };
      id?: string;
    }
  ): NodeModel {
    // Get size with proper type handling
    const size = template.structure.size || { width: 100, height: 100 };
    const nodeSize = {
      width: typeof size.width === 'number' ? size.width : 100,
      height: typeof size.height === 'number' ? size.height : 100,
    };

    const node = new NodeModel({
      id: options.id || `${template.id}-${Date.now()}`,
      type: template.structure.type || 'rect',
      position: options.position,
      size: nodeSize,
    });

    // Set metadata from template - setMetadata takes key/value pairs
    node.setMetadata('templateId', template.id);

    // CRITICAL: Set shape metadata for SVGRenderer
    if (template.structure.shape) {
      node.setMetadata('shape', template.structure.shape);
    }

    if (template.defaultData) {
      Object.entries(template.defaultData).forEach(([key, value]) => {
        node.setMetadata(key, value);
      });
    }

    return node;
  }

  /**
   * Composite Layouts Demo: Flexbox and Grid layouts
   */
  private createCompositeLayoutsDemo(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // 1. Flexbox Row Layout
    const flexRowGroup = new GroupModel({ name: 'Flex Row Container' });
    flexRowGroup.position = { x: 650, y: 50 };
    flexRowGroup.size = { width: 400, height: 120, depth: 0 };
    diagram.addGroup(flexRowGroup);

    const flexRowConfig: FlexboxLayoutConfig = {
      direction: 'row',
      wrap: 'nowrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      alignContent: 'stretch',
      gap: 10,
      padding: 10,
    };
    flexRowGroup.setLayout('flexbox', flexRowConfig);

    // Add child nodes to flex row
    for (let i = 0; i < 3; i++) {
      const childNode = new NodeModel({
        id: `flex-row-child-${i}`,
        type: 'rect',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
      });
      childNode.setMetadata('shape', {
        type: 'rect',
        fill: ['#e3f2fd', '#fff3e0', '#f3e5f5'][i],
        stroke: ['#2196f3', '#ff9800', '#9c27b0'][i],
        strokeWidth: 2,
        cornerRadius: 8,
      });
      childNode.setMetadata('label', `Item ${i + 1}`);
      diagram.addNode(childNode);
      flexRowGroup.addMember(childNode.id);
    }
    flexRowGroup.applyLayout(diagram);

    // 2. Flexbox Column Layout
    const flexColGroup = new GroupModel({ name: 'Flex Column Container' });
    flexColGroup.position = { x: 650, y: 200 };
    flexColGroup.size = { width: 140, height: 320, depth: 0 };
    diagram.addGroup(flexColGroup);

    const flexColConfig: FlexboxLayoutConfig = {
      direction: 'column',
      wrap: 'nowrap',
      justifyContent: 'start',
      alignItems: 'stretch',
      alignContent: 'stretch',
      gap: 10,
      padding: 10,
    };
    flexColGroup.setLayout('flexbox', flexColConfig);

    // Add child nodes to flex column
    for (let i = 0; i < 3; i++) {
      const childNode = new NodeModel({
        id: `flex-col-child-${i}`,
        type: 'rect',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 80 },
      });
      childNode.setMetadata('shape', {
        type: 'rect',
        fill: ['#e8f5e9', '#fce4ec', '#fff3e0'][i],
        stroke: ['#4caf50', '#e91e63', '#ff9800'][i],
        strokeWidth: 2,
        cornerRadius: 8,
      });
      childNode.setMetadata('label', `Row ${i + 1}`);
      diagram.addNode(childNode);
      flexColGroup.addMember(childNode.id);
    }
    flexColGroup.applyLayout(diagram);

    // 3. Grid Layout (3 columns)
    const gridGroup = new GroupModel({ name: 'Grid Container' });
    gridGroup.position = { x: 820, y: 200 };
    gridGroup.size = { width: 320, height: 320, depth: 0 };
    diagram.addGroup(gridGroup);

    const gridConfig: GridLayoutConfig = {
      templateColumns: 'repeat(3, 1fr)',
      templateRows: 'auto',
      columnGap: 10,
      rowGap: 10,
      autoFlow: 'row',
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    };
    gridGroup.setLayout('grid', gridConfig);

    // Add child nodes to grid
    const gridColors = ['#e3f2fd', '#fff3e0', '#f3e5f5', '#e8f5e9', '#fce4ec', '#e0f2f1'];
    const gridStrokes = ['#2196f3', '#ff9800', '#9c27b0', '#4caf50', '#e91e63', '#00897b'];
    for (let i = 0; i < 6; i++) {
      const childNode = new NodeModel({
        id: `grid-child-${i}`,
        type: 'rect',
        position: { x: 0, y: 0 },
        size: { width: 90, height: 90 },
      });
      childNode.setMetadata('shape', {
        type: 'rect',
        fill: gridColors[i],
        stroke: gridStrokes[i],
        strokeWidth: 2,
        cornerRadius: 8,
      });
      childNode.setMetadata('label', `${i + 1}`);
      diagram.addNode(childNode);
      gridGroup.addMember(childNode.id);
    }
    gridGroup.applyLayout(diagram);

    // 4. 12-Column Grid Layout (Bootstrap-style)
    const columnGroup = new GroupModel({ name: '12-Column Dashboard' });
    columnGroup.position = { x: 650, y: 550 };
    columnGroup.size = { width: 500, height: 200, depth: 0 };
    diagram.addGroup(columnGroup);

    const columnConfig: FlexboxLayoutConfig = {
      direction: 'row',
      wrap: 'wrap',
      justifyContent: 'start',
      alignItems: 'start',
      alignContent: 'start',
      gap: 10,
      padding: 10,
      columns: 12, // 12-column layout
    };
    columnGroup.setLayout('flexbox', columnConfig);

    // Widget 1: 4 columns (1/3 width)
    const widget1 = new NodeModel({
      id: 'widget-4col',
      type: 'rect',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
    });
    widget1.setMetadata('columnSpan', 4);
    widget1.setMetadata('shape', {
      type: 'rect',
      fill: '#e3f2fd',
      stroke: '#2196f3',
      strokeWidth: 2,
      cornerRadius: 8,
    });
    widget1.setMetadata('label', '4 cols');
    diagram.addNode(widget1);
    columnGroup.addMember(widget1.id);

    // Widget 2: 8 columns (2/3 width)
    const widget2 = new NodeModel({
      id: 'widget-8col',
      type: 'rect',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
    });
    widget2.setMetadata('columnSpan', 8);
    widget2.setMetadata('shape', {
      type: 'rect',
      fill: '#fff3e0',
      stroke: '#ff9800',
      strokeWidth: 2,
      cornerRadius: 8,
    });
    widget2.setMetadata('label', '8 cols');
    diagram.addNode(widget2);
    columnGroup.addMember(widget2.id);

    // Widget 3: 12 columns (full width)
    const widget3 = new NodeModel({
      id: 'widget-12col',
      type: 'rect',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
    });
    widget3.setMetadata('columnSpan', 12);
    widget3.setMetadata('shape', {
      type: 'rect',
      fill: '#e8f5e9',
      stroke: '#4caf50',
      strokeWidth: 2,
      cornerRadius: 8,
    });
    widget3.setMetadata('label', '12 cols');
    diagram.addNode(widget3);
    columnGroup.addMember(widget3.id);

    columnGroup.applyLayout(diagram);

    // 5. Table-style demo with field nodes (ERD-like)
    this.createTableStyleDemo(diagram);
  }

  /**
   * Create table-style demo with field nodes and connections
   */
  private createTableStyleDemo(diagram: any): void {
    // Create first table (Users) - this is a container node
    const usersTable = new NodeModel({
      id: 'users-table',
      type: 'rect',
      position: { x: 50, y: 800 },
      size: { width: 200, height: 250 },
    });

    // Make it a container with flexbox layout for children
    usersTable.setMetadata('shape', {
      type: 'rect',
      fill: '#f5f5f5',
      stroke: '#0d47a1',
      strokeWidth: 3,
      cornerRadius: 8,
    });

    // Add HTML styling for better visual presentation
    usersTable.setMetadata('html', {
      className: 'erd-table-container',
      style: {
        border: '3px solid #0d47a1',
        borderRadius: '8px',
        backgroundColor: '#f5f5f5',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }
    });

    usersTable.setMetadata('layout', {
      type: 'flexbox',
      direction: 'column',
      gap: 2,
      padding: { top: 5, right: 5, bottom: 5, left: 5 },
      justifyContent: 'start',
      alignItems: 'stretch',
    });

    diagram.addNode(usersTable);

    // Add table header as a child node
    const usersHeader = new NodeModel({
      id: 'users-header',
      type: 'rect',
      position: { x: 55, y: 805 }, // Relative to parent
      size: { width: 190, height: 30 },
    });
    usersHeader.setMetadata('shape', {
      type: 'rect',
      fill: '#1976d2',
      stroke: '#0d47a1',
      strokeWidth: 2,
      cornerRadius: 4,
    });

    // Add HTML styling for header
    usersHeader.setMetadata('html', {
      className: 'erd-table-header',
      style: {
        backgroundColor: '#1976d2',
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: '14px',
        textAlign: 'center',
        borderRadius: '4px',
        border: '2px solid #0d47a1',
        padding: '8px',
        cursor: 'default',
      }
    });

    usersHeader.setMetadata('label', 'Users');
    usersHeader.setMetadata('labelColor', '#ffffff');
    usersHeader.behavior.draggable = false; // Make header non-draggable
    usersHeader.parentId = usersTable.id; // Set parent relationship
    diagram.addNode(usersHeader);

    // Add field nodes as children of Users table
    const userFields = [
      { id: 'user-id', label: 'id (PK)', isPrimary: true, yOffset: 40 },
      { id: 'user-name', label: 'name', isPrimary: false, yOffset: 77 },
      { id: 'user-email', label: 'email', isPrimary: false, yOffset: 114 },
      { id: 'user-created', label: 'created_at', isPrimary: false, yOffset: 151 },
    ];

    userFields.forEach((field) => {
      const fieldNode = new NodeModel({
        id: field.id,
        type: 'rect',
        position: { x: 55, y: 800 + field.yOffset },
        size: { width: 190, height: 35 },
      });

      // Configure ports - left and right for connections
      fieldNode.setMetadata('ports', {
        left: { enabled: true, visibility: 'always' },
        right: { enabled: true, visibility: 'always' },
      });

      fieldNode.setMetadata('shape', {
        type: 'rect',
        fill: field.isPrimary ? '#fff3e0' : '#ffffff',
        stroke: '#bdbdbd',
        strokeWidth: 1,
        cornerRadius: 2,
      });

      // Add HTML styling for field rows
      fieldNode.setMetadata('html', {
        className: field.isPrimary ? 'erd-field-primary' : 'erd-field',
        style: {
          backgroundColor: field.isPrimary ? '#fff3e0' : '#ffffff',
          border: '1px solid #bdbdbd',
          borderRadius: '2px',
          padding: '6px 8px',
          fontSize: '12px',
          color: '#000000',
          cursor: 'default',
          fontFamily: 'monospace',
        }
      });

      fieldNode.setMetadata('label', field.label);
      fieldNode.setMetadata('labelColor', '#000000');
      fieldNode.behavior.draggable = false; // Make field nodes non-draggable
      fieldNode.parentId = usersTable.id; // Set parent relationship
      diagram.addNode(fieldNode);
    });

    // Create second table (Orders) - this is a container node
    const ordersTable = new NodeModel({
      id: 'orders-table',
      type: 'rect',
      position: { x: 350, y: 800 },
      size: { width: 200, height: 250 },
    });

    ordersTable.setMetadata('shape', {
      type: 'rect',
      fill: '#f5f5f5',
      stroke: '#1b5e20',
      strokeWidth: 3,
      cornerRadius: 8,
    });

    // Add HTML styling for better visual presentation
    ordersTable.setMetadata('html', {
      className: 'erd-table-container',
      style: {
        border: '3px solid #1b5e20',
        borderRadius: '8px',
        backgroundColor: '#f5f5f5',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }
    });

    ordersTable.setMetadata('layout', {
      type: 'flexbox',
      direction: 'column',
      gap: 2,
      padding: { top: 5, right: 5, bottom: 5, left: 5 },
      justifyContent: 'start',
      alignItems: 'stretch',
    });

    diagram.addNode(ordersTable);

    // Add table header as a child node
    const ordersHeader = new NodeModel({
      id: 'orders-header',
      type: 'rect',
      position: { x: 355, y: 805 },
      size: { width: 190, height: 30 },
    });
    ordersHeader.setMetadata('shape', {
      type: 'rect',
      fill: '#388e3c',
      stroke: '#1b5e20',
      strokeWidth: 2,
      cornerRadius: 4,
    });

    // Add HTML styling for header
    ordersHeader.setMetadata('html', {
      className: 'erd-table-header',
      style: {
        backgroundColor: '#388e3c',
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: '14px',
        textAlign: 'center',
        borderRadius: '4px',
        border: '2px solid #1b5e20',
        padding: '8px',
        cursor: 'default',
      }
    });

    ordersHeader.setMetadata('label', 'Orders');
    ordersHeader.setMetadata('labelColor', '#ffffff');
    ordersHeader.behavior.draggable = false; // Make header non-draggable
    ordersHeader.parentId = ordersTable.id; // Set parent relationship
    diagram.addNode(ordersHeader);

    // Add field nodes as children of Orders table
    const orderFields = [
      { id: 'order-id', label: 'id (PK)', isPrimary: true, yOffset: 40 },
      { id: 'order-user-id', label: 'user_id (FK)', isForeign: true, yOffset: 77 },
      { id: 'order-amount', label: 'amount', isPrimary: false, yOffset: 114 },
      { id: 'order-created', label: 'created_at', isPrimary: false, yOffset: 151 },
    ];

    orderFields.forEach((field) => {
      const fieldNode = new NodeModel({
        id: field.id,
        type: 'rect',
        position: { x: 355, y: 800 + field.yOffset },
        size: { width: 190, height: 35 },
      });

      // Configure ports - left and right for connections
      fieldNode.setMetadata('ports', {
        left: { enabled: true, visibility: 'always' },
        right: { enabled: true, visibility: 'always' },
      });

      const bgColor = field.isPrimary ? '#fff3e0' : (field.isForeign ? '#e1f5fe' : '#ffffff');
      fieldNode.setMetadata('shape', {
        type: 'rect',
        fill: bgColor,
        stroke: '#bdbdbd',
        strokeWidth: 1,
        cornerRadius: 2,
      });

      // Add HTML styling for field rows
      const className = field.isPrimary ? 'erd-field-primary' : (field.isForeign ? 'erd-field-foreign' : 'erd-field');
      fieldNode.setMetadata('html', {
        className: className,
        style: {
          backgroundColor: bgColor,
          border: '1px solid #bdbdbd',
          borderRadius: '2px',
          padding: '6px 8px',
          fontSize: '12px',
          color: '#000000',
          cursor: 'default',
          fontFamily: 'monospace',
        }
      });

      fieldNode.setMetadata('label', field.label);
      fieldNode.setMetadata('labelColor', '#000000');
      fieldNode.behavior.draggable = false; // Make field nodes non-draggable
      fieldNode.parentId = ordersTable.id; // Set parent relationship
      diagram.addNode(fieldNode);
    });

    // Create link between user-id and order-user-id
    const link = diagram.createLink('user-id', 'order-user-id', 'right', 'left');
    if (link) {
      link.setMetadata('strokeColor', '#1976d2');
      link.setMetadata('strokeWidth', 2);
      link.setMetadata('label', '1:N');
    }
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalNodes = this.engine.getDiagram()?.getNodes().length || 0;
  }

  /**
   * Reset demo
   */
  resetDemo(): void {
    this.engine.getDiagram()?.clear();
    this.createPhase31Demo();
    this.createPhase32Demo();
    this.createPhase33Demo();
    this.createPhase34Demo();
    this.createPhase35Demo();
    this.createCompositeLayoutsDemo();
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
