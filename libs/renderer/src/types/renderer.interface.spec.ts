import type { IRenderer, PerformanceMetrics, SVGRendererConfig, CanvasRendererConfig } from './renderer.interface';
import type { VNode } from './vnode.types';
import type { Rectangle } from '@grafloria/engine';

describe('IRenderer Interface', () => {
  describe('Renderer Contract', () => {
    test('should define mode property', () => {
      // Mock implementation
      const renderer: IRenderer = {
        mode: 'svg',
        render: jest.fn(),
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      expect(renderer.mode).toBe('svg');
    });

    test('should support both svg and canvas modes', () => {
      const svgRenderer: IRenderer = {
        mode: 'svg',
        render: jest.fn(),
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      const canvasRenderer: IRenderer = {
        mode: 'canvas',
        render: jest.fn(),
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      expect(svgRenderer.mode).toBe('svg');
      expect(canvasRenderer.mode).toBe('canvas');
    });

    test('should have render method', () => {
      const renderer: IRenderer = {
        mode: 'svg',
        render: jest.fn(),
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      expect(typeof renderer.render).toBe('function');
    });

    test('should have getPerformanceMetrics method', () => {
      const renderer: IRenderer = {
        mode: 'svg',
        render: jest.fn(),
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      expect(typeof renderer.getPerformanceMetrics).toBe('function');
    });

    test('should have dispose method', () => {
      const renderer: IRenderer = {
        mode: 'svg',
        render: jest.fn(),
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      expect(typeof renderer.dispose).toBe('function');
    });
  });

  describe('Render Method Signature', () => {
    test('should accept viewport and zoom parameters', () => {
      const renderMock = jest.fn();
      const renderer: IRenderer = {
        mode: 'svg',
        render: renderMock,
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      const viewport: Rectangle = { x: 0, y: 0, width: 1920, height: 1080 };
      const zoom = 1.0;

      renderer.render(viewport, zoom);

      expect(renderMock).toHaveBeenCalledWith(viewport, zoom);
    });

    test('should return VNode or void', () => {
      // SVG renderer returns VNode
      const svgRender = jest.fn().mockReturnValue({
        type: 'svg',
        props: {},
        children: []
      });

      const svgRenderer: IRenderer = {
        mode: 'svg',
        render: svgRender,
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      const result = svgRenderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0);
      expect(result).toBeDefined();
      expect((result as VNode).type).toBe('svg');

      // Canvas renderer returns void
      const canvasRender = jest.fn().mockReturnValue(undefined);

      const canvasRenderer: IRenderer = {
        mode: 'canvas',
        render: canvasRender,
        getPerformanceMetrics: jest.fn(),
        dispose: jest.fn()
      };

      const canvasResult = canvasRenderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1.0);
      expect(canvasResult).toBeUndefined();
    });
  });

  describe('PerformanceMetrics', () => {
    test('should have all required properties', () => {
      const metrics: PerformanceMetrics = {
        mode: 'svg',
        nodeCount: 100,
        linkCount: 50,
        renderTime: 12.5,
        fps: 60,
        memoryUsage: 1024000
      };

      expect(metrics.mode).toBe('svg');
      expect(metrics.nodeCount).toBe(100);
      expect(metrics.linkCount).toBe(50);
      expect(metrics.renderTime).toBe(12.5);
      expect(metrics.fps).toBe(60);
      expect(metrics.memoryUsage).toBe(1024000);
    });

    test('should support canvas mode', () => {
      const metrics: PerformanceMetrics = {
        mode: 'canvas',
        nodeCount: 1000,
        linkCount: 500,
        renderTime: 8.2,
        fps: 60,
        memoryUsage: 512000
      };

      expect(metrics.mode).toBe('canvas');
    });
  });

  describe('SVGRendererConfig', () => {
    test('should support optional caching configuration', () => {
      const config: SVGRendererConfig = {
        enableCaching: true,
        maxCacheSize: 1000
      };

      expect(config.enableCaching).toBe(true);
      expect(config.maxCacheSize).toBe(1000);
    });

    test('should support CSS mode flag', () => {
      const cssMode: SVGRendererConfig = {
        useCSSMode: true
      };

      const programmaticMode: SVGRendererConfig = {
        useCSSMode: false
      };

      expect(cssMode.useCSSMode).toBe(true);
      expect(programmaticMode.useCSSMode).toBe(false);
    });

    test('should allow empty config', () => {
      const config: SVGRendererConfig = {};

      expect(config).toBeDefined();
    });
  });

  describe('CanvasRendererConfig', () => {
    test('should support hit detection configuration', () => {
      const config: CanvasRendererConfig = {
        enableHitDetection: true,
        hitCanvasScale: 1.0
      };

      expect(config.enableHitDetection).toBe(true);
      expect(config.hitCanvasScale).toBe(1.0);
    });

    test('should allow empty config', () => {
      const config: CanvasRendererConfig = {};

      expect(config).toBeDefined();
    });
  });
});
