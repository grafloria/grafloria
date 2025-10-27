/**
 * NodeFactory - Repeater Configuration Tests
 * Tests for dynamic child node generation from data arrays
 */

import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeFactory } from './NodeFactory';
import { TemplateRegistry } from './TemplateRegistry';
import type { NodeTemplate } from './NodeTemplate';

describe('NodeFactory - Repeater Configuration', () => {
  let engine: DiagramEngine;
  let diagram: any;
  let templateRegistry: TemplateRegistry;
  let nodeFactory: NodeFactory;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('test-diagram');
    templateRegistry = new TemplateRegistry(engine.eventBus);
    nodeFactory = new NodeFactory(templateRegistry, diagram);
  });

  describe('Basic Repeater Functionality', () => {
    it('should create child nodes from array data', () => {
      const template: NodeTemplate = {
        id: 'list-with-items',
        version: '1.0.0',
        meta: {
          name: 'List with Items',
          category: 'test',
        },
        structure: {
          type: 'container',
          size: { width: 200, height: 300 },
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'list-item',
              size: { width: 200, height: 30 },
            }
          }
        },
        defaultData: {
          items: [],
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('list-with-items', {
        items: [
          { name: 'Item 1' },
          { name: 'Item 2' },
          { name: 'Item 3' },
        ]
      }, { x: 0, y: 0 });

      expect(node).toBeDefined();
      expect(node.children.size).toBe(3);

      // Verify each child
      const children = Array.from(node.children).map(id => diagram.getNode(id));
      expect(children).toHaveLength(3);

      children.forEach((child, index) => {
        expect(child?.type).toBe('list-item');
        expect(child?.getMetadata('_isRepeaterItem')).toBe(true);
        expect(child?.getMetadata('_repeaterItemIndex')).toBe(index);
        expect(child?.parentId).toBe(node.id);
      });
    });

    it('should handle empty arrays gracefully', () => {
      const template: NodeTemplate = {
        id: 'empty-list',
        version: '1.0.0',
        meta: {
          name: 'Empty List',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 50 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('empty-list', {
        items: []
      }, { x: 0, y: 0 });

      expect(node.children.size).toBe(0);
    });

    it('should warn when dataSource is not an array', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const template: NodeTemplate = {
        id: 'invalid-datasource',
        version: '1.0.0',
        meta: {
          name: 'Invalid DataSource',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'notAnArray',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 50 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('invalid-datasource', {
        notAnArray: 'string value'
      }, { x: 0, y: 0 });

      expect(node.children.size).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('did not resolve to an array')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Helper Metadata', () => {
    it('should add _index, _isFirst, _isLast, _total helpers', () => {
      const template: NodeTemplate = {
        id: 'items-with-helpers',
        version: '1.0.0',
        meta: {
          name: 'Items with Helpers',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('items-with-helpers', {
        items: [
          { value: 'A' },
          { value: 'B' },
          { value: 'C' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // First item
      expect(children[0]?.data['_index']).toBe(0);
      expect(children[0]?.data['_isFirst']).toBe(true);
      expect(children[0]?.data['_isLast']).toBe(false);
      expect(children[0]?.data['_total']).toBe(3);

      // Middle item
      expect(children[1]?.data['_index']).toBe(1);
      expect(children[1]?.data['_isFirst']).toBe(false);
      expect(children[1]?.data['_isLast']).toBe(false);
      expect(children[1]?.data['_total']).toBe(3);

      // Last item
      expect(children[2]?.data['_index']).toBe(2);
      expect(children[2]?.data['_isFirst']).toBe(false);
      expect(children[2]?.data['_isLast']).toBe(true);
      expect(children[2]?.data['_total']).toBe(3);
    });

    it('should use keyField for _key metadata', () => {
      const template: NodeTemplate = {
        id: 'items-with-keys',
        version: '1.0.0',
        meta: {
          name: 'Items with Keys',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            keyField: 'id',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('items-with-keys', {
        items: [
          { id: 'alpha', name: 'Alpha' },
          { id: 'beta', name: 'Beta' },
          { id: 'gamma', name: 'Gamma' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      expect(children[0]?.getMetadata('_repeaterItemKey')).toBe('alpha');
      expect(children[1]?.getMetadata('_repeaterItemKey')).toBe('beta');
      expect(children[2]?.getMetadata('_repeaterItemKey')).toBe('gamma');
    });

    it('should fallback to index when keyField is missing', () => {
      const template: NodeTemplate = {
        id: 'items-without-keyfield',
        version: '1.0.0',
        meta: {
          name: 'Items without KeyField',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            keyField: 'missingField',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('items-without-keyfield', {
        items: [
          { name: 'A' },
          { name: 'B' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // Should fallback to index
      expect(children[0]?.getMetadata('_repeaterItemKey')).toBe(0);
      expect(children[1]?.getMetadata('_repeaterItemKey')).toBe(1);
    });
  });

  describe('Data Merging', () => {
    it('should merge parent data with item data', () => {
      const template: NodeTemplate = {
        id: 'merged-data',
        version: '1.0.0',
        meta: {
          name: 'Merged Data',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('merged-data', {
        parentProperty: 'parent-value',
        items: [
          { itemProperty: 'item1-value' },
          { itemProperty: 'item2-value' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // Each child should have both parent and item data
      expect(children[0]?.data['parentProperty']).toBe('parent-value');
      expect(children[0]?.data['itemProperty']).toBe('item1-value');

      expect(children[1]?.data['parentProperty']).toBe('parent-value');
      expect(children[1]?.data['itemProperty']).toBe('item2-value');
    });

    it('should give precedence to item data over parent data', () => {
      const template: NodeTemplate = {
        id: 'data-precedence',
        version: '1.0.0',
        meta: {
          name: 'Data Precedence',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('data-precedence', {
        value: 'parent-value',
        items: [
          { value: 'item-value' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // Item data should override parent data
      expect(children[0]?.data['value']).toBe('item-value');
    });
  });

  describe('Nested Path DataSource', () => {
    it('should resolve nested data paths', () => {
      const template: NodeTemplate = {
        id: 'nested-path',
        version: '1.0.0',
        meta: {
          name: 'Nested Path',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'schema.tables',
            itemTemplate: {
              type: 'table',
              size: { width: 200, height: 100 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('nested-path', {
        schema: {
          tables: [
            { name: 'users' },
            { name: 'orders' },
          ]
        }
      }, { x: 0, y: 0 });

      expect(node.children.size).toBe(2);

      const children = Array.from(node.children).map(id => diagram.getNode(id));
      expect(children[0]?.data['name']).toBe('users');
      expect(children[1]?.data['name']).toBe('orders');
    });
  });

  describe('Combined Static and Dynamic Children', () => {
    it('should create both static and repeater children', () => {
      const template: NodeTemplate = {
        id: 'mixed-children',
        version: '1.0.0',
        meta: {
          name: 'Mixed Children',
          category: 'test',
        },
        structure: {
          type: 'container',
          size: { width: 250, height: 300 },
          children: [
            {
              type: 'header',
              size: { width: 250, height: 40 },
            },
            {
              type: 'footer',
              size: { width: 250, height: 40 },
            }
          ],
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 250, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('mixed-children', {
        items: [
          { name: 'Item 1' },
          { name: 'Item 2' },
        ]
      }, { x: 0, y: 0 });

      // Should have 2 static + 2 dynamic = 4 total children
      expect(node.children.size).toBe(4);

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // First two should be static children
      expect(children[0]?.type).toBe('header');
      expect(children[1]?.type).toBe('footer');
      expect(children[0]?.getMetadata('_isRepeaterItem')).toBeUndefined();
      expect(children[1]?.getMetadata('_isRepeaterItem')).toBeUndefined();

      // Last two should be repeater children
      expect(children[2]?.type).toBe('item');
      expect(children[3]?.type).toBe('item');
      expect(children[2]?.getMetadata('_isRepeaterItem')).toBe(true);
      expect(children[3]?.getMetadata('_isRepeaterItem')).toBe(true);
    });
  });

  describe('Layout Integration', () => {
    it('should apply flexbox layout to repeater children', () => {
      const template: NodeTemplate = {
        id: 'layout-with-repeater',
        version: '1.0.0',
        meta: {
          name: 'Layout with Repeater',
          category: 'test',
        },
        structure: {
          type: 'container',
          size: { width: 200, height: 200 },
          layout: {
            direction: 'column',
            gap: 5,
            padding: { top: 10, right: 0, bottom: 0, left: 10 },
          },
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 180, height: 30 },
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('layout-with-repeater', {
        items: [
          { name: 'Item 1' },
          { name: 'Item 2' },
          { name: 'Item 3' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // Check vertical stacking with gap
      expect(children[0]?.position).toEqual({ x: 10, y: 10, z: 0 });
      expect(children[1]?.position).toEqual({ x: 10, y: 45, z: 0 }); // 10 + 30 + 5
      expect(children[2]?.position).toEqual({ x: 10, y: 80, z: 0 }); // 45 + 30 + 5
    });
  });

  describe('Ports in Repeater Items', () => {
    it('should create ports on repeater items', () => {
      const template: NodeTemplate = {
        id: 'items-with-ports',
        version: '1.0.0',
        meta: {
          name: 'Items with Ports',
          category: 'test',
        },
        structure: {
          type: 'container',
          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },
              ports: {
                enabled: true,
                left: { enabled: true, type: 'input' },
                right: { enabled: true, type: 'output' },
              }
            }
          }
        }
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('items-with-ports', {
        items: [
          { name: 'Item 1' },
          { name: 'Item 2' },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(node.children).map(id => diagram.getNode(id));

      // Each child should have ports
      expect(children[0]?.getPorts().length).toBe(2);
      expect(children[1]?.getPorts().length).toBe(2);

      const item1Ports = children[0]?.getPorts();
      expect(item1Ports?.[0].side).toBe('left');
      expect(item1Ports?.[0].type).toBe('input');
      expect(item1Ports?.[1].side).toBe('right');
      expect(item1Ports?.[1].type).toBe('output');
    });
  });

  describe('Real-World: ERD Table Example', () => {
    it('should create ERD table with dynamic field nodes', () => {
      const erdTemplate: NodeTemplate = {
        id: 'erd-table-dynamic',
        version: '1.0.0',
        meta: {
          name: 'ERD Table (Dynamic)',
          description: 'Database table with dynamic fields',
          category: 'erd',
        },
        structure: {
          type: 'erd-container',
          size: { width: 250, height: 200 },
          ports: { enabled: false },
          layout: {
            direction: 'column',
            gap: 0,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
          },
          children: [
            {
              type: 'erd-header',
              size: { width: 250, height: 32 },
              ports: { enabled: false },
            }
          ],
          repeater: {
            dataSource: 'columns',
            keyField: 'name',
            itemTemplate: {
              type: 'erd-field',
              size: { width: 250, height: 24 },
              ports: {
                enabled: true,
                left: { enabled: true, type: 'input' },
                right: { enabled: true, type: 'output' },
              }
            }
          }
        },
        defaultData: {
          tableName: '',
          columns: []
        }
      };

      templateRegistry.register(erdTemplate);

      const table = nodeFactory.createFromTemplate('erd-table-dynamic', {
        tableName: 'users',
        columns: [
          { name: 'id', dataType: 'INT', isPrimaryKey: true },
          { name: 'email', dataType: 'VARCHAR(255)' },
          { name: 'name', dataType: 'VARCHAR(100)' },
        ]
      }, { x: 100, y: 100 });

      // Should have 1 header + 3 fields = 4 children
      expect(table.children.size).toBe(4);

      const children = Array.from(table.children).map(id => diagram.getNode(id));

      // Header
      expect(children[0]?.type).toBe('erd-header');
      expect(children[0]?.getPorts().length).toBe(0);

      // Fields
      expect(children[1]?.type).toBe('erd-field');
      expect(children[1]?.data['name']).toBe('id');
      expect(children[1]?.data['isPrimaryKey']).toBe(true);
      expect(children[1]?.getPorts().length).toBe(2);

      expect(children[2]?.type).toBe('erd-field');
      expect(children[2]?.data['name']).toBe('email');
      expect(children[2]?.getPorts().length).toBe(2);

      expect(children[3]?.type).toBe('erd-field');
      expect(children[3]?.data['name']).toBe('name');
      expect(children[3]?.getPorts().length).toBe(2);

      // Check layout positions
      expect(children[0]?.position.y).toBe(0);
      expect(children[1]?.position.y).toBe(32);  // After header
      expect(children[2]?.position.y).toBe(56);  // 32 + 24
      expect(children[3]?.position.y).toBe(80);  // 56 + 24
    });
  });
});
