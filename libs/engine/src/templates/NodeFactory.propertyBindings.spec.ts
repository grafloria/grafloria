/**
 * NodeFactory - Property Bindings Tests
 * Tests for data-driven conditional properties
 */

import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeFactory } from './NodeFactory';
import { TemplateRegistry } from './TemplateRegistry';
import type { NodeTemplate } from './NodeTemplate';

describe('NodeFactory - Property Bindings', () => {
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

  describe('Shape Property Bindings', () => {
    it('should apply conditional fill based on data', () => {
      const template: NodeTemplate = {
        id: 'conditional-fill',
        version: '1.0.0',
        meta: {
          name: 'Conditional Fill',
          category: 'test',
        },
        structure: {
          type: 'test-node',
          size: { width: 100, height: 50 },

          shape: {
            type: 'rect',
            fill: '#ffffff', // Default
            stroke: '#000000',
          },

          // Property bindings
          propertyBindings: {
            shape: {
              fill: {
                source: 'data.isPrimary',
                map: {
                  'true': '#e3f2fd',
                  'false': '#ffffff',
                },
                default: '#ffffff',
              }
            }
          }
        } as any
      };

      templateRegistry.register(template);

      // Create node with isPrimary = true
      const node1 = nodeFactory.createFromTemplate('conditional-fill', {
        isPrimary: true
      }, { x: 0, y: 0 });

      const shape1 = node1.getMetadata('shape');
      expect(shape1.fill).toBe('#e3f2fd'); // Should be blue

      // Create node with isPrimary = false
      const node2 = nodeFactory.createFromTemplate('conditional-fill', {
        isPrimary: false
      }, { x: 100, y: 0 });

      const shape2 = node2.getMetadata('shape');
      expect(shape2.fill).toBe('#ffffff'); // Should be white
    });

    it('should apply multiple shape properties conditionally', () => {
      const template: NodeTemplate = {
        id: 'multi-shape-props',
        version: '1.0.0',
        meta: {
          name: 'Multi Shape Properties',
          category: 'test',
        },
        structure: {
          type: 'test-node',
          size: { width: 100, height: 50 },

          shape: {
            type: 'rect',
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 1,
          },

          propertyBindings: {
            shape: {
              fill: {
                source: 'data.isPrimary',
                map: { 'true': '#e3f2fd', 'false': '#ffffff' },
              },
              stroke: {
                source: 'data.isForeign',
                map: { 'true': '#4caf50', 'false': '#e0e0e0' },
              },
              strokeWidth: {
                source: 'data.isPrimary',
                map: { 'true': 2, 'false': 1 },
              },
            }
          }
        } as any
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('multi-shape-props', {
        isPrimary: true,
        isForeign: true
      }, { x: 0, y: 0 });

      const shape = node.getMetadata('shape');
      expect(shape.fill).toBe('#e3f2fd'); // Blue (isPrimary = true)
      expect(shape.stroke).toBe('#4caf50'); // Green (isForeign = true)
      expect(shape.strokeWidth).toBe(2); // Bold (isPrimary = true)
    });

    it('should use default value when key not in map', () => {
      const template: NodeTemplate = {
        id: 'with-default',
        version: '1.0.0',
        meta: {
          name: 'With Default',
          category: 'test',
        },
        structure: {
          type: 'test-node',

          shape: {
            type: 'rect',
            fill: '#000000',
          },

          propertyBindings: {
            shape: {
              fill: {
                source: 'data.status',
                map: {
                  'active': '#4caf50',
                  'inactive': '#f44336',
                },
                default: '#9e9e9e', // Gray for unknown status
              }
            }
          }
        } as any
      };

      templateRegistry.register(template);

      const node = nodeFactory.createFromTemplate('with-default', {
        status: 'pending' // Not in map
      }, { x: 0, y: 0 });

      const shape = node.getMetadata('shape');
      expect(shape.fill).toBe('#9e9e9e'); // Should use default
    });
  });

  describe('Behavior Property Bindings', () => {
    it('should apply conditional behavior properties', () => {
      const template: NodeTemplate = {
        id: 'conditional-behavior',
        version: '1.0.0',
        meta: {
          name: 'Conditional Behavior',
          category: 'test',
        },
        structure: {
          type: 'test-node',

          behavior: {
            draggable: true,
            selectable: true,
          },

          propertyBindings: {
            behavior: {
              draggable: {
                source: 'data.isLocked',
                map: {
                  'true': false,  // Locked → not draggable
                  'false': true,  // Unlocked → draggable
                },
                default: true,
              },
              selectable: {
                source: 'data.canSelect',
                map: {
                  'true': true,
                  'false': false,
                },
                default: false,
              }
            }
          }
        } as any
      };

      templateRegistry.register(template);

      const lockedNode = nodeFactory.createFromTemplate('conditional-behavior', {
        isLocked: true,
        canSelect: false
      }, { x: 0, y: 0 });

      expect(lockedNode.behavior.draggable).toBe(false);
      expect(lockedNode.behavior.selectable).toBe(false);

      const unlockedNode = nodeFactory.createFromTemplate('conditional-behavior', {
        isLocked: false,
        canSelect: true
      }, { x: 100, y: 0 });

      expect(unlockedNode.behavior.draggable).toBe(true);
      expect(unlockedNode.behavior.selectable).toBe(true);
    });
  });

  describe('Property Bindings in Repeater', () => {
    it('should apply conditional properties to repeater items', () => {
      const template: NodeTemplate = {
        id: 'repeater-with-bindings',
        version: '1.0.0',
        meta: {
          name: 'Repeater with Bindings',
          category: 'test',
        },
        structure: {
          type: 'container',

          repeater: {
            dataSource: 'items',
            itemTemplate: {
              type: 'item',
              size: { width: 100, height: 30 },

              shape: {
                type: 'rect',
                fill: '#ffffff',
              },

              propertyBindings: {
                shape: {
                  fill: {
                    source: 'data.isImportant',
                    map: {
                      'true': '#ffebee',
                      'false': '#ffffff',
                    }
                  }
                }
              }
            } as any
          }
        }
      };

      templateRegistry.register(template);

      const container = nodeFactory.createFromTemplate('repeater-with-bindings', {
        items: [
          { name: 'Item 1', isImportant: true },
          { name: 'Item 2', isImportant: false },
          { name: 'Item 3', isImportant: true },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(container.children).map(id => diagram.getNode(id));

      // Item 1: important → red tint
      expect(children[0]?.getMetadata('shape').fill).toBe('#ffebee');

      // Item 2: not important → white
      expect(children[1]?.getMetadata('shape').fill).toBe('#ffffff');

      // Item 3: important → red tint
      expect(children[2]?.getMetadata('shape').fill).toBe('#ffebee');
    });

    it('should support nested data paths in property bindings', () => {
      const template: NodeTemplate = {
        id: 'nested-path-bindings',
        version: '1.0.0',
        meta: {
          name: 'Nested Path Bindings',
          category: 'test',
        },
        structure: {
          type: 'container',

          repeater: {
            dataSource: 'fields',
            itemTemplate: {
              type: 'field',

              shape: {
                type: 'rect',
                fill: '#ffffff',
              },

              propertyBindings: {
                shape: {
                  fill: {
                    source: 'data.meta.type',
                    map: {
                      'primary': '#e3f2fd',
                      'foreign': '#c8e6c9',
                      'regular': '#ffffff',
                    }
                  }
                }
              }
            } as any
          }
        }
      };

      templateRegistry.register(template);

      const container = nodeFactory.createFromTemplate('nested-path-bindings', {
        fields: [
          { name: 'id', meta: { type: 'primary' } },
          { name: 'user_id', meta: { type: 'foreign' } },
          { name: 'email', meta: { type: 'regular' } },
        ]
      }, { x: 0, y: 0 });

      const children = Array.from(container.children).map(id => diagram.getNode(id));

      expect(children[0]?.getMetadata('shape').fill).toBe('#e3f2fd'); // primary
      expect(children[1]?.getMetadata('shape').fill).toBe('#c8e6c9'); // foreign
      expect(children[2]?.getMetadata('shape').fill).toBe('#ffffff'); // regular
    });
  });

  describe('ERD Use Case', () => {
    it('should create ERD table with conditional field colors', () => {
      const erdTemplate: NodeTemplate = {
        id: 'erd-conditional-colors',
        version: '1.0.0',
        meta: {
          name: 'ERD with Conditional Colors',
          category: 'erd',
        },
        structure: {
          type: 'erd-container',
          size: { width: 250, height: 200 },

          repeater: {
            dataSource: 'columns',
            keyField: 'name',
            itemTemplate: {
              type: 'erd-field',
              size: { width: 250, height: 24 },

              shape: {
                type: 'rect',
                fill: '#ffffff',
                stroke: '#e0e0e0',
              },

              propertyBindings: {
                shape: {
                  fill: {
                    source: 'data.isPrimaryKey',
                    map: {
                      'true': '#e3f2fd',
                      'false': '#ffffff',
                    }
                  },
                  stroke: {
                    source: 'data.isForeignKey',
                    map: {
                      'true': '#4caf50',
                      'false': '#e0e0e0',
                    }
                  }
                }
              },

              ports: {
                enabled: true,
                left: { enabled: true },
                right: { enabled: true },
              }
            } as any
          }
        }
      };

      templateRegistry.register(erdTemplate);

      const table = nodeFactory.createFromTemplate('erd-conditional-colors', {
        tableName: 'users',
        columns: [
          { name: 'id', dataType: 'INT', isPrimaryKey: true, isForeignKey: false },
          { name: 'role_id', dataType: 'INT', isPrimaryKey: false, isForeignKey: true },
          { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false },
        ]
      }, { x: 0, y: 0 });

      const fields = Array.from(table.children).map(id => diagram.getNode(id));

      // Primary key field (id): Blue background, gray border
      const idField = fields[0];
      expect(idField?.data.name).toBe('id');
      expect(idField?.getMetadata('shape').fill).toBe('#e3f2fd');
      expect(idField?.getMetadata('shape').stroke).toBe('#e0e0e0');

      // Foreign key field (role_id): White background, green border
      const roleIdField = fields[1];
      expect(roleIdField?.data.name).toBe('role_id');
      expect(roleIdField?.getMetadata('shape').fill).toBe('#ffffff');
      expect(roleIdField?.getMetadata('shape').stroke).toBe('#4caf50');

      // Regular field (email): White background, gray border
      const emailField = fields[2];
      expect(emailField?.data.name).toBe('email');
      expect(emailField?.getMetadata('shape').fill).toBe('#ffffff');
      expect(emailField?.getMetadata('shape').stroke).toBe('#e0e0e0');
    });
  });
});
