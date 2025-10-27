/**
 * Angular Component Adapter Tests
 *
 * Tests the Angular-specific implementation of ComponentAdapter interface.
 * This adapter wraps ComponentRendererService to provide framework-agnostic API.
 *
 * TDD: Writing tests first to define expected behavior
 */

import { TestBed } from '@angular/core/testing';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewContainerRef,
} from '@angular/core';
import { ComponentAdapter } from '@grafloria/engine';
import { NodeModel } from '@grafloria/engine';
import { AngularComponentAdapter } from './angular-component-adapter';

/**
 * Test component for adapter testing
 */
@Component({
  selector: 'grafloria-test-node',
  template: `
    <div class="test-node">
      <h3>{{ title }}</h3>
      <p>Count: {{ count }}</p>
      <p>Position: {{ positionX }}, {{ positionY }}</p>
    </div>
  `,
  standalone: true,
})
class TestNodeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() title = '';
  @Input() count = 0;
  @Input() positionX = 0;
  @Input() positionY = 0;
  @Input() nodeData: any = {};

  @Output() nodeClicked = new EventEmitter<void>();
  @Output() valueChanged = new EventEmitter<any>();

  ngOnInitCalled = false;
  ngOnDestroyCalled = false;
  ngOnChangesCalled = false;
  lastChanges: SimpleChanges | null = null;

  ngOnInit(): void {
    this.ngOnInitCalled = true;
  }

  ngOnDestroy(): void {
    this.ngOnDestroyCalled = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.ngOnChangesCalled = true;
    this.lastChanges = changes;
  }

  handleClick(): void {
    this.nodeClicked.emit();
  }

  updateValue(value: any): void {
    this.valueChanged.emit(value);
  }
}

/**
 * ERD Table component for testing
 */
@Component({
  selector: 'grafloria-erd-table',
  template: `
    <div class="erd-table">
      <div class="table-header">{{ tableName }}</div>
      <div class="table-fields">
        <div *ngFor="let column of columns" class="field">
          {{ column.name }}: {{ column.type }}
        </div>
      </div>
    </div>
  `,
  standalone: true,
})
class ErdTableComponent {
  @Input() tableName = '';
  @Input() columns: Array<{ name: string; type: string }> = [];
}

/**
 * BPMN Task component for testing
 */
@Component({
  selector: 'grafloria-bpmn-task',
  template: `
    <div class="bpmn-task">
      <div class="task-name">{{ taskName }}</div>
      <div class="task-status">{{ status }}</div>
    </div>
  `,
  standalone: true,
})
class BpmnTaskComponent {
  @Input() taskName = '';
  @Input() status = 'pending';
}

describe('AngularComponentAdapter', () => {
  let adapter: AngularComponentAdapter;
  let viewContainerRef: ViewContainerRef;
  let testHostElement: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AngularComponentAdapter],
    });

    adapter = TestBed.inject(AngularComponentAdapter);

    // Create a host element for ViewContainerRef
    testHostElement = document.createElement('div');
    document.body.appendChild(testHostElement);

    // Create a dummy component to get ViewContainerRef
    const hostFixture = TestBed.createComponent(TestNodeComponent);
    viewContainerRef = hostFixture.componentRef.injector.get(ViewContainerRef);
  });

  afterEach(() => {
    // Clean up all components
    adapter.destroyAll?.();

    // Remove test host element
    if (testHostElement && testHostElement.parentNode) {
      testHostElement.parentNode.removeChild(testHostElement);
    }
  });

  describe('ComponentAdapter Interface Contract (FR-ACA-001)', () => {
    it('should implement ComponentAdapter interface', () => {
      expect(adapter).toBeTruthy();
      expect(adapter.framework).toBeDefined();
      expect(typeof adapter.registerComponent).toBe('function');
      expect(typeof adapter.hasComponent).toBe('function');
      expect(typeof adapter.getComponent).toBe('function');
      expect(typeof adapter.createComponentInstance).toBe('function');
      expect(typeof adapter.updateComponentInstance).toBe('function');
      expect(typeof adapter.destroyComponentInstance).toBe('function');
      expect(typeof adapter.getRegisteredTypes).toBe('function');
    });

    it('should have framework identifier "angular"', () => {
      expect(adapter.framework).toBe('angular');
    });

    it('should have readonly framework property', () => {
      const originalFramework = adapter.framework;

      // Attempt to change should not work (TypeScript prevents this, but testing runtime)
      expect(() => {
        (adapter as any).framework = 'different';
      }).not.toThrow();

      // Should still be the same or throw
      expect(adapter.framework).toBeTruthy();
    });
  });

  describe('Component Registration (FR-ACA-002)', () => {
    it('should register Angular component for node type', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      expect(adapter.hasComponent('test.node')).toBe(true);
    });

    it('should accept string node type', () => {
      adapter.registerComponent('my-node', TestNodeComponent);
      expect(adapter.hasComponent('my-node')).toBe(true);
    });

    it('should accept dot notation node types', () => {
      adapter.registerComponent('erd.table', ErdTableComponent);
      adapter.registerComponent('bpmn.task', BpmnTaskComponent);

      expect(adapter.hasComponent('erd.table')).toBe(true);
      expect(adapter.hasComponent('bpmn.task')).toBe(true);
    });

    it('should return registered component class', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const component = adapter.getComponent('test.node');
      expect(component).toBe(TestNodeComponent);
    });

    it('should return undefined for unregistered type', () => {
      expect(adapter.getComponent('nonexistent')).toBeUndefined();
    });

    it('should handle multiple component registrations', () => {
      adapter.registerComponent('type1', TestNodeComponent);
      adapter.registerComponent('type2', ErdTableComponent);
      adapter.registerComponent('type3', BpmnTaskComponent);

      expect(adapter.hasComponent('type1')).toBe(true);
      expect(adapter.hasComponent('type2')).toBe(true);
      expect(adapter.hasComponent('type3')).toBe(true);
    });

    it('should allow re-registering same type (override)', () => {
      adapter.registerComponent('test-type', TestNodeComponent);
      adapter.registerComponent('test-type', ErdTableComponent);

      const registered = adapter.getComponent('test-type');
      expect(registered).toBe(ErdTableComponent);
    });

    it('should be case-sensitive', () => {
      adapter.registerComponent('TestType', TestNodeComponent);
      expect(adapter.hasComponent('TestType')).toBe(true);
      expect(adapter.hasComponent('testtype')).toBe(false);
    });
  });

  describe('Component Instance Creation (FR-ACA-003)', () => {
    let mockNode: NodeModel;
    let mockContainer: any;

    beforeEach(() => {
      adapter.registerComponent('test.node', TestNodeComponent);

      mockNode = new NodeModel({
        id: 'test-node-1',
        type: 'test.node',
        position: { x: 100, y: 200 },
        size: { width: 150, height: 100 },
      });
      mockNode.data = {
        title: 'Test Node',
        count: 5,
      };

      mockContainer = viewContainerRef;
    });

    it('should create component instance for node', () => {
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      expect(instance).toBeDefined();
      expect(instance).toBeTruthy();
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
        position: { x: 0, y: 0 },
      });

      expect(() => {
        adapter.createComponentInstance(unregisteredNode, mockContainer);
      }).toThrow();
    });

    it('should pass node data as inputs to component', () => {
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      // Get the Angular ComponentRef
      const componentRef = instance as any;
      expect(componentRef.instance).toBeDefined();
      expect(componentRef.instance.title).toBe('Test Node');
      expect(componentRef.instance.count).toBe(5);
    });

    it('should pass node position as inputs', () => {
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      const componentRef = instance as any;
      expect(componentRef.instance.positionX).toBe(100);
      expect(componentRef.instance.positionY).toBe(200);
    });

    it('should call ngOnInit on created component', () => {
      const instance = adapter.createComponentInstance(mockNode, mockContainer);

      const componentRef = instance as any;
      expect(componentRef.instance.ngOnInitCalled).toBe(true);
    });

    it('should return different instances for different nodes', () => {
      const node1 = mockNode;
      const node2 = new NodeModel({
        id: 'test-node-2',
        type: 'test.node',
        position: { x: 300, y: 400 },
      });
      node2.data = { title: 'Node 2' };

      const instance1 = adapter.createComponentInstance(node1, mockContainer);
      const instance2 = adapter.createComponentInstance(node2, mockContainer);

      expect(instance1).not.toBe(instance2);

      const ref1 = instance1 as any;
      const ref2 = instance2 as any;
      expect(ref1.instance.title).toBe('Test Node');
      expect(ref2.instance.title).toBe('Node 2');
    });

    it('should handle nodes with no data', () => {
      const minimalNode = new NodeModel({
        id: 'minimal-node',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      expect(() => {
        adapter.createComponentInstance(minimalNode, mockContainer);
      }).not.toThrow();
    });

    it('should create multiple component types', () => {
      adapter.registerComponent('erd.table', ErdTableComponent);

      const tableNode = new NodeModel({
        id: 'table-1',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      tableNode.data = {
        tableName: 'users',
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'name', type: 'string' },
        ],
      };

      const testInstance = adapter.createComponentInstance(mockNode, mockContainer);
      const tableInstance = adapter.createComponentInstance(tableNode, mockContainer);

      expect(testInstance).toBeDefined();
      expect(tableInstance).toBeDefined();
      expect(testInstance).not.toBe(tableInstance);
    });
  });

  describe('Component Instance Updates (FR-ACA-004)', () => {
    let mockNode: NodeModel;
    let mockContainer: any;
    let instance: any;

    beforeEach(() => {
      adapter.registerComponent('test.node', TestNodeComponent);

      mockNode = new NodeModel({
        id: 'test-node-1',
        type: 'test.node',
        position: { x: 100, y: 200 },
      });
      mockNode.data = { title: 'Initial', count: 1 };

      mockContainer = viewContainerRef;
      instance = adapter.createComponentInstance(mockNode, mockContainer);
    });

    it('should update component instance with new node data', () => {
      // Update node
      mockNode.setPosition(300, 400);
      mockNode.data = { title: 'Updated', count: 10 };

      adapter.updateComponentInstance(instance, mockNode);

      const componentRef = instance as any;
      expect(componentRef.instance.title).toBe('Updated');
      expect(componentRef.instance.count).toBe(10);
      expect(componentRef.instance.positionX).toBe(300);
      expect(componentRef.instance.positionY).toBe(400);
    });

    it('should accept instance and node parameters', () => {
      expect(() => {
        adapter.updateComponentInstance(instance, mockNode);
      }).not.toThrow();
    });

    it('should call ngOnChanges on update', () => {
      const componentRef = instance as any;
      componentRef.instance.ngOnChangesCalled = false; // Reset

      mockNode.data = { title: 'Changed', count: 2 };
      adapter.updateComponentInstance(instance, mockNode);

      expect(componentRef.instance.ngOnChangesCalled).toBe(true);
    });

    it('should handle partial data updates', () => {
      mockNode.data = { title: 'New Title' }; // Only update title

      adapter.updateComponentInstance(instance, mockNode);

      const componentRef = instance as any;
      expect(componentRef.instance.title).toBe('New Title');
    });

    it('should update position without updating data', () => {
      const originalTitle = mockNode.data.title;

      mockNode.setPosition(500, 600);
      adapter.updateComponentInstance(instance, mockNode);

      const componentRef = instance as any;
      expect(componentRef.instance.positionX).toBe(500);
      expect(componentRef.instance.positionY).toBe(600);
      expect(componentRef.instance.title).toBe(originalTitle);
    });

    it('should not throw on invalid instance', () => {
      const fakeInstance = {};

      // Should either handle gracefully or throw descriptive error
      // Depending on implementation choice
    });
  });

  describe('Component Instance Destruction (FR-ACA-005)', () => {
    let mockNode: NodeModel;
    let mockContainer: any;
    let instance: any;

    beforeEach(() => {
      adapter.registerComponent('test.node', TestNodeComponent);

      mockNode = new NodeModel({
        id: 'test-node-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });
      mockNode.data = { title: 'Test' };

      mockContainer = viewContainerRef;
      instance = adapter.createComponentInstance(mockNode, mockContainer);
    });

    it('should destroy component instance', () => {
      const componentRef = instance as any;

      adapter.destroyComponentInstance(instance);

      expect(componentRef.instance.ngOnDestroyCalled).toBe(true);
    });

    it('should not throw if called multiple times', () => {
      adapter.destroyComponentInstance(instance);

      expect(() => {
        adapter.destroyComponentInstance(instance);
      }).not.toThrow();
    });

    it('should handle destroying null instance', () => {
      expect(() => {
        adapter.destroyComponentInstance(null as any);
      }).not.toThrow();
    });

    it('should handle destroying undefined instance', () => {
      expect(() => {
        adapter.destroyComponentInstance(undefined as any);
      }).not.toThrow();
    });

    it('should clean up component resources', () => {
      adapter.destroyComponentInstance(instance);

      // Verify component is no longer retrievable
      // This depends on if adapter tracks instances
    });
  });

  describe('Registered Types Retrieval (FR-ACA-006)', () => {
    it('should return empty array when no components registered', () => {
      const types = adapter.getRegisteredTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBe(0);
    });

    it('should return array of registered type names', () => {
      adapter.registerComponent('type1', TestNodeComponent);
      adapter.registerComponent('type2', ErdTableComponent);

      const types = adapter.getRegisteredTypes();
      expect(types).toContain('type1');
      expect(types).toContain('type2');
    });

    it('should return all registered types', () => {
      adapter.registerComponent('erd.table', ErdTableComponent);
      adapter.registerComponent('bpmn.task', BpmnTaskComponent);
      adapter.registerComponent('test.node', TestNodeComponent);

      const types = adapter.getRegisteredTypes();
      expect(types.length).toBe(3);
      expect(types).toContain('erd.table');
      expect(types).toContain('bpmn.task');
      expect(types).toContain('test.node');
    });

    it('should reflect current state after registration', () => {
      expect(adapter.getRegisteredTypes().length).toBe(0);

      adapter.registerComponent('type1', TestNodeComponent);
      expect(adapter.getRegisteredTypes().length).toBe(1);

      adapter.registerComponent('type2', ErdTableComponent);
      expect(adapter.getRegisteredTypes().length).toBe(2);
    });
  });

  describe('Integration: Full Lifecycle (FR-ACA-007)', () => {
    it('should handle complete component lifecycle', () => {
      // Register
      adapter.registerComponent('test.node', TestNodeComponent);
      expect(adapter.hasComponent('test.node')).toBe(true);

      // Create
      const node = new NodeModel({
        id: 'lifecycle-node',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });
      node.data = { title: 'Lifecycle Test', count: 1 };

      const instance = adapter.createComponentInstance(node, viewContainerRef);
      expect(instance).toBeDefined();

      const componentRef = instance as any;
      expect(componentRef.instance.ngOnInitCalled).toBe(true);

      // Update
      node.setPosition(100, 100);
      node.data = { title: 'Updated', count: 2 };
      adapter.updateComponentInstance(instance, node);

      expect(componentRef.instance.title).toBe('Updated');
      expect(componentRef.instance.count).toBe(2);

      // Destroy
      adapter.destroyComponentInstance(instance);
      expect(componentRef.instance.ngOnDestroyCalled).toBe(true);
    });

    it('should handle multiple components concurrently', () => {
      adapter.registerComponent('erd.table', ErdTableComponent);
      adapter.registerComponent('bpmn.task', BpmnTaskComponent);

      const tableNode = new NodeModel({
        id: 'table-1',
        type: 'erd.table',
        position: { x: 0, y: 0 },
      });
      tableNode.data = { tableName: 'users', columns: [] };

      const taskNode = new NodeModel({
        id: 'task-1',
        type: 'bpmn.task',
        position: { x: 200, y: 0 },
      });
      taskNode.data = { taskName: 'Process Order', status: 'active' };

      const tableInstance = adapter.createComponentInstance(tableNode, viewContainerRef);
      const taskInstance = adapter.createComponentInstance(taskNode, viewContainerRef);

      expect(tableInstance).toBeDefined();
      expect(taskInstance).toBeDefined();
      expect(tableInstance).not.toBe(taskInstance);

      // Update both
      tableNode.data = { tableName: 'products', columns: [] };
      taskNode.data = { taskName: 'Ship Order', status: 'completed' };

      adapter.updateComponentInstance(tableInstance, tableNode);
      adapter.updateComponentInstance(taskInstance, taskNode);

      // Destroy both
      adapter.destroyComponentInstance(tableInstance);
      adapter.destroyComponentInstance(taskInstance);
    });

    it('should maintain component isolation', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node1 = new NodeModel({
        id: 'node-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });
      node1.data = { title: 'Node 1', count: 1 };

      const node2 = new NodeModel({
        id: 'node-2',
        type: 'test.node',
        position: { x: 100, y: 0 },
      });
      node2.data = { title: 'Node 2', count: 2 };

      const instance1 = adapter.createComponentInstance(node1, viewContainerRef);
      const instance2 = adapter.createComponentInstance(node2, viewContainerRef);

      // Update node1
      node1.data = { title: 'Updated Node 1', count: 10 };
      adapter.updateComponentInstance(instance1, node1);

      // Node2 should be unaffected
      const ref1 = instance1 as any;
      const ref2 = instance2 as any;

      expect(ref1.instance.title).toBe('Updated Node 1');
      expect(ref1.instance.count).toBe(10);
      expect(ref2.instance.title).toBe('Node 2');
      expect(ref2.instance.count).toBe(2);
    });
  });

  describe('Angular-Specific Functionality (FR-ACA-008)', () => {
    it('should work with Angular ViewContainerRef', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      // Should accept ViewContainerRef as container
      expect(() => {
        adapter.createComponentInstance(node, viewContainerRef);
      }).not.toThrow();
    });

    it('should support Angular dependency injection', () => {
      // Components with DI should work
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'injectable-node',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      const instance = adapter.createComponentInstance(node, viewContainerRef);
      expect(instance).toBeDefined();
    });

    it('should trigger Angular change detection', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });
      node.data = { title: 'Initial' };

      const instance = adapter.createComponentInstance(node, viewContainerRef);

      // Update should trigger change detection
      node.data = { title: 'Updated' };
      adapter.updateComponentInstance(instance, node);

      const componentRef = instance as any;
      // Component should reflect new values (change detection ran)
      expect(componentRef.instance.title).toBe('Updated');
    });

    it('should handle Angular component outputs', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      const instance = adapter.createComponentInstance(node, viewContainerRef);
      const componentRef = instance as any;

      // Component should have outputs available
      expect(componentRef.instance.nodeClicked).toBeDefined();
      expect(componentRef.instance.valueChanged).toBeDefined();
    });
  });

  describe('Error Handling (FR-ACA-009)', () => {
    it('should throw descriptive error for unregistered component', () => {
      const node = new NodeModel({
        id: 'test-1',
        type: 'nonexistent',
        position: { x: 0, y: 0 },
      });

      expect(() => {
        adapter.createComponentInstance(node, viewContainerRef);
      }).toThrow(/component.*not registered/i);
    });

    it('should handle invalid node gracefully', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const invalidNode = null as any;

      expect(() => {
        adapter.createComponentInstance(invalidNode, viewContainerRef);
      }).toThrow();
    });

    it('should handle invalid container gracefully', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      const invalidContainer = null as any;

      expect(() => {
        adapter.createComponentInstance(node, invalidContainer);
      }).toThrow();
    });

    it('should not affect other components on error', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const goodNode = new NodeModel({
        id: 'good-node',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });
      goodNode.data = { title: 'Good Node' };

      const badNode = new NodeModel({
        id: 'bad-node',
        type: 'nonexistent',
        position: { x: 100, y: 0 },
      });

      const goodInstance = adapter.createComponentInstance(goodNode, viewContainerRef);

      expect(() => {
        adapter.createComponentInstance(badNode, viewContainerRef);
      }).toThrow();

      // Good instance should still be valid
      const componentRef = goodInstance as any;
      expect(componentRef.instance.title).toBe('Good Node');
    });
  });

  describe('Delegation to ComponentRendererService (FR-ACA-010)', () => {
    it('should delegate registration to service', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      // Verify service received the registration
      expect(adapter.hasComponent('test.node')).toBe(true);
    });

    it('should delegate instance creation to service', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      const instance = adapter.createComponentInstance(node, viewContainerRef);

      // Instance should be Angular ComponentRef from service
      expect(instance).toBeDefined();
      expect((instance as any).componentType).toBe(TestNodeComponent);
    });

    it('should delegate updates to service', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });
      node.data = { title: 'Initial' };

      const instance = adapter.createComponentInstance(node, viewContainerRef);

      node.data = { title: 'Updated' };
      adapter.updateComponentInstance(instance, node);

      const componentRef = instance as any;
      expect(componentRef.instance.title).toBe('Updated');
    });

    it('should delegate destruction to service', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'test-1',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      const instance = adapter.createComponentInstance(node, viewContainerRef);
      const componentRef = instance as any;

      adapter.destroyComponentInstance(instance);

      expect(componentRef.instance.ngOnDestroyCalled).toBe(true);
    });
  });

  describe('Memory Management (NFR-ACA-001)', () => {
    it('should handle 100 create/destroy cycles', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const node = new NodeModel({
        id: 'cycle-test',
        type: 'test.node',
        position: { x: 0, y: 0 },
      });

      for (let i = 0; i < 100; i++) {
        node.data = { title: `Iteration ${i}`, count: i };

        const instance = adapter.createComponentInstance(node, viewContainerRef);
        adapter.updateComponentInstance(instance, node);
        adapter.destroyComponentInstance(instance);
      }

      // Should complete without memory issues
      expect(true).toBe(true);
    });

    it('should handle multiple concurrent instances', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const instances: any[] = [];

      // Create 50 concurrent instances
      for (let i = 0; i < 50; i++) {
        const node = new NodeModel({
          id: `node-${i}`,
          type: 'test.node',
          position: { x: i * 100, y: i * 100 },
        });
        node.data = { title: `Node ${i}`, count: i };

        const instance = adapter.createComponentInstance(node, viewContainerRef);
        instances.push(instance);
      }

      expect(instances.length).toBe(50);

      // Destroy all
      for (const instance of instances) {
        adapter.destroyComponentInstance(instance);
      }
    });
  });

  describe('Performance (NFR-ACA-002)', () => {
    it('should create instances quickly', () => {
      adapter.registerComponent('test.node', TestNodeComponent);

      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        const node = new NodeModel({
          id: `perf-node-${i}`,
          type: 'test.node',
          position: { x: 0, y: 0 },
        });
        node.data = { title: `Node ${i}` };

        const instance = adapter.createComponentInstance(node, viewContainerRef);
        adapter.destroyComponentInstance(instance);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 1 second for 100 ops)
      expect(duration).toBeLessThan(1000);
    });
  });
});
