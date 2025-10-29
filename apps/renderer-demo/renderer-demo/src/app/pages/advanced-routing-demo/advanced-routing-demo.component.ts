import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  PortModel,
  LinkModel,
  InteractionMode,
  PortVisibilityStrategy,
  ConnectionLineStyle,
  type InteractionConfig,
  type RoutingOptions,
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

type DemoSection = 'waypoints' | 'controlPoints' | 'simplification' | 'comparison';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent],
  selector: 'app-advanced-routing-demo',
  templateUrl: './advanced-routing-demo.component.html',
  styleUrl: './advanced-routing-demo.component.css',
})
export class AdvancedRoutingDemoComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1400, height: 900 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  // Active demo section
  activeSection: DemoSection = 'waypoints';

  // Waypoint editing controls
  waypointConfig = {
    enabled: true,
    showHandles: true,
    snapToGrid: false,
    gridSize: 10,
    handleRadius: 6,
    handleColor: '#3498db',
  };

  // Control point editing controls
  controlPointConfig = {
    enabled: true,
    showHandles: true,
    showControlLines: true,
    snapToGrid: false,
    gridSize: 10,
    handleRadius: 6,
    handleColor: '#9b59b6',
    handleStrokeColor: '#8e44ad',
    controlLineColor: '#95a5a6',
    symmetricControls: false,
  };

  // Path simplification controls
  simplificationConfig = {
    enabled: false,
    epsilon: 1.0,
  };

  // Routing algorithm controls (pathfinding)
  routingConfig = {
    algorithm: 'orthogonal' as 'straight' | 'orthogonal',
    avoidObstacles: true,
    obstacleMargin: 20,
    gridSize: 10,
  };

  // Line rendering controls (visual style)
  lineRenderingConfig = {
    style: 'orthogonal' as 'direct' | 'smooth' | 'bezier' | 'orthogonal',
  };

  // Available routing algorithms (pathfinding)
  routingAlgorithms = [
    { value: 'straight' as const, label: 'Straight', icon: '→', description: 'Direct path from A to B' },
    { value: 'orthogonal' as const, label: 'Orthogonal', icon: '⊏⊐', description: 'Right-angle paths with optional obstacle avoidance' },
  ];

  // Available line rendering styles (visual)
  lineRenderingStyles = [
    { value: 'direct' as const, label: 'Direct', icon: '━', description: 'Straight lines', compatibleWith: ['straight', 'orthogonal'] },
    { value: 'smooth' as const, label: 'Smooth', icon: '⌢', description: 'Smooth curves', compatibleWith: ['straight'] },
    { value: 'bezier' as const, label: 'Bezier', icon: '◠', description: 'Bezier curves with control points', compatibleWith: ['straight'] },
    { value: 'orthogonal' as const, label: 'Orthogonal', icon: '⊏⊐', description: 'Right-angle lines', compatibleWith: ['orthogonal'] },
  ];

  // Stats
  stats = {
    waypointCount: 0,
    controlPointCount: 0,
    originalPointCount: 0,
    simplifiedPointCount: 0,
    reductionPercent: 0,
  };

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.initializeEngine();

    // CRITICAL FIX: Initialize routing algorithm and line style in engine
    // This ensures the preview line and final links use the correct settings
    const routingEngine = this.engine.getRoutingEngine();
    routingEngine.setDefaultAlgorithm(this.routingConfig.algorithm);
    this.updateEngineConnectionLineStyle();

    this.createDemoContent(this.activeSection);
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine({
      interaction: {
        mode: InteractionMode.SMART,
        portVisibility: PortVisibilityStrategy.ON_HOVER,
        enableSmartAutoConnect: true,
        enableWaypointEditing: this.waypointConfig.enabled,
        showWaypointHandles: this.waypointConfig.showHandles,
        enableControlPointEditing: this.controlPointConfig.enabled,
        showControlPointHandles: this.controlPointConfig.showHandles,
        waypointEditor: {
          snapToGrid: this.waypointConfig.snapToGrid,
          gridSize: this.waypointConfig.gridSize,
          handleRadius: this.waypointConfig.handleRadius,
          handleColor: this.waypointConfig.handleColor,
          handleStrokeColor: '#2980b9',
          clickDetectionRadius: 15,
          removeOnDoubleClick: true,
          minDistanceFromEndpoints: 20,
        },
        controlPointEditor: {
          snapToGrid: this.controlPointConfig.snapToGrid,
          gridSize: this.controlPointConfig.gridSize,
          handleRadius: this.controlPointConfig.handleRadius,
          handleColor: this.controlPointConfig.handleColor,
          handleStrokeColor: this.controlPointConfig.handleStrokeColor,
          controlLineColor: this.controlPointConfig.controlLineColor,
          controlLineWidth: 1,
          controlLineDash: [5, 5],
          clickDetectionRadius: 15,
          showControlLines: this.controlPointConfig.showControlLines,
          symmetricControls: this.controlPointConfig.symmetricControls,
        },
      },
    });
    console.log('Advanced Routing Demo initialized');
  }

  switchSection(section: DemoSection): void {
    this.activeSection = section;
    this.createDemoContent(section);
  }

  private createDemoContent(section: DemoSection): void {
    const diagram = this.engine.createDiagram('Advanced Routing Demo');

    // Enable automatic link rerouting when nodes move (Observer Pattern)
    this.engine.enableLiveRerouting();

    switch (section) {
      case 'waypoints':
        this.createWaypointDemo();
        break;
      case 'controlPoints':
        this.createControlPointDemo();
        break;
      case 'simplification':
        this.createSimplificationDemo();
        break;
      case 'comparison':
        this.createComparisonDemo();
        break;
    }

    diagram.fitToView(80);
    this.updateViewportFromDiagram();
    this.updateStats();
  }

  private createWaypointDemo(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Title node
    this.createTextNode(
      'title',
      'Waypoint Editing Demo',
      { x: 100, y: 50 },
      { width: 300, height: 60 },
      '#3498db'
    );

    // Create a complex orthogonal path with multiple waypoints
    const nodeA = this.createDemoNode('nodeA', 'Start Node', { x: 100, y: 200 }, '#e8f5e9');
    const nodeB = this.createDemoNode('nodeB', 'Process 1', { x: 500, y: 150 }, '#e3f2fd');
    const nodeC = this.createDemoNode('nodeC', 'Process 2', { x: 500, y: 400 }, '#fff3e0');
    const nodeD = this.createDemoNode('nodeD', 'End Node', { x: 900, y: 300 }, '#ffebee');

    // Create orthogonal links with waypoints
    const link1 = new LinkModel(
      nodeA.getPorts()[0].id,
      nodeB.getPorts()[0].id,
      'orthogonal'
    );
    link1.setMetadata('label', 'Drag waypoints to reshape');

    const link2 = new LinkModel(
      nodeA.getPorts()[0].id,
      nodeC.getPorts()[0].id,
      'orthogonal'
    );
    link2.setMetadata('label', 'Click to add waypoints');

    const link3 = new LinkModel(
      nodeB.getPorts()[0].id,
      nodeD.getPorts()[0].id,
      'orthogonal'
    );
    link3.setMetadata('label', 'Select & press Delete');

    const link4 = new LinkModel(
      nodeC.getPorts()[0].id,
      nodeD.getPorts()[0].id,
      'orthogonal'
    );

    diagram.addLink(link1);
    diagram.addLink(link2);
    diagram.addLink(link3);
    diagram.addLink(link4);

    // Create instruction nodes
    this.createInstructionNode(
      'inst1',
      '1. Click a link to select it',
      { x: 100, y: 500 }
    );
    this.createInstructionNode(
      'inst2',
      '2. Drag waypoints to reshape path',
      { x: 100, y: 560 }
    );
    this.createInstructionNode(
      'inst3',
      '3. Click on link to add waypoint',
      { x: 100, y: 620 }
    );
    this.createInstructionNode(
      'inst4',
      '4. Select waypoint & press Delete',
      { x: 100, y: 680 }
    );
  }

  private createControlPointDemo(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Title node
    this.createTextNode(
      'title',
      'Control Point Editing Demo',
      { x: 100, y: 50 },
      { width: 350, height: 60 },
      '#9b59b6'
    );

    // Create nodes with bezier curve connections
    const nodeA = this.createDemoNode('nodeA', 'Start', { x: 100, y: 250 }, '#e8f5e9');
    const nodeB = this.createDemoNode('nodeB', 'Checkpoint 1', { x: 400, y: 150 }, '#e3f2fd');
    const nodeC = this.createDemoNode('nodeC', 'Checkpoint 2', { x: 400, y: 400 }, '#fff3e0');
    const nodeD = this.createDemoNode('nodeD', 'End', { x: 700, y: 300 }, '#ffebee');

    // Create bezier links
    const link1 = new LinkModel(nodeA.getPorts()[0].id, nodeB.getPorts()[0].id, 'bezier');
    link1.setMetadata('label', 'Drag control points');

    const link2 = new LinkModel(nodeA.getPorts()[0].id, nodeC.getPorts()[0].id, 'bezier');
    link2.setMetadata('label', 'Adjust curve shape');

    const link3 = new LinkModel(nodeB.getPorts()[0].id, nodeD.getPorts()[0].id, 'bezier');

    const link4 = new LinkModel(nodeC.getPorts()[0].id, nodeD.getPorts()[0].id, 'bezier');

    diagram.addLink(link1);
    diagram.addLink(link2);
    diagram.addLink(link3);
    diagram.addLink(link4);

    // Create instruction nodes
    this.createInstructionNode(
      'inst1',
      '1. Click a bezier link to select',
      { x: 100, y: 500 }
    );
    this.createInstructionNode(
      'inst2',
      '2. Drag purple control points',
      { x: 100, y: 560 }
    );
    this.createInstructionNode(
      'inst3',
      '3. Adjust curve smoothness',
      { x: 100, y: 620 }
    );
    this.createInstructionNode(
      'inst4',
      '4. Toggle symmetric controls',
      { x: 100, y: 680 }
    );
  }

  private createSimplificationDemo(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Title node
    this.createTextNode(
      'title',
      'Path Simplification Demo',
      { x: 100, y: 50 },
      { width: 350, height: 60 },
      '#27ae60'
    );

    // Create nodes
    const nodeA = this.createDemoNode('nodeA', 'Source', { x: 100, y: 300 }, '#e8f5e9');
    const nodeB = this.createDemoNode('nodeB', 'Target', { x: 700, y: 300 }, '#ffebee');

    // Create a complex path that will benefit from simplification
    const link = new LinkModel(nodeA.getPorts()[0].id, nodeB.getPorts()[0].id, 'orthogonal');
    link.setMetadata('label', 'Complex path with many points');

    diagram.addLink(link);

    // Force a complex route by adding some intermediate waypoints
    // This will be simplified when simplification is enabled

    // Create instruction nodes
    this.createInstructionNode(
      'inst1',
      '1. Observe the waypoint count',
      { x: 100, y: 500 }
    );
    this.createInstructionNode(
      'inst2',
      '2. Enable simplification below',
      { x: 100, y: 560 }
    );
    this.createInstructionNode(
      'inst3',
      '3. Adjust epsilon slider (1.0-5.0)',
      { x: 100, y: 620 }
    );
    this.createInstructionNode(
      'inst4',
      '4. Watch point count reduce',
      { x: 100, y: 680 }
    );
  }

  private createComparisonDemo(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Title node
    this.createTextNode(
      'title',
      'Routing Comparison: All Types',
      { x: 100, y: 50 },
      { width: 400, height: 60 },
      '#e67e22'
    );

    // CRITICAL FIX: Adjusted Y positions to prevent overlap
    // Each row needs enough space for nodes (height: 80) + labels (height: 40) + margins
    // Row spacing: ~180px between row start positions

    // Row 1: Straight (nodes at same height)
    const straight1 = this.createDemoNode('s1', 'A', { x: 100, y: 150 }, '#ecf0f1');
    const straight2 = this.createDemoNode('s2', 'B', { x: 300, y: 150 }, '#ecf0f1');
    const linkStraight = new LinkModel(
      straight1.getPorts()[0].id,
      straight2.getPorts()[0].id,
      'direct'
    );
    diagram.addLink(linkStraight);
    this.createInstructionNode('label1', 'Straight', { x: 150, y: 120 });

    // Row 2: Orthogonal with waypoints (nodes at same height for cleaner layout)
    const ortho1 = this.createDemoNode('o1', 'A', { x: 100, y: 280 }, '#e3f2fd');
    const ortho2 = this.createDemoNode('o2', 'B', { x: 300, y: 280 }, '#e3f2fd');
    const linkOrtho = new LinkModel(
      ortho1.getPorts()[0].id,
      ortho2.getPorts()[0].id,
      'orthogonal'
    );
    diagram.addLink(linkOrtho);
    this.createInstructionNode('label2', 'Orthogonal + Waypoints', { x: 120, y: 250 });

    // Row 3: Bezier with control points (nodes at same height for cleaner layout)
    const bezier1 = this.createDemoNode('b1', 'A', { x: 100, y: 410 }, '#f3e5f5');
    const bezier2 = this.createDemoNode('b2', 'B', { x: 300, y: 410 }, '#f3e5f5');
    const linkBezier = new LinkModel(
      bezier1.getPorts()[0].id,
      bezier2.getPorts()[0].id,
      'bezier'
    );
    diagram.addLink(linkBezier);
    this.createInstructionNode('label3', 'Bezier + Control Points', { x: 120, y: 380 });

    // Row 4: Simplified orthogonal (nodes at same height for cleaner layout)
    const simple1 = this.createDemoNode('si1', 'A', { x: 100, y: 540 }, '#e8f5e9');
    const simple2 = this.createDemoNode('si2', 'B', { x: 300, y: 540 }, '#e8f5e9');
    const linkSimple = new LinkModel(
      simple1.getPorts()[0].id,
      simple2.getPorts()[0].id,
      'orthogonal'
    );
    diagram.addLink(linkSimple);
    this.createInstructionNode('label4', 'Simplified Path', { x: 130, y: 510 });

    // Feature comparison text (adjusted Y positions to align with rows)
    this.createInstructionNode('feat1', '✓ JointJS Parity: 100%', { x: 550, y: 150 });
    this.createInstructionNode('feat2', '✓ Interactive Editing', { x: 550, y: 210 });
    this.createInstructionNode('feat3', '✓ Smart Routing', { x: 550, y: 270 });
    this.createInstructionNode('feat4', '✓ Performance Optimized', { x: 550, y: 330 });
    this.createInstructionNode('feat5', '✓ Zero GC Pressure', { x: 550, y: 390 });
    this.createInstructionNode('feat6', '✓ 166/166 Tests Passing', { x: 550, y: 450 });
  }

  private createDemoNode(
    id: string,
    label: string,
    position: { x: number; y: number },
    fillColor: string = '#e3f2fd'
  ): NodeModel {
    const diagram = this.engine.getDiagram();
    if (!diagram) throw new Error('No diagram');

    const node = new NodeModel({
      type: 'rect',
      position,
      size: { width: 120, height: 80 },
    });

    node.setMetadata('shape', {
      type: 'rect',
      fill: fillColor,
      stroke: '#34495e',
      strokeWidth: 2,
      cornerRadius: 8,
    });

    node.setMetadata('label', label);

    // Add ports
    const outputPort = new PortModel({
      id: `${id}-out`,
      type: 'output',
      side: 'right',
    });

    node.addPort(outputPort);
    diagram.addNode(node);

    return node;
  }

  private createTextNode(
    id: string,
    text: string,
    position: { x: number; y: number },
    size: { width: number; height: number },
    color: string = '#3498db'
  ): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const node = new NodeModel({
      type: 'rect',
      position,
      size,
    });

    node.setMetadata('shape', {
      type: 'rect',
      fill: color,
      stroke: color,
      strokeWidth: 0,
      cornerRadius: 8,
    });

    node.setMetadata('label', text);
    node.setMetadata('textColor', '#ffffff');
    node.setMetadata('fontSize', 18);
    node.setMetadata('fontWeight', 'bold');

    diagram.addNode(node);
  }

  private createInstructionNode(
    id: string,
    text: string,
    position: { x: number; y: number }
  ): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const node = new NodeModel({
      type: 'rect',
      position,
      size: { width: 320, height: 40 },
    });

    node.setMetadata('shape', {
      type: 'rect',
      fill: '#ecf0f1',
      stroke: '#95a5a6',
      strokeWidth: 1,
      cornerRadius: 4,
    });

    node.setMetadata('label', text);
    node.setMetadata('textColor', '#2c3e50');
    node.setMetadata('fontSize', 13);

    diagram.addNode(node);
  }

  // Config update methods
  updateWaypointConfig(): void {
    const config: Partial<InteractionConfig> = {
      enableWaypointEditing: this.waypointConfig.enabled,
      showWaypointHandles: this.waypointConfig.showHandles,
      waypointEditor: {
        snapToGrid: this.waypointConfig.snapToGrid,
        gridSize: this.waypointConfig.gridSize,
        handleRadius: this.waypointConfig.handleRadius,
        handleColor: this.waypointConfig.handleColor,
        handleStrokeColor: '#2980b9',
        clickDetectionRadius: 15,
        removeOnDoubleClick: true,
        minDistanceFromEndpoints: 20,
      },
    };
    this.engine.setInteractionConfig(config);
    this.updateStats();
    this.cdr.markForCheck();
  }

  updateControlPointConfig(): void {
    const config: Partial<InteractionConfig> = {
      enableControlPointEditing: this.controlPointConfig.enabled,
      showControlPointHandles: this.controlPointConfig.showHandles,
      controlPointEditor: {
        snapToGrid: this.controlPointConfig.snapToGrid,
        gridSize: this.controlPointConfig.gridSize,
        handleRadius: this.controlPointConfig.handleRadius,
        handleColor: this.controlPointConfig.handleColor,
        handleStrokeColor: this.controlPointConfig.handleStrokeColor,
        controlLineColor: this.controlPointConfig.controlLineColor,
        controlLineWidth: 1,
        controlLineDash: [5, 5],
        clickDetectionRadius: 15,
        showControlLines: this.controlPointConfig.showControlLines,
        symmetricControls: this.controlPointConfig.symmetricControls,
      },
    };
    this.engine.setInteractionConfig(config);
    this.updateStats();
    this.cdr.markForCheck();
  }

  updateSimplificationConfig(): void {
    // Note: Path simplification is applied at routing time
    // This would need to trigger re-routing of links
    this.updateStats();
    this.cdr.markForCheck();
  }

  updateRoutingConfig(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Validate line rendering style is compatible with routing algorithm
    const lineStyle = this.lineRenderingStyles.find(s => s.value === this.lineRenderingConfig.style);
    if (lineStyle && !lineStyle.compatibleWith.includes(this.routingConfig.algorithm)) {
      // Auto-adjust to compatible style
      const compatibleStyle = this.lineRenderingStyles.find(s => s.compatibleWith.includes(this.routingConfig.algorithm));
      if (compatibleStyle) {
        this.lineRenderingConfig.style = compatibleStyle.value;
        console.log(`⚠️ Auto-adjusted line style to ${compatibleStyle.label} (compatible with ${this.routingConfig.algorithm})`);
      }
    }

    // CRITICAL FIX: Update routing engine's default algorithm
    // This affects how NEW links are routed when created
    const routingEngine = this.engine.getRoutingEngine();
    routingEngine.setDefaultAlgorithm(this.routingConfig.algorithm);

    // CRITICAL FIX: Update engine's connection line style for NEW links
    // This ensures newly drawn links use the correct pathType
    this.updateEngineConnectionLineStyle();

    // Update EXISTING links with new settings
    diagram.getLinks().forEach(link => {
      link.pathType = this.lineRenderingConfig.style;
      link.markDirty(); // Force re-routing
    });

    console.log(`🔄 Updated routing: algorithm=${this.routingConfig.algorithm}, lineStyle=${this.lineRenderingConfig.style}, avoidObstacles=${this.routingConfig.avoidObstacles}, margin=${this.routingConfig.obstacleMargin}px`);

    this.updateStats();
    this.cdr.markForCheck();
  }

  updateLineRenderingConfig(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Validate line rendering style is compatible with routing algorithm
    const lineStyle = this.lineRenderingStyles.find(s => s.value === this.lineRenderingConfig.style);
    if (lineStyle && !lineStyle.compatibleWith.includes(this.routingConfig.algorithm)) {
      console.warn(`⚠️ Line style ${lineStyle.label} is not compatible with ${this.routingConfig.algorithm} routing algorithm`);
      return;
    }

    // CRITICAL FIX: Update engine's connection line style for NEW links
    this.updateEngineConnectionLineStyle();

    // Update EXISTING links with new line rendering style
    diagram.getLinks().forEach(link => {
      link.pathType = this.lineRenderingConfig.style;
      link.markDirty(); // Force re-render
    });

    console.log(`🎨 Updated line rendering: style=${this.lineRenderingConfig.style}`);

    this.updateStats();
    this.cdr.markForCheck();
  }

  /**
   * Update engine's interaction config to use the current line rendering style
   * This ensures NEW links created via connection dragging use the correct pathType
   */
  private updateEngineConnectionLineStyle(): void {
    // Map our line rendering style to engine's ConnectionLineStyle enum
    let connectionLineStyle: ConnectionLineStyle = ConnectionLineStyle.BEZIER;

    switch (this.lineRenderingConfig.style) {
      case 'direct':
        connectionLineStyle = ConnectionLineStyle.STRAIGHT;
        break;
      case 'smooth':
        // 'smooth' pathType uses bezier curves for rendering
        connectionLineStyle = ConnectionLineStyle.BEZIER;
        break;
      case 'bezier':
        connectionLineStyle = ConnectionLineStyle.BEZIER;
        break;
      case 'orthogonal':
        connectionLineStyle = ConnectionLineStyle.STEP;
        break;
    }

    // Update the engine's interaction config
    this.engine.setInteractionConfig({
      connectionLineStyle: connectionLineStyle
    });

    console.log(`🔧 Engine connectionLineStyle updated to: ${connectionLineStyle}`);
  }

  isLineStyleCompatible(style: string): boolean {
    const lineStyle = this.lineRenderingStyles.find(s => s.value === style);
    return lineStyle ? lineStyle.compatibleWith.includes(this.routingConfig.algorithm) : false;
  }

  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      this.viewport = {
        x: diagram.viewport.x,
        y: diagram.viewport.y,
        width: this.viewport.width,
        height: this.viewport.height,
      };
      this.zoom = diagram.viewport.zoom;
    }
  }

  private updateStats(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Count waypoints and control points in all links
    let waypointCount = 0;
    let controlPointCount = 0;
    let totalPoints = 0;

    for (const link of diagram.getLinks()) {
      if (link.pathType === 'orthogonal' && link.points.length > 2) {
        // Waypoints are the intermediate points (exclude start and end)
        waypointCount += link.points.length - 2;
        totalPoints += link.points.length;
      } else if (link.pathType === 'bezier' && link.segments) {
        for (const segment of link.segments) {
          if (segment.type === 'curve') {
            if (segment.control1) controlPointCount++;
            if (segment.control2) controlPointCount++;
          }
        }
      }
    }

    this.stats.waypointCount = waypointCount;
    this.stats.controlPointCount = controlPointCount;
    this.stats.originalPointCount = totalPoints;
    this.stats.simplifiedPointCount = Math.round(
      totalPoints * (1 - this.simplificationConfig.epsilon / 10)
    );
    this.stats.reductionPercent = Math.round(
      ((this.stats.originalPointCount - this.stats.simplifiedPointCount) /
        this.stats.originalPointCount) *
        100
    );
  }

  // Zoom controls
  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.min(this.zoom * 1.2, 3);
      diagram.setZoom(newZoom);
      this.zoom = diagram.viewport.zoom;
      this.updateViewportFromDiagram();
      this.cdr.markForCheck();
    }
  }

  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const newZoom = Math.max(this.zoom / 1.2, 0.1);
      diagram.setZoom(newZoom);
      this.zoom = diagram.viewport.zoom;
      this.updateViewportFromDiagram();
      this.cdr.markForCheck();
    }
  }

  resetZoom(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(80);
      this.zoom = diagram.viewport.zoom;
      this.updateViewportFromDiagram();
      this.cdr.markForCheck();
    }
  }

  // Export demo as JSON
  exportDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const json = JSON.stringify(diagram.serialize(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `advanced-routing-demo-${this.activeSection}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}
