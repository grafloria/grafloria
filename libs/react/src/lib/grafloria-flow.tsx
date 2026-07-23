'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createSyncSession } from '@grafloria/engine';
import type { CommentStore, LinkModel, NodeModel, SyncAdapter, SyncTransport } from '@grafloria/engine';

/** The uniform collab contract every Grafloria wrapper shares. */
export interface GrafloriaCollabOptions {
  transport: SyncTransport;
  actor: string;
  /**
   * Live cursors + remote selection outlines. `true` for defaults, or
   * `{ name, color, smoothing, … }`.
   */
  presence?: boolean | BindPresenceOptions;
  /** Everything else passes through to `createSyncSession`'s options. */
  [option: string]: unknown;
}
import { createDiagram, loadCanvasPlugins, bindPresence } from '@grafloria/renderer';
import type { CanvasPluginOptions, BindPresenceOptions, PresenceBinding } from '@grafloria/renderer';
import type {
  CreateDiagramOptions,
  DiagramInstance,
  EdgeSpec,
  HydrationSnapshot,
  NodeSpec,
  Theme,
} from '@grafloria/renderer';
import { GrafloriaContext, createGrafloriaStore, useGrafloriaStore } from './context';
import type { GrafloriaStore } from './context';

/**
 * `<GrafloriaFlow>` — the React wrapper.
 *
 * It is deliberately a SHELL. Every line of diagram behaviour — hit-testing, the
 * mousedown priority ladder, panning, zooming, node dragging, connection
 * drawing, render scheduling — lives in `@grafloria/renderer`'s headless
 * `createDiagram()`. This component does exactly three things:
 *
 *   1. owns a `<div>` and hands it to `createDiagram()` in an effect,
 *   2. forwards `nodes` / `edges` props into `setNodes` / `setEdges`,
 *   3. turns the instance's events into React callbacks / state.
 *
 * If you ever find yourself adding diagram logic here, it belongs in the core.
 *
 * ## SSR (Card 6)
 *
 * `createDiagram()` is only ever called from `useEffect`, which never runs on the
 * server — so this component renders on the server without touching `window`.
 * Pass the result of `renderToStaticSVG()` as `ssr` and the server-rendered SVG
 * is emitted into the container, React hydrates it untouched (it is inside
 * `dangerouslySetInnerHTML`, which React does not diff), and the effect ADOPTS
 * that DOM instead of rebuilding it. No flash. No re-layout. React Flow cannot
 * do this — it is `'use client'` only.
 */

/** Props a custom node component receives. Deliberately React-Flow-shaped. */
export interface NodeProps<TData = Record<string, unknown>> {
  id: string;
  data: TData;
  selected: boolean;
  /** The live engine model — the escape hatch. */
  node: NodeModel;
}

/** `nodeTypes` maps a node's `type` to the component that renders it. */
export type NodeTypes = Record<string, ComponentType<NodeProps<never>>>;

export interface GrafloriaFlowProps {
  // -- model (controlled) ----------------------------------------------------
  /** Controlled nodes. Provide with `onNodesChange` (see `useNodesState`). */
  nodes?: NodeSpec[];
  /** Controlled edges. */
  edges?: EdgeSpec[];

  // -- model (uncontrolled) --------------------------------------------------
  /** Uncontrolled nodes — the instance owns them from here on. */
  defaultNodes?: NodeSpec[];
  defaultEdges?: EdgeSpec[];

  // -- callbacks -------------------------------------------------------------
  onNodesChange?: (nodes: NodeModel[]) => void;
  onEdgesChange?: (edges: LinkModel[]) => void;
  onSelectionChange?: (change: { nodes: NodeModel[]; edges: LinkModel[] }) => void;
  onConnect?: (change: { link: LinkModel }) => void;
  onNodeClick?: (change: { node: NodeModel; world: { x: number; y: number } }) => void;
  onEdgeClick?: (change: { edge: LinkModel; world: { x: number; y: number } }) => void;
  onInit?: (instance: DiagramInstance) => void;

  // -- rendering -------------------------------------------------------------
  /** Custom node components, keyed by node `type`. */
  nodeTypes?: NodeTypes;
  theme?: Theme;
  fitView?: boolean;

  // -- interaction (forwarded to the binder) ---------------------------------
  enablePan?: boolean;
  enableZoom?: boolean;
  zoomSensitivity?: number;
  dragThreshold?: number;
  readonly?: boolean;
  minZoom?: number;
  maxZoom?: number;

  // -- SSR -------------------------------------------------------------------
  /** The `renderToStaticSVG()` result. Renders server-side, hydrates client-side. */
  ssr?: { html: string; snapshot: HydrationSnapshot };
  /**
   * Declarative auto-layout — any engine registry name ('elk', 'dagre',
   * 'force', 'tree', 'grid', 'auto', …) or `{ name, options }`. Re-runs when
   * the prop VALUE changes, never when node data changes.
   */
  layout?: string | { name: string; options?: Record<string, unknown> };
  /** Fires after each declarative layout completes. */
  onLayoutDone?: (result: unknown) => void;
  /**
   * Canvas plugins — `true` mounts minimap + zoom/fit controls + background
   * grid with defaults; an object picks and configures them.
   */
  plugins?: boolean | CanvasPluginOptions;
  /**
   * Real-time collaboration: hand in a transport (BroadcastChannelTransport,
   * WebSocketTransport, MemoryTransport, …) and an actor id — the flow joins a
   * CRDT sync session at mount and leaves on unmount. Fixed for the life of
   * the instance.
   */
  collab?: GrafloriaCollabOptions;
  /** The live SyncAdapter, right after `join()`. */
  onCollabReady?: (session: SyncAdapter) => void;
  /**
   * Anchored comment threads — `true` creates a store, or pass a shared
   * `CommentStore`. Read it back with `useGrafloria()?.getCommentStore()`.
   */
  comments?: boolean | CommentStore;
  /** Viewer id for a `comments: true`-created store. */
  commentsViewer?: string;
  /** Renderer config passthrough (parallelLinks, parallelSpacing, jump styles, …). */
  rendererConfig?: Record<string, unknown>;
  /** Interaction config passthrough (portVisibility, enableHelperLines, …). */
  interaction?: Record<string, unknown>;

  className?: string;
  style?: CSSProperties;
  /** Overlays (toolbars, panels). Rendered as siblings of the canvas. */
  children?: ReactNode;
}

/** One mounted custom node: the engine model + the host element the core gave us. */
interface NodePortal {
  node: NodeModel;
  element: HTMLElement;
}

export function GrafloriaFlow(props: GrafloriaFlowProps) {
  const {
    nodes,
    edges,
    defaultNodes,
    defaultEdges,
    nodeTypes,
    ssr,
    className,
    style,
    children,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<DiagramInstance | null>(null);
  const [portals, setPortals] = useState<NodePortal[]>([]);

  // Callbacks live in a ref so a new inline arrow on every render does NOT tear
  // the instance down and rebuild it.
  const callbacks = useRef(props);
  callbacks.current = props;

  // Publish the instance to the nearest <GrafloriaProvider>, or make our own store so
  // `useGrafloria()` also works for our own children with no provider in sight.
  const outerStore = useGrafloriaStore();
  const [ownStore] = useState<GrafloriaStore>(() => createGrafloriaStore());
  const store = outerStore ?? ownStore;

  // -- mount ------------------------------------------------------------------
  // Everything DOM lives here: this effect never runs on the server, which is
  // what makes the component SSR-safe without a single `typeof window` check.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const options: CreateDiagramOptions = {
      nodes: callbacks.current.nodes ?? callbacks.current.defaultNodes ?? [],
      edges: callbacks.current.edges ?? callbacks.current.defaultEdges ?? [],
      theme: callbacks.current.theme,
      fitView: callbacks.current.fitView,
      enablePan: callbacks.current.enablePan,
      enableZoom: callbacks.current.enableZoom,
      zoomSensitivity: callbacks.current.zoomSensitivity,
      dragThreshold: callbacks.current.dragThreshold,
      readonly: callbacks.current.readonly,
      minZoom: callbacks.current.minZoom,
      maxZoom: callbacks.current.maxZoom,
      hydrate: callbacks.current.ssr?.snapshot,
      comments: callbacks.current.comments,
      commentsViewer: callbacks.current.commentsViewer,
      renderer: callbacks.current.rendererConfig as never,
      interaction: callbacks.current.interaction,

      // Blocker #4, from React's side: the core hands us an element, we render a
      // PORTAL into it. Portals keep the node component inside this React tree —
      // so it has context, hooks and state, and React (not us) owns its
      // lifecycle. This is also why `createPortal` and not `createRoot`: portals
      // work identically on React 17, 18 and 19.
      renderCustomNode: (node, element) => {
        setPortals((current) =>
          current.some((p) => p.node.id === node.id)
            ? current
            : [...current, { node, element }]
        );
      },
      removeCustomNode: (nodeId) => {
        setPortals((current) => current.filter((p) => p.node.id !== nodeId));
      },
    };

    const diagram = createDiagram(container, options);

    // Collab: join the CRDT sync session over the supplied transport. Fixed
    // for the life of the instance — remounting is the way to change rooms.
    let session: SyncAdapter | null = null;
    let presence: PresenceBinding | null = null;
    if (callbacks.current.collab) {
      const { transport, actor, presence: presenceOpt, ...rest } = callbacks.current.collab;
      session = createSyncSession(diagram.getModel(), transport, { actor, ...rest } as never);
      session.join();
      if (presenceOpt) {
        presence = bindPresence(
          diagram,
          session as never,
          presenceOpt === true ? {} : presenceOpt
        );
      }
      callbacks.current.onCollabReady?.(session);
    }

    const offs = [
      diagram.on('nodes:change', ({ nodes: next }) =>
        callbacks.current.onNodesChange?.(next)
      ),
      diagram.on('edges:change', ({ edges: next }) =>
        callbacks.current.onEdgesChange?.(next)
      ),
      diagram.on('selection:change', (change) =>
        callbacks.current.onSelectionChange?.(change)
      ),
      diagram.on('connect', (change) => callbacks.current.onConnect?.(change)),
      diagram.on('node:click', (change) => callbacks.current.onNodeClick?.(change)),
      diagram.on('edge:click', (change) => callbacks.current.onEdgeClick?.(change)),
    ];

    setInstance(diagram);
    store.set(diagram);
    callbacks.current.onInit?.(diagram);

    return () => {
      presence?.dispose();
      presence = null;
      session?.leave();
      session?.dispose();
      session = null;
      for (const off of offs) off();
      store.set(null);
      setInstance(null);
      setPortals([]);
      diagram.dispose();
    };
    // Mount once. Model + callbacks are synced through the effects below and the
    // ref above; re-creating the instance on a prop change would throw away the
    // camera, the selection and every mounted custom node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // -- controlled model -------------------------------------------------------
  useEffect(() => {
    if (!instance || !nodes) return;
    instance.setNodes(nodes);
  }, [instance, nodes]);

  useEffect(() => {
    if (!instance || !edges) return;
    instance.setEdges(edges);
  }, [instance, edges]);

  useEffect(() => {
    if (!instance || !props.theme) return;
    instance.setTheme(props.theme);
  }, [instance, props.theme]);

  // -- canvas plugins (minimap / controls / background) -----------------------
  const pluginsKey = props.plugins === undefined ? undefined : JSON.stringify(props.plugins);
  useEffect(() => {
    if (!instance || pluginsKey === undefined) return;
    const parsed = JSON.parse(pluginsKey) as boolean | CanvasPluginOptions;
    if (parsed === false) return;
    // The plugin chain loads lazily — consumers who never pass `plugins`
    // ship none of it (the elkjs recipe).
    let disposed = false;
    let dispose: (() => void) | undefined;
    void loadCanvasPlugins().then(({ attachCanvasPlugins }) => {
      if (disposed) return;
      const attached = attachCanvasPlugins(
        instance,
        parsed === true ? { minimap: true, controls: true, background: true } : parsed
      );
      dispose = () => attached.dispose();
    });
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [instance, pluginsKey]);

  // -- declarative layout -----------------------------------------------------
  // Runs when the `layout` prop (by VALUE, so inline objects are fine) or the
  // instance changes — never when node data changes, so user drags are not
  // fought by a relayout. Re-run on demand via `useGrafloria().getEngine()`.
  const layoutKey = props.layout === undefined ? undefined : JSON.stringify(props.layout);
  useEffect(() => {
    if (!instance || layoutKey === undefined) return;
    const req = JSON.parse(layoutKey) as string | { name: string; options?: Record<string, unknown> };
    const { name, options } = typeof req === 'string' ? { name: req, options: {} } : req;
    let cancelled = false;
    void instance
      .getEngine()
      .layout(name, options ?? {})
      .then((result) => {
        if (!cancelled) callbacks.current.onLayoutDone?.(result);
      });
    return () => {
      cancelled = true;
    };
  }, [instance, layoutKey]);

  const rootStyle = useMemo<CSSProperties>(
    () => ({ width: '100%', height: '100%', position: 'relative', ...style }),
    [style]
  );

  const content = (
    <>
      <div
        ref={containerRef}
        className={['grafloria-flow', className].filter(Boolean).join(' ')}
        style={rootStyle}
        // SSR: emit the server's markup verbatim. React does not diff inside
        // dangerouslySetInnerHTML, so hydration leaves it alone and the effect
        // above adopts it — that is the whole no-flash trick.
        {...(ssr ? { dangerouslySetInnerHTML: { __html: ssr.html } } : {})}
      />
      {portals.map((portal) => (
        <NodePortalHost
          key={portal.node.id}
          portal={portal}
          nodeTypes={nodeTypes}
          instance={instance}
        />
      ))}
      {children}
    </>
  );

  // When there is no outer provider we still publish to our own store, so that
  // `useGrafloria()` works for `children` without forcing everyone to wrap.
  return outerStore ? (
    content
  ) : (
    <GrafloriaContext.Provider value={ownStore}>{content}</GrafloriaContext.Provider>
  );
}

/**
 * Renders one custom node component into the host element the core created,
 * and keeps it in sync with the model (selection, data) via the instance's
 * events rather than a React render of the whole flow.
 */
function NodePortalHost({
  portal,
  nodeTypes,
  instance,
}: {
  portal: NodePortal;
  nodeTypes: NodeTypes | undefined;
  instance: DiagramInstance | null;
}) {
  const { node, element } = portal;
  const Component = nodeTypes?.[node.type];
  const [, force] = useState(0);

  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    if (!instance) return;
    const offNodes = instance.on('nodes:change', rerender);
    const offSelection = instance.on('selection:change', rerender);
    return () => {
      offNodes();
      offSelection();
    };
  }, [instance, rerender]);

  if (!Component) {
    // A `custom: true` node with no matching entry in `nodeTypes` is a caller
    // error; render nothing rather than an exception in the middle of a canvas.
    return null;
  }

  return createPortal(
    <Component
      id={node.id}
      data={node.data as never}
      selected={node.isSelected()}
      node={node}
    />,
    element
  );
}
