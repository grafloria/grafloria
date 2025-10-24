import { CanvasRenderer } from './canvas-renderer.stub';
import type { VNode } from '../types/vnode.types';

describe('CanvasRenderer Stub', () => {
  let renderer: CanvasRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    renderer = new CanvasRenderer({
      width: 800,
      height: 600,
      contextType: '2d',
    });
    container = document.createElement('div');
  });

  describe('type and capabilities', () => {
    it('should have correct type identifier', () => {
      expect(renderer.type).toBe('canvas');
    });

    it('should report correct capabilities for Phase A stub', () => {
      expect(renderer.capabilities).toEqual({
        supportsHitTest: false,
        supportsBatching: true,
        supportsExport: false,
        supportsMeasurement: false,
        supportsForeignObject: false,
        supportsFilters: false,
        supportsOffscreen: true,
      });
    });
  });

  describe('not implemented methods', () => {
    const notImplementedError = 'CanvasRenderer is not implemented in Phase A. Coming in Phase B.';

    it('should throw on initialize', () => {
      expect(() => renderer.initialize(container, { width: 800, height: 600 })).toThrow(
        notImplementedError
      );
    });

    it('should throw on render', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await expect(renderer.render(vnode)).rejects.toThrow(notImplementedError);
    });

    it('should throw on update', async () => {
      await expect(renderer.update([])).rejects.toThrow(notImplementedError);
    });

    it('should throw on clear', () => {
      expect(() => renderer.clear()).toThrow(notImplementedError);
    });

    it('should throw on measureText', () => {
      expect(() => renderer.measureText('test', { fontSize: 16 })).toThrow(notImplementedError);
    });

    it('should throw on measureElement', () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      expect(() => renderer.measureElement(vnode)).toThrow(notImplementedError);
    });

    it('should throw on hitTest', () => {
      expect(() => renderer.hitTest(50, 50)).toThrow(notImplementedError);
    });

    it('should throw on export', async () => {
      await expect(renderer.export('png')).rejects.toThrow(notImplementedError);
    });
  });

  describe('destroy', () => {
    it('should not throw on destroy (no-op)', () => {
      expect(() => renderer.destroy()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      renderer.destroy();
      expect(() => renderer.destroy()).not.toThrow();
    });
  });

  describe('constructor', () => {
    it('should accept Canvas-specific configuration', () => {
      const customRenderer = new CanvasRenderer({
        width: 1920,
        height: 1080,
        contextType: 'webgl',
        imageSmoothingEnabled: false,
        enableRetina: true,
        enableHitDetection: false,
        hitCanvasScale: 0.5,
      });

      expect(customRenderer).toBeDefined();
      expect(customRenderer.type).toBe('canvas');
    });
  });
});
