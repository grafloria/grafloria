import type { IRenderer, RendererConfig } from './renderer.interface';
import type { VNode } from '../types/vnode.types';

/**
 * Event emitted when renderer changes.
 */
export interface RendererChangeEvent {
  previousType: string | null;
  newType: string;
  vnode: VNode | null;
}

/**
 * Callback function for renderer change events
 */
export type RendererChangeCallback = (event: RendererChangeEvent) => void;

/**
 * Service for managing and switching between multiple renderers.
 * Handles state preservation when switching strategies.
 *
 * Note: This is a framework-agnostic implementation.
 * For Angular, consider wrapping this in an @Injectable service.
 */
export class RendererStrategyManager {
  private renderers = new Map<string, IRenderer>();
  private activeRenderer: IRenderer | null = null;
  private currentVNode: VNode | null = null;
  private container: HTMLElement | null = null;
  private changeCallbacks: RendererChangeCallback[] = [];

  /**
   * Register a renderer instance.
   *
   * @param type - Renderer type identifier
   * @param renderer - Renderer instance
   *
   * @example
   * const svgRenderer = RendererFactory.createRenderer('svg', svgConfig);
   * manager.registerRenderer('svg', svgRenderer);
   */
  registerRenderer(type: string, renderer: IRenderer): void {
    if (this.renderers.has(type)) {
      throw new Error(`Renderer '${type}' is already registered`);
    }
    this.renderers.set(type, renderer);
  }

  /**
   * Switch to a different renderer.
   * Preserves diagram state (VNode tree) during switch.
   *
   * @param type - Renderer type to switch to
   * @param container - DOM container for new renderer
   * @param config - Configuration for the new renderer
   * @returns Promise that resolves when switch completes
   *
   * @example
   * await manager.switchRenderer('canvas', containerElement, { width: 800, height: 600 });
   */
  async switchRenderer(
    type: string,
    container: HTMLElement,
    config?: RendererConfig
  ): Promise<void> {
    const newRenderer = this.renderers.get(type);

    if (!newRenderer) {
      throw new Error(`Renderer '${type}' not registered. Call registerRenderer() first.`);
    }

    const previousType = this.activeRenderer?.type || null;

    // Save current state
    const savedVNode = this.currentVNode;

    // Destroy old renderer
    if (this.activeRenderer) {
      this.activeRenderer.destroy();
    }

    // Initialize new renderer
    const rendererConfig = config || {
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
    };

    newRenderer.initialize(container, rendererConfig);

    // Restore state
    if (savedVNode) {
      await newRenderer.render(savedVNode);
    }

    this.activeRenderer = newRenderer;
    this.container = container;

    // Emit event
    this.emitRendererChange({
      previousType,
      newType: type,
      vnode: savedVNode,
    });
  }

  /**
   * Get currently active renderer.
   */
  getActiveRenderer(): IRenderer | null {
    return this.activeRenderer;
  }

  /**
   * Get renderer by type.
   */
  getRenderer(type: string): IRenderer | null {
    return this.renderers.get(type) || null;
  }

  /**
   * Get list of registered renderer types.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.renderers.keys());
  }

  /**
   * Update current VNode (called by components after render).
   */
  updateVNode(vnode: VNode): void {
    this.currentVNode = vnode;
  }

  /**
   * Get current VNode.
   */
  getCurrentVNode(): VNode | null {
    return this.currentVNode;
  }

  /**
   * Subscribe to renderer change events.
   * Returns unsubscribe function.
   */
  onRendererChange(callback: RendererChangeCallback): () => void {
    this.changeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index > -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Cleanup all renderers.
   */
  destroy(): void {
    for (const renderer of this.renderers.values()) {
      renderer.destroy();
    }
    this.renderers.clear();
    this.activeRenderer = null;
    this.currentVNode = null;
    this.container = null;
    this.changeCallbacks = [];
  }

  /**
   * Emit renderer change event to all subscribers
   */
  private emitRendererChange(event: RendererChangeEvent): void {
    this.changeCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in renderer change callback:', error);
      }
    });
  }
}
