import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewContainerRef } from '@angular/core';
import { NodeToolbarComponent, NodeToolbarService, AutoToolbarDirective, createStandardActions } from './index';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { DiagramCanvasComponent } from '../../components/diagram-canvas.component';

/**
 * E2E Integration Tests for NodeToolbar
 *
 * These tests verify the complete toolbar workflow including:
 * - Auto show/hide on node selection
 * - Position updates on zoom/pan
 * - Action execution
 * - Keyboard navigation
 * - Multiple toolbars
 */

@Component({
  template: `
    <div
      grafloriaAutoToolbar
      [engine]="engine"
      [viewport]="viewport"
      [zoom]="zoom"
      [toolbarActions]="actions"
      style="width: 800px; height: 600px; position: relative;">
      <div class="diagram-canvas" style="width: 100%; height: 100%;"></div>
    </div>
  `,
  standalone: true,
  imports: [AutoToolbarDirective],
})
class TestHostComponent {
  engine!: DiagramEngine;
  viewport = { x: 0, y: 0, width: 800, height: 600 };
  zoom = 1.0;
  actions: any[] = [];

  constructor(public vcr: ViewContainerRef) {}
}

describe('NodeToolbar Integration Tests', () => {
  let component: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let toolbarService: NodeToolbarService;
  let engine: DiagramEngine;
  let node1: NodeModel;
  let node2: NodeModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, AutoToolbarDirective, NodeToolbarComponent],
      providers: [NodeToolbarService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    component = fixture.componentInstance;
    toolbarService = TestBed.inject(NodeToolbarService);

    // Create engine and model
    engine = new DiagramEngine();
    component.engine = engine;

    const model = engine.getDiagram();
    if (model) {
      node1 = model.addNode({
        type: 'default',
        data: { label: 'Node 1' },
        position: { x: 100, y: 100 },
        size: { width: 150, height: 50 },
      });

      node2 = model.addNode({
        type: 'default',
        data: { label: 'Node 2' },
        position: { x: 300, y: 100 },
        size: { width: 150, height: 50 },
      });
    }

    component.actions = createStandardActions(engine);

    fixture.detectChanges();
  });

  afterEach(() => {
    toolbarService.hideAll();
  });

  describe('Auto Show/Hide', () => {
    it('should show toolbar when node is selected', (done) => {
      expect(toolbarService.isShown(node1.id)).toBe(false);

      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        expect(toolbarService.isShown(node1.id)).toBe(true);
        done();
      }, 100);
    });

    it('should hide toolbar when node is deselected', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        expect(toolbarService.isShown(node1.id)).toBe(true);

        engine.eventBus.emit('node:deselected', { node: node1 });

        setTimeout(() => {
          expect(toolbarService.isShown(node1.id)).toBe(false);
          done();
        }, 100);
      }, 100);
    });

    it('should show multiple toolbars for multiple selected nodes', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });
      engine.eventBus.emit('node:selected', { node: node2 });

      setTimeout(() => {
        expect(toolbarService.isShown(node1.id)).toBe(true);
        expect(toolbarService.isShown(node2.id)).toBe(true);
        expect(toolbarService.getCount()).toBe(2);
        done();
      }, 100);
    });
  });

  describe('Multi-Selection Handling (Phase 1: ReactFlow Parity)', () => {
    it('should hide toolbar when multiple nodes are selected (default behavior)', (done) => {
      // Create toolbar for node1 with default config (hideOnMultiSelect: true)
      const toolbarRef = toolbarService.show(node1, engine);

      setTimeout(() => {
        // Initially, only node1 is selected, toolbar should be visible
        engine.store.set('selectedNodes', new Set([node1.id]));

        setTimeout(() => {
          expect(toolbarRef.instance.isVisible).toBe(true);

          // Select multiple nodes
          engine.store.set('selectedNodes', new Set([node1.id, node2.id]));

          setTimeout(() => {
            // Toolbar should now be hidden due to multi-selection
            expect(toolbarRef.instance.isVisible).toBe(false);
            done();
          }, 50);
        }, 50);
      }, 50);
    });

    it('should show toolbar when only one node is selected again', (done) => {
      const toolbarRef = toolbarService.show(node1, engine);

      setTimeout(() => {
        // Select multiple nodes first
        engine.store.set('selectedNodes', new Set([node1.id, node2.id]));

        setTimeout(() => {
          expect(toolbarRef.instance.isVisible).toBe(false);

          // Deselect node2, leaving only node1 selected
          engine.store.set('selectedNodes', new Set([node1.id]));

          setTimeout(() => {
            // Toolbar should now be visible again
            expect(toolbarRef.instance.isVisible).toBe(true);
            done();
          }, 50);
        }, 50);
      }, 50);
    });

    it('should hide toolbar when node is deselected', (done) => {
      const toolbarRef = toolbarService.show(node1, engine);

      setTimeout(() => {
        // Select node1
        engine.store.set('selectedNodes', new Set([node1.id]));

        setTimeout(() => {
          expect(toolbarRef.instance.isVisible).toBe(true);

          // Deselect all nodes
          engine.store.set('selectedNodes', new Set());

          setTimeout(() => {
            expect(toolbarRef.instance.isVisible).toBe(false);
            done();
          }, 50);
        }, 50);
      }, 50);
    });

    it('should allow disabling multi-selection auto-hide via config', (done) => {
      const toolbarRef = toolbarService.show(node1, engine, {
        behavior: {
          hideOnMultiSelect: false // Disable auto-hide
        }
      });

      setTimeout(() => {
        // Select node1
        engine.store.set('selectedNodes', new Set([node1.id]));

        setTimeout(() => {
          expect(toolbarRef.instance.isVisible).toBe(true);

          // Select multiple nodes
          engine.store.set('selectedNodes', new Set([node1.id, node2.id]));

          setTimeout(() => {
            // Toolbar should still be visible because hideOnMultiSelect is false
            expect(toolbarRef.instance.isVisible).toBe(true);
            done();
          }, 50);
        }, 50);
      }, 50);
    });

    it('should handle rapid selection changes gracefully', (done) => {
      const toolbarRef = toolbarService.show(node1, engine);

      setTimeout(() => {
        // Rapid selection changes
        engine.store.set('selectedNodes', new Set([node1.id]));
        engine.store.set('selectedNodes', new Set([node1.id, node2.id]));
        engine.store.set('selectedNodes', new Set([node1.id]));
        engine.store.set('selectedNodes', new Set([node1.id, node2.id]));
        engine.store.set('selectedNodes', new Set([node1.id]));

        setTimeout(() => {
          // Final state: only node1 selected, toolbar should be visible
          expect(toolbarRef.instance.isVisible).toBe(true);
          done();
        }, 100);
      }, 50);
    });

    it('should properly clean up selection subscription on destroy', (done) => {
      const toolbarRef = toolbarService.show(node1, engine);

      setTimeout(() => {
        // Verify toolbar is created
        expect(toolbarRef).toBeDefined();

        // Destroy toolbar
        toolbarService.hide(node1.id);

        setTimeout(() => {
          // Change selection - should not cause errors
          expect(() => {
            engine.store.set('selectedNodes', new Set([node1.id, node2.id]));
          }).not.toThrow();

          done();
        }, 50);
      }, 50);
    });

    it('should work correctly with 3+ nodes selected', (done) => {
      const model = engine.getDiagram();
      if (!model) {
        done();
        return;
      }

      // Create a third node
      const node3 = model.addNode({
        type: 'default',
        data: { label: 'Node 3' },
        position: { x: 500, y: 100 },
        size: { width: 150, height: 50 },
      });

      const toolbarRef = toolbarService.show(node1, engine);

      setTimeout(() => {
        // Select all three nodes
        engine.store.set('selectedNodes', new Set([node1.id, node2.id, node3.id]));

        setTimeout(() => {
          // Toolbar should be hidden
          expect(toolbarRef.instance.isVisible).toBe(false);

          // Select only node1
          engine.store.set('selectedNodes', new Set([node1.id]));

          setTimeout(() => {
            // Toolbar should be visible
            expect(toolbarRef.instance.isVisible).toBe(true);
            done();
          }, 50);
        }, 50);
      }, 50);
    });
  });

  describe('Position Updates', () => {
    it('should update position when node is moved', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        expect(toolbar).toBeDefined();

        const initialTransform = toolbar!.instance.transform;

        // Move node
        node1.position.x = 200;
        node1.position.y = 200;
        engine.eventBus.emit('node:moved', { node: node1 });

        setTimeout(() => {
          const newTransform = toolbar!.instance.transform;
          expect(newTransform).not.toBe(initialTransform);
          done();
        }, 100);
      }, 100);
    });

    it('should update position when zoom changes', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const initialTransform = toolbar!.instance.transform;

        // Change zoom
        component.zoom = 1.5;
        engine.eventBus.emit('canvas:zoom', { zoom: 1.5 });

        setTimeout(() => {
          const newTransform = toolbar!.instance.transform;
          expect(newTransform).not.toBe(initialTransform);
          done();
        }, 100);
      }, 100);
    });

    it('should update position when canvas is panned', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const initialTransform = toolbar!.instance.transform;

        // Pan canvas
        component.viewport = { x: 50, y: 50, width: 800, height: 600 };
        engine.eventBus.emit('canvas:pan', { viewport: component.viewport });

        setTimeout(() => {
          const newTransform = toolbar!.instance.transform;
          expect(newTransform).not.toBe(initialTransform);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('Actions', () => {
    it('should execute delete action', (done) => {
      const model = engine.getDiagram();
      expect(model?.getNodes().length).toBe(2);

      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const deleteAction = toolbar!.instance.visibleActions.find(a => a.id === 'delete');

        expect(deleteAction).toBeDefined();

        // Execute delete action
        deleteAction!.onClick(node1);

        setTimeout(() => {
          expect(model?.getNodes().length).toBe(1);
          done();
        }, 50);
      }, 100);
    });

    it('should execute duplicate action', (done) => {
      const model = engine.getDiagram();
      expect(model?.getNodes().length).toBe(2);

      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const duplicateAction = toolbar!.instance.visibleActions.find(a => a.id === 'duplicate');

        expect(duplicateAction).toBeDefined();

        // Execute duplicate action
        duplicateAction!.onClick(node1);

        setTimeout(() => {
          expect(model?.getNodes().length).toBe(3);
          done();
        }, 50);
      }, 100);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate actions with arrow keys', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        expect(toolbar).toBeDefined();

        const toolbarEl = toolbar!.instance.toolbarRef?.nativeElement;
        expect(toolbarEl).toBeDefined();

        // Simulate arrow key press
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
        toolbarEl?.dispatchEvent(event);

        setTimeout(() => {
          expect(toolbar!.instance.focusedActionIndex).toBeGreaterThan(0);
          done();
        }, 50);
      }, 100);
    });

    it('should execute action with Enter key', (done) => {
      const model = engine.getDiagram();
      const initialCount = model?.getNodes().length;

      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const toolbarEl = toolbar!.instance.toolbarRef?.nativeElement;

        // Set focus to duplicate action (index 0)
        toolbar!.instance.focusedActionIndex = 0;

        // Simulate Enter key
        const event = new KeyboardEvent('keydown', { key: 'Enter' });
        toolbar!.instance.handleKeyDown(event);

        setTimeout(() => {
          // Should have duplicated the node
          expect(model?.getNodes().length).toBeGreaterThan(initialCount!);
          done();
        }, 50);
      }, 100);
    });

    it('should hide toolbar with Escape key', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        expect(toolbar!.instance.isVisible).toBe(true);

        // Simulate Escape key
        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        toolbar!.instance.handleKeyDown(event);

        setTimeout(() => {
          expect(toolbar!.instance.isVisible).toBe(false);
          done();
        }, 50);
      }, 100);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const toolbarEl = toolbar!.instance.toolbarRef?.nativeElement;

        expect(toolbarEl?.getAttribute('role')).toBe('toolbar');
        expect(toolbarEl?.hasAttribute('aria-label')).toBe(true);

        const buttons = toolbarEl?.querySelectorAll('.toolbar-button');
        buttons?.forEach((button: Element) => {
          expect(button.getAttribute('role')).toBe('button');
          expect(button.hasAttribute('aria-label')).toBe(true);
        });

        done();
      }, 100);
    });

    it('should support keyboard navigation', (done) => {
      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        const buttons = toolbar!.instance.toolbarRef?.nativeElement.querySelectorAll('.toolbar-button');

        // First button should have tabindex 0
        expect(buttons?.[0].getAttribute('tabindex')).toBe('0');

        // Other buttons should have tabindex -1
        for (let i = 1; i < (buttons?.length || 0); i++) {
          expect(buttons?.[i].getAttribute('tabindex')).toBe('-1');
        }

        done();
      }, 100);
    });
  });

  describe('Performance', () => {
    it('should handle 20+ concurrent toolbars', (done) => {
      const model = engine.getDiagram();
      const nodes: NodeModel[] = [];

      // Create 25 nodes
      for (let i = 0; i < 25; i++) {
        const node = model!.addNode({
          type: 'default',
          data: { label: `Node ${i}` },
          position: { x: (i % 5) * 200, y: Math.floor(i / 5) * 100 },
          size: { width: 150, height: 50 },
        });
        nodes.push(node);
      }

      // Select all nodes
      nodes.forEach(node => {
        engine.eventBus.emit('node:selected', { node });
      });

      setTimeout(() => {
        expect(toolbarService.getCount()).toBe(25);

        // Measure position update performance
        const start = performance.now();
        toolbarService.updateAllPositions();
        const duration = performance.now() - start;

        // Should update all 25 toolbars in less than 100ms
        expect(duration).toBeLessThan(100);

        done();
      }, 200);
    });

    it('should not cause memory leaks', (done) => {
      const initialCount = toolbarService.getCount();

      // Create and destroy toolbars 10 times
      for (let i = 0; i < 10; i++) {
        engine.eventBus.emit('node:selected', { node: node1 });
        engine.eventBus.emit('node:deselected', { node: node1 });
      }

      setTimeout(() => {
        expect(toolbarService.getCount()).toBe(initialCount);
        done();
      }, 200);
    });
  });

  describe('Configuration Object', () => {
    it('should accept config object', (done) => {
      const config = {
        position: 'bottom' as const,
        alignment: 'end' as const,
        style: {
          backgroundColor: '#000000',
          borderColor: '#ffffff',
        },
      };

      const toolbar = toolbarService.show(node1, engine, config);

      setTimeout(() => {
        expect(toolbar.instance.effectiveConfig.position).toBe('bottom');
        expect(toolbar.instance.effectiveConfig.alignment).toBe('end');
        expect(toolbar.instance.effectiveConfig.style.backgroundColor).toBe('#000000');
        done();
      }, 50);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing canvas element gracefully', (done) => {
      // Remove canvas element
      const canvasEl = document.querySelector('.diagram-canvas');
      canvasEl?.remove();

      engine.eventBus.emit('node:selected', { node: node1 });

      setTimeout(() => {
        const toolbar = toolbarService.get(node1.id);
        // Should not crash, just log warning
        expect(toolbar).toBeDefined();
        done();
      }, 100);
    });

    it('should handle action errors gracefully', (done) => {
      const errorAction = {
        id: 'error',
        label: 'Error',
        onClick: () => {
          throw new Error('Test error');
        },
      };

      const toolbar = toolbarService.show(node1, engine, {
        actions: [errorAction],
      });

      setTimeout(() => {
        // Should not crash when action throws error
        expect(() => {
          toolbar.instance.handleActionClick(errorAction);
        }).not.toThrow();

        done();
      }, 50);
    });
  });
});
