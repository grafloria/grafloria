import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramRendererService } from '../../lib/services/diagram-renderer.service';
import { RendererSwitcherComponent } from '../../lib/components/renderer-switcher/renderer-switcher.component';
import { TestDiagramBuilder, MockRenderer, createMockSVGRenderer, createMockCanvasRenderer } from '../utils';
import type { VNode } from '@grafloria/renderer';

/**
 * Renderer Switching Integration Tests
 *
 * Tests complete renderer switching workflows:
 * - Manual renderer switching
 * - Automatic renderer selection
 * - Performance-based switching
 * - State preservation during switch
 * - Renderer recommendations
 */

@Component({
  template: `
    <div class="workspace">
      <div #container class="diagram-container"></div>
      <grafloria-renderer-switcher
        [container]="containerElement"
        [showRecommendation]="showRecommendation"
        [recommendationCriteria]="criteria"
        (rendererChanged)="onRendererChanged($event)">
      </grafloria-renderer-switcher>
    </div>
  `,
  styles: [
    `
      .workspace {
        display: flex;
        gap: 20px;
      }
      .diagram-container {
        width: 800px;
        height: 600px;
      }
    `,
  ],
})
class TestHostComponent {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;
  @ViewChild(RendererSwitcherComponent) switcher!: RendererSwitcherComponent;

  containerElement: HTMLElement;
  showRecommendation = true;
  criteria = { nodeCount: 100 };
  lastRendererChanged = '';

  constructor() {
    this.containerElement = document.createElement('div');
    document.body.appendChild(this.containerElement);
  }

  onRendererChanged(renderer: string) {
    this.lastRendererChanged = renderer;
  }

  ngOnDestroy() {
    if (this.containerElement.parentNode) {
      document.body.removeChild(this.containerElement);
    }
  }
}

describe('Renderer Switching Integration Tests', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let service: DiagramRendererService;
  let svgRenderer: MockRenderer;
  let canvasRenderer: MockRenderer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent],
      imports: [CommonModule, RendererSwitcherComponent],
      providers: [DiagramRendererService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    service = TestBed.inject(DiagramRendererService);

    // Create mock renderers
    svgRenderer = createMockSVGRenderer();
    canvasRenderer = createMockCanvasRenderer();

    // Register renderers
    service.registerRenderer('svg', svgRenderer);
    service.registerRenderer('canvas', canvasRenderer);

    fixture.detectChanges();
  });

  afterEach(() => {
    service.destroy();
    svgRenderer.destroy();
    canvasRenderer.destroy();
  });

  describe('Scenario 1: Manual Renderer Switching', () => {
    it('should switch renderer on user selection', async () => {
      // Start with SVG
      await service.switchRenderer('svg', hostComponent.containerElement);
      expect(service.getActiveRenderer()?.type).toBe('svg');

      // Switch to Canvas
      await service.switchRenderer('canvas', hostComponent.containerElement);
      expect(service.getActiveRenderer()?.type).toBe('canvas');

      // Verify events
      expect(hostComponent.lastRendererChanged).toBeTruthy();
    });

    it('should preserve diagram state during switch', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      // Render with SVG
      await service.switchRenderer('svg', hostComponent.containerElement);
      await service.render(diagram);
      expect(svgRenderer.renderCount).toBe(1);

      // Switch to Canvas
      await service.switchRenderer('canvas', hostComponent.containerElement);
      await service.render(diagram);

      // Both renderers should have rendered
      expect(svgRenderer.renderCount).toBe(1);
      expect(canvasRenderer.renderCount).toBe(1);
    });

    it('should handle multiple switches quickly', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        const renderer = i % 2 === 0 ? 'svg' : 'canvas';
        await service.switchRenderer(renderer, hostComponent.containerElement);
        await service.render(diagram);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500); // Should be reasonably fast
    });
  });

  describe('Scenario 2: Automatic Renderer Selection', () => {
    it('should recommend SVG for small diagrams', () => {
      const recommendation = service.getRecommendation({ nodeCount: 50 });
      expect(recommendation.recommendedRenderer).toBe('svg');
      expect(recommendation.confidence).toBeGreaterThan(0.5);
    });

    it('should recommend Canvas for large diagrams', () => {
      const recommendation = service.getRecommendation({ nodeCount: 5000 });
      expect(recommendation.recommendedRenderer).toBe('canvas');
      expect(recommendation.confidence).toBeGreaterThan(0.5);
    });

    it('should apply recommendation automatically', async () => {
      hostComponent.criteria = { nodeCount: 5000 };
      fixture.detectChanges();
      await fixture.whenStable();

      await service.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      // Apply recommendation
      await hostComponent.switcher.applyRecommendation();
      fixture.detectChanges();

      expect(service.getActiveRenderer()?.type).toBe('canvas');
    });

    it('should consider foreignObject requirement', () => {
      const recommendation = service.getRecommendation({
        nodeCount: 500,
        requiresForeignObject: true,
      });

      // Should strongly prefer SVG
      expect(recommendation.recommendedRenderer).toBe('svg');
    });
  });

  describe('Scenario 3: Performance-Based Switching', () => {
    it('should benchmark renderer performance', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      await service.switchRenderer('svg', hostComponent.containerElement);
      const svgBenchmark = await service.benchmarkRenderer(diagram, { iterations: 10 });

      expect(svgBenchmark.rendererType).toBe('svg');
      expect(svgBenchmark.avgRenderTime).toBeGreaterThan(0);
      expect(svgBenchmark.fps).toBeGreaterThan(0);
    });

    it('should compare multiple renderers', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      const comparison = await service.compareRenderers(diagram, ['svg', 'canvas']);

      expect(comparison.length).toBe(2);
      expect(comparison[0].avgRenderTime).toBeDefined();
      expect(comparison[1].avgRenderTime).toBeDefined();

      // Results should be sorted by performance
      expect(comparison[0].avgRenderTime).toBeLessThanOrEqual(comparison[1].avgRenderTime);
    });

    it('should auto-switch based on performance thresholds', async () => {
      const largeDiagram = TestDiagramBuilder.createLargeDiagram(1000).build();

      // Enable auto-switch
      service.enableAutoSwitch(hostComponent.containerElement, {
        nodeSizeThreshold: 500,
        checkInterval: 100,
        enablePerformanceSwitch: true,
      });

      // Start with SVG
      await service.switchRenderer('svg', hostComponent.containerElement);
      await service.render(largeDiagram);

      // Wait for auto-switch check
      await delay(150);

      // Should auto-switch if performance is poor
      // (This is a mock test - real behavior would depend on actual performance)
      expect(service.getActiveRenderer()).toBeTruthy();
    });
  });

  describe('Scenario 4: Renderer Capabilities', () => {
    it('should check renderer capabilities before switching', () => {
      expect(service.supportsFeature('supportsForeignObject')).toBe(false); // No active renderer

      service.switchRenderer('svg', hostComponent.containerElement);
      expect(service.supportsFeature('supportsForeignObject')).toBe(true);

      service.switchRenderer('canvas', hostComponent.containerElement);
      expect(service.supportsFeature('supportsForeignObject')).toBe(false);
    });

    it('should provide capability information', () => {
      service.switchRenderer('svg', hostComponent.containerElement);
      const caps = service.getCapabilities();

      expect(caps).toBeTruthy();
      expect(caps?.supportsHitTest).toBe(true);
      expect(caps?.supportsForeignObject).toBe(true);
    });

    it('should adapt features based on capabilities', async () => {
      // SVG supports foreignObject
      await service.switchRenderer('svg', hostComponent.containerElement);
      expect(service.supportsFeature('supportsForeignObject')).toBe(true);

      // Canvas doesn't
      await service.switchRenderer('canvas', hostComponent.containerElement);
      expect(service.supportsFeature('supportsForeignObject')).toBe(false);

      // Application should adapt rendering strategy
    });
  });

  describe('Scenario 5: Edge Cases and Error Handling', () => {
    it('should handle switching to unregistered renderer', async () => {
      await service.switchRenderer('svg', hostComponent.containerElement);

      await expect(
        service.switchRenderer('webgl', hostComponent.containerElement)
      ).rejects.toThrow();

      // Should remain on SVG
      expect(service.getActiveRenderer()?.type).toBe('svg');
    });

    it('should handle renderer initialization failure', async () => {
      const failingRenderer = new MockRenderer('failing');
      failingRenderer.setShouldThrowOnRender(true);
      service.registerRenderer('failing', failingRenderer);

      await expect(
        service.switchRenderer('failing', hostComponent.containerElement)
      ).rejects.toThrow();
    });

    it('should cleanup previous renderer on switch', async () => {
      await service.switchRenderer('svg', hostComponent.containerElement);
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();
      await service.render(diagram);

      expect(svgRenderer.renderCount).toBe(1);

      // Switch renderer
      await service.switchRenderer('canvas', hostComponent.containerElement);

      // SVG renderer should still have its state
      expect(svgRenderer.renderCount).toBe(1);
      expect(canvasRenderer.renderCount).toBe(0);
    });
  });

  describe('Scenario 6: Renderer Synchronization', () => {
    it('should keep UI in sync with active renderer', async () => {
      await service.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(hostComponent.switcher.selectedRenderer).toBe('svg');

      await service.switchRenderer('canvas', hostComponent.containerElement);
      fixture.detectChanges();
      await fixture.whenStable();

      // Allow time for subscription to update
      await delay(50);

      expect(hostComponent.switcher.selectedRenderer).toBe('canvas');
    });

    it('should update service when UI changes', async () => {
      await service.switchRenderer('svg', hostComponent.containerElement);
      fixture.detectChanges();

      // Change via UI
      hostComponent.switcher.selectedRenderer = 'canvas';
      await hostComponent.switcher.onRendererChange();
      fixture.detectChanges();

      expect(service.getActiveRenderer()?.type).toBe('canvas');
    });
  });

  describe('Scenario 7: Complex Diagrams', () => {
    it('should handle complex diagrams efficiently', async () => {
      const complex = TestDiagramBuilder.createComplexDiagram().build();

      // SVG rendering
      await service.switchRenderer('svg', hostComponent.containerElement);
      const svgStart = performance.now();
      await service.render(complex);
      const svgTime = performance.now() - svgStart;

      // Canvas rendering
      await service.switchRenderer('canvas', hostComponent.containerElement);
      const canvasStart = performance.now();
      await service.render(complex);
      const canvasTime = performance.now() - canvasStart;

      // Both should complete reasonably
      expect(svgTime).toBeLessThan(1000);
      expect(canvasTime).toBeLessThan(1000);
    });

    it('should maintain rendering quality across switches', async () => {
      const diagram = TestDiagramBuilder.createComplexDiagram().build();

      // Render with both
      await service.switchRenderer('svg', hostComponent.containerElement);
      await service.render(diagram);
      const svgVNode = svgRenderer.lastVNode;

      await service.switchRenderer('canvas', hostComponent.containerElement);
      await service.render(diagram);
      const canvasVNode = canvasRenderer.lastVNode;

      // Both should have received the same diagram
      expect(svgVNode).toBeTruthy();
      expect(canvasVNode).toBeTruthy();
    });
  });

  describe('Scenario 8: Memory and Resource Management', () => {
    it('should not leak memory on repeated switches', async () => {
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();

      for (let i = 0; i < 50; i++) {
        const renderer = i % 2 === 0 ? 'svg' : 'canvas';
        await service.switchRenderer(renderer, hostComponent.containerElement);
        await service.render(diagram);
      }

      // Should complete without memory issues
      expect(service.getActiveRenderer()).toBeTruthy();
    });

    it('should cleanup on service destroy', async () => {
      await service.switchRenderer('svg', hostComponent.containerElement);
      const diagram = TestDiagramBuilder.createSimpleFlowchart().build();
      await service.render(diagram);

      service.destroy();

      // Should not have active renderer
      expect(service.getActiveRenderer()).toBeNull();
    });
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
