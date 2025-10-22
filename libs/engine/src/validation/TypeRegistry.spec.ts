// TypeRegistry tests

import { TypeRegistry, NodeTypeDefinition, PortTypeDefinition, LinkTypeDefinition } from './TypeRegistry';

describe('TypeRegistry', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Node Type Registration', () => {
    it('should register a node type', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'custom-node',
        label: 'Custom Node',
        description: 'A custom node type',
      };

      registry.registerNodeType(nodeDef);

      expect(registry.hasNodeType('custom-node')).toBe(true);
      expect(registry.getNodeType('custom-node')).toEqual(nodeDef);
    });

    it('should throw when registering duplicate node type', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'custom-node',
        label: 'Custom Node',
      };

      registry.registerNodeType(nodeDef);

      expect(() => registry.registerNodeType(nodeDef)).toThrow(
        "Node type 'custom-node' is already registered"
      );
    });

    it('should unregister a node type', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'custom-node',
        label: 'Custom Node',
      };

      registry.registerNodeType(nodeDef);
      const result = registry.unregisterNodeType('custom-node');

      expect(result).toBe(true);
      expect(registry.hasNodeType('custom-node')).toBe(false);
    });

    it('should return false when unregistering non-existent node type', () => {
      const result = registry.unregisterNodeType('nonexistent');
      expect(result).toBe(false);
    });

    it('should list all node types', () => {
      const node1: NodeTypeDefinition = { type: 'type1', label: 'Type 1' };
      const node2: NodeTypeDefinition = { type: 'type2', label: 'Type 2' };

      registry.registerNodeType(node1);
      registry.registerNodeType(node2);

      const types = registry.listNodeTypes();

      expect(types).toHaveLength(2);
      expect(types).toContainEqual(node1);
      expect(types).toContainEqual(node2);
    });
  });

  describe('Port Type Registration', () => {
    it('should register a port type', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'input',
        maxConnections: 1,
      };

      registry.registerPortType(portDef);

      expect(registry.hasPortType('data-port')).toBe(true);
      expect(registry.getPortType('data-port')).toEqual(portDef);
    });

    it('should throw when registering duplicate port type', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'input',
      };

      registry.registerPortType(portDef);

      expect(() => registry.registerPortType(portDef)).toThrow(
        "Port type 'data-port' is already registered"
      );
    });

    it('should unregister a port type', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'input',
      };

      registry.registerPortType(portDef);
      const result = registry.unregisterPortType('data-port');

      expect(result).toBe(true);
      expect(registry.hasPortType('data-port')).toBe(false);
    });

    it('should list all port types', () => {
      const port1: PortTypeDefinition = { type: 'type1', label: 'Type 1', direction: 'input' };
      const port2: PortTypeDefinition = { type: 'type2', label: 'Type 2', direction: 'output' };

      registry.registerPortType(port1);
      registry.registerPortType(port2);

      const types = registry.listPortTypes();

      expect(types).toHaveLength(2);
      expect(types).toContainEqual(port1);
      expect(types).toContainEqual(port2);
    });
  });

  describe('Link Type Registration', () => {
    it('should register a link type', () => {
      const linkDef: LinkTypeDefinition = {
        type: 'data-link',
        label: 'Data Link',
        allowedSourcePortTypes: ['output'],
        allowedTargetPortTypes: ['input'],
      };

      registry.registerLinkType(linkDef);

      expect(registry.hasLinkType('data-link')).toBe(true);
      expect(registry.getLinkType('data-link')).toEqual(linkDef);
    });

    it('should throw when registering duplicate link type', () => {
      const linkDef: LinkTypeDefinition = {
        type: 'data-link',
        label: 'Data Link',
      };

      registry.registerLinkType(linkDef);

      expect(() => registry.registerLinkType(linkDef)).toThrow(
        "Link type 'data-link' is already registered"
      );
    });

    it('should unregister a link type', () => {
      const linkDef: LinkTypeDefinition = {
        type: 'data-link',
        label: 'Data Link',
      };

      registry.registerLinkType(linkDef);
      const result = registry.unregisterLinkType('data-link');

      expect(result).toBe(true);
      expect(registry.hasLinkType('data-link')).toBe(false);
    });

    it('should list all link types', () => {
      const link1: LinkTypeDefinition = { type: 'type1', label: 'Type 1' };
      const link2: LinkTypeDefinition = { type: 'type2', label: 'Type 2' };

      registry.registerLinkType(link1);
      registry.registerLinkType(link2);

      const types = registry.listLinkTypes();

      expect(types).toHaveLength(2);
      expect(types).toContainEqual(link1);
      expect(types).toContainEqual(link2);
    });
  });

  describe('Clear and Stats', () => {
    it('should clear all registered types', () => {
      registry.registerNodeType({ type: 'node1', label: 'Node 1' });
      registry.registerPortType({ type: 'port1', label: 'Port 1', direction: 'input' });
      registry.registerLinkType({ type: 'link1', label: 'Link 1' });

      registry.clear();

      expect(registry.hasNodeType('node1')).toBe(false);
      expect(registry.hasPortType('port1')).toBe(false);
      expect(registry.hasLinkType('link1')).toBe(false);
    });

    it('should return correct stats', () => {
      registry.registerNodeType({ type: 'node1', label: 'Node 1' });
      registry.registerNodeType({ type: 'node2', label: 'Node 2' });
      registry.registerPortType({ type: 'port1', label: 'Port 1', direction: 'input' });
      registry.registerLinkType({ type: 'link1', label: 'Link 1' });

      const stats = registry.getStats();

      expect(stats).toEqual({
        nodeTypes: 2,
        portTypes: 1,
        linkTypes: 1,
        groupTypes: 0, // Phase 2
      });
    });
  });

  describe('Complex Type Definitions', () => {
    it('should register node type with constraints', () => {
      const nodeDef: NodeTypeDefinition = {
        type: 'processor',
        label: 'Processor Node',
        description: 'Processes data',
        minPorts: 2,
        maxPorts: 10,
        allowedPortTypes: ['data-input', 'data-output'],
        validator: (node) => ({
          valid: true,
          errors: [],
          warnings: [],
        }),
      };

      registry.registerNodeType(nodeDef);

      const retrieved = registry.getNodeType('processor');
      expect(retrieved).toBeDefined();
      expect(retrieved!.minPorts).toBe(2);
      expect(retrieved!.maxPorts).toBe(10);
      expect(retrieved!.validator).toBeDefined();
    });

    it('should register port type with constraints', () => {
      const portDef: PortTypeDefinition = {
        type: 'data-port',
        label: 'Data Port',
        direction: 'bi',
        maxConnections: 5,
        allowedLinkTypes: ['data-link', 'control-link'],
        validator: (port) => ({
          valid: true,
          errors: [],
          warnings: [],
        }),
      };

      registry.registerPortType(portDef);

      const retrieved = registry.getPortType('data-port');
      expect(retrieved).toBeDefined();
      expect(retrieved!.maxConnections).toBe(5);
      expect(retrieved!.allowedLinkTypes).toEqual(['data-link', 'control-link']);
      expect(retrieved!.validator).toBeDefined();
    });
  });

  // ============================================
  // PHASE 2: Type System Enhancements Tests
  // ============================================

  describe('Type Inheritance (Phase 2.1)', () => {
    it('should register a type that extends another type', () => {
      // Register base type
      registry.registerNodeType({
        type: 'base-node',
        label: 'Base Node',
        minPorts: 1,
        maxPorts: 5,
      });

      // Register derived type
      registry.registerNodeType({
        type: 'custom-node',
        label: 'Custom Node',
        extends: 'base-node',
        maxPorts: 10, // Override parent property
      });

      const customType = registry.getNodeType('custom-node');
      expect(customType).toBeDefined();
      expect(customType!.extends).toBe('base-node');
    });

    it('should resolve inherited properties from parent type', () => {
      // Register base type
      registry.registerNodeType({
        type: 'base-process',
        label: 'Base Process',
        minPorts: 2,
        maxPorts: 5,
        allowedPortTypes: ['input', 'output'],
        defaultData: { status: 'pending' },
      });

      // Register derived type
      registry.registerNodeType({
        type: 'custom-process',
        label: 'Custom Process',
        extends: 'base-process',
        maxPorts: 10, // Override
      });

      const resolved = registry.resolveNodeType('custom-process');

      expect(resolved.type).toBe('custom-process');
      expect(resolved.label).toBe('Custom Process');
      expect(resolved.minPorts).toBe(2); // Inherited
      expect(resolved.maxPorts).toBe(10); // Overridden
      expect(resolved.allowedPortTypes).toEqual(['input', 'output']); // Inherited
      expect(resolved.defaultData).toEqual({ status: 'pending' }); // Inherited
    });

    it('should handle multi-level inheritance (grandparent -> parent -> child)', () => {
      // Grandparent
      registry.registerNodeType({
        type: 'grandparent',
        label: 'Grandparent',
        minPorts: 1,
        defaultData: { level: 0 },
      });

      // Parent
      registry.registerNodeType({
        type: 'parent',
        label: 'Parent',
        extends: 'grandparent',
        maxPorts: 5,
        defaultData: { level: 1 },
      });

      // Child
      registry.registerNodeType({
        type: 'child',
        label: 'Child',
        extends: 'parent',
        maxPorts: 10,
      });

      const resolved = registry.resolveNodeType('child');

      expect(resolved.minPorts).toBe(1); // From grandparent
      expect(resolved.maxPorts).toBe(10); // Overridden by child
      expect(resolved.defaultData).toEqual({ level: 1 }); // From parent
    });

    it('should throw error when extending non-existent type', () => {
      expect(() => {
        registry.registerNodeType({
          type: 'child',
          label: 'Child',
          extends: 'nonexistent-parent',
        });
      }).toThrow("Parent type 'nonexistent-parent' not found");
    });

    it('should detect circular inheritance', () => {
      registry.registerNodeType({
        type: 'type-a',
        label: 'Type A',
      });

      registry.registerNodeType({
        type: 'type-b',
        label: 'Type B',
        extends: 'type-a',
      });

      // Try to make type-a extend type-b (circular)
      expect(() => {
        registry.registerNodeType({
          type: 'type-a',
          label: 'Type A Updated',
          extends: 'type-b',
        });
      }).toThrow('Circular inheritance detected');
    });

    it('should inherit validator functions', () => {
      const baseValidator = jest.fn(() => ({
        valid: true,
        errors: [],
        warnings: [],
      }));

      registry.registerNodeType({
        type: 'base',
        label: 'Base',
        validator: baseValidator,
      });

      registry.registerNodeType({
        type: 'derived',
        label: 'Derived',
        extends: 'base',
      });

      const resolved = registry.resolveNodeType('derived');
      expect(resolved.validator).toBe(baseValidator);
    });

    it('should allow overriding validator in child type', () => {
      const baseValidator = jest.fn();
      const childValidator = jest.fn();

      registry.registerNodeType({
        type: 'base',
        label: 'Base',
        validator: baseValidator,
      });

      registry.registerNodeType({
        type: 'child',
        label: 'Child',
        extends: 'base',
        validator: childValidator,
      });

      const resolved = registry.resolveNodeType('child');
      expect(resolved.validator).toBe(childValidator);
    });
  });

  describe('Type Hierarchies (Phase 2.2)', () => {
    it('should register type with category', () => {
      registry.registerNodeType({
        type: 'bpmn-task',
        label: 'BPMN Task',
        category: 'bpmn',
      });

      const type = registry.getNodeType('bpmn-task');
      expect(type!.category).toBe('bpmn');
    });

    it('should register type with family', () => {
      registry.registerNodeType({
        type: 'user-task',
        label: 'User Task',
        category: 'bpmn',
        family: 'task',
      });

      const type = registry.getNodeType('user-task');
      expect(type!.family).toBe('task');
    });

    it('should register type with tags', () => {
      registry.registerNodeType({
        type: 'manual-task',
        label: 'Manual Task',
        category: 'bpmn',
        family: 'task',
        tags: ['manual', 'user-interaction', 'activity'],
      });

      const type = registry.getNodeType('manual-task');
      expect(type!.tags).toEqual(['manual', 'user-interaction', 'activity']);
    });

    it('should query types by category', () => {
      registry.registerNodeType({
        type: 'bpmn-task',
        label: 'BPMN Task',
        category: 'bpmn',
      });

      registry.registerNodeType({
        type: 'bpmn-gateway',
        label: 'BPMN Gateway',
        category: 'bpmn',
      });

      registry.registerNodeType({
        type: 'flowchart-process',
        label: 'Flowchart Process',
        category: 'flowchart',
      });

      const bpmnTypes = registry.getNodeTypesByCategory('bpmn');
      expect(bpmnTypes).toHaveLength(2);
      expect(bpmnTypes.map(t => t.type)).toContain('bpmn-task');
      expect(bpmnTypes.map(t => t.type)).toContain('bpmn-gateway');
    });

    it('should query types by family', () => {
      registry.registerNodeType({
        type: 'user-task',
        label: 'User Task',
        category: 'bpmn',
        family: 'task',
      });

      registry.registerNodeType({
        type: 'service-task',
        label: 'Service Task',
        category: 'bpmn',
        family: 'task',
      });

      registry.registerNodeType({
        type: 'exclusive-gateway',
        label: 'Exclusive Gateway',
        category: 'bpmn',
        family: 'gateway',
      });

      const taskTypes = registry.getNodeTypesByFamily('task');
      expect(taskTypes).toHaveLength(2);
      expect(taskTypes.map(t => t.type)).toContain('user-task');
      expect(taskTypes.map(t => t.type)).toContain('service-task');
    });

    it('should query types by tag', () => {
      registry.registerNodeType({
        type: 'manual-task',
        label: 'Manual Task',
        tags: ['manual', 'user-interaction'],
      });

      registry.registerNodeType({
        type: 'user-task',
        label: 'User Task',
        tags: ['user-interaction', 'form'],
      });

      registry.registerNodeType({
        type: 'service-task',
        label: 'Service Task',
        tags: ['automated', 'api'],
      });

      const userInteractionTypes = registry.getNodeTypesByTag('user-interaction');
      expect(userInteractionTypes).toHaveLength(2);
      expect(userInteractionTypes.map(t => t.type)).toContain('manual-task');
      expect(userInteractionTypes.map(t => t.type)).toContain('user-task');
    });

    it('should return empty array for non-existent category', () => {
      const types = registry.getNodeTypesByCategory('nonexistent');
      expect(types).toEqual([]);
    });

    it('should combine category and family queries', () => {
      registry.registerNodeType({
        type: 'bpmn-user-task',
        label: 'BPMN User Task',
        category: 'bpmn',
        family: 'task',
      });

      registry.registerNodeType({
        type: 'bpmn-service-task',
        label: 'BPMN Service Task',
        category: 'bpmn',
        family: 'task',
      });

      registry.registerNodeType({
        type: 'uml-class',
        label: 'UML Class',
        category: 'uml',
        family: 'class-diagram',
      });

      const bpmnTypes = registry.getNodeTypesByCategory('bpmn');
      const taskTypes = registry.getNodeTypesByFamily('task');

      expect(bpmnTypes).toHaveLength(2);
      expect(taskTypes).toHaveLength(2);
    });

    it('should inherit category and family from parent type', () => {
      registry.registerNodeType({
        type: 'base-task',
        label: 'Base Task',
        category: 'bpmn',
        family: 'task',
      });

      registry.registerNodeType({
        type: 'custom-task',
        label: 'Custom Task',
        extends: 'base-task',
      });

      const resolved = registry.resolveNodeType('custom-task');
      expect(resolved.category).toBe('bpmn');
      expect(resolved.family).toBe('task');
    });

    it('should allow overriding category in child type', () => {
      registry.registerNodeType({
        type: 'base-node',
        label: 'Base Node',
        category: 'generic',
      });

      registry.registerNodeType({
        type: 'specific-node',
        label: 'Specific Node',
        extends: 'base-node',
        category: 'specific',
      });

      const resolved = registry.resolveNodeType('specific-node');
      expect(resolved.category).toBe('specific');
    });
  });

  describe('Type Behavior Templates (Phase 2.4)', () => {
    it('should register type with default behavior', () => {
      registry.registerNodeType({
        type: 'locked-node',
        label: 'Locked Node',
        defaultBehavior: {
          draggable: false,
          deletable: false,
          resizable: false,
          selectable: true,
        },
      });

      const type = registry.getNodeType('locked-node');
      expect(type!.defaultBehavior).toEqual({
        draggable: false,
        deletable: false,
        resizable: false,
        selectable: true,
      });
    });

    it('should inherit default behavior from parent', () => {
      registry.registerNodeType({
        type: 'base-node',
        label: 'Base Node',
        defaultBehavior: {
          draggable: true,
          deletable: true,
          resizable: true,
        },
      });

      registry.registerNodeType({
        type: 'child-node',
        label: 'Child Node',
        extends: 'base-node',
      });

      const resolved = registry.resolveNodeType('child-node');
      expect(resolved.defaultBehavior).toEqual({
        draggable: true,
        deletable: true,
        resizable: true,
      });
    });

    it('should merge default behavior with parent (child overrides)', () => {
      registry.registerNodeType({
        type: 'base-node',
        label: 'Base Node',
        defaultBehavior: {
          draggable: true,
          deletable: true,
          resizable: true,
          selectable: true,
        },
      });

      registry.registerNodeType({
        type: 'child-node',
        label: 'Child Node',
        extends: 'base-node',
        defaultBehavior: {
          draggable: false, // Override
          deletable: false, // Override
          // resizable and selectable inherited
        },
      });

      const resolved = registry.resolveNodeType('child-node');
      expect(resolved.defaultBehavior).toEqual({
        draggable: false,
        deletable: false,
        resizable: true,
        selectable: true,
      });
    });

    it('should register type with default style', () => {
      registry.registerNodeType({
        type: 'styled-node',
        label: 'Styled Node',
        defaultStyle: {
          fill: '#e3f2fd',
          stroke: '#1976d2',
          strokeWidth: 2,
          borderRadius: 8,
        },
      });

      const type = registry.getNodeType('styled-node');
      expect(type!.defaultStyle).toEqual({
        fill: '#e3f2fd',
        stroke: '#1976d2',
        strokeWidth: 2,
        borderRadius: 8,
      });
    });

    it('should inherit and merge default style from parent', () => {
      registry.registerNodeType({
        type: 'base-styled',
        label: 'Base Styled',
        defaultStyle: {
          fill: '#ffffff',
          stroke: '#000000',
          strokeWidth: 1,
        },
      });

      registry.registerNodeType({
        type: 'child-styled',
        label: 'Child Styled',
        extends: 'base-styled',
        defaultStyle: {
          fill: '#ff0000', // Override
          borderRadius: 4, // Add new
        },
      });

      const resolved = registry.resolveNodeType('child-styled');
      expect(resolved.defaultStyle).toEqual({
        fill: '#ff0000', // Overridden
        stroke: '#000000', // Inherited
        strokeWidth: 1, // Inherited
        borderRadius: 4, // Added
      });
    });

    it('should register type with default size', () => {
      registry.registerNodeType({
        type: 'fixed-size-node',
        label: 'Fixed Size Node',
        defaultSize: {
          width: 200,
          height: 100,
        },
      });

      const type = registry.getNodeType('fixed-size-node');
      expect(type!.defaultSize).toEqual({
        width: 200,
        height: 100,
      });
    });
  });

  describe('Performance and Edge Cases (Phase 2)', () => {
    it('should handle deep inheritance chains efficiently', () => {
      // Create 10-level deep inheritance
      for (let i = 0; i < 10; i++) {
        registry.registerNodeType({
          type: `level-${i}`,
          label: `Level ${i}`,
          extends: i > 0 ? `level-${i - 1}` : undefined,
          minPorts: i,
        });
      }

      const start = performance.now();
      const resolved = registry.resolveNodeType('level-9');
      const duration = performance.now() - start;

      expect(resolved.minPorts).toBe(9);
      expect(duration).toBeLessThan(10); // Should resolve in < 10ms
    });

    it('should handle large number of types efficiently', () => {
      // Register 1000 types
      for (let i = 0; i < 1000; i++) {
        registry.registerNodeType({
          type: `type-${i}`,
          label: `Type ${i}`,
          category: `category-${i % 10}`,
          family: `family-${i % 5}`,
        });
      }

      const start = performance.now();
      const types = registry.getNodeTypesByCategory('category-5');
      const duration = performance.now() - start;

      expect(types.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should query in < 50ms
    });

    it('should handle types with no category/family gracefully', () => {
      registry.registerNodeType({
        type: 'no-hierarchy',
        label: 'No Hierarchy',
      });

      const byCat = registry.getNodeTypesByCategory('nonexistent');
      const byFam = registry.getNodeTypesByFamily('nonexistent');
      const byTag = registry.getNodeTypesByTag('nonexistent');

      expect(byCat).toEqual([]);
      expect(byFam).toEqual([]);
      expect(byTag).toEqual([]);
    });

    it('should handle tag queries with partial matches', () => {
      registry.registerNodeType({
        type: 'multi-tag',
        label: 'Multi Tag',
        tags: ['tag1', 'tag2', 'tag3'],
      });

      const byTag1 = registry.getNodeTypesByTag('tag1');
      const byTag2 = registry.getNodeTypesByTag('tag2');
      const byTag3 = registry.getNodeTypesByTag('tag3');

      expect(byTag1).toHaveLength(1);
      expect(byTag2).toHaveLength(1);
      expect(byTag3).toHaveLength(1);
    });
  });
});
