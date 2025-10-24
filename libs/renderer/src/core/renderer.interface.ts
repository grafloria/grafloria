import type { VNode } from '../types/vnode.types';

/**
 * Base renderer interface that all rendering strategies must implement.
 * This abstraction enables switching between SVG, Canvas, WebGL, etc.
 */
export interface IRenderer {
  /**
   * Unique identifier for this renderer type.
   * Examples: 'svg', 'canvas', 'webgl'
   */
  readonly type: string;

  /**
   * Renderer capabilities for runtime feature detection.
   */
  readonly capabilities: RendererCapabilities;

  /**
   * Initialize the renderer with a DOM container.
   * This creates the underlying rendering context (SVG element, Canvas context, etc.)
   *
   * @param container - DOM element to render into
   * @param config - Renderer-specific configuration
   * @throws Error if container is invalid or renderer already initialized
   */
  initialize(container: HTMLElement, config: RendererConfig): void;

  /**
   * Render a VNode tree to the container.
   * This is the main rendering method called by DiagramCanvasComponent.
   *
   * @param vnode - Virtual node tree to render
   * @param options - Rendering options (immediate vs batched)
   * @returns Promise that resolves when rendering completes
   */
  render(vnode: VNode, options?: RenderOptions): Promise<void>;

  /**
   * Update specific nodes without full re-render.
   * This is an optimization for incremental updates.
   *
   * @param updates - Array of node updates with paths and new VNodes
   * @returns Promise that resolves when updates complete
   */
  update(updates: NodeUpdate[]): Promise<void>;

  /**
   * Clear the entire canvas/SVG.
   * Called when diagram is cleared or component unmounted.
   */
  clear(): void;

  /**
   * Measure text dimensions for layout calculations.
   * Results are cached for performance.
   *
   * @param text - Text content to measure
   * @param style - Text styling (font, size, weight, etc.)
   * @returns Text dimensions in pixels
   */
  measureText(text: string, style: TextStyle): TextMetrics;

  /**
   * Measure element bounding box.
   * Used for collision detection, auto-layout, etc.
   *
   * @param vnode - Virtual node to measure
   * @returns Bounding box in pixels
   */
  measureElement(vnode: VNode): BoundingBox;

  /**
   * Perform hit testing to find element at coordinates.
   * Used for selection, hover effects, click handling.
   *
   * @param x - X coordinate in viewport space
   * @param y - Y coordinate in viewport space
   * @returns VNode at coordinates or null
   */
  hitTest(x: number, y: number): VNode | null;

  /**
   * Export diagram as image or SVG string.
   * Format depends on renderer type.
   *
   * @param format - Export format ('png', 'svg', 'jpeg')
   * @param options - Export options (scale, quality, etc.)
   * @returns Data URL or SVG string
   */
  export(format: ExportFormat, options?: ExportOptions): Promise<string>;

  /**
   * Clean up resources and remove DOM elements.
   * Called when renderer is switched or component unmounted.
   */
  destroy(): void;

  /**
   * Lifecycle hook called before render.
   * Can be used for setup, validation, etc.
   */
  onBeforeRender?(vnode: VNode): void;

  /**
   * Lifecycle hook called after render completes.
   * Can be used for cleanup, animations, etc.
   */
  onAfterRender?(vnode: VNode): void;
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

  /** Can render to offscreen buffer */
  supportsOffscreen: boolean;
}

/**
 * Base configuration for all renderers.
 */
export interface RendererConfig {
  /** Canvas width in pixels */
  width: number;

  /** Canvas height in pixels */
  height: number;

  /** Device pixel ratio (default: window.devicePixelRatio) */
  pixelRatio?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Enable performance profiling */
  profiling?: boolean;
}

/**
 * SVG-specific renderer configuration.
 */
export interface SVGRendererConfig extends RendererConfig {
  /** Preserve aspect ratio (default: 'xMidYMid meet') */
  preserveAspectRatio?: string;

  /** Enable CSS styling on SVG elements */
  enableCSSClasses?: boolean;

  /** Namespace for CSS classes (default: 'diagram') */
  cssNamespace?: string;

  /** Enable VNode caching for performance (default: true) */
  enableCaching?: boolean;

  /** Maximum number of VNodes to cache (default: 1000) */
  maxCacheSize?: number;

  /** Use CSS classes and variables for styling (default: true) */
  useCSSMode?: boolean;
}

/**
 * Canvas-specific renderer configuration (Phase B).
 */
export interface CanvasRendererConfig extends RendererConfig {
  /** Canvas context type ('2d' or 'webgl') */
  contextType: '2d' | 'webgl';

  /** Enable image smoothing (default: true) */
  imageSmoothingEnabled?: boolean;

  /** Enable retina rendering (default: true) */
  enableRetina?: boolean;

  /** Enable hit detection canvas (default: true) */
  enableHitDetection?: boolean;

  /** Scale factor for hit detection canvas (default: 1.0) */
  hitCanvasScale?: number;
}

/**
 * Rendering options passed to render() method.
 */
export interface RenderOptions {
  /** Use batched rendering (default: false) */
  batched?: boolean;

  /** Render to offscreen buffer (default: false) */
  offscreen?: boolean;

  /** Skip rendering if VNode unchanged (default: true) */
  skipUnchanged?: boolean;
}

/**
 * Node update for incremental rendering.
 */
export interface NodeUpdate {
  /** Path to node in VNode tree (e.g., 'children.0.children.2') */
  path: string;

  /** New VNode to replace at path */
  vnode: VNode;
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
 * Type for renderer constructors.
 */
export type RendererConstructor = new (config: any) => IRenderer;
