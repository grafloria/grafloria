import { DiagramEngine } from '@grafloria/engine';
import type { DiagramModel, LinkModel, NodeModel } from '@grafloria/engine';
import type { Theme } from '../types/theme.types';
import type { Rectangle } from '../types/geometry.types';
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
  /** Frame all content. */
  fitView(padding?: number): void;

  /** Queue a repaint (coalesced into one frame). */
  render(): void;
  /** Repaint synchronously — use when you must measure right after a change. */
  renderNow(): void;
  dispose(): void;

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

  applyNodes(model, options.nodes ?? []);
  applyEdges(model, options.edges ?? []);

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
  const renderer = new SVGRenderer(
    engine,
    { instanceId: hydration?.instanceId ?? options.instanceId },
    options.theme
  );
  renderer.applyInstanceScope(layers.root);
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
  const nodeHosts = new Map<string, HTMLElement>();

  const syncCustomNodes = (): void => {
    const wanted = new Set<string>();

    for (const node of model.getNodes()) {
      if (!node.getMetadata('useHTMLLayer')) continue;
      wanted.add(node.id);

      let host = nodeHosts.get(node.id);
      if (!host) {
        host = doc.createElement('div');
        host.setAttribute('data-node-id', node.id);
        host.className = 'grafloria-node-host';
        layers.html.appendChild(host);
        nodeHosts.set(node.id, host);
        options.renderCustomNode?.(node, host);
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

  // -- the frame --------------------------------------------------------------
  let lastViewportKey = '';
  let lastFrameHadPreview = false;
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
   * Idle-skip (same rule the Angular canvas uses): drop a queued frame only when
   * nothing visible could have changed. The connection preview lives in
   * interaction state, not in entity dirty flags, so we never skip while it is —
   * or was, last frame — active, otherwise its removal would not repaint.
   */
  const canSkipFrame = (): boolean => {
    const diagram = engine.getDiagram();
    if (!diagram) return false;
    const dirty =
      diagram.getDirtyNodes().length +
      diagram.getDirtyLinks().length +
      diagram.getDirtyGroups().length;
    if (dirty > 0) return false;
    if (viewportKey() !== lastViewportKey) return false;
    if (isConnectionPreviewActive() || lastFrameHadPreview) return false;
    return true;
  };

  const paint = (): void => {
    layers.html.setAttribute('style', htmlLayerStyle(viewport.getHtmlLayerTransform()));

    const vnode = renderer.render(viewport.getRenderViewport(), viewport.getZoom());
    patcher.reconcile(layers.svg, vnode);
    syncCustomNodes();

    lastViewportKey = viewportKey();
    lastFrameHadPreview = isConnectionPreviewActive();

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
    if (bounds) viewport.fitToBounds(bounds, padding);
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
    fitView,

    render: () => scheduler.schedule(),
    renderNow: () => scheduler.flush(),

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
