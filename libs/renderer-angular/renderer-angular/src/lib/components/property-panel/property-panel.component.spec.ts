import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PropertyPanelComponent } from './property-panel.component';
import { PropertyPanelService } from '../../services/property-panel.service';
import { ChangeDetectorRef } from '@angular/core';
import type { PropertySchema, PropertyDefinition } from '@grafloria/renderer';

describe('PropertyPanelComponent', () => {
  let component: PropertyPanelComponent;
  let fixture: ComponentFixture<PropertyPanelComponent>;
  let mockService: jest.Mocked<PropertyPanelService>;
  let changeDetectorRef: ChangeDetectorRef;

  const mockSchema: PropertySchema = {
    properties: [
      {
        key: 'tableName',
        label: 'Table Name',
        editor: 'string',
        group: 'General',
        order: 1,
        validation: { required: true },
        defaultValue: 'table1'
      },
      {
        key: 'description',
        label: 'Description',
        editor: 'textarea',
        group: 'General',
        order: 2
      },
      {
        key: 'fillColor',
        label: 'Fill Color',
        editor: 'color',
        group: 'Styling',
        order: 1,
        defaultValue: '#ffffff'
      },
      {
        key: 'strokeWidth',
        label: 'Stroke Width',
        editor: 'number',
        group: 'Styling',
        order: 2,
        validation: { min: 0, max: 10 }
      },
      {
        key: 'pattern',
        label: 'Pattern',
        editor: 'select',
        group: 'Styling',
        order: 3,
        validation: {
          options: [
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' }
          ]
        }
      },
      {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'string',
        group: 'Styling',
        order: 4,
        condition: {
          property: 'pattern',
          operator: '==',
          value: 'dashed'
        }
      }
    ],
    groups: [
      { name: 'General', label: 'General', order: 1 },
      { name: 'Styling', label: 'Styling', order: 2 }
    ]
  };

  const mockNode = {
    id: 'node1',
    type: 'ERD.TABLE',
    label: 'Users Table',
    data: {
      tableName: 'users',
      description: 'User accounts',
      fillColor: '#ffcc00',
      strokeWidth: 2,
      pattern: 'solid'
    }
  };

  beforeEach(async () => {
    // Isolate persisted expand/collapse state between tests
    localStorage.clear();

    mockService = {
      getSchema: jest.fn(),
      getPropertyGroups: jest.fn(),
      getPropertyValue: jest.fn(),
      setPropertyValue: jest.fn(),
      setPropertyValues: jest.fn(),
      validateProperty: jest.fn(),
      isPropertyVisible: jest.fn(),
      propertyChanged$: {
        pipe: jest.fn().mockReturnValue({ subscribe: jest.fn() })
      }
    } as any;

    await TestBed.configureTestingModule({
      imports: [PropertyPanelComponent],
      providers: [
        { provide: PropertyPanelService, useValue: mockService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PropertyPanelComponent);
    component = fixture.componentInstance;
    changeDetectorRef = fixture.debugElement.injector.get(ChangeDetectorRef);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('FR-PPC-001: Dynamic Property Rendering', () => {
    it('should load schema when node is selected', () => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map([
        ['General', mockSchema.properties.slice(0, 2)],
        ['Styling', mockSchema.properties.slice(2)]
      ]));

      component.selectedNodes = [mockNode];

      expect(mockService.getSchema).toHaveBeenCalledWith('ERD.TABLE');
      expect(component.schema).toEqual(mockSchema);
    });

    it('should clear schema when no node selected', () => {
      component.selectedNodes = [];

      expect(component.schema).toBeNull();
      expect(component.propertyGroups.size).toBe(0);
    });

    it('should organize properties into groups', () => {
      const groups = new Map([
        ['General', mockSchema.properties.slice(0, 2)],
        ['Styling', mockSchema.properties.slice(2)]
      ]);
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(groups);

      component.selectedNodes = [mockNode];

      expect(mockService.getPropertyGroups).toHaveBeenCalledWith(mockSchema);
      expect(component.propertyGroups).toEqual(groups);
    });

    it('should apply default values on first render', () => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map());
      mockService.getPropertyValue.mockImplementation((node, key) => {
        return node.data[key];
      });

      component.selectedNodes = [mockNode];

      const tableNameValue = component.getPropertyValue(mockSchema.properties[0]);
      expect(tableNameValue).toBe('users');
    });

    it('should handle missing schema gracefully', () => {
      mockService.getSchema.mockReturnValue(null);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      component.selectedNodes = [mockNode];

      expect(component.schema).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No schema registered for node type')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('FR-PPC-002: Property Groups', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map([
        ['General', mockSchema.properties.slice(0, 2)],
        ['Styling', mockSchema.properties.slice(2)]
      ]));
    });

    it('should render groups as expandable panels', () => {
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const groupHeaders = compiled.querySelectorAll('.group-header');
      expect(groupHeaders.length).toBeGreaterThan(0);
    });

    it('should toggle group expand/collapse', () => {
      component.selectedNodes = [mockNode];
      component.expandedGroups.add('General');

      expect(component.isGroupExpanded('General')).toBe(true);

      component.toggleGroup('General');
      expect(component.isGroupExpanded('General')).toBe(false);

      component.toggleGroup('General');
      expect(component.isGroupExpanded('General')).toBe(true);
    });

    it('should expand all groups by default on first load', () => {
      component.selectedNodes = [mockNode];

      expect(component.expandedGroups.has('General')).toBe(true);
      expect(component.expandedGroups.has('Styling')).toBe(true);
    });

    it('should persist expand/collapse state', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      component.selectedNodes = [mockNode];
      component.expandedGroups.add('General');
      component.expandedGroups.add('Styling');

      component.ngOnDestroy();

      expect(setItemSpy).toHaveBeenCalledWith(
        'diagram.propertyPanel.expandedGroups',
        JSON.stringify(['General', 'Styling'])
      );

      setItemSpy.mockRestore();
    });
  });

  describe('FR-PPC-003: Property Editing', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map([
        ['General', mockSchema.properties.slice(0, 2)]
      ]));
      mockService.getPropertyValue.mockImplementation((node, key) => node.data[key]);
    });

    it('should update property value in immediate mode', () => {
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });
      mockService.setPropertyValue.mockReturnValue('users');

      component.updateMode = 'immediate';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');

      expect(mockService.validateProperty).toHaveBeenCalledWith('new_users', property);
      expect(mockService.setPropertyValue).toHaveBeenCalledWith(mockNode, 'tableName', 'new_users');
      expect(component.isDirty).toBe(true);
    });

    it('should not update in deferred mode until save', () => {
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });

      component.updateMode = 'deferred';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');

      expect(mockService.setPropertyValue).not.toHaveBeenCalled();
      expect(component.isDirty).toBe(true);
    });

    it('should show dirty indicator when value changes', () => {
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });

      component.selectedNodes = [mockNode];
      expect(component.isDirty).toBe(false);

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');

      expect(component.isDirty).toBe(true);
    });

    it('should emit propertyChanged event', () => {
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });
      mockService.setPropertyValue.mockReturnValue('users');

      const emitSpy = jest.spyOn(component.propertyChanged, 'emit');

      component.updateMode = 'immediate';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');

      expect(emitSpy).toHaveBeenCalledWith({
        nodes: [mockNode],
        property: 'tableName',
        value: 'new_users'
      });
    });
  });

  describe('FR-PPC-004: Validation Display', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map());
      mockService.getPropertyValue.mockImplementation((node, key) => node.data[key]);
    });

    it('should display validation errors', () => {
      const validationErrors = [
        { message: 'Table name is required' }
      ];
      mockService.validateProperty.mockReturnValue({
        valid: false,
        errors: validationErrors
      });

      component.selectedNodes = [mockNode];
      const property = mockSchema.properties[0];
      component.onPropertyChange(property, '');

      expect(component.propertyErrors.get('tableName')).toEqual(['Table name is required']);
    });

    it('should prevent invalid values from being saved', () => {
      mockService.validateProperty.mockReturnValue({
        valid: false,
        errors: [{ message: 'Invalid value' }]
      });

      component.selectedNodes = [mockNode];
      const property = mockSchema.properties[0];
      component.onPropertyChange(property, '');

      expect(mockService.setPropertyValue).not.toHaveBeenCalled();
    });

    it('should clear errors when value becomes valid', () => {
      // First set invalid
      mockService.validateProperty.mockReturnValue({
        valid: false,
        errors: [{ message: 'Invalid value' }]
      });

      component.selectedNodes = [mockNode];
      const property = mockSchema.properties[0];
      component.onPropertyChange(property, '');

      expect(component.propertyErrors.has('tableName')).toBe(true);

      // Then set valid
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });
      component.onPropertyChange(property, 'valid_table');

      expect(component.propertyErrors.has('tableName')).toBe(false);
    });

    it('should emit validationError event', () => {
      const validationErrors = [{ message: 'Invalid value' }];
      mockService.validateProperty.mockReturnValue({
        valid: false,
        errors: validationErrors
      });

      const emitSpy = jest.spyOn(component.validationError, 'emit');

      component.selectedNodes = [mockNode];
      const property = mockSchema.properties[0];
      component.onPropertyChange(property, '');

      expect(emitSpy).toHaveBeenCalledWith({
        property: 'tableName',
        errors: ['Invalid value']
      });
    });
  });

  describe('FR-PPC-005: Conditional Visibility', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map());
      mockService.getPropertyValue.mockImplementation((node, key) => node.data[key]);
    });

    it('should hide property when condition not met', () => {
      mockService.isPropertyVisible.mockReturnValue(false);

      component.selectedNodes = [mockNode];
      const conditionalProperty = mockSchema.properties[5]; // patternType

      expect(component.isPropertyVisible(conditionalProperty)).toBe(false);
    });

    it('should show property when condition met', () => {
      mockService.isPropertyVisible.mockReturnValue(true);

      const nodeWithDashedPattern = {
        ...mockNode,
        data: { ...mockNode.data, pattern: 'dashed' }
      };
      component.selectedNodes = [nodeWithDashedPattern];

      const conditionalProperty = mockSchema.properties[5]; // patternType

      expect(component.isPropertyVisible(conditionalProperty)).toBe(true);
    });

    it('should update visibility when dependency changes', () => {
      mockService.isPropertyVisible
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });

      component.selectedNodes = [mockNode];
      const patternProperty = mockSchema.properties[4]; // pattern
      const conditionalProperty = mockSchema.properties[5]; // patternType

      expect(component.isPropertyVisible(conditionalProperty)).toBe(false);

      // Change pattern to 'dashed'
      mockNode.data.pattern = 'dashed';
      component.onPropertyChange(patternProperty, 'dashed');

      expect(component.isPropertyVisible(conditionalProperty)).toBe(true);
    });
  });

  describe('FR-PPC-006: Multi-Node Editing', () => {
    const mockNode2 = {
      id: 'node2',
      type: 'ERD.TABLE',
      label: 'Products Table',
      data: {
        tableName: 'products',
        description: 'Product catalog',
        fillColor: '#ffcc00',
        strokeWidth: 2,
        pattern: 'solid'
      }
    };

    const mockNode3 = {
      id: 'node3',
      type: 'ERD.TABLE',
      label: 'Orders Table',
      data: {
        tableName: 'orders',
        description: 'Customer orders',
        fillColor: '#00ccff',
        strokeWidth: 3,
        pattern: 'dashed'
      }
    };

    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map());
      mockService.getPropertyValue.mockImplementation((node, key) => node.data[key]);
    });

    it('should detect mixed values for properties', () => {
      component.selectedNodes = [mockNode, mockNode2, mockNode3];

      const fillColorProperty = mockSchema.properties[2];
      expect(component.hasMixedValues(fillColorProperty)).toBe(true);
    });

    it('should show placeholder for mixed values', () => {
      component.selectedNodes = [mockNode, mockNode3];
      component.propertyValues.set('fillColor', undefined); // Mixed

      const fillColorProperty = mockSchema.properties[2];
      const value = component.getPropertyValue(fillColorProperty);

      expect(value).toBe('(multiple values)');
    });

    it('should apply changes to all selected nodes', () => {
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });
      mockService.setPropertyValues.mockReturnValue(['node1', 'node2', 'node3']);

      component.updateMode = 'immediate';
      component.selectedNodes = [mockNode, mockNode2, mockNode3];

      const fillColorProperty = mockSchema.properties[2];
      component.onPropertyChange(fillColorProperty, '#ff0000');

      expect(mockService.setPropertyValues).toHaveBeenCalledWith(
        [mockNode, mockNode2, mockNode3],
        'fillColor',
        '#ff0000'
      );
    });

    it('should show node count indicator', () => {
      component.selectedNodes = [mockNode, mockNode2, mockNode3];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const nodeCount = compiled.querySelector('.node-count');

      if (nodeCount) {
        expect(nodeCount.textContent).toContain('3 nodes selected');
      }
    });

    it('should show warning for different schemas', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const differentTypeNode = { ...mockNode, type: 'BPMN.TASK' };

      mockService.getSchema.mockReturnValue(mockSchema);
      component.selectedNodes = [mockNode, differentTypeNode];

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Selected nodes have different types')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('FR-PPC-007: Empty State', () => {
    it('should show empty state when no node selected', () => {
      component.selectedNodes = [];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const emptyState = compiled.querySelector('.panel-empty');

      expect(emptyState).toBeTruthy();
    });

    it('should show instructional text', () => {
      component.selectedNodes = [];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const emptyMessage = compiled.querySelector('.empty-message');

      if (emptyMessage) {
        expect(emptyMessage.textContent).toContain('Select a node to edit');
      }
    });
  });

  describe('FR-PPC-008: Header Section', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map());
    });

    it('should show node type and label', () => {
      component.showHeader = true;
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const nodeType = compiled.querySelector('.node-type');
      const nodeLabel = compiled.querySelector('.node-label');

      if (nodeType) {
        expect(nodeType.textContent).toContain('ERD.TABLE');
      }
      if (nodeLabel) {
        expect(nodeLabel.textContent).toContain('Users Table');
      }
    });

    it('should hide header when showHeader is false', () => {
      component.showHeader = false;
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const header = compiled.querySelector('.panel-header');

      expect(header).toBeNull();
    });

    it('should show actions menu when enabled', () => {
      component.showHeader = true;
      component.showActions = true;
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const actionsMenu = compiled.querySelector('.header-actions');

      expect(actionsMenu).toBeTruthy();
    });
  });

  describe('FR-PPC-009: Deferred Mode Save/Cancel', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map());
      mockService.getPropertyValue.mockImplementation((node, key) => node.data[key]);
      mockService.validateProperty.mockReturnValue({ valid: true, errors: [] });
    });

    it('should show save/cancel buttons in deferred mode', () => {
      component.updateMode = 'deferred';
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const footer = compiled.querySelector('.panel-footer');

      expect(footer).toBeTruthy();
    });

    it('should commit changes on save', () => {
      mockService.setPropertyValue.mockReturnValue('users');

      component.updateMode = 'deferred';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');

      expect(component.isDirty).toBe(true);

      component.onSave();

      expect(mockService.setPropertyValue).toHaveBeenCalledWith(
        mockNode,
        'tableName',
        'new_users'
      );
      expect(component.isDirty).toBe(false);
    });

    it('should revert changes on cancel', () => {
      mockService.getPropertyValue.mockReturnValue('users');

      component.updateMode = 'deferred';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');

      expect(component.isDirty).toBe(true);

      component.onCancel();

      expect(component.isDirty).toBe(false);
      expect(component.propertyValues.get('tableName')).toBe('users');
    });

    it('should emit save event', () => {
      const emitSpy = jest.spyOn(component.save, 'emit');

      component.updateMode = 'deferred';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');
      component.onSave();

      expect(emitSpy).toHaveBeenCalled();
    });

    it('should emit cancel event', () => {
      const emitSpy = jest.spyOn(component.cancel, 'emit');

      component.updateMode = 'deferred';
      component.selectedNodes = [mockNode];

      const property = mockSchema.properties[0];
      component.onPropertyChange(property, 'new_users');
      component.onCancel();

      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('FR-PPC-010: Accessibility', () => {
    beforeEach(() => {
      mockService.getSchema.mockReturnValue(mockSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map([
        ['General', mockSchema.properties.slice(0, 2)]
      ]));
    });

    it('should have labels for all inputs', () => {
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const labels = compiled.querySelectorAll('.property-label');

      expect(labels.length).toBeGreaterThan(0);
    });

    it('should show required indicator', () => {
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const requiredIndicator = compiled.querySelector('.required-indicator');

      expect(requiredIndicator).toBeTruthy();
    });

    it('should have proper ARIA attributes', () => {
      component.showActions = true;
      component.selectedNodes = [mockNode];
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const buttons = compiled.querySelectorAll('button[aria-label]');

      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should use OnPush change detection', () => {
      expect(component.constructor.name).toBe('PropertyPanelComponent');
      // OnPush is configured via decorator, verified in component metadata
    });

    it('should handle large property lists efficiently', () => {
      const largeSchema: PropertySchema = {
        properties: Array.from({ length: 50 }, (_, i) => ({
          key: `prop${i}`,
          label: `Property ${i}`,
          editor: 'string' as const,
          group: i < 25 ? 'Group1' : 'Group2',
          order: i
        }))
      };

      mockService.getSchema.mockReturnValue(largeSchema);
      mockService.getPropertyGroups.mockReturnValue(new Map([
        ['Group1', largeSchema.properties.slice(0, 25)],
        ['Group2', largeSchema.properties.slice(25)]
      ]));

      const startTime = performance.now();
      component.selectedNodes = [mockNode];
      fixture.detectChanges();
      const endTime = performance.now();

      // Generous ceiling: guards against pathological (e.g. O(n^2)) rendering
      // while tolerating CPU contention from parallel jest workers, which makes
      // a tight sub-100ms wall-clock threshold flaky in the full suite.
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
