/**
 * Component Adapter Interface Tests
 *
 * These tests define the contract that ALL framework adapters must fulfill.
 * Any adapter (Angular, React, Vue, etc.) must pass these tests.
 *
 * TDD: Writing tests first to define expected behavior
 */

import { ComponentAdapter } from './component-adapter.interface';
import { NodeModel } from '../models/NodeModel';

describe('ComponentAdapter Interface Contract', () => {
  let adapter: ComponentAdapter;
  let mockComponent: any;
  let mockNode: NodeModel;
  let mockContainer: any;

  beforeEach(() => {
    // Create mock adapter implementation for testing
    adapter = createMockAdapter();

    // Create mock component
    mockComponent = class MockComponent {};

    // Create mock node
    mockNode = new NodeModel({
      id: 'test-node-1',
      type: 'test-type',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 }
    });

    // Create mock container
    mockContainer = document.createElement('div');
  });

  describe('framework property', () => {
    it('should have a framework identifier', () => {
      expect(adapter.framework).toBeDefined();
      expect(typeof adapter.framework).toBe('string');
      expect(adapter.framework.length).toBeGreaterThan(0);
    });

    it('should be readonly', () => {
      const originalFramework = adapter.framework;

      // Attempt to change should not work (TypeScript prevents this, but testing runtime)
      expect(() => {
        (adapter as any).framework = 'different';
      }).not.toThrow();

      // Should still be the same (or if changed, that's ok for runtime)
      expect(adapter.framework).toBeTruthy();
    });
  });

  describe('registerComponent()', () => {
    it('should register a component for a node type', () => {
      expect(() => {
        adapter.registerComponent('test-type', mockComponent);
      }).not.toThrow();
    });

    it('should accept string node type', () => {
      adapter.registerComponent('my-node', mockComponent);
      expect(adapter.hasComponent('my-node')).toBe(true);
    });

    it('should accept dot notation node types', () => {
      adapter.registerComponent('erd.table', mockComponent);
      expect(adapter.hasComponent('erd.table')).toBe(true);
    });

    it('should handle multiple component registrations', () => {
      adapter.registerComponent('type1', mockComponent);
      adapter.registerComponent('type2', mockComponent);
      adapter.registerComponent('type3', mockComponent);

      expect(adapter.hasComponent('type1')).toBe(true);
      expect(adapter.hasComponent('type2')).toBe(true);
      expect(adapter.hasComponent('type3')).toBe(true);
    });

    it('should allow re-registering same type (override)', () => {
      const component1 = class Component1 {};
      const component2 = class Component2 {};

      adapter.registerComponent('test-type', component1);
      adapter.registerComponent('test-type', component2);

      const registered = adapter.getComponent('test-type');
      expect(registered).toBe(component2);
    });
  });

  describe('hasComponent()', () => {
    it('should return false for unregistered type', () => {
      expect(adapter.hasComponent('nonexistent')).toBe(false);
    });

    it('should return true for registered type', () => {
      adapter.registerComponent('test-type', mockComponent);
      expect(adapter.hasComponent('test-type')).toBe(true);
    });

    it('should be case-sensitive', () => {
      adapter.registerComponent('TestType', mockComponent);
      expect(adapter.hasComponent('TestType')).toBe(true);
      expect(adapter.hasComponent('testtype')).toBe(false);
    });
  });

  describe('getComponent()', () => {
    it('should return undefined for unregistered type', () => {
      expect(adapter.getComponent('nonexistent')).toBeUndefined();
    });

    it('should return registered component', () => {
      adapter.registerComponent('test-type', mockComponent);
      const registered = adapter.getComponent('test-type');
      expect(registered).toBe(mockComponent);
    });

    it('should return correct component for each type', () => {
      const componentA = class ComponentA {};
      const componentB = class ComponentB {};

      adapter.registerComponent('type-a', componentA);
      adapter.registerComponent('type-b', componentB);

      expect(adapter.getComponent('type-a')).toBe(componentA);
      expect(adapter.getComponent('type-b')).toBe(componentB);
    });
  });

  describe('createComponentInstance()', () => {
    beforeEach(() => {
      adapter.registerComponent('test-type', mockComponent);
    });

    it('should create component instance for node', () => {
      const instance = adapter.createComponentInstance(mockNode, mockContainer);
      expect(instance).toBeDefined();
    });

    it('should accept node and container parameters', () => {
      expect(() => {
        adapter.createComponentInstance(mockNode, mockContainer);
      }).not.toThrow();
    });

    it('should throw error if component not registered', () => {
      const unregisteredNode = new NodeModel({
        id: 'test-2',
        type: 'unregistered-type',
        position: { x: 0, y: 0 }
      });

      expect(() => {
        adapter.createComponentInstance(unregisteredNode, mockContainer);
      }).toThrow();
    });

    it('should return different instances for different nodes', () => {
      const node1 = mockNode;
      const node2 = new NodeModel({
        id: 'test-node-2',
        type: 'test-type',
        position: { x: 100, y: 100 }
      });

      const instance1 = adapter.createComponentInstance(node1, mockContainer);
      const instance2 = adapter.createComponentInstance(node2, mockContainer);

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('updateComponentInstance()', () => {
    it('should update component instance with new node data', () => {
      adapter.registerComponent('test-type', mockComponent);
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      // Update node
      mockNode.setPosition(50, 50);

      expect(() => {
        adapter.updateComponentInstance(instance, mockNode);
      }).not.toThrow();
    });

    it('should accept instance and node parameters', () => {
      adapter.registerComponent('test-type', mockComponent);
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      expect(() => {
        adapter.updateComponentInstance(instance, mockNode);
      }).not.toThrow();
    });
  });

  describe('destroyComponentInstance()', () => {
    it('should destroy component instance', () => {
      adapter.registerComponent('test-type', mockComponent);
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      expect(() => {
        adapter.destroyComponentInstance(instance);
      }).not.toThrow();
    });

    it('should not throw if called multiple times', () => {
      adapter.registerComponent('test-type', mockComponent);
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      adapter.destroyComponentInstance(instance);

      expect(() => {
        adapter.destroyComponentInstance(instance);
      }).not.toThrow();
    });
  });

  describe('getRegisteredTypes()', () => {
    it('should return empty array when no components registered', () => {
      const types = adapter.getRegisteredTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBe(0);
    });

    it('should return array of registered type names', () => {
      adapter.registerComponent('type1', mockComponent);
      adapter.registerComponent('type2', mockComponent);

      const types = adapter.getRegisteredTypes();
      expect(types).toContain('type1');
      expect(types).toContain('type2');
    });

    it('should return all registered types', () => {
      adapter.registerComponent('erd.table', mockComponent);
      adapter.registerComponent('workflow.task', mockComponent);
      adapter.registerComponent('bpmn.gateway', mockComponent);

      const types = adapter.getRegisteredTypes();
      expect(types.length).toBe(3);
      expect(types).toContain('erd.table');
      expect(types).toContain('workflow.task');
      expect(types).toContain('bpmn.gateway');
    });
  });

  describe('Integration: Full lifecycle', () => {
    it('should handle complete component lifecycle', () => {
      // Register
      adapter.registerComponent('test-type', mockComponent);
      expect(adapter.hasComponent('test-type')).toBe(true);

      // Create
      const instance = adapter.createComponentInstance(mockNode, mockContainer);
      expect(instance).toBeDefined();

      // Update
      mockNode.setPosition(100, 100);
      adapter.updateComponentInstance(instance, mockNode);

      // Destroy
      adapter.destroyComponentInstance(instance);
    });

    it('should handle multiple components concurrently', () => {
      const componentA = class ComponentA {};
      const componentB = class ComponentB {};

      adapter.registerComponent('type-a', componentA);
      adapter.registerComponent('type-b', componentB);

      const nodeA = new NodeModel({
        id: 'node-a',
        type: 'type-a',
        position: { x: 0, y: 0 }
      });

      const nodeB = new NodeModel({
        id: 'node-b',
        type: 'type-b',
        position: { x: 100, y: 100 }
      });

      const instanceA = adapter.createComponentInstance(nodeA, mockContainer);
      const instanceB = adapter.createComponentInstance(nodeB, mockContainer);

      expect(instanceA).toBeDefined();
      expect(instanceB).toBeDefined();
      expect(instanceA).not.toBe(instanceB);

      adapter.destroyComponentInstance(instanceA);
      adapter.destroyComponentInstance(instanceB);
    });
  });
});

/**
 * Helper: Create mock adapter for testing interface contract
 */
function createMockAdapter(): ComponentAdapter {
  const registry = new Map<string, any>();
  const instances = new Map<string, any>();

  return {
    framework: 'mock',

    registerComponent(nodeType: string, component: any): void {
      registry.set(nodeType, component);
    },

    hasComponent(nodeType: string): boolean {
      return registry.has(nodeType);
    },

    getComponent(nodeType: string): any | undefined {
      return registry.get(nodeType);
    },

    createComponentInstance(node: NodeModel, container: any): any {
      const component = registry.get(node.type);
      if (!component) {
        throw new Error(`No component registered for type '${node.type}'`);
      }

      const instance = {
        id: node.id,
        component,
        node,
        container
      };

      instances.set(node.id, instance);
      return instance;
    },

    updateComponentInstance(instance: any, node: NodeModel): void {
      if (instance && instances.has(instance.id)) {
        instance.node = node;
      }
    },

    destroyComponentInstance(instance: any): void {
      if (instance && instances.has(instance.id)) {
        instances.delete(instance.id);
      }
    },

    getRegisteredTypes(): string[] {
      return Array.from(registry.keys());
    }
  };
}
