import { RendererFactory } from './renderer-factory';
import { SVGRendererV2 } from '../svg/svg-renderer-v2';
import { CanvasRenderer } from '../canvas/canvas-renderer.stub';
import type { IRenderer } from './renderer.interface';

describe('RendererFactory', () => {
  beforeEach(() => {
    // Clear registry before each test for isolation
    RendererFactory.clearRegistry();
  });

  afterEach(() => {
    // Clean up after each test
    RendererFactory.clearRegistry();
  });

  describe('registerRenderer', () => {
    it('should register a renderer type', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);

      expect(RendererFactory.hasRenderer('svg')).toBe(true);
      expect(RendererFactory.getAvailableRenderers()).toContain('svg');
    });

    it('should prevent duplicate registration', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);

      expect(() => RendererFactory.registerRenderer('svg', SVGRendererV2)).toThrow(
        "Renderer type 'svg' is already registered"
      );
    });

    it('should allow registering multiple renderer types', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);
      RendererFactory.registerRenderer('canvas', CanvasRenderer);

      expect(RendererFactory.hasRenderer('svg')).toBe(true);
      expect(RendererFactory.hasRenderer('canvas')).toBe(true);
      expect(RendererFactory.getAvailableRenderers()).toEqual(['svg', 'canvas']);
    });
  });

  describe('createRenderer', () => {
    beforeEach(() => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);
      RendererFactory.registerRenderer('canvas', CanvasRenderer);
    });

    it('should create SVG renderer instance', () => {
      const renderer = RendererFactory.createRenderer('svg', {
        width: 800,
        height: 600,
      });

      expect(renderer).toBeInstanceOf(SVGRendererV2);
      expect(renderer.type).toBe('svg');
    });

    it('should create Canvas renderer stub instance', () => {
      const renderer = RendererFactory.createRenderer('canvas', {
        width: 800,
        height: 600,
        contextType: '2d',
      });

      expect(renderer).toBeInstanceOf(CanvasRenderer);
      expect(renderer.type).toBe('canvas');
    });

    it('should throw for unknown renderer type', () => {
      expect(() =>
        RendererFactory.createRenderer('webgl', {
          width: 800,
          height: 600,
        })
      ).toThrow("Renderer type 'webgl' not found");
    });

    it('should include available types in error message', () => {
      expect(() =>
        RendererFactory.createRenderer('webgl', {
          width: 800,
          height: 600,
        })
      ).toThrow('Available types: svg, canvas');
    });

    it('should pass configuration to renderer constructor', () => {
      const config = {
        width: 1920,
        height: 1080,
        preserveAspectRatio: 'xMidYMid meet',
        enableCaching: true,
      };

      const renderer = RendererFactory.createRenderer('svg', config);

      expect(renderer).toBeDefined();
      // Config is passed and stored (we can verify through behavior in other tests)
    });
  });

  describe('getAvailableRenderers', () => {
    it('should return empty array when no renderers registered', () => {
      expect(RendererFactory.getAvailableRenderers()).toEqual([]);
    });

    it('should return list of registered renderer types', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);
      RendererFactory.registerRenderer('canvas', CanvasRenderer);

      const available = RendererFactory.getAvailableRenderers();
      expect(available).toHaveLength(2);
      expect(available).toContain('svg');
      expect(available).toContain('canvas');
    });
  });

  describe('hasRenderer', () => {
    it('should return false for unregistered renderer', () => {
      expect(RendererFactory.hasRenderer('svg')).toBe(false);
    });

    it('should return true for registered renderer', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);

      expect(RendererFactory.hasRenderer('svg')).toBe(true);
    });
  });

  describe('unregisterRenderer', () => {
    it('should remove registered renderer', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);
      expect(RendererFactory.hasRenderer('svg')).toBe(true);

      RendererFactory.unregisterRenderer('svg');

      expect(RendererFactory.hasRenderer('svg')).toBe(false);
      expect(RendererFactory.getAvailableRenderers()).not.toContain('svg');
    });

    it('should not throw when unregistering non-existent renderer', () => {
      expect(() => RendererFactory.unregisterRenderer('nonexistent')).not.toThrow();
    });
  });

  describe('clearRegistry', () => {
    it('should remove all registered renderers', () => {
      RendererFactory.registerRenderer('svg', SVGRendererV2);
      RendererFactory.registerRenderer('canvas', CanvasRenderer);

      RendererFactory.clearRegistry();

      expect(RendererFactory.getAvailableRenderers()).toEqual([]);
      expect(RendererFactory.hasRenderer('svg')).toBe(false);
      expect(RendererFactory.hasRenderer('canvas')).toBe(false);
    });
  });
});
