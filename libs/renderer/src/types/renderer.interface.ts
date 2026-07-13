import type { VNode } from './vnode.types';
import type { Rectangle } from './geometry.types';

/**
 * Renderer interface — the contract for a DIAGRAM renderer: it turns the model
 * plus a viewport into a visual representation (a VNode tree in SVG mode).
 *
 * This is the only renderer interface. A second `IRenderer` used to live in
 * `core/renderer.interface.ts` describing a different layer — a VNode → DOM
 * *consumer* (initialize/render/clear/destroy against a container) — together
 * with an unused stack (SVGRendererV2, a throwing Canvas stub, HybridRenderer,
 * RendererFactory, RendererStrategyManager). Nothing in production implemented
 * it: the real VNode → DOM layer is the patcher in `vnode/patch.ts`. The stack
 * is deleted; the useful vocabulary it defined is kept below, as OPTIONAL
 * members here, so capability detection / export / hit-testing / text
 * measurement have a home when a renderer actually implements them.
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

  /**
   * Optional: capability flags for runtime feature detection, so callers can ask
   * instead of assuming (e.g. "can this renderer do foreignObject?").
   */
  readonly capabilities?: RendererCapabilities;

  /**
   * Optional: element at a coordinate (selection, hover, click routing).
   * @param x - X coordinate in world space
   * @param y - Y coordinate in world space
   */
  hitTest?(x: number, y: number): VNode | null;

  /**
   * Optional: measure text for layout (wrapping, ellipsis, shape-fit).
   * Implementations are expected to cache.
   */
  measureText?(text: string, style: TextStyle): TextMetrics;

  /**
   * Optional: export the rendered diagram as an image or SVG string.
   */
  export?(format: ExportFormat, options?: ExportOptions): Promise<string>;
}

/**
 * Renderer capability flags for runtime feature detection.
 */
export interface RendererCapabilities {
  /** Can perform hit testing (element at coordinate) */
  supportsHitTest: boolean;

  /** Can batch multiple render operations */
  supportsBatching: boolean;

  /** Can export as image/SVG */
  supportsExport: boolean;

  /** Can measure text/elements accurately */
  supportsMeasurement: boolean;

  /** Can render foreignObject (HTML inside SVG) */
  supportsForeignObject: boolean;

  /** Can apply filters/effects */
  supportsFilters: boolean;

  /** Can render to an offscreen buffer */
  supportsOffscreen: boolean;
}

/**
 * Text styling for measurement.
 */
export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
}

/**
 * Text measurement result.
 */
export interface TextMetrics {
  width: number;
  height: number;
  baseline: number;
}

/**
 * Bounding box result.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Export format types.
 */
export type ExportFormat = 'png' | 'svg' | 'jpeg' | 'webp';

/**
 * Export options.
 */
export interface ExportOptions {
  /** Image scale (default: 1) */
  scale?: number;

  /** JPEG/WebP quality 0-1 (default: 0.92) */
  quality?: number;

  /** Background color (default: transparent) */
  backgroundColor?: string;
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
   * positions (draw.io-style floating connections). Visible ports are the
   * contract: when the node shows ports on the chosen side (visibility
   * 'always' via the port → node → global chain) the link snaps to the
   * closest one; with ports hidden the attachment floats along the shape's
   * real outline (rect/ellipse/circle/hexagon/diamond). Visual only — the
   * link's assigned ports are never mutated, so toggling off restores them.
   * Default: false
   */
  smartConnectionPoints?: boolean;

  /**
   * Force this renderer's instance scope (`data-grafloria-instance`, and the id of
   * its `<style>` block) instead of taking the next value from the per-process
   * counter.
   *
   * REQUIRED for SSR hydration (Card 6): the counter starts at 0 in every
   * process, so a server render is `grafloria-1` while the browser — which may
   * already have mounted other diagrams — would pick `grafloria-4`. The root `<svg>`
   * attribute would then differ between the server HTML and the first client
   * VNode, and the patcher would rewrite it: a flash. `renderToStaticSVG()`
   * returns the id it used in its snapshot; `createDiagram({ hydrate })` passes
   * it straight back in here.
   */
  instanceId?: string;
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
