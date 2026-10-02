/**
 * `<GrafloriaFlow>` — the Qwik wrapper for the Grafloria diagram engine.
 *
 * Like the React and Vue wrappers it is deliberately a SHELL. Every line of
 * diagram behaviour — hit-testing, the mousedown priority ladder, panning,
 * zooming, node dragging, connection drawing, render scheduling — lives in
 * `@grafloria/renderer`'s headless `createDiagram()`. This component does
 * exactly three things:
 *
 *   1. owns a `<div>` and hands it to `createDiagram()` in a visible task,
 *   2. forwards `nodes` / `edges` props into `setNodes` / `setEdges`,
 *   3. turns the instance's events into QRL callbacks.
 *
 * If you ever find yourself adding diagram logic here, it belongs in the core.
 *
 * ## SSR and resumability — what Qwik adds
 *
 * `createDiagram()` is only ever called from `useVisibleTask$`, which never
 * runs on the server, so the component renders server-side without touching
 * `window`. Pass the result of `renderToStaticSVG()` as `ssr` and the
 * server-rendered SVG is emitted into the container; Qwik never re-renders
 * `dangerouslySetInnerHTML` content, and the visible task ADOPTS that DOM via
 * `createDiagram({ hydrate })` instead of rebuilding it.
 *
 * The React wrapper does the same trick but still pays for a hydration pass
 * over the tree. Qwik RESUMES: there is no hydration pass. The visible task
 * runs on document-ready (see visible-task-options.ts for why), so the
 * diagram's script loads with the page, not on first interaction — what
 * resuming saves is re-walking the component tree.
 *
 * ```tsx
 * const ssr = renderToStaticSVG({ nodes, edges, width: 800, height: 600 });
 * return <GrafloriaFlow nodes={nodes} edges={edges} ssr={ssr} />;
 * ```
 *
 * Custom / HTML-layer nodes are NOT server-rendered — they are framework
 * components and the server has no framework. They mount on the client, inside
 * the (empty, correctly transformed) HTML layer the SSR markup already carries.
 */
import {
  component$,
  noSerialize,
  render as qwikRender,
  useContext,
  useSignal,
  useVisibleTask$,
  type Component,
  type NoSerialize,
  type QRL,
} from '@builder.io/qwik';
import { createSyncSession } from '@grafloria/engine';
import type {
  CommentStore,
  LinkModel,
  NodeModel,
  SyncAdapter,
  SyncTransport,
} from '@grafloria/engine';
import {
  bindPresence,
  createDiagram,
  loadCanvasPlugins,
  toEdgeSpec,
  toNodeSpec,
  type BindPresenceOptions,
  type CanvasPluginOptions,
  type CanvasPlugins,
  type CreateDiagramOptions,
  type DiagramInstance,
  type EdgeSpec,
  type HighlighterConfig,
  type HydrationSnapshot,
  type NodeSpec,
  type PresenceBinding,
  type Theme,
} from '@grafloria/renderer';
import { withCustomFlag } from './custom-nodes';
import { GRAFLORIA_STORE, type SelectionChange } from './hooks';
import { MOUNT_EAGERLY } from './visible-task-options';

/** The uniform collab contract every Grafloria wrapper shares. */
export interface GrafloriaCollabOptions {
  /**
   * The transport (BroadcastChannelTransport, WebSocketTransport, …).
   *
   * MUST be wrapped in Qwik's `noSerialize()` by the caller: a transport holds
   * sockets and callbacks, so it is not serializable state and Qwik will throw
   * if you hand it over raw.
   */
  transport: SyncTransport;
  actor: string;
  /** Live cursors + remote selection outlines. `true` for defaults. */
  presence?: boolean | BindPresenceOptions;
  /** Everything else passes through to `createSyncSession`'s options. */
  [option: string]: unknown;
}

export interface GrafloriaLayoutRequest {
  name: string;
  options?: Record<string, unknown>;
}

/** Props a custom node component receives. */
export interface NodeProps<TData = Record<string, unknown>> {
  id: string;
  data: TData;
  selected: boolean;
  /** The live engine model — the escape hatch. */
  node: NodeModel;
}

/**
 * `nodeTypes` maps a node's `type` to the Qwik component that renders it.
 *
 * Declaring a type here IS the opt-in: specs whose `type` has an entry are
 * flagged `custom` automatically, the same rule the Vue and Angular wrappers
 * use. An explicit `custom` on the spec always wins.
 */
export type NodeTypes = Record<string, Component<NodeProps<never>>>;

export interface GrafloriaFlowProps {
  // -- model (controlled) ----------------------------------------------------
  nodes?: NodeSpec[];
  edges?: EdgeSpec[];

  // -- model (uncontrolled) --------------------------------------------------
  defaultNodes?: NodeSpec[];
  defaultEdges?: EdgeSpec[];

  // -- callbacks (QRLs — the `$` is what makes them lazily loadable) ---------
  onInit$?: QRL<(instance: DiagramInstance) => void>;
  onNodesChange$?: QRL<(nodes: NodeSpec[]) => void>;
  onEdgesChange$?: QRL<(edges: EdgeSpec[]) => void>;
  onSelectionChange$?: QRL<(change: SelectionChange) => void>;
  onConnect$?: QRL<(change: { link: LinkModel }) => void>;
  onNodeClick$?: QRL<(change: { node: NodeModel; world: { x: number; y: number } }) => void>;
  onEdgeClick$?: QRL<(change: { edge: LinkModel; world: { x: number; y: number } }) => void>;
  onLayoutDone$?: QRL<(result: unknown) => void>;
  onCollabReady$?: QRL<(session: SyncAdapter) => void>;

  // -- rendering -------------------------------------------------------------
  /** Custom node components, keyed by node `type`. */
  nodeTypes?: NodeTypes;
  theme?: Theme;
  fitView?: boolean;

  // -- interaction -----------------------------------------------------------
  enablePan?: boolean;
  enableZoom?: boolean;
  zoomSensitivity?: number;
  dragThreshold?: number;
  readonly?: boolean;
  minZoom?: number;
  maxZoom?: number;

  // -- SSR -------------------------------------------------------------------
  /**
   * The `renderToStaticSVG()` result. Renders server-side; the visible task
   * adopts the markup instead of rebuilding it, so there is no flash and no
   * re-layout. Put `ssr.css` in your document head.
   */
  ssr?: { html: string; snapshot: HydrationSnapshot };

  /**
   * Declarative auto-layout — any engine registry name ('elk', 'dagre',
   * 'force', 'tree', 'grid', 'auto', …) or `{ name, options }`. Re-runs when
   * the prop VALUE changes, never when node data changes.
   */
  layout?: string | GrafloriaLayoutRequest;
  /**
   * Canvas plugins — `true` mounts minimap + zoom/fit controls + background
   * grid with defaults; an object picks and configures them.
   */
  plugins?: boolean | CanvasPluginOptions;
  /**
   * Real-time collaboration: a transport + actor id. The flow joins a CRDT
   * sync session on mount and leaves on unmount. Fixed for the life of the
   * instance. `collab.transport` must be `noSerialize()`d.
   */
  collab?: NoSerialize<GrafloriaCollabOptions>;
  /**
   * Anchored comment threads — `true` creates a store, or pass a shared
   * `CommentStore` (which must be `noSerialize()`d).
   */
  comments?: boolean | NoSerialize<CommentStore>;
  /** Viewer id for a `comments: true`-created store. */
  commentsViewer?: string;
  /** Renderer config passthrough (parallelLinks, parallelSpacing, jump styles, …). */
  rendererConfig?: Record<string, unknown>;
  /** Interaction config passthrough (portVisibility, enableHelperLines, …). */
  interaction?: Record<string, unknown>;
  /** Design-token bridge — adopt the app's shadcn / MUI / Tailwind CSS variables. */
  tokenBridge?: unknown;
  /**
   * The outline layer: outlines around the hovered node, the selected node,
   * nodes with a validation issue, and valid connection targets. `true` turns
   * every kind on; an object turns kinds on or off one by one. Off when unset.
   * Follows the prop by VALUE.
   */
  highlighterConfig?: boolean | Partial<HighlighterConfig>;

  class?: string;
  style?: Record<string, string | number>;
}

export const GrafloriaFlow = component$<GrafloriaFlowProps>((props) => {
  const containerRef = useSignal<HTMLElement>();
  const instanceRef = useSignal<NoSerialize<DiagramInstance>>();
  // Publish to the nearest <GrafloriaProvider>, if any, so useGrafloria()
  // works from siblings (toolbars, inspectors).
  const providedStore = useContext(GRAFLORIA_STORE, null);

  // Track layout / plugins / highlighter by JSON VALUE, exactly as the React
  // and Vue wrappers do: an inline object must not re-apply on every render,
  // and a relayout must never fight a user's drag.
  const layoutKey = props.layout === undefined ? undefined : JSON.stringify(props.layout);
  const pluginsKey = props.plugins === undefined ? undefined : JSON.stringify(props.plugins);
  const highlighterKey = JSON.stringify(props.highlighterConfig ?? false);

  // -- mount ------------------------------------------------------------------
  // Everything DOM lives here. `useVisibleTask$` is browser-only, which is what
  // makes this component SSR-safe without a single `typeof window` check.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const container = containerRef.value;
    if (!container) return;

    const nodeTypes = props.nodeTypes;

    // One Qwik sub-render per custom node, keyed by node id so we can tear
    // each one down when the core removes its host.
    const mounted = new Map<string, { cleanup(): void }>();

    const options: CreateDiagramOptions = {
      nodes: withCustomFlag(props.nodes ?? props.defaultNodes, nodeTypes) ?? [],
      edges: props.edges ?? props.defaultEdges ?? [],
      theme: props.theme,
      fitView: props.fitView,
      enablePan: props.enablePan,
      enableZoom: props.enableZoom,
      zoomSensitivity: props.zoomSensitivity,
      dragThreshold: props.dragThreshold,
      readonly: props.readonly,
      minZoom: props.minZoom,
      maxZoom: props.maxZoom,
      hydrate: props.ssr?.snapshot,
      comments: props.comments,
      commentsViewer: props.commentsViewer,
      renderer: props.rendererConfig as never,
      interaction: props.interaction,
      tokenBridge: props.tokenBridge as never,
      highlighterConfig: props.highlighterConfig,

      // Qwik has no portal primitive, so a custom node is mounted with Qwik's
      // own `render()` into the host element the core hands us.
      //
      // RETURNING THE PROMISE IS DELIBERATE: the core's contract asks a painter
      // that draws later to return it, so `await diagram.export(…)` waits for
      // exactly the painters that are not done. Qwik's render is async, so this
      // is precisely the case that contract was written for — custom nodes show
      // up in exported SVG and PDF instead of coming out as marked boxes.
      //
      // CAVEAT, stated rather than hidden: `render()` creates a SEPARATE Qwik
      // container. A custom node cannot reach contexts provided by the
      // surrounding app (including router contexts). Keep them self-contained
      // and feed them through `node.data`.
      renderCustomNode: (node: NodeModel, element: HTMLElement) => {
        const Cmp = nodeTypes?.[node.type];
        // A `custom: true` node with no matching entry is a caller error;
        // render nothing rather than throwing in the middle of a canvas.
        if (!Cmp) return;
        return qwikRender(element, (
          <Cmp
            id={node.id}
            data={node.data as never}
            selected={node.isSelected()}
            node={node}
          />
        ) as never).then((result) => {
          mounted.set(node.id, result);
        });
      },
      removeCustomNode: (nodeId: string) => {
        mounted.get(nodeId)?.cleanup();
        mounted.delete(nodeId);
      },
    };

    const diagram = createDiagram(container, options);
    instanceRef.value = noSerialize(diagram);
    if (providedStore) providedStore.value = noSerialize(diagram);

    // -- collab ---------------------------------------------------------------
    let session: SyncAdapter | null = null;
    let presence: PresenceBinding | null = null;
    if (props.collab) {
      const { transport, actor, presence: presenceOpt, ...rest } = props.collab;
      session = createSyncSession(diagram.getModel(), transport, { actor, ...rest } as never);
      session.join();
      if (presenceOpt) {
        presence = bindPresence(diagram, session as never, presenceOpt === true ? {} : presenceOpt);
      }
      void props.onCollabReady$?.(session);
    }

    const offs = [
      diagram.on('nodes:change', ({ nodes: next }) => {
        void props.onNodesChange$?.(next.map((n) => toNodeSpec(n)));
      }),
      diagram.on('edges:change', ({ edges: next }) => {
        void props.onEdgesChange$?.(next.map((e) => toEdgeSpec(e)));
      }),
      diagram.on('selection:change', (change) => {
        void props.onSelectionChange$?.({ nodes: change.nodes, edges: change.edges });
      }),
      diagram.on('connect', (change) => void props.onConnect$?.(change)),
      diagram.on('node:click', (change) => void props.onNodeClick$?.(change)),
      diagram.on('edge:click', (change) => void props.onEdgeClick$?.(change)),
    ];

    void props.onInit$?.(diagram);

    cleanup(() => {
      presence?.dispose();
      presence = null;
      session?.leave();
      session?.dispose();
      session = null;
      for (const off of offs) off();
      for (const entry of mounted.values()) entry.cleanup();
      mounted.clear();
      diagram.dispose();
      instanceRef.value = undefined;
      if (providedStore) providedStore.value = undefined;
    });
  }, MOUNT_EAGERLY);

  // -- controlled model in ----------------------------------------------------
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const next = track(() => props.nodes);
    const instance = track(() => instanceRef.value);
    if (!next || !instance) return;
    instance.setNodes(withCustomFlag(next, props.nodeTypes)!);
  }, MOUNT_EAGERLY);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const next = track(() => props.edges);
    const instance = track(() => instanceRef.value);
    if (!next || !instance) return;
    instance.setEdges(next);
  }, MOUNT_EAGERLY);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const theme = track(() => props.theme);
    const instance = track(() => instanceRef.value);
    if (!theme || !instance) return;
    instance.setTheme(theme);
  }, MOUNT_EAGERLY);

  // -- the outline layer, live ------------------------------------------------
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const key = track(() => highlighterKey);
    const instance = track(() => instanceRef.value);
    if (!instance) return;
    instance.setHighlighterConfig(
      JSON.parse(key) as boolean | Partial<HighlighterConfig>
    );
  }, MOUNT_EAGERLY);

  // -- canvas plugins (minimap / controls / background) -----------------------
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const key = track(() => pluginsKey);
    const instance = track(() => instanceRef.value);
    if (!instance || key === undefined) return;
    const parsed = JSON.parse(key) as boolean | CanvasPluginOptions;
    if (parsed === false) return;

    // The plugin chain loads lazily — consumers who never pass `plugins` ship
    // none of it (the same recipe elkjs gets).
    let disposed = false;
    let attached: CanvasPlugins | null = null;
    void loadCanvasPlugins().then(({ attachCanvasPlugins }) => {
      if (disposed) return;
      attached = attachCanvasPlugins(
        instance,
        parsed === true ? { minimap: true, controls: true, background: true } : parsed
      );
    });
    cleanup(() => {
      disposed = true;
      attached?.dispose();
    });
  }, MOUNT_EAGERLY);

  // -- declarative layout -----------------------------------------------------
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const key = track(() => layoutKey);
    const instance = track(() => instanceRef.value);
    if (!instance || key === undefined) return;
    const req = JSON.parse(key) as string | GrafloriaLayoutRequest;
    const { name, options } = typeof req === 'string' ? { name: req, options: {} } : req;
    void instance
      .getEngine()
      .layout(name, options ?? {})
      .then((result) => {
        void props.onLayoutDone$?.(result);
      });
  }, MOUNT_EAGERLY);

  return (
    <div
      ref={containerRef}
      class={['grafloria-flow', props.class].filter(Boolean).join(' ')}
      style={{ width: '100%', height: '100%', position: 'relative', ...props.style }}
      // SSR: emit the server's markup verbatim. Qwik does not re-render
      // `dangerouslySetInnerHTML` content on resume, so the visible task above
      // adopts it untouched — that is the whole no-flash trick.
      {...(props.ssr ? { dangerouslySetInnerHTML: props.ssr.html } : {})}
    />
  );
});
