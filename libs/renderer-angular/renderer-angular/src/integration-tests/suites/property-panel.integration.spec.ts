import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PropertyPanelComponent,
  type PropertyPanelChangeEvent,
  type SaveEvent,
  type ValidationErrorEvent,
} from '../../lib/components/property-panel/property-panel.component';
import { PropertyPanelService, type PropertyDiagramNode } from '../../lib/services/property-panel.service';
import { PropertyEditorRegistryService } from '../../lib/services/property-editor-registry.service';
import type { PropertyDefinition, PropertySchema } from '@grafloria/renderer';

/**
 * Property Panel Integration Tests
 *
 * The complete property panel workflow, driven through the real component and
 * service API:
 * - Dynamic property editing (immediate mode writes into node.data)
 * - Multi-node selection with mixed value detection
 * - Validation with error surfacing and recovery
 * - Conditional property visibility
 * - Deferred update mode (accumulate, then Save)
 * - Schema-driven rendering, groups, and schema replacement
 *
 * This suite was originally written against a planned API that never shipped
 * (object-map schemas with a `nodeType` field, nodes with `properties`,
 * `service.getVisibleProperties()` / `getPropertyState()` / `getErrors()`) —
 * it never compiled. It has been retargeted at the real contract:
 * `PropertySchema.properties` is a `PropertyDefinition[]` (key/label/editor),
 * nodes carry `data`, mixed-value/visibility/error state lives on the
 * component (`hasMixedValues`, `isPropertyVisible`, `getPropertyErrors`), and
 * schema replacement goes through the service's `unregisterSchema`.
 */

@Component({
  standalone: false,
  template: `
    <diagram-property-panel
      [selectedNodes]="selectedNodes"
      [updateMode]="updateMode"
      [showHeader]="showHeader"
      (propertyChanged)="onPropertyChanged($event)"
      (validationError)="onValidationError($event)"
      (save)="onSave($event)">
    </diagram-property-panel>
  `,
})
class TestHostComponent {
  @ViewChild(PropertyPanelComponent) panel!: PropertyPanelComponent;

  selectedNodes: PropertyDiagramNode[] = [];
  updateMode: 'immediate' | 'deferred' = 'immediate';
  showHeader = true;

  lastPropertyChange: PropertyPanelChangeEvent | null = null;
  lastValidationError: ValidationErrorEvent | null = null;
  lastSave: SaveEvent | null = null;

  onPropertyChanged(event: PropertyPanelChangeEvent) {
    this.lastPropertyChange = event;
  }

  onValidationError(event: ValidationErrorEvent) {
    this.lastValidationError = event;
  }

  onSave(event: SaveEvent) {
    this.lastSave = event;
  }
}

describe('Property Panel Integration Tests', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let service: PropertyPanelService;

  /** Look up a property definition from the registered schema by key. */
  function def(nodeType: string, key: string): PropertyDefinition {
    const schema = service.getSchema(nodeType);
    const property = schema?.properties.find(p => p.key === key);
    if (!property) {
      throw new Error(`Property '${key}' not found in schema '${nodeType}'`);
    }
    return property;
  }

  /** Bind nodes to the panel and flush rendering. */
  async function select(nodes: PropertyDiagramNode[]): Promise<void> {
    hostComponent.selectedNodes = nodes;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent],
      imports: [CommonModule, PropertyPanelComponent],
      providers: [PropertyPanelService, PropertyEditorRegistryService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    service = TestBed.inject(PropertyPanelService);
  });

  afterEach(() => {
    service.clearSchemas();
  });

  describe('Scenario 1: Single Node Property Editing', () => {
    it('should display and edit properties for a single node', async () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'label', label: 'Label', editor: 'string', defaultValue: 'Untitled' },
          { key: 'color', label: 'Color', editor: 'color', defaultValue: '#4CAF50' },
          { key: 'size', label: 'Size', editor: 'number', defaultValue: 100, validation: { min: 50, max: 500 } },
        ],
      };
      service.registerSchema('process', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        data: { label: 'Start Process', color: '#2196F3', size: 150 },
      };
      await select([node]);

      // Panel renders with the node's schema and values
      const compiled: HTMLElement = fixture.nativeElement;
      expect(compiled.querySelector('.diagram-property-panel')).toBeTruthy();
      expect(compiled.querySelectorAll('.property-row').length).toBe(3);
      expect(hostComponent.panel.selectedNodes).toEqual([node]);
      expect(hostComponent.panel.getPropertyValue(def('process', 'label'))).toBe('Start Process');

      // Edit a property (immediate mode)
      hostComponent.panel.onPropertyChange(def('process', 'label'), 'Updated Process');
      fixture.detectChanges();

      // Change event emitted and node data updated in place
      expect(hostComponent.lastPropertyChange).toBeTruthy();
      expect(hostComponent.lastPropertyChange!.property).toBe('label');
      expect(hostComponent.lastPropertyChange!.value).toBe('Updated Process');
      expect(node.data['label']).toBe('Updated Process');
    });

    it('should validate property values and reject invalid input', async () => {
      service.registerSchema('process', {
        properties: [
          {
            key: 'email',
            label: 'Email',
            editor: 'string',
            validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' },
          },
        ],
      });

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        data: { email: 'test@example.com' },
      };
      await select([node]);

      hostComponent.panel.onPropertyChange(def('process', 'email'), 'invalid-email');
      fixture.detectChanges();

      // Validation error surfaced, node untouched, no change event
      expect(hostComponent.lastValidationError).toBeTruthy();
      expect(hostComponent.lastValidationError!.property).toBe('email');
      expect(hostComponent.lastValidationError!.errors.length).toBeGreaterThan(0);
      expect(node.data['email']).toBe('test@example.com');
      expect(hostComponent.lastPropertyChange).toBeNull();
    });
  });

  describe('Scenario 2: Multi-Node Editing', () => {
    it('should handle editing multiple nodes simultaneously', async () => {
      service.registerSchema('process', {
        properties: [{ key: 'color', label: 'Color', editor: 'color', defaultValue: '#4CAF50' }],
      });

      const nodes: PropertyDiagramNode[] = [
        { id: 'node1', type: 'process', data: { color: '#FF0000' } },
        { id: 'node2', type: 'process', data: { color: '#00FF00' } },
        { id: 'node3', type: 'process', data: { color: '#0000FF' } },
      ];
      await select(nodes);

      hostComponent.panel.onPropertyChange(def('process', 'color'), '#FFFF00');
      fixture.detectChanges();

      // Bulk change reached every node
      expect(hostComponent.lastPropertyChange!.nodes.length).toBe(3);
      expect(hostComponent.lastPropertyChange!.value).toBe('#FFFF00');
      for (const node of nodes) {
        expect(node.data['color']).toBe('#FFFF00');
      }
    });

    it('should detect and display mixed values', async () => {
      service.registerSchema('process', {
        properties: [{ key: 'label', label: 'Label', editor: 'string', defaultValue: '' }],
      });

      const nodes: PropertyDiagramNode[] = [
        { id: 'node1', type: 'process', data: { label: 'Process A' } },
        { id: 'node2', type: 'process', data: { label: 'Process B' } },
      ];
      await select(nodes);

      const labelDef = def('process', 'label');
      expect(hostComponent.panel.hasMixedValues(labelDef)).toBe(true);
      expect(hostComponent.panel.getPropertyValue(labelDef)).toBe('(multiple values)');
      expect(fixture.nativeElement.querySelector('.mixed-values-indicator')).toBeTruthy();

      // Editing collapses the mixed state to one shared value
      hostComponent.panel.onPropertyChange(labelDef, 'Shared');
      fixture.detectChanges();
      expect(hostComponent.panel.hasMixedValues(labelDef)).toBe(false);
      expect(nodes[0].data['label']).toBe('Shared');
      expect(nodes[1].data['label']).toBe('Shared');
    });
  });

  describe('Scenario 3: Conditional Properties', () => {
    it('should show/hide properties based on conditions', async () => {
      service.registerSchema('process', {
        properties: [
          { key: 'executionType', label: 'Type', editor: 'string', defaultValue: 'manual' },
          {
            key: 'schedule',
            label: 'Schedule',
            editor: 'string',
            condition: { property: 'executionType', operator: '==', value: 'automated' },
          },
        ],
      });

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        data: { executionType: 'manual' },
      };
      await select([node]);

      const scheduleDef = def('process', 'schedule');
      expect(service.isPropertyVisible(node, scheduleDef)).toBe(false);
      expect(hostComponent.panel.isPropertyVisible(scheduleDef)).toBe(false);

      // Flip the driving property through the panel (immediate mode)
      hostComponent.panel.onPropertyChange(def('process', 'executionType'), 'automated');
      fixture.detectChanges();

      expect(node.data['executionType']).toBe('automated');
      expect(service.isPropertyVisible(node, scheduleDef)).toBe(true);
      expect(hostComponent.panel.isPropertyVisible(scheduleDef)).toBe(true);
    });
  });

  describe('Scenario 4: Deferred Update Mode', () => {
    it('should accumulate changes and apply on save', async () => {
      service.registerSchema('process', {
        properties: [
          { key: 'label', label: 'Label', editor: 'string', defaultValue: '' },
          { key: 'color', label: 'Color', editor: 'color', defaultValue: '#000000' },
        ],
      });

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        data: { label: 'Original', color: '#FF0000' },
      };
      hostComponent.updateMode = 'deferred';
      await select([node]);

      hostComponent.panel.onPropertyChange(def('process', 'label'), 'Modified');
      hostComponent.panel.onPropertyChange(def('process', 'color'), '#00FF00');
      fixture.detectChanges();

      // Nothing applied to the node yet, no save event
      expect(node.data['label']).toBe('Original');
      expect(node.data['color']).toBe('#FF0000');
      expect(hostComponent.lastSave).toBeNull();

      hostComponent.panel.onSave();
      fixture.detectChanges();

      // Save event carries the accumulated values, node updated
      expect(hostComponent.lastSave).toBeTruthy();
      expect(hostComponent.lastSave!.changes['label']).toBe('Modified');
      expect(hostComponent.lastSave!.changes['color']).toBe('#00FF00');
      expect(node.data['label']).toBe('Modified');
      expect(node.data['color']).toBe('#00FF00');
    });
  });

  describe('Scenario 5: Property Groups and Sections', () => {
    it('should organize properties into groups', async () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'label', label: 'Label', editor: 'string', group: 'Basic', defaultValue: '' },
          { key: 'description', label: 'Description', editor: 'string', group: 'Basic', defaultValue: '' },
          { key: 'color', label: 'Color', editor: 'color', group: 'Appearance', defaultValue: '#000000' },
          { key: 'size', label: 'Size', editor: 'number', group: 'Appearance', defaultValue: 100 },
        ],
      };
      service.registerSchema('process', schema);

      const groups = service.getPropertyGroups(service.getSchema('process')!);
      expect(groups.size).toBe(2);
      expect(groups.has('Basic')).toBe(true);
      expect(groups.has('Appearance')).toBe(true);
      expect(groups.get('Basic')?.length).toBe(2);
      expect(groups.get('Appearance')?.length).toBe(2);

      // The panel renders the same grouping
      await select([{ id: 'node1', type: 'process', data: {} }]);
      const groupEls = fixture.nativeElement.querySelectorAll('.property-group');
      expect(groupEls.length).toBe(2);
      expect(hostComponent.panel.propertyGroups.get('Basic')?.length).toBe(2);
      expect(hostComponent.panel.propertyGroups.get('Appearance')?.length).toBe(2);
    });
  });

  describe('Scenario 6: Schema Updates and Re-rendering', () => {
    it('should re-render when the schema is replaced', async () => {
      service.registerSchema('process', {
        properties: [{ key: 'label', label: 'Label', editor: 'string', defaultValue: '' }],
      });

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        data: { label: 'Test' },
      };
      await select([node]);

      expect(hostComponent.panel.schema!.properties.length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('.property-row').length).toBe(1);

      // Replace the schema (registerSchema rejects duplicates by design)
      service.unregisterSchema('process');
      service.registerSchema('process', {
        properties: [
          { key: 'label', label: 'Label', editor: 'string', defaultValue: '' },
          { key: 'color', label: 'Color', editor: 'color', defaultValue: '#000000' },
          { key: 'size', label: 'Size', editor: 'number', defaultValue: 100 },
        ],
      });

      // Re-binding the selection reloads the schema
      await select([node]);

      expect(hostComponent.panel.schema!.properties.length).toBe(3);
      expect(fixture.nativeElement.querySelectorAll('.property-row').length).toBe(3);
    });
  });

  describe('Scenario 7: Error Handling and Recovery', () => {
    it('should handle a node type without a registered schema gracefully', async () => {
      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'unknown-type',
        data: {},
      };

      await select([node]);

      // No crash: panel exists, no schema, no property rows
      expect(hostComponent.panel).toBeTruthy();
      expect(hostComponent.panel.schema).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.property-row').length).toBe(0);
    });

    it('should recover from validation errors', async () => {
      service.registerSchema('process', {
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

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        data: { count: 50 },
      };
      await select([node]);

      const countDef = def('process', 'count');

      // Invalid value: error recorded, node untouched
      hostComponent.panel.onPropertyChange(countDef, 150);
      fixture.detectChanges();
      expect(hostComponent.lastValidationError).toBeTruthy();
      expect(hostComponent.panel.getPropertyErrors(countDef).length).toBeGreaterThan(0);
      expect(fixture.nativeElement.querySelector('.property-errors')).toBeTruthy();
      expect(node.data['count']).toBe(50);

      // Valid value: error cleared, node updated
      hostComponent.panel.onPropertyChange(countDef, 75);
      fixture.detectChanges();
      expect(hostComponent.panel.getPropertyErrors(countDef).length).toBe(0);
      expect(fixture.nativeElement.querySelector('.property-errors')).toBeNull();
      expect(node.data['count']).toBe(75);
    });
  });

  describe('Scenario 8: Performance with Many Properties', () => {
    it('should render schemas with many properties completely', async () => {
      const properties: PropertyDefinition[] = [];
      for (let i = 0; i < 50; i++) {
        properties.push({
          key: `prop${i}`,
          label: `Property ${i}`,
          editor: 'string',
          defaultValue: '',
        });
      }
      service.registerSchema('complex', { properties });

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'complex',
        data: {},
      };

      const start = performance.now();
      await select([node]);
      const elapsed = performance.now() - start;

      // Everything rendered, in a sane amount of time for jsdom
      expect(hostComponent.panel.schema!.properties.length).toBe(50);
      expect(fixture.nativeElement.querySelectorAll('.property-row').length).toBe(50);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
