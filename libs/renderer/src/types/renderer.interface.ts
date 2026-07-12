import type { VNode } from './vnode.types';
import type { Rectangle } from './geometry.types';

/**
 * Renderer interface - contract for all renderers (SVG, Canvas, etc.)
 */
export interface IRenderer {
  /**
   * Renderer mode
   */
  readonly mode: 'svg' | 'canvas';

  /**
   * Render diagram to visual representation
   * @param viewport - Viewport rectangle in world coordinates
   * @param zoom - Current zoom level
   * @returns VNode tree (SVG mode) or void (Canvas mode - draws directly)
   */
  render(viewport: Rectangle, zoom: number): VNode | void;

  /**
   * Get performance metrics
   * @returns Current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics;

  /**
   * Dispose renderer and clean up resources
   */
  dispose(): void;
}

/**
 * Performance metrics returned by renderer
 */
export interface PerformanceMetrics {
  /**
   * Renderer mode
   */
  mode: 'svg' | 'canvas';

  /**
   * Number of nodes rendered
   */
  nodeCount: number;

  /**
   * Number of links rendered
   */
  linkCount: number;

  /**
   * Last render time in milliseconds
   */
  renderTime: number;

  /**
   * Current frames per second
   */
  fps: number;

  /**
   * Estimated memory usage in bytes
   */
  memoryUsage: number;
}

/**
 * SVG Renderer Configuration
 */
export interface SVGRendererConfig {
  /**
   * Enable VNode caching for performance
   * Default: true
   */
  enableCaching?: boolean;

  /**
   * Maximum number of VNodes to cache
   * Default: 1000
   */
  maxCacheSize?: number;

  /**
   * Use CSS classes and variables for styling
   * - true: Best for SVG+HTML with foreignObject (default)
   * - false: Programmatic styles (Canvas-compatible)
   * Default: true
   */
  useCSSMode?: boolean;

  /**
   * Width (px) of the invisible hit-area stroke rendered under every link so
   * thin lines are easy to click/hover. 0 disables it.
   * Default: 12
   */
  linkHitAreaWidth?: number;

  /**
   * Re-pick each link's connection sides dynamically from the nodes' relative
   * positions (draw.io-style floating connections). Visual only — the link's
   * assigned ports are never mutated, so toggling off restores them.
   * Default: false
   */
  smartConnectionPoints?: boolean;
}

/**
 * Canvas Renderer Configuration
 */
export interface CanvasRendererConfig {
  /**
   * Enable hit detection canvas
   * Default: true
   */
  enableHitDetection?: boolean;

  /**
   * Scale factor for hit detection canvas
   * Higher values = more accurate but slower
   * Default: 1.0
   */
  hitCanvasScale?: number;
}
