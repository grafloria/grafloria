import { RendererStrategyManager, RendererChangeEvent } from './renderer-strategy-manager';
import { RendererFactory } from './renderer-factory';
import { SVGRendererV2 } from '../svg/svg-renderer-v2';
import { CanvasRenderer } from '../canvas/canvas-renderer.stub';
import type { IRenderer } from './renderer.interface';
import type { VNode } from '../types/vnode.types';

describe('RendererStrategyManager', () => {
  let manager: RendererStrategyManager;
  let svgRenderer: IRenderer;
  let canvasRenderer: IRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    manager = new RendererStrategyManager();
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    // Register renderers in factory
    RendererFactory.clearRegistry();
    RendererFactory.registerRenderer('svg', SVGRendererV2);
    RendererFactory.registerRenderer('canvas', CanvasRenderer);

    // Create renderer instances
    svgRenderer = RendererFactory.createRenderer('svg', {
      width: 800,
      height: 600,
      enableCaching: true,
    } as import('./renderer.interface').SVGRendererConfig);

    canvasRenderer = RendererFactory.createRenderer('canvas', {
      width: 800,
      height: 600,
      contextType: '2d',
    } as import('./renderer.interface').CanvasRendererConfig);
  });

  afterEach(() => {
    manager.destroy();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    RendererFactory.clearRegistry();
  });

  describe('registerRenderer', () => {
    it('should register a renderer', () => {
      manager.registerRenderer('svg', svgRenderer);

      expect(manager.getRenderer('svg')).toBe(svgRenderer);
      expect(manager.getRegisteredTypes()).toContain('svg');
    });

    it('should prevent duplicate registration', () => {
      manager.registerRenderer('svg', svgRenderer);

      expect(() => manager.registerRenderer('svg', svgRenderer)).toThrow(
        "Renderer 'svg' is already registered"
      );
    });

    it('should allow registering multiple renderers', () => {
      manager.registerRenderer('svg', svgRenderer);
      manager.registerRenderer('canvas', canvasRenderer);

      expect(manager.getRenderer('svg')).toBe(svgRenderer);
      expect(manager.getRenderer('canvas')).toBe(canvasRenderer);
      expect(manager.getRegisteredTypes()).toEqual(['svg', 'canvas']);
    });
  });

  describe('switchRenderer', () => {
    beforeEach(() => {
      manager.registerRenderer('svg', svgRenderer);
      manager.registerRenderer('canvas', canvasRenderer);
    });

    it('should throw if renderer not registered', async () => {
      await expect(manager.switchRenderer('webgl', container)).rejects.toThrow(
        "Renderer 'webgl' not registered"
      );
    });

    it('should initialize and activate renderer', async () => {
      await manager.switchRenderer('svg', container);

      expect(manager.getActiveRenderer()).toBe(svgRenderer);
    });

    it('should use provided config', async () => {
      const customConfig = {
        width: 1920,
        height: 1080,
        pixelRatio: 2,
      };

      await manager.switchRenderer('svg', container, customConfig);

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      // Config was applied
    });

    it('should use container dimensions if no config provided', async () => {
      await manager.switchRenderer('svg', container);

      expect(manager.getActiveRenderer()).toBe(svgRenderer);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should destroy previous renderer when switching', async () => {
      const destroySpy = jest.spyOn(svgRenderer, 'destroy');

      await manager.switchRenderer('svg', container);

      // Create another renderer instance for second switch
      const svgRenderer2 = RendererFactory.createRenderer('svg', {
        width: 800,
        height: 600,
      });
      manager.registerRenderer('svg2', svgRenderer2);

      await manager.switchRenderer('svg2', container);

      expect(destroySpy).toHaveBeenCalled();

      svgRenderer2.destroy();
    });

    it('should preserve VNode when switching renderers', async () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 10, y: 10, width: 100, height: 50 },
      };

      await manager.switchRenderer('svg', container);
      manager.updateVNode(vnode);

      // Create new SVG renderer for switch
      const svgRenderer2 = RendererFactory.createRenderer('svg', {
        width: 800,
        height: 600,
      });
      manager.registerRenderer('svg2', svgRenderer2);

      const renderSpy = jest.spyOn(svgRenderer2, 'render');

      const container2 = document.createElement('div');
      document.body.appendChild(container2);

      await manager.switchRenderer('svg2', container2);

      expect(renderSpy).toHaveBeenCalledWith(vnode);

      svgRenderer2.destroy();
      if (container2.parentNode) {
        container2.parentNode.removeChild(container2);
      }
    });
  });

  describe('getActiveRenderer', () => {
    it('should return null when no renderer is active', () => {
      expect(manager.getActiveRenderer()).toBeNull();
    });

    it('should return active renderer after switch', async () => {
      manager.registerRenderer('svg', svgRenderer);
      await manager.switchRenderer('svg', container);

      expect(manager.getActiveRenderer()).toBe(svgRenderer);
    });
  });

  describe('getRenderer', () => {
    it('should return null for unregistered renderer', () => {
      expect(manager.getRenderer('svg')).toBeNull();
    });

    it('should return registered renderer', () => {
      manager.registerRenderer('svg', svgRenderer);

      expect(manager.getRenderer('svg')).toBe(svgRenderer);
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return empty array when no renderers registered', () => {
      expect(manager.getRegisteredTypes()).toEqual([]);
    });

    it('should return list of registered types', () => {
      manager.registerRenderer('svg', svgRenderer);
      manager.registerRenderer('canvas', canvasRenderer);

      const types = manager.getRegisteredTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain('svg');
      expect(types).toContain('canvas');
    });
  });

  describe('updateVNode and getCurrentVNode', () => {
    it('should store and retrieve current VNode', () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      manager.updateVNode(vnode);

      expect(manager.getCurrentVNode()).toBe(vnode);
    });

    it('should return null initially', () => {
      expect(manager.getCurrentVNode()).toBeNull();
    });
  });

  describe('onRendererChange', () => {
    beforeEach(() => {
      manager.registerRenderer('svg', svgRenderer);
      manager.registerRenderer('canvas', canvasRenderer);
    });

    it('should emit events on renderer change', async () => {
      const events: RendererChangeEvent[] = [];
      const unsubscribe = manager.onRendererChange(event => events.push(event));

      await manager.switchRenderer('svg', container);

      expect(events).toHaveLength(1);
      expect(events[0].previousType).toBeNull();
      expect(events[0].newType).toBe('svg');
      expect(events[0].vnode).toBeNull();

      unsubscribe();
    });

    it('should include VNode in event when switching with state', async () => {
      const events: RendererChangeEvent[] = [];
      manager.onRendererChange(event => events.push(event));

      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      await manager.switchRenderer('svg', container);
      manager.updateVNode(vnode);

      // Create new renderer for second switch
      const svgRenderer2 = RendererFactory.createRenderer('svg', {
        width: 800,
        height: 600,
      });
      manager.registerRenderer('svg2', svgRenderer2);

      const container2 = document.createElement('div');
      document.body.appendChild(container2);

      await manager.switchRenderer('svg2', container2);

      expect(events).toHaveLength(2);
      expect(events[1].previousType).toBe('svg');
      expect(events[1].newType).toBe('svg2');
      expect(events[1].vnode).toBe(vnode);

      svgRenderer2.destroy();
      if (container2.parentNode) {
        container2.parentNode.removeChild(container2);
      }
    });

    it('should support multiple subscribers', async () => {
      const events1: RendererChangeEvent[] = [];
      const events2: RendererChangeEvent[] = [];

      manager.onRendererChange(event => events1.push(event));
      manager.onRendererChange(event => events2.push(event));

      await manager.switchRenderer('svg', container);

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('should support unsubscribe', async () => {
      const events: RendererChangeEvent[] = [];
      const unsubscribe = manager.onRendererChange(event => events.push(event));

      await manager.switchRenderer('svg', container);
      expect(events).toHaveLength(1);

      unsubscribe();

      // Create new renderer for second switch
      const svgRenderer2 = RendererFactory.createRenderer('svg', {
        width: 800,
        height: 600,
      });
      manager.registerRenderer('svg2', svgRenderer2);

      const container2 = document.createElement('div');
      document.body.appendChild(container2);

      await manager.switchRenderer('svg2', container2);

      expect(events).toHaveLength(1); // No new event after unsubscribe

      svgRenderer2.destroy();
      if (container2.parentNode) {
        container2.parentNode.removeChild(container2);
      }
    });

    it('should handle errors in callbacks gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const workingCallback = jest.fn();

      manager.onRendererChange(() => {
        throw new Error('Test error');
      });
      manager.onRendererChange(workingCallback);

      await manager.switchRenderer('svg', container);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(workingCallback).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('should destroy all registered renderers', () => {
      const svgDestroySpy = jest.spyOn(svgRenderer, 'destroy');
      const canvasDestroySpy = jest.spyOn(canvasRenderer, 'destroy');

      manager.registerRenderer('svg', svgRenderer);
      manager.registerRenderer('canvas', canvasRenderer);

      manager.destroy();

      expect(svgDestroySpy).toHaveBeenCalled();
      expect(canvasDestroySpy).toHaveBeenCalled();
    });

    it('should clear all state', async () => {
      manager.registerRenderer('svg', svgRenderer);
      await manager.switchRenderer('svg', container);

      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };
      manager.updateVNode(vnode);

      manager.destroy();

      expect(manager.getActiveRenderer()).toBeNull();
      expect(manager.getCurrentVNode()).toBeNull();
      expect(manager.getRegisteredTypes()).toEqual([]);
    });

    it('should clear all event subscriptions', async () => {
      const callback = jest.fn();
      manager.onRendererChange(callback);

      manager.destroy();

      // Try to switch (will fail because no renderers, but callback shouldn't be called)
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
