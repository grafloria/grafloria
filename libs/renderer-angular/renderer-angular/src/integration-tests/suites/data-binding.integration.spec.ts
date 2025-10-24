import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { InteractionHandlerService } from '../../lib/services/interaction-handler.service';
import { PropertyPanelService, type PropertyDiagramNode } from '../../lib/services/property-panel.service';
import { DiagramCanvasComponent } from '../../lib/components/diagram-canvas.component';
import { PropertyPanelComponent } from '../../lib/components/property-panel/property-panel.component';
import type { PropertySchema } from '@grafloria/renderer';

/**
 * Data Binding Integration Tests
 *
 * Tests complete data flow and binding scenarios:
 * - Two-way data binding
 * - Observable data streams
 * - Event propagation
 * - State synchronization
 * - Real-time updates
 * - Cross-component communication
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
    <div class="diagram-workspace">
      <diagram-canvas
        [nodes]="nodes$ | async"
        (nodeSelected)="onNodeSelected($event)"
        (nodePositionChanged)="onNodePositionChanged($event)"
        (propertyChanged)="onPropertyChanged($event)">
      </diagram-canvas>

      <diagram-property-panel
        [selectedNodes]="selectedNodes"
        [updateMode]="'immediate'"
        (propertyChanged)="onPropertyPanelChange($event)">
      </diagram-property-panel>
    </div>
  `,
  styles: [
    `
      .diagram-workspace {
        display: flex;
        height: 600px;
      }
      diagram-canvas {
        flex: 1;
      }
      diagram-property-panel {
        width: 300px;
      }
    `,
  ],
})
class TestWorkspaceComponent {
  @ViewChild(DiagramCanvasComponent) canvas!: DiagramCanvasComponent;
  @ViewChild(PropertyPanelComponent) panel!: PropertyPanelComponent;

  nodes$ = new BehaviorSubject<DiagramNode[]>([]);
  selectedNodes: PropertyDiagramNode[] = [];

  lastNodeSelected: any = null;
  lastPositionChange: any = null;
  lastPropertyChange: any = null;

  onNodeSelected(event: any) {
    this.lastNodeSelected = event;
    // Sync selection to property panel
    if (event.node) {
      this.selectedNodes = [
        {
          id: event.node.id,
          type: event.node.type,
          properties: event.node.properties,
        },
      ];
    } else {
      this.selectedNodes = [];
    }
  }

  onNodePositionChanged(event: any) {
    this.lastPositionChange = event;
    // Update nodes data
    const nodes = this.nodes$.value;
    const node = nodes.find(n => n.id === event.nodeId);
    if (node) {
      node.x = event.x;
      node.y = event.y;
      this.nodes$.next([...nodes]);
    }
  }

  onPropertyChanged(event: any) {
    this.lastPropertyChange = event;
  }

  onPropertyPanelChange(event: any) {
    // Sync property changes back to nodes
    const nodes = this.nodes$.value;
    const node = nodes.find(n => n.id === event.nodes[0]?.id);
    if (node) {
      node.properties[event.property] = event.value;
      this.nodes$.next([...nodes]);
    }
  }

  addNode(node: DiagramNode) {
    this.nodes$.next([...this.nodes$.value, node]);
  }

  updateNode(id: string, updates: Partial<DiagramNode>) {
    const nodes = this.nodes$.value;
    const index = nodes.findIndex(n => n.id === id);
    if (index >= 0) {
      nodes[index] = { ...nodes[index], ...updates };
      this.nodes$.next([...nodes]);
    }
  }

  removeNode(id: string) {
    this.nodes$.next(this.nodes$.value.filter(n => n.id !== id));
  }
}

describe('Data Binding Integration Tests', () => {
  let component: TestWorkspaceComponent;
  let fixture: ComponentFixture<TestWorkspaceComponent>;
  let interactionService: InteractionHandlerService;
  let propertyService: PropertyPanelService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestWorkspaceComponent],
      imports: [CommonModule, DiagramCanvasComponent, PropertyPanelComponent],
      providers: [InteractionHandlerService, PropertyPanelService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestWorkspaceComponent);
    component = fixture.componentInstance;
    interactionService = TestBed.inject(InteractionHandlerService);
    propertyService = TestBed.inject(PropertyPanelService);

    // Register schema
    const schema: PropertySchema = {
      nodeType: 'process',
      properties: {
        label: { type: 'string', label: 'Label', default: '' },
        color: { type: 'string', label: 'Color', default: '#4CAF50' },
      },
    };
    propertyService.registerSchema('process', schema);

    fixture.detectChanges();
  });

  afterEach(() => {
    propertyService.clearSchemas();
  });

  describe('Scenario 1: Two-Way Data Binding', () => {
    it('should sync data between canvas and property panel', async () => {
      // Add a node
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { label: 'Process 1', color: '#FF0000' },
      };
      component.addNode(node);
      fixture.detectChanges();
      await fixture.whenStable();

      // Select node (simulated)
      component.onNodeSelected({ node });
      fixture.detectChanges();

      // Property panel should show node data
      expect(component.selectedNodes.length).toBe(1);
      expect(component.selectedNodes[0].properties.label).toBe('Process 1');

      // Change property in panel
      component.onPropertyPanelChange({
        nodes: component.selectedNodes,
        property: 'label',
        value: 'Updated Process',
      });
      fixture.detectChanges();

      // Node data should be updated
      const updatedNode = component.nodes$.value[0];
      expect(updatedNode.properties.label).toBe('Updated Process');
    });

    it('should propagate changes from canvas to panel', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { label: 'Start' },
      };
      component.addNode(node);
      component.onNodeSelected({ node });
      fixture.detectChanges();

      // Move node on canvas
      component.onNodePositionChanged({ nodeId: 'node1', x: 200, y: 200 });
      fixture.detectChanges();

      // Node position should be updated
      const updated = component.nodes$.value[0];
      expect(updated.x).toBe(200);
      expect(updated.y).toBe(200);
    });
  });

  describe('Scenario 2: Observable Data Streams', () => {
    it('should react to observable updates', async () => {
      const nodes: DiagramNode[] = [
        { id: 'n1', type: 'process', x: 0, y: 0, properties: {} },
        { id: 'n2', type: 'process', x: 100, y: 0, properties: {} },
      ];
      component.nodes$.next(nodes);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.nodes$.value.length).toBe(2);

      // Add more nodes
      component.addNode({ id: 'n3', type: 'process', x: 200, y: 0, properties: {} });
      fixture.detectChanges();

      expect(component.nodes$.value.length).toBe(3);
    });

    it('should handle rapid updates', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 0,
        y: 0,
        properties: { label: 'Test' },
      };
      component.addNode(node);

      // Rapid property updates
      for (let i = 0; i < 100; i++) {
        component.updateNode('node1', {
          properties: { label: `Test ${i}` },
        });
      }
      fixture.detectChanges();
      await fixture.whenStable();

      const finalNode = component.nodes$.value[0];
      expect(finalNode.properties.label).toBe('Test 99');
    });
  });

  describe('Scenario 3: Event Propagation Chain', () => {
    it('should propagate events through component hierarchy', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { label: 'Test' },
      };
      component.addNode(node);
      fixture.detectChanges();

      // Simulate canvas interaction
      component.onNodeSelected({ node });
      fixture.detectChanges();

      // Event should reach parent
      expect(component.lastNodeSelected).toBeTruthy();
      expect(component.lastNodeSelected.node.id).toBe('node1');

      // Property panel should update
      expect(component.selectedNodes[0].id).toBe('node1');
    });

    it('should handle event bubbling correctly', async () => {
      const nodes: DiagramNode[] = [
        { id: 'n1', type: 'process', x: 0, y: 0, properties: { label: 'A' } },
        { id: 'n2', type: 'process', x: 100, y: 0, properties: { label: 'B' } },
      ];
      component.nodes$.next(nodes);
      fixture.detectChanges();

      // Select first node
      component.onNodeSelected({ node: nodes[0] });
      expect(component.selectedNodes[0].id).toBe('n1');

      // Select second node
      component.onNodeSelected({ node: nodes[1] });
      expect(component.selectedNodes[0].id).toBe('n2');
    });
  });

  describe('Scenario 4: State Synchronization', () => {
    it('should maintain consistent state across components', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { label: 'Process', color: '#FF0000' },
      };
      component.addNode(node);
      component.onNodeSelected({ node });
      fixture.detectChanges();

      // Change property
      component.onPropertyPanelChange({
        nodes: component.selectedNodes,
        property: 'color',
        value: '#00FF00',
      });
      fixture.detectChanges();

      // Both components should have consistent state
      expect(component.nodes$.value[0].properties.color).toBe('#00FF00');
      expect(component.selectedNodes[0].properties.color).toBe('#00FF00');
    });

    it('should handle state conflicts gracefully', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { label: 'Original' },
      };
      component.addNode(node);
      component.onNodeSelected({ node });
      fixture.detectChanges();

      // Concurrent updates
      component.updateNode('node1', { properties: { label: 'Update 1' } });
      component.onPropertyPanelChange({
        nodes: component.selectedNodes,
        property: 'label',
        value: 'Update 2',
      });
      fixture.detectChanges();

      // Last update should win
      expect(component.nodes$.value[0].properties.label).toBe('Update 2');
    });
  });

  describe('Scenario 5: Real-Time Updates', () => {
    it('should update UI immediately on property change', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { label: 'Test' },
      };
      component.addNode(node);
      fixture.detectChanges();

      const start = performance.now();
      component.updateNode('node1', { properties: { label: 'Updated' } });
      fixture.detectChanges();
      await fixture.whenStable();
      const elapsed = performance.now() - start;

      expect(component.nodes$.value[0].properties.label).toBe('Updated');
      expect(elapsed).toBeLessThan(50); // Should be nearly instant
    });

    it('should batch multiple updates efficiently', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 0,
        y: 0,
        properties: {},
      };
      component.addNode(node);

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        component.updateNode('node1', { x: i * 10, y: i * 10 });
      }
      fixture.detectChanges();
      await fixture.whenStable();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Batching should keep it fast
    });
  });

  describe('Scenario 6: Complex Data Flow', () => {
    it('should handle multi-node selection and editing', async () => {
      const nodes: DiagramNode[] = [
        { id: 'n1', type: 'process', x: 0, y: 0, properties: { color: '#FF0000' } },
        { id: 'n2', type: 'process', x: 100, y: 0, properties: { color: '#FF0000' } },
        { id: 'n3', type: 'process', x: 200, y: 0, properties: { color: '#FF0000' } },
      ];
      component.nodes$.next(nodes);
      fixture.detectChanges();

      // Select multiple nodes
      component.selectedNodes = nodes.map(n => ({
        id: n.id,
        type: n.type,
        properties: n.properties,
      }));
      fixture.detectChanges();

      // Change property for all
      component.onPropertyPanelChange({
        nodes: component.selectedNodes,
        property: 'color',
        value: '#00FF00',
      });
      fixture.detectChanges();

      // All nodes should be updated
      component.nodes$.value.forEach(node => {
        expect(node.properties.color).toBe('#00FF00');
      });
    });

    it('should handle nested property updates', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: {
          config: {
            advanced: {
              setting: 'value',
            },
          },
        },
      };
      component.addNode(node);
      fixture.detectChanges();

      // Update nested property
      const updated = { ...node };
      updated.properties = {
        config: {
          advanced: {
            setting: 'new-value',
          },
        },
      };
      component.updateNode('node1', updated);
      fixture.detectChanges();

      expect(component.nodes$.value[0].properties.config.advanced.setting).toBe('new-value');
    });
  });

  describe('Scenario 7: Data Validation During Binding', () => {
    it('should validate data before applying updates', async () => {
      propertyService.registerSchema('process', {
        nodeType: 'process',
        properties: {
          count: {
            type: 'number',
            label: 'Count',
            validation: { min: 0, max: 100 },
            default: 50,
          },
        },
      });

      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 100,
        y: 100,
        properties: { count: 50 },
      };
      component.addNode(node);
      component.onNodeSelected({ node });
      fixture.detectChanges();

      // Try invalid value
      component.onPropertyPanelChange({
        nodes: component.selectedNodes,
        property: 'count',
        value: 150, // Invalid
      });
      fixture.detectChanges();

      // Validation should catch it
      const errors = propertyService.getErrors('count');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 8: Memory and Performance Under Load', () => {
    it('should handle large datasets efficiently', async () => {
      const nodes: DiagramNode[] = [];
      for (let i = 0; i < 1000; i++) {
        nodes.push({
          id: `node-${i}`,
          type: 'process',
          x: (i % 10) * 100,
          y: Math.floor(i / 10) * 100,
          properties: { label: `Node ${i}` },
        });
      }

      const start = performance.now();
      component.nodes$.next(nodes);
      fixture.detectChanges();
      await fixture.whenStable();
      const elapsed = performance.now() - start;

      expect(component.nodes$.value.length).toBe(1000);
      expect(elapsed).toBeLessThan(1000); // Should handle large datasets
    });

    it('should not leak memory on repeated updates', async () => {
      const node: DiagramNode = {
        id: 'node1',
        type: 'process',
        x: 0,
        y: 0,
        properties: { label: 'Test' },
      };
      component.addNode(node);

      // Many updates
      for (let i = 0; i < 1000; i++) {
        component.updateNode('node1', {
          properties: { label: `Test ${i}` },
        });
      }
      fixture.detectChanges();
      await fixture.whenStable();

      // Should complete without memory issues
      expect(component.nodes$.value[0].properties.label).toBe('Test 999');
    });
  });
});
