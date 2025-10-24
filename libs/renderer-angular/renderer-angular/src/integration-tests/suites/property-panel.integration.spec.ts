import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PropertyPanelComponent } from '../../lib/components/property-panel/property-panel.component';
import { PropertyPanelService, type PropertyDiagramNode } from '../../lib/services/property-panel.service';
import { PropertyEditorRegistryService } from '../../lib/services/property-editor-registry.service';
import type { PropertySchema } from '@grafloria/renderer';

/**
 * Property Panel Integration Tests
 *
 * Tests the complete property panel workflow including:
 * - Dynamic property editing
 * - Multi-node selection
 * - Validation
 * - Conditional properties
 * - Update modes (immediate vs deferred)
 * - Schema-driven rendering
 */

@Component({
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

  lastPropertyChange: any = null;
  lastValidationError: any = null;
  lastSave: any = null;

  onPropertyChanged(event: any) {
    this.lastPropertyChange = event;
  }

  onValidationError(event: any) {
    this.lastValidationError = event;
  }

  onSave(event: any) {
    this.lastSave = event;
  }
}

describe('Property Panel Integration Tests', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let service: PropertyPanelService;
  let registry: PropertyEditorRegistryService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent],
      imports: [CommonModule, PropertyPanelComponent],
      providers: [PropertyPanelService, PropertyEditorRegistryService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    service = TestBed.inject(PropertyPanelService);
    registry = TestBed.inject(PropertyEditorRegistryService);
  });

  afterEach(() => {
    service.clearSchemas();
  });

  describe('Scenario 1: Single Node Property Editing', () => {
    it('should display and edit properties for a single node', async () => {
      // Register schema
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          label: {
            type: 'string',
            label: 'Label',
            default: 'Untitled',
          },
          color: {
            type: 'string',
            label: 'Color',
            default: '#4CAF50',
          },
          size: {
            type: 'number',
            label: 'Size',
            default: 100,
            min: 50,
            max: 500,
          },
        },
      };
      service.registerSchema('process', schema);

      // Create test node
      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: {
          label: 'Start Process',
          color: '#2196F3',
          size: 150,
        },
      };

      // Set selected node
      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Verify properties are displayed
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.property-panel')).toBeTruthy();

      // Verify initial values
      expect(hostComponent.panel.selectedNodes).toEqual([node]);
      expect(hostComponent.panel.selectedNodes[0].properties.label).toBe('Start Process');

      // Simulate property change
      hostComponent.panel.onPropertyChange('label', 'Updated Process');
      fixture.detectChanges();

      // Verify change event was emitted
      expect(hostComponent.lastPropertyChange).toBeTruthy();
      expect(hostComponent.lastPropertyChange.property).toBe('label');
      expect(hostComponent.lastPropertyChange.value).toBe('Updated Process');
    });

    it('should validate property values', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          email: {
            type: 'string',
            label: 'Email',
            validation: {
              pattern: '^[^@]+@[^@]+\\.[^@]+$',
              message: 'Invalid email format',
            },
          },
        },
      };
      service.registerSchema('process', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: { email: 'test@example.com' },
      };

      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Try invalid email
      hostComponent.panel.onPropertyChange('email', 'invalid-email');
      fixture.detectChanges();

      // Verify validation error was emitted
      expect(hostComponent.lastValidationError).toBeTruthy();
      expect(hostComponent.lastValidationError.property).toBe('email');
    });
  });

  describe('Scenario 2: Multi-Node Editing', () => {
    it('should handle editing multiple nodes simultaneously', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          color: {
            type: 'string',
            label: 'Color',
            default: '#4CAF50',
          },
        },
      };
      service.registerSchema('process', schema);

      const nodes: PropertyDiagramNode[] = [
        { id: 'node1', type: 'process', properties: { color: '#FF0000' } },
        { id: 'node2', type: 'process', properties: { color: '#00FF00' } },
        { id: 'node3', type: 'process', properties: { color: '#0000FF' } },
      ];

      hostComponent.selectedNodes = nodes;
      fixture.detectChanges();
      await fixture.whenStable();

      // Change color for all nodes
      hostComponent.panel.onPropertyChange('color', '#FFFF00');
      fixture.detectChanges();

      // Verify all nodes received the change
      expect(hostComponent.lastPropertyChange.nodes.length).toBe(3);
      expect(hostComponent.lastPropertyChange.value).toBe('#FFFF00');
    });

    it('should detect and display mixed values', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          label: { type: 'string', label: 'Label', default: '' },
        },
      };
      service.registerSchema('process', schema);

      const nodes: PropertyDiagramNode[] = [
        { id: 'node1', type: 'process', properties: { label: 'Process A' } },
        { id: 'node2', type: 'process', properties: { label: 'Process B' } },
      ];

      hostComponent.selectedNodes = nodes;
      fixture.detectChanges();
      await fixture.whenStable();

      // Panel should detect mixed values
      const propertyState = service.getPropertyState(nodes, 'label');
      expect(propertyState.isMixed).toBe(true);
    });
  });

  describe('Scenario 3: Conditional Properties', () => {
    it('should show/hide properties based on conditions', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          type: {
            type: 'select',
            label: 'Type',
            options: [
              { value: 'manual', label: 'Manual' },
              { value: 'automated', label: 'Automated' },
            ],
            default: 'manual',
          },
          schedule: {
            type: 'string',
            label: 'Schedule',
            condition: { property: 'type', value: 'automated' },
          },
        },
      };
      service.registerSchema('process', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: { type: 'manual' },
      };

      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Schedule should not be visible
      let visibleProps = service.getVisibleProperties(node);
      expect(visibleProps.some(p => p.key === 'schedule')).toBe(false);

      // Change to automated
      hostComponent.panel.onPropertyChange('type', 'automated');
      fixture.detectChanges();

      // Schedule should now be visible
      node.properties.type = 'automated';
      visibleProps = service.getVisibleProperties(node);
      expect(visibleProps.some(p => p.key === 'schedule')).toBe(true);
    });
  });

  describe('Scenario 4: Deferred Update Mode', () => {
    it('should accumulate changes and apply on save', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          label: { type: 'string', label: 'Label', default: '' },
          color: { type: 'string', label: 'Color', default: '#000000' },
        },
      };
      service.registerSchema('process', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: { label: 'Original', color: '#FF0000' },
      };

      hostComponent.updateMode = 'deferred';
      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Make changes
      hostComponent.panel.onPropertyChange('label', 'Modified');
      hostComponent.panel.onPropertyChange('color', '#00FF00');
      fixture.detectChanges();

      // Changes should not be applied yet
      expect(hostComponent.lastSave).toBeNull();

      // Save changes
      hostComponent.panel.onSave();
      fixture.detectChanges();

      // Verify save event contains all changes
      expect(hostComponent.lastSave).toBeTruthy();
      expect(hostComponent.lastSave.changes).toEqual({
        label: 'Modified',
        color: '#00FF00',
      });
    });
  });

  describe('Scenario 5: Property Groups and Sections', () => {
    it('should organize properties into collapsible groups', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          label: { type: 'string', label: 'Label', group: 'Basic', default: '' },
          description: { type: 'string', label: 'Description', group: 'Basic', default: '' },
          color: { type: 'string', label: 'Color', group: 'Appearance', default: '#000000' },
          size: { type: 'number', label: 'Size', group: 'Appearance', default: 100 },
        },
      };
      service.registerSchema('process', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: {},
      };

      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Get grouped properties
      const groups = service.getPropertyGroups(node);
      expect(groups.size).toBe(2);
      expect(groups.has('Basic')).toBe(true);
      expect(groups.has('Appearance')).toBe(true);
      expect(groups.get('Basic')?.length).toBe(2);
      expect(groups.get('Appearance')?.length).toBe(2);
    });
  });

  describe('Scenario 6: Schema Updates and Re-rendering', () => {
    it('should re-render when schema changes', async () => {
      const initialSchema: PropertySchema = {
        nodeType: 'process',
        properties: {
          label: { type: 'string', label: 'Label', default: '' },
        },
      };
      service.registerSchema('process', initialSchema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: { label: 'Test' },
      };

      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Initial properties
      let props = service.getVisibleProperties(node);
      expect(props.length).toBe(1);

      // Update schema with more properties
      const updatedSchema: PropertySchema = {
        nodeType: 'process',
        properties: {
          label: { type: 'string', label: 'Label', default: '' },
          color: { type: 'string', label: 'Color', default: '#000000' },
          size: { type: 'number', label: 'Size', default: 100 },
        },
      };
      service.registerSchema('process', updatedSchema);

      // Trigger reload
      hostComponent.panel['loadSchema']();
      fixture.detectChanges();
      await fixture.whenStable();

      // Should now have more properties
      props = service.getVisibleProperties(node);
      expect(props.length).toBe(3);
    });
  });

  describe('Scenario 7: Error Handling and Recovery', () => {
    it('should handle invalid schema gracefully', async () => {
      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'unknown-type',
        properties: {},
      };

      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Should not crash, should show empty panel or message
      expect(hostComponent.panel).toBeTruthy();
    });

    it('should recover from validation errors', async () => {
      const schema: PropertySchema = {
        nodeType: 'process',
        properties: {
          count: {
            type: 'number',
            label: 'Count',
            validation: { min: 0, max: 100 },
            default: 50,
          },
        },
      };
      service.registerSchema('process', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'process',
        properties: { count: 50 },
      };

      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();

      // Set invalid value
      hostComponent.panel.onPropertyChange('count', 150);
      fixture.detectChanges();

      expect(hostComponent.lastValidationError).toBeTruthy();

      // Set valid value
      hostComponent.panel.onPropertyChange('count', 75);
      fixture.detectChanges();

      // Error should be cleared
      expect(service.getErrors('count').length).toBe(0);
    });
  });

  describe('Scenario 8: Performance with Many Properties', () => {
    it('should efficiently render schemas with many properties', async () => {
      const properties: Record<string, any> = {};
      for (let i = 0; i < 50; i++) {
        properties[`prop${i}`] = {
          type: 'string',
          label: `Property ${i}`,
          default: '',
        };
      }

      const schema: PropertySchema = {
        nodeType: 'complex',
        properties,
      };
      service.registerSchema('complex', schema);

      const node: PropertyDiagramNode = {
        id: 'node1',
        type: 'complex',
        properties: {},
      };

      const start = performance.now();
      hostComponent.selectedNodes = [node];
      fixture.detectChanges();
      await fixture.whenStable();
      const elapsed = performance.now() - start;

      // Should render in reasonable time (<100ms)
      expect(elapsed).toBeLessThan(100);
      expect(hostComponent.panel).toBeTruthy();
    });
  });
});
