import { TestBed } from '@angular/core/testing';
import { PropertyPanelService, ValidationError } from './property-panel.service';
import {
  PropertySchema,
  PropertyDefinition,
} from '@grafloria/renderer';

describe('PropertyPanelService', () => {
  let service: PropertyPanelService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PropertyPanelService);
  });

  describe('FR-PPS-001: Schema Registration', () => {
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

    it('should throw on invalid schema (missing required field)', () => {
      const schema = {
        properties: [{ key: 'name', label: 'Name' }],
      } as any;

      expect(() => service.registerSchema('ERD.TABLE', schema)).toThrow();
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
  });

  describe('FR-PPS-002: Schema Extension', () => {
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
      // Level 2: Extend ERD.TABLE
      service.extendSchema('ERD.TABLE_WITH_AUDIT', 'ERD.TABLE', {
        properties: [
          { key: 'createdAt', label: 'Created At', editor: 'datetime' },
        ],
      });

      // Level 3: Extend ERD.TABLE_WITH_AUDIT
      service.extendSchema('ERD.TABLE_WITH_FULL_AUDIT', 'ERD.TABLE_WITH_AUDIT', {
        properties: [
          { key: 'modifiedBy', label: 'Modified By', editor: 'string' },
        ],
      });

      const schema = service.getSchema('ERD.TABLE_WITH_FULL_AUDIT')!;

      expect(schema.properties.length).toBe(4);
      expect(schema.properties.find((p) => p.key === 'tableName')).toBeTruthy();
      expect(schema.properties.find((p) => p.key === 'createdAt')).toBeTruthy();
      expect(schema.properties.find((p) => p.key === 'modifiedBy')).toBeTruthy();
    });

    it('should throw when extending non-existent parent', () => {
      expect(() =>
        service.extendSchema('CHILD', 'NON_EXISTENT', { properties: [] })
      ).toThrow("Parent type 'NON_EXISTENT' not found");
    });
  });

  describe('FR-PPS-003: Schema Retrieval', () => {
    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
        ],
      });
    });

    it('should get schema for registered type', () => {
      const schema = service.getSchema('ERD.TABLE');
      expect(schema).not.toBeNull();
      expect(schema!.properties.length).toBe(1);
    });

    it('should return null for unregistered type', () => {
      const schema = service.getSchema('UNREGISTERED');
      expect(schema).toBeNull();
    });

    it('should return defensive copy (immutable)', () => {
      const schema1 = service.getSchema('ERD.TABLE')!;
      const schema2 = service.getSchema('ERD.TABLE')!;

      expect(schema1).not.toBe(schema2);
      expect(schema1).toEqual(schema2);
    });
  });

  describe('FR-PPS-004: Property Value Get/Set', () => {
    let mockNode: any;

    beforeEach(() => {
      // Register schema
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string', required: true },
          {
            key: 'rowCount',
            label: 'Row Count',
            editor: 'number',
            validation: { min: 0 },
          },
        ],
      });

      // Create mock node
      const metadata = {
        tableName: 'users',
        rowCount: 1000,
      };
      mockNode = {
        id: 'node1',
        type: 'ERD.TABLE',
        getMetadata: jest.fn().mockReturnValue(metadata),
      };
    });

    it('should get property value', () => {
      const value = service.getPropertyValue(mockNode, 'tableName');
      expect(value).toBe('users');
    });

    it('should set property value', () => {
      const oldValue = service.setPropertyValue(mockNode, 'tableName', 'products');

      expect(oldValue).toBe('users');
      expect(mockNode.getMetadata().tableName).toBe('products');
    });

    it('should throw on invalid property value', () => {
      expect(() => service.setPropertyValue(mockNode, 'rowCount', -10)).toThrow(
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

      service.setPropertyValue(mockNode, 'tableName', 'products');
    });

    it('should get nested property value', () => {
      mockNode.getMetadata().style = { fill: { color: '#ff0000' } };

      const value = service.getPropertyValue(mockNode, 'style.fill.color');
      expect(value).toBe('#ff0000');
    });

    it('should set nested property value', () => {
      mockNode.getMetadata().style = { fill: { color: '#ff0000' } };

      // Register schema with nested property
      service.registerSchema('SHAPE', {
        properties: [
          { key: 'style.fill.color', label: 'Color', editor: 'color' },
        ],
      });
      mockNode.type = 'SHAPE';

      service.setPropertyValue(mockNode, 'style.fill.color', '#00ff00');

      expect(mockNode.getMetadata().style.fill.color).toBe('#00ff00');
    });

    it('should throw on non-existent property key', () => {
      expect(() => service.setPropertyValue(mockNode, 'nonExistent', 'value')).toThrow(
        "Property 'nonExistent' not found"
      );
    });

    it('should throw on no schema registered', () => {
      mockNode.type = 'UNREGISTERED';
      expect(() => service.setPropertyValue(mockNode, 'test', 'value')).toThrow(
        "No schema registered for type 'UNREGISTERED'"
      );
    });
  });

  describe('FR-PPS-005: Property Value Validation', () => {
    it('should validate string type', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };

      const result = service.validateProperty('test', property);
      expect(result.valid).toBe(true);

      const invalidResult = service.validateProperty(123, property);
      expect(invalidResult.valid).toBe(false);
    });

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

    it('should validate string length', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: { minLength: 3, maxLength: 10 },
      };

      expect(service.validateProperty('test', property).valid).toBe(true);
      expect(service.validateProperty('ab', property).valid).toBe(false);
      expect(service.validateProperty('verylongname', property).valid).toBe(false);
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

    it('should validate number integer', () => {
      const property: PropertyDefinition = {
        key: 'count',
        label: 'Count',
        editor: 'number',
        validation: { integer: true },
      };

      expect(service.validateProperty(10, property).valid).toBe(true);
      expect(service.validateProperty(10.5, property).valid).toBe(false);
    });

    it('should validate required property', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        required: true,
      };

      expect(service.validateProperty('test', property).valid).toBe(true);
      expect(service.validateProperty('', property).valid).toBe(false);
      expect(service.validateProperty(null, property).valid).toBe(false);
      expect(service.validateProperty(undefined, property).valid).toBe(false);
    });

    it('should validate enum values (select options)', () => {
      const property: PropertyDefinition = {
        key: 'type',
        label: 'Type',
        editor: 'select',
        validation: { enum: ['PRIMARY', 'FOREIGN', 'UNIQUE'] },
      };

      expect(service.validateProperty('PRIMARY', property).valid).toBe(true);
      expect(service.validateProperty('INVALID', property).valid).toBe(false);
    });

    it('should validate multiselect', () => {
      const property: PropertyDefinition = {
        key: 'tags',
        label: 'Tags',
        editor: 'multiselect',
        validation: { enum: ['tag1', 'tag2', 'tag3'] },
      };

      expect(service.validateProperty(['tag1', 'tag2'], property).valid).toBe(true);
      expect(service.validateProperty(['tag1', 'invalid'], property).valid).toBe(false);
      expect(service.validateProperty('not-array', property).valid).toBe(false);
    });

    it('should validate color format', () => {
      const property: PropertyDefinition = {
        key: 'color',
        label: 'Color',
        editor: 'color',
      };

      expect(service.validateProperty('#ff0000', property).valid).toBe(true);
      expect(service.validateProperty('#f00', property).valid).toBe(true);
      expect(service.validateProperty('rgb(255, 0, 0)', property).valid).toBe(true);
      expect(service.validateProperty('red', property).valid).toBe(true);
      expect(service.validateProperty('invalid', property).valid).toBe(false);
    });

    it('should validate boolean type', () => {
      const property: PropertyDefinition = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };

      expect(service.validateProperty(true, property).valid).toBe(true);
      expect(service.validateProperty(false, property).valid).toBe(true);
      expect(service.validateProperty('true', property).valid).toBe(false);
    });

    it('should support custom validation function', () => {
      const property: PropertyDefinition = {
        key: 'value',
        label: 'Value',
        editor: 'number',
        validation: {
          customValidator: (value: any) => {
            if (value % 2 !== 0) {
              return 'Value must be even';
            }
            return null;
          },
        },
      };

      expect(service.validateProperty(10, property).valid).toBe(true);
      expect(service.validateProperty(11, property).valid).toBe(false);
    });
  });

  describe('FR-PPS-006: Property Change Events', () => {
    let mockNode: any;

    beforeEach(() => {
      service.registerSchema('TEST', {
        properties: [
          { key: 'name', label: 'Name', editor: 'string' },
          { key: 'value', label: 'Value', editor: 'number' },
        ],
      });

      const metadata = { name: 'test', value: 100 };
      mockNode = {
        id: 'node1',
        type: 'TEST',
        getMetadata: jest.fn().mockReturnValue(metadata),
      };
    });

    it('should emit event on property change', (done) => {
      service.propertyChanged$.subscribe((event) => {
        expect(event.nodeId).toBe('node1');
        expect(event.propertyKey).toBe('name');
        expect(event.oldValue).toBe('test');
        expect(event.newValue).toBe('updated');
        expect(event.timestamp).toBeDefined();
        done();
      });

      service.setPropertyValue(mockNode, 'name', 'updated');
    });

    it('should filter events by node ID', (done) => {
      service.getPropertyChangesForNode('node1').subscribe((event) => {
        expect(event.nodeId).toBe('node1');
        done();
      });

      service.setPropertyValue(mockNode, 'name', 'updated');
    });

    it('should filter events by property key', (done) => {
      service.getPropertyChangesForKey('name').subscribe((event) => {
        expect(event.propertyKey).toBe('name');
        done();
      });

      service.setPropertyValue(mockNode, 'name', 'updated');
    });

    it('should emit event with correct old and new values', (done) => {
      service.propertyChanged$.subscribe((event) => {
        expect(event.oldValue).toBe(100);
        expect(event.newValue).toBe(200);
        done();
      });

      service.setPropertyValue(mockNode, 'value', 200);
    });

    it('should allow multiple listeners', (done) => {
      let count = 0;

      service.propertyChanged$.subscribe(() => {
        count++;
      });

      service.propertyChanged$.subscribe(() => {
        count++;
        if (count === 2) {
          done();
        }
      });

      service.setPropertyValue(mockNode, 'name', 'updated');
    });
  });

  describe('FR-PPS-007: Bulk Property Operations', () => {
    let nodes: any[];

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [{ key: 'schema', label: 'Schema', editor: 'string' }],
      });

      nodes = [
        {
          id: 'node1',
          type: 'ERD.TABLE',
          getMetadata: jest.fn().mockReturnValue({ schema: 'public' }),
        },
        {
          id: 'node2',
          type: 'ERD.TABLE',
          getMetadata: jest.fn().mockReturnValue({ schema: 'public' }),
        },
        {
          id: 'node3',
          type: 'ERD.TABLE',
          getMetadata: jest.fn().mockReturnValue({ schema: 'public' }),
        },
      ];
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
        expect(event.nodeId).toBeUndefined(); // Batch event has nodeIds, not nodeId
        done();
      });

      service.setPropertyValues(nodes, 'schema', 'private');
    });

    it('should throw on validation error', () => {
      service.registerSchema('TEST', {
        properties: [
          {
            key: 'value',
            label: 'Value',
            editor: 'number',
            validation: { min: 0 },
          },
        ],
      });

      const testNodes = [
        {
          id: 'node1',
          type: 'TEST',
          getMetadata: jest.fn().mockReturnValue({ value: 10 }),
        },
      ];

      expect(() => service.setPropertyValues(testNodes, 'value', -5)).toThrow(
        ValidationError
      );
    });

    it('should return empty array for empty nodes', () => {
      const result = service.setPropertyValues([], 'schema', 'test');
      expect(result).toEqual([]);
    });
  });

  describe('FR-PPS-008: Conditional Property Visibility', () => {
    let mockNode: any;

    beforeEach(() => {
      const metadata = { fill: 'pattern', patternType: 'stripes' };
      mockNode = {
        id: 'node1',
        type: 'SHAPE',
        getMetadata: jest.fn().mockReturnValue(metadata),
      };
    });

    it('should show property when condition met (equals)', () => {
      const property: PropertyDefinition = {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'select',
        condition: { key: 'fill', operator: 'equals', value: 'pattern' },
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(true);
    });

    it('should hide property when condition not met', () => {
      mockNode.getMetadata().fill = 'solid';

      const property: PropertyDefinition = {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'select',
        condition: { key: 'fill', operator: 'equals', value: 'pattern' },
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(false);
    });

    it('should support notEquals operator', () => {
      const property: PropertyDefinition = {
        key: 'customColor',
        label: 'Custom Color',
        editor: 'color',
        condition: { key: 'fill', operator: 'notEquals', value: 'solid' },
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(true);
    });

    it('should support in operator', () => {
      mockNode.getMetadata().type = 'ENTITY';

      const property: PropertyDefinition = {
        key: 'columns',
        label: 'Columns',
        editor: 'json',
        condition: { key: 'type', operator: 'in', value: ['ENTITY', 'TABLE'] },
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(true);
    });

    it('should support greaterThan operator', () => {
      mockNode.getMetadata().count = 10;

      const property: PropertyDefinition = {
        key: 'advanced',
        label: 'Advanced',
        editor: 'string',
        condition: { key: 'count', operator: 'greaterThan', value: 5 },
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(true);
    });

    it('should support lessThan operator', () => {
      mockNode.getMetadata().count = 3;

      const property: PropertyDefinition = {
        key: 'simple',
        label: 'Simple',
        editor: 'string',
        condition: { key: 'count', operator: 'lessThan', value: 5 },
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(true);
    });

    it('should return true when no condition', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };

      expect(service.isPropertyVisible(mockNode, property)).toBe(true);
    });
  });

  describe('FR-PPS-009: Default Value Application', () => {
    let mockNode: any;

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
        ],
      });

      const metadata: any = {};
      mockNode = {
        id: 'node1',
        type: 'ERD.TABLE',
        getMetadata: jest.fn().mockReturnValue(metadata),
      };
    });

    it('should apply default values', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(mockNode, schema);

      expect(mockNode.getMetadata().schema).toBe('public');
    });

    it('should not override existing values', () => {
      mockNode.getMetadata().schema = 'custom';

      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(mockNode, schema);

      expect(mockNode.getMetadata().schema).toBe('custom');
    });

    it('should apply nested defaults', () => {
      service.registerSchema('SHAPE', {
        properties: [
          {
            key: 'style.fill.color',
            label: 'Fill Color',
            editor: 'color',
            defaultValue: '#000000',
          },
        ],
      });

      const shapeMetadata: any = {};
      const shapeNode = {
        id: 'shape1',
        type: 'SHAPE',
        getMetadata: jest.fn().mockReturnValue(shapeMetadata),
      };

      const schema = service.getSchema('SHAPE')!;
      service.applyDefaults(shapeNode, schema);

      expect(shapeNode.getMetadata().style.fill.color).toBe('#000000');
    });
  });

  describe('FR-PPS-010: Property Groups', () => {
    it('should group properties', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string', group: 'Basic' },
          { key: 'schema', label: 'Schema', editor: 'string', group: 'Basic' },
          { key: 'color', label: 'Color', editor: 'color', group: 'Style' },
        ],
        groups: [
          { name: 'Basic', label: 'Basic', order: 1 },
          { name: 'Style', label: 'Style', order: 2 },
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
        properties: [{ key: 'name', label: 'Name', editor: 'string' }],
      };

      const groups = service.getPropertyGroups(schema);

      expect(groups.has('General')).toBe(true);
      expect(groups.get('General')?.length).toBe(1);
    });

    it('should sort groups by order field', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'advanced', label: 'Advanced', editor: 'string', group: 'Advanced' },
          { key: 'basic', label: 'Basic', editor: 'string', group: 'Basic' },
        ],
        groups: [
          { name: 'Advanced', label: 'Advanced', order: 2 },
          { name: 'Basic', label: 'Basic', order: 1 },
        ],
      };

      const groups = service.getPropertyGroups(schema);
      const groupNames = Array.from(groups.keys());

      expect(groupNames[0]).toBe('Basic');
      expect(groupNames[1]).toBe('Advanced');
    });

    it('should preserve property order within group', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'first', label: 'First', editor: 'string', group: 'Test' },
          { key: 'second', label: 'Second', editor: 'string', group: 'Test' },
          { key: 'third', label: 'Third', editor: 'string', group: 'Test' },
        ],
      };

      const groups = service.getPropertyGroups(schema);
      const testGroup = groups.get('Test')!;

      expect(testGroup[0].key).toBe('first');
      expect(testGroup[1].key).toBe('second');
      expect(testGroup[2].key).toBe('third');
    });
  });
});
