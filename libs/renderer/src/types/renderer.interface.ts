import type { VNode } from './vnode.types';
import type { Rectangle } from './geometry.types';
// Type-only (erased at runtime, so no import cycle): the export seam below is
// declared in terms of the real export module's contracts rather than a second,
// drifting copy of them.
import type { ForeignObjectMode } from '../export/vnode-serializer';
import type { RasterBackend } from '../export/raster';
import type { ExportScope } from '../export/bounds';
// Styling & theming (Wave 4): colorMode + the design-token bridge are RENDERER
// CONFIG, so their types belong on the config contract. Type-only imports — no
// runtime dependency from the types barrel into the themes barrel.
import type { ColorMode, ThemeSet } from '../themes/color-mode';
import type { TokenBridge } from '../themes/token-bridge';

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
   *
   * `'svg'` returns a STANDALONE, styles-inlined SVG document (no `var(--…)`, no
   * external references) — pure, deterministic and DOM-free, so it runs on a
   * server. The raster formats return a `data:` URL and need a rasterizer (see
   * {@link ExportOptions.rasterBackend}).
   *
   * Implemented by `SVGRenderer` (see `export/`).
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
 *
 * PDF is deliberately absent: a faithful vector PDF needs a font/glyph pipeline
 * (embedding + subsetting, or text→paths), which is a bigger lift than this card
 * had room for. SVG and the raster formats are real; PDF is not implemented, and
 * is not pretended to be.
 */
export type ExportFormat = 'png' | 'svg' | 'jpeg' | 'webp';

/**
 * Export options.
 *
 * The first three are the original contract. The rest were added when the seam
 * was actually implemented (`export/`), and every one of them is optional — the
 * zero-argument call `renderer.export()` produces a standalone, styles-inlined
 * SVG of the whole diagram.
 */
export interface ExportOptions {
  /** Image scale (default: 1) */
  scale?: number;

  /** JPEG/WebP quality 0-1 (default: 0.92) */
  quality?: number;

  /** Background color (default: transparent) */
  backgroundColor?: string;

  /**
   * World-space rectangle to export. Default: the diagram's content bounds — i.e.
   * the whole diagram, not whatever the user happens to be looking at.
   */
  viewport?: Rectangle;

  /** Margin (world units) around the content bounds. Default 20. Ignored with an explicit `viewport`. */
  padding?: number;

  /** How to serialize `<foreignObject>` (HTML-in-SVG) nodes. Default `'serialize'`. */
  foreignObject?: ForeignObjectMode;

  /**
   * Supply the live HTML mounted inside a foreignObject. The VNode tree does not
   * contain it (the patcher treats those subtrees as opaque), so a headless
   * exporter cannot know it — a browser-side caller can hand it back here.
   */
  captureForeignObject?: (vnode: VNode) => string | undefined;

  /**
   * CSS injected verbatim into the exported SVG's `<defs>`. The font seam: an
   * `@font-face` with a `data:` URI `src` makes the file carry its own glyphs.
   * We declare font families; we do not embed or subset fonts for you.
   */
  embedFontCss?: string;

  /**
   * Rasterizer for `png` / `jpeg` / `webp`. Defaults to a canvas-based backend
   * when one exists (browser main thread or worker via OffscreenCanvas). In plain
   * Node there is no SVG engine, so raster export THROWS unless you pass one
   * (resvg-js / sharp / puppeteer). SVG export never needs this.
   */
  rasterBackend?: RasterBackend;

  /**
   * WHAT to export.
   *
   *   'content'    (default) the whole diagram, tight around everything DRAWN
   *   'viewport'   an exact slice — you must also pass `viewport`, because the
   *                renderer does not retain one
   *   'selection'  only the currently-selected nodes/links
   */
  scope?: ExportScope;

  /**
   * Export only these node/link ids. The tree is PRUNED to them, so an un-selected
   * node's markup (and its labels) is not merely cropped out of view — it is not in
   * the file. Overridden by `scope: 'selection'`, which reads the live selection.
   */
  includeIds?: Iterable<string>;

  /**
   * Cap on the exported image's size per side, in px. Default 4000.
   *
   * Over the cap the SCALE is reduced to fit — the picture is never cropped. This
   * exists because browsers refuse very large canvases and do it SILENTLY: a 3x
   * export of a big diagram comes back blank rather than throwing.
   */
  maxSize?: number;

  /** Floor on the exported image's size per side, in px. Default 1. */
  minSize?: number;

  /** Prepend the `<?xml …?>` prolog to an SVG export. Default false. */
  xmlDeclaration?: boolean;

  /**
   * Carry the source model INSIDE the exported artifact, so it can be re-imported and
   * edited losslessly (`importDiagram`). An SVG gets it in `<metadata>`; a PNG gets an
   * `iTXt` chunk.
   *
   * PNG ONLY among the rasters. JPEG and WebP have no text chunk that reliably survives
   * their encoders, so an `embedModel` there would be a promise we could not keep — it
   * is ignored rather than silently half-working.
   */
  embedModel?: boolean;

  /**
   * The embedded envelope's `createdAt`. Supply it to keep an `embedModel` export
   * DETERMINISTIC — otherwise the envelope is stamped with the wall clock and two
   * exports of the same diagram differ in their bytes.
   */
  embedModelCreatedAt?: string;
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

  /**
   * Wave 4 (Edges & links) — Card 4. Fan out PARALLEL links: two or more links
   * between the same pair of nodes are pushed onto separate lanes instead of
   * being drawn on top of one another. Self-loops (source node === target node)
   * are always routed as loops regardless of this flag — a self-loop has no
   * sensible un-looped rendering.
   *
   * On by default: a stack of identical lines is never what anyone wanted, and a
   * lone link between a pair NEVER moves (its lane offset is exactly 0), so no
   * existing single-link diagram shifts by a pixel.
   * Default: true
   */
  parallelLinks?: boolean;

  /**
   * Distance between adjacent lanes of a parallel bundle, in px. Per-link
   * override: `LinkStyle.parallel.spacing`.
   * Default: 16
   */
  parallelSpacing?: number;

  /**
   * Wave 5 (Edge routing) — Card 4. Channel nudging: orthogonal segments of
   * DIFFERENT links that share a corridor (closer than ~4px — i.e. visually on
   * top of each other) are separated onto parallel lanes, spaced by
   * `parallelSpacing`, with lane ORDER chosen by each member's exit side so
   * corridor-mates stop crossing at the corridor mouth. Port stubs never move
   * (the jetty guarantee outranks lane separation); a corridor that cannot be
   * separated safely is left alone rather than half-moved.
   *
   * Same-pair bundles are Wave 4's fan-out, not this: fanned members sit a full
   * `parallelSpacing` apart and therefore never trigger the nudge.
   * Default: true
   */
  channelNudging?: boolean;

  /**
   * Wave 5 (Edge routing) — Card 5. Who draws the arc when two jump-drawing
   * links cross: 'both' (legacy double bridge, default) or 'single' — exactly
   * one deterministic owner per intersection (horizontal arcs over vertical;
   * ties break on link id). See EdgeOptimizerOptions.jumpOwnership.
   */
  jumpOwnership?: 'both' | 'single';

  /**
   * Wave 4 — Card 7. Run the diagram-wide edge optimizer: ONE incremental pass
   * that computes jump-overs for every link and auto-places the labels that opted
   * in via `LinkLabel.autoOffset`.
   *
   * On by default, and it is also the FASTER path — the jump scan it replaces
   * re-tested every link against every other link on every frame; this one only
   * re-tests what moved. Turn it off to fall back to the per-link scan.
   * Default: true
   */
  edgeOptimizer?: boolean;

  /**
   * Styling & theming — Card "colorMode".
   *
   * Which of {@link SVGRendererConfig.themes} is active.
   *   'light' | 'dark'  — pinned.
   *   'system'          — follows `prefers-color-scheme`, and RE-THEMES LIVE when
   *                       the OS flips, by rewriting this instance's `--grafloria-*`
   *                       variables (no diagram rebuild).
   *
   * Whatever the mode, an explicit `prefers-contrast: more` or a forced-colors
   * mode upgrades to the matching high-contrast theme when one is supplied — an
   * accessibility preference outranks an aesthetic one.
   *
   * Leave it unset to keep the legacy behaviour: the `theme` constructor argument
   * is used as-is and nothing is watched.
   */
  colorMode?: ColorMode;

  /**
   * The themes `colorMode` switches between. Defaults to the built-in
   * LIGHT/DARK/HIGH_CONTRAST set. Only consulted when `colorMode` is set.
   */
  themes?: ThemeSet;

  /**
   * Styling & theming — Card "design-token bridge".
   *
   * Re-point Grafloria's CSS variables at the host design system's tokens
   * (`shadcnBridge()`, `muiBridge()`, `tailwindBridge()`, or a hand-written map).
   * Emitted as a variable block that overrides the theme's, so it re-skins the
   * whole engine without touching a node template.
   */
  tokenBridge?: TokenBridge;
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
