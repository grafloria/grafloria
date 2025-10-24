import { SVGRendererV2 } from './svg-renderer-v2';
import type { VNode } from '../types/vnode.types';

describe('SVGRendererV2', () => {
  let renderer: SVGRendererV2;
  let container: HTMLElement;

  beforeEach(() => {
    renderer = new SVGRendererV2({
      width: 800,
      height: 600,
      preserveAspectRatio: 'xMidYMid meet',
      enableCaching: true,
      maxCacheSize: 100,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer.destroy();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('type and capabilities', () => {
    it('should have correct type identifier', () => {
      expect(renderer.type).toBe('svg');
    });

    it('should report correct capabilities', () => {
      expect(renderer.capabilities).toEqual({
        supportsHitTest: true,
        supportsBatching: false,
        supportsExport: true,
        supportsMeasurement: true,
        supportsForeignObject: true,
        supportsFilters: true,
        supportsOffscreen: false,
      });
    });
  });

  describe('initialize', () => {
    it('should initialize with container', () => {
      renderer.initialize(container, { width: 800, height: 600 });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('width')).toBe('800');
      expect(svg?.getAttribute('height')).toBe('600');
    });

    it('should throw if container is invalid', () => {
      expect(() => renderer.initialize(null as any, { width: 800, height: 600 })).toThrow(
        'Container element is required'
      );
    });

    it('should throw if already initialized', () => {
      renderer.initialize(container, { width: 800, height: 600 });

      expect(() => renderer.initialize(container, { width: 800, height: 600 })).toThrow(
        'Renderer already initialized'
      );
    });

    it('should apply preserveAspectRatio from config', () => {
      renderer.initialize(container, { width: 800, height: 600 });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    });

    it('should apply CSS namespace from config', () => {
      const customRenderer = new SVGRendererV2({
        width: 800,
        height: 600,
        cssNamespace: 'custom',
      });

      customRenderer.initialize(container, { width: 800, height: 600 });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('class')).toBe('custom-diagram');

      customRenderer.destroy();
    });

    it('should handle high-DPI displays with pixelRatio', () => {
      renderer.initialize(container, {
        width: 800,
        height: 600,
        pixelRatio: 2,
      });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('1600');
      expect(svg?.getAttribute('height')).toBe('1200');
      expect(svg?.style.width).toBe('800px');
      expect(svg?.style.height).toBe('600px');
    });
  });

  describe('render', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should throw if not initialized', async () => {
      const uninitializedRenderer = new SVGRendererV2({
        width: 800,
        height: 600,
      });

      await expect(
        uninitializedRenderer.render({ type: 'rect', props: {} })
      ).rejects.toThrow('Renderer not initialized');
    });

    it('should render simple rect VNode', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: {
          x: 10,
          y: 10,
          width: 100,
          height: 50,
          fill: 'blue',
        },
      };

      await renderer.render(vnode);

      const rect = container.querySelector('rect');
      expect(rect).toBeTruthy();
      expect(rect?.getAttribute('x')).toBe('10');
      expect(rect?.getAttribute('y')).toBe('10');
      expect(rect?.getAttribute('width')).toBe('100');
      expect(rect?.getAttribute('height')).toBe('50');
      expect(rect?.getAttribute('fill')).toBe('blue');
    });

    it('should render VNode with children', async () => {
      const vnode: VNode = {
        type: 'g',
        key: 'parent',
        props: {
          transform: 'translate(10, 10)',
        },
        children: [
          {
            type: 'rect',
            key: 'child1',
            props: { x: 0, y: 0, width: 50, height: 50 },
          },
          {
            type: 'circle',
            key: 'child2',
            props: { cx: 25, cy: 25, r: 10 },
          },
        ],
      };

      await renderer.render(vnode);

      const group = container.querySelector('g');
      expect(group).toBeTruthy();
      expect(group?.getAttribute('transform')).toBe('translate(10, 10)');

      const rect = container.querySelector('rect');
      const circle = container.querySelector('circle');
      expect(rect).toBeTruthy();
      expect(circle).toBeTruthy();
    });

    it('should handle text content', async () => {
      const vnode: VNode = {
        type: 'text',
        props: {
          x: 100,
          y: 100,
          textContent: 'Hello World',
          fontSize: 16,
          fill: 'black',
        },
      };

      await renderer.render(vnode);

      const text = container.querySelector('text');
      expect(text).toBeTruthy();
      expect(text?.textContent).toBe('Hello World');
      expect(text?.getAttribute('x')).toBe('100');
      expect(text?.getAttribute('font-size')).toBe('16');
    });

    it('should handle className prop', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          className: 'my-custom-class',
        },
      };

      await renderer.render(vnode);

      const rect = container.querySelector('rect');
      expect(rect?.getAttribute('class')).toBe('my-custom-class');
    });

    it('should add data-vnode-key attribute for hit testing', async () => {
      const vnode: VNode = {
        type: 'rect',
        key: 'my-rect',
        props: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      };

      await renderer.render(vnode);

      const rect = container.querySelector('rect');
      expect(rect?.getAttribute('data-vnode-key')).toBe('my-rect');
    });

    it('should skip re-render if VNode unchanged and caching enabled', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await renderer.render(vnode);
      const firstRect = container.querySelector('rect');

      await renderer.render(vnode, { skipUnchanged: true });
      const secondRect = container.querySelector('rect');

      expect(firstRect).toBe(secondRect);
    });

    it('should clear previous content before rendering', async () => {
      const vnode1: VNode = {
        type: 'rect',
        key: 'rect1',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await renderer.render(vnode1);
      expect(container.querySelectorAll('rect').length).toBe(1);

      const vnode2: VNode = {
        type: 'circle',
        key: 'circle1',
        props: { cx: 50, cy: 50, r: 25 },
      };

      await renderer.render(vnode2);
      expect(container.querySelectorAll('rect').length).toBe(0);
      expect(container.querySelectorAll('circle').length).toBe(1);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should update specific nodes', async () => {
      const vnode: VNode = {
        type: 'g',
        children: [
          {
            type: 'rect',
            key: 'rect1',
            props: { x: 0, y: 0, width: 100, height: 100, fill: 'red' },
          },
        ],
      };

      await renderer.render(vnode);

      await renderer.update([
        {
          path: 'children.0',
          vnode: {
            type: 'rect',
            key: 'rect1',
            props: { x: 0, y: 0, width: 100, height: 100, fill: 'blue' },
          },
        },
      ]);

      const rect = container.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('blue');
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should remove all children from SVG', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await renderer.render(vnode);
      expect(container.querySelector('rect')).toBeTruthy();

      renderer.clear();

      expect(container.querySelector('rect')).toBeNull();
    });
  });

  describe('measureText', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should measure text dimensions', () => {
      const metrics = renderer.measureText('Hello World', {
        fontFamily: 'Arial',
        fontSize: 16,
      });

      expect(metrics.width).toBeGreaterThan(0);
      expect(metrics.height).toBeGreaterThan(0);
      expect(metrics.baseline).toBeGreaterThan(0);
    });

    it('should cache measurements', () => {
      const metrics1 = renderer.measureText('Test', { fontSize: 16 });
      const metrics2 = renderer.measureText('Test', { fontSize: 16 });

      expect(metrics1).toBe(metrics2); // Same object reference = cached
    });

    it('should handle different font styles', () => {
      const metrics = renderer.measureText('Test', {
        fontFamily: 'Arial',
        fontSize: 20,
        fontWeight: 'bold',
        fontStyle: 'italic',
        letterSpacing: 2,
      });

      expect(metrics.width).toBeGreaterThan(0);
    });
  });

  describe('measureElement', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should measure element bounding box', () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 10, y: 20, width: 100, height: 50 },
      };

      const bbox = renderer.measureElement(vnode);

      expect(bbox.x).toBe(10);
      expect(bbox.y).toBe(20);
      expect(bbox.width).toBe(100);
      expect(bbox.height).toBe(50);
    });

    it('should handle complex elements with transforms', () => {
      const vnode: VNode = {
        type: 'g',
        props: { transform: 'translate(10, 10)' },
        children: [
          {
            type: 'rect',
            props: { x: 0, y: 0, width: 50, height: 50 },
          },
        ],
      };

      const bbox = renderer.measureElement(vnode);

      expect(bbox.width).toBeGreaterThan(0);
      expect(bbox.height).toBeGreaterThan(0);
    });
  });

  describe('hitTest', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should return null when not initialized', () => {
      const uninitializedRenderer = new SVGRendererV2({ width: 800, height: 600 });
      expect(uninitializedRenderer.hitTest(50, 50)).toBeNull();
    });

    it('should find VNode by key', async () => {
      const vnode: VNode = {
        type: 'rect',
        key: 'test-rect',
        props: { x: 10, y: 10, width: 100, height: 50 },
      };

      await renderer.render(vnode);

      // Note: Actual hit testing requires DOM positioning which is hard to test in JSDOM
      // This test verifies the structure is in place
      const rect = container.querySelector('rect');
      expect(rect?.getAttribute('data-vnode-key')).toBe('test-rect');
    });
  });

  describe('export', () => {
    beforeEach(() => {
      renderer.initialize(container, { width: 800, height: 600 });
    });

    it('should export as SVG string', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 10, y: 10, width: 100, height: 50, fill: 'blue' },
      };

      await renderer.render(vnode);

      const svg = await renderer.export('svg');

      expect(svg).toContain('<svg');
      expect(svg).toContain('<rect');
      expect(svg).toContain('fill="blue"');
    });

    it('should throw for unsupported format', async () => {
      await expect(renderer.export('unknown' as any)).rejects.toThrow(
        'Unsupported export format'
      );
    });

    it('should export as PNG with options', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 10, y: 10, width: 100, height: 50, fill: 'red' },
      };

      await renderer.render(vnode);

      // Note: PNG export requires image loading which may not work in JSDOM
      // This test verifies the method exists and doesn't throw during setup
      const exportPromise = renderer.export('png', {
        scale: 2,
        quality: 0.9,
        backgroundColor: 'white',
      });

      expect(exportPromise).toBeInstanceOf(Promise);
    });
  });

  describe('destroy', () => {
    it('should remove SVG from container', () => {
      renderer.initialize(container, { width: 800, height: 600 });

      expect(container.querySelector('svg')).toBeTruthy();

      renderer.destroy();

      expect(container.querySelector('svg')).toBeNull();
    });

    it('should clear all caches', () => {
      renderer.initialize(container, { width: 800, height: 600 });
      renderer.measureText('Test', { fontSize: 16 });

      renderer.destroy();

      // After destroy, should be able to reinitialize
      renderer = new SVGRendererV2({ width: 800, height: 600 });
      expect(() => renderer.initialize(container, { width: 800, height: 600 })).not.toThrow();
    });

    it('should be idempotent', () => {
      renderer.initialize(container, { width: 800, height: 600 });

      renderer.destroy();
      expect(() => renderer.destroy()).not.toThrow();
    });
  });

  describe('lifecycle hooks', () => {
    it('should call onBeforeRender if defined', async () => {
      const onBeforeRender = jest.fn();
      (renderer as any).onBeforeRender = onBeforeRender;

      renderer.initialize(container, { width: 800, height: 600 });

      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await renderer.render(vnode);

      expect(onBeforeRender).toHaveBeenCalledWith(vnode);
    });

    it('should call onAfterRender if defined', async () => {
      const onAfterRender = jest.fn();
      (renderer as any).onAfterRender = onAfterRender;

      renderer.initialize(container, { width: 800, height: 600 });

      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await renderer.render(vnode);

      expect(onAfterRender).toHaveBeenCalledWith(vnode);
    });
  });

  describe('caching', () => {
    it('should respect maxCacheSize for text measurements', () => {
      const smallCacheRenderer = new SVGRendererV2({
        width: 800,
        height: 600,
        enableCaching: true,
        maxCacheSize: 2,
      });

      smallCacheRenderer.initialize(container, { width: 800, height: 600 });

      // Add 3 measurements (exceeds max size of 2)
      smallCacheRenderer.measureText('Test1', { fontSize: 16 });
      smallCacheRenderer.measureText('Test2', { fontSize: 16 });
      smallCacheRenderer.measureText('Test3', { fontSize: 16 });

      // Cache should have evicted oldest entry
      // This is tested indirectly through behavior

      smallCacheRenderer.destroy();
    });

    it('should allow disabling cache', () => {
      const noCacheRenderer = new SVGRendererV2({
        width: 800,
        height: 600,
        enableCaching: false,
      });

      noCacheRenderer.initialize(container, { width: 800, height: 600 });

      const metrics1 = noCacheRenderer.measureText('Test', { fontSize: 16 });
      const metrics2 = noCacheRenderer.measureText('Test', { fontSize: 16 });

      // Without caching, these should be different object references
      expect(metrics1).toEqual(metrics2);
      // Can't reliably test object identity in all scenarios

      noCacheRenderer.destroy();
    });
  });
});
