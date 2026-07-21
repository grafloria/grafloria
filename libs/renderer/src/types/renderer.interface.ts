import type { VNode } from './vnode.types';
import type { Rectangle } from './geometry.types';
// Type-only (erased at runtime, so no import cycle): the export seam below is
// declared in terms of the real export module's contracts rather than a second,
// drifting copy of them.
import type { ForeignObjectMode } from '../export/vnode-serializer';
import type { RasterBackend } from '../export/raster';
import type { ExportScope } from '../export/bounds';
import type { PdfExportOptions } from '../export/pdf/pdf-export';
import type { AssetFetcher, FontSource } from '../export/assets';
import type { CustomNodeCapture, HtmlFallbackMode } from '../export/custom-nodes';
// Wave 8 (Performance & scale) — Card 6: the global route solver's worker seam.
// Type-only, so the engine's solver is not pulled into every renderer bundle.
import type { SolverPort, SolverOptions } from '@grafloria/engine';
// Styling & theming (Wave 4): colorMode + the design-token bridge are RENDERER
// CONFIG, so their types belong on the config contract. Type-only imports — no
// runtime dependency from the types barrel into the themes barrel.
import type { GovernorOptions } from '../perf/quality-governor';
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
 * (Wave 6 note: this used to say "PDF is deliberately absent — it needs a glyph pipeline".
 * It is no longer absent. It IS a true vector PDF — paths stay paths and text stays text,
 * so it is selectable and searchable — written directly from the VNode tree, with no
 * dependency; see `export/pdf/` for how, and for the honest list of what a base-14-font
 * PDF cannot do. The glyph pipeline was sidestepped by using the fonts every PDF reader
 * already has, rather than embedding one.)
 *
 * Because `IRenderer.export` is string-typed, `'pdf'` comes back as a
 * `data:application/pdf;base64,…` URL. `SVGRenderer.exportPdf()` hands you the bytes and
 * the fidelity warnings instead.
 */
export type ExportFormat = 'png' | 'svg' | 'jpeg' | 'webp' | 'pdf';

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
   * CUSTOM-NODE (HTML-layer) CONTENT to place into the export.
   *
   * An HTML-layer node draws nothing in the VNode tree — the renderer emits an empty
   * `<g>` and the page paints a raw HTML host beside the SVG. Without this, such a
   * node exports as literally nothing. `createDiagram` captures its hosts and fills
   * this in automatically; a bare `SVGRenderer` has no DOM and needs it passed.
   *
   * Set `[]` to opt out and export the diagram without its widgets.
   */
  customNodes?: readonly CustomNodeCapture[];

  /** How to export a custom node that could only be captured as HTML. Default `'foreignObject'`. */
  htmlFallback?: HtmlFallbackMode;

  /**
   * THE BOUND on waiting for an ASYNC custom-node painter, in milliseconds. Default 5000.
   *
   * A `renderCustomNode` may return a promise to say "I have not finished drawing yet"
   * (a rAF, a fetch, a framework's async render, a web font). `await export(…)` — the only
   * export entry point that is asynchronous — waits for exactly those promises and for
   * nothing else. That promise is the SIGNAL; this number is only the safety net, because
   * a painter that never settles must not hang a print job forever.
   *
   * On expiry the export proceeds with whatever the host has drawn so far — which may be
   * partial, or nothing — and WARNS, naming the node and this deadline. It is never a
   * silent blank. `0` means "capture immediately, do not wait", which still reports every
   * painter it did not wait for.
   *
   * Ignored by `exportSvgString()` / `exportPdf()`: those are synchronous by contract and
   * cannot wait at all. They report an unfinished painter as a warning instead.
   */
  customNodeTimeout?: number;

  /**
   * TIER 2 for EXTERNAL image URLs (`<img src="https://…">` inside a widget, a panel
   * node's logo). `await export(…)` — every format — first tries the environment's own
   * fetch, which succeeds for same-origin assets and for any server that allows CORS;
   * when that is refused, THIS fetcher is consulted (route the URL through your own
   * proxy, a service worker, an app cache); when both fail the reference is left as-is
   * and the export WARNS, naming the URL and both escape hatches.
   *
   * Also the determinism seam: inject a fetcher in tests and no live network is touched.
   *
   * THE PROXY RECIPE, end to end — when the image's server does not allow CORS, your
   * own server fetches it and hands the bytes back from YOUR origin. Server side
   * (Node/Express, ~10 lines):
   *
   * ```ts
   * // ⚠ SSRF: an unrestricted URL parameter makes this an OPEN PROXY into your
   * // network (internal services, cloud metadata endpoints). ALWAYS allowlist.
   * const ALLOWED_HOSTS = new Set(['cdn.example.com', 'avatars.example.com']);
   * app.get('/asset-proxy', async (req, res) => {
   *   const url = new URL(String(req.query.url));
   *   if (!ALLOWED_HOSTS.has(url.hostname)) return res.status(403).end();
   *   const upstream = await fetch(url);
   *   if (!upstream.ok) return res.status(502).end();
   *   res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
   *   res.send(Buffer.from(await upstream.arrayBuffer()));
   * });
   * ```
   *
   * Client side, one line of wiring:
   *
   * ```ts
   * await diagram.export('pdf', {
   *   assetFetcher: async (url) => {
   *     const res = await fetch(`/asset-proxy?url=${encodeURIComponent(url)}`);
   *     if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
   *     return {
   *       data: new Uint8Array(await res.arrayBuffer()),
   *       mimeType: res.headers.get('content-type') ?? 'image/png',
   *     };
   *   },
   * });
   * ```
   *
   * Ignored by `exportSvgString()` / `exportPdf()` — synchronous by contract, they
   * cannot fetch and say so in their warnings. (For those, pre-resolve the bytes
   * yourself and pass {@link resolvedAssets}.)
   */
  assetFetcher?: AssetFetcher;

  /**
   * PRE-RESOLVED external assets: URL → `data:` URI. Every `<image href>` in the export
   * — the renderer's own tree (a panel node's image/icon) and widget captures alike —
   * whose URL appears here is substituted with the supplied bytes, by a PURE, synchronous
   * pass (`inlineAssets` in `export/assets.ts`). No network is touched.
   *
   * You rarely set this yourself: `await export(…)` fills it from its own tiered fetch.
   * Set it when you already hold the bytes — a server-side export, a strict-CSP page, or
   * the synchronous `exportSvgString()` / `exportPdf()`, which cannot fetch and honour
   * this map as their only way to embed an external image.
   *
   * A URL present here is trusted and never re-fetched by the async export.
   */
  resolvedAssets?: ReadonlyMap<string, string>;

  /**
   * Bound on fetching ONE external image, per tier, in milliseconds. Default 5000 —
   * the same figure as {@link customNodeTimeout}, for the same reason: a dead URL must
   * not hang a print job. On expiry the image degrades to the tier-3 warning.
   */
  assetTimeout?: number;

  /**
   * Cap on one fetched image's size, in bytes. Default 5MB — a data: URI is ~33%
   * bigger than the file it carries. Over the cap the image is refused with a warning;
   * the cap is terminal (a proxy would return the same bytes, so tier 2 is not asked).
   */
  assetMaxBytes?: number;

  /**
   * FIDELITY REPORT. `IRenderer.export()` returns a bare string, so it has nowhere to
   * put the caveats an export hit — and for years it simply threw them away, which is
   * how a blank widget reaches a customer with no diagnostic anywhere.
   *
   * This is that missing channel: it fires once per export, on every format, with the
   * same list `exportSvgString()`/`exportPdf()` return. Empty means a clean export.
   *
   * ```ts
   * await renderer.export('pdf', { onWarnings: w => w.length && console.warn(w) });
   * ```
   */
  onWarnings?: (warnings: string[]) => void;

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

  /** Page size, orientation, margins and document metadata for `export('pdf')`. */
  pdf?: PdfExportOptions;

  /**
   * Fonts to EMBED, as `@font-face` rules with base64 `data:` URIs — so the file renders in
   * the right typeface on a machine that has never heard of it.
   *
   * Build them with `fetchFont()`, or hand over bytes you already have. This is the built
   * form of the raw `embedFontCss` seam; both are honoured, and `embedFontCss` is appended
   * after these.
   */
  embedFonts?: FontSource[];
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
   * wave6/a11y — the diagram's KIND, used for `aria-roledescription` on the SVG
   * root ("Flowchart diagram", "Sequence diagram"). Purely semantic: it changes
   * what a screen reader calls the canvas, nothing about how it is drawn.
   * Default: undefined → "Diagram".
   */
  diagramType?: string;

  /**
   * wave6/a11y — a human title for this diagram, used as the head of the SVG
   * root's accessible name ("Order flow, 12 nodes, 14 edges").
   * Default: undefined → "Diagram".
   */
  diagramLabel?: string;

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
   * Wave 6 — Card 2. The diagram-wide CONNECTION-POINT STRATEGY, by registered
   * name (`registerConnectionPoint`). Built-ins: `'port'` (the default —
   * attach at the assigned port), `'smart'` (draw.io-style floating attachment)
   * and `'boundary'` (attach on each node's outline, aimed at the other node).
   *
   * This supersedes the boolean `smartConnectionPoints` above, which is kept
   * working and is exactly equivalent to `connectionPoint: 'smart'`. A per-link
   * `metadata.connectionPoint` overrides this.
   *
   * Default: undefined (⇒ port-based endpoints).
   */
  connectionPoint?: string;

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
   * Wave 8 (Performance & scale) — Card 6. Route every edge against ONE shared
   * penalty field (`GlobalRouteSolver`, wave 5 card 7) instead of one at a time,
   * so an edge pays for crossing another edge or crowding a corridor at ROUTING
   * time and picks a different channel by itself — rather than being routed into
   * a pile-up and then patched afterwards by fan-out, nudging and jump-overs.
   *
   * Runs OFF THE MAIN THREAD (pass `routeSolverPort`) and asynchronously, because
   * `render()` is synchronous and cannot await a worker: the ordinary incremental
   * router paints immediately, and the solver's answer is adopted on a later frame
   * once it lands. An answer computed against a world that has since moved is
   * discarded, never painted.
   *
   * OFF by default — deliberately. The solver's geometry is genuinely different
   * (that is the point of it), and turning it on globally would change routes in
   * every existing diagram.
   *
   * Default: false
   */
  globalRouting?: boolean;

  /**
   * Wave 8 — Card 7. The ADAPTIVE QUALITY GOVERNOR.
   *
   * The LOD tiers pick a level of detail from the ZOOM, which is the right primary
   * signal — a node 4px tall does not need its label — but it is blind to the thing
   * that actually hurts: the frame budget. The same scene is cheap on a workstation
   * and painful on a laptop, and the zoom level knows nothing about either.
   *
   * With the governor on, the renderer measures each frame and steps the tier DOWN
   * when the budget is being blown (fast — within three frames if the frame is
   * catastrophically over), and back UP only after a patient run of comfortably fast
   * ones. It can only ever make the picture SIMPLER than the zoom asked for, never
   * richer: a governor with spare budget must not start drawing labels on 4px nodes
   * to fill it.
   *
   * ON by default. That is a deliberate reversal of this codebase's usual "new
   * behaviour is opt-in" rule, and the reason is that the alternative default is
   * *worse*: without it, the zoom breakpoints have to be set pessimistically enough
   * to protect the largest scene anyone might load, which taxes every small diagram
   * with detail loss it never needed. Measurement lets small scenes keep their
   * fidelity and large ones stay interactive. Pass `false` for a fully deterministic
   * tier (tests, screenshot diffing, print), or an object to tune the budget.
   *
   * Default: true
   */
  qualityGovernor?: boolean | GovernorOptions;

  /**
   * The port the global route solver runs on — a real `Worker`, typically
   * `new Worker(new URL('...', import.meta.url))` whose body is
   * `serveSolver(self)`. Omit and the solver runs INLINE on this thread: same
   * protocol, same code, same answers, no parallelism.
   *
   * The renderer does not construct the Worker itself; doing so would bake one
   * bundler's URL scheme into the library.
   */
  routeSolverPort?: SolverPort;

  /** Penalty weights and pass count for the global solver. See SolverOptions. */
  routeSolverOptions?: SolverOptions;

  /**
   * Called when the global solver has produced routes better than the ones on
   * screen. The host should schedule a re-render; the renderer cannot do it
   * itself, because it does not own the frame loop.
   */
  onRoutesRefined?: () => void;

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
