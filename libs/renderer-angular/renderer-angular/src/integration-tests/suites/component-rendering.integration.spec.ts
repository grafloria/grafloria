import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VNodeRendererService } from '../../lib/services/vnode-renderer.service';
import { ComponentRendererService } from '../../lib/services/component-renderer.service';
import { TestDiagramBuilder, MockRenderer } from '../utils';
import type { VNode } from '@grafloria/renderer';

/**
 * Component Rendering Integration Tests
 *
 * Tests the complete component rendering workflow including:
 * - VNode to component mapping
 * - Dynamic component creation
 * - Component lifecycle management
 * - Rendering performance
 * - Memory management
 * - Edge cases
 */

@Component({
  selector: 'test-diagram-host',
  template: `<div #container class="diagram-container"></div>`,
  styles: ['.diagram-container { width: 800px; height: 600px; }'],
})
class TestHostComponent {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  get container(): HTMLElement {
    return this.containerRef.nativeElement;
  }
}

describe('Component Rendering Integration Tests', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let vnodeService: VNodeRendererService;
  let componentService: ComponentRendererService;
  let mockRenderer: MockRenderer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent],
      imports: [CommonModule],
      providers: [VNodeRendererService, ComponentRendererService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    vnodeService = TestBed.inject(VNodeRendererService);
    componentService = TestBed.inject(ComponentRendererService);
    mockRenderer = new MockRenderer('svg');

    fixture.detectChanges();
  });

  afterEach(() => {
    mockRenderer.destroy();
  });

  describe('Scenario 1: Basic VNode Rendering', () => {
    it('should render a simple VNode tree', async () => {
      const vnode: VNode = {
        type: 'g',
        props: { id: 'root' },
        children: [
          {
            type: 'rect',
            props: { x: 0, y: 0, width: 100, height: 100, fill: '#FF0000' },
          },
        ],
      };

      await vnodeService.render(vnode, hostComponent.container, mockRenderer);

      expect(mockRenderer.renderCount).toBe(1);
      expect(mockRenderer.lastVNode).toBe(vnode);
    });

    it('should render complex diagram structure', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      const start = performance.now();
      await vnodeService.render(diagram, hostComponent.container, mockRenderer);
      const elapsed = performance.now() - start;

      expect(mockRenderer.renderCount).toBe(1);
      expect(elapsed).toBeLessThan(50); // Should be fast
    });
  });

  describe('Scenario 2: Dynamic Component Creation', () => {
    it('should create Angular components from VNodes', async () => {
      // Register a custom component renderer
      componentService.registerComponentType('custom-node', {
        component: TestHostComponent,
        inputs: ['data'],
      });

      const vnode: VNode = {
        type: 'custom-node',
        props: { data: { id: 'node1', label: 'Test' } },
      };

      const componentRef = await componentService.createComponent(
        'custom-node',
        hostComponent.container
      );

      expect(componentRef).toBeTruthy();
      expect(componentService.getComponentCount()).toBe(1);
    });

    it('should handle multiple component instances', async () => {
      componentService.registerComponentType('node', {
        component: TestHostComponent,
        inputs: ['id'],
      });

      const componentRefs = [];
      for (let i = 0; i < 10; i++) {
        const ref = await componentService.createComponent('node', hostComponent.container);
        componentRefs.push(ref);
      }

      expect(componentService.getComponentCount()).toBe(10);

      // Cleanup
      componentRefs.forEach(ref => componentService.destroyComponent(ref));
      expect(componentService.getComponentCount()).toBe(0);
    });
  });

  describe('Scenario 3: Incremental Rendering and Updates', () => {
    it('should efficiently update existing VNodes', async () => {
      const initialVNode: VNode = {
        type: 'g',
        props: { id: 'root' },
        children: [
          {
            type: 'rect',
            props: { x: 0, y: 0, width: 100, height: 100, fill: '#FF0000' },
          },
        ],
      };

      await vnodeService.render(initialVNode, hostComponent.container, mockRenderer);
      expect(mockRenderer.renderCount).toBe(1);

      // Update properties
      const updatedVNode: VNode = {
        type: 'g',
        props: { id: 'root' },
        children: [
          {
            type: 'rect',
            props: { x: 0, y: 0, width: 100, height: 100, fill: '#00FF00' },
          },
        ],
      };

      await vnodeService.update(updatedVNode, hostComponent.container, mockRenderer);
      expect(mockRenderer.updateCount).toBe(1);
    });

    it('should handle partial tree updates', async () => {
      const builder = TestDiagramBuilder.createSimpleFlowchart();
      const diagram = builder.build();

      await vnodeService.render(diagram, hostComponent.container, mockRenderer);
      const initialRenderCount = mockRenderer.renderCount;

      // Update one node
      builder.addNode('extra', { x: 100, y: 350, width: 120, height: 60, label: 'Extra' });
      const updated = builder.build();

      await vnodeService.update(updated, hostComponent.container, mockRenderer);
      expect(mockRenderer.updateCount).toBeGreaterThan(0);
    });
  });

  describe('Scenario 4: Large Diagram Rendering Performance', () => {
    it('should render large diagrams efficiently', async () => {
      const largeD diagram = TestDiagramBuilder.createLargeDiagram(500).build();

      const start = performance.now();
      await vnodeService.render(diagram, hostComponent.container, mockRenderer);
      const elapsed = performance.now() - start;

      expect(mockRenderer.renderCount).toBe(1);
      expect(elapsed).toBeLessThan(500); // Should complete in reasonable time
    });

    it('should handle very large diagrams (1000+ nodes)', async () => {
      const hugeDiagram = TestDiagramBuilder.createLargeDiagram(1000).build();

      const start = performance.now();
      await vnodeService.render(hugeDiagram, hostComponent.container, mockRenderer);
      const elapsed = performance.now() - start;

      expect(mockRenderer.renderCount).toBe(1);
      // Should still be reasonable, though slower
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('Scenario 5: Memory Management and Cleanup', () => {
    it('should properly cleanup components on destroy', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();
      await vnodeService.render(diagram, hostComponent.container, mockRenderer);

      const initialCount = componentService.getComponentCount();

      // Clear
      vnodeService.clear(hostComponent.container);

      // All components should be destroyed
      expect(componentService.getComponentCount()).toBe(0);
    });

    it('should not leak memory on repeated renders', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      // Render many times
      for (let i = 0; i < 100; i++) {
        await vnodeService.render(diagram, hostComponent.container, mockRenderer);
        vnodeService.clear(hostComponent.container);
      }

      // No components should remain
      expect(componentService.getComponentCount()).toBe(0);
    });
  });

  describe('Scenario 6: Error Handling and Resilience', () => {
    it('should handle malformed VNodes gracefully', async () => {
      const malformedVNode: any = {
        // Missing 'type'
        props: { id: 'bad' },
      };

      await expect(
        vnodeService.render(malformedVNode, hostComponent.container, mockRenderer)
      ).resolves.not.toThrow();
    });

    it('should recover from rendering errors', async () => {
      // Setup renderer to throw error
      mockRenderer.setShouldThrowOnRender(true);

      const vnode: VNode = {
        type: 'g',
        props: {},
        children: [],
      };

      await expect(
        vnodeService.render(vnode, hostComponent.container, mockRenderer)
      ).rejects.toThrow();

      // Reset and try again
      mockRenderer.setShouldThrowOnRender(false);

      await expect(
        vnodeService.render(vnode, hostComponent.container, mockRenderer)
      ).resolves.not.toThrow();
    });

    it('should handle missing container gracefully', async () => {
      const vnode: VNode = { type: 'g', props: {}, children: [] };

      await expect(vnodeService.render(vnode, null as any, mockRenderer)).rejects.toThrow();
    });
  });

  describe('Scenario 7: Nested Component Hierarchies', () => {
    it('should render deeply nested VNode trees', async () => {
      // Create deeply nested structure
      let current: VNode = { type: 'text', props: {}, children: ['Leaf'] };
      for (let i = 0; i < 20; i++) {
        current = {
          type: 'g',
          props: { id: `level-${i}` },
          children: [current],
        };
      }

      await vnodeService.render(current, hostComponent.container, mockRenderer);
      expect(mockRenderer.renderCount).toBe(1);
    });

    it('should handle complex branching structures', async () => {
      const complex = TestDiagramBuilder.createComplexDiagram().build();

      await vnodeService.render(complex, hostComponent.container, mockRenderer);
      expect(mockRenderer.renderCount).toBe(1);
    });
  });

  describe('Scenario 8: Rendering with Different Renderers', () => {
    it('should work with SVG renderer', async () => {
      const svgRenderer = new MockRenderer('svg', { supportsForeignObject: true });
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      await vnodeService.render(diagram, hostComponent.container, svgRenderer);

      expect(svgRenderer.renderCount).toBe(1);
      expect(svgRenderer.type).toBe('svg');
    });

    it('should work with Canvas renderer', async () => {
      const canvasRenderer = new MockRenderer('canvas', { supportsForeignObject: false });
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      await vnodeService.render(diagram, hostComponent.container, canvasRenderer);

      expect(canvasRenderer.renderCount).toBe(1);
      expect(canvasRenderer.type).toBe('canvas');
    });

    it('should switch between renderers', async () => {
      const svgRenderer = new MockRenderer('svg');
      const canvasRenderer = new MockRenderer('canvas');
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      // Render with SVG
      await vnodeService.render(diagram, hostComponent.container, svgRenderer);
      expect(svgRenderer.renderCount).toBe(1);

      // Switch to Canvas
      await vnodeService.render(diagram, hostComponent.container, canvasRenderer);
      expect(canvasRenderer.renderCount).toBe(1);
    });
  });
});
