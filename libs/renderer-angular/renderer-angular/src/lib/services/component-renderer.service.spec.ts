import { TestBed } from '@angular/core/testing';
import {
  Component,
  EventEmitter,
  Injectable,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChange,
  SimpleChanges,
  ViewContainerRef,
} from '@angular/core';
import { ComponentRendererService } from './component-renderer.service';
import type { VNode } from '@grafloria/renderer';

/**
 * Test component with inputs, outputs, and lifecycle hooks
 */
@Component({
  selector: 'grafloria-test-component',
  template: '<div class="test-component">{{ title }} - {{ count }}</div>',
  standalone: true,
})
class TestComponent implements OnInit, OnDestroy, OnChanges {
  @Input() title = '';
  @Input() count = 0;
  @Output() titleChanged = new EventEmitter<string>();
  @Output() countChanged = new EventEmitter<number>();

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

  updateTitle(newTitle: string): void {
    this.title = newTitle;
    this.titleChanged.emit(newTitle);
  }

  incrementCount(): void {
    this.count++;
    this.countChanged.emit(this.count);
  }
}

/**
 * Component that throws error in ngOnInit
 */
@Component({
  selector: 'grafloria-error-component',
  template: '<div>Error Component</div>',
  standalone: true,
})
class ErrorComponent implements OnInit {
  ngOnInit(): void {
    throw new Error('Component initialization failed');
  }
}

/**
 * Test service for DI testing
 */
@Injectable({ providedIn: 'root' })
class TestService {
  getValue(): string {
    return 'test-value';
  }
}

/**
 * Component with service injection
 */
@Component({
  selector: 'grafloria-injectable-component',
  template: '<div>{{ value }}</div>',
  standalone: true,
})
class InjectableComponent {
  value: string;

  constructor(private testService: TestService) {
    this.value = testService.getValue();
  }
}

/**
 * Mock DiagramNode for testing
 */
interface DiagramNode {
  id: string;
  type: string;
  getMetadata?: () => Record<string, any>;
}

describe('ComponentRendererService', () => {
  let service: ComponentRendererService;
  let viewContainerRef: ViewContainerRef;
  let testHostElement: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ComponentRendererService, TestService],
    });

    service = TestBed.inject(ComponentRendererService);

    // Create a host element for ViewContainerRef
    testHostElement = document.createElement('div');
    document.body.appendChild(testHostElement);

    // Create a dummy component to get ViewContainerRef
    const hostFixture = TestBed.createComponent(TestComponent);
    viewContainerRef = hostFixture.componentRef.injector.get(ViewContainerRef);
  });

  afterEach(() => {
    // Clean up all components
    service.destroyAll();

    // Remove test host element
    if (testHostElement && testHostElement.parentNode) {
      testHostElement.parentNode.removeChild(testHostElement);
    }
  });

  describe('Component Registration (FR-CRS-001)', () => {
    it('should register component', () => {
      service.registerComponent('TEST', TestComponent);

      expect(service.hasComponent('TEST')).toBe(true);
      expect(service.getRegisteredComponent('TEST')).toBe(TestComponent);
    });

    it('should throw on duplicate registration', () => {
      service.registerComponent('TEST', TestComponent);

      expect(() => service.registerComponent('TEST', TestComponent)).toThrow(
        "Component for type 'TEST' is already registered"
      );
    });

    it('should return null for unregistered type', () => {
      expect(service.getRegisteredComponent('UNKNOWN')).toBeNull();
    });

    it('should return false for hasComponent on unregistered type', () => {
      expect(service.hasComponent('UNKNOWN')).toBe(false);
    });

    it('should register multiple different types', () => {
      service.registerComponent('TEST1', TestComponent);
      service.registerComponent('TEST2', ErrorComponent);

      expect(service.hasComponent('TEST1')).toBe(true);
      expect(service.hasComponent('TEST2')).toBe(true);
      expect(service.getRegisteredComponent('TEST1')).toBe(TestComponent);
      expect(service.getRegisteredComponent('TEST2')).toBe(ErrorComponent);
    });
  });

  describe('Component Rendering (FR-CRS-002)', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerComponent('TEST', TestComponent);

      node = {
        id: 'node-1',
        type: 'TEST',
        getMetadata: () => ({ title: 'Test Node', count: 5 }),
      };
    });

    it('should render component', () => {
      const componentRef = service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Test Node', count: 5 },
      });

      expect(componentRef).toBeTruthy();
      expect(componentRef.instance).toBeInstanceOf(TestComponent);
      expect(componentRef.instance.title).toBe('Test Node');
      expect(componentRef.instance.count).toBe(5);
    });

    it('should throw if component not registered', () => {
      node.type = 'UNKNOWN';

      expect(() => service.renderComponent(node, viewContainerRef)).toThrow(
        "No component registered for type 'UNKNOWN'"
      );
    });

    it('should call ngOnInit on render', () => {
      const componentRef = service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Test' },
      });

      expect(componentRef.instance.ngOnInitCalled).toBe(true);
    });

    it('should store component instance', () => {
      service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Test' },
      });

      const instance = service.getComponent(node.id);
      expect(instance).toBeTruthy();
      expect(instance!.instance.title).toBe('Test');
    });

    it('should generate container ID', () => {
      service.renderComponent(node, viewContainerRef);

      const containerId = service.getContainerId(node.id);
      expect(containerId).toBeTruthy();
      expect(containerId).toMatch(/^fo-node-1-\d+$/);
    });

    it('should inject services correctly', () => {
      service.registerComponent('INJECTABLE', InjectableComponent);
      const injectableNode: DiagramNode = {
        id: 'node-2',
        type: 'INJECTABLE',
      };

      const componentRef = service.renderComponent(
        injectableNode,
        viewContainerRef
      );

      expect(componentRef.instance.value).toBe('test-value');
    });

    it('should create multiple components without conflict', () => {
      const node2: DiagramNode = {
        id: 'node-2',
        type: 'TEST',
      };

      const ref1 = service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Node 1' },
      });
      const ref2 = service.renderComponent(node2, viewContainerRef, {
        inputs: { title: 'Node 2' },
      });

      expect(ref1.instance.title).toBe('Node 1');
      expect(ref2.instance.title).toBe('Node 2');
      expect(service.getActiveCount()).toBe(2);
    });
  });

  describe('Component Updates (FR-CRS-004)', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerComponent('TEST', TestComponent);

      node = {
        id: 'node-1',
        type: 'TEST',
        getMetadata: () => ({}),
      };

      service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Initial', count: 1 },
      });
    });

    it('should update component inputs', () => {
      service.updateComponent(node.id, { title: 'Updated', count: 2 });

      const componentRef = service.getComponent(node.id)!;
      expect(componentRef.instance.title).toBe('Updated');
      expect(componentRef.instance.count).toBe(2);
    });

    it('should call ngOnChanges on update', () => {
      const componentRef = service.getComponent(node.id)!;
      componentRef.instance.ngOnChangesCalled = false; // Reset

      service.updateComponent(node.id, { title: 'Updated' });

      expect(componentRef.instance.ngOnChangesCalled).toBe(true);
      expect(componentRef.instance.lastChanges).toBeTruthy();
      expect(componentRef.instance.lastChanges!['title']).toBeTruthy();
    });

    it('should only include changed inputs in SimpleChanges', () => {
      const componentRef = service.getComponent(node.id)!;
      service.updateComponent(node.id, { title: 'Updated', count: 1 }); // count unchanged

      const changes = componentRef.instance.lastChanges!;
      expect(changes['title']).toBeTruthy();
      expect(changes['title'].previousValue).toBe('Initial');
      expect(changes['title'].currentValue).toBe('Updated');
      // count should not be in changes if it didn't change
    });

    it('should throw when updating non-existent component', () => {
      expect(() =>
        service.updateComponent('nonexistent', { title: 'Test' })
      ).toThrow('Component for node nonexistent not found');
    });

    it('should support partial updates', () => {
      service.updateComponent(node.id, { title: 'New Title' }); // Only update title

      const componentRef = service.getComponent(node.id)!;
      expect(componentRef.instance.title).toBe('New Title');
      expect(componentRef.instance.count).toBe(1); // Should remain unchanged
    });
  });

  describe('Component Destruction (FR-CRS-003)', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerComponent('TEST', TestComponent);

      node = {
        id: 'node-1',
        type: 'TEST',
        getMetadata: () => ({}),
      };

      service.renderComponent(node, viewContainerRef);
    });

    it('should destroy component', () => {
      const componentRef = service.getComponent(node.id)!;

      service.destroyComponent(node.id);

      expect(componentRef.instance.ngOnDestroyCalled).toBe(true);
      expect(service.getComponent(node.id)).toBeNull();
      expect(service.getContainerId(node.id)).toBeNull();
    });

    it('should handle destroying non-existent component', () => {
      expect(() => service.destroyComponent('nonexistent')).not.toThrow();
    });

    it('should destroy all components', () => {
      const node2: DiagramNode = { id: 'node-2', type: 'TEST' };
      service.renderComponent(node2, viewContainerRef);

      expect(service.getActiveCount()).toBe(2);

      service.destroyAll();

      expect(service.getActiveCount()).toBe(0);
      expect(service.getComponent(node.id)).toBeNull();
      expect(service.getComponent(node2.id)).toBeNull();
    });

    it('should call ngOnDestroy for all components', () => {
      const ref1 = service.getComponent(node.id)!;
      const node2: DiagramNode = { id: 'node-2', type: 'TEST' };
      const ref2 = service.renderComponent(node2, viewContainerRef);

      service.destroyAll();

      expect(ref1.instance.ngOnDestroyCalled).toBe(true);
      expect(ref2.instance.ngOnDestroyCalled).toBe(true);
    });
  });

  describe('Output Handling (FR-CRS-005)', () => {
    let node: DiagramNode;

    beforeEach(() => {
      service.registerComponent('TEST', TestComponent);

      node = {
        id: 'node-1',
        type: 'TEST',
        getMetadata: () => ({}),
      };
    });

    it('should subscribe to outputs', (done) => {
      const componentRef = service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Test' },
        outputHandlers: {
          titleChanged: (newTitle: string) => {
            expect(newTitle).toBe('Updated');
            done();
          },
        },
      });

      componentRef.instance.updateTitle('Updated');
    });

    it('should handle multiple outputs', (done) => {
      let titleChangedCalled = false;
      let countChangedCalled = false;

      const componentRef = service.renderComponent(node, viewContainerRef, {
        outputHandlers: {
          titleChanged: (title: string) => {
            titleChangedCalled = true;
            expect(title).toBe('New Title');
            checkBothCalled();
          },
          countChanged: (count: number) => {
            countChangedCalled = true;
            expect(count).toBe(1);
            checkBothCalled();
          },
        },
      });

      function checkBothCalled() {
        if (titleChangedCalled && countChangedCalled) {
          done();
        }
      }

      componentRef.instance.updateTitle('New Title');
      componentRef.instance.incrementCount();
    });

    it('should unsubscribe on destroy', () => {
      let emitCount = 0;

      const componentRef = service.renderComponent(node, viewContainerRef, {
        outputHandlers: {
          titleChanged: () => emitCount++,
        },
      });

      componentRef.instance.updateTitle('First');
      expect(emitCount).toBe(1);

      service.destroyComponent(node.id);

      // This should not trigger handler (unsubscribed)
      componentRef.instance.updateTitle('Second');
      expect(emitCount).toBe(1);
    });
  });

  describe('Batch Operations (FR-CRS-008)', () => {
    let nodes: DiagramNode[];

    beforeEach(() => {
      service.registerComponent('TEST', TestComponent);

      nodes = [
        { id: 'node-1', type: 'TEST' },
        { id: 'node-2', type: 'TEST' },
        { id: 'node-3', type: 'TEST' },
      ];

      for (const node of nodes) {
        service.renderComponent(node, viewContainerRef, {
          inputs: { title: 'Initial', count: 0 },
        });
      }
    });

    it('should batch update multiple components', () => {
      service.batchUpdate([
        { nodeId: 'node-1', inputs: { title: 'Updated 1', count: 1 } },
        { nodeId: 'node-2', inputs: { title: 'Updated 2', count: 2 } },
        { nodeId: 'node-3', inputs: { title: 'Updated 3', count: 3 } },
      ]);

      expect(service.getComponent('node-1')!.instance.title).toBe('Updated 1');
      expect(service.getComponent('node-2')!.instance.count).toBe(2);
      expect(service.getComponent('node-3')!.instance.title).toBe('Updated 3');
    });

    it('should skip non-existent components in batch', () => {
      expect(() =>
        service.batchUpdate([
          { nodeId: 'node-1', inputs: { title: 'Updated' } },
          { nodeId: 'nonexistent', inputs: { title: 'Test' } },
          { nodeId: 'node-2', inputs: { title: 'Updated' } },
        ])
      ).not.toThrow();

      expect(service.getComponent('node-1')!.instance.title).toBe('Updated');
      expect(service.getComponent('node-2')!.instance.title).toBe('Updated');
    });
  });

  describe('ForeignObject VNode (FR-CRS-006)', () => {
    let node: DiagramNode;

    beforeEach(() => {
      node = {
        id: 'node-1',
        type: 'TEST',
      };
    });

    it('should create foreignObject VNode', () => {
      const vnode = service.createForeignObjectVNode(node, {
        x: 100,
        y: 200,
        width: 300,
        height: 150,
      });

      expect(vnode.type).toBe('foreignObject');
      expect(vnode.props?.x).toBe(100);
      expect(vnode.props?.y).toBe(200);
      expect(vnode.props?.width).toBe(300);
      expect(vnode.props?.height).toBe(150);
      expect(vnode.props?.containerId).toMatch(/^fo-node-1-\d+$/);
    });

    it('should include container div in children', () => {
      const vnode = service.createForeignObjectVNode(node, {
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      });

      expect(vnode.children).toBeTruthy();
      expect(vnode.children!.length).toBeGreaterThan(0);
      expect(vnode.children![0].type).toBe('div');
      expect(vnode.children![0].props?.['class']).toBe(
        'diagram-component-container'
      );
    });

    it('should store container ID for retrieval', () => {
      const vnode = service.createForeignObjectVNode(node, {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });

      const containerId = service.getContainerId(node.id);
      expect(containerId).toBe(vnode.props?.containerId);
    });
  });

  describe('Component Retrieval (FR-CRS-009)', () => {
    beforeEach(() => {
      service.registerComponent('TEST', TestComponent);
    });

    it('should get existing component', () => {
      const node: DiagramNode = { id: 'node-1', type: 'TEST' };
      const renderedRef = service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Test' },
      });

      const retrievedRef = service.getComponent<TestComponent>(node.id);

      expect(retrievedRef).toBe(renderedRef);
      expect(retrievedRef!.instance.title).toBe('Test');
    });

    it('should return null for non-existent node', () => {
      const ref = service.getComponent('nonexistent');
      expect(ref).toBeNull();
    });

    it('should allow calling component methods', () => {
      const node: DiagramNode = { id: 'node-1', type: 'TEST' };
      service.renderComponent(node, viewContainerRef, {
        inputs: { title: 'Initial', count: 0 },
      });

      const ref = service.getComponent<TestComponent>(node.id);
      ref!.instance.incrementCount();

      expect(ref!.instance.count).toBe(1);
    });

    it('should get active count', () => {
      expect(service.getActiveCount()).toBe(0);

      const node1: DiagramNode = { id: 'node-1', type: 'TEST' };
      const node2: DiagramNode = { id: 'node-2', type: 'TEST' };

      service.renderComponent(node1, viewContainerRef);
      expect(service.getActiveCount()).toBe(1);

      service.renderComponent(node2, viewContainerRef);
      expect(service.getActiveCount()).toBe(2);

      service.destroyComponent(node1.id);
      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('Error Handling (FR-CRS-010)', () => {
    it('should handle component instantiation error', () => {
      service.registerComponent('ERROR', ErrorComponent);

      const node: DiagramNode = { id: 'node-1', type: 'ERROR' };

      expect(() => service.renderComponent(node, viewContainerRef)).toThrow(
        /Component instantiation failed/
      );
    });

    it('should not affect other components on error', () => {
      service.registerComponent('TEST', TestComponent);
      service.registerComponent('ERROR', ErrorComponent);

      const goodNode: DiagramNode = { id: 'node-1', type: 'TEST' };
      const badNode: DiagramNode = { id: 'node-2', type: 'ERROR' };

      service.renderComponent(goodNode, viewContainerRef, {
        inputs: { title: 'Good' },
      });

      expect(() =>
        service.renderComponent(badNode, viewContainerRef)
      ).toThrow();

      // Good component should still exist
      const ref = service.getComponent(goodNode.id);
      expect(ref).toBeTruthy();
      expect(ref!.instance.title).toBe('Good');
    });
  });

  describe('Memory Leak Tests (NFR-CRS-002)', () => {
    it('should handle 1000 create/destroy cycles without memory leaks', () => {
      service.registerComponent('TEST', TestComponent);

      const node: DiagramNode = { id: 'node-test', type: 'TEST' };

      // Run 1000 cycles
      for (let i = 0; i < 1000; i++) {
        service.renderComponent(node, viewContainerRef, {
          inputs: { title: `Iteration ${i}`, count: i },
        });

        service.destroyComponent(node.id);
      }

      // Verify no components remain
      expect(service.getActiveCount()).toBe(0);
      expect(service.getComponent(node.id)).toBeNull();
    });

    it('should clean up all references on destroyAll', () => {
      service.registerComponent('TEST', TestComponent);

      // Create many components
      for (let i = 0; i < 100; i++) {
        const node: DiagramNode = { id: `node-${i}`, type: 'TEST' };
        service.renderComponent(node, viewContainerRef);
      }

      expect(service.getActiveCount()).toBe(100);

      service.destroyAll();

      expect(service.getActiveCount()).toBe(0);
    });
  });
});
