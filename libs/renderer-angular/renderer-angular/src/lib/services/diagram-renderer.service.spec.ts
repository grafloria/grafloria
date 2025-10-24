import { TestBed } from '@angular/core/testing';
import { DiagramRendererService, RendererRecommendation, PerformanceBenchmark } from './diagram-renderer.service';
import type { IRenderer } from '../../../../../renderer/src/core/renderer.interface';
import type { VNode } from '@grafloria/renderer';

// Mock renderer
class MockRenderer implements IRenderer {
  type: string;
  capabilities = {
    supportsHitTest: true,
    supportsBatching: true,
    supportsExport: true,
    supportsMeasurement: true,
    supportsForeignObject: true,
    supportsFilters: true,
    supportsOffscreen: true,
  };

  initialized = false;
  destroyed = false;
  renderCount = 0;
  lastVNode: VNode | null = null;

  constructor(type: string) {
    this.type = type;
  }

  initialize(container: HTMLElement, config: any): void {
    this.initialized = true;
  }

  async render(vnode: VNode, options?: any): Promise<void> {
    this.renderCount++;
    this.lastVNode = vnode;
  }

  async update(updates: any[]): Promise<void> {
    // No-op
  }

  clear(): void {
    // No-op
  }

  measureText(text: string, style: any): any {
    return { width: 100, height: 20, baseline: 15 };
  }

  measureElement(vnode: VNode): any {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  hitTest(x: number, y: number): VNode | null {
    return null;
  }

  async export(format: string, options?: any): Promise<string> {
    return 'data:image/png;base64,';
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe('DiagramRendererService', () => {
  let service: DiagramRendererService;
  let container: HTMLElement;
  let svgRenderer: MockRenderer;
  let canvasRenderer: MockRenderer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiagramRendererService],
    });

    service = TestBed.inject(DiagramRendererService);
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    // Create mock renderers
    svgRenderer = new MockRenderer('svg');
    canvasRenderer = new MockRenderer('canvas');
  });

  afterEach(() => {
    service.destroy();
    document.body.removeChild(container);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should have no active renderer initially', () => {
      expect(service.getActiveRenderer()).toBeNull();
    });

    it('should have empty registered renderers list', () => {
      expect(service.getRegisteredRenderers()).toEqual([]);
    });
  });

  describe('registerRenderer', () => {
    it('should register a renderer', () => {
      service.registerRenderer('svg', svgRenderer);

      expect(service.getRegisteredRenderers()).toContain('svg');
      expect(service.getRenderer('svg')).toBe(svgRenderer);
    });

    it('should register multiple renderers', () => {
      service.registerRenderer('svg', svgRenderer);
      service.registerRenderer('canvas', canvasRenderer);

      expect(service.getRegisteredRenderers()).toEqual(['svg', 'canvas']);
    });

    it('should throw error when registering duplicate type', () => {
      service.registerRenderer('svg', svgRenderer);

      expect(() => service.registerRenderer('svg', svgRenderer)).toThrow();
    });
  });

  describe('switchRenderer', () => {
    beforeEach(() => {
      service.registerRenderer('svg', svgRenderer);
      service.registerRenderer('canvas', canvasRenderer);
    });

    it('should switch to registered renderer', async () => {
      await service.switchRenderer('svg', container);

      expect(service.getActiveRenderer()).toBe(svgRenderer);
      expect(svgRenderer.initialized).toBe(true);
    });

    it('should throw error for unregistered renderer', async () => {
      await expect(service.switchRenderer('webgl', container)).rejects.toThrow();
    });

    it('should preserve VNode when switching', async () => {
      const vnode: VNode = {
        type: 'g',
        props: {},
        children: [],
      };

      // Switch to SVG and render
      await service.switchRenderer('svg', container);
      await service.render(vnode);

      expect(svgRenderer.lastVNode).toBe(vnode);

      // Switch to Canvas - should preserve and re-render
      await service.switchRenderer('canvas', container);

      expect(canvasRenderer.lastVNode).toBe(vnode);
    });

    it('should destroy previous renderer', async () => {
      await service.switchRenderer('svg', container);
      await service.switchRenderer('canvas', container);

      expect(svgRenderer.destroyed).toBe(true);
    });

    it('should emit renderer change event', async () => {
      let eventEmitted = false;
      service.rendererChanged$.subscribe(event => {
        if (event) {
          eventEmitted = true;
          expect(event.previousType).toBeNull();
          expect(event.newType).toBe('svg');
        }
      });

      await service.switchRenderer('svg', container);

      expect(eventEmitted).toBe(true);
    });
  });

  describe('render', () => {
    beforeEach(async () => {
      service.registerRenderer('svg', svgRenderer);
      await service.switchRenderer('svg', container);
    });

    it('should render VNode to active renderer', async () => {
      const vnode: VNode = { type: 'rect', props: {} };

      await service.render(vnode);

      expect(svgRenderer.renderCount).toBe(1);
      expect(svgRenderer.lastVNode).toBe(vnode);
    });

    it('should throw if no active renderer', async () => {
      service.destroy();
      const vnode: VNode = { type: 'rect', props: {} };

      await expect(service.render(vnode)).rejects.toThrow();
    });
  });

  describe('recommendation system', () => {
    beforeEach(() => {
      service.registerRenderer('svg', svgRenderer);
      service.registerRenderer('canvas', canvasRenderer);
    });

    it('should recommend SVG for small diagrams', () => {
      const recommendation = service.getRecommendation({ nodeCount: 50 });

      expect(recommendation.recommendedRenderer).toBe('svg');
      expect(recommendation.confidence).toBeGreaterThan(0.5);
    });

    it('should recommend Canvas for large diagrams', () => {
      const recommendation = service.getRecommendation({ nodeCount: 5000 });

      expect(recommendation.recommendedRenderer).toBe('canvas');
    });

    it('should recommend SVG when foreignObject needed', () => {
      const recommendation = service.getRecommendation({
        nodeCount: 500,
        requiresForeignObject: true,
      });

      expect(recommendation.recommendedRenderer).toBe('svg');
      expect(recommendation.reason).toContain('foreignObject');
    });

    it('should provide reasons for recommendation', () => {
      const recommendation = service.getRecommendation({ nodeCount: 50 });

      expect(recommendation.reason).toBeTruthy();
      expect(typeof recommendation.reason).toBe('string');
    });

    it('should list alternatives', () => {
      const recommendation = service.getRecommendation({ nodeCount: 50 });

      expect(recommendation.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('performance benchmarking', () => {
    beforeEach(async () => {
      service.registerRenderer('svg', svgRenderer);
      await service.switchRenderer('svg', container);
    });

    it('should benchmark render performance', async () => {
      const vnode: VNode = { type: 'rect', props: {} };

      const benchmark = await service.benchmarkRenderer(vnode, { iterations: 5 });

      expect(benchmark.rendererType).toBe('svg');
      expect(benchmark.iterations).toBe(5);
      expect(benchmark.avgRenderTime).toBeGreaterThan(0);
      expect(benchmark.minRenderTime).toBeGreaterThan(0);
      expect(benchmark.maxRenderTime).toBeGreaterThan(0);
    });

    it('should compare multiple renderers', async () => {
      service.registerRenderer('canvas', canvasRenderer);
      const vnode: VNode = { type: 'rect', props: {} };

      const comparison = await service.compareRenderers(vnode, ['svg', 'canvas']);

      expect(comparison.length).toBe(2);
      // Results should include both renderers (order may vary)
      const types = comparison.map(b => b.rendererType);
      expect(types).toContain('svg');
      expect(types).toContain('canvas');
    });

    it('should handle benchmark errors gracefully', async () => {
      const badVNode: VNode = { type: 'invalid', props: {} };

      const benchmark = await service.benchmarkRenderer(badVNode);

      expect(benchmark).toBeDefined();
      // Should not throw
    });
  });

  describe('auto-switch', () => {
    beforeEach(async () => {
      service.registerRenderer('svg', svgRenderer);
      service.registerRenderer('canvas', canvasRenderer);
    });

    it('should enable auto-switch mode', () => {
      service.enableAutoSwitch(container);

      expect(service.isAutoSwitchEnabled()).toBe(true);
    });

    it('should disable auto-switch mode', () => {
      service.enableAutoSwitch(container);
      service.disableAutoSwitch();

      expect(service.isAutoSwitchEnabled()).toBe(false);
    });

    xit('should auto-switch based on criteria', async () => {
      // Test auto-switch mechanism
      // Start with SVG
      await service.switchRenderer('svg', container);

      service.enableAutoSwitch(container, {
        nodeSizeThreshold: 100,
        checkInterval: 5000, // Long interval for this test
      });

      // Simulate large diagram by manually updating the VNode
      const vnode: VNode = {
        type: 'g',
        props: {},
        children: Array(150)
          .fill(null)
          .map(() => ({ type: 'rect', props: {} })),
      };

      // Manually update VNode
      (service as any).strategyManager.updateVNode(vnode);

      // Manually trigger check (method is now public for testing)
      await service.checkAutoSwitch();

      // Should have switched to canvas due to high node count
      expect(service.getActiveRenderer()?.type).toBe('canvas');
    });
  });

  describe('capabilities check', () => {
    beforeEach(() => {
      service.registerRenderer('svg', svgRenderer);
    });

    it('should check if feature is supported', async () => {
      expect(service.supportsFeature('supportsHitTest')).toBe(false); // No active renderer

      // svgRenderer is already registered in beforeEach
      await service.switchRenderer('svg', container);

      expect(service.supportsFeature('supportsHitTest')).toBe(true);
    });

    it('should get capabilities of active renderer', async () => {
      await service.switchRenderer('svg', container);

      const capabilities = service.getCapabilities();

      expect(capabilities).toEqual(svgRenderer.capabilities);
    });

    it('should return null capabilities if no active renderer', () => {
      expect(service.getCapabilities()).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources', async () => {
      service.registerRenderer('svg', svgRenderer);
      await service.switchRenderer('svg', container);

      service.destroy();

      expect(svgRenderer.destroyed).toBe(true);
      expect(service.getActiveRenderer()).toBeNull();
      expect(service.getRegisteredRenderers()).toEqual([]);
    });

    it('should be safe to call multiple times', () => {
      service.destroy();
      expect(() => service.destroy()).not.toThrow();
    });
  });
});
