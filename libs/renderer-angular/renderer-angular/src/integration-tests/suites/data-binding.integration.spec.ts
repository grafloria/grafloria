import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { DiagramCanvasComponent } from '../../lib/components/diagram-canvas.component';
import {
  PropertyPanelComponent,
  type PropertyPanelChangeEvent,
  type ValidationErrorEvent,
} from '../../lib/components/property-panel/property-panel.component';
import {
  PropertyPanelService,
  type PropertyChangeEvent,
  type PropertyDiagramNode,
} from '../../lib/services/property-panel.service';
import type { PropertyDefinition } from '@grafloria/renderer';

/**
 * Data Binding Integration Tests
 *
 * Complete data flow across the real stack: a live `DiagramEngine` rendered by
 * `DiagramCanvasComponent`, with engine selection events driving a
 * `PropertyPanelComponent` whose edits land back in the engine's `NodeModel.data`:
 * - Two-way binding between the engine model and the property panel
 * - Observable change streams (`propertyChanged$` and its filters)
 * - Event propagation (engine selection → panel)
 * - State synchronization and conflicting writers
 * - Validation gating writes into the model
 * - Behaviour under many nodes / rapid updates
 *
 * This suite was originally written against components that never existed
 * (`diagram-canvas` with `[nodes]`/`(nodeSelected)` bindings, object-map
 * schemas, nodes with `.properties`, `service.getErrors()`) — it never
 * compiled. It has been retargeted at the real contract: the canvas takes a
 * `DiagramEngine` via `[engine]`, selection flows through the engine's
 * `selection:changed` event, and property state lives in `NodeModel.data`
 * (which structurally satisfies the panel's `PropertyDiagramNode`).
 */

@Component({
  standalone: false,
  template: `
    <div class="diagram-workspace">
      <grafloria-diagram-canvas [engine]="engine"></grafloria-diagram-canvas>

      <diagram-property-panel
        [selectedNodes]="selectedNodes"
        [updateMode]="'immediate'"
        (propertyChanged)="onPanelChange($event)"
        (validationError)="onValidationError($event)">
      </diagram-property-panel>
    </div>
  `,
  styles: [
    `
      .diagram-workspace {
        display: flex;
        height: 600px;
      }
      grafloria-diagram-canvas {
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

  engine!: DiagramEngine;
  selectedNodes: PropertyDiagramNode[] = [];

  lastPanelChange: PropertyPanelChangeEvent | null = null;
  lastValidationError: ValidationErrorEvent | null = null;

  onPanelChange(event: PropertyPanelChangeEvent) {
    this.lastPanelChange = event;
  }

  onValidationError(event: ValidationErrorEvent) {
    this.lastValidationError = event;
  }
}

describe('Data Binding Integration Tests', () => {
  let component: TestWorkspaceComponent;
  let fixture: ComponentFixture<TestWorkspaceComponent>;
  let propertyService: PropertyPanelService;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  function createNode(id: string, data: Record<string, any>, x = 100, y = 100): NodeModel {
    const node = new NodeModel({
      id,
      type: 'process',
      position: { x, y },
      size: { width: 120, height: 60 },
    });
    node.data = { ...data };
    diagram.addNode(node);
    return node;
  }

  /** Select nodes through the ENGINE, as canvas interactions do. */
  function selectViaEngine(...nodeIds: string[]): void {
    engine.selectNodes(nodeIds);
    fixture.detectChanges();
  }

  function def(key: string): PropertyDefinition {
    const property = propertyService.getSchema('process')?.properties.find(p => p.key === key);
    if (!property) {
      throw new Error(`Property '${key}' not registered`);
    }
    return property;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestWorkspaceComponent],
      imports: [CommonModule, DiagramCanvasComponent, PropertyPanelComponent],
      providers: [PropertyPanelService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestWorkspaceComponent);
    component = fixture.componentInstance;
    propertyService = TestBed.inject(PropertyPanelService);

    engine = new DiagramEngine();
    diagram = engine.createDiagram('data-binding-test');
    component.engine = engine;

    // Engine selection drives the property panel — the binding under test.
    // NodeModel (id/type/data) structurally satisfies PropertyDiagramNode.
    engine.on('selection:changed', (event: { nodes?: string[] }) => {
      if (event?.nodes) {
        component.selectedNodes = event.nodes
          .map(id => diagram.getNode(id))
          .filter((n): n is NodeModel => !!n);
      }
    });

    propertyService.registerSchema('process', {
      properties: [
        { key: 'label', label: 'Label', editor: 'string', defaultValue: '' },
        { key: 'color', label: 'Color', editor: 'color', defaultValue: '#4CAF50' },
      ],
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    propertyService.clearSchemas();
    engine.destroy();
  });

  describe('Scenario 1: Two-Way Data Binding', () => {
    it('should sync data from the engine model into the property panel', () => {
      const node = createNode('node1', { label: 'Process 1', color: '#FF0000' });
      fixture.detectChanges();

      selectViaEngine('node1');

      // Selection reached the panel with the node's data
      expect(component.selectedNodes.length).toBe(1);
      expect(component.selectedNodes[0].id).toBe('node1');
      expect(component.panel.getPropertyValue(def('label'))).toBe('Process 1');
      expect(node.state.selected).toBe(true);
    });

    it('should write panel edits back into the engine model', () => {
      const node = createNode('node1', { label: 'Process 1', color: '#FF0000' });
      fixture.detectChanges();
      selectViaEngine('node1');

      component.panel.onPropertyChange(def('label'), 'Updated Process');
      fixture.detectChanges();

      // The edit landed in the ENGINE's node, not a copy
      expect(node.data['label']).toBe('Updated Process');
      expect(diagram.getNode('node1')!.data['label']).toBe('Updated Process');
      expect(component.lastPanelChange!.property).toBe('label');
      expect(component.lastPanelChange!.value).toBe('Updated Process');
    });

    it('should reflect model position changes made outside the panel', () => {
      const node = createNode('node1', { label: 'Start' });
      fixture.detectChanges();
      selectViaEngine('node1');

      // Canvas-side mutation (what a drag ends in)
      node.setPosition(200, 200);

      expect(node.position.x).toBe(200);
      expect(node.position.y).toBe(200);
      // The panel's node reference is the same live object
      expect((component.selectedNodes[0] as NodeModel).position.x).toBe(200);
    });
  });

  describe('Scenario 2: Observable Data Streams', () => {
    it('should emit change events on the service stream', () => {
      const node = createNode('node1', { label: 'Test' });
      const events: PropertyChangeEvent[] = [];
      propertyService.propertyChanged$.subscribe(e => events.push(e));

      propertyService.setPropertyValue(node, 'label', 'One');
      propertyService.setPropertyValue(node, 'label', 'Two');

      expect(events.length).toBe(2);
      expect(events[0].nodeId).toBe('node1');
      expect(events[0].oldValue).toBe('Test');
      expect(events[0].newValue).toBe('One');
      expect(events[1].oldValue).toBe('One');
      expect(events[1].newValue).toBe('Two');
    });

    it('should filter streams by node and by property key', () => {
      const node1 = createNode('n1', { label: 'A', color: '#111111' });
      const node2 = createNode('n2', { label: 'B', color: '#222222' });

      const forNode1: PropertyChangeEvent[] = [];
      const forColor: PropertyChangeEvent[] = [];
      propertyService.getPropertyChangesForNode('n1').subscribe(e => forNode1.push(e));
      propertyService.getPropertyChangesForKey('color').subscribe(e => forColor.push(e));

      propertyService.setPropertyValue(node1, 'label', 'A2');
      propertyService.setPropertyValue(node2, 'label', 'B2');
      propertyService.setPropertyValue(node2, 'color', '#333333');

      expect(forNode1.length).toBe(1);
      expect(forNode1[0].newValue).toBe('A2');
      expect(forColor.length).toBe(1);
      expect(forColor[0].nodeId).toBe('n2');
    });

    it('should handle rapid updates and keep the last value', () => {
      const node = createNode('node1', { label: 'Test' });
      const events: PropertyChangeEvent[] = [];
      propertyService.propertyChanged$.subscribe(e => events.push(e));

      for (let i = 0; i < 100; i++) {
        propertyService.setPropertyValue(node, 'label', `Test ${i}`);
      }

      expect(node.data['label']).toBe('Test 99');
      expect(events.length).toBe(100);
    });
  });

  describe('Scenario 3: Event Propagation Chain', () => {
    it('should propagate engine selection to the property panel', () => {
      createNode('node1', { label: 'Test' });
      fixture.detectChanges();

      selectViaEngine('node1');

      expect(component.selectedNodes[0].id).toBe('node1');
      expect(component.panel.selectedNodes[0].id).toBe('node1');
      // Header renders the selected node
      const label = fixture.nativeElement.querySelector('.node-label');
      expect(label?.textContent).toContain('node1');
    });

    it('should follow selection as it moves between nodes', () => {
      createNode('n1', { label: 'A' }, 0, 0);
      createNode('n2', { label: 'B' }, 100, 0);
      fixture.detectChanges();

      selectViaEngine('n1');
      expect(component.selectedNodes[0].id).toBe('n1');
      expect(component.panel.getPropertyValue(def('label'))).toBe('A');

      selectViaEngine('n2');
      expect(component.selectedNodes[0].id).toBe('n2');
      expect(component.panel.getPropertyValue(def('label'))).toBe('B');

      // Only n2 is selected in the engine state
      expect(diagram.getNode('n1')!.state.selected).toBe(false);
      expect(diagram.getNode('n2')!.state.selected).toBe(true);
    });
  });

  describe('Scenario 4: State Synchronization', () => {
    it('should maintain consistent state across components', () => {
      const node = createNode('node1', { label: 'Process', color: '#FF0000' });
      fixture.detectChanges();
      selectViaEngine('node1');

      component.panel.onPropertyChange(def('color'), '#00FF00');
      fixture.detectChanges();

      // One node object, seen consistently from every side
      expect(diagram.getNode('node1')!.data['color']).toBe('#00FF00');
      expect(component.selectedNodes[0].data['color']).toBe('#00FF00');
      expect(node.data['color']).toBe('#00FF00');
    });

    it('should let the last writer win on conflicting updates', () => {
      const node = createNode('node1', { label: 'Original' });
      fixture.detectChanges();
      selectViaEngine('node1');

      // Engine-side write followed by a panel write
      node.setData('label', 'Update 1');
      component.panel.onPropertyChange(def('label'), 'Update 2');
      fixture.detectChanges();

      expect(node.data['label']).toBe('Update 2');
      expect(node.getData('label')).toBe('Update 2');
    });
  });

  describe('Scenario 5: Real-Time Updates', () => {
    it('should apply immediate-mode edits synchronously', () => {
      const node = createNode('node1', { label: 'Test' });
      fixture.detectChanges();
      selectViaEngine('node1');

      component.panel.onPropertyChange(def('label'), 'Updated');

      // No flush needed: immediate mode wrote through before returning
      expect(node.data['label']).toBe('Updated');
      expect(component.lastPanelChange!.value).toBe('Updated');
    });
  });

  describe('Scenario 6: Complex Data Flow', () => {
    it('should handle multi-node selection and bulk editing', () => {
      const nodes = [
        createNode('n1', { color: '#FF0000' }, 0, 0),
        createNode('n2', { color: '#FF0000' }, 100, 0),
        createNode('n3', { color: '#FF0000' }, 200, 0),
      ];
      fixture.detectChanges();

      selectViaEngine('n1', 'n2', 'n3');
      expect(component.panel.selectedNodes.length).toBe(3);

      const bulkEvents: PropertyChangeEvent[] = [];
      propertyService.propertyChanged$.subscribe(e => bulkEvents.push(e));

      component.panel.onPropertyChange(def('color'), '#00FF00');
      fixture.detectChanges();

      // Every engine node updated through the bulk path, one batch event
      for (const node of nodes) {
        expect(node.data['color']).toBe('#00FF00');
      }
      expect(bulkEvents.length).toBe(1);
      expect(bulkEvents[0].nodeIds).toEqual(['n1', 'n2', 'n3']);
    });

    it('should handle nested property paths', () => {
      propertyService.clearSchemas();
      propertyService.registerSchema('process', {
        properties: [
          { key: 'config.advanced.setting', label: 'Advanced Setting', editor: 'string' },
        ],
      });

      const node = createNode('node1', {
        config: { advanced: { setting: 'value' } },
      });

      expect(propertyService.getPropertyValue(node, 'config.advanced.setting')).toBe('value');

      propertyService.setPropertyValue(node, 'config.advanced.setting', 'new-value');

      expect(node.data['config'].advanced.setting).toBe('new-value');
    });
  });

  describe('Scenario 7: Data Validation During Binding', () => {
    it('should block invalid values from reaching the engine model', () => {
      propertyService.clearSchemas();
      propertyService.registerSchema('process', {
        properties: [
          {
            key: 'count',
            label: 'Count',
            editor: 'number',
            validation: { min: 0, max: 100 },
            defaultValue: 50,
          },
        ],
      });

      const node = createNode('node1', { count: 50 });
      fixture.detectChanges();
      selectViaEngine('node1');

      // Invalid: error surfaced, model untouched
      component.panel.onPropertyChange(def('count'), 150);
      fixture.detectChanges();
      expect(component.lastValidationError).toBeTruthy();
      expect(component.lastValidationError!.property).toBe('count');
      expect(component.panel.getPropertyErrors(def('count')).length).toBeGreaterThan(0);
      expect(node.data['count']).toBe(50);

      // Valid: error cleared, model updated
      component.panel.onPropertyChange(def('count'), 75);
      fixture.detectChanges();
      expect(component.panel.getPropertyErrors(def('count')).length).toBe(0);
      expect(node.data['count']).toBe(75);
    });

    it('should reject direct service writes that fail validation', () => {
      propertyService.clearSchemas();
      propertyService.registerSchema('process', {
        properties: [
          { key: 'count', label: 'Count', editor: 'number', validation: { min: 0, max: 100 } },
        ],
      });
      const node = createNode('node1', { count: 50 });

      expect(() => propertyService.setPropertyValue(node, 'count', 999)).toThrow();
      expect(node.data['count']).toBe(50);
    });
  });

  describe('Scenario 8: Behaviour Under Load', () => {
    it('should render and bind against a large diagram', async () => {
      for (let i = 0; i < 200; i++) {
        createNode(`node-${i}`, { label: `Node ${i}` }, (i % 10) * 150, Math.floor(i / 10) * 100);
      }
      fixture.detectChanges();
      // The canvas paints on an animation-frame schedule — let a frame elapse
      await new Promise(resolve => setTimeout(resolve, 50));
      fixture.detectChanges();

      expect(diagram.getNodes().length).toBe(200);
      // The real canvas painted the viewport-visible subset (it culls
      // off-screen nodes), so we see some — but not all 200 — in the DOM.
      const rendered = fixture.nativeElement.querySelectorAll('[data-node-id]');
      expect(rendered.length).toBeGreaterThan(0);
      expect(rendered.length).toBeLessThan(200);

      // Binding is model-driven, so it works even for a culled/off-screen node
      selectViaEngine('node-199');
      expect(component.panel.getPropertyValue(def('label'))).toBe('Node 199');
    });

    it('should survive repeated updates without losing consistency', () => {
      const node = createNode('node1', { label: 'Test' });
      fixture.detectChanges();
      selectViaEngine('node1');

      for (let i = 0; i < 1000; i++) {
        propertyService.setPropertyValue(node, 'label', `Test ${i}`);
      }
      fixture.detectChanges();

      expect(node.data['label']).toBe('Test 999');
      expect(component.selectedNodes[0].data['label']).toBe('Test 999');
    });
  });
});
