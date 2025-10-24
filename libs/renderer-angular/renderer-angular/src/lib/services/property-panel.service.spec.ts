/**
 * Unit tests for PropertyPanelService
 *
 * Following TDD approach - tests written first, then implementation
 * Tests cover all 10 functional requirements (FR-PPS-001 to FR-PPS-010)
 */

import { TestBed } from '@angular/core/testing';
import { PropertyPanelService, ValidationError } from './property-panel.service';
import {
  PropertySchema,
  PropertyDefinition,
  SelectPropertyDefinition,
} from '@grafloria/renderer/types/property-schema';

// Mock DiagramNode interface
interface DiagramNode {
  id: string;
  type: string;
  getMetadata(): Record<string, any>;
}

describe('PropertyPanelService', () => {
  let service: PropertyPanelService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PropertyPanelService],
    });
    service = TestBed.inject(PropertyPanelService);
  });

  afterEach(() => {
    // Clean up to prevent test pollution
    (service as any).schemaRegistry.clear();
  });

  describe('FR-PPS-001: Property Schema Registration', () => {
    it('should register schema successfully', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
        ],
      };

      service.registerSchema('ERD.TABLE', schema);

      expect(service.hasSchema('ERD.TABLE')).toBe(true);
      expect(service.getSchema('ERD.TABLE')).toEqual(schema);
    });

    it('should register schema from JSON', () => {
      const json = JSON.stringify({
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
        ],
      });

      service.registerSchemaFromJSON('ERD.TABLE', json);

      expect(service.hasSchema('ERD.TABLE')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      const schema: PropertySchema = {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      };

      service.registerSchema('ERD.TABLE', schema);

      expect(() => service.registerSchema('ERD.TABLE', schema)).toThrow(
        "Schema for type 'ERD.TABLE' is already registered"
      );
    });

    it('should throw on invalid schema (no properties)', () => {
      const schema = {
        properties: [],
      } as PropertySchema;

      expect(() => service.registerSchema('ERD.TABLE', schema)).toThrow(
        'Schema must have at least one property'
      );
    });

    it('should throw on invalid schema (missing property key)', () => {
      const schema = {
        properties: [{ label: 'Name', editor: 'string' }],
      } as any;

      expect(() => service.registerSchema('ERD.TABLE', schema)).toThrow(
        'Property must have key, label, and editor'
      );
    });

    it('should return all registered types', () => {
      service.registerSchema('ERD.TABLE', {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      });
      service.registerSchema('BPMN.TASK', {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      });

      const types = service.getAllTypes();

      expect(types).toContain('ERD.TABLE');
      expect(types).toContain('BPMN.TASK');
      expect(types.length).toBe(2);
    });

    it('should validate hasSchema returns false for unregistered type', () => {
      expect(service.hasSchema('NON_EXISTENT')).toBe(false);
    });
  });

  describe('FR-PPS-002: Property Schema Extension', () => {
    beforeEach(() => {
      // Register parent schema
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
          {
            key: 'schema',
            label: 'Schema',
            editor: 'string',
            defaultValue: 'public',
          },
        ],
      });
    });

    it('should extend schema with new properties', () => {
      service.extendSchema('ERD.TABLE_WITH_AUDIT', 'ERD.TABLE', {
        properties: [
          { key: 'createdAt', label: 'Created At', editor: 'datetime' },
          { key: 'updatedAt', label: 'Updated At', editor: 'datetime' },
        ],
      });

      const schema = service.getSchema('ERD.TABLE_WITH_AUDIT')!;

      expect(schema.properties.length).toBe(4);
      expect(schema.properties.find((p) => p.key === 'tableName')).toBeTruthy();
      expect(schema.properties.find((p) => p.key === 'createdAt')).toBeTruthy();
    });

    it('should override parent property', () => {
      service.extendSchema('ERD.TABLE_CUSTOM', 'ERD.TABLE', {
        properties: [
          {
            key: 'schema',
            label: 'Schema',
            editor: 'string',
            defaultValue: 'custom',
          },
        ],
      });

      const schema = service.getSchema('ERD.TABLE_CUSTOM')!;
      const schemaProp = schema.properties.find((p) => p.key === 'schema')!;

      expect(schemaProp.defaultValue).toBe('custom');
    });

    it('should support three-level inheritance', () => {
      service.extendSchema('ERD.TABLE_WITH_AUDIT', 'ERD.TABLE', {
        properties: [
          { key: 'createdAt', label: 'Created At', editor: 'datetime' },
        ],
      });

      service.extendSchema('ERD.TABLE_FULL_AUDIT', 'ERD.TABLE_WITH_AUDIT', {
        properties: [
          { key: 'createdBy', label: 'Created By', editor: 'string' },
        ],
      });

      const schema = service.getSchema('ERD.TABLE_FULL_AUDIT')!;

      expect(schema.properties.length).toBe(4);
      expect(schema.properties.find((p) => p.key === 'tableName')).toBeTruthy();
      expect(schema.properties.find((p) => p.key === 'createdAt')).toBeTruthy();
      expect(schema.properties.find((p) => p.key === 'createdBy')).toBeTruthy();
    });

    it('should throw when extending non-existent parent', () => {
      expect(() =>
        service.extendSchema('CHILD', 'NON_EXISTENT', { properties: [] })
      ).toThrow("Parent type 'NON_EXISTENT' not found");
    });
  });

  describe('FR-PPS-003: Property Schema Retrieval', () => {
    it('should get schema for registered type', () => {
      const schema: PropertySchema = {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      };

      service.registerSchema('ERD.TABLE', schema);

      expect(service.getSchema('ERD.TABLE')).toEqual(schema);
    });

    it('should return null for unregistered type', () => {
      expect(service.getSchema('NON_EXISTENT')).toBeNull();
    });

    it('should return defensive copy (modifying returned schema does not affect registry)', () => {
      const schema: PropertySchema = {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      };

      service.registerSchema('ERD.TABLE', schema);

      const retrieved = service.getSchema('ERD.TABLE')!;
      retrieved.properties.push({
        key: 'new',
        label: 'New',
        editor: 'string',
      });

      const retrievedAgain = service.getSchema('ERD.TABLE')!;
      expect(retrievedAgain.properties.length).toBe(1);
    });
  });

  describe('FR-PPS-004: Property Value Get/Set', () => {
    let node: DiagramNode;

    beforeEach(() => {
      // Register schema
      service.registerSchema('ERD.TABLE', {
        properties: [
          {
            key: 'tableName',
            label: 'Table Name',
            editor: 'string',
            validation: { required: true },
          },
          {
            key: 'rowCount',
            label: 'Row Count',
            editor: 'number',
            validation: { min: 0 },
          },
        ],
      });

      // Create mock node
      node = {
        id: 'node1',
        type: 'ERD.TABLE',
        getMetadata: jest.fn().mockReturnValue({
          tableName: 'users',
          rowCount: 1000,
        }),
      } as any;
    });

    it('should get property value', () => {
      const value = service.getPropertyValue(node, 'tableName');
      expect(value).toBe('users');
    });

    it('should set property value', () => {
      const oldValue = service.setPropertyValue(node, 'tableName', 'products');

      expect(oldValue).toBe('users');
      expect(node.getMetadata().tableName).toBe('products');
    });

    it('should throw on invalid property value', () => {
      expect(() => service.setPropertyValue(node, 'rowCount', -10)).toThrow(
        ValidationError
      );
    });

    it('should emit change event on set', (done) => {
      service.propertyChanged$.subscribe((event) => {
        expect(event.nodeId).toBe('node1');
        expect(event.propertyKey).toBe('tableName');
        expect(event.oldValue).toBe('users');
        expect(event.newValue).toBe('products');
        done();
      });

      service.setPropertyValue(node, 'tableName', 'products');
    });

    it('should get nested property value', () => {
      node.getMetadata().style = { fill: { color: '#ff0000' } };

      service.registerSchema('ERD.TABLE', {
        properties: [
          {
            key: 'style.fill.color',
            label: 'Fill Color',
            editor: 'color',
          },
        ],
      });

      const value = service.getPropertyValue(node, 'style.fill.color');
      expect(value).toBe('#ff0000');
    });

    it('should set nested property value', () => {
      node.getMetadata().style = { fill: { color: '#ff0000' } };

      service.registerSchema('ERD.TABLE', {
        properties: [
          {
            key: 'style.fill.color',
            label: 'Fill Color',
            editor: 'color',
          },
        ],
      });

      service.setPropertyValue(node, 'style.fill.color', '#00ff00');

      expect(node.getMetadata().style.fill.color).toBe('#00ff00');
    });

    it('should throw on non-existent property key', () => {
      expect(() =>
        service.setPropertyValue(node, 'nonExistent', 'value')
      ).toThrow("Property 'nonExistent' not found");
    });

    it('should throw on missing schema for node type', () => {
      const nodeWithoutSchema = {
        id: 'node2',
        type: 'UNKNOWN_TYPE',
        getMetadata: jest.fn().mockReturnValue({}),
      } as any;

      expect(() =>
        service.setPropertyValue(nodeWithoutSchema, 'prop', 'value')
      ).toThrow("No schema registered for type 'UNKNOWN_TYPE'");
    });
  });

  describe('FR-PPS-005: Property Value Validation', () => {
    it('should validate string pattern', () => {
      const property: PropertyDefinition = {
        key: 'tableName',
        label: 'Table Name',
        editor: 'string',
        validation: { pattern: '^[a-z_]+$' },
      };

      expect(service.validateProperty('user_table', property).valid).toBe(true);
      expect(service.validateProperty('UserTable', property).valid).toBe(false);
    });

    it('should validate number range', () => {
      const property: PropertyDefinition = {
        key: 'port',
        label: 'Port',
        editor: 'number',
        validation: { min: 1, max: 65535 },
      };

      expect(service.validateProperty(8080, property).valid).toBe(true);
      expect(service.validateProperty(0, property).valid).toBe(false);
      expect(service.validateProperty(70000, property).valid).toBe(false);
    });

    it('should validate required property', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: { required: true },
      };

      expect(service.validateProperty('test', property).valid).toBe(true);
      expect(service.validateProperty('', property).valid).toBe(false);
      expect(service.validateProperty(null, property).valid).toBe(false);
      expect(service.validateProperty(undefined, property).valid).toBe(false);
    });

    it('should validate enum (select options)', () => {
      const property: PropertyDefinition = {
        key: 'type',
        label: 'Type',
        editor: 'select',
        validation: { enum: ['PRIMARY', 'FOREIGN', 'UNIQUE'] },
      };

      expect(service.validateProperty('PRIMARY', property).valid).toBe(true);
      expect(service.validateProperty('INVALID', property).valid).toBe(false);
    });

    it('should validate string length constraints', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: { minLength: 3, maxLength: 10 },
      };

      expect(service.validateProperty('test', property).valid).toBe(true);
      expect(service.validateProperty('ab', property).valid).toBe(false);
      expect(service.validateProperty('verylongname', property).valid).toBe(
        false
      );
    });

    it('should validate number integer constraint', () => {
      const property: PropertyDefinition = {
        key: 'count',
        label: 'Count',
        editor: 'number',
        validation: { integer: true },
      };

      expect(service.validateProperty(10, property).valid).toBe(true);
      expect(service.validateProperty(10.5, property).valid).toBe(false);
    });

    it('should validate color values', () => {
      const property: PropertyDefinition = {
        key: 'color',
        label: 'Color',
        editor: 'color',
      };

      expect(service.validateProperty('#ff0000', property).valid).toBe(true);
      expect(service.validateProperty('#f00', property).valid).toBe(true);
      expect(service.validateProperty('rgb(255, 0, 0)', property).valid).toBe(
        true
      );
      expect(service.validateProperty('red', property).valid).toBe(true);
      expect(service.validateProperty('invalid', property).valid).toBe(false);
    });

    it('should validate multiselect values', () => {
      const property: PropertyDefinition = {
        key: 'tags',
        label: 'Tags',
        editor: 'multiselect',
        validation: { enum: ['tag1', 'tag2', 'tag3'] },
      };

      expect(service.validateProperty(['tag1', 'tag2'], property).valid).toBe(
        true
      );
      expect(service.validateProperty(['tag1', 'invalid'], property).valid).toBe(
        false
      );
      expect(service.validateProperty('not-array', property).valid).toBe(false);
    });

    it('should validate custom validation function', () => {
      const property: PropertyDefinition = {
        key: 'value',
        label: 'Value',
        editor: 'number',
        validation: {
          custom: (value: any) => {
            if (value % 2 !== 0) {
              return { message: 'Must be even number' };
            }
            return null;
          },
        },
      };

      expect(service.validateProperty(10, property).valid).toBe(true);
      expect(service.validateProperty(11, property).valid).toBe(false);
      expect(
        service.validateProperty(11, property).errors[0].message
      ).toContain('even number');
    });

    it('should skip validation if value is empty and not required', () => {
      const property: PropertyDefinition = {
        key: 'optional',
        label: 'Optional',
        editor: 'string',
        validation: { pattern: '^[a-z]+$' },
      };

      expect(service.validateProperty('', property).valid).toBe(true);
      expect(service.validateProperty(null, property).valid).toBe(true);
      expect(service.validateProperty(undefined, property).valid).toBe(true);
    });
  });

  describe('FR-PPS-006: Property Change Events', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
          { key: 'schema', label: 'Schema', editor: 'string' },
        ],
      });

      node = {
        id: 'node1',
        type: 'ERD.TABLE',
        getMetadata: jest.fn().mockReturnValue({
          tableName: 'users',
          schema: 'public',
        }),
      } as any;
    });

    it('should emit event on property change', (done) => {
      service.propertyChanged$.subscribe((event) => {
        expect(event.nodeId).toBe('node1');
        expect(event.propertyKey).toBe('tableName');
        expect(event.oldValue).toBe('users');
        expect(event.newValue).toBe('products');
        expect(event.timestamp).toBeDefined();
        done();
      });

      service.setPropertyValue(node, 'tableName', 'products');
    });

    it('should filter events by node ID', (done) => {
      const node2 = {
        id: 'node2',
        type: 'ERD.TABLE',
        getMetadata: jest.fn().mockReturnValue({ tableName: 'orders' }),
      } as any;

      service.getPropertyChangesForNode('node1').subscribe((event) => {
        expect(event.nodeId).toBe('node1');
        done();
      });

      service.setPropertyValue(node2, 'tableName', 'items'); // Should not trigger
      service.setPropertyValue(node, 'tableName', 'products'); // Should trigger
    });

    it('should filter events by property key', (done) => {
      service.getPropertyChangesForKey('tableName').subscribe((event) => {
        expect(event.propertyKey).toBe('tableName');
        done();
      });

      service.setPropertyValue(node, 'schema', 'private'); // Should not trigger
      service.setPropertyValue(node, 'tableName', 'products'); // Should trigger
    });

    it('should support multiple listeners', (done) => {
      let listener1Called = false;
      let listener2Called = false;

      service.propertyChanged$.subscribe(() => {
        listener1Called = true;
        checkDone();
      });

      service.propertyChanged$.subscribe(() => {
        listener2Called = true;
        checkDone();
      });

      function checkDone() {
        if (listener1Called && listener2Called) {
          done();
        }
      }

      service.setPropertyValue(node, 'tableName', 'products');
    });
  });

  describe('FR-PPS-007: Bulk Property Operations', () => {
    let nodes: DiagramNode[];

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'schema', label: 'Schema', editor: 'string' },
          {
            key: 'rowCount',
            label: 'Row Count',
            editor: 'number',
            validation: { min: 0 },
          },
        ],
      });

      nodes = [
        {
          id: 'node1',
          type: 'ERD.TABLE',
          getMetadata: () => ({ schema: 'public', rowCount: 100 }),
        },
        {
          id: 'node2',
          type: 'ERD.TABLE',
          getMetadata: () => ({ schema: 'public', rowCount: 200 }),
        },
        {
          id: 'node3',
          type: 'ERD.TABLE',
          getMetadata: () => ({ schema: 'public', rowCount: 300 }),
        },
      ] as any[];
    });

    it('should update multiple nodes', () => {
      const updatedIds = service.setPropertyValues(nodes, 'schema', 'private');

      expect(updatedIds).toEqual(['node1', 'node2', 'node3']);
      expect(nodes[0].getMetadata().schema).toBe('private');
      expect(nodes[1].getMetadata().schema).toBe('private');
      expect(nodes[2].getMetadata().schema).toBe('private');
    });

    it('should emit single batch event', (done) => {
      service.propertyChanged$.subscribe((event) => {
        expect(event.nodeIds).toEqual(['node1', 'node2', 'node3']);
        expect(event.propertyKey).toBe('schema');
        expect(event.newValue).toBe('private');
        expect(event.nodeId).toBeUndefined();
        done();
      });

      service.setPropertyValues(nodes, 'schema', 'private');
    });

    it('should throw validation error for invalid value', () => {
      expect(() => service.setPropertyValues(nodes, 'rowCount', -10)).toThrow(
        ValidationError
      );

      // Verify no nodes were updated
      expect(nodes[0].getMetadata().rowCount).toBe(100);
      expect(nodes[1].getMetadata().rowCount).toBe(200);
      expect(nodes[2].getMetadata().rowCount).toBe(300);
    });

    it('should return empty array for empty nodes list', () => {
      const result = service.setPropertyValues([], 'schema', 'private');
      expect(result).toEqual([]);
    });

    it('should throw on non-existent property', () => {
      expect(() =>
        service.setPropertyValues(nodes, 'nonExistent', 'value')
      ).toThrow("Property 'nonExistent' not found");
    });
  });

  describe('FR-PPS-008: Conditional Property Visibility', () => {
    let node: DiagramNode;

    beforeEach(() => {
      node = {
        id: 'node1',
        type: 'SHAPE',
        getMetadata: () => ({ fill: 'pattern', patternType: 'stripes' }),
      } as any;
    });

    it('should show property when equals condition met', () => {
      const property: PropertyDefinition = {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'select',
        condition: { property: 'fill', operator: '==', value: 'pattern' },
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);
    });

    it('should hide property when equals condition not met', () => {
      node.getMetadata().fill = 'solid';

      const property: PropertyDefinition = {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'select',
        condition: { property: 'fill', operator: '==', value: 'pattern' },
      };

      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    it('should evaluate notEquals condition', () => {
      const property: PropertyDefinition = {
        key: 'customPattern',
        label: 'Custom Pattern',
        editor: 'string',
        condition: { property: 'fill', operator: '!=', value: 'solid' },
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.getMetadata().fill = 'solid';
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    it('should evaluate in condition', () => {
      const property: PropertyDefinition = {
        key: 'specialOptions',
        label: 'Special Options',
        editor: 'string',
        condition: {
          property: 'fill',
          operator: 'in',
          value: ['pattern', 'gradient'],
        },
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.getMetadata().fill = 'solid';
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    it('should evaluate notIn condition', () => {
      const property: PropertyDefinition = {
        key: 'basicOptions',
        label: 'Basic Options',
        editor: 'string',
        condition: {
          property: 'fill',
          operator: 'notIn',
          value: ['gradient', 'image'],
        },
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.getMetadata().fill = 'gradient';
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    it('should evaluate greaterThan condition', () => {
      node.getMetadata().count = 100;

      const property: PropertyDefinition = {
        key: 'advancedOptions',
        label: 'Advanced Options',
        editor: 'string',
        condition: { property: 'count', operator: '>', value: 50 },
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.getMetadata().count = 25;
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    it('should evaluate lessThan condition', () => {
      node.getMetadata().count = 25;

      const property: PropertyDefinition = {
        key: 'basicOptions',
        label: 'Basic Options',
        editor: 'string',
        condition: { property: 'count', operator: '<', value: 50 },
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.getMetadata().count = 75;
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    it('should show property when no condition specified', () => {
      const property: PropertyDefinition = {
        key: 'alwaysVisible',
        label: 'Always Visible',
        editor: 'string',
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);
    });

    it('should handle missing property gracefully', () => {
      const property: PropertyDefinition = {
        key: 'conditional',
        label: 'Conditional',
        editor: 'string',
        condition: {
          property: 'nonExistent',
          operator: '==',
          value: 'something',
        },
      };

      expect(service.isPropertyVisible(node, property)).toBe(false);
    });
  });

  describe('FR-PPS-009: Default Value Application', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          {
            key: 'schema',
            label: 'Schema',
            editor: 'string',
            defaultValue: 'public',
          },
          { key: 'tableName', label: 'Table Name', editor: 'string' },
          {
            key: 'style.fill.color',
            label: 'Fill Color',
            editor: 'color',
            defaultValue: '#ffffff',
          },
        ],
      });

      node = {
        id: 'node1',
        type: 'ERD.TABLE',
        getMetadata: () => ({}),
      } as any;
    });

    it('should apply default values', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.getMetadata().schema).toBe('public');
    });

    it('should not override existing values', () => {
      node.getMetadata().schema = 'custom';

      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.getMetadata().schema).toBe('custom');
    });

    it('should apply nested default values', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.getMetadata().style?.fill?.color).toBe('#ffffff');
    });

    it('should not apply defaults for properties without defaultValue', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.getMetadata().tableName).toBeUndefined();
    });
  });

  describe('FR-PPS-010: Property Groups', () => {
    it('should group properties correctly', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string', group: 'Basic' },
          {
            key: 'schema',
            label: 'Schema',
            editor: 'string',
            group: 'Basic',
          },
          { key: 'color', label: 'Color', editor: 'color', group: 'Style' },
        ],
        groups: [
          { name: 'Basic', label: 'Basic Information', order: 1 },
          { name: 'Style', label: 'Styling', order: 2 },
        ],
      };

      service.registerSchema('ERD.TABLE', schema);

      const groups = service.getPropertyGroups(schema);

      expect(groups.size).toBe(2);
      expect(groups.get('Basic')?.length).toBe(2);
      expect(groups.get('Style')?.length).toBe(1);
    });

    it('should put ungrouped properties in General', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string' },
          { key: 'description', label: 'Description', editor: 'textarea' },
        ],
      };

      const groups = service.getPropertyGroups(schema);

      expect(groups.has('General')).toBe(true);
      expect(groups.get('General')?.length).toBe(2);
    });

    it('should maintain property order within group', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'first', label: 'First', editor: 'string', group: 'Basic' },
          { key: 'second', label: 'Second', editor: 'string', group: 'Basic' },
          { key: 'third', label: 'Third', editor: 'string', group: 'Basic' },
        ],
      };

      const groups = service.getPropertyGroups(schema);
      const basicProps = groups.get('Basic')!;

      expect(basicProps[0].key).toBe('first');
      expect(basicProps[1].key).toBe('second');
      expect(basicProps[2].key).toBe('third');
    });

    it('should sort groups by order field', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string', group: 'Basic' },
          { key: 'color', label: 'Color', editor: 'color', group: 'Style' },
          {
            key: 'advanced',
            label: 'Advanced',
            editor: 'string',
            group: 'Advanced',
          },
        ],
        groups: [
          { name: 'Advanced', label: 'Advanced', order: 3 },
          { name: 'Basic', label: 'Basic', order: 1 },
          { name: 'Style', label: 'Style', order: 2 },
        ],
      };

      const groups = service.getPropertyGroups(schema);
      const groupNames = Array.from(groups.keys());

      expect(groupNames[0]).toBe('Basic');
      expect(groupNames[1]).toBe('Style');
      expect(groupNames[2]).toBe('Advanced');
    });
  });

  describe('Performance Tests', () => {
    it('should handle 50 registered schemas efficiently', () => {
      const start = performance.now();

      for (let i = 0; i < 50; i++) {
        service.registerSchema(`TYPE_${i}`, {
          properties: [
            { key: 'name', label: 'Name', editor: 'string' },
            { key: 'value', label: 'Value', editor: 'number' },
          ],
        });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(service.getAllTypes().length).toBe(50);
    });

    it('should retrieve schema quickly', () => {
      service.registerSchema('TEST', {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      });

      const start = performance.now();
      service.getSchema('TEST');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1); // <1ms
    });

    it('should validate property quickly', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: { required: true, minLength: 3, maxLength: 50 },
      };

      const start = performance.now();
      service.validateProperty('testvalue', property);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5); // <5ms
    });
  });
});
