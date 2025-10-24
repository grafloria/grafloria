import type { IRenderer, RendererConfig, RendererConstructor } from './renderer.interface';

/**
 * Factory for creating renderer instances.
 * Follows the Factory design pattern to abstract renderer creation.
 */
export class RendererFactory {
  private static rendererRegistry = new Map<string, RendererConstructor>();

  /**
   * Register a renderer type.
   * This allows users to add custom renderers.
   *
   * @param type - Renderer type identifier (e.g., 'svg', 'canvas')
   * @param constructor - Renderer class constructor
   *
   * @example
   * RendererFactory.registerRenderer('svg', SVGRenderer);
   * RendererFactory.registerRenderer('canvas', CanvasRenderer);
   */
  static registerRenderer(type: string, constructor: RendererConstructor): void {
    if (this.rendererRegistry.has(type)) {
      throw new Error(`Renderer type '${type}' is already registered`);
    }
    this.rendererRegistry.set(type, constructor);
  }

  /**
   * Create a renderer instance.
   *
   * @param type - Renderer type ('svg', 'canvas', etc.)
   * @param config - Renderer configuration
   * @returns Renderer instance
   * @throws Error if renderer type not registered
   *
   * @example
   * const renderer = RendererFactory.createRenderer('svg', {
   *   width: 1920,
   *   height: 1080,
   *   preserveAspectRatio: 'xMidYMid meet'
   * });
   */
  static createRenderer(type: string, config: RendererConfig): IRenderer {
    const RendererClass = this.rendererRegistry.get(type);

    if (!RendererClass) {
      const availableTypes = Array.from(this.rendererRegistry.keys()).join(', ');
      throw new Error(
        `Renderer type '${type}' not found. Available types: ${availableTypes || 'none'}`
      );
    }

    return new RendererClass(config);
  }

  /**
   * Get list of registered renderer types.
   */
  static getAvailableRenderers(): string[] {
    return Array.from(this.rendererRegistry.keys());
  }

  /**
   * Check if renderer type is registered.
   */
  static hasRenderer(type: string): boolean {
    return this.rendererRegistry.has(type);
  }

  /**
   * Unregister a renderer type (for testing).
   */
  static unregisterRenderer(type: string): void {
    this.rendererRegistry.delete(type);
  }

  /**
   * Clear all registered renderers (for testing).
   */
  static clearRegistry(): void {
    this.rendererRegistry.clear();
  }
}
