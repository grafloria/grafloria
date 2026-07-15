import { TestBed } from '@angular/core/testing';
import { PropertyPanelService, PropertyChangeEvent } from './property-panel.service';
import type { PropertySchema, PropertyDefinition } from '@grafloria/renderer';

/**
 * Mock DiagramNode for testing
 */
interface DiagramNode {
  id: string;
  type: string;
  data: Record<string, any>;
}

function createMockNode(id: string, type: string, data: Record<string, any> = {}): DiagramNode {
  return { id, type, data };
}

describe('PropertyPanelService', () => {
  let service: PropertyPanelService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PropertyPanelService);
  });

  describe('FR-PPS-001: Schema Registration', () => {
    test('should register schema successfully', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' }
        ]
      };

      service.registerSchema('ERD.TABLE', schema);

      expect(service.hasSchema('ERD.TABLE')).toBe(true);
      expect(service.getSchema('ERD.TABLE')).toEqual(schema);
    });

    test('should register schema from JSON', () => {
      const json = JSON.stringify({
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' }
        ]
      });

      service.registerSchemaFromJSON('ERD.TABLE', json);

      expect(service.hasSchema('ERD.TABLE')).toBe(true);
    });

    test('should throw on duplicate registration', () => {
      const schema: PropertySchema = {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }]
      };

      service.registerSchema('ERD.TABLE', schema);

      expect(() => service.registerSchema('ERD.TABLE', schema))
        .toThrow("Schema for type 'ERD.TABLE' is already registered");
    });

    test('should throw on invalid schema (no properties)', () => {
      const schema = {
        properties: []
      } as PropertySchema;

      expect(() => service.registerSchema('ERD.TABLE', schema))
        .toThrow('Schema must have at least one property');
    });

    test('should throw on invalid schema (property missing required fields)', () => {
      const schema = {
        properties: [{ key: 'name' } as any]
      } as PropertySchema;

      expect(() => service.registerSchema('ERD.TABLE', schema))
        .toThrow('Property must have key, label, and editor');
    });

    test('should return all registered types', () => {
      service.registerSchema('ERD.TABLE', {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }]
      });
      service.registerSchema('BPMN.TASK', {
        properties: [{ key: 'task', label: 'Task', editor: 'string' }]
      });

      const types = service.getAllTypes();

      expect(types).toContain('ERD.TABLE');
      expect(types).toContain('BPMN.TASK');
      expect(types.length).toBe(2);
    });

    test('should unregister a schema and allow re-registration', () => {
      service.registerSchema('ERD.TABLE', {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }]
      });

      expect(service.unregisterSchema('ERD.TABLE')).toBe(true);
      expect(service.hasSchema('ERD.TABLE')).toBe(false);

      // Replacing a schema is now possible (registerSchema rejects duplicates)
      const replacement: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string' },
          { key: 'color', label: 'Color', editor: 'color' }
        ]
      };
      service.registerSchema('ERD.TABLE', replacement);
      expect(service.getSchema('ERD.TABLE')!.properties.length).toBe(2);
    });

    test('unregisterSchema should return false for unknown type', () => {
      expect(service.unregisterSchema('NOPE')).toBe(false);
    });

    test('clearSchemas should remove all registered schemas', () => {
      service.registerSchema('ERD.TABLE', {
        properties: [{ key: 'name', label: 'Name', editor: 'string' }]
      });
      service.registerSchema('BPMN.TASK', {
        properties: [{ key: 'task', label: 'Task', editor: 'string' }]
      });

      service.clearSchemas();

      expect(service.getAllTypes()).toEqual([]);
      expect(service.hasSchema('ERD.TABLE')).toBe(false);
      expect(service.hasSchema('BPMN.TASK')).toBe(false);
    });
  });

  describe('FR-PPS-002: Schema Extension', () => {
    beforeEach(() => {
      // Register parent schema
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
          { key: 'schema', label: 'Schema', editor: 'string', defaultValue: 'public' }
        ]
      });
    });

    test('should extend schema with new properties', () => {
      service.extendSchema('ERD.TABLE_WITH_AUDIT', 'ERD.TABLE', {
        properties: [
          { key: 'createdAt', label: 'Created At', editor: 'datetime' },
          { key: 'updatedAt', label: 'Updated At', editor: 'datetime' }
        ]
      });

      const schema = service.getSchema('ERD.TABLE_WITH_AUDIT')!;

      expect(schema.properties.length).toBe(4);
      expect(schema.properties.find(p => p.key === 'tableName')).toBeTruthy();
      expect(schema.properties.find(p => p.key === 'createdAt')).toBeTruthy();
    });

    test('should override parent property', () => {
      service.extendSchema('ERD.TABLE_CUSTOM', 'ERD.TABLE', {
        properties: [
          { key: 'schema', label: 'Schema', editor: 'string', defaultValue: 'custom' }
        ]
      });

      const schema = service.getSchema('ERD.TABLE_CUSTOM')!;
      const schemaProp = schema.properties.find(p => p.key === 'schema')!;

      expect(schemaProp.defaultValue).toBe('custom');
    });

    test('should throw when extending non-existent parent', () => {
      expect(() =>
        service.extendSchema('CHILD', 'NON_EXISTENT', { properties: [] })
      ).toThrow("Parent type 'NON_EXISTENT' not found");
    });

    test('should support three-level inheritance', () => {
      service.extendSchema('ERD.TABLE_WITH_AUDIT', 'ERD.TABLE', {
        properties: [
          { key: 'createdAt', label: 'Created At', editor: 'datetime' }
        ]
      });

      service.extendSchema('ERD.TABLE_WITH_FULL_AUDIT', 'ERD.TABLE_WITH_AUDIT', {
        properties: [
          { key: 'deletedAt', label: 'Deleted At', editor: 'datetime' }
        ]
      });

      const schema = service.getSchema('ERD.TABLE_WITH_FULL_AUDIT')!;

      expect(schema.properties.length).toBe(4); // tableName, schema, createdAt, deletedAt
      expect(schema.properties.find(p => p.key === 'tableName')).toBeTruthy();
      expect(schema.properties.find(p => p.key === 'createdAt')).toBeTruthy();
      expect(schema.properties.find(p => p.key === 'deletedAt')).toBeTruthy();
    });
  });

  describe('FR-PPS-003: Schema Retrieval', () => {
    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' }
        ]
      });
    });

    test('should get schema for registered type', () => {
      const schema = service.getSchema('ERD.TABLE');

      expect(schema).toBeTruthy();
      expect(schema!.properties.length).toBe(1);
    });

    test('should return null for unregistered type', () => {
      const schema = service.getSchema('NON_EXISTENT');

      expect(schema).toBeNull();
    });

    test('should return defensive copy (mutations should not affect registry)', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      schema.properties.push({ key: 'hacked', label: 'Hacked', editor: 'string' });

      const schema2 = service.getSchema('ERD.TABLE')!;

      expect(schema2.properties.length).toBe(1);
    });
  });

  describe('FR-PPS-004: Property Value Get/Set', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'tableName', label: 'Table Name', editor: 'string' },
          { key: 'rowCount', label: 'Row Count', editor: 'number', validation: { min: 0 } }
        ]
      });

      node = createMockNode('node1', 'ERD.TABLE', {
        tableName: 'users',
        rowCount: 1000
      });
    });

    test('should get property value', () => {
      const value = service.getPropertyValue(node, 'tableName');
      expect(value).toBe('users');
    });

    test('should set property value and return old value', () => {
      const oldValue = service.setPropertyValue(node, 'tableName', 'products');

      expect(oldValue).toBe('users');
      expect(node.data['tableName']).toBe('products');
    });

    test('should throw on invalid property value', () => {
      expect(() => service.setPropertyValue(node, 'rowCount', -10))
        .toThrow();
    });

    test('should throw on non-existent property key', () => {
      expect(() => service.setPropertyValue(node, 'nonexistent', 'value'))
        .toThrow("Property 'nonexistent' not found in schema");
    });

    test('should throw when no schema registered for node type', () => {
      const node2 = createMockNode('node2', 'UNREGISTERED_TYPE', {});

      expect(() => service.setPropertyValue(node2, 'test', 'value'))
        .toThrow("No schema registered for type 'UNREGISTERED_TYPE'");
    });

    test('should get nested property value', () => {
      node.data['style'] = { fill: { color: '#ff0000' } };

      const value = service.getPropertyValue(node, 'style.fill.color');
      expect(value).toBe('#ff0000');
    });

    test('should set nested property value', () => {
      node.data['style'] = { fill: { color: '#ff0000' } };

      // Register schema with nested property
      service.registerSchema('ERD.TABLE_STYLED', {
        properties: [
          { key: 'style.fill.color', label: 'Fill Color', editor: 'color' }
        ]
      });

      const styledNode = createMockNode('node2', 'ERD.TABLE_STYLED', {
        style: { fill: { color: '#ff0000' } }
      });

      service.setPropertyValue(styledNode, 'style.fill.color', '#00ff00');

      expect(styledNode.data['style'].fill.color).toBe('#00ff00');
    });

    test('should return undefined for non-existent nested property', () => {
      const value = service.getPropertyValue(node, 'nonexistent.nested.path');
      expect(value).toBeUndefined();
    });
  });

  describe('FR-PPS-005: Property Value Validation', () => {
    test('should validate string pattern', () => {
      const property: PropertyDefinition = {
        key: 'tableName',
        label: 'Table Name',
        editor: 'string',
        validation: { pattern: '^[a-z_]+$' }
      };

      expect(service.validateProperty('user_table', property).valid).toBe(true);
      expect(service.validateProperty('UserTable', property).valid).toBe(false);
    });

    test('should validate string length', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: { minLength: 3, maxLength: 10 }
      };

      expect(service.validateProperty('abc', property).valid).toBe(true);
      expect(service.validateProperty('ab', property).valid).toBe(false);
      expect(service.validateProperty('abcdefghijk', property).valid).toBe(false);
    });

    test('should validate number range', () => {
      const property: PropertyDefinition = {
        key: 'port',
        label: 'Port',
        editor: 'number',
        validation: { min: 1, max: 65535 }
      };

      expect(service.validateProperty(8080, property).valid).toBe(true);
      expect(service.validateProperty(0, property).valid).toBe(false);
      expect(service.validateProperty(70000, property).valid).toBe(false);
    });

    test('should validate required property', () => {
      const property: PropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: { required: true }
      };

      expect(service.validateProperty('test', property).valid).toBe(true);
      expect(service.validateProperty('', property).valid).toBe(false);
      expect(service.validateProperty(null, property).valid).toBe(false);
      expect(service.validateProperty(undefined, property).valid).toBe(false);
    });

    test('should validate select options', () => {
      const property: PropertyDefinition = {
        key: 'type',
        label: 'Type',
        editor: 'select',
        validation: {
          custom: (value) => {
            const validOptions = ['PRIMARY', 'FOREIGN', 'UNIQUE'];
            if (!validOptions.includes(value)) {
              return { message: `Type must be one of: ${validOptions.join(', ')}` };
            }
            return null;
          }
        }
      };

      expect(service.validateProperty('PRIMARY', property).valid).toBe(true);
      expect(service.validateProperty('INVALID', property).valid).toBe(false);
    });

    test('should validate color format', () => {
      const property: PropertyDefinition = {
        key: 'color',
        label: 'Color',
        editor: 'color',
        validation: {}
      };

      expect(service.validateProperty('#ff0000', property).valid).toBe(true);
      expect(service.validateProperty('#f00', property).valid).toBe(true);
      expect(service.validateProperty('rgb(255, 0, 0)', property).valid).toBe(true);
      expect(service.validateProperty('red', property).valid).toBe(true);
      expect(service.validateProperty('invalid', property).valid).toBe(false);
    });

    test('should validate boolean type', () => {
      const property: PropertyDefinition = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
        validation: {}
      };

      expect(service.validateProperty(true, property).valid).toBe(true);
      expect(service.validateProperty(false, property).valid).toBe(true);
      expect(service.validateProperty('true', property).valid).toBe(false);
    });

    test('should support custom validation function', () => {
      const property: PropertyDefinition = {
        key: 'value',
        label: 'Value',
        editor: 'number',
        validation: {
          custom: (value) => {
            if (value % 2 !== 0) {
              return { message: 'Value must be even' };
            }
            return null;
          }
        }
      };

      expect(service.validateProperty(10, property).valid).toBe(true);
      expect(service.validateProperty(11, property).valid).toBe(false);
    });

    test('should skip validation if value is empty and not required', () => {
      const property: PropertyDefinition = {
        key: 'optional',
        label: 'Optional',
        editor: 'string',
        validation: { minLength: 5 }
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
          { key: 'tableName', label: 'Table Name', editor: 'string' }
        ]
      });

      node = createMockNode('node1', 'ERD.TABLE', { tableName: 'users' });
    });

    test('should emit change event on property set', (done) => {
      service.propertyChanged$.subscribe(event => {
        expect(event.nodeId).toBe('node1');
        expect(event.propertyKey).toBe('tableName');
        expect(event.oldValue).toBe('users');
        expect(event.newValue).toBe('products');
        expect(event.timestamp).toBeDefined();
        done();
      });

      service.setPropertyValue(node, 'tableName', 'products');
    });

    test('should support multiple listeners', () => {
      const events: PropertyChangeEvent[] = [];

      service.propertyChanged$.subscribe(event => events.push(event));
      service.propertyChanged$.subscribe(event => events.push(event));

      service.setPropertyValue(node, 'tableName', 'products');

      expect(events.length).toBe(2);
      expect(events[0].newValue).toBe('products');
      expect(events[1].newValue).toBe('products');
    });

    test('should filter events by node ID', (done) => {
      const node2 = createMockNode('node2', 'ERD.TABLE', { tableName: 'posts' });

      service.getPropertyChangesForNode('node1').subscribe(event => {
        expect(event.nodeId).toBe('node1');
        done();
      });

      service.setPropertyValue(node, 'tableName', 'users2');
      service.setPropertyValue(node2, 'tableName', 'posts2'); // Should not trigger
    });

    test('should filter events by property key', (done) => {
      service.registerSchema('MULTI', {
        properties: [
          { key: 'prop1', label: 'Prop 1', editor: 'string' },
          { key: 'prop2', label: 'Prop 2', editor: 'string' }
        ]
      });

      const multiNode = createMockNode('multi', 'MULTI', { prop1: 'a', prop2: 'b' });

      service.getPropertyChangesForKey('prop1').subscribe(event => {
        expect(event.propertyKey).toBe('prop1');
        done();
      });

      service.setPropertyValue(multiNode, 'prop1', 'changed');
      service.setPropertyValue(multiNode, 'prop2', 'not-relevant'); // Should not trigger
    });
  });

  describe('FR-PPS-007: Bulk Property Operations', () => {
    let nodes: DiagramNode[];

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'schema', label: 'Schema', editor: 'string' }
        ]
      });

      nodes = [
        createMockNode('node1', 'ERD.TABLE', { schema: 'public' }),
        createMockNode('node2', 'ERD.TABLE', { schema: 'public' }),
        createMockNode('node3', 'ERD.TABLE', { schema: 'public' })
      ];
    });

    test('should update multiple nodes', () => {
      const updatedIds = service.setPropertyValues(nodes, 'schema', 'private');

      expect(updatedIds).toEqual(['node1', 'node2', 'node3']);
      expect(nodes[0].data['schema']).toBe('private');
      expect(nodes[1].data['schema']).toBe('private');
      expect(nodes[2].data['schema']).toBe('private');
    });

    test('should emit single batch event', (done) => {
      service.propertyChanged$.subscribe(event => {
        expect(event.nodeIds).toEqual(['node1', 'node2', 'node3']);
        expect(event.propertyKey).toBe('schema');
        expect(event.newValue).toBe('private');
        expect(event.nodeId).toBeUndefined(); // Batch event has no single nodeId
        done();
      });

      service.setPropertyValues(nodes, 'schema', 'private');
    });

    test('should throw validation error and not update any nodes', () => {
      service.registerSchema('VALIDATED', {
        properties: [
          { key: 'count', label: 'Count', editor: 'number', validation: { min: 0 } }
        ]
      });

      const validatedNodes = [
        createMockNode('v1', 'VALIDATED', { count: 10 }),
        createMockNode('v2', 'VALIDATED', { count: 20 })
      ];

      expect(() => service.setPropertyValues(validatedNodes, 'count', -5))
        .toThrow();

      // Verify no nodes were updated (rollback behavior)
      expect(validatedNodes[0].data['count']).toBe(10);
      expect(validatedNodes[1].data['count']).toBe(20);
    });

    test('should return empty array when no nodes provided', () => {
      const result = service.setPropertyValues([], 'schema', 'private');
      expect(result).toEqual([]);
    });
  });

  describe('FR-PPS-008: Conditional Property Visibility', () => {
    let node: DiagramNode;

    beforeEach(() => {
      node = createMockNode('node1', 'SHAPE', {
        fill: 'pattern',
        patternType: 'stripes'
      });
    });

    test('should show property when condition met (equals)', () => {
      const property: PropertyDefinition = {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'select',
        condition: { property: 'fill', operator: '==', value: 'pattern' }
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);
    });

    test('should hide property when condition not met', () => {
      node.data['fill'] = 'solid';

      const property: PropertyDefinition = {
        key: 'patternType',
        label: 'Pattern Type',
        editor: 'select',
        condition: { property: 'fill', operator: '==', value: 'pattern' }
      };

      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    test('should support notEquals operator', () => {
      const property: PropertyDefinition = {
        key: 'customSetting',
        label: 'Custom Setting',
        editor: 'string',
        condition: { property: 'fill', operator: '!=', value: 'none' }
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.data['fill'] = 'none';
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    test('should support greaterThan operator', () => {
      node.data['count'] = 150;

      const property: PropertyDefinition = {
        key: 'largeDataset',
        label: 'Large Dataset',
        editor: 'boolean',
        condition: { property: 'count', operator: '>', value: 100 }
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.data['count'] = 50;
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    test('should support lessThan operator', () => {
      node.data['size'] = 50;

      const property: PropertyDefinition = {
        key: 'smallSize',
        label: 'Small Size',
        editor: 'boolean',
        condition: { property: 'size', operator: '<', value: 100 }
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);
    });

    test('should support in operator (value in array)', () => {
      node.data['type'] = 'table';

      const property: PropertyDefinition = {
        key: 'dbSpecific',
        label: 'DB Specific',
        editor: 'string',
        condition: { property: 'type', operator: 'in', value: ['table', 'view'] }
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);

      node.data['type'] = 'function';
      expect(service.isPropertyVisible(node, property)).toBe(false);
    });

    test('should return true when no condition specified', () => {
      const property: PropertyDefinition = {
        key: 'alwaysVisible',
        label: 'Always Visible',
        editor: 'string'
      };

      expect(service.isPropertyVisible(node, property)).toBe(true);
    });

    test('should handle missing property gracefully', () => {
      const property: PropertyDefinition = {
        key: 'conditional',
        label: 'Conditional',
        editor: 'string',
        condition: { property: 'nonexistent', operator: '==', value: 'test' }
      };

      expect(service.isPropertyVisible(node, property)).toBe(false);
    });
  });

  describe('FR-PPS-009: Default Value Application', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerSchema('ERD.TABLE', {
        properties: [
          { key: 'schema', label: 'Schema', editor: 'string', defaultValue: 'public' },
          { key: 'tableName', label: 'Table Name', editor: 'string' },
          { key: 'rowCount', label: 'Row Count', editor: 'number', defaultValue: 0 }
        ]
      });

      node = createMockNode('node1', 'ERD.TABLE', {});
    });

    test('should apply default values to undefined properties', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.data['schema']).toBe('public');
      expect(node.data['rowCount']).toBe(0);
    });

    test('should not override existing values', () => {
      node.data['schema'] = 'custom';

      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.data['schema']).toBe('custom');
    });

    test('should not set value for properties without defaults', () => {
      const schema = service.getSchema('ERD.TABLE')!;
      service.applyDefaults(node, schema);

      expect(node.data['tableName']).toBeUndefined();
    });

    test('should handle nested default values', () => {
      service.registerSchema('STYLED', {
        properties: [
          { key: 'style.fill.color', label: 'Fill Color', editor: 'color', defaultValue: '#ffffff' }
        ]
      });

      const styledNode = createMockNode('styled', 'STYLED', {});
      const schema = service.getSchema('STYLED')!;

      service.applyDefaults(styledNode, schema);

      expect(styledNode.data['style'].fill.color).toBe('#ffffff');
    });
  });

  describe('FR-PPS-010: Property Groups', () => {
    test('should group properties correctly', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string', group: 'Basic' },
          { key: 'schema', label: 'Schema', editor: 'string', group: 'Basic' },
          { key: 'color', label: 'Color', editor: 'color', group: 'Style' }
        ],
        groups: [
          { name: 'Basic', label: 'Basic Info', order: 1 },
          { name: 'Style', label: 'Styling', order: 2 }
        ]
      };

      service.registerSchema('ERD.TABLE', schema);

      const groups = service.getPropertyGroups(schema);

      expect(groups.size).toBe(2);
      expect(groups.get('Basic')?.length).toBe(2);
      expect(groups.get('Style')?.length).toBe(1);
    });

    test('should put ungrouped properties in General group', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'name', label: 'Name', editor: 'string' }
        ]
      };

      const groups = service.getPropertyGroups(schema);

      expect(groups.has('General')).toBe(true);
      expect(groups.get('General')?.length).toBe(1);
    });

    test('should preserve property order within groups', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'prop1', label: 'Prop 1', editor: 'string', group: 'G1' },
          { key: 'prop2', label: 'Prop 2', editor: 'string', group: 'G1' },
          { key: 'prop3', label: 'Prop 3', editor: 'string', group: 'G1' }
        ]
      };

      const groups = service.getPropertyGroups(schema);
      const g1Props = groups.get('G1')!;

      expect(g1Props[0].key).toBe('prop1');
      expect(g1Props[1].key).toBe('prop2');
      expect(g1Props[2].key).toBe('prop3');
    });

    test('should sort groups by order field', () => {
      const schema: PropertySchema = {
        properties: [
          { key: 'a', label: 'A', editor: 'string', group: 'Second' },
          { key: 'b', label: 'B', editor: 'string', group: 'First' }
        ],
        groups: [
          { name: 'Second', label: 'Second Group', order: 2 },
          { name: 'First', label: 'First Group', order: 1 }
        ]
      };

      const groups = service.getPropertyGroups(schema);
      const groupNames = Array.from(groups.keys());

      expect(groupNames[0]).toBe('First');
      expect(groupNames[1]).toBe('Second');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty node data gracefully', () => {
      service.registerSchema('TEST', {
        properties: [
          { key: 'value', label: 'Value', editor: 'string' }
        ]
      });

      const node = createMockNode('test', 'TEST', {});
      const value = service.getPropertyValue(node, 'value');

      expect(value).toBeUndefined();
    });

    test('should handle invalid JSON in registerSchemaFromJSON', () => {
      expect(() => service.registerSchemaFromJSON('TEST', 'invalid json'))
        .toThrow();
    });

    test('should create nested objects when setting nested property on empty data', () => {
      service.registerSchema('NESTED', {
        properties: [
          { key: 'a.b.c', label: 'Deep', editor: 'string' }
        ]
      });

      const node = createMockNode('nested', 'NESTED', {});
      service.setPropertyValue(node, 'a.b.c', 'value');

      expect(node.data['a'].b.c).toBe('value');
    });
  });
});
