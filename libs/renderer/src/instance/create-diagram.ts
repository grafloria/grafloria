import { DiagramEngine, getMutationEpoch, exportDiagramText, importDiagramText, CommentStore } from '@grafloria/engine';
import { CommentOverlayController } from '../comments/comment-overlay';
import type {
  DiagramModel,
  LinkModel,
  LODLevel,
  NodeModel,
  ExportTextOptions,
  ImportTextOptions,
  ImportTextResult,
} from '@grafloria/engine';
import type { Theme } from '../types/theme.types';
import type { SVGRendererConfig } from '../types/renderer.interface';
import type { Rectangle } from '../types/geometry.types';
import type { ExportFormat, ExportOptions } from '../types/renderer.interface';
import type { ColorMode, ThemeSet } from '../themes/color-mode';
import type { TokenBridge } from '../themes/token-bridge';
import type { GovernorState } from '../perf/quality-governor';
import type { AnimationService } from '../services/animation.service';
import type { SvgExportResult } from '../export/svg-export';
import type { PdfExportResult } from '../export/pdf/pdf-export';
import type { CustomNodeCapture } from '../export/custom-nodes';
import { captureCustomNodeHost, stripResolvedImageWarnings } from '../export/capture-host';
import { collectAssetUrls, fetchAssetsTiered, inlineAssets } from '../export/assets';
import type { VNode } from '../types/vnode.types';
import { SVGRenderer } from '../svg/svg-renderer';
import type { DiagramRegistry } from '../ext/diagram-registry';
import { VNodePatcher } from '../vnode/patch';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import type { CanvasRect, Unsubscribe } from '../viewport/viewport-controller';
import { RenderScheduler } from './render-scheduler';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderOptions } from './dom-event-binder';
import { applyEdges, applyNodes, toNodeSpec, toEdgeSpec } from './model-input';
import type { EdgeSpec, NodeSpec } from './model-input';
import {
  HTML_LAYER_CLASS,
  INSTANCE_ATTR,
  ROOT_CLASS,
  ROOT_STYLE,
  SVG_LAYER_CLASS,
  SVG_LAYER_STYLE,
  htmlLayerStyle,
  nodeHostStyle,
} from './layers';
import type { HydrationSnapshot } from '../ssr/render-to-static';
import { isBrowser } from '../platform';
import { HtmlHostCuller } from '../lazy/host-culling';
import type { HostCullOptions } from '../lazy/host-culling';
import type { ViewLifecycle } from '../lazy/view-lifecycle';

/**
 * `createDiagram()` — the headless instance factory.
 *
 * Wave 3 fixed the CONTRACT (./diagram-instance.ts) and listed four blockers.
 * All four are now closed and this is the factory they were building towards:
 *
 *   1. VNode → DOM materializer  → `VNodePatcher`      (wave 3)
 *   2. DOM event binding         → `DomEventBinder`    (wave 4, this card)
 *   3. Render scheduling         → `RenderScheduler`   (wave 4, this card)
 *   4. Custom-node host callback → `renderCustomNode`  (wave 4, this card)
 *
 * Every framework wrapper in the workspace is now a thin shell over this: the
 * React `<GrafloriaFlow>` and the `<grafloria-flow>` custom element both do nothing but
 * (a) forward props into `setNodes`/`setEdges` and (b) turn `on(...)` events
 * into their own render signal. There is ZERO diagram logic in either.
 */

/** Nodes/edges may be handed in as plain specs or as live engine models. */
export type NodeInput = NodeSpec | NodeModel;
export type EdgeInput = EdgeSpec | LinkModel;

export interface DiagramEventMap {
  'nodes:change': { nodes: NodeModel[] };
  'edges:change': { edges: LinkModel[] };
  'selection:change': { nodes: NodeModel[]; edges: LinkModel[] };
  connect: { link: LinkModel };
  reconnect: { link: LinkModel; endpoint: 'source' | 'target' };
  'node:click': { node: NodeModel; world: { x: number; y: number } };
  'node:doubleclick': { node: NodeModel; world: { x: number; y: number } };
  'edge:click': { edge: LinkModel; world: { x: number; y: number } };
  'viewport:change': { viewport: Rectangle; zoom: number };
  ready: void;
}

export type DiagramEventName = keyof DiagramEventMap;
export type DiagramEventHandler<K extends DiagramEventName> = (
  payload: DiagramEventMap[K]
) => void;

export interface CreateDiagramOptions extends DomEventBinderOptions {
  nodes?: NodeInput[];
  edges?: EdgeInput[];
  theme?: Theme;

  /**
   * Follow the OS colour scheme instead of pinning `theme`.
   *
   * `'system'` upgrades to the high-contrast theme under `prefers-contrast: more`
   * or forced-colors, rather than flashing a light canvas at someone who asked
   * the operating system for neither.
   */
  colorMode?: ColorMode;
  /** The themes `colorMode` switches between. Defaults to `DEFAULT_THEME_SET`. */
  themes?: ThemeSet;
  /** Drive Grafloria's variables from the host's design tokens (shadcn/MUI/Tailwind). */
  tokenBridge?: TokenBridge;
  /**
   * The full renderer config, for every knob the ergonomic fields above do not
   * name: `connectionPoint` / `smartConnectionPoints` (floating edges),
   * `parallelLinks` + `parallelSpacing`, `channelNudging`, `jumpOwnership`,
   * `globalRouting`, `linkHitAreaWidth`. Every field was documented, consumed by
   * the renderer, and settable by NOBODY — the one factory that builds a renderer
   * for a host never passed the config on. The named fields above win over
   * anything set here, and `instanceId` is omitted because hydration owns it.
   */
  renderer?: Omit<SVGRendererConfig, 'instanceId'>;

  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Camera origin in world coordinates. */
  viewport?: { x: number; y: number };

  /** Attach to an existing engine instead of creating one. */
  engine?: DiagramEngine;
  /** Passed through to `new DiagramEngine({ interaction })`. */
  interaction?: Record<string, unknown>;
  /** Force the renderer's CSS scope (hydration does this for you). */
  instanceId?: string;
  /** Fit the camera to the content on mount. */
  fitView?: boolean;

  /**
   * Blocker #4: host hook for nodes that render as framework components rather
   * than SVG (`custom: true` / `metadata.useHTMLLayer`). The instance creates and
   * positions an absolutely-placed host element inside the HTML layer and hands
   * it to you; you own what goes inside it.
   *
   * RETURN A PROMISE IF YOU DRAW LATER. A painter that defers — to a
   * `requestAnimationFrame`, a `fetch`, a framework's async render, a web font — has
   * drawn nothing by the time a synchronous export reads the host, and its widget used
   * to come out as a marked box. Returning the promise is the SIGNAL that closes that:
   * `await diagram.export(…)` waits for exactly the painters that said they were not
   * done, and for nothing else — no polling and no fixed sleep. It is bounded by
   * {@link ExportOptions.customNodeTimeout} (default 5s) so a painter that never settles
   * cannot hang a print job, and a miss is WARNED about rather than silently blank.
   *
   * ```ts
   * renderCustomNode: async (node, el) => {
   *   const data = await fetch(`/api/widget/${node.id}`).then(r => r.json());
   *   el.append(chartFor(data));
   * }
   * ```
   *
   * Nothing else changes: the promise is ignored by the frame loop (a widget still
   * appears when it appears) and by `exportSvgString()` / `exportPdf()`, which are
   * synchronous by contract and report an unfinished painter instead of waiting. A
   * rejection is caught, reported, and never reaches the host as an unhandled rejection.
   */
  renderCustomNode?: (node: NodeModel, element: HTMLElement) => void | Promise<void>;
  /** Called before a custom node's host element is removed — unmount your component. */
  removeCustomNode?: (nodeId: string, element: HTMLElement) => void;

  /**
   * VIEWPORT-CULL the custom-node hosts: keep only the ones near the viewport in the
   * document. `true` for the defaults, or an options object (`margin`, `hysteresis`,
   * `mode` — see {@link HostCullOptions}).
   *
   * OFF by default, and that is not timidity. Every custom host has been permanently in
   * the document since custom nodes existed, and embedders are entitled to have built on
   * that: this workspace's own dashboard kit resolves a tile with
   * `container.querySelector('.grafloria-node-host[data-node-id=…]')`, and outside it there
   * are IntersectionObservers, React portal containers, third-party widget libraries that
   * cache a DOM reference at mount, and analytics that count nodes. Culling removes
   * elements from the document with no error and no visible diff, so switching it on by
   * default would break working apps on a version bump, silently, in exchange for a
   * performance win they did not ask for. A host with hundreds of widgets knows it has
   * hundreds of widgets and can say so.
   *
   * The default MODE, once you are in, is the safe one: `'detach'` keeps the element and
   * re-appends it on re-entry, so `renderCustomNode` still mounts exactly once and
   * `removeCustomNode` does NOT fire on a cull.
   *
   * INTERACTION WITH ANYTHING THAT READS WIDGET CONTENT, stated because it is not obvious.
   * Culling never removes a host from `nodeHosts` in `'detach'` mode, only from the
   * document, so a consumer that walks the map (rather than querying the DOM) still sees
   * every widget it ever saw.
   *
   * EXPORT IS UNAFFECTED, in either mode, and this used to be untrue. A widget the camera
   * has never reached has never been painted and a detached one has no layout box, so an
   * export found nothing to capture for exactly the tiles a user had not scrolled to — and
   * this comment used to tell you to "pan or `fitView()` first", which is no answer at all
   * for a headless print job or a server-side thumbnailer. `export()` / `exportSvgString()`
   * / `exportPdf()` now FORCE-MATERIALIZE the hosts they need, read them, and put the
   * document back exactly as they found it (see `materializeCustomNodes` below for what
   * "put back" means per mode). Turning culling on cannot change what comes out of a file:
   * it is a performance knob, and a performance knob that lost data would not be one.
   *
   * An ASYNC painter materialized this way is waited for by `await export(…)` — and the
   * hosts an in-flight capture is holding are exempt from culling for exactly that long,
   * so a frame (or an animated pan) mid-export cannot empty the widget being read.
   */
  cullCustomNodes?: boolean | HostCullOptions;

  /**
   * Install a {@link ViewLifecycle} — freeze/unfreeze, `autoFreeze`, and the admission set
   * a {@link ProgressiveMounter} drives.
   *
   * The lazy subsystem has been fully built and fully tested since wave 8 and was
   * reachable only by constructing an `SVGRenderer` by hand — which `createDiagram()`
   * exists to stop you doing. Undefined keeps today's behaviour exactly: no gate, every
   * entity culling admits gets a view on the frame it is admitted.
   *
   * Custom-node culling honours it too: an explicitly frozen node releases its HTML host.
   */
  viewLifecycle?: ViewLifecycle;

  /**
   * Adopt a server-rendered snapshot instead of mounting fresh (Card 6).
   * Pass the `snapshot` returned by `renderToStaticSVG()`. The instance rebuilds
   * the identical model, renders the identical VNode tree, and ADOPTS the DOM
   * already in the container — no re-creation, no flash, no re-layout.
   */
  hydrate?: HydrationSnapshot;

  /**
   * Anchored comment threads. `true` creates a store (viewer `'local'`);
   * pass a `CommentStore` to share one (collab). Pins render into the VNode
   * tree via the comment overlay; read them back with `getCommentStore()`.
   */
  comments?: boolean | CommentStore;
  /** Viewer id for a `comments: true`-created store (default `'local'`). */
  commentsViewer?: string;
}

export interface DiagramInstance {
  setNodes(nodes: NodeInput[]): void;
  setEdges(edges: EdgeInput[]): void;
  getModel(): DiagramModel;
  getEngine(): DiagramEngine;
  /** The comment store, when `comments` was enabled; `null` otherwise. */
  getCommentStore(): CommentStore | null;

  on<K extends DiagramEventName>(event: K, handler: DiagramEventHandler<K>): Unsubscribe;
  off<K extends DiagramEventName>(event: K, handler: DiagramEventHandler<K>): void;

  readonly viewport: ViewportController;
  readonly interaction: InteractionController;

  /** Theme swap (re-injects this instance's CSS variable block only). */
  setTheme(theme: Theme): void;

  /**
   * Follow the OS colour scheme (`'system'`), or pin light/dark.
   *
   * `'system'` also honours `prefers-contrast: more` and forced-colors by
   * upgrading to the high-contrast theme — an accessibility preference outranks
   * an aesthetic one.
   */
  setColorMode(mode: ColorMode, themes?: ThemeSet): void;
  getColorMode(): ColorMode | undefined;
  /** Re-point Grafloria's CSS variables at the host design system's tokens. */
  setTokenBridge(bridge: TokenBridge | null | undefined): void;

  /**
   * Export the CURRENT view. `'svg'` returns SVG source; `'png' | 'jpeg' |
   * 'webp' | 'pdf'` return a `data:` URL.
   *
   * Pass `{ embedModel: true }` (PNG and SVG) and the diagram model rides inside
   * the artifact — the exported file re-opens as an editable diagram.
   *
   * THE ASYNC ONE, and the only one. If a custom node's `renderCustomNode` returned a
   * promise — "I draw later: a rAF, a fetch, a framework's render, a web font" — this
   * waits for it before reading the host, bounded by
   * {@link ExportOptions.customNodeTimeout}. The synchronous entry points below cannot,
   * and say so in their `warnings`. Read the fidelity report through
   * {@link ExportOptions.onWarnings}, which fires on every format.
   */
  export(format?: ExportFormat, options?: ExportOptions): Promise<string>;
  /**
   * Synchronous, DOM-free, deterministic. Carries `warnings`.
   *
   * Synchronous means a widget whose painter is still running is captured as it stands
   * and REPORTED, not waited for — `await export('svg')` is the entry point that waits.
   */
  exportSvgString(options?: ExportOptions): SvgExportResult;
  /** A real vector PDF: paths stay paths, text stays selectable text. */
  exportPdf(options?: ExportOptions): PdfExportResult;

  /** The LOD tier actually rendered, and the adaptive governor's last verdict. */
  getQualityState(): { tier: LODLevel; governor?: GovernorState };

  /** Frame all content. */
  fitView(padding?: number): void;

  /** Queue a repaint (coalesced into one frame). */
  render(): void;
  /** Repaint synchronously — use when you must measure right after a change. */
  renderNow(): void;

  /**
   * wave8/dirty — Card 1: apply many mutations as ONE frame.
   *
   * ```ts
   * diagram.batchUpdate((model) => {
   *   for (const n of model.getNodes()) n.setPosition(n.position.x + 10, n.position.y);
   * });
   * ```
   *
   * Two distinct things are coalesced, and they are coalesced in two different
   * places, which is worth being precise about:
   *
   *   - **Events.** `DiagramModel.beginBatch()` QUEUES its change events instead
   *     of firing them, so a thousand `setPosition()` calls do not walk a
   *     thousand listener chains on their way to the same rAF.
   *   - **Frames.** `RenderScheduler` folds every `schedule()` in a tick into one
   *     rAF callback, so the thousand mutations produce exactly one `render()`
   *     and one `reconcile()` — one patch, not a thousand.
   *
   * Nesting is depth-counted (it bottoms out in `DiagramEntity`), so a batch
   * inside a batch is still one frame. `mutate` throwing does not strand the
   * model in batch mode.
   *
   * It never paints synchronously — that is the point. If you need the DOM to be
   * correct before you measure it, follow with `renderNow()`.
   */
  batchUpdate(mutate: (model: DiagramModel) => void): void;

  /**
   * The renderer's animation service. Host policy lives here: global
   * enable/speed, reduced-motion overrides, and the battery-saver auto-toggle
   * (`updateConfig({ respectBatteryStatus: false })` to opt out — on by
   * default, and on a low unplugged battery it disables edge animations).
   */
  animations: AnimationService;

  /**
   * Mermaid-compatible text export (with the lossless sidecar by default) —
   * feed the result back to `loadText` for a full round-trip.
   */
  exportText(options?: ExportTextOptions): string;

  /**
   * Parse Mermaid-compatible text (sidecar-aware) and reconcile it INTO the
   * live diagram through the same spec reconciler `setNodes`/`setEdges` use —
   * listeners, plugins, and the renderer all stay attached.
   */
  loadText(text: string, options?: ImportTextOptions): ImportTextResult;

  dispose(): void;

  /**
   * Wave 6 — Card 3: the nodes currently being dragged (past the movement
   * threshold). Custom node components receive this as the `dragging` prop.
   */
  getDraggingNodeIds(): string[];

  /**
   * THIS diagram's contribution registry — shapes, named styles, link/label
   * templates, markers, anchors, connection points, connectors, animations.
   *
   * The module-level `registerShape()` / `defineStyle()` / … remain the
   * PROCESS-WIDE registry and still work exactly as before; this one shadows it
   * for this diagram only. That distinction is the whole reason it exists: the
   * registries used to be module-scope `Map`s, so two diagrams on one page could
   * not have different vocabularies, and unloading one diagram's extension
   * restored the registry to its pre-registration state — silently stripping the
   * shape out from under the diagram beside it.
   *
   * ```ts
   * editor.registry.registerShape('badge', badgeGeometry);   // editor only
   * preview.registry.registerShape('badge', otherGeometry);  // preview only
   * ```
   *
   * Pass it to `createExtensionHost({ …, registry: diagram.registry })` and every
   * extension that host loads contributes to this diagram alone.
   */
  readonly registry: DiagramRegistry;

  /** Escape hatches for hosts and tests. */
  readonly container: HTMLElement;
  readonly scheduler: RenderScheduler;
  readonly patcher: VNodePatcher;
}

type Listener = (payload: never) => void;

export function createDiagram(
  container: HTMLElement,
  options: CreateDiagramOptions = {}
): DiagramInstance {
  if (!isBrowser()) {
    // A clear failure beats a mysterious `document is not defined` five frames
    // deep. The server path is `renderToStaticSVG()`; the client then hydrates.
    throw new Error(
      'createDiagram() requires a browser DOM. On the server call renderToStaticSVG() ' +
        'and hydrate with createDiagram(el, { hydrate: snapshot }) in an effect.'
    );
  }

  const hydration = options.hydrate;
  const doc = container.ownerDocument;

  // -- engine + model ---------------------------------------------------------
  const engine =
    options.engine ??
    new DiagramEngine(
      options.interaction ? ({ interaction: options.interaction } as never) : {}
    );
  const model = engine.getDiagram() ?? engine.createDiagram('grafloria');

  // Wave 6 BUG FIX. This used to be `applyNodes(model, options.nodes ?? [])`.
  //
  // `applyNodes`/`applyEdges` are full RECONCILERS — anything not in the list is
  // REMOVED. So passing no `nodes` reconciled against the EMPTY list and silently
  // deleted every node already on the diagram. That made the documented
  // "attach to an existing engine" path (`createDiagram(el, { engine })`) wipe
  // the very diagram it was attaching to.
  //
  // Absent means "I am not managing this" — NOT "make it empty". A host that
  // really wants to clear the diagram passes `nodes: []` explicitly, which still
  // works.
  if (options.nodes) applyNodes(model, options.nodes);
  if (options.edges) applyEdges(model, options.edges);

  // -- camera -----------------------------------------------------------------
  const rect0 = container.getBoundingClientRect();
  const viewport = new ViewportController({
    viewport: {
      x: hydration?.viewport.x ?? options.viewport?.x ?? 0,
      y: hydration?.viewport.y ?? options.viewport?.y ?? 0,
      // Hydration MUST reuse the server's canvas size or the viewBox differs and
      // the very first client frame would re-lay-out the picture.
      width: hydration?.width ?? rect0.width ?? 800,
      height: hydration?.height ?? rect0.height ?? 600,
    },
    zoom: hydration?.zoom ?? options.zoom ?? 1,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom,
    zoomSensitivity: options.zoomSensitivity,
  });

  // -- layers -----------------------------------------------------------------
  const layers = ensureLayers(container, doc, hydration);

  // -- renderer + patcher -----------------------------------------------------
  // Wave 10 BUG FIX. This used to forward `instanceId` and NOTHING ELSE.
  //
  // `SVGRendererConfig` has carried `colorMode`, `themes` and `tokenBridge` for
  // two waves. `createDiagram()` is the ONLY way a host builds a renderer — so
  // dropping them here made all three unreachable, and with them:
  //
  //   - `colorMode: 'system'`, i.e. following the OS colour scheme at all, and
  //     the a11y upgrade where `prefers-contrast: more` / forced-colors promotes
  //     you to the high-contrast theme instead of flashing light at the user.
  //     The themes existed. The controller existed. Nothing could switch them on.
  //   - the shadcn / MUI / Tailwind design-token bridge — the whole point of
  //     which is that a HOST re-points Grafloria's variables at its own tokens.
  //
  // Three features, fully built and fully tested, lost in a five-line literal.
  const renderer = new SVGRenderer(
    engine,
    {
      // The general escape hatch first, so the ergonomic named fields below win over
      // anything the host also set through `renderer`.
      ...(options.renderer ?? {}),
      instanceId: hydration?.instanceId ?? options.instanceId,
      colorMode: options.colorMode ?? options.renderer?.colorMode,
      themes: options.themes,
      tokenBridge: options.tokenBridge,
      // "My picture improved with no model change — repaint me." Fired by the
      // async route solver's refinements and by motion-stable routing's settle
      // frame (a tween's provisional routes re-deciding once motion stops).
      // Neither has a model event to ride, so without this wire both improved
      // pictures were unreachable from a real instance: the renderer bumped its
      // invalidation epoch and nobody ever asked the scheduler for a frame.
      // Late-bound on purpose — `scheduler` is constructed below and this
      // callback only ever fires asynchronously, after mount. The host's own
      // callback (if any) is chained, not replaced.
      onRoutesRefined: () => {
        options.renderer?.onRoutesRefined?.();
        scheduler.schedule();
      },
    },
    options.theme
  );
  renderer.applyInstanceScope(layers.root);
  // The lazy subsystem (freeze / autoFreeze / progressive mount) has existed since wave 8
  // and was reachable only by building an `SVGRenderer` yourself — i.e. not from the
  // factory that every host actually uses. Absent leaves the renderer ungated, which is
  // exactly what it did before this line existed.
  if (options.viewLifecycle) renderer.setViewLifecycle(options.viewLifecycle);
  const patcher = new VNodePatcher({ document: doc });

  // -- events -----------------------------------------------------------------
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, payload: unknown): void => {
    const set = listeners.get(event);
    if (!set) return;
    // Copy: a handler is allowed to unsubscribe itself.
    for (const listener of [...set]) (listener as (p: unknown) => void)(payload);
  };

  // -- comments ---------------------------------------------------------------
  // The overlay hooks the renderer's comment source, so pins render inside the
  // VNode tree (they survive export and pan/zoom for free).
  let commentStore: CommentStore | null = null;
  let commentOverlay: CommentOverlayController | null = null;
  if (options.comments) {
    commentStore =
      options.comments === true
        ? new CommentStore(model, { viewer: options.commentsViewer ?? 'local' })
        : options.comments;
    commentOverlay = new CommentOverlayController(commentStore, renderer);
  }

  // -- interaction ------------------------------------------------------------
  const interaction = new InteractionController();
  interaction.syncWithEngineConfig(engine);
  // The link grab distance derives from the renderer's interaction-stroke
  // width; a host override must reach BOTH sides or the painted hit-area and
  // the accepted press drift apart again.
  if (options.renderer?.linkHitAreaWidth !== undefined) {
    interaction.setLinkHitAreaWidth(options.renderer.linkHitAreaWidth);
  }

  const getRect = (): CanvasRect => container.getBoundingClientRect();

  const scheduler = new RenderScheduler({
    onFrame: () => paint(),
    shouldSkip: () => canSkipFrame(),
  });

  const binder = new DomEventBinder(
    container,
    {
      getEngine: () => engine,
      viewport,
      interaction,
      getRect,
      requestRender: () => scheduler.schedule(),
      emit,
    },
    options
  );

  // -- custom (HTML-layer) nodes ---------------------------------------------
  //
  // `nodeHosts` is the record of every host this instance OWNS — not of what is in the
  // document. In `'detach'` cull mode a culled host stays in this map with its element
  // parked off-document, which is what keeps the two teardown paths below (model removal,
  // and `dispose()`) correct without either of them learning that culling exists: a node
  // that is culled and then deleted still fires `removeCustomNode` exactly once, because
  // it never left the map.
  const nodeHosts = new Map<string, HTMLElement>();

  const culler = options.cullCustomNodes
    ? new HtmlHostCuller(
        options.cullCustomNodes === true ? {} : options.cullCustomNodes,
        renderer.getViewLifecycle()
      )
    : null;

  /**
   * Nodes a live gesture owns, which must never be culled out from under it.
   *
   * Built only when culling is on — a host that never opted in pays not even the Set.
   */
  const gestureHeld = (): ReadonlySet<string> => {
    const ids = new Set<string>(binder.getDraggingNodeIds());
    // Resize / rotate / vertex. `SelectionToolsController` keeps the gesture's node
    // private and these gestures are single-selection by construction, so the selection
    // is the available answer — and being a superset is the safe direction to be wrong in.
    if (binder.hasActiveGesture()) {
      for (const node of model.getSelectedNodes()) ids.add(node.id);
    }
    return ids;
  };

  /** The lifecycle the culler consults, read once so the export can consult it too. */
  const lifecycle = renderer.getViewLifecycle();

  /**
   * THE PAINT LEDGER — what an ASYNC `renderCustomNode` told us about itself.
   *
   * `pendingPaints` holds one entry per widget whose painter returned a promise that has
   * not settled; the entry deletes itself when it does. `paintFailures` remembers the ones
   * that rejected, so an export can say "its painter rejected: …" instead of the useless
   * "its host was empty".
   *
   * Both are keyed by node id and both are written ONLY on a first mount, because
   * `renderCustomNode` runs exactly once per host — so there is exactly one promise per
   * widget, ever, and re-attaching a culled host neither re-runs nor re-awaits anything.
   */
  const pendingPaints = new Map<string, Promise<void>>();
  const paintFailures = new Map<string, string>();

  const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function';

  /**
   * Record what a painter returned.
   *
   * The `.then` here is also what keeps a rejecting painter from surfacing as an unhandled
   * rejection in the host's console — we are the ones who asked for the promise, so we are
   * the ones who must handle it, whether or not an export ever happens.
   */
  const trackPaint = (id: string, result: unknown): void => {
    if (!isThenable(result)) return;
    try {
      const settled: Promise<void> = Promise.resolve(result).then(
        () => undefined,
        (error: unknown) => {
          paintFailures.set(id, error instanceof Error ? error.message : String(error));
        }
      );
      const entry = settled.then(() => {
        // Identity-checked: a 'destroy'-mode remount replaces the entry, and a stale
        // promise settling afterwards must not delete its successor.
        if (pendingPaints.get(id) === entry) pendingPaints.delete(id);
      });
      pendingPaints.set(id, entry);
    } catch {
      // A broken thenable is not worth taking a frame down for. It simply is not tracked,
      // and its widget degrades exactly as an unreadable host already does.
    }
  };

  /** World bounds of a custom node — the rect both the culler and the capture work in. */
  const nodeBounds = (node: NodeModel): Rectangle => ({
    x: node.position.x,
    y: node.position.y,
    width: node.size?.width ?? 0,
    height: node.size?.height ?? 0,
  });

  /**
   * Create-or-re-attach one custom node's host and place it.
   *
   * Shared by the frame loop and the export boundary deliberately: the two must agree
   * byte for byte on what a host is (the class, the `data-node-id`, the style, and above
   * all the mount-once rule that `renderCustomNode` fires only when the element is
   * created). Two copies of this would drift, and the drift would be silent.
   *
   * The element is put in `nodeHosts` and in the document BEFORE the painter runs, which
   * is what lets the export boundary undo a mount whose painter threw.
   */
  const mountHost = (node: NodeModel): void => {
    let host = nodeHosts.get(node.id);

    if (!host) {
      host = doc.createElement('div');
      host.setAttribute('data-node-id', node.id);
      host.className = 'grafloria-node-host';
      layers.html.appendChild(host);
      nodeHosts.set(node.id, host);
      // A fresh paint supersedes whatever the last one ended in — only reachable in
      // 'destroy' cull mode, which is the one mode that re-runs a painter.
      pendingPaints.delete(node.id);
      paintFailures.delete(node.id);
      // The RETURN VALUE is the whole async contract: a painter that is not finished says
      // so by handing back a promise. Sync painters return undefined and cost nothing.
      trackPaint(node.id, options.renderCustomNode?.(node, host));
    } else if (!host.parentNode) {
      // Re-entry after a detach cull: the SAME element goes back, with its subtree, its
      // scroll offset, its canvas bitmap and its event listeners intact. `renderCustomNode`
      // is NOT called again — "a custom node mounts exactly once" is a promise neither the
      // cull nor the export is allowed to break.
      layers.html.appendChild(host);
    }

    host.setAttribute(
      'style',
      nodeHostStyle(node.position.x, node.position.y, node.size.width, node.size.height)
    );
  };

  /**
   * Hosts an in-flight ASYNC capture is holding open, which no frame may cull.
   *
   * Only an async export can populate this, and only for as long as it is waiting. The
   * synchronous capture materializes, reads and restores inside one tick with no
   * suspension point, so nothing can run in the middle of it and it needs no pin.
   *
   * Without this, waiting for a painter would be self-defeating: real frames run WHILE we
   * wait (that is what "async" means here), and one of them culling the very host we are
   * waiting on would hand the capture a detached element — no layout box, every rect zero,
   * a blank widget. An animated pan during an export would silently empty it. In 'destroy'
   * mode it is worse than blank: the frame fires `removeCustomNode` and drops the host, so
   * the export's own teardown would fire a SECOND time on an element the embedder has
   * already disposed.
   */
  const pinnedHosts = new Set<string>();

  const syncCustomNodes = (): void => {
    const wanted = new Set<string>();

    // The viewBox, not `getViewport()`: the two diverge at any zoom != 1 and culling
    // against the camera rect drops hosts that are on screen whenever the board is zoomed
    // out — which fitView() always does.
    if (culler) culler.beginFrame(viewport.getViewBox(), viewport.getZoom(), gestureHeld());

    for (const node of model.getNodes()) {
      if (!node.getMetadata('useHTMLLayer')) continue;
      wanted.add(node.id);

      const existing = nodeHosts.get(node.id);

      if (culler && !pinnedHosts.has(node.id)) {
        // `existing?.parentNode` — the DOM's own answer to "is this mounted", rather than a
        // bookkeeping set that can drift from it. Feeding the CURRENT state back in is what
        // makes the hysteresis band work: which of the two rects applies depends on where
        // the host already is.
        if (!culler.admits(node.id, nodeBounds(node), !!existing?.parentNode)) {
          if (existing) {
            if (culler.getMode() === 'destroy') {
              options.removeCustomNode?.(node.id, existing);
              existing.remove();
              nodeHosts.delete(node.id);
            } else if (existing.parentNode) {
              // DETACH ONLY. No `removeCustomNode` — the component was not unmounted, it
              // is parked. Firing the teardown hook here would be a lie the host would act
              // on (disposing a chart it is about to be handed back).
              existing.remove();
            }
          }
          // …and no style write. That is most of the saving: a 400-widget board stops
          // paying 400 `setAttribute` calls per frame to position elements nobody sees.
          continue;
        }
      }

      mountHost(node);
    }

    for (const [id, host] of [...nodeHosts]) {
      if (wanted.has(id)) continue;
      options.removeCustomNode?.(id, host);
      host.remove();
      nodeHosts.delete(id);
    }
  };

  /**
   * The custom nodes an export with this scope will contain — the one definition of
   * "in scope", shared by everything that has to agree on it (what gets materialized,
   * what gets pinned, what gets waited for).
   *
   * WHAT IT WILL NOT INCLUDE. An explicit {@link ViewLifecycle} freeze is skipped, and
   * that is not timidity: `SVGRenderer.render` gates every entity on
   * `ViewLifecycle.admits`, so the render pass of this very export omits a frozen node.
   * Capturing its widget would put content in the file with no node beneath it, and
   * stretch the fitted viewBox to reach a node the same file does not draw.
   */
  const exportableCustomNodes = (needed: (node: NodeModel) => boolean): NodeModel[] =>
    model
      .getNodes()
      .filter(
        (node: NodeModel) =>
          !!node.getMetadata('useHTMLLayer') &&
          needed(node) &&
          !lifecycle?.isExplicitlyFrozen('node', node.id)
      );

  /**
   * FORCE-MATERIALIZE the hosts an export is about to read, and hand back the undo.
   *
   * THE GAP THIS CLOSES. Culling means a widget the camera has never reached has never
   * been painted, so there is nothing in the document to capture; a widget culling
   * detached has an element with no layout box, which every `getBoundingClientRect()`
   * reports as zero. Either way the export used to emit an empty box, and the option's
   * own documentation told the caller to "pan or fitView() first". That is not a
   * workaround anyone can apply from a headless print job, a thumbnailer or a server —
   * and it made `cullCustomNodes`, a PERFORMANCE knob, silently change what comes out of
   * a file. A performance knob that loses data is not a performance knob.
   *
   * So the rule is now: **an export contains the same widgets whether culling is on or
   * off.** The capture mounts what it needs, reads it, and puts the document back.
   *
   * PUTS IT BACK, precisely — because an export that permanently mounted a 300-widget
   * board would just be a different bug:
   *
   *   was 'attached'  nothing to do, nothing to undo. Already live, already correct.
   *   was 'detached'  re-attached to be read, then detached again. `renderCustomNode`
   *                   never re-runs, so mount-once is untouched.
   *   was 'absent'    created and painted — a legitimate FIRST mount, not a second one.
   *                   Then re-culled to whatever the configured mode means:
   *                     • 'detach'  — parked off-document, retained. Identical to what a
   *                       pan across the board and back leaves behind, and it keeps the
   *                       promise that this widget's painter runs exactly once, ever.
   *                     • 'destroy' — torn down for real (`removeCustomNode` fires). That
   *                       mode exists to BOUND THE HEAP, so leaving hosts retained would
   *                       defeat it outright; the balanced mount/unmount an export
   *                       performs is the same lifecycle a pan already produces, and a
   *                       'destroy' embedder has accepted that its painter re-runs.
   *                     • no culler at all — left mounted. There is no culled state to
   *                       restore to, and the documented default is that every custom
   *                       host is permanently in the document, so this is the state the
   *                       next frame would have produced anyway. (Reachable by exporting
   *                       between `setNodes()` and the frame it schedules — which used to
   *                       export blank widgets, and no longer does.)
   *
   * WHAT IT WILL NOT OVERRULE is decided by `exportableCustomNodes` above — an explicit
   * {@link ViewLifecycle} freeze is skipped, and it says why.
   *
   * WHAT IT CANNOT DO ON ITS OWN. `renderCustomNode` is called here and read on the next
   * line, because `exportSvgString()` is synchronous by contract. A painter that defers
   * its paint has not drawn anything by the time we look. That is what the async path
   * below exists for; the synchronous one still reports it rather than exporting a
   * silent blank.
   */
  const materializeCustomNodes = (needed: (node: NodeModel) => boolean): (() => void) => {
    const undo: Array<() => void> = [];

    for (const node of exportableCustomNodes(needed)) {
      if (nodeHosts.get(node.id)?.parentNode) continue; // already live — leave it alone

      const was = nodeHosts.has(node.id) ? 'detached' : 'absent';
      try {
        mountHost(node);
      } catch {
        // A FIRST-MOUNT PAINTER THAT THROWS must not take the export with it. This is the
        // only place a widget's painter runs outside a frame, so letting it propagate
        // would abort the whole export AND strand every host materialized before it.
        // `mountHost` registers the element before it calls the painter, so the undo below
        // is still knowable, and the capture degrades to the marked box and warning that
        // every unreadable host already gets.
      }

      const host = nodeHosts.get(node.id);
      if (!host) continue;

      if (was === 'detached' || !culler) {
        if (was === 'detached') undo.push(() => host.remove());
      } else if (culler.getMode() === 'destroy') {
        undo.push(() => {
          // IDENTITY-CHECKED, because the async path can suspend between the mount and
          // this undo. If the node left the model while we waited, the frame's own
          // teardown loop has already fired `removeCustomNode` and dropped the host —
          // firing again would dispose an embedder's component twice. In the synchronous
          // path nothing can run in between, so this is always true and changes nothing.
          if (nodeHosts.get(node.id) !== host) return;
          options.removeCustomNode?.(node.id, host);
          host.remove();
          nodeHosts.delete(node.id);
        });
      } else {
        undo.push(() => host.remove());
      }
    }

    return () => {
      for (const restore of undo) restore();
    };
  };

  /**
   * Why this widget's capture may be short, in the words a developer can act on.
   *
   * `waited` distinguishes the two ways an unfinished painter reaches an export, because
   * they have different fixes: the synchronous entry points CANNOT wait and the caller
   * should move to `await export(…)`; the asynchronous one waited and gave up, and the
   * caller should raise the deadline or find out why the painter never settles.
   */
  const paintWarning = (
    id: string,
    waited: boolean,
    timeoutMs: number
  ): string | undefined => {
    const failure = paintFailures.get(id);
    if (failure !== undefined) {
      return (
        `custom node "${id}" — its renderCustomNode promise REJECTED (${failure}), so whatever ` +
        'it had not drawn by then is missing from this export.'
      );
    }
    if (!pendingPaints.has(id)) return undefined;
    if (waited) {
      return (
        `custom node "${id}" did not finish painting within ${timeoutMs}ms — captured as it ` +
        'stood at the deadline, which may be partial or blank. Raise ' +
        'ExportOptions.customNodeTimeout, or check why its renderCustomNode promise never settles.'
      );
    }
    return (
      `custom node "${id}" is STILL PAINTING asynchronously (its renderCustomNode returned a ` +
      'promise that has not settled). exportSvgString() / exportPdf() are synchronous by ' +
      "contract and cannot wait — use `await diagram.export('svg' | 'pdf' | 'png', …)`, which does."
    );
  };

  /**
   * THE EXPORT BOUNDARY for HTML-layer nodes.
   *
   * A custom node paints into a raw host that is a SIBLING of the SVG, so the VNode
   * tree the exporter serializes contains an empty `<g>` for it and nothing else. That
   * is why an exported dashboard used to be a set of blank rectangles: the content was
   * never in the tree to begin with.
   *
   * THIS is the only place that can fix it, because this is the only place that holds
   * the hosts. So the DOM read happens HERE, once, and produces plain data —
   * `exportSvg` stays pure, DOM-free and deterministic, which is a property worth
   * strictly more than the convenience of reaching into the document from inside it.
   *
   * A caller's own `customNodes` always wins (including `[]`, which means "export the
   * diagram without its widgets").
   */
  const captureCustomNodes = (needed: (node: NodeModel) => boolean): CustomNodeCapture[] => {
    const restore = materializeCustomNodes(needed);
    try {
      return readHosts(false, 0);
    } finally {
      // `finally`: a capture that threw must not leave a board's worth of hosts mounted.
      // (`captureCustomNodeHost` is documented never to throw, but the restore is the one
      // thing here whose failure would be permanent, so it does not depend on that.)
      restore();
    }
  };

  /** The DOM read, shared by both capture paths so they cannot disagree about a host. */
  const readHosts = (waited: boolean, timeoutMs: number): CustomNodeCapture[] => {
    const captures: CustomNodeCapture[] = [];
    // Model order, not Map order: an export must not depend on mount sequence, or two
    // runs of the same board would differ in byte order.
    for (const node of model.getNodes()) {
      const host = nodeHosts.get(node.id);
      if (!host) continue;
      const capture = captureCustomNodeHost(node.id, nodeBounds(node), host);
      // A still-painting caveat is the CAUSE and leads; the capture's own fidelity caveats
      // (an image that PDF cannot draw, an inset shadow that was skipped) follow it. Merging
      // rather than overwriting keeps both — a widget can be both async AND hold an image.
      const paint = paintWarning(node.id, waited, timeoutMs);
      const warning = [paint, capture.warning].filter(Boolean).join(' ');
      captures.push(warning ? { ...capture, warning } : capture);
    }
    return captures;
  };

  /**
   * THE ASYNC CAPTURE — the same boundary, allowed to wait for a painter that said it
   * was not finished.
   *
   * THE SIGNAL IS THE PROMISE, and nothing else. A fixed sleep would be both slow (every
   * export pays for the slowest imaginable widget) and wrong (the slowest widget is always
   * slower than the guess, on someone's machine). `renderCustomNode` returning a promise
   * is a contract the painter's author owns, can type, and is never wrong about — so this
   * waits for exactly those, and returns the instant the last one settles.
   *
   * THE BOUND. `customNodeTimeout` (default 5s) is a safety net, never the mechanism: a
   * painter that never settles must not hang a print job. On expiry the export takes the
   * host as it stands — partial, or blank — and every widget it did not get to wait out is
   * WARNED about by id. Degraded, reported, never silent.
   *
   * WHY THE SYNC PATH IS REUSED VERBATIM WHEN NOTHING IS PENDING. If no painter in scope
   * has an unsettled promise, this runs materialize → read → restore with no suspension
   * point at all, i.e. the identical sequence `exportSvgString()` performs. That makes "an
   * all-sync board exports the same bytes through both paths" structurally true rather
   * than merely tested — there is no second code path for it to drift into.
   */
  const captureCustomNodesAsync = async (
    needed: (node: NodeModel) => boolean,
    timeoutMs: number
  ): Promise<CustomNodeCapture[]> => {
    const scope = exportableCustomNodes(needed).map((node: NodeModel) => node.id);
    for (const id of scope) pinnedHosts.add(id);

    const restore = materializeCustomNodes(needed);
    try {
      // Only NOW is the pending set knowable: materializing runs first mounts, and a
      // first mount is exactly where a painter announces that it is async.
      const waits = scope
        .map((id) => pendingPaints.get(id))
        .filter((p): p is Promise<void> => p !== undefined);

      if (waits.length === 0) return readHosts(false, timeoutMs); // ← atomic, as above
      await settle(waits, timeoutMs);
      return readHosts(true, timeoutMs);
    } finally {
      restore();
      for (const id of scope) pinnedHosts.delete(id);
    }
  };

  /** Wait for every tracked paint, or for the deadline — whichever comes first. */
  const settle = async (waits: Promise<void>[], timeoutMs: number): Promise<void> => {
    if (!(timeoutMs > 0)) return; // 0 (or nonsense) means "do not wait"; still reported
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    try {
      // The tracked promises are wrapped never to reject, so this races two resolutions
      // and cannot itself throw. A rejecting painter is recorded, not propagated.
      await Promise.race([Promise.all(waits), deadline]);
    } finally {
      // Without this a fast export still holds the event loop open for the full deadline,
      // which in Node keeps a process alive after the work is done.
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  /**
   * ONE async capture at a time.
   *
   * Two exports in flight would otherwise interleave their materialize/restore pairs —
   * the first's restore tearing down a host the second is still waiting to read, which is
   * a blank widget in a file that asked for nothing unusual. Serializing is also the
   * cheaper answer: the second export finds the first's painters already settled.
   */
  let captureQueue: Promise<unknown> = Promise.resolve();
  const serializeCapture = <T>(run: () => Promise<T>): Promise<T> => {
    const result = captureQueue.then(run, run);
    captureQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  /**
   * Which nodes this export will actually contain.
   *
   * Materializing is the expensive half — it runs a painter — so it is bounded by the
   * export's own scope rather than mounting a 300-widget board to capture the three
   * widgets `includeIds` asked for. The predicates mirror what the renderer resolves
   * `ids` to (`SVGRenderer.selectedIds` reads exactly this `state.selected`), so what is
   * mounted and what survives `filterCaptures` are the same set.
   */
  const exportNeeds = (exportOptions?: ExportOptions): ((node: NodeModel) => boolean) => {
    if (exportOptions?.scope === 'selection') return (node) => node.state?.selected === true;
    if (exportOptions?.includeIds === undefined) return () => true;
    const ids = new Set(exportOptions.includeIds);
    return (node) => ids.has(node.id);
  };

  const withCustomNodes = (exportOptions?: ExportOptions): ExportOptions => {
    if (exportOptions?.customNodes !== undefined) return exportOptions;
    const customNodes = captureCustomNodes(exportNeeds(exportOptions));
    if (customNodes.length === 0) return exportOptions ?? {};
    return { ...exportOptions, customNodes };
  };

  /** Default bound on waiting for an async painter. See ExportOptions.customNodeTimeout. */
  const DEFAULT_CUSTOM_NODE_TIMEOUT = 5000;

  const withCustomNodesAsync = async (exportOptions?: ExportOptions): Promise<ExportOptions> => {
    // The caller's own captures win, and short-circuit the wait entirely — `customNodes:
    // []` means "export the diagram without its widgets", which must not sit out a
    // deadline for painters whose output was never going in the file.
    if (exportOptions?.customNodes !== undefined) return exportOptions;
    const customNodes = await serializeCapture(() =>
      captureCustomNodesAsync(
        exportNeeds(exportOptions),
        exportOptions?.customNodeTimeout ?? DEFAULT_CUSTOM_NODE_TIMEOUT
      )
    );
    if (customNodes.length === 0) return exportOptions ?? {};
    return { ...exportOptions, customNodes };
  };

  /**
   * EXTERNAL-URL IMAGES → embedded bytes, for the async export only.
   *
   * A widget's `<img src="https://…">` captures as `<image href="https://…">`, which an
   * SVG renders online and a PDF cannot draw at all. This library is client-side: the
   * export RUNS IN A BROWSER, and the browser can usually fetch that URL itself. So the
   * awaited path fetches every external reference and swaps it for the `data:` URI the
   * PDF writer already embeds as an XObject (b2854b0a1) — three tiers, see
   * `fetchAssetsTiered`: environment fetch (same-origin / CORS-allowed), then
   * `ExportOptions.assetFetcher` (the app's proxy), then the accurate warning.
   *
   * TWO KINDS OF IMAGE, ONE PASS. Widget captures hold their images as captured VNodes
   * and are substituted here directly. But a PANEL-type diagram node (an ERD avatar, a
   * logo — `metadata.panel.image/icon.href`) is painted by the RENDERER'S OWN tree,
   * which is built inside the synchronous export — this layer never holds it. So the
   * renderer enumerates that tree's URLs up front (`collectExportImageUrls` — the same
   * `render()` the export serializes, so no drift), the fetch covers the UNION of both
   * kinds (one fetch per URL, however many widgets and panels share it), and the
   * resolved map rides down `ExportOptions.resolvedAssets` for the sync path's pure
   * `inlineAssets` substitution. A URL the caller pre-resolved is trusted, never fetched.
   *
   * THE WARNING LEDGER IS RECONCILED, both ways. A capture whose external images were
   * all embedded has its capture-time "EXTERNAL URL" caveat STRIPPED — after the fetch
   * it asserts a problem that no longer exists. A URL every tier failed on keeps the
   * reference (broken-but-visible beats silently blanked, the `inlineAssets` rule) and
   * gains a warning naming the URL, the reason, and the escape hatches — a tree image's
   * failure reaches `onWarnings` the same way a widget image's reaches the capture.
   *
   * `exportSvgString()` / `exportPdf()` stay synchronous and network-free: they fetch
   * nothing, and honour only a `resolvedAssets` map the caller supplies.
   */
  const withInlinedImages = async (exportOptions: ExportOptions): Promise<ExportOptions> => {
    const captures = exportOptions.customNodes ?? [];

    // Collect the union — widget-capture URLs first, then the renderer's tree — each
    // deduplicated in a STABLE order (model order, then first appearance) for
    // determinism. One URL, one fetch, no matter which kinds reference it.
    const roots = new Map<CustomNodeCapture, VNode>();
    const urls: string[] = [];
    const seen = new Set<string>();
    const add = (found: readonly string[]): void => {
      for (const url of found) {
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    };
    for (const capture of captures) {
      if (!capture.content || capture.content.length === 0) continue;
      const root: VNode = { type: 'g', props: {}, children: [...capture.content] };
      const found = collectAssetUrls(root);
      if (found.length === 0) continue;
      roots.set(capture, root);
      add(found);
    }
    const treeUrls = renderer.collectExportImageUrls(exportOptions);
    add(treeUrls);

    if (urls.length === 0) return exportOptions; // nothing external — identical options out

    // A URL the caller already resolved is bytes we hold — fetching it again would be
    // both wasteful and a trust inversion (their bytes are the ones they want in the file).
    const preResolved = exportOptions.resolvedAssets;
    const toFetch = preResolved ? urls.filter((url) => !preResolved.has(url)) : urls;

    const { byUrl, failures } =
      toFetch.length > 0
        ? await fetchAssetsTiered(toFetch, {
            fetcher: exportOptions.assetFetcher,
            maxBytes: exportOptions.assetMaxBytes,
            timeoutMs: exportOptions.assetTimeout,
          })
        : { byUrl: new Map<string, string>(), failures: new Map<string, string>() };
    if (preResolved) {
      for (const [url, uri] of preResolved) byUrl.set(url, uri);
    }

    const customNodes = captures.map((capture): CustomNodeCapture => {
      const root = roots.get(capture);
      if (!root) return capture;

      const inlined = inlineAssets(root, byUrl);
      const remaining = collectAssetUrls(inlined);

      let warning = capture.warning;
      if (remaining.length === 0) {
        // Every external image is now bytes in the file — the capture-time caveat
        // (written for the sync paths, which cannot fetch) is no longer true here.
        warning = stripResolvedImageWarnings(warning);
      } else {
        const residue = remaining
          .map(
            (url) =>
              `widget image "${url}" could not be embedded: ${failures.get(url) ?? 'unknown failure'}. ` +
              'The reference is left in the file (an SVG still renders it online); it will be ' +
              'MISSING from a PDF export.'
          )
          .join(' ');
        warning = [warning, residue].filter(Boolean).join(' ');
      }

      return { ...capture, content: inlined.children ?? [], warning };
    });

    const out: ExportOptions = { ...exportOptions };
    if (exportOptions.customNodes !== undefined) out.customNodes = customNodes;
    // The resolved map rides DOWN the same options object: the sync export applies it
    // to the renderer's tree with the pure `inlineAssets` — which is how a panel image
    // becomes bytes without the sync path ever fetching.
    if (byUrl.size > 0) out.resolvedAssets = byUrl;

    // A TREE image's failure has no capture to carry its warning, so it goes to the
    // export's own fidelity channel. Same honesty rule as the widget residue: name the
    // URL, the reason, and (via the tier-3 text) both escape hatches.
    const treeResidue = treeUrls
      .filter((url) => !byUrl.has(url))
      .map(
        (url) =>
          `diagram image "${url}" could not be embedded: ${failures.get(url) ?? 'unknown failure'}. ` +
          'The reference is left in the file (an SVG still renders it online); it will be ' +
          'MISSING from a PDF export.'
      );
    if (treeResidue.length > 0) {
      const original = exportOptions.onWarnings;
      out.onWarnings = (warnings) => original?.([...warnings, ...treeResidue]);
    }

    return out;
  };

  // -- the frame --------------------------------------------------------------
  let lastViewportKey = '';
  let lastFrameHadPreview = false;
  /** Mutation epoch as of the end of the last painted frame. See canSkipFrame(). */
  let lastFrameEpoch = -1;
  /** Renderer invalidation epoch as of the end of the last painted frame. */
  let lastRendererEpoch = -1;
  let ready = false;
  let disposed = false;

  /**
   * `ready` fires on a microtask, not inline in the mount paint. The first paint
   * happens INSIDE `createDiagram()`, so a caller doing
   * `const d = createDiagram(...); d.on('ready', …)` could never have observed an
   * inline emit — the handler is registered one statement too late.
   */
  const signalReady = (): void => {
    if (ready) return;
    ready = true;
    queueMicrotask(() => {
      if (!disposed) emit('ready', undefined);
    });
  };

  const viewportKey = (): string => {
    const v = viewport.getViewport();
    return `${v.x},${v.y},${v.width},${v.height}@${viewport.getZoom()}`;
  };

  const isConnectionPreviewActive = (): boolean => {
    try {
      return engine.getConnectionStateManager().getState().isConnecting === true;
    } catch {
      return false;
    }
  };

  /**
   * Idle-skip: drop a queued frame only when nothing visible could have changed.
   * The connection preview lives in interaction state, not in entity dirty flags,
   * so we never skip while it is — or was, last frame — active, otherwise its
   * removal would not repaint.
   *
   * wave8/dirty — BUG FIXED HERE. This used to sum `getDirtyNodes/Links/Groups`
   * and skip only when the total was zero. On any diagram bigger than the
   * viewport that total is NEVER zero, so the idle-skip never once fired:
   *
   *   the renderer marks an entity clean when it RENDERS it, and it renders only
   *   what is visible. Open a 10,000-node diagram with 56 nodes on screen and the
   *   other 9,944 stay dirty for the life of the canvas — they are never drawn,
   *   so they are never cleaned. `dirty > 0` forever. `return false` forever.
   *
   * So the one guard whose entire job was "don't repaint an idle canvas" was
   * dead exactly where idleness costs the most, and it charged three O(n) array
   * scans per queued frame for the privilege of always saying no.
   *
   * The mutation epoch answers the real question — *has anything changed since
   * the frame on screen?* — in O(1) and without caring whether the change was on
   * screen. (Off-screen changes matter: an off-screen node is an obstacle the
   * edge optimizer routes around, and its edge may well cross the viewport.)
   */
  const canSkipFrame = (): boolean => {
    if (!engine.getDiagram()) return false;
    if (getMutationEpoch() !== lastFrameEpoch) return false;
    // …and the RENDERER's own picture must not have gone stale either. The model
    // epoch answers "did the world change"; this answers "did my picture of it
    // change". They are not the same question, and the gap is a real bug: when
    // the off-thread route solver answers, the model has not changed — the epoch
    // does not move — but the routes have improved. Keyed only on the model, this
    // would drop that repaint before render() was ever called, and the refined
    // routes we paid a worker for would never reach the screen.
    if (renderer.getInvalidationEpoch() !== lastRendererEpoch) return false;
    if (viewportKey() !== lastViewportKey) return false;
    if (isConnectionPreviewActive() || lastFrameHadPreview) return false;
    return true;
  };

  /**
   * THE FRAME — in three strictly ordered phases (wave8/dirty, Card 1).
   *
   *   READ    every DOM measurement, before any write.
   *   COMPUTE pure VNode construction: no DOM in, no DOM out.
   *   WRITE   every DOM mutation, with no read between them.
   *
   * The order is the whole point. A read after a write forces the browser to
   * flush layout synchronously to answer it; do that inside a loop over N nodes
   * and you have N forced layouts — layout thrash, and the classic way a canvas
   * that is fast at 50 nodes dies at 500. Keeping the phases apart makes it
   * structurally impossible rather than merely absent today. (`node-component.ts`
   * had exactly this bug in its refresh loop; it now batches the same way.)
   */
  const paint = (): void => {
    // -- READ ------------------------------------------------------------------
    const renderViewport = viewport.getRenderViewport();
    const zoom = viewport.getZoom();
    const htmlTransform = viewport.getHtmlLayerTransform();

    // -- COMPUTE ---------------------------------------------------------------
    const vnode = renderer.render(renderViewport, zoom);

    // -- WRITE -----------------------------------------------------------------
    layers.html.setAttribute('style', htmlLayerStyle(htmlTransform));
    patcher.reconcile(layers.svg, vnode);
    syncCustomNodes();

    lastViewportKey = viewportKey();
    lastFrameHadPreview = isConnectionPreviewActive();
    // AFTER the frame, not before: rendering legitimately dirties model entities
    // (routed geometry, auto-sizing), and stamping on entry would record an epoch
    // the frame itself then invalidates — the skip would never fire again.
    lastFrameEpoch = getMutationEpoch();
    lastRendererEpoch = renderer.getInvalidationEpoch();

    signalReady();
  };

  /**
   * The HYDRATION frame: render the VNode tree, then ADOPT the server's DOM
   * instead of building it. Zero DOM writes ⇒ no flash and no re-layout.
   */
  const hydratePaint = (): void => {
    const vnode = renderer.render(viewport.getRenderViewport(), viewport.getZoom());
    patcher.hydrate(layers.svg, vnode);
    syncCustomNodes();
    lastViewportKey = viewportKey();
    lastFrameHadPreview = isConnectionPreviewActive();
    lastFrameEpoch = getMutationEpoch();
    lastRendererEpoch = renderer.getInvalidationEpoch();
    signalReady();
  };

  // -- model → repaint --------------------------------------------------------
  const unsubs: Array<() => void> = [];
  const onModel = (event: string, handler: (...args: never[]) => void): void => {
    unsubs.push(model.on(event, handler as never));
  };

  onModel('node:added', () => {
    scheduler.schedule();
    emit('nodes:change', { nodes: model.getNodes() });
  });
  onModel('node:removed', () => {
    scheduler.schedule();
    emit('nodes:change', { nodes: model.getNodes() });
  });
  onModel('node:changed', () => scheduler.schedule());
  onModel('link:added', ((link: LinkModel) => {
    scheduler.schedule();
    emit('edges:change', { edges: model.getLinks() });
    // The engine creates the link ASYNCHRONOUSLY from `connection:complete`, so
    // this — not the mouseup — is where a user-drawn connection is observable.
    if (link) emit('connect', { link });
  }) as never);
  onModel('link:removed', () => {
    scheduler.schedule();
    emit('edges:change', { edges: model.getLinks() });
  });
  onModel('link:changed', () => scheduler.schedule());
  // Groups paint too (frames, lanes, collapse proxies) — leaving these out made
  // fitToContents() invisible until an unrelated event happened to render.
  onModel('group:added', () => scheduler.schedule());
  onModel('group:removed', () => scheduler.schedule());
  onModel('group:changed', () => scheduler.schedule());
  onModel('selection:changed', () => {
    scheduler.schedule();
    emit('selection:change', {
      nodes: model.getSelectedNodes(),
      edges: model.getLinks().filter((l: LinkModel) => l.state === 'selected'),
    });
  });

  unsubs.push(
    viewport.onChange((state) => {
      scheduler.schedule();
      emit('viewport:change', state);
    })
  );

  // -- resize -----------------------------------------------------------------
  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      const r = getRect();
      if (r.width > 0 && r.height > 0) viewport.syncCanvasSize(r);
    });
    resizeObserver.observe(container);
  }

  // -- mount ------------------------------------------------------------------
  binder.attach();

  if (hydration) {
    hydratePaint();
  } else {
    if (options.fitView) fitView(40);
    // Synchronous first paint: a host that measures right after createDiagram()
    // must not see an empty container.
    scheduler.flush();
  }

  function fitView(padding = 40): void {
    const bounds = contentBounds(model);
    // maxZoom 1: fitting means "show me everything", never "magnify a small
    // graph until it fills the wall". Zooming out to fit is still unbounded
    // (down to the controller's minZoom). Hosts wanting magnification can call
    // viewport.fitToBounds directly.
    if (bounds) viewport.fitToBounds(bounds, padding, { maxZoom: 1 });
  }

  const instance: DiagramInstance = {
    setNodes(nodes) {
      if (applyNodes(model, nodes)) scheduler.schedule();
    },
    setEdges(edges) {
      if (applyEdges(model, edges)) scheduler.schedule();
    },
    getModel: () => model,
    getEngine: () => engine,
    getCommentStore: () => commentStore,

    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as Listener);
      return () => set?.delete(handler as Listener);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler as Listener);
    },

    viewport,
    interaction,

    setTheme(theme) {
      renderer.setTheme(theme);
      scheduler.schedule();
    },

    // Wave 10: the renderer could already do all of this. The instance — the only
    // handle a host is given — exposed none of it, and did not expose the renderer
    // either, so `SVGRenderer.export()` was unreachable from an embed. The library
    // shipped PNG, JPEG, WebP, a real vector PDF and a deterministic zero-DOM SVG
    // serializer that an embedder had no way to call.
    setColorMode(mode, themes) {
      renderer.setColorMode(mode, themes);
      scheduler.schedule();
    },
    getColorMode: () => renderer.getColorMode(),
    setTokenBridge(bridge) {
      renderer.setTokenBridge(bridge);
      scheduler.schedule();
    },

    // THE ONLY ASYNC EXPORT ENTRY POINT — and it always was one. `IRenderer.export`
    // has returned a Promise since the seam existed, so an ASYNC custom-node painter
    // needs no new public method: this is where waiting for one belongs. The two
    // synchronous entry points below keep their contract exactly, and report an
    // unfinished painter rather than pretending to have read it.
    export: async (format, exportOptions) =>
      renderer.export(format, await withInlinedImages(await withCustomNodesAsync(exportOptions))),
    exportSvgString: (exportOptions) => renderer.exportSvgString(withCustomNodes(exportOptions)),
    exportPdf: (exportOptions) => renderer.exportPdf(withCustomNodes(exportOptions)),

    exportText: (textOptions) => exportDiagramText(model, textOptions),
    loadText: (text, textOptions) => {
      const result = importDiagramText(text, textOptions);
      // Reconcile INTO the live model (never swap it): applyNodes/applyEdges
      // are full reconcilers, so removals happen and every listener, plugin,
      // and renderer binding stays attached to the same DiagramModel.
      applyNodes(model, result.diagram.getNodes().map((n) => toNodeSpec(n)));
      applyEdges(model, result.diagram.getLinks().map((l) => toEdgeSpec(l)));
      return result;
    },

    /** The LOD tier actually rendered, and the governor's last verdict. */
    getQualityState: () => renderer.getQualityState(),

    /** Animation policy (global toggle, speed, reduced-motion, battery-saver opt-out). */
    animations: renderer.getAnimationService(),

    fitView,

    render: () => scheduler.schedule(),
    renderNow: () => scheduler.flush(),

    batchUpdate(mutate) {
      model.beginBatch();
      try {
        mutate(model);
      } finally {
        // `finally`: a throwing mutator must not leave the model batching
        // forever — every subsequent change would be silently swallowed, and the
        // canvas would simply stop updating with no error to explain it.
        model.endBatch();
      }
      // endBatch() replays the queued events, and each of those already calls
      // schedule(). This is for the batch that changed something the model does
      // not emit for (or nothing at all): schedule() is idempotent within a tick,
      // so an extra call costs one `coalesced` counter, never an extra frame.
      scheduler.schedule();
    },

    getDraggingNodeIds: () => binder.getDraggingNodeIds(),

    registry: renderer.getRegistry(),

    dispose() {
      if (disposed) return;
      disposed = true;

      commentOverlay?.dispose();
      commentOverlay = null;
      binder.detach();
      scheduler.dispose();
      resizeObserver?.disconnect();

      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      listeners.clear();

      for (const [id, host] of [...nodeHosts]) {
        options.removeCustomNode?.(id, host);
        host.remove();
      }
      nodeHosts.clear();

      interaction.dispose();
      viewport.dispose();
      renderer.dispose();
      patcher.unmount(layers.svg);
      // Only tear down the DOM we created. An engine handed in by the caller is
      // theirs to destroy.
      layers.root.remove();
      if (!options.engine) engine.destroy();
    },

    container,
    scheduler,
    patcher,
  };

  return instance;
}


/** World bounding box of every visible node, or null when there is nothing to fit. */
export function contentBounds(model: DiagramModel): Rectangle | null {
  const nodes = model.getNodes().filter((n: NodeModel) => n.state?.visible !== false);
  if (nodes.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const node of nodes) {
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + (node.size?.width ?? 0));
    bottom = Math.max(bottom, node.position.y + (node.size?.height ?? 0));
  }

  // Routed edges arc OUTSIDE the node bbox (a detour around an obstacle, a
  // self-loop, a floating attachment's curve). Fitting to nodes alone left
  // those arcs sliced off at the viewport edge — nodes "contained", picture
  // clipped. Union in every routed waypoint the links carry.
  for (const link of model.getLinks()) {
    for (const p of link.points ?? []) {
      left = Math.min(left, p.x);
      top = Math.min(top, p.y);
      right = Math.max(right, p.x);
      bottom = Math.max(bottom, p.y);
    }
  }

  if (!isFinite(left) || !isFinite(top)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

interface Layers {
  root: HTMLElement;
  svg: HTMLElement;
  html: HTMLElement;
}

/**
 * Build the layer skeleton — or ADOPT the server's when hydrating. The adopted
 * path must not write to the DOM at all: that is what "no flash, no re-layout"
 * means in practice.
 */
function ensureLayers(
  container: HTMLElement,
  doc: Document,
  hydration: HydrationSnapshot | undefined
): Layers {
  if (hydration) {
    const root = container.querySelector(`.${ROOT_CLASS}`) as HTMLElement | null;
    const svg = root?.querySelector(`.${SVG_LAYER_CLASS}`) as HTMLElement | null;
    const html = root?.querySelector(`.${HTML_LAYER_CLASS}`) as HTMLElement | null;
    if (root && svg && html) return { root, svg, html };
    // Server markup missing → fall through and mount fresh (correct, if not
    // flash-free). Silently rebuilding beats rendering nothing.
  }

  const root = doc.createElement('div');
  root.className = ROOT_CLASS;
  root.setAttribute('style', ROOT_STYLE);

  const svg = doc.createElement('div');
  svg.className = SVG_LAYER_CLASS;
  svg.setAttribute('style', SVG_LAYER_STYLE);

  const html = doc.createElement('div');
  html.className = HTML_LAYER_CLASS;
  html.setAttribute('style', htmlLayerStyle('translate(0px, 0px) scale(1)'));

  root.appendChild(svg);
  root.appendChild(html);
  container.appendChild(root);

  return { root, svg, html };
}
