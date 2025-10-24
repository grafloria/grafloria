import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { DiagramRendererService } from '../../lib/services/diagram-renderer.service';
import { PropertyPanelService, type PropertyDiagramNode } from '../../lib/services/property-panel.service';
import { ModeManagerService } from '../../lib/services/mode-manager.service';
import { SimulationEngineService } from '../../lib/services/simulation-engine.service';
import { ExecutionTrackerService } from '../../lib/services/execution-tracker.service';
import { BreakpointManagerService } from '../../lib/services/breakpoint-manager.service';
import { DiagramCanvasComponent } from '../../lib/components/diagram-canvas.component';
import { PropertyPanelComponent } from '../../lib/components/property-panel/property-panel.component';
import { RendererSwitcherComponent } from '../../lib/components/renderer-switcher/renderer-switcher.component';
import { TestDiagramBuilder, createMockSVGRenderer, createMockCanvasRenderer } from '../utils';
import { DiagramMode } from '@grafloria/engine';
import type { PropertySchema } from '@grafloria/renderer';

/**
 * Full Workflow Integration Tests
 *
 * Tests complete end-to-end workflows that exercise multiple components and services together:
 * - Complete diagram authoring workflow
 * - Debug and simulation workflow
 * - Real-world usage scenarios
 */

interface DiagramNode {
  id: string;
  type: string;
  x: number;
  y: number;
  properties: Record<string, any>;
}

@Component({
  template: `
    <div class="full-workspace">
      <div class="toolbar">
        <button (click)="addNode()">Add Node</button>
        <button (click)="deleteSelected()">Delete</button>
        <button (click)="enterDebugMode()">Debug</button>
        <button (click)="enterSimulationMode()">Simulate</button>
        <button (click)="exitMode()">Exit Mode</button>
      </div>

      <div class="main-content">
        <diagram-canvas
          #canvas
          [nodes]="nodes$ | async"
          (nodeSelected)="onNodeSelected($event)"
          (nodePositionChanged)="onNodeMoved($event)">
        </diagram-canvas>

        <div class="side-panel">
          <grafloria-renderer-switcher
            [container]="containerElement"
            [showRecommendation]="true"
            [recommendationCriteria]="{ nodeCount: nodeCount }">
          </grafloria-renderer-switcher>

          <diagram-property-panel
            [selectedNodes]="selectedNodes"
            [updateMode]="'immediate'"
            (propertyChanged)="onPropertyChanged($event)">
          </diagram-property-panel>
        </div>
      </div>

      <div class="status-bar">
        <span>Mode: {{ currentMode }}</span>
        <span>Nodes: {{ nodeCount }}</span>
        <span>Renderer: {{ activeRenderer }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      .full-workspace {
        display: flex;
        flex-direction: column;
        height: 800px;
      }
      .toolbar {
        padding: 10px;
        border-bottom: 1px solid #ccc;
      }
      .main-content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      diagram-canvas {
        flex: 1;
      }
      .side-panel {
        width: 300px;
        border-left: 1px solid #ccc;
        overflow-y: auto;
      }
      .status-bar {
        padding: 8px;
        background: #f5f5f5;
        border-top: 1px solid #ccc;
        display: flex;
        gap: 20px;
      }
    `,
  ],
})
class FullWorkspaceComponent {
  @ViewChild('canvas') canvas!: DiagramCanvasComponent;
  @ViewChild(PropertyPanelComponent) panel!: PropertyPanelComponent;
  @ViewChild(RendererSwitcherComponent) switcher!: RendererSwitcherComponent;

  nodes$ = new BehaviorSubject<DiagramNode[]>([]);
  selectedNodes: PropertyDiagramNode[] = [];
  containerElement: HTMLElement;

  currentMode = DiagramMode.DESIGN;
  nodeCount = 0;
  activeRenderer = 'none';
  private nextNodeId = 1;

  constructor(
    private rendererService: DiagramRendererService,
    private propertyService: PropertyPanelService,
    private modeManager: ModeManagerService,
    private simulationEngine: SimulationEngineService,
    private executionTracker: ExecutionTrackerService,
    private breakpointManager: BreakpointManagerService
  ) {
    this.containerElement = document.createElement('div');
    document.body.appendChild(this.containerElement);

    // Subscribe to mode changes
    this.modeManager.modeChanged$.subscribe(event => {
      if (event) {
        this.currentMode = event.currentMode;
      }
    });

    // Subscribe to renderer changes
    this.rendererService.rendererChanged$.subscribe(event => {
      if (event) {
        this.activeRenderer = event.newType;
      }
    });

    // Subscribe to node changes
    this.nodes$.subscribe(nodes => {
      this.nodeCount = nodes.length;
    });
  }

  addNode() {
    const id = `node-${this.nextNodeId++}`;
    const node: DiagramNode = {
      id,
      type: 'process',
      x: Math.random() * 600 + 50,
      y: Math.random() * 400 + 50,
      properties: {
        label: `Node ${this.nextNodeId - 1}`,
        color: '#4CAF50',
      },
    };
    this.nodes$.next([...this.nodes$.value, node]);
  }

  deleteSelected() {
    if (this.selectedNodes.length > 0) {
      const idsToDelete = this.selectedNodes.map(n => n.id);
      this.nodes$.next(this.nodes$.value.filter(n => !idsToDelete.includes(n.id)));
      this.selectedNodes = [];
    }
  }

  onNodeSelected(event: any) {
    if (event.node) {
      this.selectedNodes = [{
        id: event.node.id,
        type: event.node.type,
        properties: event.node.properties,
      }];
    } else {
      this.selectedNodes = [];
    }
  }

  onNodeMoved(event: any) {
    const nodes = this.nodes$.value;
    const node = nodes.find(n => n.id === event.nodeId);
    if (node) {
      node.x = event.x;
      node.y = event.y;
      this.nodes$.next([...nodes]);
    }
  }

  onPropertyChanged(event: any) {
    const nodes = this.nodes$.value;
    const node = nodes.find(n => n.id === event.nodes[0]?.id);
    if (node) {
      node.properties[event.property] = event.value;
      this.nodes$.next([...nodes]);
    }
  }

  enterDebugMode() {
    this.modeManager.setMode(DiagramMode.DEBUG);
    this.executionTracker.startTracking();
  }

  enterSimulationMode() {
    this.modeManager.setMode(DiagramMode.SIMULATION);
    this.simulationEngine.start();
  }

  exitMode() {
    if (this.simulationEngine.isRunning()) {
      this.simulationEngine.stop();
    }
    if (this.executionTracker.isEnabled()) {
      this.executionTracker.stopTracking();
    }
    this.modeManager.setMode(DiagramMode.DESIGN);
  }

  ngOnDestroy() {
    if (this.containerElement.parentNode) {
      document.body.removeChild(this.containerElement);
    }
  }
}

describe('Full Workflow Integration Tests', () => {
  let component: FullWorkspaceComponent;
  let fixture: ComponentFixture<FullWorkspaceComponent>;
  let rendererService: DiagramRendererService;
  let propertyService: PropertyPanelService;
  let modeManager: ModeManagerService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FullWorkspaceComponent],
      imports: [
        CommonModule,
        DiagramCanvasComponent,
        PropertyPanelComponent,
        RendererSwitcherComponent,
      ],
      providers: [
        DiagramRendererService,
        PropertyPanelService,
        ModeManagerService,
        SimulationEngineService,
        ExecutionTrackerService,
        BreakpointManagerService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FullWorkspaceComponent);
    component = fixture.componentInstance;
    rendererService = TestBed.inject(DiagramRendererService);
    propertyService = TestBed.inject(PropertyPanelService);
    modeManager = TestBed.inject(ModeManagerService);

    // Register renderers
    rendererService.registerRenderer('svg', createMockSVGRenderer());
    rendererService.registerRenderer('canvas', createMockCanvasRenderer());

    // Register schemas
    const schema: PropertySchema = {
      nodeType: 'process',
      properties: {
        label: { type: 'string', label: 'Label', default: '' },
        color: { type: 'string', label: 'Color', default: '#4CAF50' },
      },
    };
    propertyService.registerSchema('process', schema);

    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    rendererService.destroy();
    propertyService.clearSchemas();
    modeManager.reset();
  });

  describe('Workflow 1: Complete Diagram Authoring', () => {
    it('should support full diagram creation workflow', async () => {
      // 1. Start in design mode
      expect(component.currentMode).toBe(DiagramMode.DESIGN);
      expect(component.nodeCount).toBe(0);

      // 2. Add nodes
      component.addNode();
      component.addNode();
      component.addNode();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.nodeCount).toBe(3);

      // 3. Select a node
      const firstNode = component.nodes$.value[0];
      component.onNodeSelected({ node: firstNode });
      fixture.detectChanges();

      expect(component.selectedNodes.length).toBe(1);
      expect(component.selectedNodes[0].id).toBe(firstNode.id);

      // 4. Edit properties
      component.onPropertyChanged({
        nodes: component.selectedNodes,
        property: 'label',
        value: 'Updated Label',
      });
      fixture.detectChanges();

      const updatedNode = component.nodes$.value.find(n => n.id === firstNode.id);
      expect(updatedNode?.properties.label).toBe('Updated Label');

      // 5. Move node
      component.onNodeMoved({
        nodeId: firstNode.id,
        x: 300,
        y: 200,
      });
      fixture.detectChanges();

      const movedNode = component.nodes$.value.find(n => n.id === firstNode.id);
      expect(movedNode?.x).toBe(300);
      expect(movedNode?.y).toBe(200);

      // 6. Delete node
      component.onNodeSelected({ node: firstNode });
      component.deleteSelected();
      fixture.detectChanges();

      expect(component.nodeCount).toBe(2);
    });

    it('should handle complex editing scenarios', async () => {
      // Create multiple nodes
      for (let i = 0; i < 5; i++) {
        component.addNode();
      }
      fixture.detectChanges();

      // Bulk property change
      component.selectedNodes = component.nodes$.value.map(n => ({
        id: n.id,
        type: n.type,
        properties: n.properties,
      }));

      component.onPropertyChanged({
        nodes: component.selectedNodes,
        property: 'color',
        value: '#FF0000',
      });
      fixture.detectChanges();

      // All nodes should have new color
      component.nodes$.value.forEach(node => {
        expect(node.properties.color).toBe('#FF0000');
      });
    });
  });

  describe('Workflow 2: Debug and Simulation Workflow', () => {
    it('should support complete debug-simulate-analyze workflow', async () => {
      // 1. Setup: Create a diagram
      component.addNode();
      component.addNode();
      component.addNode();
      fixture.detectChanges();
      await fixture.whenStable();

      // 2. Enter Debug Mode
      component.enterDebugMode();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.currentMode).toBe(DiagramMode.DEBUG);
      expect(TestBed.inject(ExecutionTrackerService).isEnabled()).toBe(true);

      // 3. Set breakpoints
      const breakpointManager = TestBed.inject(BreakpointManagerService);
      breakpointManager.addBreakpoint('node-1');
      breakpointManager.addBreakpoint('node-2');

      expect(breakpointManager.getAllBreakpoints().length).toBe(2);

      // 4. Enter Simulation Mode
      component.enterSimulationMode();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.currentMode).toBe(DiagramMode.SIMULATION);
      const simulationEngine = TestBed.inject(SimulationEngineService);
      expect(simulationEngine.isRunning()).toBe(true);

      // 5. Run simulation
      simulationEngine.setCurrentStep(10);
      expect(simulationEngine.getCurrentStep()).toBe(10);

      // 6. Pause and analyze
      simulationEngine.pause();
      expect(simulationEngine.isPaused()).toBe(true);

      // 7. Return to design mode
      component.exitMode();
      fixture.detectChanges();

      expect(component.currentMode).toBe(DiagramMode.DESIGN);
      expect(simulationEngine.isRunning()).toBe(false);
    });

    it('should preserve state across mode transitions', async () => {
      // Create diagram
      component.addNode();
      component.addNode();
      const initialNodeCount = component.nodeCount;
      fixture.detectChanges();

      // Enter debug
      component.enterDebugMode();
      const breakpointManager = TestBed.inject(BreakpointManagerService);
      breakpointManager.addBreakpoint('node-1');
      fixture.detectChanges();

      // Enter simulation
      component.enterSimulationMode();
      fixture.detectChanges();

      // Nodes should still be there
      expect(component.nodeCount).toBe(initialNodeCount);

      // Breakpoints should still be there
      expect(breakpointManager.getAllBreakpoints().length).toBe(1);

      // Return to design
      component.exitMode();
      fixture.detectChanges();

      // Everything preserved
      expect(component.nodeCount).toBe(initialNodeCount);
      expect(breakpointManager.getAllBreakpoints().length).toBe(1);
    });
  });

  describe('Workflow 3: Renderer Optimization Workflow', () => {
    it('should optimize renderer selection based on diagram complexity', async () => {
      // Start with SVG for small diagram
      await rendererService.switchRenderer('svg', component.containerElement);
      expect(component.activeRenderer).toBe('svg');

      // Create small diagram
      for (let i = 0; i < 50; i++) {
        component.addNode();
      }
      fixture.detectChanges();

      // Build and render
      const smallDiagram = TestDiagramBuilder.createSimpleFlowchart().build();
      await rendererService.render(smallDiagram);

      // Get recommendation for larger diagram
      const largeRecommendation = rendererService.getRecommendation({ nodeCount: 2000 });
      expect(largeRecommendation.recommendedRenderer).toBe('canvas');

      // Switch to canvas for better performance
      await rendererService.switchRenderer('canvas', component.containerElement);
      expect(component.activeRenderer).toBe('canvas');

      // Render large diagram
      const largeDiagram = TestDiagramBuilder.createLargeDiagram(500).build();
      await rendererService.render(largeDiagram);

      // Benchmark both
      const comparison = await rendererService.compareRenderers(largeDiagram, ['svg', 'canvas']);
      expect(comparison.length).toBe(2);
      expect(comparison[0]).toBeTruthy();
    });
  });

  describe('Workflow 4: Real-World Usage Scenarios', () => {
    it('should handle rapid user interactions', async () => {
      const operations = [];

      // Simulate rapid user actions
      for (let i = 0; i < 20; i++) {
        component.addNode();
        fixture.detectChanges();

        if (i % 3 === 0) {
          const node = component.nodes$.value[component.nodes$.value.length - 1];
          component.onNodeSelected({ node });
          component.onPropertyChanged({
            nodes: [{ id: node.id, type: node.type, properties: node.properties }],
            property: 'label',
            value: `Quick ${i}`,
          });
        }

        operations.push(`operation-${i}`);
      }

      fixture.detectChanges();
      await fixture.whenStable();

      // All operations should complete
      expect(operations.length).toBe(20);
      expect(component.nodeCount).toBe(20);
    });

    it('should handle errors gracefully', async () => {
      // Add nodes
      component.addNode();
      component.addNode();
      fixture.detectChanges();

      // Try to delete without selection
      component.selectedNodes = [];
      component.deleteSelected();
      fixture.detectChanges();

      // Nodes should still be there
      expect(component.nodeCount).toBe(2);

      // Invalid property change
      component.onPropertyChanged({
        nodes: [],
        property: 'invalid',
        value: null,
      });
      fixture.detectChanges();

      // Should not crash
      expect(component).toBeTruthy();
    });
  });

  describe('Workflow 5: Performance Under Load', () => {
    it('should handle large diagrams efficiently', async () => {
      const start = performance.now();

      // Create many nodes
      for (let i = 0; i < 500; i++) {
        component.addNode();
      }
      fixture.detectChanges();
      await fixture.whenStable();

      const elapsed = performance.now() - start;

      expect(component.nodeCount).toBe(500);
      expect(elapsed).toBeLessThan(2000); // Should complete in reasonable time
    });

    it('should maintain responsiveness during complex operations', async () => {
      // Setup large diagram
      for (let i = 0; i < 200; i++) {
        component.addNode();
      }
      fixture.detectChanges();

      // Complex operations
      const start = performance.now();

      // Mode switches
      component.enterDebugMode();
      component.enterSimulationMode();
      component.exitMode();

      // Renderer switches
      await rendererService.switchRenderer('svg', component.containerElement);
      await rendererService.switchRenderer('canvas', component.containerElement);

      // Property updates
      for (let i = 0; i < 50; i++) {
        const node = component.nodes$.value[i];
        component.onPropertyChanged({
          nodes: [{ id: node.id, type: node.type, properties: node.properties }],
          property: 'label',
          value: `Updated ${i}`,
        });
      }

      fixture.detectChanges();
      await fixture.whenStable();

      const elapsed = performance.now() - start;

      // Should remain responsive
      expect(elapsed).toBeLessThan(3000);
      expect(component).toBeTruthy();
    });
  });
});
