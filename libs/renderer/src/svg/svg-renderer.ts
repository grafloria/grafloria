import type { DiagramEngine, DiagramModel, NodeModel, NodeStyle, LinkModel, LinkStyle, PortModel, InteractionConfig, ReconnectionPreview, ProximityPreview, LODLevel, LODFeature, Shadow, GroupModel } from '@grafloria/engine';
// Value import: the ONE definition of "where does a label sit along the path"
// (slot vs position), shared by the model, this renderer and the edge optimizer.
import { linkLabelPosition, DiagramSerializer } from '@grafloria/engine';
// wave8/dirty — the O(1) "has anything changed?" counter every model mutation
// bumps. See the FRAME GATE in render().
import { getMutationEpoch } from '@grafloria/engine';
import type { DiagramDocumentEnvelope } from '@grafloria/engine';
// Wave 5 Card 4: corridor separation for DIFFERENT-pair edges sharing a channel.
import { computeChannelNudges, applyChannelNudges } from './channel-nudging';
// Wave 8 (Performance & scale) — Card 6: incremental routing, and the off-thread
// global solver the render loop now actually drives.
import { RouteMemo, coalesce, inflate, ROUTE_INFLUENCE_PAD, type Rect } from './route-memo';
import { QualityGovernor, type GovernorState } from '../perf/quality-governor';
import { RouteSolverBridge, type RouteSolverStats } from './route-solver-bridge';
import type {
  IRenderer,
  PerformanceMetrics,
  SVGRendererConfig,
  VNode,
  Theme,
  Rectangle,
  RendererCapabilities,
  ExportFormat,
  ExportOptions,
} from '../types';
// Deterministic headless export (VNode → standalone SVG → PNG/JPEG/WebP). The
// serializer is the DOM-less sibling of vnode/patch.ts and consumes the very same
// VNode tree this renderer hands the live pipeline — one contract, two consumers.
import {
  DIAGRAM_ROLE,
  NODE_ROLE,
  EDGE_ROLE,
  nodeRoleDescription,
  edgeRoleDescription,
  diagramRoleDescription,
  diagramAccessibleName,
  edgeAccessibleName,
} from '../a11y/semantics';
import { exportSvg, type SvgExportResult } from '../export/svg-export';
import { mimeTypeForFormat, resolveRasterBackend } from '../export/raster';
import { DEFAULT_MAX_OUTPUT_SIZE } from '../export/bounds';
import { bytesToDataUrl, dataUrlToBytes, embedModelInPng } from '../export/round-trip';
import { filterTreeByIds } from '../export/scope';
import { exportPdf, type PdfExportResult } from '../export/pdf/pdf-export';
import { paginate, type Page, type PaginationOptions } from '../export/pagination';

/** One paginated tile: its grid position, its world window, and the SVG for it. */
export interface PagedSvgResult {
  pages: Array<Page & { svg: string }>;
  columns: number;
  rows: number;
  warnings: string[];
}
import {
  type PaintSpec,
  isPaintSpec,
  isShadowSpec,
  buildPaintServerVNode,
  buildShadowFilterVNode,
  paintDefId,
  flattenPaint,
} from './paint-servers';
import { LIGHT_THEME } from '../themes';
// Styling & theming — instance-scoped CSS variables + the named-style cascade.
// The theme→var table, the stylesheet generators, the style registry and the
// cascade all live in ../themes; this file only EMITS what they resolve.
import {
  GRAFLORIA_INSTANCE_ATTR,
  generateBaseStyleSheet,
  generateInstanceVarBlock,
  linkTypeKey,
  onStyleRegistryChange,
  resolveLinkStyle,
  resolveNodeStyle,
} from '../themes';
// Wave 4 — colorMode (system auto-detection + hot-swap), theme-bound properties,
// and the design-token / a11y bridge.
import {
  ColorModeController,
  DEFAULT_THEME_SET,
  generateInstanceOverrideCSS,
  isThemeRef,
  resolveThemeRef,
  themeRefCssValue,
  themeRefToken,
  type ColorMode,
  type ThemeSet,
  type TokenBridge,
} from '../themes';
import { createForeignObject, isForeignObject, getContainerId } from '../vnode/foreign-object';
import { LruCache } from '../utils/lru-cache';
// SSR (Card 6): every `document` touch in this file goes through this guard.
import { hasDocument } from '../platform';
// Wave 8 (Card 3): the freeze / lazy-mount gate. Type-only — the renderer never
// constructs one, so a host that does not use laziness does not link it in.
import type { ViewLifecycle } from '../lazy/view-lifecycle';
// wave9/comments (Card 6): anchored comment pins, drawn in WORLD space inside the viewBox.
import { renderCommentPins } from '../comments/comment-pins';
// wave10/whiteboard: committed ink is document content and belongs in the VNode tree.
import { renderStrokesLayer } from './stroke-layer';
import type { CommentSource } from '../comments/comment-overlay';
import type { EntityKind as LazyEntityKind } from '../lazy/types';

// Import routing types
import type { RoutedPath, RoutingAlgorithm, SolverEdge } from '@grafloria/engine';

// Phase 3.2: Shape-aware port positioning
// Wave 6 (Ports & connections): the port seam — group resolution (Card 3), the
// glyph builder (Card 0), the label engine (Card 1), attachment spots and
// multi-link spreading (Card 5), and colour-by-data-type (Card 7).
import { getPortPositionForShape } from './port-positioning';
import { glyphHalfExtents, renderPortGlyph } from './port-glyph';
import { nudgePortLabels, portLabelGeometry, renderPortLabel } from './port-label';
import { applySpread, assignSpreadLanes, resolveSpot } from './port-spots';
import { portTypeColor, resolvePortConfig } from '@grafloria/engine';
// wave8/culling — Card 4: the far-zoom path reducer. Douglas–Peucker has been in
// the engine since Phase 2.2 and the renderer had never called it.
import { PathSimplifier } from '@grafloria/engine';
import type { ResolvedPortConfig } from '@grafloria/engine';
// Wave 6 — Card 2: the link-pipeline extension seams (anchors, connection-point
// strategies, connectors). The renderer CONSUMES these registries; it does not
// own them. See ext/link-pipeline.ts for the contract.
import {
  getAnchor,
  getConnectionPoint,
  getConnector,
  hasConnector,
  onLinkPipelineChange,
} from '../ext/link-pipeline';
import { onShapeRegistryChange } from './shape-registry';

// Nodes & shapes foundation: unified shape registry / geometry contract.
// The five shape switch sites below (renderNodeShape, renderSelectionHighlight,
// renderShadow, shapeEdgePoint) route through this instead of inline switches.
import {
  getShape,
  getInnerRect,
  buildShapeBody,
  buildShapeSelection,
  buildShapeShadow,
} from './shape-registry';

// Node label engine: shared, link-agnostic text-block core (wrap / multi-line /
// ellipsis / shape-fit) — the same code path link labels render through.
import { renderTextBlock } from './text-block';

// Wave 5 Card 7: content-aware auto-sizing (opt-in via metadata.sizing.auto).
import { autoSizeNode, type AutoSizeOptions } from './auto-size';
import { isAutoSized } from './node-sizing';

// Wave 5 Card 5: composite / panel node model (header band, image/icon slots,
// badges, ERD/UML rows) — overlaid on any base shape via the registry.
import {
  renderNodePanel,
  measurePanelReserve,
  panelAdjustedInnerRect,
  hasPanel,
  type PanelRenderContext,
} from './panel';

// Wave 5 Card 4: HTML / foreignObject rich-content nodes — a sanitized HTML body
// sized to node.size, participating in selection / hit-test / rotation like any
// shape (rendered on top of the shape background inside the node's <g>).
import { buildHtmlForeignObject, hasHtmlContent } from './html-node';

// Phase 1.1: Arrow type rendering
import { ArrowRenderer } from './ArrowRenderer';

// Phase 1.2: Label rendering
import { LabelRenderer } from './LabelRenderer';

// Phase 1.3: Jump point rendering
import { JumpPointDetector } from './JumpPointDetector';
import { JumpPointRenderer } from './JumpPointRenderer';
import { DEFAULT_LINK_HIT_AREA_WIDTH, linkHitAreaWidth } from './link-hit-test';
import { THEME_VARS } from '../themes/theme-vars';

// Wave 4 (Edges & links) — Card 4: parallel-link separation + self-loop routing.
// Pure geometry; this file only decides WHEN to call it.
import {
  DEFAULT_PARALLEL_SPACING,
  DEFAULT_SELF_LOOP_SIZE,
  DEFAULT_SELF_LOOP_SPACING,
  buildSelfLoopPoints,
  bundleNormal,
  parallelOffsets,
  separateParallelRoute,
  type FanoutPoint,
  type FanoutSide,
} from './link-fanout';

// Wave 4 — Card 7: THE diagram-wide, incremental edge pass (jumps + labels +
// bundles). Replaces the per-link O(L²) jump scan that ran every frame.
import { EdgeOptimizer, type OptimizerLabel, type OptimizerLink } from './edge-optimizer';

// Wave 4 — Card 5: author-extensible link templates / label templates / markers.
import {
  getLinkTemplate,
  onEdgeTemplateChange,
  type LinkTemplateContext,
} from './edge-templates';

// Phase 2.3a: Waypoint editing
import { WaypointEditor } from '../interaction/WaypointEditor';

// Phase 2.3b: Control point editing
import { ControlPointEditor } from '../interaction/ControlPointEditor';

// Phase 1: Animation support
import { AnimationService } from '../services/animation.service';

// LODLevel + LODFeature now come from the engine (@grafloria/engine). LODLevel is a
// `string` tier name (wave2/rendering), so custom tiers flow through unchanged.

/**
 * Id of the SHARED stylesheet: the theme-independent, `var(--grafloria-*)`-based
 * rules. Identical for every renderer on the page, so it is injected once and
 * deduped by this id — instances only own their tiny variable block.
 */
export const GRAFLORIA_BASE_STYLE_ID = 'grafloria-renderer-styles';

/** Prefix of a renderer's own `<style>` element id (one per instance). */
export const GRAFLORIA_INSTANCE_STYLE_PREFIX = 'grafloria-renderer-theme-';

/**
 * Prefix of a renderer's OVERRIDE `<style>` element — the design-token bridge and
 * the accessibility media queries (Wave 4, Card "token bridge + a11y theming").
 *
 * A SEPARATE element from the theme block, and always inserted after it, because
 * the cascade inside the variables is the whole mechanism:
 *   theme values  <  host design tokens  <  prefers-contrast  <  forced-colors
 * Same selector, same specificity — so only SOURCE ORDER decides, and source
 * order is only guaranteed if we own it.
 */
export const GRAFLORIA_INSTANCE_OVERRIDE_PREFIX = 'grafloria-renderer-overrides-';

/** Monotonic per-document instance ids: `grafloria-1`, `grafloria-2`, … */
let instanceCounter = 0;
function nextInstanceId(): string {
  return `grafloria-${++instanceCounter}`;
}

/**
 * Marker classes for the named styles applied to an entity:
 * `styleClass: 'critical dashed'` → `grafloria-style-critical grafloria-style-dashed`.
 *
 * The named style's VALUES are resolved by the cascade (style-cascade.ts) — these
 * classes exist so hosts can hang extra CSS off a named style and so tests/tools
 * can see which ones landed. Names that aren't valid CSS identifiers are skipped.
 */
function styleClassTokens(styleClass: string | undefined): string[] {
  if (!styleClass) return [];
  return styleClass
    .trim()
    .split(/\s+/)
    .filter(name => /^[A-Za-z_-][\w-]*$/.test(name))
    .map(name => `grafloria-style-${name}`);
}

/** Arc length of a polyline — RoutedPath carries one, and self-loops need to too. */
/**
 * Wave 5 Card 4: segments closer than this (px) count as ONE corridor and get
 * separated. Deliberately small — the pass fixes what is visually stacked, and
 * must never grab a deliberate 16px-apart parallel run (a wave-4 fanned bundle).
 */
const CHANNEL_NUDGE_TRIGGER = 4;

/**
 * Extra world-units the EXPORT render pass sees beyond the model's content bounds.
 *
 * The render pass culls to its viewport; the exported viewBox is then re-fitted to
 * the resulting tree. Anything culled is therefore invisible to the fit — so the
 * render viewport must be a little larger than the model bounds, or a label that
 * overhangs its node (the very thing the tree-derived box exists to capture) would
 * be culled before it could widen the box.
 */
const CONTENT_RENDER_SLACK = 200;

function polylineLength(points: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

/**
 * SVG Renderer
 * Renders diagram to VNode tree for framework-agnostic consumption
 * Integrates with engine's performance features (SpatialIndex, dirty marking, LOD)
 */
export class SVGRenderer implements IRenderer {
  readonly mode = 'svg' as const;

  /**
   * What this renderer can actually do — so callers can ask instead of assuming.
   * `supportsExport` is now TRUE (see `export()` below); hit-testing and text
   * measurement still are not implemented here, and saying so is the point.
   */
  readonly capabilities: RendererCapabilities = {
    supportsHitTest: false,
    supportsBatching: false,
    supportsExport: true,
    supportsMeasurement: false,
    supportsForeignObject: true,
    supportsFilters: true,
    // Raster export needs a canvas; there is only one where the environment has
    // one (browser / worker), so this is an environment probe, not a wish.
    supportsOffscreen: typeof (globalThis as any).OffscreenCanvas === 'function',
  };

  /**
   * This renderer's scope. Stamped on the root `<svg>` as
   * `data-grafloria-instance` and used to scope BOTH the injected variable block
   * and this instance's `<style>` element id — so two diagrams with different
   * themes on one page no longer clobber each other's stylesheet.
   */
  private readonly instanceId: string;

  /** Unsubscribe from the named-style registry (see the constructor). */
  private unsubscribeStyleRegistry?: () => void;

  /**
   * World-space margin added around the viewport when querying the engine's link
   * SpatialIndex (see expandForLinkCulling). Covers routed detours that have not
   * been written back into `link.points` yet — an orthogonal detour around a node
   * stays well inside this, and the cost of an over-wide query is only a few
   * extra VNodes.
   */
  private static readonly LINK_CULL_MARGIN = 250;

  private theme: Theme;
  private config: Required<SVGRendererConfig>;
  // Bounded LRU so the cache honors config.maxCacheSize instead of growing
  // unbounded between wholesale clears. Initialized in the constructor once
  // maxCacheSize is resolved.
  private vnodeCache: LruCache<string, VNode>;
  private styleElement?: HTMLStyleElement;
  private disposed = false;

  // --- Wave 4: colorMode + token bridge -------------------------------------

  /** Watches the OS media queries. Only created when `colorMode` is configured. */
  private colorModeController?: ColorModeController;

  /** The host design system's tokens, mapped onto ours. */
  private tokenBridge?: TokenBridge;

  /** `<style>` holding the bridge + the a11y media queries (after the theme block). */
  private overrideElement?: HTMLStyleElement;

  /**
   * Entities whose LAST rendered VNode froze a theme value into itself, and which
   * therefore cannot be re-themed by rewriting a CSS variable.
   *
   * This is the ledger that makes the hot-swap honest. In CSS mode most of the
   * theme is painted by the stylesheet through `var(--grafloria-*)`, so rebinding the
   * variables re-themes those elements with no VNode work at all. But three
   * things are still resolved to LITERALS in the emitted VNode:
   *
   *   - the STATE layer (a selected node carries the theme's selection colours),
   *   - `theme.nodes[type]` / `theme.links[type]` type-defaults,
   *   - a `themeRef` on a property that is emitted as an SVG PRESENTATION
   *     ATTRIBUTE (arrowheads, `rx`, node `opacity`) — attributes cannot hold
   *     `var()`, so those must be baked.
   *
   * Rather than guess, the style computation RECORDS which entities that happened
   * to. A theme swap then dirties exactly those and nothing else: a diagram with
   * nothing selected and no bound attributes re-themes with zero restyled VNodes,
   * and the ones that do need it are found, not assumed.
   */
  private themeBoundNodes = new Set<string>();
  private themeBoundLinks = new Set<string>();

  // foreignObject support
  private containerIds = new Map<string, string>(); // nodeId -> containerId mapping
  private foreignObjectNodes = new Set<string>(); // Track which nodes use foreignObject

  // Phase 1.1: Arrow type rendering
  private arrowRenderer: ArrowRenderer;

  // Phase 1.2: Label rendering
  private labelRenderer: LabelRenderer;

  // Phase 1.3: Jump point rendering
  private jumpPointDetector: JumpPointDetector;
  private jumpPointRenderer: JumpPointRenderer;

  // Phase 2.3a: Waypoint editing
  private waypointEditor: WaypointEditor;

  // Phase 2.3b: Control point editing
  private controlPointEditor: ControlPointEditor;

  // Phase 1: Animation service
  private animationService: AnimationService;

  // wave6/a11y (card 1): which entity the keyboard controller has focused. Drives
  // the ROVING TABINDEX — exactly one element in the diagram carries tabindex=0.
  //
  // wave9/comments (card 6): a comment PIN is a third kind of focusable thing in the same
  // one-tab-stop widget, so it belongs in the SAME roving scheme rather than a parallel
  // one. Two authorities for "what is focused" is precisely how a canvas ends up with two
  // elements carrying tabindex=0 — i.e. how the roving tabindex quietly stops being one.
  private a11yFocus: { type: 'node' | 'link' | 'comment'; id: string } | null = null;

  /**
   * wave9/comments (card 6): where the comment pins come from, or null for a canvas with
   * no comment system attached — in which case NO layer is built and NO query is made, so
   * an idle 10k-node frame is exactly as cheap as it was before this card existed.
   */
  private commentSource: CommentSource | null = null;

  // =========================================================================
  // wave8/dirty — Card 0: the FRAME GATE.
  //
  // The per-entity VNode cache (`vnodeCache` + `entity.isDirty`) already makes
  // an unchanged NODE free. What it never made free is the FRAME: `render()`
  // still walked the scene, ran three whole-diagram geometry passes and rebuilt
  // both layer VNodes on every call, even when literally nothing had changed.
  // Measured at 10k nodes, an idle frame — a frame in which NOTHING moved — cost
  // 130ms. That is the price the scene charged simply for existing.
  //
  // The gate below answers "is this frame identical to the one already on
  // screen?" in O(1), and if so hands the patcher back the SAME VNode object it
  // reconciled last time. The patcher's identity-skip then does nothing at all,
  // which is the correct amount of work for a picture that did not change.
  //
  // Soundness rests on the frame being a pure function of exactly three inputs:
  //   1. the MODEL          → covered by the mutation epoch (see DiagramEntity),
  //   2. the VIEW           → viewport + zoom, in `frameSignature()`,
  //   3. INTERACTION state  → connection/reconnection preview + a11y focus, ditto.
  // Anything that does not funnel through those three trips `frameInvalidated`
  // explicitly (topology events, style/theme invalidation). Two independent
  // channels, both fail-open: when in doubt we render.
  // =========================================================================

  /** The root VNode of the last frame we actually built (null ⇒ nothing to reuse). */
  private lastFrameRoot: VNode | null = null;
  /** View + interaction signature of that frame (null ⇒ that frame was not cacheable). */
  private lastFrameSig: string | null = null;
  /** Mutation epoch AFTER that frame was built (render() itself dirties links). */
  private lastFrameEpoch = -1;
  /** Set by anything whose effect on the picture the epoch cannot see. */
  private frameInvalidated = true;
  /** Monotone count of invalidateFrame() calls — a HOST's idle-skip keys on this. */
  private invalidationEpoch = 0;
  /**
   * Did the frame being built move any link's FINAL geometry? If so it has not
   * reached a fixed point and must not arm the gate.
   *
   * `render()` is not quite a pure function, and this is the one place it shows.
   * The link cull query (`getVisibleLinks`) runs BEFORE the routing pre-pass, so
   * a frame that re-routes a link writes its new geometry into the spatial index
   * only AFTER that frame has already decided what to draw. The next frame
   * therefore culls against a different index and can legitimately produce a
   * different picture from identical model + view — which is precisely the
   * two-frame settle the culling suite documents ("the link's cull box is the
   * union of its LIVE endpoints and its last routed points, so for ONE frame it
   * still spans the old route").
   *
   * Skipping that second frame leaves a link that should have been culled in the
   * tree forever. So the gate closes only on a frame that changed nothing — a
   * genuine fixed point — and geometry settles in the same two frames it always
   * did.
   *
   * Set ONLY by markLinksWhoseFrameChanged, which is the only pass that sees a
   * link's final geometry (three separate writers rewrite it during a frame; an
   * intermediate difference is not a change). See the note there.
   */
  private frameChangedGeometry = false;
  /** Frames served straight from `lastFrameRoot`. A quiet canvas should be all of them. */
  private framesSkipped = 0;
  /** Frames actually built. */
  private framesBuilt = 0;

  // Per-frame auto-route cache: filled by the pre-pass in renderLinksLayer so
  // every link's points are current before any link renders (jump detection
  // reads other links' points).
  private frameRoutes = new Map<string, RoutedPath>();

  // --- Wave 8 — Card 3: deferred / lazy view instantiation -------------------

  /** The gate between "culling says it is on screen" and "build its view". */
  private viewLifecycle: ViewLifecycle | null = null;

  /** What the gate held back on the last frame — the progressive mounter's work queue. */
  private deferredThisFrame: Array<readonly [LazyEntityKind, string]> = [];

  // Wave 8 — Card 6: the frame's obstacle arrays (see frameObstacles()). Cleared
  // at the top of every links pass; rebuilt lazily on first use.
  private frameObstacleCache: {
    nodes: NodeModel[];
    routing: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    all: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    blockIds: Set<string>;
  } | null = null;

  // Wave 8 — Card 6: routes that SURVIVE the frame. The per-frame map above is
  // rebuilt from scratch every render; this one remembers what each link was
  // routed to and why, so an unchanged link is never re-routed. See route-memo.ts
  // for what "unchanged" has to mean (it is not "its endpoints didn't move").
  private routeMemo = new RouteMemo();
  /** Set true to force the next frame to re-route everything (first frame, config changes). */
  private routeMemoDirty = true;

  /**
   * Wave 8 — Card 7. Watches frame time and biases the LOD tier down when this
   * machine cannot afford what the zoom asked for. `null` when disabled, in which
   * case the tier is exactly what the zoom says and rendering is deterministic —
   * which is what screenshot tests and print need.
   */
  private governor: QualityGovernor | null = null;

  // Wave 8 — Card 6: the OFF-THREAD global solver (opt-in; see config.globalRouting).
  // Created lazily so a renderer that never asks for it never constructs a host.
  private solverBridge: RouteSolverBridge | null = null;
  /**
   * Monotonic id of "the world the obstacles describe". Bumped whenever a node
   * rect or the group state changes. This is what lets an ASYNC solver answer be
   * matched to the world it was computed for — and discarded if that world is
   * gone. Without it, a solve that lands one frame late paints links through
   * nodes that have since moved.
   */
  private worldVersion = 0;

  // Wave 6 — Card 5: per-frame multi-link spread lanes, keyed by PORT id. Every
  // link on a spreading port needs to know how many siblings it shares that port
  // with, so the lane assignment is computed once per port per frame rather than
  // once per link (which would be O(links²) on a hub node).
  private frameSpreadLanes = new Map<string, Map<string, number>>();

  // Wave 4 — Card 7: the diagram-wide incremental edge pass. Owns jump-over
  // detection and collision-aware label placement for the WHOLE diagram, and
  // keeps its own dirty state across frames — so it is a renderer-lifetime
  // object, not a per-frame one.
  // Card 5: ownership is per-renderer config; the optimizer is rebuilt in the
  // constructor once the merged config is known.
  private edgeOptimizer = new EdgeOptimizer();

  // wave8/culling — Card 4: stateless Douglas–Peucker, used to reduce the DRAWN
  // polyline below the `link-detail` tier. See pathForLOD.
  private pathSimplifier = new PathSimplifier();

  // Per-frame outputs of the optimizer, keyed by link id.
  private frameJumps = new Map<string, Array<{ t1: number; segmentIndex?: number }>>();
  private frameLabelOffsets = new Map<string, { x: number; y: number }>(); // `${linkId}::${labelId}`

  // Wave 4 — Card 4: the lane offset each link was assigned this frame (0 when
  // it is the only link between its pair). Kept so renderLink and the arrow
  // maths agree with the pre-pass.
  private frameSeparation = new Map<string, number>();

  // Wave 4: signature of everything that affects a link's RENDERED output but
  // does not live on the link (its routed points, its jumps, its optimizer label
  // offsets). See markLinksWhoseFrameChanged — this is what makes the link VNode
  // cache sound.
  private frameLinkSigs = new Map<string, string>();

  /** Unsubscribe from the edge-template registry (Card 5). */
  private unsubscribeEdgeTemplates?: () => void;
  /** Wave 6 — Card 2/0: cache invalidation for the link pipeline + shape registry. */
  private unsubscribeLinkPipeline?: () => void;
  private unsubscribeShapeRegistry?: () => void;

  // Per-frame paint-server defs (Styling & theming — Card 2). Keyed by the
  // stable spec hash so identical gradient/pattern/shadow specs share ONE
  // `<defs>` entry. Cleared at the top of every render() and materialised into
  // the root SVG's `<defs>` child after the layers have been built.
  private frameDefs = new Map<string, VNode>();

  // wave8/culling — the LOD tier and zoom THIS frame is being drawn at.
  //
  // Held as frame state, rather than threaded through every call, for one
  // reason: the LOD decision has to reach places the `lod` argument does not go —
  // the style cascade (`resolvePaint`) and the cache-eligibility predicates
  // (`nodeUsesPaintServer`), which are called from deep inside style computation.
  // Threading a parameter through all of them would have been a 40-file diff
  // across code three other Wave-8 agents are editing.
  //
  // Defaults to 'high'/1: a renderer that is asked for a style OUTSIDE a frame
  // (tests do this) must get the full-fidelity answer, not a far-zoom one.
  private frameLod: LODLevel = 'high';
  private frameZoom = 1;

  // Per-frame memo for `lodAllows` — see the note there. Keyed by feature; the
  // tier it was computed for is held alongside so a tier change invalidates it.
  private lodCache = new Map<LODFeature, boolean>();
  private lodCacheTier: LODLevel | null = null;

  // Performance tracking
  private lastRenderTime = 0;
  private lastNodeCount = 0;
  private lastLinkCount = 0;
  private renderTimestamp = 0;
  private frameCount = 0;
  private fps = 0;
  /** Handle of the 1 Hz FPS sampler — cleared in dispose() (see startFPSTracking). */
  private fpsInterval?: ReturnType<typeof setInterval>;

  constructor(
    private engine: DiagramEngine,
    config: SVGRendererConfig = {},
    theme?: Theme
  ) {
    // Apply defaults
    this.config = {
      // Wave 6 (a11y): the canvas's own semantics — what a screen reader calls
      // this diagram. NOTE this merge is an explicit ALLOWLIST, not a spread: a
      // config key that is not named here is silently dropped on the floor. That
      // is exactly how these two arrived dead the first time, and it is the same
      // "declared but never consumed" shape as the orphaned reduced-motion.css.
      diagramType: config.diagramType ?? '',
      diagramLabel: config.diagramLabel ?? '',
      enableCaching: config.enableCaching ?? true,
      maxCacheSize: config.maxCacheSize ?? 1000,
      useCSSMode: config.useCSSMode ?? true,
      linkHitAreaWidth: config.linkHitAreaWidth ?? DEFAULT_LINK_HIT_AREA_WIDTH,
      smartConnectionPoints: config.smartConnectionPoints ?? false,
      // Wave 6 — Card 2: the registered connection-point strategy (supersedes,
      // but does not break, the boolean above).
      connectionPoint: config.connectionPoint,
      // Wave 4 (SSR): an explicit scope makes the root <svg> deterministic across
      // processes; without it the per-process counter would emit a different
      // `data-grafloria-instance` on the server than on the client.
      instanceId: config.instanceId ?? '',
      // Wave 4 (Edges & links)
      parallelLinks: config.parallelLinks ?? true,
      parallelSpacing: config.parallelSpacing ?? DEFAULT_PARALLEL_SPACING,
      edgeOptimizer: config.edgeOptimizer ?? true,
      // Wave 5 (Edge routing)
      channelNudging: config.channelNudging ?? true,
      jumpOwnership: config.jumpOwnership ?? 'both',
      // Wave 8 (Performance & scale) — Card 6: the global, off-thread route
      // solver. OFF by default: its geometry is deliberately different from the
      // one-at-a-time router, so switching it on globally would move every route
      // in every existing diagram.
      globalRouting: config.globalRouting ?? false,
      // Wave 8 — Card 7: the quality governor, ON unless explicitly refused. See
      // the option docs for why this one defaults on when everything else here
      // defaults off: the alternative is zoom breakpoints pessimistic enough to
      // protect a 10k scene, imposed on a 30-node one that never needed them.
      qualityGovernor: config.qualityGovernor ?? true,
      routeSolverPort: config.routeSolverPort,
      routeSolverOptions: config.routeSolverOptions,
      onRoutesRefined: config.onRoutesRefined,
      // Wave 4 (Styling). `colorMode` is OPT-IN: unset means "use the theme I was
      // given and watch nothing", which is exactly the pre-Wave-4 behaviour.
      colorMode: config.colorMode ?? undefined,
      themes: config.themes ?? DEFAULT_THEME_SET,
      tokenBridge: config.tokenBridge ?? undefined,
    } as Required<SVGRendererConfig>;

    // Card 5: the optimizer's jump-ownership mode comes from renderer config.
    if (this.config.jumpOwnership !== 'both') {
      this.edgeOptimizer = new EdgeOptimizer({ jumpOwnership: this.config.jumpOwnership });
    }

    // Card 7. `true` takes the defaults; an object tunes them; `false` leaves the
    // governor null and the tier purely zoom-derived (deterministic — what a
    // screenshot test or a print job wants).
    const gov = this.config.qualityGovernor;
    if (gov) {
      this.governor = new QualityGovernor(typeof gov === 'object' ? gov : {});
    }

    this.instanceId = config.instanceId || nextInstanceId();

    // Bounded LRU vnode cache (evicts least-recently-used past maxCacheSize)
    this.vnodeCache = new LruCache<string, VNode>(Math.max(1, this.config.maxCacheSize));

    this.tokenBridge = config.tokenBridge;

    // The theme: either the one handed in, or — when a colorMode was requested —
    // whatever that mode plus the OS's current preferences resolve to.
    this.theme = theme || LIGHT_THEME;
    if (this.config.colorMode) {
      this.colorModeController = new ColorModeController(
        this.config.colorMode,
        this.config.themes,
        next => this.applyThemeVariables(next)
      );
      this.theme = this.colorModeController.resolve();
      // Tell the controller what we already have, so its first OS event only
      // fires when the answer actually CHANGES.
      this.colorModeController.prime(this.theme);
    }

    // Phase 1.1: Initialize arrow renderer
    this.arrowRenderer = new ArrowRenderer();

    // Phase 1.2: Initialize label renderer
    this.labelRenderer = new LabelRenderer();

    // Phase 1.3: Initialize jump point detector and renderer
    this.jumpPointDetector = new JumpPointDetector();
    this.jumpPointRenderer = new JumpPointRenderer();

    // Phase 2.3a: Initialize waypoint editor with default config
    const waypointConfig = engine.getInteractionConfig().waypointEditor || {
      snapToGrid: false,
      gridSize: 20,
      removeOnDoubleClick: true,
      handleRadius: 5,
      handleColor: '#3b82f6',
      handleStrokeColor: '#ffffff',
      minDistanceFromEndpoints: 30,
      clickDetectionRadius: 10,
    };
    this.waypointEditor = new WaypointEditor(waypointConfig);

    // Phase 2.3b: Initialize control point editor with default config
    const controlPointConfig = engine.getInteractionConfig().controlPointEditor || {
      snapToGrid: false,
      gridSize: 20,
      handleRadius: 6,
      handleColor: '#10b981',
      handleStrokeColor: '#ffffff',
      controlLineColor: '#6b7280',
      controlLineWidth: 1,
      controlLineDash: [5, 5],
      clickDetectionRadius: 10,
      showControlLines: true,
      symmetricControls: false,
    };
    this.controlPointEditor = new ControlPointEditor(controlPointConfig);

    // Phase 1: Initialize animation service
    this.animationService = new AnimationService();

    // CRITICAL: Inject theme CSS FIRST if in CSS mode
    // Then inject animation CSS SECOND so it has higher specificity (last wins in CSS)
    if (this.config.useCSSMode) {
      this.injectThemeCSS();
    }

    // CRITICAL: Inject animation CSS AFTER theme CSS
    // This ensures animation styles override any duplicate definitions in theme CSS
    this.animationService.injectCSS();

    // Named styles are resolved INTO the emitted VNodes (see style-cascade.ts),
    // so a (re)definition after nodes were cached must invalidate them.
    this.unsubscribeStyleRegistry = onStyleRegistryChange(() => this.invalidateStyles());

    // Card 5: a link/label template's OUTPUT is baked into the cached VNode, and
    // a custom marker's geometry into the arrow — so redefining one has to
    // invalidate the cache for exactly the same reason a named style does.
    this.unsubscribeEdgeTemplates = onEdgeTemplateChange(() =>
      this.invalidateStyles('edge-templates-changed')
    );

    // Wave 6 — Card 2: a connector's OUTPUT (the whole path `d`), an anchor's
    // endpoint and a connection-point strategy's geometry are all baked into the
    // cached link VNode, for exactly the same reason a link template's output is.
    // Without this, UNLOADING an extension left its connector's path on screen —
    // the registry was empty but the cache still held the picture it drew. Caught
    // by the e2e (`node libs/renderer/e2e/ext-run.mjs`), not by any unit test.
    this.unsubscribeLinkPipeline = onLinkPipelineChange(() =>
      this.invalidateStyles('link-pipeline-changed')
    );

    // Wave 6: same argument for SHAPES. The shape registry had no change signal
    // at all before this wave, so a shape registered (or unregistered) after a
    // node was cached could not invalidate it.
    this.unsubscribeShapeRegistry = onShapeRegistryChange(() =>
      this.invalidateStyles('shape-registry-changed')
    );

    // Subscribe to engine events
    this.subscribeToEngineEvents();

    // Start FPS tracking
    this.startFPSTracking();
  }

  /**
   * Render diagram to VNode tree
   */
  render(viewport: Rectangle, zoom: number): VNode {
    const startTime = performance.now();

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return this.createEmptyDiagram(viewport);
    }

    // wave8/dirty — Card 0: THE FRAME GATE. Everything below this line is the
    // cost of a frame; this is the check that says we do not have to pay it.
    // Returning the PREVIOUS root object (not a copy) is the whole point: the
    // patcher short-circuits on identity, so an unchanged frame reconciles to
    // exactly zero DOM operations.
    const frameSig = this.frameSignature(viewport, zoom);
    if (
      this.config.enableCaching &&
      frameSig !== null &&
      !this.frameInvalidated &&
      this.lastFrameRoot !== null &&
      this.lastFrameSig === frameSig &&
      this.lastFrameEpoch === getMutationEpoch()
    ) {
      this.framesSkipped++;
      this.frameCount++;
      this.lastRenderTime = performance.now() - startTime;

      // NOTE THE GOVERNOR IS DELIBERATELY NOT FED HERE, and do not "fix" that. A
      // skipped frame costs ~0ms, and 0ms is not evidence that this machine can
      // afford more detail — it is evidence that nobody asked for a frame. Record
      // it and an idle canvas would drive the median toward zero, the governor would
      // patiently restore detail the scene cannot actually afford, and the very next
      // pan would blow the budget again. The governor must only ever judge frames it
      // actually paid for.
      return this.lastFrameRoot;
    }

    // Nothing has moved yet; the routing pre-pass will say otherwise if it does.
    this.frameChangedGeometry = false;

    // Card 7 — content-aware auto-sizing MEASURE pass. Runs before the spatial
    // query so the grown bounds are the ones culled, indexed and routed against.
    // Opt-in (`metadata.sizing.auto`) and idempotent: a node already at its
    // target size mutates nothing, so this cannot spin the render loop. Bounds
    // changes go through node.setSize() → change:size → spatial index + routing.
    this.autoSizeNodes(diagram);

    // The tier the ZOOM asks for — what the picture NEEDS.
    const zoomTier = diagram.getLODLevel(zoom);

    // …and the tier this MACHINE can afford. Card 7. The zoom knows how big a node
    // is on screen; it has no idea whether the last twelve frames took 4ms or 400.
    // The governor watches frame time and biases the tier down when the budget is
    // being blown — and it can only ever simplify, never enrich.
    //
    // This is the lever that lets the ZOOM breakpoints stay honest about PERCEPTION
    // ("a 3px label is unreadable") instead of being bent to solve COST ("routing is
    // slow at 10k, so nobody may have routes below 0.5 zoom"). A 30-node flowchart at
    // zoom 0.4 renders at 3ms and keeps every route; a 10k scene at the same zoom
    // blows the budget, escalates within three frames, and drops to the cheap tier.
    // Same policy, different machines, different scenes — decided by measurement
    // rather than by a constant someone once chose against a 10k benchmark.
    const lod = this.governor
      ? this.governor.effectiveTier(zoomTier, this.lodTierNames(diagram))
      : zoomTier;

    // wave8/culling: publish the tier for the parts of the pipeline the `lod`
    // argument never reaches (the style cascade and the cache-eligibility
    // predicates). See the field docs.
    this.frameLod = lod;
    this.frameZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
    // Drop the per-frame LOD memo: the TIER may be unchanged since the last frame
    // while the POLICY behind it was replaced (setLODConfig / registerLODTier).
    this.lodCache.clear();

    // Apply zoom to viewBox (zoom around center point)
    // The center point should remain constant regardless of zoom level
    const centerX = viewport.x + viewport.width / 2;
    const centerY = viewport.y + viewport.height / 2;

    const viewBoxWidth = viewport.width / zoom;
    const viewBoxHeight = viewport.height / zoom;
    const viewBoxX = centerX - viewBoxWidth / 2;
    const viewBoxY = centerY - viewBoxHeight / 2;

    // Cull against the rect that is ACTUALLY VISIBLE — the viewBox — not the raw
    // `viewport` argument. They are concentric and identical at zoom 1, but when
    // zoomed OUT (zoom < 1) the viewBox is strictly larger, so culling by
    // `viewport` dropped entities that are on screen (fit-to-content, which zooms
    // out to frame the whole diagram, hit this every time). Zoomed IN it merely
    // over-included, which is why this stayed invisible for so long.
    const visibleRect: Rectangle = {
      x: viewBoxX,
      y: viewBoxY,
      width: viewBoxWidth,
      height: viewBoxHeight,
    };

    // Get visible nodes using engine's SpatialIndex (viewport virtualization)
    const culledNodes = diagram.getVisibleNodes(visibleRect);

    // Get visible links by GEOMETRY, through the engine's link SpatialIndex.
    // (This used to be "render the link only if BOTH endpoint nodes are visible",
    // which made a long edge disappear the moment its nodes scrolled off-screen —
    // even while the edge itself crossed the middle of the viewport.)
    //
    // Query with `visibleRect` — the rect actually DRAWN — not the raw `viewport`
    // argument: the two diverge once zoom != 1, and culling links against the
    // un-zoomed rect dropped on-screen links whenever the view was zoomed out
    // (which fit-to-content always does). Nodes above are culled the same way.
    const culledLinks = diagram.getVisibleLinks(this.expandForLinkCulling(visibleRect));

    // Wave 8 — Card 3: the MOUNT GATE. Culling has said what is on screen; the gate
    // says what may have a VIEW. It can only ever subtract (a frozen entity, or one
    // a progressive mount has not reached yet), never add — so the worst a gate can
    // do is make something arrive a frame late, never draw something wrong.
    //
    // Everything it holds back is recorded, because that list IS the mounter's work
    // queue: "what culling wanted and I did not give it".
    const { nodes: visibleNodes, links: visibleLinks } = this.applyMountGate(
      culledNodes,
      culledLinks
    );

    // Track counts
    this.lastNodeCount = visibleNodes.length;
    this.lastLinkCount = visibleLinks.length;

    // Card 2: start each frame with an empty paint-server registry. Rendering
    // the layers below populates it (via the style-computation resolvers); the
    // deduped `<defs>` block is assembled from it once the layers are built.
    this.frameDefs.clear();

    // Render layers
    const linksLayer = this.renderLinksLayer(visibleLinks, lod);
    const nodesLayer = this.renderNodesLayer(visibleNodes, lod);
    const connectionPreviewLayer = this.renderConnectionPreviewLayer();
    const snapGuidesLayer = this.renderSnapGuidesLayer();

    // wave9/comments (Card 6): the pins. Null unless a comment source is attached, so a
    // canvas with no comment system pays literally nothing — not a layer, not a query.
    const commentsLayer = this.renderCommentsLayer(visibleRect, zoom);

    // wave10/whiteboard: committed ink. Null (and zero cost) on a canvas with no strokes.
    // Culled by a linear bounds scan — strokes are rare (tens, not tens of thousands), so
    // this is microseconds even at 500 strokes; the model documents where a SpatialIndex
    // would go if that ever stops being true.
    const strokesLayer =
      diagram.strokes.size > 0
        ? renderStrokesLayer(diagram.getVisibleStrokes(visibleRect))
        : null;

    // wave12/group-visuals: the group FRAMES. Groups have driven layout, collapse
    // and routing since Wave 7, but no frame was ever DRAWN — a subflow container
    // was model-complete and invisible. This layer is PREPENDED (below) so it
    // paints BEHIND links and nodes, and is null on any canvas with no groups, so
    // the children[0]=links / children[1]=nodes contract is byte-identical
    // whenever grouping is not in use — exactly like strokes/comments are null
    // when absent. A linear bounds scan culls it (groups are tens, not thousands).
    const groupsLayer = this.renderGroupsLayer(diagram, visibleRect);

    // Card 2: assemble the deduped paint-server `<defs>` populated while the
    // layers rendered. Appended LAST (not prepended) so existing positional
    // children[0]=links / children[1]=nodes contracts stay intact; SVG resolves
    // url(#id) by document-wide id lookup, so `<defs>` position is irrelevant.
    const defsNode = this.buildDefsNode();

    // Create root SVG VNode
    // Note: width/height omitted - controlled by CSS (100%)
    const root: VNode = {
      type: 'svg',
      key: 'diagram-root',
      props: {
        viewBox: `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`,
        className: 'grafloria-diagram',
        // Instance scope: carries this diagram's --grafloria-* variables and gates
        // every rule in the shared stylesheet. Without it on the REAL render
        // root (not just the empty one) the scoped rules silently don't apply.
        ...this.instanceScopeProps(),
        // wave6/a11y (cards 0 + 1): the canvas is a graphics DOCUMENT with one
        // tab stop. `tabindex=0` only while nothing inside is focused — once
        // focus lands on a node/edge, THAT element carries the 0 and the root
        // drops to -1. That is what makes it a single-stop composite widget
        // rather than an N-stop tab trap.
        ...this.rootAriaProps(),
      },
      // wave9/comments: the pin layer is APPENDED, never inserted — children[0]=links and
      // children[1]=nodes are a documented positional contract that other code reads. It
      // is last in document order, which in SVG means it paints ON TOP: a pin that a node
      // could cover is a pin nobody can click.
      //
      // wave10/whiteboard: committed ink is appended too — after the diagram, before the
      // comment pins — so ink paints OVER nodes and links (annotation you must be able to
      // see) but UNDER the pins (which stay on top so they remain clickable). Nulls are
      // filtered, so the [0]=links / [1]=nodes contract is untouched whenever there is no
      // ink and no comment system.
      //
      // wave12/group-visuals: the groups layer is the ONE layer that PREPENDS rather than
      // appends — a group frame is a container that must sit BEHIND the nodes and links it
      // holds (SVG paints in document order, so "behind" means "first"). It is null on any
      // canvas with no groups, so — exactly like the appended strokes/comments — this array
      // is byte-identical whenever grouping is unused, and the positional contract
      // (children[0]=links, children[1]=nodes) holds for every group-free diagram. When
      // groups ARE present children[0] becomes the groups layer; the only two consumers that
      // index links/nodes positionally (svg-renderer.cache-fixes / .frame-gate specs) render
      // group-free scenes, and every other consumer finds layers by key/className
      // (dirty-region.collectEntities, comment-overlay) — those are order-independent.
      children: [
        groupsLayer,
        linksLayer,
        nodesLayer,
        connectionPreviewLayer,
        snapGuidesLayer,
        defsNode,
        strokesLayer,
        commentsLayer,
      ].filter((c): c is VNode => c !== null),
    };

    // wave8/dirty — arm the gate for the NEXT frame.
    //
    // The epoch is snapshotted HERE, at the end, not at the top: building a frame
    // legitimately dirties model entities itself (markLinksWhoseFrameChanged
    // re-dirties every link whose routed geometry moved; autoSizeNodes may resize
    // one). Snapshotting on entry would record an epoch the frame then invalidates
    // on its way out, and the gate would never once close.
    //
    // …but arm it ONLY on a frame that reached a fixed point. A frame that moved
    // a link re-indexed it AFTER culling, so the next frame can honestly draw
    // something different from the same model and the same viewport. See
    // `frameChangedGeometry`.
    const settled = !this.frameChangedGeometry;
    this.lastFrameRoot = frameSig === null || !settled ? null : root;
    this.lastFrameSig = settled ? frameSig : null;
    this.lastFrameEpoch = getMutationEpoch();
    this.frameInvalidated = false;
    this.framesBuilt++;

    // Track render time
    this.lastRenderTime = performance.now() - startTime;
    this.frameCount++;

    // Feed the governor the frame it just paid for. This is the ONLY place frame
    // time enters the quality decision, and it is measured, not modelled — no
    // heuristic about node counts, no guess about the machine.
    //
    // Note this measures the VNode build, not the browser's paint. It is the part we
    // control and the part that has been pathological (a 63-second zoom-out frame was
    // 99% route computation, zero percent paint), and it is the only part we can
    // attribute. A renderer that blamed the compositor for its own O(n²) loop would
    // be worse than no governor at all.
    this.governor?.record(this.lastRenderTime);

    return root;
  }

  /**
   * The tier actually rendered last frame, and the governor's reasoning for it.
   *
   * Exposed because an invisible governor is indistinguishable from a bug: if the
   * picture silently simplifies, the only honest thing to do is be able to say WHY.
   * The perf HUD reads this; so can an application that wants to tell the user "this
   * diagram is being drawn at reduced detail to stay responsive".
   */
  getQualityState(): { tier: LODLevel; governor?: GovernorState } {
    return {
      tier: this.frameLod,
      governor: this.governor?.getState(),
    };
  }

  /**
   * Tier names richest → poorest, which is the order the governor's bias walks.
   *
   * Derived from the diagram's LIVE config rather than a hard-coded triple, because
   * `registerLODTier`/`setLODConfig` are public API — a governor that walked a
   * stale list would step a custom tier into one that no longer exists.
   */
  private lodTierNames(diagram: DiagramModel): string[] {
    return [...diagram.getLODConfig().tiers]
      .sort((a, b) => b.minZoom - a.minZoom)
      .map((t) => t.name);
  }

  /**
   * wave8/dirty — everything a frame depends on that is NOT model state.
   *
   * Returns `null` for a frame that must never be reused: a live connection or
   * reconnection drag paints a preview out of INTERACTION state, which no dirty
   * flag and no epoch tracks. Rather than try to hash a drag (and get it subtly
   * wrong once, which is a stuck ghost line on screen), we simply declare those
   * frames uncacheable. They are, by definition, frames in which the user is
   * moving the mouse — there was nothing to skip anyway.
   */
  private frameSignature(viewport: Rectangle, zoom: number): string | null {
    const connection = this.engine.getConnectionStateManager?.()?.getState?.();
    if (connection?.isConnecting) return null;
    if (this.engine.getReconnectionPreview?.()) return null;

    const focus = this.a11yFocus ? `${this.a11yFocus.type}:${this.a11yFocus.id}` : '-';

    // The governor's bias is part of the frame, because it is the one input that can
    // change the picture with NO model change, NO viewport change and NO user input —
    // purely from the frame-time history of the last few frames. A signature that
    // omits it is describing a different frame than the one we would draw.
    //
    // HONESTY ABOUT WHAT THIS ACTUALLY PREVENTS, because I first wrote it up as a
    // catastrophe and the tests said otherwise. The two mechanisms very nearly cannot
    // collide: a skipped frame does not feed the governor (see the skip path), so an
    // idle canvas never advances the bias at all, and any frame that DOES advance it
    // is by definition a frame something changed — which already moves the signature.
    // The residue is a single frame: step down while idle, and without this field the
    // gate would hand back the richer picture already on screen. Harmless, arguably
    // even right, since redrawing it cheaper buys the user nothing.
    //
    // It stays because the signature's contract is "everything this frame depends
    // on", and the bias is one of those things. Cheap insurance, honestly labelled —
    // not the disaster it looked like before it was measured.
    const bias = this.governor?.getBias() ?? 0;

    return `${viewport.x},${viewport.y},${viewport.width},${viewport.height}|${zoom}|${focus}|q${bias}`;
  }

  /**
   * Drop the cached frame. Call from anything whose effect on the picture the
   * mutation epoch cannot see — a topology event, a style/theme invalidation, a
   * registry swap. Cheap and idempotent: the cost of calling it when you did not
   * need to is one rebuilt frame; the cost of NOT calling it when you did is a
   * stale picture, so when in doubt, call it.
   */
  invalidateFrame(): void {
    this.frameInvalidated = true;
    this.invalidationEpoch++;
    this.lastFrameRoot = null;
    this.lastFrameSig = null;
  }

  /**
   * How many times this renderer has been told "the picture you have is no longer
   * the picture you would draw".
   *
   * A HOST'S idle-skip must consult this, not just the model's mutation epoch.
   * The two are not the same, and the gap between them is a real bug: when the
   * off-thread route solver answers, the MODEL has not changed — the epoch does
   * not move — but the renderer's own answer about it has improved. A scheduler
   * keyed only on the model would drop that repaint before `render()` was ever
   * called, and the refined routes would never reach the screen. The renderer's
   * internal gate cannot save you there; it never gets asked.
   *
   * So: model epoch says "did the world change", this says "did MY picture of it
   * change". Skip a frame only when both say no.
   */
  getInvalidationEpoch(): number {
    return this.invalidationEpoch;
  }

  /**
   * wave8/dirty — the incrementality is only real if these move. `framesSkipped`
   * counts frames served from the previous root (zero DOM work); `framesBuilt`
   * counts frames actually walked. An idle canvas should build ONE.
   */
  getFrameStats(): { built: number; skipped: number } {
    return { built: this.framesBuilt, skipped: this.framesSkipped };
  }

  /**
   * Get current theme
   */
  getTheme(): Theme {
    return this.theme;
  }

  /**
   * Set theme and update rendering
   */
  setTheme(theme: Theme): void {
    this.theme = theme;

    // Re-inject CSS if in CSS mode. Only THIS instance's variable block is
    // rewritten — the shared rules are theme-independent, and other diagrams'
    // variable blocks are untouched.
    if (this.config.useCSSMode) {
      this.injectThemeCSS();
    }

    // Clear cache to force re-render with new theme
    this.invalidateStyles('theme-changed');

    // A manual setTheme() overrides whatever the OS was saying; keep the
    // controller in step so its next event compares against what is really live
    // (otherwise the first OS flip after a manual override could be swallowed as
    // a no-op).
    this.colorModeController?.prime(theme);

    // Emit theme changed event
    this.engine.eventBus.emit('renderer:theme-changed', theme);
  }

  // =========================================================================
  // Wave 4 — Card "colorMode with system auto-detection and live hot-swap"
  // =========================================================================

  /**
   * THE HOT-SWAP. Re-theme by rewriting this instance's `--grafloria-*` variables.
   *
   * In CSS mode every value the built-in stylesheet paints resolves through those
   * variables, and every `themeRef`-bound property that lands in an inline CSS
   * style string is emitted as `var(--grafloria-…)`. So for all of them, *this one
   * string write IS the re-theme*: no VNode is rebuilt, no element is touched,
   * the browser simply recomputes.
   *
   * What it cannot cover, it does not pretend to: the entities recorded in
   * `themeBoundNodes` / `themeBoundLinks` (see the field docs) baked a theme
   * literal into their VNode, so they — and only they — are marked dirty and
   * re-resolve on the next frame. An idle diagram re-themes with zero restyles;
   * a diagram with three selected nodes restyles three nodes.
   *
   * Programmatic (Canvas) mode has no stylesheet at all, so there is nothing to
   * rebind and the full invalidation is the only correct answer.
   */
  applyThemeVariables(theme: Theme): void {
    if (this.theme === theme) return;
    this.theme = theme;
    this.colorModeController?.prime(theme);

    if (!this.config.useCSSMode) {
      this.invalidateStyles('theme-changed');
      this.engine.eventBus.emit('renderer:theme-changed', theme);
      return;
    }

    // Rewrite the variables in place — the element itself is not recreated, so
    // the shared stylesheet and the override block keep their positions.
    if (this.styleElement) {
      this.styleElement.textContent = this.generateThemeCSS();
    } else {
      this.injectThemeCSS();
    }

    this.invalidateThemeBoundStyles();
    this.engine.eventBus.emit('renderer:theme-changed', theme);
  }

  /** The colorMode in force, or undefined when the host never asked for one. */
  getColorMode(): ColorMode | undefined {
    return this.colorModeController?.getMode();
  }

  /**
   * Switch colour mode at runtime. `'system'` starts following the OS; the other
   * two pin it. Creates the media-query subscription on first use, so a host can
   * opt in after construction.
   */
  setColorMode(mode: ColorMode, themes?: ThemeSet): void {
    if (themes) this.config.themes = themes;

    if (!this.colorModeController) {
      this.colorModeController = new ColorModeController(mode, this.config.themes, next =>
        this.applyThemeVariables(next)
      );
      this.colorModeController.prime(this.theme);
      this.colorModeController.emit(); // apply the mode we were just given
      return;
    }

    if (themes) this.colorModeController.setThemes(themes);
    this.colorModeController.setMode(mode);
  }

  // =========================================================================
  // Wave 4 — Card "design-token bridge"
  // =========================================================================

  /**
   * Point this diagram's variables at the host design system's tokens
   * (`shadcnBridge()`, `muiBridge()`, `tailwindBridge()`, or a hand-written map).
   * `null` removes the bridge.
   *
   * Pure CSS: the values are the host's own `var(--…)` expressions, so when the
   * host app flips ITS theme, this diagram follows with no code at all — and no
   * VNode is rebuilt here either, for exactly the reason the hot-swap works.
   */
  setTokenBridge(bridge: TokenBridge | null | undefined): void {
    this.tokenBridge = bridge ?? undefined;
    if (this.config.useCSSMode) this.injectOverrideCSS();
  }

  /** The bridge currently applied, if any. */
  getTokenBridge(): TokenBridge | undefined {
    return this.tokenBridge;
  }

  /**
   * This renderer's instance id (`grafloria-3`). It is the value of the
   * `data-grafloria-instance` attribute on the root `<svg>`, the scope of this
   * diagram's CSS variables, and the suffix of its `<style>` element id.
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /** Id of the `<style>` element holding THIS renderer's theme variables. */
  getStyleElementId(): string {
    return `${GRAFLORIA_INSTANCE_STYLE_PREFIX}${this.instanceId}`;
  }

  /** Id of the `<style>` element holding THIS renderer's bridge + a11y overrides. */
  getOverrideElementId(): string {
    return `${GRAFLORIA_INSTANCE_OVERRIDE_PREFIX}${this.instanceId}`;
  }

  /**
   * The complete stylesheet this renderer would inject into `<head>`: the shared
   * theme-independent rules, the animation rules, and THIS instance's
   * `--grafloria-*` variable block.
   *
   * Needed by the SSR path (Card 6). In CSS mode the theme lives entirely in CSS
   * variables, so the emitted SVG is theme-INDEPENDENT — which is exactly what
   * makes hydration cheap, but it also means a server-rendered diagram is
   * unstyled until some stylesheet arrives. `renderToStaticSVG()` returns this
   * string so the server can ship it in a `<style>` tag; the client renderer then
   * re-injects byte-identical content under the same ids, so hydration is still a
   * no-op visually.
   */
  getStyleSheet(): string {
    return (
      generateBaseStyleSheet() +
      '\n\n' +
      this.generateAnimationCSS() +
      '\n\n' +
      this.generateThemeCSS()
    );
  }

  /**
   * Put this diagram's scope on a host element.
   *
   * The root `<svg>` carries it automatically, and `foreignObject` content
   * inherits from it (it lives inside the SVG). Nodes rendered on an HTML LAYER
   * (`metadata.useHTMLLayer`) do NOT — they are siblings of the SVG. Call this
   * with the element that wraps BOTH layers (the canvas host) so those nodes
   * inherit the `--grafloria-*` variables and match the scoped rules too.
   */
  applyInstanceScope(element: Element | null | undefined): void {
    if (!element || !this.config.useCSSMode) return;
    element.setAttribute(GRAFLORIA_INSTANCE_ATTR, this.instanceId);
  }

  /**
   * The instance-scope prop for a root VNode. Emitted in CSS mode only:
   * programmatic mode injects no stylesheet, so scoping it would make its
   * elements match ANOTHER instance's shared rules with no variables defined.
   */
  private instanceScopeProps(): Record<string, string> {
    return this.config.useCSSMode ? { [GRAFLORIA_INSTANCE_ATTR]: this.instanceId } : {};
  }

  /**
   * Drop cached VNodes and mark every entity dirty. Anything that changes how a
   * style RESOLVES (theme swap, named-style (re)definition) must call this,
   * because the cascade is resolved into the emitted VNode.
   */
  private invalidateStyles(reason: string = 'styles-changed'): void {
    this.vnodeCache.clear();
    this.invalidateFrame();
    this.themeBoundNodes.clear();
    this.themeBoundLinks.clear();

    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.getNodes().forEach(node => node.markDirty(reason));
      diagram.getLinks().forEach(link => link.markDirty(reason));
    }
  }

  /**
   * The SURGICAL counterpart of `invalidateStyles`, used by the colorMode
   * hot-swap: dirty ONLY the entities that baked a theme literal into their last
   * VNode. Everything else re-themes through the rebound CSS variables, untouched.
   *
   * Cache entries are dropped by id rather than by clearing the whole cache, so a
   * clean node's VNode survives — that is the point; a cleared cache would mean
   * rebuilding the very frames we set out not to rebuild.
   */
  private invalidateThemeBoundStyles(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    for (const node of diagram.getNodes()) {
      if (!this.themeBoundNodes.has(node.id)) continue;
      node.markDirty('theme-changed');
      this.dropCacheEntries(`node-${node.id}-`);
    }
    for (const link of diagram.getLinks()) {
      if (!this.themeBoundLinks.has(link.id)) continue;
      link.markDirty('theme-changed');
      this.dropCacheEntries(`link-${link.id}-`);
    }

    // They will be re-recorded as the dirty entities re-render.
    this.themeBoundNodes.clear();
    this.themeBoundLinks.clear();
  }

  /** Cache keys are `<kind>-<id>-<lod>`; an entity owns one entry per LOD tier. */
  private dropCacheEntries(prefix: string): void {
    // wave8/dirty: dropping ANY entity's VNode means the frame that embedded it
    // is no longer the frame we would build now.
    this.invalidateFrame();
    for (const key of this.vnodeCache.keys()) {
      if (key.startsWith(prefix)) this.vnodeCache.delete(key);
    }
  }

  // =========================================================================
  // Wave 8 — Card 3: deferred / lazy view instantiation
  // =========================================================================

  /**
   * Install the freeze / lazy-mount gate.
   *
   * With no lifecycle installed the renderer behaves exactly as it always has —
   * every entity culling admits gets a view, on the frame it is admitted. That is
   * the default, and it stays the default: laziness is something a host asks for.
   */
  setViewLifecycle(lifecycle: ViewLifecycle | null): void {
    this.viewLifecycle?.setEvictHook(null);
    this.viewLifecycle?.setChangeHook(null);
    this.viewLifecycle = lifecycle;
    // A frozen entity must not keep a cached view — that is the whole point of
    // freezing it, and a stale VNode in the LRU is exactly the leak autoFreeze
    // exists to close.
    lifecycle?.setEvictHook((kind, id) => this.dropCacheEntries(`${kind}-${id}`));

    // …and the FRAME must be rebuilt, not just the entity's cache entry. Freezing a
    // node changes neither the model nor the viewport, so the frame gate would
    // otherwise hand back the previous picture — with the frozen node still in it —
    // and freeze would silently do nothing. Same for every slice a progressive mount
    // admits. Both branches were green in isolation; the composition was broken.
    lifecycle?.setChangeHook(() => this.invalidateFrame());

    // Installing or removing the lifecycle is itself such a change.
    this.invalidateFrame();
  }

  getViewLifecycle(): ViewLifecycle | null {
    return this.viewLifecycle;
  }

  /**
   * What culling admitted on the last frame and the gate held back.
   *
   * This is the progressive mounter's work queue, and it comes from the renderer
   * rather than being recomputed by the mounter because the viewport→viewBox→cull
   * maths (zoom, link margin) lives here and must not be reimplemented anywhere it
   * could drift.
   */
  getDeferredEntities(): ReadonlyArray<readonly [LazyEntityKind, string]> {
    return this.deferredThisFrame;
  }

  /**
   * Subtract from what culling admitted: frozen entities, and — during a
   * progressive mount — everything the mount has not reached yet.
   */
  private applyMountGate(
    nodes: NodeModel[],
    links: LinkModel[]
  ): { nodes: NodeModel[]; links: LinkModel[] } {
    const gate = this.viewLifecycle;

    if (!gate) {
      // Nothing installed: the historical path, and it must cost nothing. Reuse the empty
      // array rather than allocating a fresh one every frame for a host that never asks.
      if (this.deferredThisFrame.length > 0) this.deferredThisFrame = [];
      return { nodes, links };
    }

    this.deferredThisFrame = [];

    // autoFreeze diffs THIS frame's visible set against the last one, and drops the
    // view of anything that left. Fed the CULLED sets — what is on screen — not the
    // gated ones, or an entity deferred by a mount would look like it had left.
    if (gate.isAutoFreeze()) {
      const visible: Array<readonly ['node' | 'link', string]> = [];
      for (const n of nodes) visible.push(['node', n.id]);
      for (const l of links) visible.push(['link', l.id]);
      gate.retainVisible(visible);
    }

    const admittedNodes: NodeModel[] = [];
    for (const node of nodes) {
      if (gate.admits('node', node.id)) admittedNodes.push(node);
      else this.deferredThisFrame.push(['node', node.id] as const);
    }

    const admittedLinks: LinkModel[] = [];
    for (const link of links) {
      if (gate.admits('link', link.id)) admittedLinks.push(link);
      else this.deferredThisFrame.push(['link', link.id] as const);
    }

    return { nodes: admittedNodes, links: admittedLinks };
  }

  /**
   * How many entities the NEXT theme swap would have to restyle. Zero means the
   * swap is a pure variable rebind. Exposed because "no restyle of every VNode"
   * is a claim that should be measurable, not taken on trust — the tests assert
   * on it, and so can a host.
   */
  getThemeBoundEntityCount(): number {
    return this.themeBoundNodes.size + this.themeBoundLinks.size;
  }

  // =========================================================================
  // Wave 4 — Card "Theme-bound properties": themeRef → an emitted value
  // =========================================================================

  /** Node properties this renderer emits through an inline CSS `style` string. */
  private static readonly NODE_VAR_SAFE: ReadonlySet<string> = new Set(['fill', 'stroke', 'strokeWidth']);

  /** Link properties this renderer emits through an inline CSS `style` string. */
  private static readonly LINK_VAR_SAFE: ReadonlySet<string> = new Set([
    'stroke',
    'strokeWidth',
    'strokeDasharray',
    'opacity',
  ]);

  /**
   * Replace every `themeRef(...)` in a resolved style with something the DOM can
   * paint, and report whether doing so froze a theme literal into the VNode.
   *
   * TWO emissions, and the difference is not cosmetic:
   *
   *   `var(--grafloria-…, literal)` — when the property's value ends up inside an
   *       inline CSS `style` string. Re-theming is then just rebinding the
   *       variable, so the element never needs to be rebuilt.
   *
   *   the LITERAL — everywhere else. SVG PRESENTATION ATTRIBUTES cannot hold
   *       `var()` (`fill="var(--x)"` is simply invalid and the shape paints
   *       black), and programmatic/Canvas mode has no CSS at all. The entity is
   *       recorded as theme-bound so the next theme swap re-resolves it.
   *
   * `varSafe` is therefore not a preference — it is the exact set of properties
   * this renderer is known to emit through a style string. Adding a property to
   * it without also routing its emission through `style` would paint black.
   */
  private materializeThemeRefs<T extends object>(
    style: Partial<T>,
    varSafe: ReadonlySet<string>
  ): { style: Partial<T>; themeBound: boolean } {
    let themeBound = false;
    let out: Partial<T> | undefined;

    for (const [key, value] of Object.entries(style)) {
      if (!isThemeRef(value)) continue;

      out ??= { ...style };
      const token = themeRefToken(value);
      const asVar =
        this.config.useCSSMode && varSafe.has(key) ? themeRefCssValue(token, this.theme) : undefined;

      if (asVar !== undefined) {
        (out as Record<string, unknown>)[key] = asVar;
        continue;
      }

      const literal = resolveThemeRef(token, this.theme);
      if (literal === undefined) {
        // The active theme does not define this token. Drop the property rather
        // than paint `undefined`: the cascade layer beneath it — or the theme
        // stylesheet — is then what shows, which is the correct fallback.
        delete (out as Record<string, unknown>)[key];
      } else {
        (out as Record<string, unknown>)[key] = literal;
      }
      themeBound = true;
    }

    return { style: out ?? style, themeBound };
  }

  /**
   * A paint value safe to put in an SVG PRESENTATION ATTRIBUTE.
   *
   * `var(--x)` is not: the attribute is invalid, the browser ignores it, and the
   * element falls back to whatever the stylesheet says (or black). Everything
   * else — a literal, a `url(#gradient)` paint-server reference — is fine.
   */
  private attributeSafePaint(
    value: string | undefined,
    literal: () => string | undefined
  ): string | undefined {
    if (typeof value === 'string' && value.startsWith('var(')) return literal();
    return value;
  }

  /** Did a theme LAYER (state / type-default) contribute a literal to this node? */
  private drawsThemeLiteral(node: NodeModel): boolean {
    if (!this.config.useCSSMode) return true; // no stylesheet: everything is baked
    const state = node.state;
    if (state.selected || state.highlighted || state.hovered || !state.enabled || state.error) {
      return true;
    }
    return this.hasTypeDefaults(this.theme.nodes, node.type);
  }

  private linkDrawsThemeLiteral(link: LinkModel): boolean {
    if (!this.config.useCSSMode) return true;
    if (link.state === 'selected' || link.state === 'highlighted' || link.state === 'hovered') {
      return true;
    }
    return this.hasTypeDefaults(this.theme.links, linkTypeKey(link));
  }

  /** `theme.nodes[type]` / `theme.links[type]` — `default` is the BASE layer, not a type. */
  private hasTypeDefaults(map: Record<string, unknown>, type: string | undefined): boolean {
    if (!type || type === 'default') return false;
    const entry = map[type];
    return !!entry && Object.keys(entry).length > 0;
  }

  /**
   * A link's stroke and stroke-width as LITERALS — never a `var()` string.
   *
   * Needed by the two consumers that cannot take a CSS variable:
   *   - the ARROWHEAD, which paints through presentation attributes;
   *   - the hit-area width, which does ARITHMETIC on the stroke width
   *     (`Number('var(--x)') + 8` is NaN, and a NaN-wide hit area is unclickable).
   */
  private linkPaintLiterals(link: LinkModel): { stroke?: string; strokeWidth: number } {
    const resolved = resolveLinkStyle(link, this.theme, {
      includeThemeBase: !this.config.useCSSMode,
    });

    const literal = (value: unknown): string | number | undefined => {
      if (isThemeRef(value)) return resolveThemeRef(themeRefToken(value), this.theme);
      return value as string | number | undefined;
    };

    const stroke = literal(resolved.stroke);
    const width = literal(resolved.strokeWidth);

    return {
      stroke: typeof stroke === 'string' ? stroke : undefined,
      strokeWidth: typeof width === 'number' && Number.isFinite(width) ? width : 2,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      mode: 'svg',
      nodeCount: this.lastNodeCount,
      linkCount: this.lastLinkCount,
      renderTime: this.lastRenderTime,
      fps: this.fps,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  // =========================================================================
  // Deterministic headless export (Rendering — Card 7)
  //
  // The picture the export produces is built from the SAME `render()` call the
  // live pipeline uses — the tree goes to the DOM patcher in a browser and to the
  // string serializer on a server. There is no second rendering path to drift.
  // =========================================================================

  /**
   * Export the diagram.
   *
   * - `'svg'` → a STANDALONE, styles-inlined SVG document. Pure, deterministic,
   *   and DOM-free: it runs in plain Node (an SSR pass, a thumbnail worker).
   * - `'png' | 'jpeg' | 'webp'` → a `data:` URL. Needs an SVG rasterizer: a
   *   canvas one is used automatically in a browser/worker; in bare Node you must
   *   pass `options.rasterBackend` (and you get a clear error if you don't).
   *
   * Defaults to the whole diagram (content bounds + 20px), not the current
   * viewport — a thumbnail of the visible slice is rarely what anyone means.
   */
  async export(format: ExportFormat = 'svg', options: ExportOptions = {}): Promise<string> {
    if (format === 'svg') {
      // Vector: no canvas, so no size cap unless the caller asks for one.
      return this.exportSvgString(options).svg;
    }

    if (format === 'pdf') {
      // A PDF is bytes, and this contract returns a string — so hand back a data: URL.
      // `exportPdf()` gives you the bytes and the warnings.
      return bytesToDataUrl(this.exportPdf(options).pdf, 'application/pdf');
    }

    // RASTER pixels are allocated, and every browser has a hard canvas ceiling it
    // enforces SILENTLY — over it, `toDataURL` hands back a blank image rather than
    // throwing. So the raster path always carries a cap; the scale is reduced to fit.
    //
    // JPEG HAS NO ALPHA CHANNEL. Rasterizing a transparent SVG into it yields a BLACK
    // background in every browser (the undefined RGB under alpha=0 reads as 0,0,0) —
    // the classic "why is my exported JPEG black" bug. So an opaque format gets an
    // opaque backdrop, painted INTO the SVG, unless the caller chose a colour.
    const result = this.exportSvgString({
      ...options,
      maxSize: options.maxSize ?? DEFAULT_MAX_OUTPUT_SIZE,
      backgroundColor: options.backgroundColor ?? (format === 'jpeg' ? '#ffffff' : undefined),
    });

    const backend = resolveRasterBackend(options.rasterBackend);
    const url = await backend.rasterize({
      svg: result.svg,
      width: result.width,
      height: result.height,
      mimeType: mimeTypeForFormat(format),
      quality: options.quality ?? 0.92,
    });

    // Card 7: carry the source model in the PNG itself, so the exported image can be
    // re-opened and edited. PNG ONLY — JPEG and WebP have no equivalent of a text
    // chunk that survives their encoders, so promising it there would be a lie.
    if (options.embedModel && format === 'png') {
      const envelope = this.modelEnvelope(options);
      if (envelope) {
        const withModel = embedModelInPng(dataUrlToBytes(url), envelope);
        return bytesToDataUrl(withModel, 'image/png');
      }
    }

    return url;
  }

  /**
   * The document envelope to embed — the ENGINE's own, so the artifact carries exactly
   * the format the engine already round-trips losslessly and checksums.
   *
   * `createdAt` is the one field that would otherwise make an export non-deterministic,
   * so a caller who needs byte-identical output passes it in.
   */
  private modelEnvelope(options: ExportOptions): DiagramDocumentEnvelope | undefined {
    if (!options.embedModel) return undefined;
    const diagram = this.engine.getDiagram();
    if (!diagram) return undefined;

    return new DiagramSerializer().serializeEnvelope(diagram, {
      generator: '@grafloria/renderer',
      createdAt: options.embedModelCreatedAt,
    });
  }

  /**
   * The synchronous, fully headless SVG path — what `export('svg')` returns, plus
   * the fidelity `warnings` (foreignObject, unresolved theme vars) that the
   * string-only `IRenderer.export` signature has nowhere to put.
   */
  exportSvgString(options: ExportOptions = {}): SvgExportResult {
    const padding = options.padding ?? 20;

    // scope 'viewport' needs the caller to SAY which rectangle. The renderer does not
    // retain one — the viewport is an argument to `render()`, never a field — so it
    // genuinely cannot know what is on screen. Failing loudly beats quietly exporting
    // the content bounds and calling it "the viewport".
    if (options.scope === 'viewport' && !options.viewport) {
      throw new Error(
        "[grafloria/export] scope: 'viewport' requires options.viewport. The renderer does not " +
          'retain the viewport (it is an argument to render(), not state), so it cannot know which ' +
          'slice is on screen — pass the same rectangle you render with.'
      );
    }

    // An explicit rectangle is the caller saying "this exact slice". Everything else
    // fits the box to the content.
    const explicit = options.viewport;

    const ids = options.scope === 'selection' ? this.selectedIds() : options.includeIds;

    // THE RENDER PASS culls to its viewport, so it must see everything we intend to
    // box. It is NOT the viewBox: that is recomputed from the resulting tree (which
    // is what lets labels and arrowheads outside the model bounds survive).
    // The extra slack keeps a label that overhangs the model bounds from being culled.
    const renderViewport = explicit ?? this.contentViewport(padding + CONTENT_RENDER_SLACK);

    // zoom 1: the SVG stays vector, and `scale` multiplies the intrinsic
    // width/height instead of the viewBox — so a 2x PNG is 2x pixels of the
    // identical picture, not a differently-culled render.
    const root = this.render(renderViewport, 1);

    return exportSvg(root, {
      theme: this.theme,
      scale: options.scale,
      backgroundColor: options.backgroundColor,
      foreignObject: options.foreignObject,
      captureForeignObject: options.captureForeignObject,
      embedFontCss: options.embedFontCss,
      embedFonts: options.embedFonts,
      // An explicit rectangle wins and is used verbatim; otherwise fit the content.
      viewBox: explicit,
      fitToContent: explicit === undefined,
      padding,
      includeIds: ids,
      maxSize: options.maxSize,
      minSize: options.minSize,
      xmlDeclaration: options.xmlDeclaration,
      embedModel: this.modelEnvelope(options),
    });
  }

  /**
   * A TRUE VECTOR PDF: paths stay paths and text stays text, so it is selectable,
   * searchable and scales without pixelation.
   *
   * Painted straight from the VNode tree — the same tree the screen gets — so there is no
   * SVG→DOM→PDF round trip and no second rendering path. See `export/pdf/` for the
   * dependency decision (we do NOT use svg2pdf.js + jsPDF, and why) and for the honest
   * list of what a base-14-font PDF cannot do.
   */
  exportPdf(options: ExportOptions = {}): PdfExportResult {
    const padding = options.padding ?? 20;
    const ids = options.scope === 'selection' ? this.selectedIds() : options.includeIds;

    const renderViewport = options.viewport ?? this.contentViewport(padding + CONTENT_RENDER_SLACK);
    let tree = this.render(renderViewport, 1);
    if (ids !== undefined) tree = filterTreeByIds(tree, ids);

    return exportPdf(tree, {
      // The renderer's LIVE theme. Without it the PDF resolves the cascade against the
      // default light theme — or, in CSS mode, against nothing at all, and every link
      // loses its stroke and every node its fill.
      theme: this.theme,
      padding,
      viewBox: options.viewport,
      backgroundColor: options.backgroundColor,
      ...options.pdf,
    });
  }

  /**
   * Slice the diagram into pages (Card 5).
   *
   * Returns one standalone SVG per page — a tile grid you can print, or lay out as a poster.
   * Breaks are snapped so they do not cut a node in half; see `export/pagination.ts`.
   */
  exportPages(pagination: PaginationOptions, options: ExportOptions = {}): PagedSvgResult {
    const padding = options.padding ?? 20;
    const ids = options.scope === 'selection' ? this.selectedIds() : options.includeIds;

    let tree = this.render(this.contentViewport(padding + CONTENT_RENDER_SLACK), 1);
    if (ids !== undefined) tree = filterTreeByIds(tree, ids);

    const layout = paginate(tree, { padding, ...pagination });
    const warnings = [...layout.warnings];

    const pages = layout.pages.map(page => {
      // The page's WINDOW is the viewBox (so every tile is at the same scale); the clip is
      // handled by the viewBox itself here — an SVG tile simply shows less content when its
      // clip is narrower, which is the same white space the PDF path leaves.
      const result = exportSvg(tree, {
        theme: this.theme,
        viewBox: page.rect,
        fitToContent: false,
        scale: options.scale,
        backgroundColor: options.backgroundColor,
        foreignObject: options.foreignObject,
        captureForeignObject: options.captureForeignObject,
        embedFontCss: options.embedFontCss,
      });
      warnings.push(...result.warnings);
      return { ...page, svg: result.svg };
    });

    return { pages, columns: layout.columns, rows: layout.rows, warnings: [...new Set(warnings)] };
  }

  /**
   * A multi-page PDF of a diagram too big for one sheet.
   *
   * The paginator supplies the page grid; the PDF writer honours each page's `clip`, so a
   * break pulled back to spare a node leaves white space rather than half a box.
   */
  exportPaginatedPdf(pagination: PaginationOptions, options: ExportOptions = {}): PdfExportResult {
    const padding = options.padding ?? 20;
    const ids = options.scope === 'selection' ? this.selectedIds() : options.includeIds;

    let tree = this.render(this.contentViewport(padding + CONTENT_RENDER_SLACK), 1);
    if (ids !== undefined) tree = filterTreeByIds(tree, ids);

    const layout = paginate(tree, { padding, ...pagination });

    const result = exportPdf(tree, {
      theme: this.theme,
      padding,
      backgroundColor: options.backgroundColor,
      pageNumbers: true,
      ...options.pdf,
      pages: layout.pages,
    });

    return { ...result, warnings: [...new Set([...layout.warnings, ...result.warnings])] };
  }

  /**
   * The ids currently selected — what `scope: 'selection'` exports.
   *
   * Selection is MODEL state (`node.state.selected`, `link.state === 'selected'`),
   * which is the same place the renderer reads it from to paint the selection
   * colours. There is no separate selection registry to consult.
   */
  private selectedIds(): string[] {
    const diagram = this.engine.getDiagram();
    if (!diagram) return [];

    const ids: string[] = [];
    for (const node of diagram.getNodes()) {
      if (node.state?.selected) ids.push(node.id);
    }
    for (const link of diagram.getLinks()) {
      if (link.state === 'selected') ids.push(link.id);
    }
    return ids;
  }


  /**
   * The world rectangle that contains the whole diagram, padded.
   *
   * Nodes' bounding boxes plus any routed link points (a link can bulge outside
   * its endpoints' union). An empty diagram exports a small, still-valid square
   * rather than a zero-area document a rasterizer would reject.
   */
  private contentViewport(padding: number): Rectangle {
    const diagram = this.engine.getDiagram();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    if (diagram) {
      for (const node of diagram.getNodes()) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.size.width);
        maxY = Math.max(maxY, node.position.y + node.size.height);
      }
      for (const link of diagram.getLinks()) {
        for (const point of link.points ?? []) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      const side = Math.max(1, padding * 2);
      return { x: 0, y: 0, width: side, height: side };
    }

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }

  /**
   * Dispose renderer and clean up resources
   */
  /**
   * Wave 8 — Card 6: how many links this frame actually had to route, and how
   * many were served from the previous frame.
   *
   * Public because a cache that silently stops hitting is indistinguishable from
   * no cache at all — it just gets slow again, and nothing says so. Tests assert
   * on this; the benchmark harness prints it.
   */
  getRoutingStats(): { routed: number; reused: number; cached: number } {
    return { ...this.routeMemo.stats, cached: this.routeMemo.size };
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    // Wave 8 — Card 6: the route memo outlives the frame by design, so it must
    // not outlive the renderer. (It holds a routed polyline per link plus a rect
    // per node — on a 10k diagram that is real memory to hand back.)
    this.routeMemo.clear();
    this.frameObstacleCache = null;
    this.solverBridge?.dispose();
    this.solverBridge = null;

    // Stop the FPS sampler. It used to run FOREVER: `startFPSTracking` opened a
    // 1s interval in the constructor that nothing ever cleared, so every disposed
    // renderer leaked a live timer — which in Node (a thumbnail service creating a
    // renderer per export) also keeps the process alive forever.
    if (this.fpsInterval !== undefined) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = undefined;
    }

    // Stop listening for named-style (re)definitions
    this.unsubscribeStyleRegistry?.();
    this.unsubscribeStyleRegistry = undefined;

    // …and for edge-template (re)definitions (Card 5)
    this.unsubscribeEdgeTemplates?.();
    this.unsubscribeEdgeTemplates = undefined;

    // Wave 6: these are module-GLOBAL registries, so a renderer that failed to
    // unsubscribe would keep a dead instance alive and repaint it forever —
    // precisely the leak the "every register() returns a disposer" rule exists
    // to prevent.
    this.unsubscribeLinkPipeline?.();
    this.unsubscribeLinkPipeline = undefined;
    this.unsubscribeShapeRegistry?.();
    this.unsubscribeShapeRegistry = undefined;

    // Stop following the OS colour scheme / contrast preferences.
    this.colorModeController?.dispose();
    this.colorModeController = undefined;

    // This instance's bridge + a11y block goes with its theme block.
    this.overrideElement?.remove();
    this.overrideElement = undefined;

    this.themeBoundNodes.clear();
    this.themeBoundLinks.clear();

    // Remove THIS instance's variable block (its id is per-instance, so this can
    // no longer take another diagram's stylesheet down with it), then drop the
    // shared rules once the last renderer on the page is gone.
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = undefined;
      this.releaseBaseStyleSheet();
    }

    // Clear cache
    this.vnodeCache.clear();

    // wave8/dirty: the cached frame holds the whole VNode tree of a dead diagram.
    this.invalidateFrame();

    // Clear foreignObject tracking
    this.containerIds.clear();
    this.foreignObjectNodes.clear();

    // Clear per-frame smart-connection state
    this.frameSmartSides.clear();
    this.frameSpreadLanes.clear();

    // Wave 4: drop the optimizer's cross-frame state (grid, dirty tracking,
    // cached jumps/label placements) — it outlives a single frame, so leaking it
    // past disposal would pin every link and node of a dead diagram.
    this.edgeOptimizer.reset();
    this.frameJumps.clear();
    this.frameLabelOffsets.clear();
    this.frameSeparation.clear();
    this.frameLinkSigs.clear();

    // Unsubscribe from engine events
    // (EventBus will handle cleanup on engine destroy)
  }

  /**
   * Render links layer
   * FIXED: Sort links so selected/highlighted links render on top
   */
  private renderLinksLayer(links: LinkModel[], lod: LODLevel): VNode {
    // Sort links: default/hovered first, then selected/highlighted on top
    const sortedLinks = [...links].sort((a, b) => {
      const aOrder = (a.state === 'selected' || a.state === 'highlighted') ? 1 : 0;
      const bOrder = (b.state === 'selected' || b.state === 'highlighted') ? 1 : 0;
      return aOrder - bOrder;
    });

    // Pre-pass: route every auto-routed link and sync its points BEFORE any
    // link builds its VNode. Jump-point detection reads other links' points,
    // so without this the first frame has no jumps and later frames use stale
    // geometry after nodes move.
    this.frameRoutes.clear();
    // Wave 6: lane assignments are geometry, so they die with the frame — a link
    // added or removed between frames changes how many siblings a port has.
    this.frameSpreadLanes.clear();
    // Drop smart-side entries for links that no longer exist (getLinkEndpoints
    // only ever touches the entry of the link it renders)
    if (this.frameSmartSides.size > 0) {
      const liveIds = new Set(links.map(l => l.id));
      for (const id of Array.from(this.frameSmartSides.keys())) {
        if (!liveIds.has(id)) this.frameSmartSides.delete(id);
      }
    }

    // =====================================================================
    // wave8/culling — Card 4: THE ECONOMIC LOD GATE.
    //
    // This block is where a far-zoom frame stopped costing 63 seconds.
    //
    // Every pass below is O(nodes) or worse PER EDGE, and every one of them
    // exists to make edges LEGIBLE — route around obstacles, fan parallel
    // bundles onto their own lanes, nudge shared corridors apart, hop crossings.
    // At 0.25 zoom a node is 35x17 CSS pixels and every one of those decisions
    // is sub-pixel: the picture is byte-identical whether we compute them or not,
    // and profiling says computing them is 96-99% of the frame.
    //
    // So at a tier that has dropped `routing`, we do not compute them. Edges
    // become direct port-to-port polylines, in O(1) each instead of O(nodes)
    // each. That is not a cheaper route — it is the SAME PICTURE, arrived at
    // without the arithmetic.
    //
    // NOTE for wave8/routing: this is a gate at the CALL SITE. `computeAutoRoute`
    // and everything under it is untouched and still owns how a route is found —
    // this only decides whether finding one can possibly matter.
    // =====================================================================
    const routingLod = this.lodAllows('routing', lod);
    const detailLod = this.lodAllows('link-detail', lod);

    // Wave 4 — Card 4: assign each link its lane in its parallel bundle BEFORE
    // routing, so the route can be separated in the same pass. Computed over the
    // WHOLE diagram, not just the visible links: a bundle whose other members are
    // scrolled off-screen must still keep this one on its own lane, or links
    // would visibly jump lanes as you pan.
    //
    // Lane offsets are a few pixels wide; below the routing tier they are not
    // resolvable. Cleared rather than skipped — a stale lane assignment from the
    // last near-zoom frame would offset endpoints against a route that no longer
    // has lanes.
    if (routingLod) {
      this.computeParallelSeparation();
    } else {
      this.frameSeparation.clear();
    }

    // Wave 8 — Card 6: work out what actually changed BEFORE routing anything.
    // Diffs the node rects against last frame, asks the engine's link spatial
    // index which links' corridors those changes touched, and forgets exactly
    // those routes. Everything else is served from the previous frame.
    this.invalidateStaleRoutes();

    // Wave 8 — Card 3 (progressive mount) vs Card 6 (route memo).
    //
    // A time-sliced mount MUST NOT re-route, on every slice, what the previous slices
    // already routed — that turns one pass over the scene into a quadratic one, and the
    // progressive mount would end up slower than the blocking render it replaced.
    //
    // This branch used to carry its own replay cache to prevent that (`mountRoutes`,
    // keyed on link id + a "this slice is sealed" flag). The route memo below now does
    // the same job properly, and the memo's key is STRICTLY STRONGER than mine was: it
    // keys on the routing INPUTS (endpoints + routing LOD), so it cannot serve a route
    // that the world has since invalidated, and `invalidateStaleRoutes()` forgets any
    // route whose corridor a third party moved into. My key could see neither.
    //
    // So the replay cache is gone and the mount rides the memo: a link routed by slice k
    // is a memo HIT for slice k+1, at full correctness. Two caches for one job, where one
    // of them is weaker, is how you get a route that "hasn't changed" and is wrong anyway.
    // The spec still counts routes per link across a whole mount and pins it at one.
    for (const link of sortedLinks) {
      if (this.linkHasManualWaypoints(link)) continue;

      const endpoints = this.getLinkEndpoints(link);
      if (!endpoints) continue;

      // The key IS the routing inputs. An endpoint that moved changes the key by
      // construction — no separate "did my node move?" check, and no way for one
      // to be forgotten. What the key CANNOT see is a third-party obstacle moving
      // into this link's path; that is what invalidateStaleRoutes() above is for.
      //
      // `routingLod` is IN the key, and that is not decoration. The LOD gate and
      // the memo were built by different hands against different trees: the gate
      // decides A*-vs-straight-line, the memo decides recompute-vs-reuse, and a
      // link routed coarse at zoom 0.3 has the SAME endpoints — hence the same
      // key — as the same link routed properly at zoom 0.6. Without the flag,
      // zooming back IN serves the far-zoom straight line from cache and the
      // diagram never recovers its real routes. Two correct changes, composed
      // into a bug; the key is where they are made to compose.
      const key = this.routeKey(link, endpoints, routingLod);
      let routed = this.routeMemo.lookup(link.id, key);

      if (!routed) {
        const fresh = this.routeForLOD(link, endpoints, routingLod);
        if (fresh) {
          this.routeMemo.store(link.id, key, fresh);
          routed = fresh;
        } else {
          // No route: make sure a previous frame's answer cannot linger.
          this.routeMemo.drop(link.id);
        }
      }

      if (routed) {
        this.frameRoutes.set(link.id, routed);
        this.syncPaintedLinkPoints(link, routed.points, endpoints);
      }
    }

    // Wave 8 — Card 6: the OFF-THREAD global solver. Runs after the synchronous
    // routes are in hand, never instead of them: `render()` cannot await a
    // worker, so the sync routes are what gets painted THIS frame, and the
    // solver's better answer is adopted on a later one. Opt-in.
    this.applyGlobalSolver(sortedLinks);

    // Wave 5 — Card 4: corridor separation. Runs AFTER routing (it needs the
    // final polylines) and BEFORE the optimizer (jumps and labels must see the
    // nudged geometry, not the stacked one). Computed among the frame's routed
    // links: a corridor-mate scrolled off-screen doesn't hold its lane — the
    // separation is a legibility pass, not a persistent assignment.
    //
    // A legibility pass on an illegible view is pure cost: skipped below the
    // routing tier (and direct polylines share no corridors to begin with).
    if (routingLod) this.applyChannelNudging(sortedLinks);

    // Wave 4 — Card 7: THE diagram-wide edge pass. Runs once, after every link's
    // geometry is final and before any link builds its VNode, because both of its
    // outputs (jump-overs, label placements) are functions of the WHOLE picture.
    //
    // Both of those outputs are gated on `link-detail` at draw time, and it walks
    // EVERY link and EVERY node in the diagram to produce them — so below that
    // tier it is computing an answer nobody will read. Its outputs are cleared,
    // not left stale, for the same reason as the lanes above.
    if (detailLod) {
      this.runEdgeOptimizer();
    } else {
      this.frameJumps.clear();
      this.frameLabelOffsets.clear();
    }

    // The link VNode cache keys off `link.isDirty`, but a link's rendered output
    // also depends on things that are NOT on the link — where its nodes moved to,
    // which links now cross it, where the optimizer put its labels. Without this
    // a clean link would serve a stale VNode after a neighbour moved. (Latent
    // bug: jump arcs already had exactly this problem before Wave 4.)
    this.markLinksWhoseFrameChanged(sortedLinks);

    const children = sortedLinks.map(link => this.renderLink(link, lod));

    return {
      type: 'g',
      key: 'links-layer',
      props: {
        className: 'links-layer',
      },
      children,
    };
  }

  // =========================================================================
  // Wave 8 (Performance & scale) — Card 6: incremental routing
  // =========================================================================

  /**
   * Everything that determines a link's route, as a string.
   *
   * If two frames produce the same key then `computeAutoRoute` — a pure function
   * of these inputs and the obstacle set — would produce the same polyline, so we
   * serve the old one. Which means: anything computeAutoRoute reads MUST be in
   * here, or the cache serves a stale route. The obstacle set is the single input
   * deliberately left out (it is the whole diagram); it is handled instead by
   * invalidateStaleRoutes(), which evicts on obstacle MOTION.
   *
   * Endpoints are quantised to 1/100 unit. They are derived from node positions
   * and port layouts in floating point, and an endpoint that is unchanged in
   * every way that matters can still differ in the last mantissa bit; keying on
   * the raw float would miss forever and quietly hand back the O(scene)
   * behaviour this card exists to delete — a cache that never hits looks exactly
   * like no cache at all, and says nothing while it does it.
   */
  private routeKey(
    link: LinkModel,
    endpoints: NonNullable<ReturnType<SVGRenderer['getLinkEndpoints']>>,
    routingLod: boolean
  ): string {
    const q = (v: number) => Math.round(v * 100);
    const sep = this.frameSeparation.get(link.id) ?? 0;
    const jetty = link.style?.jetty ?? '-';
    const isLoop = link.isSelfLoop();

    return [
      // Which ROUTER produced this answer, not just what it was given. A coarse
      // far-zoom line and a real A* route share every other input.
      routingLod ? 'a*' : 'coarse',
      q(endpoints.start.x),
      q(endpoints.start.y),
      q(endpoints.end.x),
      q(endpoints.end.y),
      endpoints.sourceDirection ?? '-',
      endpoints.targetDirection ?? '-',
      this.routerForLink(link),
      link.pathType ?? '-',
      jetty,
      sep,
      // a self-loop is routed from the node's BOX, not just from its two ports
      isLoop ? this.selfLoopBoxKey(link) : '-',
    ].join('|');
  }

  /** The source node's box — the extra input a self-loop's route depends on. */
  private selfLoopBoxKey(link: LinkModel): string {
    const id = (link as any).sourceNodeId || (link as any).source;
    const node = id ? this.engine.getDiagram()?.getNode(id) : undefined;
    if (!node) return 'loop';
    return `loop:${Math.round(node.position.x)},${Math.round(node.position.y)},${Math.round(
      node.size.width
    )},${Math.round(node.size.height)}`;
  }

  /**
   * Forget the routes that the world just invalidated — and ONLY those.
   *
   * A link needs re-routing if one of its endpoint nodes moved (the route key
   * catches that by itself, because the endpoints ARE the key) OR if some OTHER
   * node moved into or out of the corridor it runs through. The second case is
   * the one that matters and the one that is easy to miss: the link did not
   * change, its own nodes did not change, and yet a wall just appeared across
   * its path. "Re-route the links whose endpoints moved" is fast and wrong.
   *
   * So: diff the node rects against last frame; every node that moved, resized,
   * appeared or vanished contributes both the rect it VACATED and the rect it now
   * OCCUPIES; ask the engine's link spatial index — which is keyed on each link's
   * routed bounding box, because syncLinkPoints refreshes it — which links run
   * through those regions once the routing clearance is added; evict exactly them.
   */
  private invalidateStaleRoutes(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // A config change (or the very first frame) means we cannot trust anything
    // we cached. Drop it and re-derive from the world as it is now.
    if (this.routeMemoDirty) {
      this.routeMemo.clear();
      this.frameObstacleCache = null;
      this.routeMemoDirty = false;
      this.worldVersion++;
    }

    const rects = new Map<string, Rect>();
    for (const node of diagram.getNodes()) {
      rects.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      });
    }

    // Anything that changes the obstacle set WITHOUT moving a node rect — a group
    // collapsing hides its members and raises a block — drops the cache whole.
    // Rare, and reasoning about which links a collapse touched is how you ship a
    // stale route.
    const dirty = this.routeMemo.beginFrame(rects, this.obstacleEpoch(diagram));

    if (dirty.length === 0) {
      // Nothing moved: the obstacle arrays from last frame still describe the
      // world exactly. KEEPING them (identity and all) is what makes an idle or
      // pan frame free — the engine memoises its merged obstacle set and spatial
      // index on that array's identity, so a fresh array every frame would
      // rebuild both for a world that did not change.
      return;
    }

    // The world moved, so the obstacle arrays are stale. A NEW array (not a
    // mutated one) is required: its identity is the engine's memo key.
    this.frameObstacleCache = null;
    this.worldVersion++;

    const stale = new Set<string>();
    for (const region of coalesce(dirty)) {
      for (const link of diagram.getVisibleLinks(inflate(region, ROUTE_INFLUENCE_PAD))) {
        stale.add(link.id);
      }
    }
    this.routeMemo.invalidate(stale);
  }

  /**
   * Wave 8 — Card 6: drive the global penalty-field solver, and adopt its answer
   * when (and only when) it describes the world we are actually drawing.
   *
   * Order of events across frames, which is the whole design:
   *
   *   frame N   — the sync router paints correct routes; we hand the solver this
   *               world (edges + obstacles + version) and carry on. Nothing waits.
   *   frame N+k — the solve lands. If the world is still version N, its routes are
   *               adopted and `onRoutesRefined` asks the host for a re-render. If
   *               the world has MOVED, the answer is dropped on the floor: it was
   *               computed against obstacles that are not there any more, and
   *               painting it would run links through nodes.
   *
   * So a link's geometry is always either "correct, one-at-a-time" or "correct,
   * globally optimised" — never "optimised for a diagram that no longer exists".
   */
  private applyGlobalSolver(links: LinkModel[]): void {
    if (!this.config.globalRouting) return;

    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    if (!this.solverBridge) {
      this.solverBridge = new RouteSolverBridge({
        port: this.config.routeSolverPort,
        solver: this.config.routeSolverOptions,
        // wave8/dirty × wave8/routing — THE MERGE SEAM. This bug is in neither
        // branch alone, which is why both were green.
        //
        // When the worker answers, NOTHING IN THE MODEL HAS CHANGED. No node
        // moved, no link changed, no entity was dirtied, so the mutation epoch
        // did not move — and the viewport did not move either. Every input the
        // frame gate keys on says "identical frame", so the gate answers the
        // host's repaint request from cache and the globally-optimised routes we
        // just paid a worker to compute are dropped on the floor. Permanently:
        // nothing will reopen the gate until some unrelated edit happens to.
        //
        // The picture is not corrupt, so nothing screams. The feature just
        // silently does not work.
        //
        // The general rule, and the one to apply to the NEXT thing that lands
        // here: ask what can change about the picture that is not in the state
        // you key on. "A better answer arrived asynchronously" is such a thing.
        // It is not in the model and it is not in the view, so it must say so.
        onRoutesReady: () => {
          this.invalidateFrame();
          this.config.onRoutesRefined?.();
        },
      });
    }

    const version = this.worldVersion;

    // Already solved for this world? Take the good routes.
    if (this.solverBridge.hasRoutesFor(version)) {
      for (const link of links) {
        if (this.linkHasManualWaypoints(link)) continue;
        if (link.isSelfLoop()) continue; // a self-loop has no corridor to share
        const solved = this.solverBridge.routeFor(link.id, version);
        if (!solved) continue;
        this.frameRoutes.set(link.id, solved);
        this.syncPaintedLinkPoints(link, solved.points);
      }
      return;
    }

    // Not solved yet — describe this world and ask. Idempotent per version, so
    // calling it every frame costs nothing.
    const edges: SolverEdge[] = [];
    for (const link of links) {
      if (this.linkHasManualWaypoints(link) || link.isSelfLoop()) continue;
      const endpoints = this.getLinkEndpoints(link);
      if (!endpoints) continue;
      edges.push({
        id: link.id,
        start: { x: endpoints.start.x, y: endpoints.start.y },
        end: { x: endpoints.end.x, y: endpoints.end.y },
        sourceDirection: endpoints.sourceDirection,
        targetDirection: endpoints.targetDirection,
        jetty: link.style?.jetty,
      });
    }
    if (edges.length === 0) return;

    this.solverBridge.submit(version, edges, this.frameObstacles(diagram).routing);
  }

  /** Wave 8 — Card 6: what the off-thread solver has been doing. */
  getRouteSolverStats(): RouteSolverStats | null {
    return this.solverBridge ? { ...this.solverBridge.stats } : null;
  }

  /**
   * A fingerprint of the obstacle facts that are NOT node rectangles: which
   * groups are collapsed, and where their blocks sit. Node motion is tracked
   * precisely; this only has to notice that GROUP state moved.
   */
  private obstacleEpoch(diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>): string {
    const groups = (diagram as any).getGroups?.() ?? [];
    if (groups.length === 0) return '';
    const parts: string[] = [];
    for (const g of groups as any[]) {
      if (!g.isCollapsed) continue;
      const r = g.size
        ? `${g.position.x},${g.position.y},${g.size.width},${g.size.height}`
        : g.bounds
          ? `${g.bounds.x},${g.bounds.y},${g.bounds.width},${g.bounds.height}`
          : 'x';
      parts.push(`${g.id}:${r}:${g.members?.size ?? 0}`);
    }
    return parts.sort().join(';');
  }

  // =========================================================================
  // Wave 4 (Edges & links) — Card 4: parallel bundles
  // =========================================================================

  /**
   * Wave 5 — Card 4: separate corridor-sharing segments of DIFFERENT links onto
   * parallel lanes. Only orthogonal-geometry links participate (a diagonal
   * smooth line has no corridor to share); only interior segments move; a
   * member whose slide would shrink or reverse an adjacent segment pins its
   * lane, and an unsatisfiable corridor is skipped whole.
   */
  private applyChannelNudging(links: LinkModel[]): void {
    if (!this.config.channelNudging || this.frameRoutes.size < 2) return;

    const byId = new Map(links.map((l) => [l.id, l] as const));
    const routesIn = new Map<string, ReadonlyArray<{ x: number; y: number }>>();
    for (const [id, routed] of this.frameRoutes) {
      const link = byId.get(id);
      if (!link || !this.isOrthogonalRouting(link)) continue;
      routesIn.set(id, routed.points);
    }
    if (routesIn.size < 2) return;

    const { deltas } = computeChannelNudges(routesIn, {
      trigger: CHANNEL_NUDGE_TRIGGER,
      spacing: this.config.parallelSpacing,
    });

    for (const [linkId, perSegment] of deltas) {
      const routed = this.frameRoutes.get(linkId);
      const link = byId.get(linkId);
      if (!routed || !link) continue;
      const nudged = applyChannelNudges(routed.points, perSegment);
      this.frameRoutes.set(linkId, {
        ...routed,
        points: nudged,
        totalLength: polylineLength(nudged),
        bendCount: Math.max(0, nudged.length - 2),
      });
      this.syncPaintedLinkPoints(link, nudged);
    }
  }

  /**
   * Group every link in the diagram by the (unordered) node pair it connects and
   * hand each member of a multi-link group its lane offset.
   *
   * UNORDERED pairs: A→B and B→A are one visual bundle. Ordering them separately
   * would give each a group of one, an offset of 0, and put both back on the same
   * centre line — which is the bug this card exists to kill.
   *
   * A pair with exactly ONE link gets offset 0 and is therefore untouched, which
   * is what keeps every existing diagram pixel-identical.
   */
  private computeParallelSeparation(): void {
    this.frameSeparation.clear();
    if (!this.config.parallelLinks) return;

    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    const groups = new Map<string, LinkModel[]>();
    for (const link of diagram.getLinks()) {
      // Self-loops are not a "bundle" — they nest concentrically instead (see
      // selfLoopIndex), so they must not consume lanes in the pair map.
      if (link.isSelfLoop()) continue;
      const key = link.getNodePairKey();
      if (!key) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(link);
      else groups.set(key, [link]);
    }

    for (const [, members] of groups) {
      if (members.length < 2) continue;

      // Per-link spacing overrides the renderer default; the FIRST member that
      // asks decides for the bundle, because a bundle with two different spacings
      // is not a bundle.
      const spacing =
        members.find(l => typeof l.style.parallel?.spacing === 'number')?.style.parallel
          ?.spacing ?? this.config.parallelSpacing;

      const offsets = parallelOffsets(members.length, spacing);
      members.forEach((link, i) => {
        if (link.style.parallel?.enabled === false) return;
        const extra = link.style.parallel?.offset ?? 0;
        this.frameSeparation.set(link.id, offsets[i] + extra);
      });
    }
  }

  /**
   * The unit normal a link's bundle fans along.
   *
   * Derived from the bundle's CANONICAL node order (lower id → higher id), NOT
   * from this link's own source → target. Otherwise the two halves of a
   * bidirectional pair compute opposite normals, their opposite lane offsets
   * cancel, and both links land back on top of each other.
   */
  private bundleNormalFor(link: LinkModel): FanoutPoint {
    const diagram = this.engine.getDiagram();
    const s = link.sourceNodeId ? diagram?.getNode(link.sourceNodeId) : null;
    const t = link.targetNodeId ? diagram?.getNode(link.targetNodeId) : null;
    if (!s || !t) return { x: 0, y: -1 };

    const centre = (n: NodeModel) => {
      const p = n.getWorldPosition();
      return { x: p.x + n.size.width / 2, y: p.y + n.size.height / 2 };
    };

    // Canonical order by node id, so both directions of the pair agree.
    const [a, b] =
      (link.sourceNodeId as string) <= (link.targetNodeId as string)
        ? [centre(s), centre(t)]
        : [centre(t), centre(s)];
    return bundleNormal(a, b);
  }

  // =========================================================================
  // Wave 4 — Card 4: self-loops
  // =========================================================================

  /**
   * Route a self-loop (source node === target node) as a loop away from the node.
   *
   * Never goes near the routing engine: the routers exclude a link's own nodes
   * from their obstacle set, so a "route" from a node back to itself came out as
   * a degenerate stub buried in the node body. The loop is built geometrically
   * instead, as a polyline, which the existing path emitters then draw in the
   * link's own idiom (rounded rectangle for `orthogonal`, a spline for `smooth`,
   * a hard polygon for `direct`).
   */
  private computeSelfLoopRoute(
    link: LinkModel,
    endpoints: NonNullable<ReturnType<SVGRenderer['getLinkEndpoints']>>
  ): RoutedPath | null {
    const diagram = this.engine.getDiagram();
    const node = link.sourceNodeId ? diagram?.getNode(link.sourceNodeId) : null;
    if (!node) return null;

    const config = link.style.selfLoop ?? {};
    const index = this.selfLoopIndex(link);
    const spacing = config.spacing ?? DEFAULT_SELF_LOOP_SPACING;
    // Several loops on one node NEST: each is `spacing` further out than the one
    // before, so every loop keeps a clear body and its own label slot.
    const size = (config.size ?? DEFAULT_SELF_LOOP_SIZE) + index * spacing;
    const width = (config.width ?? config.size ?? DEFAULT_SELF_LOOP_SIZE) + index * spacing;

    const forced = config.side && config.side !== 'auto' ? (config.side as FanoutSide) : undefined;
    const sourceSide = forced ?? (endpoints.sourceDirection as FanoutSide) ?? 'right';
    const targetSide = forced ?? (endpoints.targetDirection as FanoutSide) ?? sourceSide;

    const world = node.getWorldPosition();
    const points = buildSelfLoopPoints({
      rect: { x: world.x, y: world.y, width: node.size.width, height: node.size.height },
      start: endpoints.start,
      end: endpoints.end,
      sourceSide,
      targetSide,
      size,
      width,
    });

    return {
      points,
      totalLength: polylineLength(points),
      bendCount: Math.max(0, points.length - 2),
    };
  }

  /**
   * Which self-loop this is on its node (0 = the first). Stable across frames
   * because it reads the diagram's own link order.
   */
  private selfLoopIndex(link: LinkModel): number {
    const diagram = this.engine.getDiagram();
    if (!diagram || !link.sourceNodeId) return 0;
    const siblings = diagram
      .getLinks()
      .filter(l => l.isSelfLoop() && l.sourceNodeId === link.sourceNodeId);
    const index = siblings.findIndex(l => l.id === link.id);
    return index < 0 ? 0 : index;
  }

  // =========================================================================
  // Wave 4 — Card 7: the diagram-wide edge pass
  // =========================================================================

  /**
   * Feed the whole diagram to the edge optimizer and cache what it decided for
   * this frame.
   *
   * ALL links go in, not just the visible ones: a link scrolled off the left edge
   * still crosses the one you can see, and its label still occupies space. Only
   * VISIBLE links have been re-routed this frame — the rest carry the points they
   * last had, exactly as the old per-link scan read them.
   */
  private runEdgeOptimizer(): void {
    this.frameJumps.clear();
    this.frameLabelOffsets.clear();

    const diagram = this.engine.getDiagram();
    if (!diagram || !this.config.edgeOptimizer) return;

    const links: OptimizerLink[] = [];
    for (const link of diagram.getLinks()) {
      const points = link.points ?? [];
      links.push({
        id: link.id,
        points,
        jumps: this.jumpConfigFor(link, points),
        labels: this.optimizerLabelsFor(link, points),
      });
    }

    const nodes = diagram.getNodes().map(node => {
      const world = node.getWorldPosition();
      return {
        id: node.id,
        rect: { x: world.x, y: world.y, width: node.size.width, height: node.size.height },
      };
    });

    this.edgeOptimizer.update({ nodes, links });

    for (const link of links) {
      if (link.jumps) {
        this.frameJumps.set(link.id, this.edgeOptimizer.getJumps(link.id));
      }
      for (const label of link.labels) {
        this.frameLabelOffsets.set(
          `${link.id}::${label.id}`,
          this.edgeOptimizer.getLabelOffset(link.id, label.id, label.offset)
        );
      }
    }
  }

  /**
   * The jump config for a link, or undefined when it draws no jumps.
   *
   * Same gate the per-link scan applied: enabled, non-zero size, at least two
   * points, and NOT a 2-point curve (a chord-based jump would both misplace the
   * arc and destroy the bezier).
   */
  private jumpConfigFor(
    link: LinkModel,
    points: Array<{ x: number; y: number }>
  ): { mode: 'all' | 'perpendicular' | 'threshold'; threshold: number } | undefined {
    const config = link.style.jumpPoints;
    if (!config?.enabled || (config.size ?? 10) <= 0 || points.length < 2) return undefined;

    const renderType = this.renderPathType(link);
    const isTwoPointCurve =
      (renderType === 'smooth' || renderType === 'bezier') && points.length === 2;
    if (isTwoPointCurve) return undefined;

    return {
      mode: config.detectMode ?? 'all',
      threshold: config.threshold ?? 45,
    };
  }

  /** The link's labels, described for the optimizer (anchor, box, path normal). */
  private optimizerLabelsFor(
    link: LinkModel,
    points: Array<{ x: number; y: number }>
  ): OptimizerLabel[] {
    if (!link.labels?.length || points.length < 2) return [];

    return link.labels.map(label => {
      const position = linkLabelPosition(label);
      const anchor = link.getPointAtPosition(position) ?? points[0];
      const normal = link.getNormalAt(position) ?? { x: 0, y: -1 };
      const box = this.labelRenderer.labelBox(label);
      return {
        id: label.id,
        anchor,
        offset: label.offset ?? { x: 0, y: 0 },
        width: box.width,
        height: box.height,
        // THE latent-bug fix: `autoOffset` has been on the model since Phase 4
        // and was read by nobody. This is the one place it means something.
        autoOffset: label.autoOffset === true,
        normal,
      };
    });
  }

  /**
   * Mark a link dirty when anything OUTSIDE the link changed the way it renders.
   *
   * `renderLink` serves a cached VNode for any link that is not dirty — but a
   * link's drawing depends on its routed points (which change when a NODE moves),
   * on the crossings other links make with it, and on where the optimizer put its
   * labels. None of those mark the link dirty. Comparing a per-frame signature
   * closes that hole; it also fixes the pre-existing version of this bug, where a
   * cached link kept drawing yesterday's jump arcs.
   */
  private markLinksWhoseFrameChanged(links: LinkModel[]): void {
    if (!this.config.enableCaching) return;

    for (const link of links) {
      const parts: string[] = [];
      for (const p of link.points ?? []) {
        parts.push(`${Math.round(p.x * 10)},${Math.round(p.y * 10)}`);
      }
      parts.push('|');
      for (const jump of this.frameJumps.get(link.id) ?? []) {
        parts.push(`${jump.segmentIndex ?? 0}:${Math.round(jump.t1 * 1000)}`);
      }
      parts.push('|');
      for (const label of link.labels ?? []) {
        const offset = this.frameLabelOffsets.get(`${link.id}::${label.id}`);
        if (offset) parts.push(`${label.id}@${Math.round(offset.x)},${Math.round(offset.y)}`);
      }

      const sig = parts.join(';');
      if (this.frameLinkSigs.get(link.id) !== sig) {
        this.frameLinkSigs.set(link.id, sig);
        link.markDirty('frame-geometry');

        // wave8/dirty: THIS is the frame gate's "did anything actually move?"
        // verdict, and this is the only place that can honestly give it.
        //
        // It runs after every writer of link geometry (the local router, the
        // global solver, channel nudging, the edge optimizer's jumps and label
        // placements) and it compares the frame's FINAL picture of a link against
        // the previous frame's final picture. Anywhere earlier and you are
        // comparing against an intermediate value — which is how the first cut of
        // this got it wrong: the local router rewrites a link, the global solver
        // immediately puts its own route back, and a per-write check declared
        // "geometry moved!" on every single frame forever. The gate never
        // re-armed, and an idle canvas never became free.
        //
        // A frame that moves geometry must not arm the gate: the link cull query
        // ran BEFORE this, so the re-indexed geometry only reaches the culler on
        // the NEXT frame, which can therefore legitimately draw something
        // different from the same model and viewport.
        this.frameChangedGeometry = true;
      }
    }
  }

  /**
   * Card 7 — auto-size every opted-in node before culling/rendering. Uses the
   * theme's label font size for measurement so the reserved box matches the text
   * the label engine will actually lay out, and feeds each node its composite
   * panel reserve (Card 5 header band / image / badge row) so the shape grows to
   * fit the WHOLE body, not just the label.
   */
  private autoSizeNodes(diagram: DiagramModel): void {
    const fontSize = this.theme.typography.fontSize.md as number;
    for (const node of diagram.getNodes()) {
      if (!isAutoSized(node)) continue;
      const opts: AutoSizeOptions = {
        fontSize,
        floorWidth: 16,
        floorHeight: 16,
        reserve: this.panelReserve(node),
      };
      autoSizeNode(node, opts);
    }
  }

  /**
   * The extra content space a node's composite panel (Card 5) reserves around
   * its label, so auto-sizing (Card 7) grows the shape to fit the WHOLE body.
   * Returns undefined for a plain (label-only) node.
   */
  private panelReserve(node: NodeModel): AutoSizeOptions['reserve'] {
    return measurePanelReserve(node);
  }

  /**
   * Card 5 — the composite panel overlay for a node (header band, image/icon
   * slots, badges, ERD/UML rows). Built through the framework-agnostic `panel`
   * module and themed from the active theme; text goes out via `textContent`
   * and image hrefs are sanitized (see panel.ts). Empty for a plain node.
   */
  private renderPanelOverlay(node: NodeModel): VNode[] {
    if (!hasPanel(node)) return [];
    const { width, height } = node.size;
    const ctx: PanelRenderContext = {
      nodeId: node.id,
      fontSize: (this.theme.typography.fontSize.sm as number) ?? 12,
      headerFill: this.theme.colors.primary as string,
      headerTextColor: '#ffffff',
      bodyTextColor: this.theme.colors.text.primary as string,
      badgeFill: (this.theme.colors.warning as string) || '#ef4444',
      badgeTextColor: '#ffffff',
    };
    return renderNodePanel(node, width, height, ctx);
  }

  /**
   * Card 4 — the HTML / foreignObject body for a node (sanitized rich content
   * sized to node.size). Empty for a non-HTML node. The FO is keyed by a content
   * hash so a data change replaces the opaque subtree while hover/selection
   * leaves it intact (see html-node.ts).
   */
  private renderHtmlBody(node: NodeModel): VNode[] {
    if (!hasHtmlContent(node)) return [];
    const fo = buildHtmlForeignObject(node, node.size.width, node.size.height);
    return fo ? [fo] : [];
  }

  /**
   * Render nodes layer
   */
  private renderNodesLayer(nodes: NodeModel[], lod: LODLevel): VNode {
    // Wave-5 Card 3 (grouping): honor a model-level z-order instead of relying
    // on the visible-query iteration order. `Array.prototype.sort` is stable, so
    // nodes that share a zIndex (the common case: none set → all 0) keep their
    // incoming order — this is a no-op for diagrams that never set zIndex.
    const ordered = nodes
      .map((node, i) => ({ node, i }))
      .sort((a, b) => {
        const za = (a.node.style?.zIndex ?? 0) - (b.node.style?.zIndex ?? 0);
        return za !== 0 ? za : a.i - b.i;
      })
      .map((entry) => entry.node);

    const children = ordered.map(node => this.renderNode(node, lod));

    // PORTS PAINT ABOVE EVERY NODE BODY. They used to render inside their own
    // node's group, where any later-painted overlapping node covered them — a
    // window's title-bar chrome (a child node, deliberately painted after its
    // parent) sat ON TOP of the parent's top port ("the port on the title is
    // behind it", a live report). A port is an interaction target; nothing may
    // paint over it. Each node's glyphs keep node-local coordinates and ride an
    // overlay group carrying the SAME transform as the node, so placement —
    // including rotation — is identical, only the stacking changes.
    for (const node of ordered) {
      const glyphs = this.renderPorts(node, lod);
      if (glyphs.length === 0) continue;
      children.push({
        type: 'g',
        key: `node-ports-${node.id}`,
        props: {
          transform: this.nodeTransform(node),
          className: 'node-ports-overlay',
          'data-ports-for': node.id,
        },
        children: glyphs,
      });
    }

    return {
      type: 'g',
      key: 'nodes-layer',
      props: {
        className: 'nodes-layer',
      },
      children,
    };
  }

  /**
   * Phase 2: Render connection preview layer
   */
  private renderConnectionPreviewLayer(): VNode {
    const connectionStateManager = this.engine.getConnectionStateManager();
    const dragState = connectionStateManager.getState();

    const children: VNode[] = [];

    // Render connection preview if active
    if (dragState.isConnecting && dragState.sourcePort && dragState.currentMousePosition) {
      const previewLine = this.renderConnectionPreview(dragState);
      if (previewLine) {
        children.push(previewLine);
      }

      // Render target port highlight if hovering over valid target
      if (dragState.targetPort && dragState.isOverValidTarget) {
        // The target port will already be highlighted by the port renderer
        // No additional rendering needed here
      }
    } else {
      // Wave 2 (Edges & links): endpoint-reconnection ghost preview.
      // Guarded by `!isConnecting` so this and the new-link preview above are
      // mutually exclusive — the two state sources never double-render.
      const reconnect = this.engine.getReconnectionPreview();
      if (reconnect) {
        const ghost = this.renderReconnectionPreview(reconnect);
        if (ghost) {
          children.push(ghost);
        }
      }

      // wave12/connect-ergonomics: the proximity-connect PROPOSAL, drawn as a
      // live dashed wire between the two ports a drop would link. Highlighting
      // only the port glyphs left the proposal nearly invisible mid-drag (live
      // report: "the wire isn't showing"). A node drag never coexists with a
      // connection drag, so this shares the !isConnecting branch.
      const proximity = this.engine.getProximityPreview?.();
      if (proximity) {
        const wire = this.renderProximityPreview(proximity);
        if (wire) {
          children.push(wire);
        }
      }
    }

    return {
      type: 'g',
      key: 'connection-preview-layer',
      props: {
        className: 'connection-preview-layer',
        pointerEvents: 'none', // Don't block mouse events
      },
      children,
    };
  }

  /**
   * Phase 2: Render connection preview line
   */
  private renderConnectionPreview(dragState: any): VNode | null {
    if (!dragState.sourcePort || !dragState.currentMousePosition) {
      return null;
    }

    const config = this.engine.getInteractionConfig();
    if (!config.showConnectionPreview) {
      return null;
    }

    // Get source port world position
    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    // Find source node
    let sourceNode: NodeModel | undefined;
    for (const node of diagram.getNodes()) {
      if (node.getPort(dragState.sourcePort.id)) {
        sourceNode = node;
        break;
      }
    }

    if (!sourceNode) return null;

    // CRITICAL FIX: Use getPortPositionForShape() for consistent positioning
    // This ensures the preview line starts from the same position where the port is rendered
    const sourceLocalPos = getPortPositionForShape(dragState.sourcePort, sourceNode);
    // CRITICAL FIX: Use getWorldPosition() for child nodes to get correct absolute coordinates
    const sourceWorldPos = sourceNode.getWorldPosition();
    const sourcePos = {
      x: sourceWorldPos.x + sourceLocalPos.x,
      y: sourceWorldPos.y + sourceLocalPos.y,
    };

    const targetPos = dragState.currentMousePosition;

    // CRITICAL FIX: Determine pathType for preview from most recent link or default
    // This ensures preview matches the actual routing algorithm that will be used
    let pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth'; // Default
    const links = diagram.getLinks();
    if (links.length > 0) {
      // Use pathType from the most recent link
      pathType = links[links.length - 1].pathType;
    }

    // Get source port direction for orthogonal routing
    const sourceDirection = dragState.sourcePort.alignment.side;

    // Get target port direction if hovering over a valid target port
    let targetDirection: 'left' | 'right' | 'top' | 'bottom' | undefined;
    if (dragState.targetPort) {
      targetDirection = dragState.targetPort.alignment.side;
    }

    // Use RoutingEngine to calculate preview path (same as link rendering)
    const routingEngine = this.engine.getRoutingEngine();

    // ARCHITECTURE: Use pathType to determine routing algorithm for preview
    const algorithm = this.mapPathTypeToAlgorithm(pathType);

    // OBSTACLE AVOIDANCE: Get obstacles from the diagram for preview routing
    const obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

    // Include ALL nodes as obstacles for preview
    // The routing algorithm uses gap offset to ensure paths start/end outside node boundaries
    // CRITICAL FIX: Use getWorldPosition() for child nodes to get correct absolute coordinates
    diagram.getNodes().forEach(node => {
      const worldPos = node.getWorldPosition();
      obstacles.push({
        id: node.id,
        x: worldPos.x,
        y: worldPos.y,
        width: node.size.width,
        height: node.size.height,
      });
    });

    // Use link's pathType-derived algorithm, fallback to routing engine's default
    const defaultAlgorithm = routingEngine.getDefaultAlgorithm();
    const finalAlgorithm = algorithm || defaultAlgorithm;
    const shouldAvoidObstacles = obstacles.length > 0 && finalAlgorithm !== 'straight';

    const routedPath = routingEngine.route({
      start: sourcePos,
      end: targetPos,
      sourceDirection,
      targetDirection,
      obstacles, // Pass obstacles for avoidance
      options: {
        algorithm: finalAlgorithm,
        avoidObstacles: shouldAvoidObstacles,
        obstacleMargin: 20,   // Add 20px margin around obstacles (matches final link routing)
        gridSize: 10,         // Grid size for A* pathfinding
      }
    });

    // Generate SVG path data
    let pathData: string;
    if (routedPath) {
      // ✅ CRITICAL FIX: Pass source/target directions for correct bezier curve calculation
      // Without these, the bezier control points won't extend in the proper direction
      pathData = this.convertRoutedPathToSVG(routedPath, pathType, sourceDirection, targetDirection);
    } else {
      // Phase 0.1: Fallback strategy for connection preview
      console.warn('Primary routing failed for connection preview, trying fallback');

      // Fallback Strategy 1: Try with reduced constraints
      const fallbackPath = routingEngine.route({
        start: sourcePos,
        end: targetPos,
        sourceDirection,
        targetDirection,
        obstacles,
        options: {
          algorithm: 'orthogonal',  // Force orthogonal as safest fallback
          avoidObstacles: true,
          obstacleMargin: 5,         // Reduced from 20px
          gridSize: 20,              // Coarser grid
          maxIterations: 1000        // Faster computation
        }
      });

      if (fallbackPath) {
        // ✅ CRITICAL FIX: Also pass directions for fallback path
        pathData = this.convertRoutedPathToSVG(fallbackPath, pathType, sourceDirection, targetDirection);
        console.log('✅ Fallback routing succeeded for connection preview');
      } else {
        // Fallback Strategy 2: Hide invalid preview (don't show crossing line)
        console.warn('All routing strategies failed for connection preview - hiding invalid preview');
        return null;
      }
    }

    // Determine line color based on validity
    const isValid = dragState.isOverValidTarget;
    const strokeColor = isValid
      ? this.theme.colors.success
      : this.theme.colors.link.default;

    return {
      type: 'path',
      key: 'connection-preview',
      props: {
        d: pathData,
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: '5,5',
        fill: 'none',
        opacity: 0.7,
        className: 'connection-preview-line',
        style: config.animateConnectionPreview
          ? { animation: 'dash 0.5s linear infinite' }
          : undefined,
      },
    };
  }

  /**
   * Wave 2 (Edges & links): render the endpoint-reconnection ghost link.
   *
   * Draws a dashed preview from the STATIONARY endpoint of the link (the one
   * not being dragged) to the cursor, using the same RoutingEngine the real
   * connection preview uses so the ghost matches the link's routing algorithm.
   * Colour reflects drop validity (success vs default link colour).
   */
  /**
   * wave15/helper-lines: the live snap guides a node drag publishes
   * (engine.getSnapGuides) as dashed overlay lines; spacing segments carry
   * their gap label at the midpoint. Null (no layer at all) when idle, so a
   * diagram that never snaps pays nothing.
   */
  private renderSnapGuidesLayer(): VNode | null {
    const guides = this.engine.getSnapGuides?.();
    if (!guides || guides.length === 0) return null;

    const accent = this.theme.colors.link.highlighted ?? this.theme.colors.link.default;
    const children: VNode[] = guides.map((g, i) => ({
      type: 'line',
      key: `snap-guide-${i}`,
      props: {
        x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2,
        stroke: accent,
        strokeWidth: 1,
        strokeDasharray: g.kind === 'alignment' ? '5 4' : '2 3',
        opacity: 0.9,
        pointerEvents: 'none',
        className: `snap-guide-line snap-guide-${g.kind}`,
      },
    }));
    for (const [i, g] of guides.entries()) {
      if (!g.label) continue;
      children.push({
        type: 'text',
        key: `snap-guide-label-${i}`,
        props: {
          x: (g.x1 + g.x2) / 2,
          y: (g.y1 + g.y2) / 2 - 4,
          fill: accent,
          fontSize: 10,
          textAnchor: 'middle',
          pointerEvents: 'none',
          className: 'snap-guide-label',
          textContent: g.label,
        },
      });
    }

    return {
      type: 'g',
      key: 'snap-guides-layer',
      props: { className: 'snap-guides-layer', pointerEvents: 'none' },
      children,
    };
  }

  /**
   * The proximity-connect proposal wire: a dashed line between the two port
   * anchors a drop would link. Port anchors resolve through the SAME helpers
   * the port glyphs render with (getPortPositionForShape + getWorldPosition),
   * so the wire lands exactly on the highlighted glyphs.
   */
  private renderProximityPreview(preview: ProximityPreview): VNode | null {
    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    const anchor = (nodeId: string, portId: string): { x: number; y: number } | null => {
      const node = diagram.getNode(nodeId);
      const port = node?.getPort(portId);
      if (!node || !port) return null;
      const local = getPortPositionForShape(port, node);
      const world = node.getWorldPosition();
      return { x: world.x + local.x, y: world.y + local.y };
    };

    const from = anchor(preview.sourceNodeId, preview.sourcePortId);
    const to = anchor(preview.targetNodeId, preview.targetPortId);
    if (!from || !to) return null;

    return {
      type: 'path',
      key: 'proximity-preview',
      props: {
        d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
        fill: 'none',
        stroke: this.theme.colors.link.highlighted ?? this.theme.colors.link.default,
        strokeWidth: 2,
        strokeDasharray: '6 4',
        opacity: 0.85,
        pointerEvents: 'none',
        className: 'proximity-preview-line',
      },
    };
  }

  private renderReconnectionPreview(preview: ReconnectionPreview): VNode | null {
    const config = this.engine.getInteractionConfig();
    if (!config.showConnectionPreview) {
      return null;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    const link = diagram.getLinks().find(l => l.id === preview.linkId);
    if (!link || !link.points || link.points.length < 2) return null;

    // Dragging the source endpoint keeps the TARGET end fixed, and vice versa.
    const fixedEnd = preview.endpoint === 'source'
      ? link.points[link.points.length - 1]
      : link.points[0];
    const start = { x: fixedEnd.x, y: fixedEnd.y };
    const end = preview.mousePoint;

    const pathType = this.renderPathType(link);
    const routingEngine = this.engine.getRoutingEngine();
    const algorithm = this.routerForLink(link) || routingEngine.getDefaultAlgorithm();

    // Best-effort routing direction from the fixed port.
    const fixedPortId = preview.endpoint === 'source' ? link.targetPortId : link.sourcePortId;
    const fixedPort = diagram.getPortById(fixedPortId);
    const startDirection = fixedPort?.alignment?.side;

    const routed = routingEngine.route({
      start,
      end,
      sourceDirection: startDirection,
      obstacles: [],
      options: { algorithm, avoidObstacles: false, gridSize: 10 },
    });

    const pathData = routed
      ? this.convertRoutedPathToSVG(routed, pathType, startDirection, undefined)
      : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

    const strokeColor = preview.isValid
      ? this.theme.colors.success
      : this.theme.colors.link.default;

    return {
      type: 'path',
      key: 'reconnection-preview',
      props: {
        d: pathData,
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: '5,5',
        fill: 'none',
        opacity: 0.7,
        className: 'reconnection-preview-line',
        style: config.animateConnectionPreview
          ? { animation: 'dash 0.5s linear infinite' }
          : undefined,
      },
    };
  }

  /**
   * Phase 2: Generate connection preview path
   * Supports straight, bezier, step (orthogonal) routing
   */
  private generateConnectionPreviewPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    style: string
  ): string {
    if (style === 'straight') {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    if (style === 'step' || style === 'orthogonal') {
      // Simple orthogonal routing for preview: horizontal then vertical, or vertical then horizontal
      // Choose the path with fewer total turns based on alignment
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);

      // If mostly horizontal, route horizontally first
      if (dx > dy) {
        const midX = from.x + (to.x - from.x) / 2;
        return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
      } else {
        // Route vertically first
        const midY = from.y + (to.y - from.y) / 2;
        return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
      }
    }

    // Bezier curve (default)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control points for smooth bezier curve
    const curvature = Math.min(distance / 2, 100);
    const control1 = { x: from.x + curvature, y: from.y };
    const control2 = { x: to.x - curvature, y: to.y };

    return `M ${from.x} ${from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${to.x} ${to.y}`;
  }

  /**
   * Render single node
   */
  /**
   * wave2/rendering: single LOD feature gate. Reads the active diagram's
   * declarative LODConfig (`diagram.shouldRender`) instead of hardcoding
   * `lod === 'high'` / `lod !== 'low'` here, so custom tiers Just Work.
   * Returns false when there is no diagram (nothing to render anyway).
   */
  private lodAllows(feature: LODFeature, lod: LODLevel): boolean {
    // wave8/culling: MEMOISED PER FRAME. `shouldRender` linearly scans the tier
    // list and allocates a closure on every call, and this gate is asked ~12
    // times per entity per frame (shadows, panel, label, html body, lock, ports,
    // handles, decorations, and now routing/link-detail/gradients). On a 5k scene
    // that is tens of thousands of array scans to answer at most ten distinct
    // questions — the tier does not change during a frame.
    //
    // The cache is cleared at the top of render() (so a setLODConfig() between
    // frames is picked up) and whenever the tier itself changes.
    if (this.lodCacheTier !== lod) {
      this.lodCacheTier = lod;
      this.lodCache.clear();
    }

    const cached = this.lodCache.get(feature);
    if (cached !== undefined) return cached;

    const allowed = this.engine.getDiagram()?.shouldRender(feature, lod) ?? false;
    this.lodCache.set(feature, allowed);
    return allowed;
  }

  /**
   * The node group's transform.
   *
   * wave4/interaction BUGFIX: `node.rotation` was DEAD in the renderer. The model
   * had it (`setRotation`, `rotate`, it is serialized, and the hierarchy maths in
   * `NodeModel.getGlobalPosition` factors it in), the canvas even branched on it
   * (`hasTransformsInHierarchy`), but the SVG output only ever emitted
   * `translate(x, y)` — so a rotated node rendered unrotated and the rotate tool
   * would have had nothing to show. Rotation is about the box CENTRE, which is
   * the convention `applyResizeToNode` (selection-tools) inverts when it resizes
   * a rotated node.
   */
  private nodeTransform(node: NodeModel): string {
    // WORLD position, not raw: nodes are flat siblings in the SVG (no nested
    // <g> per parent), so a parent-RELATIVE child's `position` is a local
    // offset — emitting it verbatim painted the drag-handle demo's grip at the
    // page origin while its model sat correctly under the window. The walk is
    // positionMode-aware (wave13); absolute nodes pay one no-op parent check.
    const world = node.getWorldPosition();
    const translate = `translate(${world.x}, ${world.y})`;
    const rotation = node.rotation || 0;
    if (!rotation) return translate;
    return `${translate} rotate(${rotation}, ${node.size.width / 2}, ${node.size.height / 2})`;
  }

  /** Accessible name of a node: its label, else "<type> node". */
  private nodeAccessibleName(node: NodeModel): string {
    const label = node.getLabel();
    if (typeof label === 'string' && label.trim().length > 0) return label;
    return `${node.type} node`;
  }

  // ==========================================================================
  // wave6/a11y — the SEMANTIC layer (cards 0 + 1)
  //
  // Emitted into the VNODE TREE, not bolted onto the DOM afterwards, so the
  // semantics survive SSR (`renderToStaticSVG`) and headless export untouched.
  // A server-rendered SVG reads to a screen reader exactly like the live canvas.
  // ==========================================================================

  /**
   * The ARIA props for a node group.
   *
   * FIXED HERE (a real, shipped WCAG 4.1.2 / axe `aria-allowed-attr` violation):
   * every node used to emit `role="group" aria-selected="…"`. `aria-selected` is
   * only valid on gridcell/option/row/tab/columnheader/rowheader/treeitem — NOT
   * on `group`. So every node in every diagram carried an invalid ARIA attribute,
   * and axe flags it on sight. The node is a graphic, so it takes the W3C Graphics
   * role; selection now rides in the accessible NAME (which is what a screen
   * reader actually reads out) and in `data-selected` for tooling. The place
   * `aria-selected` is genuinely valid — `role="treeitem"` — is the outline
   * mirror, and that is exactly where the outline view puts it.
   */
  private nodeAriaProps(node: NodeModel): Record<string, unknown> {
    const isSelected = node.isSelected();
    const name = this.nodeAccessibleName(node);
    // Selection/error/highlight ride in the NAME. Keeping the name short and
    // putting the heavy position context (degree, "node 3 of 12") in the live
    // region + outline is deliberate: an over-stuffed aria-label makes every
    // single focus step verbose, which AT users universally hate.
    const stateBits: string[] = [];
    if (isSelected) stateBits.push('selected');
    if (node.state?.highlighted) stateBits.push('highlighted');
    if (node.state?.error) stateBits.push('error');
    if (node.state?.locked) stateBits.push('locked');

    return {
      role: NODE_ROLE,
      // The SHAPE, in human words — "Decision", not "graphics-symbol".
      'aria-roledescription': nodeRoleDescription(node),
      'aria-label': stateBits.length ? `${name}, ${stateBits.join(', ')}` : name,
      'data-node-id': node.id,
      'data-selected': isSelected ? 'true' : 'false',
      ...this.rovingTabIndexProps('node', node.id),
    };
  }

  /**
   * The ARIA props for a link group.
   *
   * THE headline gap of this wave: before it, `renderLink` emitted NO ARIA at
   * all. Every edge in every diagram was invisible to a screen reader, so the
   * graph read as a bag of disconnected shapes — the one thing a diagram exists
   * to communicate (what connects to what) was the one thing AT users could not
   * get.
   */
  private linkAriaProps(link: LinkModel): Record<string, unknown> {
    const diagram = this.engine?.getDiagram?.();
    return {
      role: EDGE_ROLE,
      'aria-roledescription': edgeRoleDescription(link),
      'aria-label': diagram
        ? edgeAccessibleName(link, diagram as never)
        : `Edge ${link.id}`,
      'data-link-id': link.id,
      'data-selected': link.state === 'selected' ? 'true' : 'false',
      ...this.rovingTabIndexProps('link', link.id),
    };
  }

  /**
   * ROVING TABINDEX (card 1). The canvas is ONE tab stop; arrow keys — not Tab —
   * move within it. So exactly one element in the whole diagram carries
   * `tabindex=0` at any moment (the focused one), and every other focusable
   * element carries `-1`. Tab therefore enters the diagram once and leaves it
   * once, which is what a composite widget is supposed to do; without this, a
   * 200-node diagram is a 200-stop tab trap.
   */
  private rovingTabIndexProps(type: 'node' | 'link', id: string): Record<string, unknown> {
    const focused = this.a11yFocus;
    const isFocused = !!focused && focused.type === type && focused.id === id;
    return {
      tabindex: isFocused ? '0' : '-1',
      // `:focus-visible` styling hangs off this; see the shared stylesheet.
      ...(isFocused ? { 'data-focused': 'true' } : {}),
    };
  }

  /**
   * Tell the renderer which entity the keyboard controller has focused, so the
   * next frame emits `tabindex=0` on it (and `-1` on everything else).
   *
   * Marks only the OLD and NEW focus targets dirty — moving focus must not
   * invalidate the whole diagram.
   */
  setAccessibleFocus(target: { type: 'node' | 'link' | 'comment'; id: string } | null): void {
    const previous = this.a11yFocus;
    if (
      previous?.type === target?.type &&
      previous?.id === target?.id
    ) {
      return;
    }

    this.a11yFocus = target ? { ...target } : null;

    const diagram = this.engine?.getDiagram?.();
    if (!diagram) return;

    for (const entry of [previous, this.a11yFocus]) {
      if (!entry) continue;
      // wave9/comments: a comment pin is not an ENTITY — there is nothing to mark dirty
      // and nothing in the VNode cache. It does not need to be: `frameSignature()` already
      // includes the focus target, so moving focus onto or off a pin changes the signature
      // and the gate opens on its own.
      if (entry.type === 'comment') continue;
      if (entry.type === 'node') diagram.getNode(entry.id)?.markDirty?.();
      else diagram.getLink(entry.id)?.markDirty?.();
      // The VNode cache is keyed per entity — evict just those two.
      this.vnodeCache.delete(`${entry.type}-${entry.id}`);
      for (const lod of ['high', 'medium', 'low'] as const) {
        this.vnodeCache.delete(`${entry.type}-${entry.id}-${lod}`);
      }
    }
  }

  getAccessibleFocus(): { type: 'node' | 'link' | 'comment'; id: string } | null {
    return this.a11yFocus ? { ...this.a11yFocus } : null;
  }

  /**
   * wave9/comments (Card 6): attach (or detach) the source of comment pins.
   *
   * Installing a source CHANGES THE PICTURE while moving nothing the frame gate watches —
   * not the model epoch, not the viewport. Without the explicit invalidation the gate would
   * keep serving back the last frame, which has no pins in it, forever. This is the trap
   * this wave was warned about, and it is one line.
   */
  setCommentSource(source: CommentSource | null): void {
    if (this.commentSource === source) return;
    this.commentSource = source;
    this.invalidateFrame();
  }

  getCommentSource(): CommentSource | null {
    return this.commentSource;
  }

  /**
   * The comment pin layer for this frame, or null when nothing is attached.
   *
   * Culled against the same world rect the nodes are, so a diagram with 4,000 comments
   * costs what the ones ON SCREEN cost. Drawn in WORLD coordinates inside the viewBox, so
   * pan and zoom carry the pins with the diagram without a line of code.
   */
  private renderCommentsLayer(visibleRect: Rectangle, zoom: number): VNode | null {
    if (!this.commentSource) return null;
    const focus = this.a11yFocus;
    return renderCommentPins(this.commentSource.getThreads(), {
      ...this.commentSource.getPinOptions(),
      visibleRect,
      zoom,
      // The ROVING TABINDEX, from the one authority that owns it.
      focusedThreadId: focus?.type === 'comment' ? focus.id : null,
    });
  }

  /**
   * wave12/group-visuals — the group FRAMES.
   *
   * One frame per group: a rounded `<rect>` at the group's outer bounds, a label
   * band carrying its `name`, and — when collapsed — a visibly distinct treatment
   * (dashed, opaque, marked `data-collapsed`). Returns null when the diagram has
   * no groups, so a group-free canvas pays a single array read and the children[]
   * positional contract is untouched (see the children assembly in `render`).
   *
   * PURE / READ-ONLY. It only reads group geometry (`getOuterBounds`) — it never
   * mutates the model, so it cannot dirty an idle frame and disarm the frame gate.
   *
   * PAINT ORDER. Groups are sorted parent-behind-child (nesting depth first, then
   * `zIndex`, then insertion order) so a nested sub-group draws ON TOP of the
   * parent that contains it — otherwise the parent's fill would bury the child.
   *
   * CULLING. A linear intersect against the visible rect, matching how strokes are
   * culled: groups number in the tens, so a spatial index would be theatre.
   */
  private renderGroupsLayer(
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    visibleRect: Rectangle
  ): VNode | null {
    const groups = diagram.getGroups?.() ?? [];
    if (groups.length === 0) return null;

    // Nesting depth (ancestor count), cycle-guarded exactly like the router's
    // collapse walk — a corrupt parent chain must never spin.
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    const depthOf = (g: GroupModel): number => {
      let depth = 0;
      const seen = new Set<string>();
      let cur: GroupModel | undefined = g;
      while (cur?.parentGroupId && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.parentGroupId);
        depth++;
      }
      return depth;
    };

    const ordered = groups
      .map((g, i) => ({ g, i, depth: depthOf(g) }))
      .sort((a, b) => a.depth - b.depth || a.g.zIndex - b.g.zIndex || a.i - b.i);

    const frames: VNode[] = [];
    for (const { g } of ordered) {
      const bounds = g.getOuterBounds();
      // A group with no geometry yet (never framed, no members) has nothing to
      // draw — skip it rather than emit a zero-size rect.
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      // Cull: skip a frame that cannot touch the visible rect.
      if (
        bounds.x + bounds.width < visibleRect.x ||
        bounds.y + bounds.height < visibleRect.y ||
        bounds.x > visibleRect.x + visibleRect.width ||
        bounds.y > visibleRect.y + visibleRect.height
      ) {
        continue;
      }
      frames.push(
        this.renderGroupFrame(g, bounds, g.parentGroupId ? byId.get(g.parentGroupId) : undefined)
      );
    }

    return {
      type: 'g',
      key: 'groups-layer',
      props: {
        className: 'groups-layer',
        // A frame is a passive backdrop: it must never intercept a pointer meant
        // for a node or link painted on top of it.
        pointerEvents: 'none',
      },
      children: frames,
    };
  }

  /** One group's frame + label band, themed and accessible. */
  private renderGroupFrame(group: GroupModel, bounds: Rectangle, parent?: GroupModel): VNode {
    const c = this.theme.colors;
    const collapsed = group.isCollapsed;

    // A LANE is an internal band of its pool, not an independent framed group.
    // Giving each lane its own full 1.5px rounded outline stacked TWO strokes on
    // every seam (lane↔lane, lane↔pool edge — the pool's right border ran under
    // three coincident strokes) and the rx-rounded corners left lens-shaped
    // notches where bands are supposed to tile (live report: "borders coming on
    // top of each other, some borders thicker than others"). Lanes now draw NO
    // outline of their own — the pool owns the border — and tile with square
    // corners; a single 1px separator marks each lane boundary exactly once
    // (leading edge of every lane after the first).
    const laneRole = !collapsed && group.laneConfig?.role === 'lane' && parent ? group.laneConfig : null;
    const radius = laneRole ? 0 : this.theme.effects.borderRadius.md;

    // Label band height: honour an authored header, else a readable default.
    const bandHeight = Math.min(
      group.headerHeight > 0 ? group.headerHeight : 24,
      bounds.height
    );
    const fontSize = this.theme.typography.fontSize.sm;

    // THEME TOKENS, not hard-coded colours: the frame borrows the node border and
    // canvas surface so it re-themes with everything else on a setTheme() swap.
    const stroke = c.node.default.stroke;
    const surface = c.background.surface;

    const frameRect: VNode = {
      type: 'rect',
      key: `group-frame-rect-${group.id}`,
      props: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rx: radius,
        ry: radius,
        fill: surface,
        // Collapsed reads as denser and dashed; expanded is a faint wash.
        fillOpacity: collapsed ? 0.85 : 0.32,
        stroke: laneRole ? 'none' : stroke,
        strokeWidth: collapsed ? 2 : 1.5,
        strokeDasharray: collapsed ? '6,4' : undefined,
        className: 'group-frame-rect',
        // Decorative: the name lives on the container's aria-label below.
        'aria-hidden': 'true',
      },
    };

    // The lane's single boundary line — on its leading edge (top for horizontal
    // pools, left for vertical), skipped for the first lane whose leading edge
    // IS the pool's own border.
    let laneSeparator: VNode | null = null;
    if (laneRole && parent) {
      const pb = parent.getOuterBounds();
      const horizontal = laneRole.orientation !== 'vertical';
      const leading = horizontal ? bounds.y > pb.y + 1 : bounds.x > pb.x + 1;
      if (leading) {
        laneSeparator = {
          type: 'line',
          key: `group-frame-separator-${group.id}`,
          props: {
            x1: bounds.x,
            y1: bounds.y,
            x2: horizontal ? bounds.x + bounds.width : bounds.x,
            y2: horizontal ? bounds.y : bounds.y + bounds.height,
            stroke,
            strokeWidth: 1,
            className: 'group-frame-separator',
            'aria-hidden': 'true',
          },
        };
      }
    }

    // A horizontal POOL (BPMN) reserves a strip at its LEFT (laneConfig
    // headerSize), not a band on top — the screenshot audit caught "Delivery"
    // clipped to "Deliv" because the horizontal label was crammed into that
    // strip. Standard BPMN typography: rotate the pool title −90° and centre it
    // in the strip. Vertical pools and plain groups keep the top band.
    const lc = group.laneConfig;
    const sideStrip =
      !collapsed && lc?.role === 'pool' && lc.orientation === 'horizontal'
        ? Math.min(lc.headerSize ?? 0, bounds.width)
        : 0;

    // A pool's title strip needs its OWN divider against the lane area. It used
    // to get one by accident — the lanes' (since removed) left borders ran along
    // that edge — and without it the rotated pool title floats in open space and
    // the strip melts into the first lane (live report: "destroyed more now",
    // caught on the full-page visitor view the seam close-ups missed).
    let poolHeaderDivider: VNode | null = null;
    if (!collapsed && lc?.role === 'pool') {
      const horizontal = lc.orientation === 'horizontal';
      const at = horizontal ? bounds.x + sideStrip : bounds.y + Math.min(lc.headerSize ?? bandHeight, bounds.height);
      poolHeaderDivider = {
        type: 'line',
        key: `group-frame-header-divider-${group.id}`,
        props: {
          x1: horizontal ? at : bounds.x,
          y1: horizontal ? bounds.y : at,
          x2: horizontal ? at : bounds.x + bounds.width,
          y2: horizontal ? bounds.y + bounds.height : at,
          stroke,
          strokeWidth: 1,
          className: 'group-frame-header-divider',
          'aria-hidden': 'true',
        },
      };
    }

    const bandRect: VNode = {
      type: 'rect',
      key: `group-frame-band-${group.id}`,
      props: {
        x: bounds.x,
        y: bounds.y,
        width: sideStrip > 0 ? sideStrip : bounds.width,
        height: sideStrip > 0 ? bounds.height : bandHeight,
        rx: radius,
        ry: radius,
        fill: surface,
        fillOpacity: 0.9,
        stroke: 'none',
        className: 'group-frame-band',
        'aria-hidden': 'true',
      },
    };

    const label: VNode =
      sideStrip > 0
        ? {
            type: 'text',
            key: `group-frame-label-${group.id}`,
            props: {
              x: bounds.x + sideStrip / 2,
              y: bounds.y + bounds.height / 2,
              transform: `rotate(-90, ${bounds.x + sideStrip / 2}, ${bounds.y + bounds.height / 2})`,
              textAnchor: 'middle',
              dominantBaseline: 'central',
              fontSize,
              fontFamily: this.theme.typography.fontFamily.default,
              fontWeight: this.theme.typography.fontWeight.medium,
              fill: c.text.primary,
              className: 'group-frame-label group-frame-label-pool',
              textContent: group.name,
              'aria-hidden': 'true',
            },
          }
        : {
            type: 'text',
            key: `group-frame-label-${group.id}`,
            props: {
              x: bounds.x + 8,
              y: bounds.y + bandHeight / 2,
              dominantBaseline: 'central',
              fontSize,
              fontFamily: this.theme.typography.fontFamily.default,
              fontWeight: this.theme.typography.fontWeight.medium,
              fill: c.text.primary,
              className: 'group-frame-label',
              textContent: group.name,
              // The visible label; the accessible name is on the container, so hide
              // this from AT to avoid announcing the name twice.
              'aria-hidden': 'true',
            },
          };

    return {
      type: 'g',
      key: `group-frame-${group.id}`,
      props: {
        className: collapsed ? 'group-frame group-frame-collapsed' : 'group-frame',
        // A container of graphics symbols — the W3C Graphics ARIA role — named by
        // the group, with a human roledescription (nodes use the same pattern:
        // graphics-symbol + roledescription + label).
        role: 'graphics-object',
        'aria-roledescription': collapsed ? 'Collapsed group' : 'Group',
        'aria-label': group.name,
        'data-group-id': group.id,
        'data-collapsed': collapsed ? 'true' : 'false',
      },
      children: [
        frameRect,
        ...(laneSeparator ? [laneSeparator] : []),
        bandRect,
        ...(poolHeaderDivider ? [poolHeaderDivider] : []),
        label,
      ],
    };
  }

  /** The canvas's own semantics. */
  private rootAriaProps(): Record<string, unknown> {
    const diagram = this.engine?.getDiagram?.();
    return {
      role: DIAGRAM_ROLE,
      'aria-roledescription': diagramRoleDescription(this.config.diagramType),
      'aria-label': diagram
        ? diagramAccessibleName(diagram as never, this.config.diagramLabel)
        : 'Diagram',
      // The single tab stop — surrendered to whichever child is focused.
      tabindex: this.a11yFocus ? '-1' : '0',
    };
  }

  /**
   * NON-COLOUR STATUS ENCODING — WCAG 1.4.1 (Use of Colour).
   *
   * The audit question, answered honestly: our states WERE largely colour-only.
   *   - `selected`    already had a dashed outline → a genuine shape cue. Fine.
   *   - `highlighted` was a fill/stroke SWAP and nothing else. Colour-only.
   *   - `error`       was a fill/stroke SWAP and nothing else. Colour-only.
   *
   * A user with deuteranopia, or anyone on a monochrome display, could not tell
   * an errored node from a highlighted one from a normal one. This is the exact
   * failure most diagram engines quietly ship.
   *
   * So both now carry a REDUNDANT, non-colour cue:
   *   - error       → a corner badge with a "!" glyph, plus a dense dashed ring;
   *   - highlighted → a distinct dashed emphasis ring (a different dash rhythm
   *                   from selection's, so the two never read as the same thing).
   *
   * The badges are `aria-hidden` — the state is already in the accessible name,
   * and announcing it twice is its own accessibility bug.
   */
  private renderStateAffordances(node: NodeModel): VNode[] {
    const affordances: VNode[] = [];
    const { width } = node.size;

    if (node.state?.highlighted) {
      affordances.push({
        type: 'rect',
        key: `state-highlight-${node.id}`,
        props: {
          x: -5,
          y: -5,
          width: node.size.width + 10,
          height: node.size.height + 10,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          // Deliberately NOT selection's '5,5' — two states must not share a cue.
          strokeDasharray: '2,3',
          rx: 4,
          ry: 4,
          className: 'node-state-highlighted-ring',
          'aria-hidden': 'true',
          // `vector-effect` keeps the ring 2px at ANY zoom — a focus/state cue
          // that thins to invisibility when you zoom out is not a cue.
          'vector-effect': 'non-scaling-stroke',
        },
        children: [],
      });
    }

    if (node.state?.error) {
      affordances.push({
        type: 'rect',
        key: `state-error-ring-${node.id}`,
        props: {
          x: -4,
          y: -4,
          width: node.size.width + 8,
          height: node.size.height + 8,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeDasharray: '1,2',
          rx: 4,
          ry: 4,
          className: 'node-state-error-ring',
          'aria-hidden': 'true',
          'vector-effect': 'non-scaling-stroke',
        },
        children: [],
      });

      // The glyph. A shape, not a colour — legible in greyscale and in Windows
      // forced-colors mode, where our palette is thrown away entirely.
      affordances.push({
        type: 'g',
        key: `state-error-badge-${node.id}`,
        props: {
          transform: `translate(${width - 6}, -6)`,
          className: 'node-state-error-badge',
          'aria-hidden': 'true',
        },
        children: [
          {
            type: 'circle',
            props: {
              r: 8,
              fill: this.theme.colors.error ?? '#ef4444',
              stroke: this.theme.colors.background?.surface ?? '#ffffff',
              strokeWidth: 1.5,
            },
            children: [],
          },
          {
            type: 'text',
            props: {
              x: 0,
              y: 0,
              textAnchor: 'middle',
              dominantBaseline: 'central',
              fontSize: 11,
              fontWeight: 700,
              fill: '#ffffff',
              textContent: '!',
              // Pointer events off: the badge is decoration, and must never
              // steal a click meant for the node.
              style: { pointerEvents: 'none' },
            },
            children: [],
          },
        ],
      });
    }

    return affordances;
  }

  /**
   * The same 1.4.1 fix for LINKS, which were worse: a selected link and a
   * highlighted link differed from a default one by stroke COLOUR and nothing
   * else — no dash, no width, no shape. On a greyscale display all three edges
   * are identical.
   *
   * The cue is a "casing" — a wider, semi-transparent halo drawn UNDER the real
   * path. It reads as a shape change (the edge visibly thickens) at any colour
   * perception, and because it is an additive sibling it does not perturb the
   * path geometry that the routing/label/toolbar code all depend on.
   */
  private renderLinkStateAffordances(link: LinkModel, pathData: string): VNode[] {
    const state = link.state;
    if (state !== 'selected' && state !== 'highlighted') return [];
    if (!pathData) return [];

    return [
      {
        type: 'path',
        key: `link-state-casing-${link.id}`,
        props: {
          d: pathData,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 8,
          strokeOpacity: 0.28,
          strokeLinecap: 'round',
          // Selected reads as a solid halo; highlighted as a dashed one — so the
          // two states are still distinguishable from each other without colour.
          ...(state === 'highlighted' ? { strokeDasharray: '6,4' } : {}),
          className: `link-state-casing link-state-casing-${state}`,
          'aria-hidden': 'true',
          style: { pointerEvents: 'none' },
        },
        children: [],
      },
    ];
  }

  private renderNode(node: NodeModel, lod: LODLevel): VNode {
    // PHASE 3: Skip HTML layer nodes entirely (React Flow style)
    // These nodes are rendered as HTML divs with handles in the HTML layer
    // NO SVG rendering at all - edges will query handle positions via DOM
    if (node.getMetadata('useHTMLLayer') === true) {
      return {
        type: 'g',
        key: `node-${node.id}-html-layer`,
        props: {},
        children: [],
      };
    }

    // Check if node should use foreignObject rendering
    if (this.shouldUseForeignObject(node)) {
      return this.renderNodeWithForeignObject(node, lod);
    }

    // Check cache if enabled (include LOD in cache key since rendering varies by LOD).
    // Paint-server nodes bypass the cache so their `<defs>` entry is re-registered
    // every frame (a cache hit would skip style computation and orphan url(#…)).
    const cacheKey = `node-${node.id}-${lod}`;
    const usesPaintServer = this.nodeUsesPaintServer(node);
    if (this.config.enableCaching && !node.isDirty && !usesPaintServer) {
      const cached = this.vnodeCache.get(cacheKey);
      if (cached) {
        // Removed overwhelming cache log - use only for debugging if needed
        // console.log(`[SVGRenderer] Using cached node ${node.id} (not dirty)`);
        return cached;
      }
    }

    const diagram = this.engine.getDiagram()!;

    // Compute styles based on mode
    const styles = this.config.useCSSMode
      ? this.computeNodeStylesCSS(node)
      : this.computeNodeStylesProgrammatic(node);

    // Option 2: Enhanced visual effects
    const isHovered = node.state.hovered;
    const isSelected = node.isSelected();

    // Phase 2: Check if node is a valid connection target
    const connectionState = this.engine.getConnectionStateManager().getState();
    const isConnectionTarget =
      connectionState.isConnecting &&
      connectionState.validTargetNodes.has(node.id);

    const vnode: VNode = {
      type: 'g',
      key: `node-${node.id}`,
      props: {
        transform: this.nodeTransform(node),
        className: 'node-group',
        // A hover polish that must NEVER include `transform`: the node's
        // position lives in its transform, and `transition: all` eased it — so a
        // dragged node smoothly TRAILED the cursor (model snapped, paint lagged
        // 200ms). List only the visual props; the position stays immediate.
        style: isHovered ? { transition: 'filter 0.15s ease, opacity 0.15s ease' } : undefined,
        // wave4/interaction (Card 7) named the node; wave6/a11y gives it a valid
        // graphics role, a shape roledescription, and the roving tabindex.
        ...this.nodeAriaProps(node),
      },
      children: [
        // Selection highlight (Phase 3.1: Shape-aware)
        ...(isSelected ? [this.renderSelectionHighlight(node)] : []),
        // wave6/a11y (card 7 / WCAG 1.4.1): status must not be colour-ALONE.
        ...this.renderStateAffordances(node),
        // Phase 2: Connection target highlight (rendered behind the node)
        ...(isConnectionTarget
          ? [
              {
                type: 'rect',
                props: {
                  x: -2,
                  y: -2,
                  width: node.size.width + 4,
                  height: node.size.height + 4,
                  fill: 'none',
                  stroke: this.theme.colors.success,
                  strokeWidth: 2,
                  rx: 5,
                  ry: 5,
                  className: 'connection-target-highlight',
                  opacity: 0.8,
                },
              } as VNode,
            ]
          : []),
        // Drop shadow (Phase 3.1: Shape-aware)
        ...(this.lodAllows('shadows', lod) ? [this.renderShadow(node, isHovered)] : []),
        // Node shape (Phase 3.1: Shape-based rendering)
        this.renderNodeShape(node, styles, isHovered),
        // Card 5: composite panel overlay (header band / image / rows / badges /
        // icon), drawn ON TOP of the base shape so it composes with any silhouette.
        ...(this.lodAllows('decorations', lod) ? this.renderPanelOverlay(node) : []),
        // Label (if LOD allows and label exists) — shape-fit wrap + ellipsis,
        // clipped to the shape's inner rect (see renderNodeLabel).
        ...(diagram.shouldRenderLabels(lod) && node.getLabel()
          ? this.renderNodeLabel(node)
          : []),
        // Card 4: HTML / foreignObject body (sanitized) on top of the shape
        // background, so it rotates + hit-tests + selects like any shape. Skipped
        // at LODs that drop decorations (a far-zoom node is just its silhouette).
        ...(this.lodAllows('decorations', lod) ? this.renderHtmlBody(node) : []),
        // Option 3: Lock/pin indicator for locked nodes
        ...(node.state.locked && this.lodAllows('decorations', lod)
          ? [
              // Pin icon background circle
              {
                type: 'circle',
                props: {
                  cx: node.size.width - 10,
                  cy: 10,
                  r: 8,
                  fill: this.theme.colors.warning || '#f59e0b',
                  opacity: 0.9,
                  className: 'lock-indicator-bg',
                },
              } as VNode,
              // Pin icon (simple pushpin shape using text)
              {
                type: 'text',
                props: {
                  x: node.size.width - 10,
                  y: 10,
                  textContent: '📌',
                  textAnchor: 'middle',
                  dominantBaseline: 'middle',
                  fontSize: 12,
                  pointerEvents: 'none',
                  className: 'lock-indicator',
                },
              } as VNode,
            ]
          : []),
        // Phase 2: Render ports

      ],
    };

    // Cache if enabled (use LOD-specific cache key). Never cache paint-server
    // nodes — see the cache-read note above.
    if (this.config.enableCaching && !usesPaintServer) {
      this.cacheEntityVNode('node', node.id, cacheKey, vnode, node);
    }

    return vnode;
  }

  /**
   * Every VNode-cache key an entity currently occupies — one per LOD tier it
   * has been rendered at since its last change.
   *
   * A SINGLE dirty flag guards a PER-LOD cache: rebuilding one tier's entry
   * and calling markClean() left every OTHER tier's cached entry stale, so a
   * layout that moved geometry resurfaced its PRE-layout picture on the next
   * zoom/fitView LOD flip (live report: "click force then dagre — the diagram
   * is destroyed"; the painted edges were the previous layout's routes).
   * Evicting the entity's whole key set on the dirty rebuild is what makes
   * markClean() safe again — and it tracks keys rather than hard-coding the
   * tier vocabulary, so custom governor tiers stay covered.
   */
  private entityCacheKeys = new Map<string, string[]>();

  private cacheEntityVNode(
    kind: 'node' | 'link',
    id: string,
    cacheKey: string,
    vnode: VNode,
    entity: { isDirty: boolean; markClean(): void }
  ): void {
    const entityKey = `${kind}-${id}`;
    if (entity.isDirty) {
      for (const stale of this.entityCacheKeys.get(entityKey) ?? []) {
        if (stale !== cacheKey) this.vnodeCache.delete(stale);
      }
      this.entityCacheKeys.set(entityKey, []);
    }
    this.vnodeCache.set(cacheKey, vnode);
    const keys = this.entityCacheKeys.get(entityKey) ?? [];
    if (!keys.includes(cacheKey)) keys.push(cacheKey);
    this.entityCacheKeys.set(entityKey, keys);
    entity.markClean();
  }

  /**
   * Check if a node should use foreignObject rendering
   * Nodes can indicate they want foreignObject by setting metadata.useForeignObject = true
   */
  private shouldUseForeignObject(node: NodeModel): boolean {
    return node.getMetadata('useForeignObject') === true;
  }

  /**
   * Render a node using foreignObject for component embedding
   */
  private renderNodeWithForeignObject(node: NodeModel, lod: LODLevel): VNode {
    const diagram = this.engine.getDiagram()!;
    const isSelected = node.isSelected();
    const isHovered = node.state.hovered;

    // Phase 2: Check if node is a valid connection target
    const connectionState = this.engine.getConnectionStateManager().getState();
    const isConnectionTarget =
      connectionState.isConnecting &&
      connectionState.validTargetNodes.has(node.id);

    // Track this node uses foreignObject
    this.foreignObjectNodes.add(node.id);

    // Create foreignObject VNode for component rendering
    const foreignObject = createForeignObject({
      nodeId: node.id,
      x: 0,
      y: 0,
      width: node.size.width,
      height: node.size.height,
      key: `fo-${node.id}`,
    });

    // Store container ID for external access
    const containerId = getContainerId(foreignObject);
    if (containerId) {
      this.containerIds.set(node.id, containerId);
    }

    // Build node group with foreignObject and overlays
    const vnode: VNode = {
      type: 'g',
      key: `node-${node.id}`,
      props: {
        transform: this.nodeTransform(node),
        className: 'node-group node-with-component',
        // See the plain node path: never transition `transform`, or a dragged
        // node trails the cursor by the transition duration.
        style: isHovered ? { transition: 'filter 0.15s ease, opacity 0.15s ease' } : undefined,
        ...this.nodeAriaProps(node),
      },
      children: [
        // Selection highlight (rendered behind foreignObject)
        ...(isSelected
          ? [
              {
                type: 'rect',
                props: {
                  x: -3,
                  y: -3,
                  width: node.size.width + 6,
                  height: node.size.height + 6,
                  fill: 'none',
                  stroke: this.theme.colors.primary,
                  strokeWidth: 3,
                  strokeDasharray: '5,5',
                  rx: 6,
                  ry: 6,
                  className: 'selection-highlight',
                },
              } as VNode,
            ]
          : []),
        // Connection target highlight
        ...(isConnectionTarget
          ? [
              {
                type: 'rect',
                props: {
                  x: -2,
                  y: -2,
                  width: node.size.width + 4,
                  height: node.size.height + 4,
                  fill: 'none',
                  stroke: this.theme.colors.success,
                  strokeWidth: 2,
                  rx: 5,
                  ry: 5,
                  className: 'connection-target-highlight',
                  opacity: 0.8,
                },
              } as VNode,
            ]
          : []),
        // foreignObject for component embedding
        foreignObject,
        // Ports (rendered on top of foreignObject)

      ],
    };

    return vnode;
  }

  /**
   * Get container ID for a node (if it uses foreignObject)
   */
  getContainerId(nodeId: string): string | undefined {
    return this.containerIds.get(nodeId);
  }

  /**
   * Check if a node uses foreignObject rendering
   */
  isUsingForeignObject(nodeId: string): boolean {
    return this.foreignObjectNodes.has(nodeId);
  }

  /**
   * Phase 2: Render ports for a node
   *
   * Wave 6 (Card 1): also resolves LABEL COLLISIONS, which is why the labels
   * cannot be built inside `renderPort` — nudging a crowded label needs to see
   * its neighbours, and a single port can't.
   */
  private renderPorts(node: NodeModel, lod: LODLevel): VNode[] {
    // Chrome sprouts no ports: a drag handle's glyphs would invite exactly the
    // wires the connection rules refuse.
    if (node.behavior?.dragHandler?.isDragHandler === true) return [];
    // Skip port rendering when this LOD tier doesn't render ports
    if (!this.lodAllows('ports', lod)) {
      return [];
    }

    const interactionConfig = this.engine.getInteractionConfig();
    const ports = Array.from(node.getPorts().values());

    const glyphs = ports
      .map(port => this.renderPort(port, node, interactionConfig, lod))
      .filter(Boolean) as VNode[];

    const labels = this.renderPortLabels(ports, node, interactionConfig);

    // Labels AFTER glyphs: a label must never paint over the port you are
    // trying to grab (it is pointer-events:none, but z-order still decides what
    // the eye reads as "on top").
    return labels.length ? [...glyphs, ...labels] : glyphs;
  }

  /**
   * Wave 6 (Card 1): the port labels for one node, with collision-aware nudging.
   *
   * Labels are resolved per SIDE, because that is the axis they actually crowd
   * on: a column of inputs down the left edge whose labels overlap vertically.
   * Ports with no label cost nothing — a node with no labelled ports returns an
   * empty array and emits not a single extra VNode.
   */
  private renderPortLabels(
    ports: PortModel[],
    node: NodeModel,
    config: InteractionConfig
  ): VNode[] {
    const labelled = ports
      .map((port) => ({ port, resolved: resolvePortConfig(port, node) }))
      .filter((entry) => !!entry.resolved.label && this.shouldRenderPort(entry.port, node, config));

    if (labelled.length === 0) return [];

    const fontSize = this.theme.typography.fontSize.sm as number;
    const lineHeight = fontSize * 1.2;

    // Group by side, then nudge within each side.
    const bySide = new Map<string, typeof labelled>();
    for (const entry of labelled) {
      const side = entry.resolved.side;
      const bucket = bySide.get(side);
      if (bucket) bucket.push(entry);
      else bySide.set(side, [entry]);
    }

    const out: VNode[] = [];

    for (const bucket of bySide.values()) {
      const geometries = bucket.map((entry) => {
        const position = getPortPositionForShape(entry.port, node);
        const { hw, hh } = glyphHalfExtents(entry.resolved.shape, config.portDefaultRadius);
        return { entry, position, hw, hh };
      });

      // The unnudged label centres, on the axis this side stacks along.
      const nudgeable = geometries.filter((g) => g.entry.resolved.label!.noNudge !== true);
      const centres = nudgeable.map((g) =>
        portLabelGeometry({
          spec: g.entry.resolved.label!,
          x: g.position.x,
          y: g.position.y,
          hw: g.hw,
          hh: g.hh,
          side: g.entry.resolved.side,
          width: node.size.width,
          height: node.size.height,
          fontSize,
        }).y
      );
      const heights = nudgeable.map(() => lineHeight);
      const nudges = nudgePortLabels(centres, heights);
      const nudgeByPortId = new Map<string, number>();
      nudgeable.forEach((g, i) => nudgeByPortId.set(g.entry.port.id, nudges[i] ?? 0));

      for (const g of geometries) {
        const port = g.entry.port;
        const resolved = g.entry.resolved;
        const label = renderPortLabel({
          spec: resolved.label!,
          x: g.position.x,
          y: g.position.y,
          hw: g.hw,
          hh: g.hh,
          side: resolved.side,
          width: node.size.width,
          height: node.size.height,
          nudge: nudgeByPortId.get(port.id) ?? 0,
          fontSize,
          fontFamily: this.theme.typography.fontFamily.default,
          color: this.config.useCSSMode ? undefined : (this.theme.colors.text.secondary as string),
          className: this.config.useCSSMode ? 'port-label' : undefined,
        });
        out.push({ ...label, key: `port-label-${port.id}` } as VNode);
      }
    }

    return out;
  }

  /**
   * Phase 3: Render single port
   * Updated to support template system port rendering configuration
   * CRITICAL FIX: Added pointer-events and proper z-index to ensure ports are clickable
   */
  private renderPort(
    port: PortModel,
    node: NodeModel,
    config: InteractionConfig,
    lod: LODLevel
  ): VNode | null {
    // Determine if port should be visible based on visibility strategy
    const shouldRender = this.shouldRenderPort(port, node, config);
    if (!shouldRender) {
      return null;
    }

    // CRITICAL FIX: Calculate port position RELATIVE to node's local coordinate system
    // NOT absolute world coordinates, since ports are rendered inside a transformed group
    // The node group already has: transform="translate(node.position.x, node.position.y)"
    const portPos = this.getPortRelativePosition(port, node);

    // Calculate port radius with hover scaling
    const baseRadius = config.portDefaultRadius;
    const radius = port.isHovered
      ? baseRadius * config.portHoverScaleFactor
      : baseRadius;

    // Wave 6: fold the port's GROUP into its own config (Card 3). Everything
    // below reads the resolved view, never the raw port fields.
    const resolved = resolvePortConfig(port, node);

    // Get port color based on type — or, when the port declares a `dataType`,
    // the colour registered for THAT (Card 7: affordance derives from the type).
    const portColor = this.getPortColor(port, resolved.dataType);

    // Determine if port is highlighted (valid target during connection)
    const isHighlighted = port.isHighlighted || port.isValidTarget;

    // Wave 6 (Card 6): the two NEW drag states. `invalid` is an explicitly
    // rejected target (with a reason); `dimmed` is a port the drag can never
    // reach — most often a type mismatch — which is what makes a typed graph
    // legible mid-drag instead of a wall of identical circles.
    const drag = this.portDragState(port);

    const className = this.config.useCSSMode
      ? `port port-${port.type}` +
        (port.isHovered ? ' port-hovered' : '') +
        (isHighlighted ? ' port-highlighted' : '') +
        (drag.invalid ? ' port-invalid' : '') +
        (drag.dimmed ? ' port-dimmed' : '') +
        (resolved.dataType ? ` port-type-${resolved.dataType}` : '')
      : undefined;

    const invalidColor = this.theme.colors.error ?? '#dc2626';

    // Base presentation. Identical to the pre-wave-6 prop set when the port
    // declares no style, no shape and no data type — same keys, same order.
    // A REGISTERED dataType colour is explicit author intent and must win the
    // cascade: the theme stylesheet paints .port-input/.port-output strokes, and
    // any CSS rule beats an SVG presentation attribute — the typed-ports demo
    // asserted stroke="#2563eb" green while every glyph PAINTED direction teal.
    // Inline style outranks the stylesheet; untyped ports stay CSS-themable.
    const typedColor = portTypeColor(resolved.dataType ?? port.dataType);

    const props: Record<string, unknown> = {
      fill: drag.invalid ? invalidColor : isHighlighted ? portColor : this.theme.colors.background.surface,
      stroke: drag.invalid ? invalidColor : portColor,
      strokeWidth: isHighlighted ? 3 : this.theme.ports.strokeWidth,
      className,
      // CRITICAL FIX: Ensure ports capture pointer events and have proper cursor
      // pointer-events: all ensures the port intercepts mouse events even when overlapping the node
      style: {
        transition: 'all 0.2s ease',
        cursor: drag.invalid ? 'not-allowed' : port.isHovered || isHighlighted ? 'pointer' : 'crosshair',
        pointerEvents: 'all',
        // A REGISTERED dataType colour must WIN THE CASCADE: the theme
        // stylesheet paints .port-input/.port-output strokes and any CSS rule
        // beats an SVG presentation attribute — the typed-ports demo asserted
        // stroke="#2563eb" green while every glyph PAINTED direction teal.
        // Inline style outranks the stylesheet; untyped ports stay themable.
        ...(typedColor && !drag.invalid
          ? { stroke: typedColor, ...(isHighlighted ? { fill: typedColor } : {}) }
          : {}),
      },
      opacity: drag.dimmed ? 0.25 : isHighlighted ? 1 : 0.9,
      // CRITICAL FIX: Add data attribute for debugging
      'data-port-id': port.id,
      'data-port-type': port.type,
      'data-port-side': resolved.side,
    };

    // The port's OWN style overrides win last (Card 0). This was dead config:
    // `PortModel.style` round-tripped through serialization and was never read
    // by anything. Group style is already folded in by resolvePortConfig.
    if (resolved.dataType) props['data-port-data-type'] = resolved.dataType;
    if (drag.invalid) props['data-port-invalid'] = drag.reason ?? 'invalid';
    Object.assign(props, resolved.style);

    // Non-circle glyphs (Card 0). An unshaped port still emits the exact
    // `<circle cx cy r …>` it always did.
    const glyph = renderPortGlyph({
      x: portPos.x,
      y: portPos.y,
      shape: resolved.shape,
      radius,
      props,
    });

    return { ...glyph, key: `port-${port.id}` };
  }

  /**
   * Wave 6 (Card 6): this port's role in the CURRENT connection drag.
   *
   * Reads the drag state's `invalidTargetPorts` — the map the connection manager
   * now populates with a REASON per rejected port. Before wave 6 there was no
   * such map, `validTargetPorts` was never filled either, and the renderer had
   * literally no way to tell a legal target from an illegal one.
   */
  private portDragState(port: PortModel): { invalid: boolean; dimmed: boolean; reason?: string } {
    const config = this.engine.getInteractionConfig();
    if (!config.highlightValidTargets) return { invalid: false, dimmed: false };

    const drag = this.engine.getConnectionStateManager().getState();
    if (!drag.isConnecting || !drag.sourcePort) return { invalid: false, dimmed: false };
    if (drag.sourcePort.id === port.id) return { invalid: false, dimmed: false };

    const reason = drag.invalidTargetPorts?.get(port.id);
    if (!reason) return { invalid: false, dimmed: false };

    // The port the pointer is actually ON gets the loud "no"; every other
    // unreachable port just recedes.
    const isHovered = drag.targetPort?.id === port.id;
    return { invalid: isHovered, dimmed: !isHovered, reason };
  }

  /**
   * Get port position relative to node's local coordinate system
   * Used for rendering ports inside node groups that are already transformed
   */
  // Phase 3.2: Shape-aware port positioning
  private getPortRelativePosition(port: PortModel, node: NodeModel): { x: number; y: number } {
    // Use shape-aware positioning utility
    return getPortPositionForShape(port, node);
  }

  /**
   * Phase 3: Determine if port should be rendered based on visibility strategy
   * Updated to support template system configuration
   * CRITICAL FIX: Added comprehensive debugging and proper string comparison
   */
  private shouldRenderPort(
    port: PortModel,
    node: NodeModel,
    config: InteractionConfig
  ): boolean {
    // Wave 6 (Card 0): `PortModel.visible` was DEAD CONFIG — serialized,
    // deserialized, and never once consulted, so `port.visible = false` drew the
    // port anyway. It is a hard OFF switch: a port hidden by the author stays
    // hidden even mid-drag, which is what distinguishes it from the `never`
    // visibility MODE (that one still surfaces the port when it is a live
    // connection target).
    if (port.visible === false) {
      return false;
    }

    // Phase 3: Check port rendering mode first
    // If port is configured for HTML rendering, skip SVG rendering
    const renderingConfig = port.getRenderingConfig?.();
    if (renderingConfig) {
      const mode = renderingConfig.mode || 'svg';

      // Skip HTML mode ports in SVGRenderer
      if (mode === 'html') {
        return false;
      }

      // Auto mode: detect based on node's HTML layer flag
      if (mode === 'auto') {
        const usesHTMLLayer = node.getMetadata?.('useHTMLLayer');
        if (usesHTMLLayer === true) {
          return false; // Skip - will be rendered in HTML layer
        }
      }
    }

    // Phase 3: Use effective visibility (port > node > global config)
    // Wave 6 (Card 3): the port's GROUP slots into that chain, between the port's
    // own config and the node's metadata — resolvePortConfig() already folded it
    // in, so `resolved.visibility` IS "port config, else group config".
    let visibilityStr: string;
    const resolvedVisibility = resolvePortConfig(port, node).visibility;
    if (resolvedVisibility) {
      visibilityStr = String(resolvedVisibility).toLowerCase();
    } else if (port.getEffectiveVisibility && typeof port.getEffectiveVisibility === 'function') {
      const effectiveVisibility = port.getEffectiveVisibility(
        node,
        String(config.portVisibility).toLowerCase() as any
      );
      visibilityStr = String(effectiveVisibility).toLowerCase();
    } else {
      // Fallback to global config if port doesn't have getEffectiveVisibility
      visibilityStr = String(config.portVisibility).toLowerCase();
    }

    // DEBUG: Enable this to see port visibility decisions
    const debugPortVisibility = false; // Disabled - working correctly now

    if (debugPortVisibility && visibilityStr === 'on-hover') {
      console.log(`🔍 Port visibility check:`, {
        port: `${port.side}`,
        nodeHovered: node.state.hovered,
        portHovered: port.isHovered,
        highlighted: port.isHighlighted,
        validTarget: port.isValidTarget,
        nodeLabel: node.getMetadata('label'),
        effectiveVisibility: visibilityStr,
        shouldShow: node.state.hovered || port.isHovered || port.isHighlighted || port.isValidTarget
      });
    }

    switch (visibilityStr) {
      case 'always':
        return true;
      case 'on-hover':
        // CRITICAL FIX: Show ports when node is hovered, OR during connection (highlighted/validTarget)
        // Do NOT show just because port.isHovered - that creates the "sticky port" bug
        // where the port you exit through stays visible
        const shouldShow = node.state.hovered || port.isHighlighted || port.isValidTarget;
        return shouldShow;
      case 'never':
      case 'hidden':
        // Only show if actively involved in connection
        return port.isHighlighted || port.isValidTarget;
      default:
        // Fallback to always visible
        console.warn(`Unknown port visibility strategy: ${visibilityStr}, defaulting to 'always'`);
        return true;
    }
  }

  /**
   * Phase 2: Get port color based on type
   *
   * Wave 6 (Card 7): a port that declares a `dataType` wears THAT type's colour,
   * if one was registered. Colour-by-type is the affordance that makes a typed
   * graph readable at a glance — you can see that a `number` output will not
   * mate with a `string` input before you even start the drag. Falls straight
   * back to the direction colours, so an untyped port is unchanged.
   */
  private getPortColor(port: PortModel, dataType?: string): string {
    const typed = portTypeColor(dataType ?? port.dataType);
    if (typed) return typed;

    switch (port.type) {
      case 'input':
        return this.theme.colors.port.input;
      case 'output':
        return this.theme.colors.port.output;
      case 'bi':
        return this.theme.colors.port.bi;
      default:
        return this.theme.colors.port.bi;
    }
  }

  /**
   * Phase 3.1: Render node shape based on shape configuration
   * Supports: rect, circle, ellipse, diamond, hexagon
   */
  /**
   * Node label engine: render the node's label as a shape-fitted text block.
   *
   * - maxWidth  = the shape's inner-rect width (getInnerRect); the diamond /
   *   ellipse / triangle … inset it so text stays inside the silhouette.
   * - maxLines  = floor(innerHeight / lineHeight); overflow collapses to '…'.
   * - a per-node <clipPath> sized to the exact inner rect is the hard backstop
   *   that guarantees glyphs never escape the shape even if the width estimate
   *   is off (it uses the naive length*fontSize*0.6 heuristic — see text-block).
   *
   * Returns [clipPath, text]; both are children of the node's translated <g>,
   * so the clip rect and the text share the node-local coordinate space.
   */
  private renderNodeLabel(node: NodeModel): VNode[] {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;
    // Card 5: when the node carries a composite panel, keep the label out of the
    // panel's header/image (top) and row (bottom) bands.
    const inner = panelAdjustedInnerRect(
      node,
      getInnerRect(getShape(shapeConfig.type), width, height),
      width,
      height
    );

    const fontSize = this.theme.typography.fontSize.md as number;
    const lineHeight = fontSize * 1.2;
    const maxLines = Math.max(1, Math.floor(inner.h / lineHeight));
    const clipId = `node-clip-${node.id}`;

    const clip: VNode = {
      type: 'clipPath',
      key: `${clipId}-def`,
      props: { id: clipId },
      children: [
        {
          type: 'rect',
          props: { x: inner.x, y: inner.y, width: inner.w, height: inner.h },
        } as VNode,
      ],
    };

    const text = renderTextBlock({
      text: String(node.getLabel()),
      x: inner.x + inner.w / 2,
      y: inner.y + inner.h / 2,
      maxWidth: inner.w,
      align: 'middle',
      valign: 'middle',
      fontSize,
      lineHeight: 1.2,
      maxLines,
      clipId,
      nonInteractive: true,
      // CSS mode lets `.diagram-label` drive font/fill; programmatic mode emits them.
      className: this.config.useCSSMode ? 'diagram-label' : undefined,
      emitFontSize: !this.config.useCSSMode,
      color: this.config.useCSSMode ? undefined : (this.theme.colors.text.primary as string),
      fontWeight: this.config.useCSSMode ? undefined : (this.theme.typography.fontWeight.medium as number),
    });

    return [clip, text];
  }

  private renderNodeShape(node: NodeModel, styles: any, isHovered: boolean): VNode {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;

    // CRITICAL: Remove strokeWidth from styles if border animation is active
    // Inline strokeWidth overrides CSS animation strokeWidth
    const hasActiveBorderAnimation = node.style?.animatedBorder &&
                                     node.style?.borderAnimationType !== 'none';

    if (hasActiveBorderAnimation && styles.strokeWidth !== undefined) {
      console.log(`[SVGRenderer] Removing inline strokeWidth for ${node.id} due to active border animation`);
      const { strokeWidth, ...stylesWithoutStrokeWidth } = styles;
      styles = stylesWithoutStrokeWidth;
    }

    // The shape config's PAINTS (fill/stroke/strokeWidth/opacity) are no longer
    // spread on top of `styles` here.
    //
    // They used to be — which quietly put them above EVERY layer of the cascade,
    // `state` included, so a selected node carrying a shape-config fill never
    // showed its selection colour. They are now resolved inside the cascade's
    // element-inline layer (see themes/style-cascade.ts → shapeMetadataStyle),
    // so `styles` already contains them, at the right precedence.
    //
    // What stays here is what is genuinely the shape's and not a paint: its TYPE
    // and its corner radius.
    const shapeStyles = { ...styles };

    // Enhanced hover effect
    if (isHovered && !this.config.useCSSMode) {
      shapeStyles.strokeWidth = (shapeStyles.strokeWidth || 1) + 1;
      shapeStyles.filter = 'brightness(1.05)';
    }

    // Route through the shape registry (see shape-registry.ts). buildShapeBody
    // reproduces the historical per-shape style composition exactly.
    return buildShapeBody(
      getShape(shapeConfig.type),
      width,
      height,
      shapeConfig.cornerRadius,
      shapeStyles
    );
  }

  /**
   * Phase 3.1: Render selection highlight matching node shape
   */
  private renderSelectionHighlight(node: NodeModel): VNode {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;
    const padding = 3;

    const baseProps = {
      fill: 'none',
      stroke: this.theme.colors.primary,
      strokeWidth: 3,
      strokeDasharray: '5,5',
      className: 'selection-highlight',
    };

    // Selection highlight = the shape outline grown by `padding` (registry).
    return buildShapeSelection(getShape(shapeConfig.type), width, height, padding, baseProps);
  }

  /**
   * Phase 3.1: Render shadow matching node shape
   */
  private renderShadow(node: NodeModel, isHovered: boolean): VNode {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;
    const offset = isHovered ? 2 : 3;

    const baseProps = {
      fill: '#000',
      opacity: isHovered ? 0.15 : 0.1,
      // Blur through the CSS property, NOT the SVG `filter` attribute: the
      // attribute only honours url(#…) references in practice, so the "blur"
      // silently never applied and the shadow painted as a crisp black rect
      // offset (3,3) — a hard second border along every node's bottom/right
      // (live report: "borders coming on top of each other, some borders
      // thicker than others").
      style: { filter: 'blur(4px)' },
      className: 'node-shadow',
    };

    // Drop shadow = the shape outline offset by (offset, offset) (registry).
    return buildShapeShadow(
      getShape(shapeConfig.type),
      width,
      height,
      offset,
      (node.style.borderRadius ?? 4) as number,
      baseProps
    );
  }

  /**
   * Get link endpoints (source and target port positions in world coordinates)
   * CRITICAL FIX: Use the same getPortPositionForShape() as port rendering to ensure alignment
   */
  private getLinkEndpoints(link: LinkModel): {
    start: { x: number; y: number };
    end: { x: number; y: number };
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom';
    targetDirection?: 'left' | 'right' | 'top' | 'bottom';
  } | null {
    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    // Get source and target nodes
    // Try to get by node ID first, if not set, find the node that owns the port
    let sourceNode = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : null;
    let targetNode = link.targetNodeId ? diagram.getNode(link.targetNodeId) : null;

    // If node IDs not set, find nodes by searching for ports
    if (!sourceNode) {
      sourceNode = diagram.getNodes().find(n => n.getPorts().some(p => p.id === link.sourcePortId)) || null;
    }
    if (!targetNode) {
      targetNode = diagram.getNodes().find(n => n.getPorts().some(p => p.id === link.targetPortId)) || null;
    }

    if (!sourceNode || !targetNode) return null;

    // Get source and target ports
    let sourcePort = sourceNode.getPort(link.sourcePortId);
    let targetPort = targetNode.getPort(link.targetPortId);

    if (!sourcePort || !targetPort) return null;

    // ---------------------------------------------------------------------
    // The DEFAULT (port-based) endpoints. Computed FIRST, because a
    // connection-point strategy receives them as `defaults` — a strategy that
    // only wants to nudge the default must not have to recompute it.
    //
    // CRITICAL FIX (unchanged): use getPortPositionForShape() for consistent
    // positioning, so links connect exactly where the ports are rendered.
    // ---------------------------------------------------------------------
    const sourceLocalPos = getPortPositionForShape(sourcePort, sourceNode);
    const targetLocalPos = getPortPositionForShape(targetPort, targetNode);

    const sourceWorldPos = sourceNode.getWorldPosition();
    const targetWorldPos = targetNode.getWorldPosition();

    // =====================================================================
    // Wave 6 MERGE — two concurrent tracks rewrote this function; both are
    // required, so they are composed into ONE pipeline with explicit precedence:
    //
    //   1. CONNECTION-POINT STRATEGY (wave6/ext, Card 2) — a whole-link
    //      strategy that decides both endpoints together (the draw.io-style
    //      floating attachment used to be inlined here as a boolean; it is now
    //      the registered 'smart' strategy, ported verbatim, and the boolean
    //      merely selects it by name). A strategy that returns a result OWNS
    //      both ends: it attaches to the shape OUTLINE, not to a port glyph, so
    //      port spots/spread are meaningless there and are not applied.
    //      Returning null = DECLINED → fall through.
    //
    //   2. per-end registered ANCHOR (wave6/ext, Card 2) — an explicit,
    //      per-link override of where ONE end attaches. Being explicit and
    //      per-link, it outranks the port's own attachment config.
    //
    //   3. port ATTACHMENT: fromSpot/toSpot + multi-link SPREAD (wave6/ports,
    //      Card 5) — how THIS port hands out its attachment points when the
    //      link has not overridden them.
    //
    // With nothing configured, every branch collapses to the port's plain anchor
    // and side: the exact pre-wave-6 endpoints, to the bit.
    // =====================================================================
    const defaults = {
      start: {
        x: sourceWorldPos.x + sourceLocalPos.x,
        y: sourceWorldPos.y + sourceLocalPos.y,
      },
      end: {
        x: targetWorldPos.x + targetLocalPos.x,
        y: targetWorldPos.y + targetLocalPos.y,
      },
      sourceDirection: sourcePort.alignment.side,
      targetDirection: targetPort.alignment.side,
    };

    const sourceRect = {
      x: sourceWorldPos.x,
      y: sourceWorldPos.y,
      w: sourceNode.size.width,
      h: sourceNode.size.height,
    };
    const targetRect = {
      x: targetWorldPos.x,
      y: targetWorldPos.y,
      w: targetNode.size.width,
      h: targetNode.size.height,
    };

    // ---- 1. connection-point strategy (owns BOTH ends when it accepts) ----
    const strategyName =
      (typeof link.getMetadata === 'function'
        ? (link.getMetadata('connectionPoint') as string | undefined)
        : undefined) ??
      this.config.connectionPoint ??
      (this.config.smartConnectionPoints ? 'smart' : undefined) ??
      // Lowest precedence: the spec layer stamps `autoConnectionPoint` on edges
      // that named no handle (see buildEdge). Anchoring left to us = the
      // geometry-aware strategy, not a frozen right→left pick. 'port-facing',
      // not 'smart': the side follows the partner, but the attachment lands on
      // the node's real PORT on that side — a perimeter point that slides while
      // you drag reads as the line detaching from the ports the user can see.
      // Everything the user DID say — per-link strategy, diagram config, the
      // boolean flag — resolves above this line; `connectionPoint: 'port'` at
      // either level restores fixed pinning, `'smart'` gives true floating.
      (typeof link.getMetadata === 'function' && link.getMetadata('autoConnectionPoint')
        ? 'port-facing'
        : undefined);

    const strategy = strategyName ? getConnectionPoint(strategyName) : undefined;

    if (strategy) {
      const result = strategy({
        link,
        source: { node: sourceNode, port: sourcePort, rect: sourceRect },
        target: { node: targetNode, port: targetPort, rect: targetRect },
        defaults,
        boundaryPoint: (node, rect, side, cross) => this.shapeEdgePoint(node, rect, side, cross),
        nearestVisiblePort: (node, side, near) => this.nearestVisiblePort(node, side, near),
        nearestPort: (node, side, near) => this.nearestPortOnSide(node, side, near),
      });

      // `null` = the strategy DECLINED (what the built-in 'port' strategy does).
      if (result) {
        this.frameSmartSides.set(link.id, {
          source: result.sourceDirection ?? defaults.sourceDirection,
          target: result.targetDirection ?? defaults.targetDirection,
        });
        return {
          start: result.start,
          end: result.end,
          sourceDirection: result.sourceDirection ?? defaults.sourceDirection,
          targetDirection: result.targetDirection ?? defaults.targetDirection,
        };
      }
    }

    this.frameSmartSides.delete(link.id);

    // ---- 2. per-end registered anchor (explicit per-link override) ----
    const applyAnchor = (
      which: 'source' | 'target'
    ): { point: { x: number; y: number }; side?: 'left' | 'right' | 'top' | 'bottom' } | null => {
      if (typeof link.getMetadata !== 'function') return null;
      const name = link.getMetadata(which === 'source' ? 'sourceAnchor' : 'targetAnchor') as
        | string
        | undefined;
      if (!name) return null;
      const anchor = getAnchor(name);
      if (!anchor) return null;

      const self =
        which === 'source'
          ? { node: sourceNode, port: sourcePort, rect: sourceRect }
          : { node: targetNode, port: targetPort, rect: targetRect };
      const other =
        which === 'source'
          ? { node: targetNode, port: targetPort, rect: targetRect }
          : { node: sourceNode, port: sourcePort, rect: sourceRect };

      return anchor({
        end: self,
        other,
        link,
        defaultPoint: which === 'source' ? defaults.start : defaults.end,
        args:
          (link.getMetadata(
            which === 'source' ? 'sourceAnchorArgs' : 'targetAnchorArgs'
          ) as Record<string, unknown> | undefined) ?? {},
      });
    };

    const sourceAnchored = applyAnchor('source');
    const targetAnchored = applyAnchor('target');

    // ---- 3. port attachment: spots + spread (only where 2 did not override) ----
    const source = sourceAnchored
      ? { point: sourceAnchored.point, direction: sourceAnchored.side ?? defaults.sourceDirection }
      : this.portAttachment(link, sourcePort, sourceNode, defaults.start, 'source');
    const target = targetAnchored
      ? { point: targetAnchored.point, direction: targetAnchored.side ?? defaults.targetDirection }
      : this.portAttachment(link, targetPort, targetNode, defaults.end, 'target');

    return {
      start: source.point,
      end: target.point,
      sourceDirection: source.direction,
      targetDirection: target.direction,
    };
  }

  /**
   * Wave 6 (ports, Card 5): resolve where `link` attaches to `port`, and which way
   * it travels there.
   *
   * Two effects compose:
   *   * the port's `fromSpot`/`toSpot` moves the attachment onto a named point of
   *     the GLYPH (its corner, its far edge) and can aim the link somewhere other
   *     than the port's outward normal;
   *   * `spread` fans the links SHARING this port along the port's edge, so five
   *     links into one input arrive as five strokes instead of one overdrawn pile.
   *
   * With neither configured this returns the port's plain anchor point and its
   * side — the exact pre-wave-6 endpoint, to the bit. A port with a single link
   * never moves even WITH spread enabled (a one-lane spread has offset 0).
   */
  private portAttachment(
    link: LinkModel,
    port: PortModel,
    node: NodeModel,
    anchor: { x: number; y: number },
    end: 'source' | 'target'
  ): { point: { x: number; y: number }; direction: 'left' | 'right' | 'top' | 'bottom' } {
    const resolved = resolvePortConfig(port, node);
    const spot = end === 'source' ? resolved.fromSpot : resolved.toSpot;
    const spread = resolved.spread;

    // Fast path: nothing configured → the anchor and the side, untouched.
    if (!spot && !spread?.enabled) {
      return { point: anchor, direction: resolved.side };
    }

    const config = this.engine.getInteractionConfig();
    const { hw, hh } = glyphHalfExtents(resolved.shape, config.portDefaultRadius);

    const { point, direction } = resolveSpot(spot, {
      x: anchor.x,
      y: anchor.y,
      hw,
      hh,
      side: resolved.side,
    });

    if (!spread?.enabled) {
      return { point, direction };
    }

    const lanes = this.portSpreadLanes(port, spread);
    return { point: applySpread(point, direction, lanes.get(link.id) ?? 0), direction };
  }

  /**
   * The lane offset of every link sharing `port`, memoised for the frame.
   *
   * Lanes are keyed on the OTHER endpoint's port id so the fan is stable: adding
   * an unrelated link, or reloading the diagram, must not reshuffle the strokes
   * a user is already looking at.
   */
  private portSpreadLanes(port: PortModel, spread: NonNullable<ResolvedPortConfig['spread']>): Map<string, number> {
    const cached = this.frameSpreadLanes.get(port.id);
    if (cached) return cached;

    const diagram = this.engine.getDiagram();
    const entries: Array<{ linkId: string; sortKey: string }> = [];

    for (const candidate of diagram?.getLinks() ?? []) {
      if (candidate.sourcePortId === port.id) {
        entries.push({ linkId: candidate.id, sortKey: candidate.targetPortId ?? '' });
      } else if (candidate.targetPortId === port.id) {
        entries.push({ linkId: candidate.id, sortKey: candidate.sourcePortId ?? '' });
      }
    }

    const lanes = assignSpreadLanes(entries, spread);
    this.frameSpreadLanes.set(port.id, lanes);
    return lanes;
  }

  /**
   * Map LinkModel pathType to RoutingAlgorithm
   */
  private mapPathTypeToAlgorithm(pathType: string): RoutingAlgorithm {
    switch (pathType) {
      case 'direct':
        return 'straight';
      case 'orthogonal':
        return 'orthogonal';
      case 'smooth':
      case 'bezier':
      default:
        return 'straight'; // Use straight for smooth/bezier, will add curve post-processing
    }
  }

  /**
   * Wave 5 (Edge routing) — Card 0. The routing algorithm for a link: its
   * explicit `router` when set, else the legacy pathType derivation. This is
   * the seam that finally makes the registered obstacle routers REACHABLE —
   * mapPathTypeToAlgorithm could only ever produce straight/orthogonal, so
   * a-star/dijkstra/visibility-graph were registered but unaddressable.
   */
  private routerForLink(link: LinkModel): RoutingAlgorithm {
    // effectiveRouter() folds the legacy derivation in: a link with no explicit
    // router yields exactly what mapPathTypeToAlgorithm(pathType) always did.
    const router = typeof link.effectiveRouter === 'function'
      ? link.effectiveRouter()
      : this.mapPathTypeToAlgorithm(link.pathType);
    switch (router) {
      case 'straight':
        return 'straight';
      case 'orthogonal':
        return 'orthogonal';
      case 'avoid':
        return 'a-star';
      default:
        // 'manhattan' and any CUSTOM registration resolve by NAME against the
        // RoutingEngine registry.
        //
        // Wave 6 BUG FIX. This comment used to claim "an unknown name falls back
        // to the engine's default inside route()". It does not: `route()` THROWS
        // (`Router 'x' not found`), and it throws a SECOND way for 'elk' ("ELK
        // router is async. Use routeAsync()") — even though 'elk' is an
        // advertised value of the public `LinkRouterName` union. The renderer has
        // zero try/catch, so `router: 'elk'`, or any typo, took the whole render
        // loop down. The fallback the comment promised is now real, and it lives
        // HERE, where we can still choose a sane algorithm.
        return this.resolveRouterName(router);
    }
  }

  /**
   * Wave 6: validate a router NAME against the live RoutingEngine registry.
   * Unknown names — and the async-only 'elk' — degrade to 'orthogonal' instead
   * of throwing out of the render loop. A diagram with one bad router name must
   * still draw; it must not blank the canvas.
   */
  private resolveRouterName(router: string): RoutingAlgorithm {
    // ELK is async-only: `route()` (the synchronous path the renderer uses)
    // throws on it by design. Render the elbow geometry instead of dying; a host
    // that wants true ELK geometry pre-computes it via routeAsync().
    if (router === 'elk') return 'orthogonal';

    try {
      const available = this.engine.getRoutingEngine?.()?.getAvailableAlgorithms?.();
      if (Array.isArray(available) && available.length > 0 && !available.includes(router)) {
        return 'orthogonal';
      }
    } catch {
      // Engine did not expose the registry — fall through and trust the name.
    }
    return router as RoutingAlgorithm;
  }

  /**
   * Card 0: does this link's ROUTER produce orthogonal (axis-aligned) geometry?
   * The waypoint editor, arrow-angle maths and parallel-lane fan-out all branch
   * on "is this an elbow route" — which is a property of the router, not of the
   * pathType shorthand (an explicit manhattan/avoid router routes in elbows even
   * when the legacy pathType says 'smooth').
   */
  private isOrthogonalRouting(link: LinkModel): boolean {
    const algo = this.routerForLink(link);
    return algo === 'orthogonal' || algo === 'manhattan' || algo === 'a-star' || algo === 'dijkstra';
  }

  /**
   * Wave 6 — Card 2. If this link names a REGISTERED connector, let it draw the
   * whole path; otherwise return null and the built-in branches run untouched.
   *
   * ONE implementation, called from BOTH places a link's `d` is produced (the
   * auto-routed branch via `convertRoutedPathToSVG`, and the manual-waypoint
   * branch via `generatePathData`) — so a custom connector cannot work on one
   * kind of link and silently not the other.
   *
   * The four BUILT-IN connector names never reach the registry: they are the
   * renderer's own branches and stay exactly as they were.
   */
  private customConnectorPath(
    link: LinkModel,
    points: Array<{ x: number; y: number }>,
    style?: Partial<LinkStyle>,
    pathType?: string
  ): string | null {
    if (typeof link.effectiveConnector !== 'function') return null;
    if (points.length < 2) return null;

    const name = link.effectiveConnector();
    if (!name || !hasConnector(name)) return null;

    const connector = getConnector(name);
    if (!connector) return null;

    return connector({
      points,
      link,
      style: style ?? link.style,
      cornerRadius: this.resolveCornerRadius(style ?? link.style, pathType ?? link.pathType),
    });
  }

  /**
   * Card 0: the CONNECTOR expressed in the renderer's legacy vocabulary, so the
   * existing rendering branches (which all read a pathType-shaped string) apply
   * unchanged: 'rounded' rides the orthogonal branch (that IS the rounded-corner
   * code path), 'straight' rides direct. A link with no explicit connector
   * renders byte-identically to before.
   */
  private renderPathType(link: LinkModel): 'direct' | 'orthogonal' | 'smooth' | 'bezier' {
    const connector = link.effectiveConnector?.() ?? undefined;
    if (connector === undefined) return link.pathType;
    switch (connector) {
      case 'straight': return 'direct';
      case 'rounded': return 'orthogonal';
      case 'smooth': return 'smooth';
      case 'bezier': return 'bezier';
      default: return link.pathType;
    }
  }

  /**
   * wave8/culling — Card 4. The path type to EMIT at this tier.
   *
   * Below the `link-detail` tier a curve is drawn as its polyline. A cubic needs
   * control points computed per segment and emits a `C` command per bend; at a
   * zoom where the whole edge is a few dozen pixels the curve and its chord are
   * the same handful of pixels, so the arithmetic buys nothing.
   *
   * Orthogonal stays orthogonal — its right angles are its MEANING (a flowchart
   * that goes diagonal at low zoom has changed what it says, not how finely it
   * says it), and the orthogonal emitter is a cheap `L` walk anyway.
   */
  private pathTypeForLOD(
    link: LinkModel,
    lod: LODLevel
  ): 'direct' | 'orthogonal' | 'smooth' | 'bezier' {
    const type = this.renderPathType(link);
    if (this.lodAllows('link-detail', lod)) return type;
    return type === 'smooth' || type === 'bezier' ? 'direct' : type;
  }

  /**
   * wave8/culling — Card 4. The polyline to DRAW at this tier.
   *
   * Below the `link-detail` tier the path is run through the engine's
   * `PathSimplifier` (Douglas–Peucker) with a tolerance of one SCREEN pixel —
   * `1 / zoom` world units, so the tolerance tightens as you zoom in and the
   * simplification silently retires itself. A bend the user cannot resolve is a
   * `L` command, a VNode diff and a DOM attribute for nothing.
   *
   * The DRAWN path only. `link.points` keeps the true geometry (see the call
   * site) — hit-testing, link bounds and the spatial index must not be told a
   * simplification is the truth.
   *
   * A route that is already 2 points (which is what `computeCoarseRoute` emits,
   * so: the common far-zoom case) short-circuits without allocating.
   */
  private pathForLOD(routed: RoutedPath, lod: LODLevel): RoutedPath {
    if (this.lodAllows('link-detail', lod)) return routed;
    if (routed.points.length <= 2) return routed;

    const epsilon = 1 / this.frameZoom;
    const simplified = this.pathSimplifier.simplify(routed.points, epsilon);
    if (simplified.length === routed.points.length) return routed;

    return {
      ...routed,
      points: simplified,
      bendCount: Math.max(0, simplified.length - 2),
    };
  }

  /**
   * Calculate distance between two points
   */
  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Generate SVG path segment with rounded bend
   * Based on React Flow's getBend function from smoothstep-edge.ts
   */
  private getBend(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    size: number
  ): string {
    const bendSize = Math.min(
      this.distance(a, b) / 2,
      this.distance(b, c) / 2,
      size
    );
    const { x, y } = b;

    // No bend needed if points are collinear (straight line)
    if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) {
      return `L${x} ${y}`;
    }

    // First segment is horizontal
    if (a.y === y) {
      const xDir = a.x < c.x ? -1 : 1;
      const yDir = a.y < c.y ? 1 : -1;
      return `L ${x + bendSize * xDir},${y}Q ${x},${y} ${x},${y + bendSize * yDir}`;
    }

    // First segment is vertical
    const xDir = a.x < c.x ? 1 : -1;
    const yDir = a.y < c.y ? -1 : 1;
    return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`;
  }

  /**
   * Convert orthogonal path to SVG with rounded corners
   * Implements React Flow's smoothstep edge rendering
   */
  private convertOrthogonalPathWithBends(
    points: Array<{ x: number; y: number }>,
    borderRadius: number = 5
  ): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    // Start path at first point
    let path = `M ${points[0].x} ${points[0].y}`;

    // For each intermediate point, add a bend
    for (let i = 1; i < points.length - 1; i++) {
      path += this.getBend(points[i - 1], points[i], points[i + 1], borderRadius);
    }

    // Add final point
    path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

    return path;
  }

  // ==========================================================================
  // Wave 3 (Edges & links) — per-link path-shape knobs.
  //
  // Two LinkStyle fields drive path GEOMETRY (as opposed to paint):
  //   • cornerRadius — orthogonal bend radius, was a hardcoded 5 / 12
  //   • curvature    — smooth/bezier control-point tightness, was DEAD
  // Both are resolved here so every path-emitting site (auto route, manual
  // waypoints, jump path) reads exactly one definition of the default.
  // ==========================================================================

  /** Built-in bend radius per path type (React Flow's smoothstep default = 5). */
  private defaultCornerRadius(pathType: string): number {
    return pathType === 'orthogonal' ? 5 : 12;
  }

  /**
   * The bend radius a link asks for. Unset (or non-finite/negative) → the
   * built-in default for its path type, so untouched links render byte-identical
   * to before this knob existed. `getBend` clamps every corner to half the
   * shorter adjacent segment, so any radius is geometrically safe.
   */
  private resolveCornerRadius(style: Partial<LinkStyle> | undefined, pathType: string): number {
    const r = style?.cornerRadius;
    return typeof r === 'number' && isFinite(r) && r >= 0
      ? r
      : this.defaultCornerRadius(pathType);
  }

  /**
   * Smooth/bezier control-point offset, honouring `style.curvature` (a
   * multiplier of the endpoint distance; default 0.5 = the legacy factor).
   * The historical 100px cap scales with the multiplier so curvature 0.5 is
   * exactly the old `Math.min(distance / 2, 100)`.
   */
  private controlDistanceFor(distance: number, style?: Partial<LinkStyle>): number {
    const c = style?.curvature;
    const curvature = typeof c === 'number' && isFinite(c) && c >= 0 ? c : 0.5;
    return Math.min(distance / 2, 100) * (curvature / 0.5);
  }

  /** The 2-point smooth/bezier control arms — one implementation for the drawn
   *  path AND the hit polyline. */
  private smoothControlPoints(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    controlDistance: number,
    sourceDirection?: string,
    targetDirection?: string
  ): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
    let cp1 = { x: p0.x, y: p0.y };
    let cp2 = { x: p1.x, y: p1.y };
    if (sourceDirection && targetDirection) {
      switch (sourceDirection) {
        case 'right': cp1 = { x: p0.x + controlDistance, y: p0.y }; break;
        case 'left': cp1 = { x: p0.x - controlDistance, y: p0.y }; break;
        case 'bottom': cp1 = { x: p0.x, y: p0.y + controlDistance }; break;
        case 'top': cp1 = { x: p0.x, y: p0.y - controlDistance }; break;
      }
      switch (targetDirection) {
        case 'right': cp2 = { x: p1.x + controlDistance, y: p1.y }; break;
        case 'left': cp2 = { x: p1.x - controlDistance, y: p1.y }; break;
        case 'bottom': cp2 = { x: p1.x, y: p1.y + controlDistance }; break;
        case 'top': cp2 = { x: p1.x, y: p1.y - controlDistance }; break;
      }
    } else {
      cp1 = { x: p0.x + controlDistance, y: p0.y };
      cp2 = { x: p1.x - controlDistance, y: p1.y };
    }
    return { cp1, cp2 };
  }

  /**
   * The polyline the INTERACTION layer should measure — the PAINTED geometry,
   * flattened.
   *
   * `link.points` used to hold the ROUTE (for a 2-point smooth link: the bare
   * chord) while the drawn path is a direction-aware cubic that bows up to
   * ~25 world units away from it. Every consumer of `link.points` — the body
   * hit test, hover, label anchors, waypoint-insertion t, the edge toolbar's
   * midpoint — was measuring a line the user cannot see: on dagre-tree's
   * fan-out edges only ~12-20% of the painted length accepted a click, with
   * a dead band at the apex wider than the stroke itself (live report:
   * "not always so easy to select the line on all its points"; investigator-
   * quantified). Flattening at 16 steps per cubic mirrors the Canvas
   * backend's own pick flattening (path-geometry.flattenPath), which already
   * measured the painted commands — the two backends now agree by
   * construction.
   */
  /**
   * Sync `link.points` from a ROUTE via the painted geometry, not the raw
   * polyline. Every sync site must go through here: the routing pre-pass
   * re-syncs every routed link EVERY frame, so a flatten done only in
   * renderLink is overwritten right back to the chord on the next frame —
   * which is exactly the bug this exists to prevent (smooth 2-point links
   * bow ~25px off their chord; hit-testing, hover, labels, toolbars and
   * bounds all measure link.points).
   */
  private syncPaintedLinkPoints(
    link: LinkModel,
    routePoints: Array<{ x: number; y: number }>,
    endpoints?: {
      sourceDirection?: 'left' | 'right' | 'top' | 'bottom';
      targetDirection?: 'left' | 'right' | 'top' | 'bottom';
    } | null
  ): void {
    const eps = endpoints ?? this.getLinkEndpoints(link);
    if (!eps) {
      this.syncLinkPoints(link, routePoints);
      return;
    }
    this.syncLinkPoints(
      link,
      this.paintedHitPolyline(
        routePoints,
        this.pathTypeForLOD(link, this.frameLod),
        eps.sourceDirection,
        eps.targetDirection,
        this.linkOwnNodes(link),
        link.style
      )
    );
  }

  private paintedHitPolyline(
    routePoints: Array<{ x: number; y: number }>,
    pathType: string,
    sourceDirection: string | undefined,
    targetDirection: string | undefined,
    avoidNodes: NodeModel[],
    style?: Partial<LinkStyle>
  ): Array<{ x: number; y: number }> {
    if (pathType !== 'smooth' && pathType !== 'bezier') return routePoints;
    if (routePoints.length === 2) {
      const p0 = routePoints[0];
      const p1 = routePoints[1];
      const distance = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (distance < 1) return routePoints;
      const { cp1, cp2 } = this.smoothControlPoints(
        p0, p1, this.controlDistanceFor(distance, style), sourceDirection, targetDirection
      );
      const STEPS = 16;
      const out: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const u = 1 - t;
        out.push({
          x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p1.x,
          y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p1.y,
        });
      }
      return out;
    }
    // Multi-point smooth: mirror convertRoutedPathToSVG's choice — the
    // catmull-rom spline unless its overshoot would clip the link's own nodes
    // (then the drawn path is rounded corners, which hug the route within
    // ~0.4 units — the route polyline is already an honest hit shape there).
    const samples = this.sampleCatmullRom(routePoints, 8);
    if (avoidNodes.length === 0 || this.penetrationLength(samples, avoidNodes) <= 2) {
      return samples;
    }
    return routePoints;
  }

  /**
   * Convert RoutedPath to SVG path string
   *
   * Wave 3: `style` carries the link's per-link path-shape knobs (cornerRadius,
   * curvature). Omitted by the connection/reconnection previews, which have no
   * link style yet — they keep the built-in defaults.
   */
  private convertRoutedPathToSVG(
    routedPath: RoutedPath,
    pathType: string,
    sourceDirection?: string,
    targetDirection?: string,
    avoidNodes?: NodeModel[],
    style?: Partial<LinkStyle>
  ): string {
    if (!routedPath || routedPath.points.length === 0) return '';

    const points = routedPath.points;

    // For smooth/bezier types, add curve control points
    if (pathType === 'smooth' || pathType === 'bezier') {
      if (points.length < 2) return `M ${points[0].x} ${points[0].y}`;

      let path = `M ${points[0].x} ${points[0].y}`;

      // Simple bezier curve for 2 points
      if (points.length === 2) {
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const controlDistance = this.controlDistanceFor(distance, style);

        // ENHANCED: Direction-aware control points (ReactFlow style)
        // Control points extend from the port in the direction it faces.
        // Shared with paintedHitPolyline — the hit test must flatten the SAME
        // curve this draws (see that method's header).
        const { cp1, cp2 } = this.smoothControlPoints(
          points[0], points[1], controlDistance, sourceDirection, targetDirection
        );

        path += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${points[1].x} ${points[1].y}`;
      } else {
        // Multi-point route (e.g. a detour around a node): a smooth link must
        // KEEP ITS CURVED IDENTITY — fit a spline through the route points.
        // Guard: if the spline's corner overshoot would dip into the link's
        // own nodes, fall back to tight rounded corners instead.
        const spline = this.catmullRomPath(points);
        const avoid = avoidNodes ?? [];
        if (avoid.length === 0 ||
            this.penetrationLength(this.sampleCatmullRom(points, 8), avoid) <= 2) {
          return spline;
        }
        // Rounded-corner fallback for a detour that would clip its own nodes.
        // Default radius here is 12 (tighter corners read as "still a curve").
        return this.convertOrthogonalPathWithBends(points, this.resolveCornerRadius(style, pathType));
      }

      return path;
    }

    // For straight, just connect the points
    if (pathType === 'straight') {
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
      }
      return path;
    }

    // For orthogonal with rounded corners (React Flow smoothstep style).
    // Wave 3: radius is per-link (`style.cornerRadius`), default 5.
    if (pathType === 'orthogonal') {
      return this.convertOrthogonalPathWithBends(points, this.resolveCornerRadius(style, pathType));
    }

    // Fallback
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }

  /**
   * Render single link (Option 2: Enhanced with arrows and labels)
   */
  private renderLink(link: LinkModel, lod: LODLevel): VNode {
    // Check cache if enabled (include LOD in cache key since rendering varies
    // by LOD — arrows/labels/handles differ per tier, exactly like nodes).
    // A clean link crossing an LOD threshold on zoom must NOT serve a
    // wrong-LOD VNode. NOTE: this is the cache lookup key only; the VNode's
    // `key` prop stays `link-${link.id}` for stable VDOM reconciliation.
    const cacheKey = `link-${link.id}-${lod}`;
    // Paint-server links bypass the cache so their `<defs>` entry is re-registered
    // every frame (a cache hit would skip style computation and orphan url(#…)).
    const usesPaintServer = this.linkUsesPaintServer(link);
    if (this.config.enableCaching && !link.isDirty && !usesPaintServer) {
      const cached = this.vnodeCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Compute styles
    const styles = this.config.useCSSMode
      ? this.computeLinkStylesCSS(link)
      : this.computeLinkStylesProgrammatic(link);

    // Get link endpoints from ports
    const endpoints = this.getLinkEndpoints(link);

    // Fallback to existing points if endpoints can't be calculated
    let pathData: string;
    let points: Array<{ x: number; y: number }>;

    // Waypoints only count as manual when the waypoint editor marked them so.
    // Auto-routed orthogonal paths also have >2 points; treating those as
    // manual froze links in place (they never re-routed after a node moved).
    const hasManualWaypoints = this.linkHasManualWaypoints(link);

    if (endpoints && !hasManualWaypoints) {
      // Routes are pre-computed for the whole frame in renderLinksLayer so that
      // jump-point detection sees every link's CURRENT geometry (not last frame's).
      // The fallback goes through routeForLOD, not computeAutoRoute, so a link the
      // pre-pass somehow missed cannot smuggle a full obstacle search into a tier
      // that has dropped routing.
      const routedPath =
        this.frameRoutes.get(link.id) ??
        this.routeForLOD(link, endpoints, this.lodAllows('routing', lod));

      if (routedPath) {
        points = routedPath.points;
        // wave8/culling — Card 4: what gets DRAWN at this tier. The model keeps
        // the true polyline (`syncLinkPoints` below is unchanged, so link bounds,
        // hit-testing and the spatial index all still see real geometry) — this
        // only simplifies the `d` we hand the DOM.
        const drawPath = this.pathForLOD(routedPath, lod);
        pathData =
          this.customConnectorPath(link, drawPath.points) ??
          this.convertRoutedPathToSVG(
            drawPath,
            this.pathTypeForLOD(link, lod),   // Card 0: the CONNECTOR draws the polyline
            endpoints.sourceDirection,
            endpoints.targetDirection,
            this.linkOwnNodes(link),
            link.style           // Wave 3: per-link cornerRadius / curvature
          );
        // Sync the PAINTED polyline, not the raw route — see paintedHitPolyline.
        this.syncPaintedLinkPoints(link, points, endpoints);
      } else {
        // All routing strategies failed: hide invalid connection
        console.warn(`All routing strategies failed for link ${link.id} - hiding invalid preview`);
        return {
          type: 'g',
          key: `link-${link.id}`,
          props: {},
          children: []
        };
      }
    } else {
      // Has manual waypoints — keep the user's interior waypoints but refresh
      // both endpoints from the CURRENT port positions, otherwise the link
      // stays anchored to wherever the nodes were when the waypoint was added.
      points = link.points;
      if (endpoints && points.length >= 2) {
        points = [
          { ...endpoints.start },
          ...points.slice(1, -1).map(p => ({ ...p })),
          { ...endpoints.end },
        ];
        this.syncLinkPoints(link, points);
      }

      // ✅ HIGH-PERFORMANCE: For orthogonal paths with manual waypoints
      // Use fast direct orthogonal calculation for waypoint segments
      // Only use routing engine for port connections (first/last segments)
      if (this.isOrthogonalRouting(link) && hasManualWaypoints) {
        const routingEngine = this.engine.getRoutingEngine();
        const allRoutedPoints: Array<{ x: number; y: number }> = [];

        // Get port directions for first and last segments
        const sourceDirection = endpoints?.sourceDirection;
        const targetDirection = endpoints?.targetDirection;

        // Collect obstacles for segment routing (same as primary routing)
        const currentDiagram = this.engine.getDiagram();
        let segmentObstacles: Array<{id: string; x: number; y: number; width: number; height: number}> = [];

        if (currentDiagram) {
          const sourceNodeId = (link as any).sourceNodeId || (link as any).source;
          const targetNodeId = (link as any).targetNodeId || (link as any).target;

          segmentObstacles = currentDiagram.getNodes()
            .filter((node: NodeModel) =>
              node.id !== sourceNodeId && node.id !== targetNodeId
            )
            .map((node: NodeModel) => ({
              id: node.id,
              x: node.position.x,
              y: node.position.y,
              width: node.size.width,
              height: node.size.height,
            }));
        }

        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i];
          const end = points[i + 1];
          const isFirstSegment = i === 0;
          const isLastSegment = i === points.length - 2;

          if (isFirstSegment || isLastSegment) {
            // Use routing engine for port connections (perpendicular to ports)
            // FIXED: Enable obstacle avoidance to prevent penetrating nodes during drag
            const segmentSourceDir = isFirstSegment ? sourceDirection : undefined;
            const segmentTargetDir = isLastSegment ? targetDirection : undefined;

            const segmentRoute = routingEngine.route({
              start,
              end,
              sourceDirection: segmentSourceDir,
              targetDirection: segmentTargetDir,
              obstacles: segmentObstacles,  // FIXED: Pass obstacles
              options: {
                algorithm: 'orthogonal',
                avoidObstacles: true,  // FIXED: Enable A* pathfinding
                gridSize: 10
              }
            });

            if (segmentRoute && segmentRoute.points.length > 0) {
              const segPts = this.rectifyOrthogonalRoute(segmentRoute.points);
              if (i === 0) {
                allRoutedPoints.push(...segPts);
              } else {
                allRoutedPoints.push(...segPts.slice(1));
              }
            } else {
              if (i === 0) allRoutedPoints.push(start);
              allRoutedPoints.push(end);
            }
          } else {
            // FAST PATH: Direct orthogonal segment calculation for waypoint-to-waypoint
            // Create simple 3-point orthogonal path: start -> midpoint -> end
            const orthogonalSegment = this.createOrthogonalSegment(start, end);

            // Skip first point (already added from previous segment)
            if (orthogonalSegment.length > 1) {
              allRoutedPoints.push(...orthogonalSegment.slice(1));
            }
          }
        }

        points = allRoutedPoints;
        // Wave 6: `link` is passed so a REGISTERED connector can claim the
        // polyline → `d` step (see generatePathData).
        pathData = this.generatePathData(allRoutedPoints, link.segments, this.renderPathType(link), link.style, link);
      } else {
        // For non-orthogonal paths or no waypoints, use the (endpoint-refreshed)
        // points as-is
        pathData = this.generatePathData(points, link.segments, this.renderPathType(link), link.style, link);
      }
    }

    // Safety check: if points is still empty/undefined, skip rendering
    if (!points || points.length === 0) {
      console.warn(`Cannot render link ${link.id}: no valid points available`);
      return {
        type: 'g',
        key: `link-${link.id}`,
        props: {},
        children: []
      };
    }

    // CRITICAL FIX: Get arrow styles FIRST to use actual arrow size for position calculation
    // Get arrow styles from link (with defaults)
    // The arrow's colour must be a LITERAL: ArrowRenderer paints through SVG
    // presentation attributes (`fill="…"`), which cannot hold a CSS variable — so
    // `styles.stroke` is the wrong source now that it may be `var(--grafloria-…)` for
    // a theme-bound link. `linkPaintLiterals()` resolves the same cascade to real
    // values, and the link is recorded as theme-bound so a theme swap re-renders it.
    const linkLiterals = this.linkPaintLiterals(link);
    // In CSS mode the marker rides the SAME variable the edge paints with, so a
    // token bridge or theme swap re-colours arrowheads WITH their edge — the
    // theme literal alone left goldenrod bridged edges capped by grey arrows
    // (visible on the themes-and-tokens MUI palette). The literal stays as the
    // var() fallback; markers now paint via style, which can hold var().
    const arrowLiteral = linkLiterals.stroke || this.theme.colors.link.default;
    const arrowHeadStyle = link.style.arrowHead || {
      type: 'arrow',
      size: 10,
      filled: true,
      color: this.config.useCSSMode
        ? `var(${THEME_VARS['link.stroke'].cssVar}, ${arrowLiteral})`
        : arrowLiteral,
    };

    const arrowTailStyle = link.style.arrowTail;

    // Calculate arrow position and angle using unified utility.
    // Each marker shape has its own tip offset (triangle tip at +size, circles
    // centered, diamonds tip at origin) — using the raw size floated every
    // non-triangle marker off the node.
    const arrowData = this.calculateArrowPositionAndAngle(
      link, points, true, this.arrowRenderer.getTipOffset(arrowHeadStyle));
    const arrowTipPosition = arrowData.position;
    const angle = arrowData.angle;

    // Calculate label position (middle of the link)
    const midIndex = Math.floor(points.length / 2);
    const labelPoint = points[midIndex];
    const label = link.getLabel();

    // Store last point for endpoint handle rendering
    const lastPoint = points[points.length - 1];

    // Phase 2: Check if link is selected and reconnection handles should be shown
    const config = this.engine.getInteractionConfig();
    const isSelected = link.state === 'selected';
    const showHandles =
      config.enableLinkReconnection &&
      config.showLinkEndpointHandles &&
      isSelected &&
      this.lodAllows('handles', lod);

    // Phase 1.3: Apply jump points if enabled.
    // Jumps are built from the SAME polyline the detector indexed — never by
    // re-parsing the rendered path string (rounded corners would shift segment
    // indices). Curved 2-point links keep their curve: chord-based jumps would
    // both misplace the jump and destroy the bezier.
    let linkPathVNode: VNode;
    const jumpConfig = link.style.jumpPoints;
    const renderTypeForCurve = this.renderPathType(link);
    const isTwoPointCurve =
      (renderTypeForCurve === 'smooth' || renderTypeForCurve === 'bezier') && points.length === 2;
    let jumpPathData: string | null = null;

    if (jumpConfig?.enabled && (jumpConfig.size ?? 10) > 0 && !isTwoPointCurve && points.length >= 2) {
      // Wave 4 — Card 7: the crossings come from the ONE diagram-wide pass, which
      // computed them for every link before any link rendered. The fallback below
      // is the old per-link scan, kept for `edgeOptimizer: false` — it re-tested
      // this link against EVERY other link in the diagram, every frame, whether or
      // not anything had moved.
      const intersections = this.config.edgeOptimizer
        ? this.frameJumps.get(link.id) ?? []
        : (() => {
            const diagram = this.engine.getDiagram();
            const allLinks = diagram ? diagram.getLinks() : [];
            const otherLinks = allLinks.filter(l => l.id !== link.id);
            return this.jumpPointDetector.detectIntersections(
              { id: link.id, points },
              otherLinks.map(l => ({ id: l.id, points: l.points })),
              jumpConfig.detectMode,
              jumpConfig.threshold
            );
          })();

      if (intersections.length > 0) {
        // Keep jumps clear of the arrow markers: reserve the marker's tip
        // extent at each end so an arc never renders underneath an arrowhead
        const headReserve = arrowHeadStyle && arrowHeadStyle.type !== 'none'
          ? this.arrowRenderer.getTipOffset(arrowHeadStyle) + 2 : 0;
        const tailReserve = arrowTailStyle && arrowTailStyle.type !== 'none'
          ? this.arrowRenderer.getTipOffset(arrowTailStyle) + 2 : 0;
        jumpPathData = this.buildPathWithJumps(
          points, intersections, jumpConfig, this.renderPathType(link), tailReserve, headReserve, link.style);
      }
    }

    linkPathVNode = {
      type: 'path',
      props: {
        d: jumpPathData ?? pathData,
        fill: 'none',
        ...styles,
      },
    };

    // Invisible wide stroke under the link so thin lines are easy to click
    // and hover (classic diagram-tool "interaction stroke")
    // Sized from the LITERAL stroke width, never from `styles.strokeWidth`: that
    // can now be `var(--grafloria-numbers-emphasis, 3)` for a theme-bound link, and
    // `Number('var(…)')` is NaN — which would silently produce an unclickable link.
    // Shared formula with the interaction layer's grab distance — the painted
    // invitation and the accepted press must be the same geometry.
    const hitAreaWidth = linkHitAreaWidth(
      linkLiterals.strokeWidth,
      this.config.linkHitAreaWidth
    );
    const hitAreaVNode: VNode | null = this.config.linkHitAreaWidth > 0
      ? {
          type: 'path',
          props: {
            d: jumpPathData ?? pathData,
            fill: 'none',
            stroke: 'transparent',
            strokeWidth: hitAreaWidth,
            pointerEvents: 'stroke',
            className: 'link-hit-area',
          },
        }
      : null;

    // Wave 4 (Edges & links) — Card 5: a LINK TEMPLATE replaces the link's
    // visuals wholesale (path, arrows, labels) with whatever the author's
    // template returns — arbitrary SVG, or HTML through a foreignObject.
    //
    // What it does NOT replace: the `<g data-link-id>` wrapper and the invisible
    // hit-area stroke. Those are the renderer's contract with the rest of the
    // system (hit testing, selection, the edge toolbar, the reconnection
    // handles), and a template that dropped them would silently break all four.
    const templateVNodes = this.renderLinkTemplate(link, points, jumpPathData ?? pathData, styles, lod);
    if (templateVNodes) {
      const templated: VNode = {
        type: 'g',
        key: `link-${link.id}`,
        props: {
          className: 'link-group link-group-templated',
          'data-link-id': link.id,
          // wave6/a11y: a TEMPLATED link is still an edge. It gets the same
          // semantics as a plain one — a custom template must not silently cost
          // the user their screen-reader description of the connection.
          ...this.linkAriaProps(link),
        },
        children: [...(hitAreaVNode ? [hitAreaVNode] : []), ...templateVNodes],
      };
      if (this.config.enableCaching && !usesPaintServer) {
        this.cacheEntityVNode('link', link.id, cacheKey, templated, link);
      }
      return templated;
    }

    const vnode: VNode = {
      type: 'g',
      key: `link-${link.id}`,
      props: {
        className: 'link-group',
        // Wave 3 (Edges & links): identify the link in the DOM. VNode `key` is
        // a VDOM-reconciliation concept and is NOT emitted as an attribute, so
        // without this there is no way to find a link's RENDERED <path> — which
        // is what the edge toolbar anchors to (the model's `segments` go stale;
        // the rendered path is the truth, curves and rounded corners included).
        'data-link-id': link.id,
        // wave6/a11y (card 0): "Edge from Start to Is order valid?, labelled yes".
        // Links emitted NO aria whatsoever before this wave.
        ...this.linkAriaProps(link),
      },
      children: [
        ...(hitAreaVNode ? [hitAreaVNode] : []),
        // wave6/a11y (card 7 / WCAG 1.4.1): a selected or highlighted link was
        // distinguished by stroke COLOUR alone. This adds the shape cue.
        ...this.renderLinkStateAffordances(link, jumpPathData ?? pathData),
        // Link path (with or without jump points)
        linkPathVNode,
        // Phase 1.1: Arrow markers using ArrowRenderer
        ...(this.lodAllows('decorations', lod)
          ? (() => {
              const arrows: VNode[] = [];

              // Render arrow head (at target end)
              if (arrowHeadStyle && arrowHeadStyle.type !== 'none') {
                const transform = `translate(${arrowTipPosition.x}, ${arrowTipPosition.y}) rotate(${angle})`;
                // Card 5: `'target'` tells a CUSTOM marker which end it is on —
                // an asymmetric marker (a half-arrow, a crow's foot) has to know.
                const arrowHeadVNode = this.arrowRenderer.renderArrow(arrowHeadStyle, transform, this.theme.colors.background.default, 'target');
                if (arrowHeadVNode) {
                  arrows.push(arrowHeadVNode);
                }
              }

              // Render arrow tail (at source end) if specified
              if (arrowTailStyle && arrowTailStyle.type !== 'none') {
                // Calculate arrow tail position and angle (at source end)
                const tailArrowData = this.calculateArrowPositionAndAngle(link, points, false, this.arrowRenderer.getTipOffset(arrowTailStyle));
                const tailTransform = `translate(${tailArrowData.position.x}, ${tailArrowData.position.y}) rotate(${tailArrowData.angle})`;
                const arrowTailVNode = this.arrowRenderer.renderArrow(arrowTailStyle, tailTransform, this.theme.colors.background.default, 'source');
                if (arrowTailVNode) {
                  arrows.push(arrowTailVNode);
                }
              }

              return arrows;
            })()
          : []),
        // Phase 1.2: Multiple labels using LabelRenderer
        ...(this.lodAllows('labels', lod)
          ? (() => {
              const labelVNodes: VNode[] = [];

              // Render labels from link.labels array
              if (link.labels && link.labels.length > 0) {
                link.labels.forEach(label => {
                  // Wave 4 — Card 7: the optimizer's placement, when it placed
                  // this one. For a label that did not opt into `autoOffset` this
                  // IS the author's offset, so nothing moves.
                  const offset = this.frameLabelOffsets.get(`${link.id}::${label.id}`);
                  const labelVNode = this.labelRenderer.renderLabel(label, link, {
                    offset,
                    theme: this.theme,
                  });
                  if (labelVNode) {
                    labelVNodes.push(labelVNode);
                  }
                });
              }
              // Backward compatibility: support old metadata label
              else if (label) {
                // Convert old label format to new LinkLabel format
                const legacyLabel = {
                  id: 'legacy-label',
                  text: label,
                  position: 0.5,
                  offset: { x: 0, y: -10 },
                  style: {
                    fontSize: this.theme.typography.fontSize.sm,
                    color: this.theme.colors.text.primary,
                    background: this.theme.colors.background.surface
                  }
                };
                const labelVNode = this.labelRenderer.renderLabel(legacyLabel, link);
                if (labelVNode) {
                  labelVNodes.push(labelVNode);
                }
              }

              return labelVNodes;
            })()
          : []),
        // Phase 2: Link endpoint handles for reconnection
        ...(showHandles
          ? [
              // Source endpoint handle
              {
                type: 'circle',
                key: `link-${link.id}-source-handle`,
                props: {
                  cx: points[0].x,
                  cy: points[0].y,
                  r: 6,
                  fill: link.isSourceEndpointSelected
                    ? this.theme.colors.primary
                    : this.theme.colors.background.surface,
                  stroke: this.theme.colors.primary,
                  strokeWidth: 2,
                  className: 'link-endpoint-handle link-source-handle',
                  style: { cursor: 'move', transition: 'all 0.2s ease' },
                },
              } as VNode,
              // Target endpoint handle
              {
                type: 'circle',
                key: `link-${link.id}-target-handle`,
                props: {
                  cx: lastPoint.x,
                  cy: lastPoint.y,
                  r: 6,
                  fill: link.isTargetEndpointSelected
                    ? this.theme.colors.primary
                    : this.theme.colors.background.surface,
                  stroke: this.theme.colors.primary,
                  strokeWidth: 2,
                  className: 'link-endpoint-handle link-target-handle',
                  style: { cursor: 'move', transition: 'all 0.2s ease' },
                },
              } as VNode,
            ]
          : []),
        // Phase 2.3a: Waypoint handles for interactive editing
        ...(config.enableWaypointEditing && config.showWaypointHandles && isSelected && this.lodAllows('handles', lod)
          ? this.waypointEditor.renderWaypointHandles(link.points, link.id)
          : []),
        // Phase 2.3b: Control point handles for bezier curve editing
        ...(config.enableControlPointEditing && config.showControlPointHandles && isSelected && this.lodAllows('handles', lod) && link.segments && link.segments.length > 0
          ? this.controlPointEditor.renderControlPointHandles(link.segments, link.id)
          : []),
      ],
    };

    // Cache if enabled (use LOD-specific cache key to match the lookup above).
    // Never cache paint-server links — see the cache-read note above.
    if (this.config.enableCaching && !usesPaintServer) {
      this.cacheEntityVNode('link', link.id, cacheKey, vnode, link);
    }

    return vnode;
  }

  /**
   * Wave 4 (Edges & links) — Card 5: run this link's registered template, if it
   * named one. Returns null when the link has no template, when the name is not
   * registered, or when the template opted out by returning null — in every one
   * of those cases the link falls back to the built-in rendering rather than
   * vanishing.
   */
  private renderLinkTemplate(
    link: LinkModel,
    points: Array<{ x: number; y: number }>,
    pathData: string,
    styles: Record<string, unknown>,
    lod: LODLevel
  ): VNode[] | null {
    const name = link.style.template;
    if (!name) return null;

    const template = getLinkTemplate(name);
    if (!template) return null;

    const ctx: LinkTemplateContext = {
      link,
      points,
      pathData,
      styles,
      theme: this.theme,
      lod: String(lod),
      selected: link.state === 'selected',
    };

    const produced = template(ctx);
    if (!produced) return null;
    return Array.isArray(produced) ? produced : [produced];
  }

  // =========================================================================
  // Card 2: SVG paint servers (gradients / patterns / drop-shadow filters)
  // =========================================================================

  /**
   * Assemble the per-frame `<defs>` VNode from the registered paint servers.
   * Empty (`<defs/>`) when nothing needed a paint server this frame.
   */
  private buildDefsNode(): VNode {
    return {
      type: 'defs',
      key: 'defs',
      props: {},
      children: Array.from(this.frameDefs.values()),
    };
  }

  /**
   * Resolve a fill/stroke value to something an SVG `fill`/`stroke` accepts.
   * A colour string passes through unchanged; a gradient/pattern SPEC OBJECT is
   * registered as a deduped `<defs>` entry and returned as `url(#grafloria-def-…)`.
   */
  private resolvePaint(paint: string | PaintSpec | undefined): string | undefined {
    if (paint == null) return undefined;
    if (typeof paint === 'string') return paint;
    if (isPaintSpec(paint)) {
      // wave8/culling — Card 4: below the `gradients` tier a paint server
      // collapses to one representative colour. A four-stop gradient across a
      // 35x17px smudge is four stops the display cannot show — and the saving is
      // not the `<defs>` entry (that is deduped and cheap), it is that a flat
      // colour lets the entity back into the VNODE CACHE. Paint-server entities
      // deliberately bypass it (see nodeUsesPaintServer), so every gradient node
      // in the scene rebuilds its VNode from scratch on every single frame.
      if (!this.lodAllows('gradients', this.frameLod)) {
        return flattenPaint(paint);
      }
      const id = paintDefId(paint);
      if (!this.frameDefs.has(id)) {
        this.frameDefs.set(id, buildPaintServerVNode(id, paint));
      }
      return `url(#${id})`;
    }
    return undefined;
  }

  private resolveFill(fill: string | PaintSpec | undefined): string | undefined {
    return this.resolvePaint(fill);
  }

  private resolveStroke(stroke: string | PaintSpec | undefined): string | undefined {
    return this.resolvePaint(stroke);
  }

  /**
   * Resolve a `style.shadow` value to a `filter` attribute. The legacy boolean
   * is ignored here (its always-on drop-shadow VNode is unchanged); a Shadow
   * SPEC OBJECT registers a deduped `<filter>` and returns `url(#grafloria-def-…)`.
   */
  private resolveShadowFilter(shadow: boolean | Shadow | undefined): string | undefined {
    if (!isShadowSpec(shadow)) return undefined;
    // wave8/culling: a `<filter>` def is a paint server like any other, and it is
    // an SVG filter — the single most expensive thing you can ask a rasteriser
    // for. It goes when `gradients` goes, which is also what makes
    // `paintServersActive()` a true statement about the whole `<defs>` block and
    // therefore what makes the cache-bypass safe to lift. See paintServersActive.
    if (!this.paintServersActive()) return undefined;
    const id = paintDefId(shadow);
    if (!this.frameDefs.has(id)) {
      this.frameDefs.set(id, buildShadowFilterVNode(id, shadow));
    }
    return `url(#${id})`;
  }

  /**
   * A node/link whose RESOLVED style references a paint server must NOT be
   * served from (or written to) the vnode cache: the cached VNode carries the
   * url(#…) reference, but the matching `<defs>` entry is only registered while
   * the style is (re)computed — a cache hit would skip that and orphan the ref.
   *
   * RESOLVED, not raw: a gradient/pattern/shadow can now also arrive from a
   * named style or a theme type-default, not just from the entity's own style.
   */
  private nodeUsesPaintServer(node: NodeModel): boolean {
    if (!this.paintServersActive()) return false;
    const s = this.resolvedNodeStyle(node);
    return isPaintSpec(s.fill) || isPaintSpec(s.stroke) || isShadowSpec(s.shadow);
  }

  private linkUsesPaintServer(link: LinkModel): boolean {
    if (!this.paintServersActive()) return false;
    const s = this.resolvedLinkStyle(link);
    return isPaintSpec(s.stroke) || isShadowSpec(s.shadow);
  }

  /**
   * wave8/culling — Card 4. Whether THIS frame emits paint servers at all.
   *
   * THE INVARIANT: when this is false, NOTHING registers a `<defs>` entry —
   * `resolvePaint` returns a flat colour and `resolveShadowFilter` returns
   * undefined. They are the only two producers. So no VNode built this frame can
   * hold a `url(#…)`, and the cache-bypass that exists purely to keep such a ref
   * from being orphaned has nothing left to protect — which is precisely what
   * lets a gradient-heavy scene use the VNode cache at far zoom instead of
   * rebuilding every gradient node from scratch on every frame.
   *
   * Both producers must stay gated on THIS predicate. Gate one and not the other
   * and you get the original bug back: a cached VNode pointing at a def that was
   * never emitted.
   */
  private paintServersActive(): boolean {
    return this.lodAllows('gradients', this.frameLod);
  }

  // =========================================================================
  // The style cascade (themes/style-cascade.ts):
  //     theme  <  type-default  <  named-class  <  element-inline  <  state
  //
  // CSS mode leaves the THEME layer to the injected stylesheet — its values come
  // from this instance's `--grafloria-*` variables, so an unset property still falls
  // back to the theme (and a theme swap repaints it) instead of being frozen
  // into the VNode. Programmatic (Canvas) mode has no stylesheet, so the theme
  // joins the SAME ordered spread. One cascade, two emission targets.
  // =========================================================================

  /**
   * The cascade's answer for a node, with every `themeRef` turned into something
   * paintable and the entity's theme-boundness recorded.
   *
   * A node is theme-BOUND (i.e. a theme swap must restyle it) when it froze a
   * theme literal into its VNode. Three sources, all detected here rather than
   * assumed:
   *   - `theme.nodes[type]` supplied a type-default,
   *   - the STATE layer painted it (selected/highlighted/hovered/disabled/error),
   *   - a `themeRef` had to be baked to a literal (see materializeThemeRefs).
   */
  private resolvedNodeStyle(node: NodeModel): Partial<NodeStyle> {
    const resolved = resolveNodeStyle(node, this.theme, {
      includeThemeBase: !this.config.useCSSMode,
    });
    const { style, themeBound } = this.materializeThemeRefs<NodeStyle>(
      resolved,
      SVGRenderer.NODE_VAR_SAFE
    );

    if (themeBound || this.drawsThemeLiteral(node)) {
      this.themeBoundNodes.add(node.id);
    } else {
      this.themeBoundNodes.delete(node.id);
    }
    return style;
  }

  private resolvedLinkStyle(link: LinkModel): Partial<LinkStyle> {
    const resolved = resolveLinkStyle(link, this.theme, {
      includeThemeBase: !this.config.useCSSMode,
    });
    const { style, themeBound } = this.materializeThemeRefs<LinkStyle>(
      resolved,
      SVGRenderer.LINK_VAR_SAFE
    );

    // A link's ARROWHEAD is painted with presentation attributes and takes its
    // colour from the theme when the link sets no stroke of its own — so any link
    // that draws one is theme-bound, `themeRef` or not. (Found by reading the
    // arrow path, not by assuming: `color: styles.stroke || theme.colors.link.default`.)
    const drawsArrow = link.style.arrowHead?.type !== 'none' || !!link.style.arrowTail;
    if (themeBound || drawsArrow || this.linkDrawsThemeLiteral(link)) {
      this.themeBoundLinks.add(link.id);
    } else {
      this.themeBoundLinks.delete(link.id);
    }
    return style;
  }

  /**
   * Compute node styles for CSS mode
   */
  private computeNodeStylesCSS(node: NodeModel): any {
    const style = this.resolvedNodeStyle(node);
    const classes = ['diagram-node'];

    if (node.state.selected) classes.push('selected');
    // Attention emphasis (Card 1). Emitted alongside `selected`; selection wins
    // — in the cascade's state layer, and in the stylesheet fallback (where the
    // `.highlighted` rule is authored BEFORE `.selected`).
    if (node.state.highlighted) classes.push('highlighted');
    if (node.state.hovered) classes.push('hovered');
    if (!node.state.enabled) classes.push('disabled');
    if (node.state.error) classes.push('error');

    // Named styles (classDef): a marker class per applied name so hosts/tests can
    // see which ones landed. Their VALUES were already resolved into `style`.
    classes.push(...styleClassTokens(node.style.styleClass));

    // Free-form host classes ("className on every element")
    if (node.style.className) classes.push(node.style.className);

    // The model's own class set (NodeModel.addClass) — it has always existed and
    // was never rendered.
    if (node.classes?.size) classes.push(...node.classes);

    // Phase 1: Add animation classes
    // Use SVG-specific animations if node doesn't use foreignObject
    const useSVGVariant = !this.foreignObjectNodes.has(node.id);
    const animationClasses = this.animationService.getNodeAnimationClass(node, useSVGVariant);
    if (animationClasses) {
      classes.push(animationClasses);
    }

    const finalClassName = classes.join(' ');

    // CRITICAL: Don't apply strokeWidth as inline style if border animation is active
    // Inline styles override CSS animations, breaking animated stroke-width and stroke-dasharray
    const hasActiveBorderAnimation = style.animatedBorder && style.borderAnimationType !== 'none';

    // Card 2: fill/stroke may be a gradient/pattern spec object → url(#…);
    // shadow may be a Shadow spec → a drop-shadow filter reference.
    const resolvedFill = this.resolveFill(style.fill);
    const resolvedStroke = this.resolveStroke(style.stroke);
    const shadowFilter = this.resolveShadowFilter(style.shadow);

    return {
      className: finalClassName,
      // Everything the cascade resolved ABOVE the theme layer. Emitted on the
      // element (the shape registry hoists fill/stroke/strokeWidth into an inline
      // `style` string), which is what makes it beat the theme stylesheet.
      ...(resolvedFill && { fill: resolvedFill }),
      // Always apply stroke color (it doesn't interfere with animations)
      ...(resolvedStroke && { stroke: resolvedStroke }),
      // Only apply strokeWidth if no border animation is active
      ...(style.strokeWidth !== undefined && !hasActiveBorderAnimation && { strokeWidth: style.strokeWidth }),
      // Per-element opacity + corner radius survive in CSS mode too (previously
      // dropped, so translucent/rounded nodes fell back to theme defaults). No
      // `.diagram-node` stylesheet rule sets rx/opacity for normal nodes, so a
      // presentation attribute is enough; emit only when a layer actually set it,
      // so untouched props still fall back to the theme.
      ...(style.opacity !== undefined && { opacity: style.opacity }),
      ...(style.borderRadius !== undefined && { rx: style.borderRadius }),
      ...(shadowFilter && { filter: shadowFilter }),
    };
  }

  /**
   * Compute node styles for programmatic mode
   */
  private computeNodeStylesProgrammatic(node: NodeModel): any {
    // Same cascade, theme layer included (no stylesheet in this mode). State is
    // the top layer here too, so a selected node paints its selection colours
    // even when it carries its own fill — exactly as in CSS mode.
    const style = this.resolvedNodeStyle(node);
    const themeDefaults = this.theme.nodes.default;

    // Card 2: gradient/pattern fill/stroke → url(#…); Shadow spec → filter ref.
    const shadowFilter = this.resolveShadowFilter(style.shadow);

    return {
      fill: this.resolveFill(style.fill) || themeDefaults.fill,
      stroke: this.resolveStroke(style.stroke) || themeDefaults.stroke,
      strokeWidth: style.strokeWidth ?? themeDefaults.strokeWidth,
      rx: style.borderRadius ?? themeDefaults.borderRadius,
      opacity: style.opacity ?? themeDefaults.opacity,
      ...(shadowFilter && { filter: shadowFilter }),
    };
  }

  /**
   * Compute link styles for CSS mode
   */
  private computeLinkStylesCSS(link: LinkModel): any {
    const style = this.resolvedLinkStyle(link);
    const classes = ['diagram-link'];

    if (link.state === 'selected') classes.push('selected');
    // Attention emphasis (Card 1). Link state is exclusive, so this can't
    // co-occur with `selected`.
    if (link.state === 'highlighted') classes.push('highlighted');
    if (link.state === 'hovered') classes.push('hovered');

    // Named styles (classDef) + free-form host classes — see computeNodeStylesCSS.
    classes.push(...styleClassTokens(link.style.styleClass));
    if (link.style.className) classes.push(link.style.className);

    // Phase 1: Add animation classes
    const animationClasses = this.animationService.getEdgeAnimationClass(link);
    if (animationClasses) {
      classes.push(animationClasses);
    }

    // Card 2: gradient/pattern stroke → url(#…); Shadow spec → filter ref.
    const resolvedStroke = this.resolveStroke(style.stroke);
    const shadowFilter = this.resolveShadowFilter(style.shadow);

    // Everything the cascade resolved must WIN over the injected `.diagram-link`
    // rule. A presentation attribute (stroke="red", stroke-width="3") LOSES to
    // any stylesheet rule, so the resolved values ride an inline `style` string,
    // which beats it. `stroke` is ALSO kept as a prop for consumers that read
    // props.stroke (and for Canvas parity). Only properties a layer actually set
    // are emitted, so untouched props still fall back to the theme.
    const inlineStyle = [
      resolvedStroke !== undefined ? `stroke: ${resolvedStroke}` : '',
      style.strokeWidth !== undefined ? `stroke-width: ${style.strokeWidth}` : '',
      style.strokeDasharray !== undefined ? `stroke-dasharray: ${style.strokeDasharray}` : '',
      style.opacity !== undefined ? `opacity: ${style.opacity}` : '',
    ].filter(Boolean).join('; ');

    // …but the PROP becomes an ATTRIBUTE (`stroke="…"`), and an attribute cannot
    // hold a CSS variable. A theme-bound stroke resolves to `var(--grafloria-…)` for
    // the style string above; the attribute gets the LITERAL instead, so it stays
    // valid and remains usable by consumers that read `props.stroke`. The inline
    // style wins the cascade regardless, so the paint is still var-driven.
    const strokeAttr = this.attributeSafePaint(
      resolvedStroke,
      () => this.linkPaintLiterals(link).stroke
    );
    if (strokeAttr !== resolvedStroke) {
      // A literal was baked into the VNode → a theme swap has to re-render it.
      this.themeBoundLinks.add(link.id);
    }

    return {
      className: classes.join(' '),
      ...(strokeAttr && { stroke: strokeAttr }),
      ...(shadowFilter && { filter: shadowFilter }),
      ...(inlineStyle ? { style: inlineStyle } : {}),
    };
  }

  /**
   * Compute link styles for programmatic mode
   */
  private computeLinkStylesProgrammatic(link: LinkModel): any {
    const style = this.resolvedLinkStyle(link);
    const themeDefaults = this.theme.links.default;

    // Card 2: gradient/pattern stroke → url(#…); Shadow spec → filter ref.
    const shadowFilter = this.resolveShadowFilter(style.shadow);

    return {
      stroke: this.resolveStroke(style.stroke) || themeDefaults.stroke,
      strokeWidth: style.strokeWidth ?? themeDefaults.strokeWidth,
      strokeDasharray: style.strokeDasharray ?? themeDefaults.strokeDasharray,
      opacity: style.opacity ?? themeDefaults.opacity,
      ...(shadowFilter && { filter: shadowFilter }),
    };
  }

  /**
   * Generate SVG path data from points and segments
   * Supports both straight lines and bezier curves
   *
   * Wave 3: takes the link's `style` so a MANUAL-WAYPOINT path honours the same
   * per-link cornerRadius as an auto-routed one (the two path-emitting branches
   * of renderLink must not disagree about a link's corners).
   */
  private generatePathData(
    points: Array<{ x: number; y: number }>,
    segments?: any[],
    pathType?: string,
    style?: Partial<LinkStyle>,
    link?: LinkModel
  ): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    // -----------------------------------------------------------------------
    // Wave 6 — Card 2: a REGISTERED CONNECTOR owns the polyline → `d` step.
    //
    // `LinkConnectorName` is `'straight' | 'rounded' | 'smooth' | 'bezier' |
    // (string & {})` — that last arm publicly advertises custom connectors, but
    // the renderer's switch silently fell through to `link.pathType` for any
    // name it did not recognise. Setting `connector: 'my-connector'` produced no
    // error and no effect. It is a real registry now, consulted by name.
    //
    // The four BUILT-IN names are deliberately NOT in the registry: they remain
    // the renderer's own branches below, untouched, so nothing that already
    // worked changes.
    // -----------------------------------------------------------------------
    const custom = link ? this.customConnectorPath(link, points, style, pathType) : null;
    if (custom !== null) return custom;

    // If segments exist and contain curve information, use them
    if (segments && segments.length > 0 && segments[0].type === 'curve') {
      const segment = segments[0];
      let path = `M ${segment.from.x} ${segment.from.y}`;

      // Use cubic bezier curve (C command)
      if (segment.control1 && segment.control2) {
        path += ` C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.to.x} ${segment.to.y}`;
      } else {
        // Fallback to line if no control points
        path += ` L ${segment.to.x} ${segment.to.y}`;
      }

      return path;
    }

    // For orthogonal paths, use rounded corners (React Flow smoothstep style)
    if (pathType === 'orthogonal') {
      return this.convertOrthogonalPathWithBends(points, this.resolveCornerRadius(style, pathType));
    }

    // Smooth/bezier with manual waypoints: keep the curved identity
    if ((pathType === 'smooth' || pathType === 'bezier') && points.length > 2) {
      return this.catmullRomPath(points);
    }

    // Default: straight lines between points
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }

  /**
   * Grow the viewport before asking the engine which links intersect it.
   *
   * The link SpatialIndex is indexed on the link's straight-line endpoints plus
   * whatever route was last written back to `link.points`. A link that has never
   * been drawn (or that was re-routed around a new obstacle this very frame) can
   * bulge OUTSIDE that box: the detour lives in this renderer's per-frame
   * `frameRoutes` map and only lands in `link.points` once the link renders.
   *
   * Padding the query region by a margin makes the query a superset, so a link
   * whose detour swings into view is never culled a frame too early. Culling a
   * little too little costs a handful of VNodes; culling too much makes edges
   * blink out of existence.
   */
  private expandForLinkCulling(viewport: Rectangle): Rectangle {
    const margin = SVGRenderer.LINK_CULL_MARGIN;
    return {
      x: viewport.x - margin,
      y: viewport.y - margin,
      width: viewport.width + margin * 2,
      height: viewport.height + margin * 2,
    };
  }

  /**
   * Create empty diagram VNode
   */
  private createEmptyDiagram(viewport: Rectangle): VNode {
    return {
      type: 'svg',
      key: 'diagram-root',
      props: {
        width: viewport.width,
        height: viewport.height,
        className: 'grafloria-diagram',
        // Same instance scope as the real render root — an empty diagram that
        // later gains nodes must not swap its scoping attribute mid-flight.
        ...this.instanceScopeProps(),
      },
      children: [
        {
          type: 'g',
          key: 'links-layer',
          props: { className: 'links-layer' },
          children: [],
        },
        {
          type: 'g',
          key: 'nodes-layer',
          props: { className: 'nodes-layer' },
          children: [],
        },
        // Card 2: paint-server defs (empty for an empty diagram, kept for a
        // consistent root shape). Appended last to preserve children ordering.
        { type: 'defs', key: 'defs', props: {}, children: [] },
      ],
    };
  }

  /**
   * Inject this renderer's CSS.
   *
   * TWO stylesheets, deliberately:
   *   1. the SHARED rules (`generateBaseStyleSheet()` + the animation CSS) —
   *      theme-INDEPENDENT, written in `var(--grafloria-*)`, injected once per
   *      document and deduped by `GRAFLORIA_BASE_STYLE_ID`;
   *   2. this instance's VARIABLE BLOCK — `[data-grafloria-instance="grafloria-3"] { … }`
   *      in a `<style>` element whose id carries the instance id.
   *
   * That split is the fix: the old scheme keyed the element by THEME NAME and
   * re-emitted every rule with hex literals, so a second diagram with a second
   * theme repainted the first one, and disposing either renderer could remove
   * the other's stylesheet.
   */
  private injectThemeCSS(): void {
    // HEADLESS: no document, nothing to inject. This used to reach straight for
    // `document` and throw `ReferenceError` the moment an SVGRenderer was built in
    // Node — so SSR and export were impossible in the one library that advertises
    // being framework-agnostic. (AnimationService.injectCSS() already guarded; this
    // did not.) The renderer is pure (model + viewport → VNode tree) and the
    // stylesheet is only a browser delivery mechanism for the theme, so a server
    // render simply carries no <style> block — the VNode tree is identical either
    // way, because the styles are variables, not geometry. Headless consumers get
    // the theme through `export/`, which RESOLVES those variables into the output
    // instead of referencing them.
    if (!hasDocument()) return;

    this.ensureBaseStyleSheet();

    // Replace this instance's block (setTheme re-injects) — never another's.
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = undefined;
    }

    const styleId = this.getStyleElementId();
    document.getElementById(styleId)?.remove();

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent = this.generateThemeCSS();

    document.head.appendChild(this.styleElement);

    // The override block (token bridge + a11y media queries) must stay AFTER the
    // theme block — same selector, same specificity, so source order is the only
    // thing that decides. Re-appending it here is what keeps that true across a
    // re-injection, which moves the theme element to the end of <head>.
    this.injectOverrideCSS();
  }

  /**
   * This instance's OVERRIDE block: the host's design tokens, then the
   * accessibility media queries. Always present in CSS mode — even with no
   * bridge, because `prefers-contrast` and `forced-colors` are the FLOOR every
   * diagram gets, not an opt-in.
   */
  private injectOverrideCSS(): void {
    if (!this.config.useCSSMode) return;

    const overrideId = this.getOverrideElementId();
    this.overrideElement?.remove();
    document.getElementById(overrideId)?.remove();

    this.overrideElement = document.createElement('style');
    this.overrideElement.id = overrideId;
    this.overrideElement.textContent = generateInstanceOverrideCSS(this.tokenBridge, this.instanceId);

    document.head.appendChild(this.overrideElement);
  }

  /**
   * Inject the shared, theme-independent rules once per document. Every
   * renderer feeds the same rules from its own variable block.
   */
  private ensureBaseStyleSheet(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(GRAFLORIA_BASE_STYLE_ID)) return;

    const base = document.createElement('style');
    base.id = GRAFLORIA_BASE_STYLE_ID;
    // Theme rules first, animations second: animation declarations must still
    // win over any same-property theme declaration (unchanged from the old sheet).
    base.textContent = generateBaseStyleSheet() + '\n\n' + this.generateAnimationCSS();
    document.head.appendChild(base);
  }

  /** Drop the shared rules once the LAST instance's variable block is gone. */
  private releaseBaseStyleSheet(): void {
    if (typeof document === 'undefined') return;

    const remaining = document.querySelectorAll(
      `style[id^="${GRAFLORIA_INSTANCE_STYLE_PREFIX}"]`
    ).length;

    if (remaining === 0) {
      document.getElementById(GRAFLORIA_BASE_STYLE_ID)?.remove();
    }
  }

  /**
   * This renderer's theme CSS: the VARIABLE BLOCK, and nothing else.
   *
   * The rules that consume these variables are theme-independent and live in
   * the shared stylesheet (theme-css.ts). This block is the ONLY place a
   * theme's values are written, and it is scoped to this diagram's root — which
   * is what lets two diagrams with different themes coexist on one page.
   */
  private generateThemeCSS(): string {
    return generateInstanceVarBlock(this.theme, this.instanceId);
  }

  /**
   * The animation service — global animation enable/speed, reduced-motion and
   * battery-saver policy. Public because these are HOST decisions: the service
   * existed with a full config surface and no accessor, so nothing outside
   * this class could e.g. opt out of the battery auto-toggle
   * (`respectBatteryStatus: false`) — a laptop under 20% silently killed every
   * edge animation with no way back.
   */
  getAnimationService(): AnimationService {
    return this.animationService;
  }

  /**
   * Generate animation CSS
   * Phase 1: Includes edge animations, node border animations, and status animations
   */
  private generateAnimationCSS(): string {
    return `
/* Phase 1: Diagram Animations */

/* Edge Animations - Marching Ants */
@keyframes marching-ants {
  to { stroke-dashoffset: -20; }
}

.link-animated-marching-ants {
  stroke-dasharray: 5, 5;
  animation: marching-ants 1s linear infinite;
  will-change: stroke-dashoffset;
}

.link-animated-marching-ants.link-speed-slow {
  animation-duration: 2s;
}

.link-animated-marching-ants.link-speed-fast {
  animation-duration: 0.5s;
}

.link-animated-marching-ants.link-direction-reverse {
  animation-direction: reverse;
}

/* Edge Animations - Flow Dots */
@keyframes flow-dots {
  to { stroke-dashoffset: 10; }
}

.link-animated-flow {
  stroke-dasharray: 1, 9;
  animation: flow-dots 1s linear infinite;
  will-change: stroke-dashoffset;
}

.link-animated-flow.link-speed-slow {
  animation-duration: 2s;
}

.link-animated-flow.link-speed-fast {
  animation-duration: 0.5s;
}

.link-animated-flow.link-direction-reverse {
  animation-direction: reverse;
}

/* Edge Animations - Pulse */
@keyframes link-pulse {
  0%, 100% {
    opacity: 1;
    stroke-width: inherit;
  }
  50% {
    opacity: 0.6;
    stroke-width: calc(var(--link-stroke-width, 2px) * 1.5);
  }
}

.link-animated-pulse {
  animation: link-pulse 2s ease-in-out infinite;
  will-change: opacity, stroke-width;
}

.link-animated-pulse.link-speed-slow {
  animation-duration: 3s;
}

.link-animated-pulse.link-speed-fast {
  animation-duration: 1s;
}

/* Node Border Animations - Gradient */
@keyframes gradient-border {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}

.node-border-gradient {
  position: relative;
  background: white;
}

.node-border-gradient::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 25%, #667eea 50%, #764ba2 75%, #667eea 100%);
  background-size: 200% 100%;
  animation: gradient-border 3s linear infinite;
  z-index: -1;
  will-change: background-position;
}

/* Node Border Animations - Pulse Glow */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
}

.node-border-pulse {
  animation: pulse-glow 2s ease-in-out infinite;
  will-change: box-shadow;
}

/* Node Border Animations - Breathe */
@keyframes breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.9;
  }
}

.node-border-breathe {
  animation: breathe 3s ease-in-out infinite;
  transform-origin: center center;
  will-change: transform, opacity;
}

/* Node Border Animations - Shimmer */
@keyframes shimmer {
  0% { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}

.node-border-shimmer::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%);
  background-size: 50% 100%;
  animation: shimmer 2s infinite;
  pointer-events: none;
  will-change: background-position;
}

/* Status Animations - Running */
@keyframes status-running {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(52, 152, 219, 0.7);
    border-color: #3498db;
  }
  50% {
    box-shadow: 0 0 0 10px rgba(52, 152, 219, 0);
    border-color: #5dade2;
  }
}

.node-status-running {
  animation: status-running 1.5s ease-in-out infinite;
  will-change: box-shadow, border-color;
}

/* Status Animations - Error (Shake) */
@keyframes status-error {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.node-status-error {
  animation: status-error 0.5s ease-in-out;
  border-color: #e74c3c;
  box-shadow: 0 0 10px rgba(231, 76, 60, 0.5);
  will-change: transform;
}

/* Status Animations - Completed */
@keyframes status-completed {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.node-status-completed {
  animation: status-completed 0.5s ease-out;
  border-color: #27ae60;
  opacity: 0.8;
  will-change: transform, opacity;
}

/* Status Animations - Warning (Flash) */
@keyframes status-warning {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(243, 156, 18, 0.2); }
}

.node-status-warning {
  animation: status-warning 1s ease-in-out 3;
  border-color: #f39c12;
  will-change: background-color;
}

/* Status Animations - Pending (Pulse) */
@keyframes status-pending {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.node-status-pending {
  animation: status-pending 2s ease-in-out infinite;
  will-change: opacity;
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .link-animated-marching-ants,
  .link-animated-flow,
  .link-animated-pulse,
  .node-border-gradient,
  .node-border-pulse,
  .node-border-breathe,
  .node-border-shimmer,
  .node-status-running,
  .node-status-error,
  .node-status-completed,
  .node-status-warning,
  .node-status-pending {
    animation: none !important;
  }
}

/* Animations Disabled */
.animations-disabled,
.animations-disabled * {
  animation: none !important;
  transition: none !important;
}

/* Performance Optimizations */
.link-animated-marching-ants,
.link-animated-flow,
.link-animated-pulse,
.node-border-gradient,
.node-border-pulse,
.node-border-breathe,
.node-border-shimmer {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  -webkit-perspective: 1000px;
  perspective: 1000px;
}
    `.trim();
  }

  /**
   * Subscribe to engine events
   */
  private subscribeToEngineEvents(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Listen for entity changes to invalidate cache.
    //
    // wave8/dirty: topology ALSO drops the cached frame. The mutation epoch would
    // already catch these (DiagramModel is itself a DiagramEntity and trackChanges
    // its own `nodes`/`links` maps), so this is the SECOND, independent channel —
    // deliberately redundant, because a missed invalidation here is a picture that
    // is wrong, and a spurious one is a frame we rebuild for nothing.
    const dropFrame = () => {
      this.vnodeCache.clear();
      this.invalidateFrame();
    };
    diagram.on('node:added', dropFrame);
    diagram.on('node:removed', dropFrame);
    diagram.on('link:added', dropFrame);
    diagram.on('link:removed', dropFrame);
    diagram.on('group:added', dropFrame);
    diagram.on('group:removed', dropFrame);
    // (`link:path-changed` needs no listener here: LinkModel.generatePath() now
    // markDirty()s the link, which is both more correct and bumps the epoch — see
    // the note there. It used to rewrite `points` in place and tell no one.)

    // Listen for interaction config changes (port visibility, etc.)
    this.engine.eventBus.on('config:interaction-changed', () => {
      this.vnodeCache.clear();
      this.invalidateFrame();
      // Mark all nodes dirty to ensure re-render with new config
      if (diagram) {
        diagram.getNodes().forEach(node => node.markDirty('config-changed'));
      }
    });
  }

  /**
   * Start FPS tracking
   */
  private startFPSTracking(): void {
    this.renderTimestamp = performance.now();

    // BUGFIX (wave 4): the interval handle was never stored and never cleared,
    // so EVERY SVGRenderer ever constructed leaked a 1 Hz timer holding a strong
    // reference to the renderer (and through it the engine + the whole VNode
    // cache) for the life of the page — disposing the renderer did not stop it.
    // In Node it also keeps the event loop alive forever, which is why the
    // headless/SSR and export paths could not be added without fixing this first.
    this.fpsInterval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - this.renderTimestamp) / 1000;
      this.fps = Math.round(this.frameCount / elapsed);
      this.frameCount = 0;
      this.renderTimestamp = now;
    }, 1000);

    // Node: an un-unref'd interval keeps the event loop alive, so a headless
    // export script would hang instead of exiting. The sampler is telemetry — it
    // must never be the reason a process stays up.
    (this.fpsInterval as unknown as { unref?: () => void })?.unref?.();
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: cache size * average VNode size
    const avgVNodeSize = 1024; // bytes
    return this.vnodeCache.size * avgVNodeSize;
  }

  /**
   * Calculate intersection point between a line segment and a rectangle
   * Used to position arrows at node boundaries instead of port centers
   */
  private calculateLineRectIntersection(
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  ): { x: number; y: number } | null {
    // Line direction vector
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    // Rectangle boundaries (BoundingBox uses left/top/right/bottom)
    const rectLeft = rect.left;
    const rectRight = rect.right;
    const rectTop = rect.top;
    const rectBottom = rect.bottom;

    // Check intersection with each edge of the rectangle
    const intersections: Array<{ x: number; y: number; distance: number }> = [];

    // Helper to check if point is on line segment
    const isOnSegment = (px: number, py: number): boolean => {
      const minX = Math.min(lineStart.x, lineEnd.x);
      const maxX = Math.max(lineStart.x, lineEnd.x);
      const minY = Math.min(lineStart.y, lineEnd.y);
      const maxY = Math.max(lineStart.y, lineEnd.y);
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    };

    // Check left edge (x = rectLeft)
    if (dx !== 0) {
      const t = (rectLeft - lineStart.x) / dx;
      const y = lineStart.y + t * dy;
      if (t >= 0 && t <= 1 && y >= rectTop && y <= rectBottom) {
        const dist = Math.sqrt((rectLeft - lineEnd.x) ** 2 + (y - lineEnd.y) ** 2);
        intersections.push({ x: rectLeft, y, distance: dist });
      }
    }

    // Check right edge (x = rectRight)
    if (dx !== 0) {
      const t = (rectRight - lineStart.x) / dx;
      const y = lineStart.y + t * dy;
      if (t >= 0 && t <= 1 && y >= rectTop && y <= rectBottom) {
        const dist = Math.sqrt((rectRight - lineEnd.x) ** 2 + (y - lineEnd.y) ** 2);
        intersections.push({ x: rectRight, y, distance: dist });
      }
    }

    // Check top edge (y = rectTop)
    if (dy !== 0) {
      const t = (rectTop - lineStart.y) / dy;
      const x = lineStart.x + t * dx;
      if (t >= 0 && t <= 1 && x >= rectLeft && x <= rectRight) {
        const dist = Math.sqrt((x - lineEnd.x) ** 2 + (rectTop - lineEnd.y) ** 2);
        intersections.push({ x, y: rectTop, distance: dist });
      }
    }

    // Check bottom edge (y = rectBottom)
    if (dy !== 0) {
      const t = (rectBottom - lineStart.y) / dy;
      const x = lineStart.x + t * dx;
      if (t >= 0 && t <= 1 && x >= rectLeft && x <= rectRight) {
        const dist = Math.sqrt((x - lineEnd.x) ** 2 + (rectBottom - lineEnd.y) ** 2);
        intersections.push({ x, y: rectBottom, distance: dist });
      }
    }

    // Return the intersection closest to lineEnd (the target point)
    if (intersections.length > 0) {
      intersections.sort((a, b) => a.distance - b.distance);
      return { x: intersections[0].x, y: intersections[0].y };
    }

    return null;
  }

  /**
   * Calculate the tangent angle at the end of a bezier curve
   * For a cubic bezier curve, the tangent at t=1 (endpoint) is determined by
   * the direction from the second control point (cp2) to the endpoint
   *
   * @param cp2 Second control point of the bezier curve
   * @param endpoint End point of the bezier curve
   * @returns Angle in degrees
   */
  private calculateBezierEndTangent(
    cp2: { x: number; y: number },
    endpoint: { x: number; y: number }
  ): number {
    const dx = endpoint.x - cp2.x;
    const dy = endpoint.y - cp2.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  /**
   * Get perpendicular angle from port side
   * Used for orthogonal routing to ensure arrows are perpendicular to node edges
   *
   * @param portSide Port side ('left' | 'right' | 'top' | 'bottom')
   * @returns Angle in degrees pointing away from the node
   */
  private getPerpendicularAngleFromPortSide(portSide: 'left' | 'right' | 'top' | 'bottom'): number {
    switch (portSide) {
      case 'left':
        return 180; // Arrow points left
      case 'right':
        return 0;   // Arrow points right
      case 'top':
        return -90; // Arrow points up
      case 'bottom':
        return 90;  // Arrow points down
    }
  }

  /**
   * Calculate arrow direction based on routing algorithm and path geometry
   * Implements research-based best practices for each algorithm type
   *
   * @param algorithm Routing algorithm used
   * @param pathType Path type (bezier, smooth, straight, etc.)
   * @param points Path points
   * @param portSide Port side for orthogonal routing (optional)
   * @returns Angle in degrees
   */
  private calculateArrowDirection(
    algorithm: RoutingAlgorithm,
    pathType: string,
    points: Array<{ x: number; y: number }>,
    portSide?: 'left' | 'right' | 'top' | 'bottom'
  ): number {
    // Handle bezier/smooth paths - calculate tangent from bezier control point
    // For 2-point bezier, the control point cp2 determines the tangent at the endpoint
    if (pathType === 'bezier' || pathType === 'smooth') {
      if (points.length === 2) {
        // For 2-point bezier/smooth, use port side to determine arrow direction
        // This ensures the arrow points in the correct direction based on the port's orientation
        if (portSide) {
          // getPerpendicularAngleFromPortSide returns angle pointing OUT from port
          // But arrows need to point INTO the port, so reverse by adding 180°
          const outwardAngle = this.getPerpendicularAngleFromPortSide(portSide);
          return (outwardAngle + 180) % 360;
        }

        // Fallback: Calculate control point cp2 (same logic as convertRoutedPathToSVG at line 819-828)
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const controlDistance = Math.min(distance / 2, 100);

        // cp2 is controlDistance pixels to the left of the endpoint (horizontal approach)
        const cp2x = points[1].x - controlDistance;
        const cp2y = points[1].y;

        // Calculate tangent from cp2 to endpoint
        const tangentDx = points[1].x - cp2x;
        const tangentDy = points[1].y - cp2y;
        return Math.atan2(tangentDy, tangentDx) * (180 / Math.PI);
      } else if (points.length > 2) {
        // Multiple points: use last segment
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2];
        const dx = lastPoint.x - secondLastPoint.x;
        const dy = lastPoint.y - secondLastPoint.y;
        return Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }

    // For orthogonal and all other algorithms (straight, a-star, dijkstra, visibility-graph, custom):
    // Use last segment direction for accurate arrow pointing
    // CRITICAL FIX: Orthogonal arrows must follow the actual path direction, not the port side
    // This ensures arrows point in the direction the path is traveling when it reaches the port
    if (points.length >= 2) {
      const lastPoint = points[points.length - 1];
      const secondLastPoint = points[points.length - 2];
      const dx = lastPoint.x - secondLastPoint.x;
      const dy = lastPoint.y - secondLastPoint.y;
      return Math.atan2(dy, dx) * (180 / Math.PI);
    }

    // Fallback: pointing right
    return 0;
  }

  /**
   * Calculate arrow position and angle for a link endpoint
   * Handles both source and target ends with algorithm-aware direction calculation
   *
   * @param link Link model
   * @param points Path points
   * @param isTarget True for target end, false for source end
   * @param arrowLength Length of arrow in pixels
   * @returns Object with position and angle
   */
  private calculateArrowPositionAndAngle(
    link: LinkModel,
    points: Array<{ x: number; y: number }>,
    isTarget: boolean,
    arrowLength: number
  ): { position: { x: number; y: number }; angle: number } {
    // Get the relevant port and its side. Resolve the node by cached id when
    // available, otherwise by searching for the port's owner — links built via
    // `new LinkModel()` may not carry node ids, and without the side the
    // bezier arrow falls into a horizontal-only fallback (arrows on top/bottom
    // ports rendered sideways).
    const diagram = this.engine.getDiagram();
    let portSide: 'left' | 'right' | 'top' | 'bottom' | undefined;

    // Smart connection points override the assigned port for this frame
    const smart = this.frameSmartSides.get(link.id);
    if (smart) {
      portSide = isTarget ? smart.target : smart.source;
    } else if (diagram) {
      const portId = isTarget ? link.targetPortId : link.sourcePortId;
      const nodeId = isTarget ? link.targetNodeId : link.sourceNodeId;
      if (portId) {
        let node = nodeId ? diagram.getNode(nodeId) : null;
        if (!node) {
          node = diagram.getNodes().find((n: NodeModel) => !!n.getPort(portId)) || null;
        }
        const port = node?.getPort(portId);
        if (port) {
          portSide = port.alignment.side;
        }
      }
    }

    // Card 0: the arrow's approach angle depends on the routed GEOMETRY.
    const algorithm = this.routerForLink(link);

    // Calculate arrow direction based on algorithm
    let pointsToUse = points;
    if (!isTarget) {
      // For source end, reverse the points to get the correct direction
      pointsToUse = [...points].reverse();
    }

    const angle = this.calculateArrowDirection(
      algorithm,
      this.renderPathType(link),   // Card 0: curve-tangent handling follows the CONNECTOR
      pointsToUse,
      portSide
    );

    // Calculate arrow position
    // Arrow polygon: '0,-5 10,0 0,5' (tip at x=10, base at x=0)
    // We want the tip to show at the port center
    //
    // Key insight: The arrow should extend OUTWARD from the node
    // - For smooth/bezier/straight: position arrow base outside node boundary
    // - For orthogonal: path endpoint is already offset, use it directly

    // Safety check: ensure points array is valid
    if (!points || points.length === 0) {
      console.warn(`Cannot calculate arrow position: points array is empty for link ${link.id}`);
      return { position: { x: 0, y: 0 }, angle: 0 };
    }

    const pathEndpoint = isTarget ? points[points.length - 1] : points[0];
    const angleRad = angle * (Math.PI / 180);

    // Strategy: Position the arrow TIP at the port center
    // The arrow base will be arrowLength away in the opposite direction
    // This means the base is at: port - arrowLength * direction
    // Since the arrow points in 'angle' direction, base is at angle + 180°

    const position = {
      x: pathEndpoint.x + arrowLength * Math.cos(angleRad + Math.PI),
      y: pathEndpoint.y + arrowLength * Math.sin(angleRad + Math.PI)
    };

    return { position, angle };
  }

  /**
   * HIGH-PERFORMANCE: Create simple orthogonal segment between two points
   * Uses 3-point path: start -> corner -> end
   * Much faster than calling routing engine
   */
  private createOrthogonalSegment(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): Array<{ x: number; y: number }> {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    // If points are already aligned horizontally or vertically, use direct path
    if (dx === 0 || dy === 0) {
      return [start, end];
    }

    // Create L-shape: start -> corner -> end
    // Choose corner based on which direction is dominant
    if (dx > dy) {
      // Horizontal-first: go horizontal then vertical
      return [
        start,
        { x: end.x, y: start.y },  // Corner: horizontal from start
        end
      ];
    } else {
      // Vertical-first: go vertical then horizontal
      return [
        start,
        { x: start.x, y: end.y },  // Corner: vertical from start
        end
      ];
    }
  }

  /**
   * Wave 3 (Edges & links) — "jumps win over an oversized corner radius".
   *
   * buildPathWithJumps derives each segment's legal cut window from the corner
   * bends: `lo = bendPrev + 1`, `hi = segLen - bendNext - 1`. A big per-link
   * cornerRadius eats that window from both ends, so a jump-carrying segment
   * could silently lose its jump (`hi - lo < 3`).
   *
   * So: on segments that actually host a crossing, cap the radius at the value
   * that still leaves a full `size`-wide window —
   *   bendPrev + bendNext <= 2R  ⇒  R <= (segLen - 2 - reserves - size) / 2
   * — and NEVER tighten below the built-in default. Consequences:
   *   • a link at (or below) the default radius is bit-for-bit unchanged;
   *   • a large radius degrades toward the default only as far as the jumps
   *     need, instead of dropping arcs;
   *   • a segment too short for any jump at the DEFAULT radius keeps today's
   *     behaviour (the `hi - lo < 3` guard drops that one cut).
   */
  private cornerRadiusForJumps(
    points: Array<{ x: number; y: number }>,
    intersections: Array<{ t1: number; segmentIndex?: number }>,
    size: number,
    pathType: string,
    linkStyle: Partial<LinkStyle> | undefined,
    startReserve: number,
    endReserve: number
  ): number {
    const fallback = this.defaultCornerRadius(pathType);
    const requested = this.resolveCornerRadius(linkStyle, pathType);

    // A radius at/below the default can only WIDEN the window — nothing to clamp.
    if (requested <= fallback) {
      return requested;
    }

    const n = points.length;
    let limit = requested;

    for (let i = 0; i < n - 1; i++) {
      const hosts = intersections.some(
        it => (it.segmentIndex ?? 0) === i && it.t1 > 0 && it.t1 < 1
      );
      if (!hosts) continue;

      const segLen = this.distance(points[i], points[i + 1]);
      const reserves =
        (i === 0 ? startReserve : 0) + (i === n - 2 ? endReserve : 0);
      limit = Math.min(limit, (segLen - 2 - reserves - size) / 2);
    }

    return Math.max(fallback, Math.min(requested, limit));
  }

  /**
   * Build the link path from its polyline with jump geometry inserted.
   *
   * Works on the SAME point array the detector indexed (never re-parses the
   * rendered path string, whose rounded corners would shift segment indices).
   * Cuts ±size/2 around each crossing so the rendered jump is exactly `size`
   * wide, merges overlapping cuts, keeps cuts clear of corner bends, and uses
   * a constant sweep so every arc on a link bulges to the same side of travel.
   */
  private buildPathWithJumps(
    points: Array<{ x: number; y: number }>,
    intersections: Array<{ t1: number; segmentIndex?: number }>,
    config: { size?: number; style?: 'arc' | 'gap' | 'bridge' },
    pathType: string,
    startReserve = 0,
    endReserve = 0,
    linkStyle?: Partial<LinkStyle>
  ): string {
    const size = config.size ?? 10;
    const style = config.style ?? 'arc';
    const half = size / 2;
    const useBends = pathType === 'orthogonal' || pathType === 'smooth' || pathType === 'bezier';
    // Wave 3: per-link corner radius, clamped so the jump arcs keep a legal
    // window (see cornerRadiusForJumps). MUST stay a link-wide constant: the
    // bend at each corner is computed twice (as segment i's bendNext and
    // segment i+1's bendPrev) and the two have to agree, so it cannot be
    // varied per segment.
    const cornerRadius = this.cornerRadiusForJumps(
      points, intersections, size, pathType, linkStyle, startReserve, endReserve
    );
    const n = points.length;
    const fmt = (v: number) => +v.toFixed(3);
    let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

    for (let i = 0; i < n - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1e-6) continue;
      const ux = (b.x - a.x) / segLen;
      const uy = (b.y - a.y) / segLen;

      // Rounded bends consume the ends of interior segments
      let bendPrev = 0;
      let bendNext = 0;
      if (useBends) {
        if (i > 0) bendPrev = Math.min(this.distance(points[i - 1], a) / 2, segLen / 2, cornerRadius);
        if (i < n - 2) bendNext = Math.min(segLen / 2, this.distance(b, points[i + 2]) / 2, cornerRadius);
      }

      // Legal cut window on this segment: clear of the corner bends, and of
      // the arrow markers on the terminal segments
      const lo = bendPrev + 1 + (i === 0 ? startReserve : 0);
      const hi = segLen - bendNext - 1 - (i === n - 2 ? endReserve : 0);
      const merged: Array<{ s: number; e: number }> = [];
      const cuts = intersections
        .filter(it => (it.segmentIndex ?? 0) === i && it.t1 > 0 && it.t1 < 1)
        .map(it => ({ s: it.t1 * segLen - half, e: it.t1 * segLen + half }))
        .sort((p, q) => p.s - q.s);
      for (const c of cuts) {
        // Shift the cut into the legal window instead of dropping it — a
        // crossing right next to a bend or an arrowhead still gets its jump,
        // just nudged along the segment
        if (hi - lo < 3) continue; // genuinely no room on this segment
        const width = Math.min(c.e - c.s, hi - lo);
        const s = Math.max(lo, Math.min(c.s, hi - width));
        const e = s + width;
        const last = merged[merged.length - 1];
        if (last && s <= last.e) {
          last.e = Math.max(last.e, e);
        } else {
          merged.push({ s, e });
        }
      }

      const at = (dist: number) => ({ x: fmt(a.x + ux * dist), y: fmt(a.y + uy * dist) });

      for (const c of merged) {
        const p1 = at(c.s);
        const p2 = at(c.e);
        d += ` L ${p1.x} ${p1.y}`;
        if (style === 'gap') {
          d += ` M ${p2.x} ${p2.y}`;
        } else if (style === 'bridge') {
          // Rise perpendicular to the left of travel (screen-up when moving right)
          const px = uy;
          const py = -ux;
          const h = size / 2;
          d += ` L ${fmt(p1.x + px * h)} ${fmt(p1.y + py * h)}`;
          d += ` L ${fmt(p2.x + px * h)} ${fmt(p2.y + py * h)}`;
          d += ` L ${p2.x} ${p2.y}`;
        } else {
          const r = fmt((c.e - c.s) / 2);
          d += ` A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
        }
      }

      if (i < n - 2 && useBends && bendNext > 0) {
        const before = at(segLen - bendNext);
        const next = points[i + 2];
        const outLen = Math.hypot(next.x - b.x, next.y - b.y) || 1;
        const after = {
          x: fmt(b.x + ((next.x - b.x) / outLen) * bendNext),
          y: fmt(b.y + ((next.y - b.y) / outLen) * bendNext),
        };
        d += ` L ${before.x} ${before.y} Q ${fmt(b.x)} ${fmt(b.y)} ${after.x} ${after.y}`;
      } else {
        d += ` L ${fmt(b.x)} ${fmt(b.y)}`;
      }
    }

    return d;
  }

  /**
   * Manual waypoints are an explicit editor action (flagged via metadata by the
   * interaction layer), never inferred from point count — auto-routed
   * orthogonal paths also have >2 points.
   */
  private linkHasManualWaypoints(link: LinkModel): boolean {
    return link.getMetadata('hasManualWaypoints') === true &&
      !!link.points && link.points.length > 2;
  }

  /**
   * Keep link.points in sync with the rendered route on every frame so hit
   * testing and jump-point detection see current geometry. Direct assignment
   * (no setPoints) to avoid emitting link:changed and re-render loops.
   *
   * That silence is also why we re-index the link by hand: the diagram's link
   * SpatialIndex — which now drives viewport culling — only hears about geometry
   * through events, so without this its grid cells would still describe the route
   * the link had when it was added, and a detoured link could be culled.
   */
  private syncLinkPoints(link: LinkModel, points: Array<{ x: number; y: number }>): void {
    // NOTE (wave8/dirty): deliberately does NOT decide whether the frame "moved
    // geometry". THREE writers call this within a single frame — the local
    // router, the global solver, and channel nudging — and each overwrites the
    // last. An intermediate write that differs from the previous frame's FINAL
    // points is not a change; it is a step on the way to the same answer. Keying
    // the frame gate on it meant the gate never re-armed once the global solver
    // was in play (the local router rewrites the link, then the solver puts its
    // own route straight back), so the canvas churned forever and an idle frame
    // never became free. That verdict belongs to markLinksWhoseFrameChanged,
    // which runs after every writer and compares NET change.
    link.points = points.map(p => ({ ...p }));
    this.engine.getDiagram()?.refreshLinkBounds(link);
  }

  /**
   * Compute the auto route for a link.
   *
   * pathType determines the base routing algorithm ('orthogonal' → orthogonal
   * router; direct/smooth/bezier → straight router). If a straight route would
   * cross the link's own nodes (inverted geometry) or any obstacle, it falls
   * back to the orthogonal router, which respects port directions and A*
   * obstacle avoidance — links must never run through node bodies.
   */
  /**
   * Wave 5 — Card 6: the group facts a route needs. Pure derivation from the
   * diagram's group state; feature-tolerant (a diagram with no groups pays one
   * empty array read).
   */
  private collectGroupRouting(
    diagram: ReturnType<DiagramEngine['getDiagram']>,
    sourceNodeId: string | undefined,
    targetNodeId: string | undefined
  ): {
    hiddenByCollapse: Set<string>;
    groupBlocks: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    container?: { x: number; y: number; width: number; height: number };
  } {
    const hiddenByCollapse = new Set<string>();
    const groupBlocks: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    let container: { x: number; y: number; width: number; height: number } | undefined;

    const groups = diagram?.getGroups?.() ?? [];
    if (groups.length === 0) return { hiddenByCollapse, groupBlocks, container };

    const groupById = new Map(groups.map((g: any) => [g.id, g] as const));
    const isEffectivelyCollapsed = (g: any): boolean => {
      const guard = new Set<string>();
      let cur: any = g;
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        if (cur.isCollapsed) return true;
        cur = cur.parentGroupId ? groupById.get(cur.parentGroupId) : undefined;
      }
      return false;
    };
    const rectOf = (g: any) =>
      g.size
        ? { x: g.position.x, y: g.position.y, width: g.size.width, height: g.size.height }
        : g.bounds
          ? { ...g.bounds }
          : null;

    for (const g of groups as any[]) {
      const collapsed = isEffectivelyCollapsed(g);
      if (collapsed) {
        for (const memberId of g.members ?? []) hiddenByCollapse.add(memberId);
        // only VISIBLE collapsed groups block (nested-collapsed are hidden too);
        // and never block the link's own endpoint (a proxy link attaches to the
        // collapsed group exactly like a node).
        const rect = rectOf(g);
        if (g.isCollapsed && rect && g.id !== sourceNodeId && g.id !== targetNodeId) {
          groupBlocks.push({ id: g.id, ...rect });
        }
        continue;
      }
      // EXPANDED group containing both endpoints → soft containment. The
      // DEEPEST such group wins (rect area as the depth proxy — a child's rect
      // is smaller than its parent's).
      if (
        sourceNodeId && targetNodeId &&
        g.members?.has?.(sourceNodeId) && g.members?.has?.(targetNodeId)
      ) {
        const rect = rectOf(g);
        if (rect && (!container || rect.width * rect.height < container.width * container.height)) {
          container = rect;
        }
      }
    }

    // a hidden collapsed group's own block never made it in; also hide nested
    // group ids that appear as members
    return { hiddenByCollapse, groupBlocks, container };
  }

  /**
   * Wave 8 — Card 6: the frame's obstacle arrays, built ONCE.
   *
   * `computeAutoRoute` used to rebuild these per link: `getNodes()`, a filter, a
   * map — O(nodes) allocations for every link it routed, every frame. On the 10k
   * benchmark that is 10,000 objects × ~700 visible links = 7 million throwaway
   * rects per frame, before any routing happened at all.
   *
   * Two arrays, because the router needs two different sets:
   *   `routing` — what a link routes AGAINST (minus collapsed-away members);
   *   `all`     — every node, used by the own-node penetration fallback.
   *
   * The ARRAY IDENTITY matters as much as the contents: `RoutingEngine` memoises
   * its merged obstacle set and spatial index on it, so handing every link the
   * same array is what collapses N index builds into one.
   *
   * NOTE ON THE SOURCE/TARGET EXCLUSION — read before "fixing" this. The old
   * per-link build filtered the link's own two nodes out of the obstacle array.
   * That filter never did anything: `RoutingEngine.route()` unions the request's
   * obstacles with its GLOBAL obstacle map, and `DiagramEngine` registers every
   * node in that map, so both endpoint nodes came straight back in. Dropping the
   * filter is therefore behaviour-preserving (the union is identical), which is
   * why the 225-assertion line harness does not move.
   *
   * It is also a LATENT BUG, and a big one: because a link's own endpoints are
   * obstacles, the straight port-to-port path "collides" for essentially every
   * link, so essentially every link falls through to A* obstacle avoidance —
   * measured at 72/72 links on the benchmark scene. Making the exclusion real
   * would move routes across the whole product and is a routing-semantics
   * decision, not a performance one. Left as found, and now documented.
   */
  private frameObstacles(diagram: ReturnType<DiagramEngine['getDiagram']>): {
    nodes: NodeModel[];
    routing: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    all: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    blockIds: Set<string>;
  } {
    if (this.frameObstacleCache) return this.frameObstacleCache;

    const nodes: NodeModel[] = diagram ? diagram.getNodes() : [];
    const group = this.collectGroupRouting(diagram, undefined, undefined);

    const all: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    const routing: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    for (const node of nodes) {
      const rect = {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      };
      all.push(rect);
      if (!group.hiddenByCollapse.has(node.id)) routing.push(rect);
    }
    for (const block of group.groupBlocks) routing.push(block);

    this.frameObstacleCache = {
      nodes,
      routing,
      all,
      blockIds: new Set(group.groupBlocks.map((b) => b.id)),
    };
    return this.frameObstacleCache;
  }

  /**
   * The obstacle array this link routes against — the frame's shared array in
   * the overwhelming majority of cases.
   *
   * The one link that cannot use it is a PROXY LINK whose endpoint IS a collapsed
   * group: that link must not treat its own group block as a wall. Rare enough
   * to pay for a private array, and the group-block exclusion (unlike the node
   * one above) is worth preserving because a block is not necessarily in the
   * engine's global map.
   */
  private obstaclesForLink(
    frame: ReturnType<SVGRenderer['frameObstacles']>,
    groupInfo: ReturnType<SVGRenderer['collectGroupRouting']>,
    sourceNodeId: string | undefined,
    targetNodeId: string | undefined
  ): Array<{ id: string; x: number; y: number; width: number; height: number }> {
    const touchesBlock =
      (sourceNodeId !== undefined && frame.blockIds.has(sourceNodeId)) ||
      (targetNodeId !== undefined && frame.blockIds.has(targetNodeId));
    if (!touchesBlock) return frame.routing;

    return frame.routing.filter(
      (o) => !frame.blockIds.has(o.id) || (o.id !== sourceNodeId && o.id !== targetNodeId)
    );
  }

  /**
   * Card 4. The route for this link AT THIS TIER: the real one when the tier
   * renders `routing`, a direct polyline when it does not.
   *
   * The single door both the pre-pass and `renderLink`'s fallback go through, so
   * the two can never disagree about which geometry a frame is drawing. Note that
   * the pre-pass memoises AROUND this call and keys on `routingAllowed` — see
   * `routeKey`: the two routers are indistinguishable by their inputs alone.
   */
  private routeForLOD(
    link: LinkModel,
    endpoints: NonNullable<ReturnType<SVGRenderer['getLinkEndpoints']>>,
    routingAllowed: boolean
  ): RoutedPath | null {
    return routingAllowed
      ? this.computeAutoRoute(link, endpoints)
      : this.computeCoarseRoute(link, endpoints);
  }

  /**
   * The far-zoom route: a straight line from port to port. O(1).
   *
   * `computeAutoRoute` builds an obstacle rectangle for EVERY node in the diagram
   * for EVERY link, then searches against them — O(nodes) per edge, O(nodes x
   * edges) per frame. Measured on the Wave-8 benchmark that is 96% of a 1k frame
   * and 99% of a 5k one, and it is the whole of the 63-second 10k zoom-out.
   *
   * What it buys is a route that dodges node bodies. At the tiers this runs at,
   * a node body is a smudge and the dodge is sub-pixel — so we do not buy it.
   *
   * SELF-LOOPS still loop. `computeSelfLoopRoute` never touches the routing
   * engine (it is pure geometry, O(1) in the obstacle count), and a self-loop
   * flattened to a straight line degenerates into a stub inside its own node —
   * i.e. it would visually DISAPPEAR, which is a correctness loss, not a
   * fidelity one. Cheap work that keeps an edge visible is work worth doing.
   */
  private computeCoarseRoute(
    link: LinkModel,
    endpoints: NonNullable<ReturnType<SVGRenderer['getLinkEndpoints']>>
  ): RoutedPath | null {
    if (link.isSelfLoop()) {
      return this.computeSelfLoopRoute(link, endpoints);
    }

    const points = [
      { x: endpoints.start.x, y: endpoints.start.y },
      { x: endpoints.end.x, y: endpoints.end.y },
    ];

    return {
      points,
      totalLength: polylineLength(points),
      bendCount: 0,
    };
  }

  private computeAutoRoute(
    link: LinkModel,
    endpoints: NonNullable<ReturnType<SVGRenderer['getLinkEndpoints']>>
  ): RoutedPath | null {
    // Wave 4 — Card 4: a SELF-LOOP never touches the routing engine. Every router
    // excludes the link's own nodes from its obstacle set, so a route from a node
    // back to itself degenerated into a stub inside the node body.
    if (link.isSelfLoop()) {
      return this.computeSelfLoopRoute(link, endpoints);
    }

    const routingEngine = this.engine.getRoutingEngine();
    const algorithm = this.routerForLink(link) || routingEngine.getDefaultAlgorithm();

    const currentDiagram = this.engine.getDiagram();
    const sourceNodeId = (link as any).sourceNodeId || (link as any).source;
    const targetNodeId = (link as any).targetNodeId || (link as any).target;

    // Wave 5 — Card 6: group-aware obstacles.
    //   hiddenByCollapse — members of a collapsed group (any depth) are not
    //     visible, so routing around them produces inexplicable detours;
    //   groupBlocks — a visible collapsed group is ONE solid obstacle;
    //   container — both endpoints in the same expanded group biases the route
    //     to stay inside (soft, via the Manhattan container penalty).
    const groupInfo = this.collectGroupRouting(currentDiagram, sourceNodeId, targetNodeId);

    // Wave 8 — Card 6: the obstacle ARRAY is built once per frame, not once per
    // link. It used to be a filter+map over every node in the diagram, per link,
    // per frame — 10k allocations × 700 visible links on the 10k benchmark — and
    // the array's identity is also what lets the engine memoise its spatial index
    // instead of rebuilding one per link.
    const frame = this.frameObstacles(currentDiagram);
    const allNodes = frame.nodes;
    const obstacles = this.obstaclesForLink(frame, groupInfo, sourceNodeId, targetNodeId);

    let usedOrthogonal = algorithm === 'orthogonal';
    const routeWith = (algo: RoutingAlgorithm, avoid: boolean): RoutedPath | null =>
      routingEngine.route({
        start: endpoints.start,
        end: endpoints.end,
        sourceDirection: endpoints.sourceDirection,
        targetDirection: endpoints.targetDirection,
        obstacles,
        options: {
          algorithm: algo,
          avoidObstacles: avoid,
          gridSize: 10,
          // Card 1: per-link guaranteed port stub (undefined = legacy 20px best-effort)
          jetty: link.style.jetty,
          // Card 6: soft same-group containment (Manhattan honours it)
          container: groupInfo.container,
        },
      });

    let routedPath = routeWith(algorithm, true);

    // The straight router ignores obstacles AND the link's own nodes. If its
    // path cuts through any node body, reroute orthogonally instead.
    if (routedPath && algorithm === 'straight' && this.routeCrossesNodes(routedPath.points, link, allNodes)) {
      const detour = routeWith('orthogonal', true) || routeWith('orthogonal', false);
      if (detour) {
        routedPath = detour;
        usedOrthogonal = true;
      }
    }

    // Fallback: simple orthogonal routing
    if (!routedPath) {
      routedPath = routeWith('orthogonal', false);
      usedOrthogonal = !!routedPath;
    }

    // The engine's router can emit slanted port stubs (grid-snapped elbows vs
    // off-grid ports), diagonal middle segments and out-and-back retraces —
    // rectify so an orthogonal route is actually orthogonal.
    if (routedPath && usedOrthogonal) {
      routedPath = { ...routedPath, points: this.rectifyOrthogonalRoute(routedPath.points) };
    }

    // Last line of defence: a link must never run through its OWN nodes. If
    // the chosen route still does (routers exclude the endpoints' nodes from
    // their obstacle sets), retry with those nodes INCLUDED as obstacles and
    // keep whichever route penetrates less. When the two node bodies overlap
    // each other, some penetration is geometrically unavoidable — this keeps
    // it minimal instead of slashing straight through.
    //
    // Wave 8: was `allNodes.filter(...)` — a scan of the whole diagram, per link,
    // to find at most two nodes we already have ids for.
    const ownNodes: NodeModel[] = [];
    const srcNode = sourceNodeId ? currentDiagram?.getNode(sourceNodeId) : undefined;
    const tgtNode = targetNodeId ? currentDiagram?.getNode(targetNodeId) : undefined;
    if (srcNode) ownNodes.push(srcNode);
    if (tgtNode && tgtNode !== srcNode) ownNodes.push(tgtNode);

    if (routedPath && ownNodes.length > 0) {
      let bestPen = this.penetrationLength(routedPath.points, ownNodes);
      if (bestPen > 0) {
        // Wave 8: also hoisted — "every node as an obstacle" is the same array
        // for every link in the frame.
        const allObstacles = frame.all;

        const consider = (candidate: RoutedPath | null) => {
          if (!candidate) return;
          const rectified = { ...candidate, points: this.rectifyOrthogonalRoute(candidate.points) };
          const pen = this.penetrationLength(rectified.points, ownNodes);
          if (pen < bestPen) {
            bestPen = pen;
            routedPath = rectified;
          }
        };

        // Candidate 1: same ports, but the own nodes count as obstacles too
        consider(routingEngine.route({
          start: endpoints.start,
          end: endpoints.end,
          sourceDirection: endpoints.sourceDirection,
          targetDirection: endpoints.targetDirection,
          obstacles: allObstacles,
          options: { algorithm: 'orthogonal', avoidObstacles: true, gridSize: 10 },
        }));

        // Candidate 2 (overlapping bodies): escape each buried port by the
        // SHORTEST way out of whatever body covers it — often perpendicular
        // to the port side — then route between the escape points
        if (bestPen > 0) {
          const exitS = this.shortestEscape(endpoints.start, ownNodes);
          const exitT = this.shortestEscape(endpoints.end, ownNodes);
          const mid = routingEngine.route({
            start: exitS,
            end: exitT,
            obstacles: allObstacles,
            options: { algorithm: 'orthogonal', avoidObstacles: true, gridSize: 10 },
          });
          const midPts = mid?.points?.length ? mid.points : [exitS, exitT];
          consider({
            ...(mid ?? routedPath!),
            points: [endpoints.start, exitS, ...midPts, exitT, endpoints.end],
          });
        }
      }
    }

    // Wave 4 — Card 4: push the finished route onto its lane in the parallel
    // bundle. LAST, so separation applies to whatever the router (and every
    // detour/penetration fallback above) actually settled on. The endpoints are
    // never moved — only the interior — so the link still meets its ports.
    const offset = this.frameSeparation.get(link.id) ?? 0;
    if (routedPath && offset !== 0) {
      const separated = separateParallelRoute(
        routedPath.points,
        offset,
        this.bundleNormalFor(link),
        // Card 0: lane separation slides interior segments along their normals
        // only for elbow GEOMETRY — a property of the router, not the shorthand.
        this.isOrthogonalRouting(link) ? 'orthogonal' : this.renderPathType(link)
      );
      routedPath = {
        ...routedPath,
        points: separated,
        totalLength: polylineLength(separated),
        bendCount: Math.max(0, separated.length - 2),
      };
    }

    return routedPath;
  }

  /**
   * Shortest way OUT of whatever node bodies cover the point (used when a
   * port is buried inside the peer node because the two bodies overlap).
   * Marches the four axis rays and returns the nearest point that is outside
   * every covering body, with a small clearance.
   */
  private shortestEscape(
    point: { x: number; y: number },
    nodes: NodeModel[]
  ): { x: number; y: number } {
    const inset = 1;
    const rects = nodes.map(n => ({
      minX: n.position.x + inset, minY: n.position.y + inset,
      maxX: n.position.x + n.size.width - inset, maxY: n.position.y + n.size.height - inset,
    }));
    const covered = (p: { x: number; y: number }) =>
      rects.some(r => p.x > r.minX && p.x < r.maxX && p.y > r.minY && p.y < r.maxY);
    if (!covered(point)) return { ...point };

    const CLEAR = 4;
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let d = 2; d <= 600; d += 2) {
        const p = { x: point.x + ux * d, y: point.y + uy * d };
        if (!covered(p)) {
          const dist = d + CLEAR;
          if (dist < bestDist) {
            bestDist = dist;
            best = { x: point.x + ux * dist, y: point.y + uy * dist };
          }
          break;
        }
      }
    }
    return best ?? { ...point };
  }

  // Smart-connection side overrides for the current frame (visual only)
  private frameSmartSides = new Map<string, { source: 'left' | 'right' | 'top' | 'bottom'; target: 'left' | 'right' | 'top' | 'bottom' }>();

  /**
   * Point on the node's VISIBLE outline for a floating smart attachment:
   * the given side at the given cross-axis coordinate (world). Rects use the
   * bounding-box edge; ellipse/circle project analytically and hexagon/diamond
   * intersect the outline polygon, so the line never hovers off the drawn shape.
   */
  private shapeEdgePoint(
    node: NodeModel,
    rect: { x: number; y: number; w: number; h: number },
    side: 'left' | 'right' | 'top' | 'bottom',
    cross: number
  ): { x: number; y: number } {
    const type = (node.getMetadata('shape') || { type: 'rect' }).type;

    // Ask the shape registry for the outline point (ellipse/circle project
    // analytically; hexagon/diamond intersect the outline polygon). A null
    // result — rect, unknown shapes, or a degenerate vertex tangent — falls
    // through to the bounding-box edge.
    const pt = getShape(type).boundaryPoint(rect, side, cross);
    if (pt) return pt;

    return side === 'left' ? { x: rect.x, y: cross }
      : side === 'right' ? { x: rect.x + rect.w, y: cross }
      : side === 'top' ? { x: cross, y: rect.y }
      : { x: cross, y: rect.y + rect.h };
  }

  /**
   * The VISIBLE port on the given side closest to the ideal attachment point,
   * or null when the node shows no ports there (visibility resolves through
   * port config → node metadata → the global interaction strategy; only
   * 'always' counts — hover-revealed ports must not flip attachment mid-drag).
   */
  private nearestVisiblePort(
    node: NodeModel,
    side: 'left' | 'right' | 'top' | 'bottom',
    ideal: { x: number; y: number }
  ): { x: number; y: number } | null {
    const globalDefault = String(this.engine.getInteractionConfig().portVisibility).toLowerCase() as any;
    const world = node.getWorldPosition();
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const port of node.getPorts()) {
      if (port.alignment?.side !== side) continue;
      const vis = typeof (port as any).getEffectiveVisibility === 'function'
        ? String((port as any).getEffectiveVisibility(node, globalDefault)).toLowerCase()
        : globalDefault;
      if (vis !== 'always') continue;
      const local = getPortPositionForShape(port, node);
      const pos = { x: world.x + local.x, y: world.y + local.y };
      const dist = Math.hypot(pos.x - ideal.x, pos.y - ideal.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = pos;
      }
    }
    return best;
  }

  /**
   * The nearest port on a side regardless of visibility — the 'port-facing'
   * strategy's anchor source. Visibility must not steer ATTACHMENT: ports are
   * the node's connection anatomy whether or not their glyphs are drawn, and an
   * endpoint that jumps when a hover reveals them is worse than either state.
   */
  private nearestPortOnSide(
    node: NodeModel,
    side: 'left' | 'right' | 'top' | 'bottom',
    ideal: { x: number; y: number }
  ): { x: number; y: number } | null {
    const world = node.getWorldPosition();
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const port of node.getPorts()) {
      if (port.alignment?.side !== side) continue;
      const local = getPortPositionForShape(port, node);
      const pos = { x: world.x + local.x, y: world.y + local.y };
      const dist = Math.hypot(pos.x - ideal.x, pos.y - ideal.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = pos;
      }
    }
    return best;
  }

  /**
   * The link's own endpoint nodes (resolved via cached ids or port search).
   */
  private linkOwnNodes(link: LinkModel): NodeModel[] {
    const diagram = this.engine.getDiagram();
    if (!diagram) return [];
    const nodes: NodeModel[] = [];
    for (const [nodeId, portId] of [
      [link.sourceNodeId, link.sourcePortId],
      [link.targetNodeId, link.targetPortId],
    ] as const) {
      let node = nodeId ? diagram.getNode(nodeId) : null;
      if (!node && portId) {
        node = diagram.getNodes().find((n: NodeModel) => !!n.getPort(portId)) || null;
      }
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Smooth cubic spline (Catmull-Rom) through every route point — used so a
   * smooth/bezier link keeps its curved identity on multi-point detours
   * instead of visually turning into an orthogonal link.
   */
  private catmullRomPath(points: Array<{ x: number; y: number }>): string {
    const n = points.length;
    if (n === 0) return '';
    if (n === 1) return `M ${points[0].x} ${points[0].y}`;
    const fmt = (v: number) => +v.toFixed(2);
    let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[i - 1] ?? points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? points[n - 1];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
    }
    return d;
  }

  /**
   * Sample the Catmull-Rom spline into a polyline (for penetration checks —
   * the spline can overshoot corners beyond the route's own points).
   */
  private sampleCatmullRom(
    points: Array<{ x: number; y: number }>,
    stepsPerSegment = 8
  ): Array<{ x: number; y: number }> {
    const n = points.length;
    if (n < 3) return points;
    const out: Array<{ x: number; y: number }> = [points[0]];
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[i - 1] ?? points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? points[n - 1];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      for (let s = 1; s <= stepsPerSegment; s++) {
        const t = s / stepsPerSegment;
        const mt = 1 - t;
        out.push({
          x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p2.x,
          y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2.y,
        });
      }
    }
    return out;
  }

  /**
   * Total length of the polyline that lies inside the given node bodies
   * (rects inset by 1px so port-touch on the border doesn't count).
   */
  private penetrationLength(
    points: Array<{ x: number; y: number }>,
    nodes: NodeModel[]
  ): number {
    if (!points || points.length < 2) return 0;
    const inset = 1;
    let total = 0;
    for (const node of nodes) {
      const rect = {
        minX: node.position.x + inset,
        minY: node.position.y + inset,
        maxX: node.position.x + node.size.width - inset,
        maxY: node.position.y + node.size.height - inset,
      };
      for (let i = 0; i < points.length - 1; i++) {
        const clip = this.segmentRectClip(points[i], points[i + 1], rect);
        if (clip) {
          const segLen = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
          total += (clip.t1 - clip.t0) * segLen;
        }
      }
    }
    return total;
  }

  /**
   * Make an "orthogonal" route strictly orthogonal:
   * 1. absorb near-miss elbows into the exact endpoint axes (grid-snapped
   *    elbows sit up to gridSize/2 off the port, producing slanted stubs),
   * 2. split any remaining diagonal segment with a corner point,
   * 3. merge collinear runs, which also removes out-and-back retraces.
   */
  private rectifyOrthogonalRoute(
    points: Array<{ x: number; y: number }>
  ): Array<{ x: number; y: number }> {
    const EPS = 0.01;
    const SNAP = 6; // below the routing gridSize of 10
    if (!points || points.length < 2) return points;

    // 0) copy + drop consecutive duplicates
    let pts = points.map(p => ({ x: p.x, y: p.y }));
    pts = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > EPS || Math.abs(p.y - pts[i - 1].y) > EPS);
    if (pts.length < 2) return pts;

    // 1) endpoint absorption: shift the run of elbows adjacent to each
    //    endpoint onto the endpoint's own axis line
    const absorb = (idx: number, dir: 1 | -1) => {
      const anchor = pts[idx];
      const first = pts[idx + dir];
      if (!first) return;
      const dx = Math.abs(first.x - anchor.x);
      const dy = Math.abs(first.y - anchor.y);
      if (dy > EPS && dy <= SNAP && dx > dy) {
        // meant to be horizontal: lift the whole co-linear run onto anchor.y
        const oldY = first.y;
        for (let i = idx + dir; i >= 0 && i < pts.length; i += dir) {
          if (Math.abs(pts[i].y - oldY) > EPS) break;
          pts[i].y = anchor.y;
        }
      } else if (dx > EPS && dx <= SNAP && dy > dx) {
        const oldX = first.x;
        for (let i = idx + dir; i >= 0 && i < pts.length; i += dir) {
          if (Math.abs(pts[i].x - oldX) > EPS) break;
          pts[i].x = anchor.x;
        }
      }
    };
    absorb(0, 1);
    absorb(pts.length - 1, -1);

    // 2) orthogonalize: insert a corner for any remaining diagonal segment,
    //    continuing the previous segment's axis where one exists
    const ortho: Array<{ x: number; y: number }> = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = ortho[ortho.length - 1];
      const q = pts[i];
      const dx = Math.abs(q.x - prev.x);
      const dy = Math.abs(q.y - prev.y);
      if (dx > EPS && dy > EPS) {
        const before = ortho.length >= 2 ? ortho[ortho.length - 2] : null;
        const prevHorizontal = before ? Math.abs(prev.y - before.y) <= EPS : dx >= dy;
        ortho.push(prevHorizontal ? { x: q.x, y: prev.y } : { x: prev.x, y: q.y });
      }
      ortho.push({ x: q.x, y: q.y });
    }

    // 3) merge collinear runs (same axis, any direction) — keeps only the run
    //    endpoints, which removes backtracking stubs
    const merged: Array<{ x: number; y: number }> = [ortho[0]];
    for (let i = 1; i < ortho.length; i++) {
      const q = ortho[i];
      while (merged.length >= 2) {
        const a = merged[merged.length - 2];
        const b = merged[merged.length - 1];
        const sameH = Math.abs(b.y - a.y) <= EPS && Math.abs(q.y - b.y) <= EPS;
        const sameV = Math.abs(b.x - a.x) <= EPS && Math.abs(q.x - b.x) <= EPS;
        if (sameH || sameV) merged.pop(); else break;
      }
      if (Math.abs(q.x - merged[merged.length - 1].x) > EPS || Math.abs(q.y - merged[merged.length - 1].y) > EPS) {
        merged.push(q);
      }
    }
    return merged;
  }

  /**
   * True if any polyline segment passes through a node body. Node rects are
   * inset by 1px so a path legitimately touching the border at a port doesn't
   * count as a crossing.
   */
  private routeCrossesNodes(
    points: Array<{ x: number; y: number }>,
    link: LinkModel,
    nodes: NodeModel[]
  ): boolean {
    if (!points || points.length < 2) return false;
    const inset = 1;
    for (const node of nodes) {
      const rect = {
        minX: node.position.x + inset,
        minY: node.position.y + inset,
        maxX: node.position.x + node.size.width - inset,
        maxY: node.position.y + node.size.height - inset,
      };
      for (let i = 0; i < points.length - 1; i++) {
        if (this.segmentIntersectsRect(points[i], points[i + 1], rect)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Segment/rect intersection via Liang-Barsky clipping.
   */
  private segmentIntersectsRect(
    a: { x: number; y: number },
    b: { x: number; y: number },
    rect: { minX: number; minY: number; maxX: number; maxY: number }
  ): boolean {
    return this.segmentRectClip(a, b, rect) !== null;
  }

  /**
   * Liang-Barsky segment/rect clip — returns the parametric interval of the
   * segment that lies inside the rect, or null if it misses entirely.
   */
  private segmentRectClip(
    a: { x: number; y: number },
    b: { x: number; y: number },
    rect: { minX: number; minY: number; maxX: number; maxY: number }
  ): { t0: number; t1: number } | null {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const clip = (p: number, q: number): boolean => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    const hit =
      clip(-dx, a.x - rect.minX) &&
      clip(dx, rect.maxX - a.x) &&
      clip(-dy, a.y - rect.minY) &&
      clip(dy, rect.maxY - a.y) &&
      t0 < t1;
    return hit ? { t0, t1 } : null;
  }
}
