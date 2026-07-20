import { DiagramEngine, getMutationEpoch } from '@grafloria/engine';
import type { DiagramModel, LinkModel, LODLevel, NodeModel } from '@grafloria/engine';
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
import { captureCustomNodeHost } from '../export/capture-host';
import { SVGRenderer } from '../svg/svg-renderer';
import { VNodePatcher } from '../vnode/patch';
import { InteractionController } from '../interaction/interaction-controller';
import { ViewportController } from '../viewport/viewport-controller';
import type { CanvasRect, Unsubscribe } from '../viewport/viewport-controller';
import { RenderScheduler } from './render-scheduler';
import { DomEventBinder } from './dom-event-binder';
import type { DomEventBinderOptions } from './dom-event-binder';
import { applyEdges, applyNodes } from './model-input';
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
   */
  renderCustomNode?: (node: NodeModel, element: HTMLElement) => void;
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
   * every widget it ever saw. What no consumer can see is a widget that has NEVER been
   * mounted: culling means its painter has not run and there is no content to read. On a
   * board larger than the camera has visited, anything that harvests widget content —
   * export, print, thumbnailing — will find nothing for the tiles the user has never
   * scrolled to. Pan or `fitView()` first if you need all of them. `mode: 'destroy'` makes
   * this strictly worse: anything currently culled has no host at all.
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
}

export interface DiagramInstance {
  setNodes(nodes: NodeInput[]): void;
  setEdges(edges: EdgeInput[]): void;
  getModel(): DiagramModel;
  getEngine(): DiagramEngine;

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
   */
  export(format?: ExportFormat, options?: ExportOptions): Promise<string>;
  /** Synchronous, DOM-free, deterministic. Carries `warnings`. */
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

  dispose(): void;

  /**
   * Wave 6 — Card 3: the nodes currently being dragged (past the movement
   * threshold). Custom node components receive this as the `dragging` prop.
   */
  getDraggingNodeIds(): string[];

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

  const syncCustomNodes = (): void => {
    const wanted = new Set<string>();

    // The viewBox, not `getViewport()`: the two diverge at any zoom != 1 and culling
    // against the camera rect drops hosts that are on screen whenever the board is zoomed
    // out — which fitView() always does.
    if (culler) culler.beginFrame(viewport.getViewBox(), viewport.getZoom(), gestureHeld());

    for (const node of model.getNodes()) {
      if (!node.getMetadata('useHTMLLayer')) continue;
      wanted.add(node.id);

      let host = nodeHosts.get(node.id);

      if (culler) {
        const bounds = {
          x: node.position.x,
          y: node.position.y,
          width: node.size?.width ?? 0,
          height: node.size?.height ?? 0,
        };
        // `host?.parentNode` — the DOM's own answer to "is this mounted", rather than a
        // bookkeeping set that can drift from it. Feeding the CURRENT state back in is what
        // makes the hysteresis band work: which of the two rects applies depends on where
        // the host already is.
        if (!culler.admits(node.id, bounds, !!host?.parentNode)) {
          if (host) {
            if (culler.getMode() === 'destroy') {
              options.removeCustomNode?.(node.id, host);
              host.remove();
              nodeHosts.delete(node.id);
            } else if (host.parentNode) {
              // DETACH ONLY. No `removeCustomNode` — the component was not unmounted, it
              // is parked. Firing the teardown hook here would be a lie the host would act
              // on (disposing a chart it is about to be handed back).
              host.remove();
            }
          }
          // …and no style write. That is most of the saving: a 400-widget board stops
          // paying 400 `setAttribute` calls per frame to position elements nobody sees.
          continue;
        }
      }

      if (!host) {
        host = doc.createElement('div');
        host.setAttribute('data-node-id', node.id);
        host.className = 'grafloria-node-host';
        layers.html.appendChild(host);
        nodeHosts.set(node.id, host);
        options.renderCustomNode?.(node, host);
      } else if (!host.parentNode) {
        // Re-entry after a detach cull: the SAME element goes back, with its subtree, its
        // scroll offset, its canvas bitmap and its event listeners intact. `renderCustomNode`
        // is NOT called again — "a custom node mounts exactly once" is a promise the cull
        // is not allowed to break.
        layers.html.appendChild(host);
      }

      host.setAttribute(
        'style',
        nodeHostStyle(node.position.x, node.position.y, node.size.width, node.size.height)
      );
    }

    for (const [id, host] of [...nodeHosts]) {
      if (wanted.has(id)) continue;
      options.removeCustomNode?.(id, host);
      host.remove();
      nodeHosts.delete(id);
    }
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
  const captureCustomNodes = (): CustomNodeCapture[] => {
    const captures: CustomNodeCapture[] = [];
    // Model order, not Map order: an export must not depend on mount sequence, or two
    // runs of the same board would differ in byte order.
    for (const node of model.getNodes()) {
      const host = nodeHosts.get(node.id);
      if (!host) continue;
      captures.push(
        captureCustomNodeHost(
          node.id,
          {
            x: node.position.x,
            y: node.position.y,
            width: node.size.width,
            height: node.size.height,
          },
          host
        )
      );
    }
    return captures;
  };

  const withCustomNodes = (exportOptions?: ExportOptions): ExportOptions => {
    if (exportOptions?.customNodes !== undefined) return exportOptions;
    const customNodes = captureCustomNodes();
    if (customNodes.length === 0) return exportOptions ?? {};
    return { ...exportOptions, customNodes };
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

    export: (format, exportOptions) => renderer.export(format, withCustomNodes(exportOptions)),
    exportSvgString: (exportOptions) => renderer.exportSvgString(withCustomNodes(exportOptions)),
    exportPdf: (exportOptions) => renderer.exportPdf(withCustomNodes(exportOptions)),

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

    dispose() {
      if (disposed) return;
      disposed = true;

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
