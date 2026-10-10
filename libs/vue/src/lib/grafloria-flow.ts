/**
 * `<GrafloriaFlow>` — Vue 3 bindings for the Grafloria diagram engine.
 *
 * The same architecture as the React wrapper: the component owns a `<div>`,
 * hands it to `createDiagram()` on mount, forwards prop changes into
 * `setNodes`/`setEdges`, and turns instance events into Vue emits. Custom
 * nodes are NAMED SLOTS — the Vue idiom:
 *
 * ```vue
 * <GrafloriaFlow v-model:nodes="nodes" v-model:edges="edges" layout="elk">
 *   <template #node-job="{ node, data }">
 *     <div class="job-card">{{ data.title }}</div>
 *   </template>
 * </GrafloriaFlow>
 * ```
 *
 * A node whose `type` is `job` renders through `#node-job`; `#node` (no type)
 * is the wildcard for any custom node without an exact slot. Slot content is
 * real Vue — reactivity, components, and event handlers all work, rendered
 * into the engine's HTML layer with Vue's low-level `render()` under this
 * component's app context: `inject` (app-level and from the components above
 * the flow), globally registered components, plugins' global properties and
 * `useGrafloria()` all work inside a node.
 *
 * Children in the default slot render after the canvas and reach the instance
 * through the composables (`useGrafloria()`, `useSelection()`, …) without a
 * `<GrafloriaProvider>`. Inside a provider the flow publishes to that one, so its
 * siblings see the instance too.
 */
import {
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  isProxy,
  mergeProps,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  render as vueRender,
  shallowRef,
  toRaw,
  watch,
  type AppContext,
  type PropType,
  type ShallowRef,
  type Slots,
  type VNode,
} from 'vue';
import { createSyncSession } from '@grafloria/engine';
import type { NodeModel, LinkModel, GroupModel, DiagramEngine, SyncAdapter, SyncTransport } from '@grafloria/engine';
import { GRAFLORIA_STORE, type SelectionChange } from './composables';
import { watchControlledList } from './controlled-list';
import { specKey } from './spec-key';

/** The uniform collab contract every Grafloria wrapper shares. */
export interface GrafloriaCollabOptions {
  transport: SyncTransport;
  actor: string;
  /** Live cursors + remote selection outlines. `true` for defaults. */
  presence?: boolean | BindPresenceOptions;
  [option: string]: unknown;
}
import {
  createDiagram,
  loadCanvasPlugins,
  bindPresence,
  toNodeSpec,
  toEdgeSpec,
  type BindPresenceOptions,
  type PresenceBinding,
  type CanvasPluginOptions,
  type CanvasPlugins,
  type DiagramInstance,
  type NodeSpec,
  type EdgeSpec,
  type Theme,
  type ColorMode,
  type HighlighterConfig,
  type HighlightConnectedOptions,
  type GroupSpec,
  type TokenBridge,
} from '@grafloria/renderer';

export interface GrafloriaLayoutRequest {
  name: string;
  options?: Record<string, unknown>;
}

/** Context handed to `#node-<type>` slots. */
export interface NodeSlotProps {
  node: NodeModel;
  data: Record<string, unknown>;
  engine: DiagramEngine;
}

/** A plain spec object, not a live model the reconciler takes as it is. */
const isPlainSpec = (value: unknown): boolean => {
  const proto = value !== null && typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  return proto === Object.prototype || proto === null;
};

/** The array's items as plain data, so no reactive proxy ends up inside the canvas. */
const rawList = <T>(list: readonly T[] | undefined): T[] | undefined => (list ? [...toRaw(list)] : undefined);

/**
 * The root of one custom node's slot content. A component (not a bare element) so
 * that the app context set on its vnode is inherited by every component below it,
 * and so the slot is invoked inside a render function, which tracks what it reads.
 */
const NodeSlotHost = defineComponent({
  name: 'GrafloriaNodeSlot',
  props: {
    content: { type: Function as PropType<(p: NodeSlotProps) => VNode[]>, required: true },
    context: { type: Object as PropType<NodeSlotProps>, required: true },
  },
  setup: (props) => () => h('div', { style: 'width:100%;height:100%' }, props.content(props.context)),
});

interface MountedNode {
  node: NodeModel;
  element: HTMLElement;
}

/**
 * The app context a custom node's slot content is rendered with. A programmatic
 * `render()` root has none, so it is given the flow's (components, directives,
 * config and global properties), with the provides swapped for the ones the flow
 * itself sees — its ancestors', the app's and its store — so `inject` inside a node
 * finds what it would find beside the flow. Call in `setup`, after the flow's `provide`.
 */
function nodeSlotAppContext(store: ShallowRef<DiagramInstance | null>): AppContext | null {
  const owner = getCurrentInstance();
  if (!owner) return null;
  // `provides` is the object Vue's own `inject` walks; read it where it exists.
  const own = (owner as unknown as { provides?: AppContext['provides'] }).provides;
  const provides = own ?? Object.assign(Object.create(owner.appContext.provides), { [GRAFLORIA_STORE as symbol]: store });
  return { ...owner.appContext, provides };
}

export const GrafloriaFlow = defineComponent({
  name: 'GrafloriaFlow',
  // Attributes go on the canvas element, also when default-slot children render beside it.
  inheritAttrs: false,
  props: {
    /** Controlled nodes — `v-model:nodes`. */
    nodes: { type: Array as PropType<NodeSpec[]>, default: undefined },
    /** Controlled edges — `v-model:edges`. */
    edges: { type: Array as PropType<EdgeSpec[]>, default: undefined },
    /**
     * Controlled groups — zones around some nodes (a spec's `groups`, or the live
     * GroupModels of a loaded document). Reconciled like `nodes`.
     */
    groups: { type: Array as PropType<Array<GroupSpec | GroupModel>>, default: undefined },
    /** Uncontrolled initial data. */
    defaultNodes: { type: Array as PropType<NodeSpec[]>, default: undefined },
    defaultEdges: { type: Array as PropType<EdgeSpec[]>, default: undefined },
    defaultGroups: { type: Array as PropType<Array<GroupSpec | GroupModel>>, default: undefined },
    theme: { type: Object as PropType<Theme>, default: undefined },
    /**
     * `'light'` or `'dark'` pins the built-in light/dark theme; `'system'` follows
     * the OS (and its high-contrast setting). Applied at mount; a change applies
     * live, with no remount. While a mode is set, `theme` does not override it —
     * the same rule as Angular's `colorMode` input. Removing it keeps the last mode.
     */
    colorMode: { type: String as PropType<ColorMode>, default: undefined },
    /**
     * Declarative auto-layout — any engine registry name ('elk', 'dagre',
     * 'force', 'tree', 'grid', 'auto', …) or `{ name, options }`. Re-runs when
     * the prop VALUE changes, never when node data changes.
     */
    layout: {
      type: [String, Object] as PropType<string | GrafloriaLayoutRequest>,
      default: undefined,
    },
    /**
     * Canvas plugins — `true` mounts minimap + zoom/fit controls + background
     * grid with defaults; an object picks and configures them.
     */
    plugins: {
      type: [Boolean, Object] as PropType<boolean | CanvasPluginOptions>,
      default: undefined,
    },
    /**
     * Real-time collaboration: a transport + actor id — the flow joins a CRDT
     * sync session at mount and leaves on unmount. Fixed for the instance.
     */
    collab: {
      type: Object as PropType<GrafloriaCollabOptions>,
      default: undefined,
    },
    /** Anchored comment threads — `true` creates a store; or pass a shared one. */
    comments: {
      type: [Boolean, Object] as PropType<boolean | object>,
      default: undefined,
    },
    commentsViewer: { type: String, default: undefined },
    fitView: { type: Boolean, default: undefined },
    enablePan: { type: Boolean, default: undefined },
    enableZoom: { type: Boolean, default: undefined },
    readonly: { type: Boolean, default: undefined },
    minZoom: { type: Number, default: undefined },
    maxZoom: { type: Number, default: undefined },
    zoomSensitivity: { type: Number, default: undefined },
    /** Renderer config passthrough (parallelLinks, parallelSpacing, jump styles, …). */
    rendererConfig: { type: Object as PropType<Record<string, unknown>>, default: undefined },
    /** Interaction config passthrough (portVisibility, enableHelperLines, …). */
    interaction: { type: Object as PropType<Record<string, unknown>>, default: undefined },
    /** Design-token bridge — adopt the app's shadcn / MUI / Tailwind CSS variables. */
    tokenBridge: { type: Object as PropType<TokenBridge>, default: undefined },
    /**
     * The outline layer Angular's canvas draws: outlines around the hovered node,
     * the selected node, nodes with a validation issue, and valid connection
     * targets. `true` turns every kind on; an object turns kinds on or off one by
     * one. Off when unset. Live: follows the prop by value.
     */
    highlighterConfig: { type: [Boolean, Object] as PropType<boolean | Partial<HighlighterConfig>>, default: undefined },
    /**
     * Bring the selected nodes' lines forward and fade the rest: `true`, or
     * options (depth, stroke, outgoing, dimOpacity). Off when unset. Live:
     * follows the prop by value.
     */
    highlightConnected: { type: [Boolean, Object] as PropType<boolean | HighlightConnectedOptions>, default: undefined },
  },
  // Typed with their payloads, so `vue-tsc` checks a template handler (and `tsc` an
  // `h()` one) against what the component really hands it. The functions are only
  // type carriers; returning true means "always valid" at runtime.
  emits: {
    'update:nodes': (_nodes: NodeSpec[]) => true,
    'update:edges': (_edges: EdgeSpec[]) => true,
    init: (_instance: DiagramInstance) => true,
    selectionChange: (_change: SelectionChange) => true,
    connect: (_change: { link: LinkModel }) => true,
    nodeClick: (_change: { node: NodeModel; world: { x: number; y: number } }) => true,
    edgeClick: (_change: { edge: LinkModel; world: { x: number; y: number } }) => true,
    layoutDone: (_result: unknown) => true,
    collabReady: (_session: SyncAdapter) => true,
  },
  setup(props, { emit, slots, expose, attrs }) {
    const container = ref<HTMLElement | null>(null);
    const instance = shallowRef<DiagramInstance | null>(null);
    // Publish to the nearest <GrafloriaProvider>, so useGrafloria() works from
    // siblings (toolbars, inspectors) — or, with none above, provide our own store
    // so it works for our children and custom nodes without one.
    const outerStore = inject(GRAFLORIA_STORE, undefined);
    const store: ShallowRef<DiagramInstance | null> = outerStore ?? shallowRef<DiagramInstance | null>(null);
    if (!outerStore) provide(GRAFLORIA_STORE, store);
    const slotAppContext = nodeSlotAppContext(store);
    const mounted = new Map<string, MountedNode>();
    const offs: Array<() => void> = [];
    /** The arrays this canvas last emitted through `update:nodes` / `update:edges`. */
    let emittedNodes: readonly NodeSpec[] | null = null;
    let emittedEdges: readonly EdgeSpec[] | null = null;

    const slotFor = (node: NodeModel): ((p: NodeSlotProps) => VNode[]) | undefined => {
      const type = (node.type ?? (node as any).getMetadata?.('type')) as string | undefined;
      const s: Slots = slots;
      return (type && (s[`node-${type}`] as any)) || (s['node'] as any) || undefined;
    };

    /**
     * Declaring `#node-<type>` IS the opt-in (the same DX as the Angular
     * wrapper): specs whose type has an exact slot are flagged `custom`
     * automatically. Explicit `custom` always wins; the wildcard `#node` slot
     * renders already-custom nodes but does not flag anything itself.
     */
    const withSlotCustom = (specs: NodeSpec[] | undefined): NodeSpec[] | undefined =>
      specs?.map((spec) =>
        isPlainSpec(spec) && spec.custom === undefined && spec.type && slots[`node-${spec.type}`]
          ? { ...spec, custom: true }
          : spec
      );

    const paintSlot = (entry: MountedNode): void => {
      const inst = instance.value;
      const slot = slotFor(entry.node);
      if (!inst || !slot) return;
      const ctx: NodeSlotProps = {
        node: entry.node,
        data: ((entry.node as any).data ?? {}) as Record<string, unknown>,
        engine: inst.getEngine(),
      };
      // A separate render root starts with no app context of its own; give it ours.
      const vnode = h(NodeSlotHost, { content: slot, context: ctx });
      if (slotAppContext) vnode.appContext = slotAppContext;
      vueRender(vnode, entry.element);
    };

    const repaintSlots = (): void => {
      for (const entry of mounted.values()) paintSlot(entry);
    };

    let session: SyncAdapter | null = null;
    let presence: PresenceBinding | null = null;
    let plugins: CanvasPlugins | null = null;
    let pluginsEpoch = 0;
    const attachPlugins = (config: boolean | CanvasPluginOptions | undefined): void => {
      plugins?.dispose();
      plugins = null;
      const epoch = ++pluginsEpoch;
      const inst = instance.value;
      if (!inst || config === undefined || config === false) return;
      // Lazy chain — consumers who never pass `plugins` ship none of it.
      void loadCanvasPlugins().then(({ attachCanvasPlugins }) => {
        if (epoch !== pluginsEpoch || instance.value !== inst) return;
        plugins = attachCanvasPlugins(
          inst,
          config === true ? { minimap: true, controls: true, background: true } : config
        );
      });
    };

    const runLayout = async (req: string | GrafloriaLayoutRequest): Promise<void> => {
      const inst = instance.value;
      if (!inst) return;
      const { name, options } = typeof req === 'string' ? { name: req, options: {} } : req;
      const result = await inst.getEngine().layout(name, options ?? {});
      emit('layoutDone', result);
    };

    onMounted(() => {
      const el = container.value;
      if (!el) return;

      const inst = createDiagram(el, {
        nodes: withSlotCustom(rawList(props.nodes ?? props.defaultNodes)) ?? [],
        edges: rawList(props.edges ?? props.defaultEdges) ?? [],
        groups: rawList(props.groups ?? props.defaultGroups),
        theme: props.theme && toRaw(props.theme),
        colorMode: props.colorMode,
        fitView: props.fitView,
        enablePan: props.enablePan,
        enableZoom: props.enableZoom,
        readonly: props.readonly,
        minZoom: props.minZoom,
        maxZoom: props.maxZoom,
        zoomSensitivity: props.zoomSensitivity,
        comments: props.comments,
        commentsViewer: props.commentsViewer,
        renderer: props.rendererConfig as never,
        interaction: props.interaction,
        tokenBridge: props.tokenBridge,
        highlighterConfig: props.highlighterConfig,
        highlightConnected: props.highlightConnected,
        renderCustomNode: (node: NodeModel, element: HTMLElement) => {
          const entry: MountedNode = { node, element };
          mounted.set(node.id, entry);
          paintSlot(entry);
        },
        // A deleted custom node's Vue tree is unmounted with it — otherwise it stayed
        // mounted (effects, listeners, onUnmounted never run) and kept being repainted.
        removeCustomNode: (nodeId: string, element: HTMLElement) => {
          vueRender(null, element);
          if (mounted.get(nodeId)?.element === element) mounted.delete(nodeId);
        },
      } as any);
      instance.value = inst;
      store.value = inst;
      // createDiagram paints synchronously DURING the call above, so
      // renderCustomNode fired before `instance.value` existed and paintSlot
      // bailed — paint every mounted host now that the instance is available.
      repaintSlots();

      offs.push(
        inst.on('nodes:change', ({ nodes: next }: { nodes: NodeModel[] }) => {
          repaintSlots();
          if (props.nodes === undefined) return;
          const specs = next.map((n) => toNodeSpec(n));
          emittedNodes = specs;
          emit('update:nodes', specs);
        }),
        inst.on('edges:change', ({ edges: next }: { edges: LinkModel[] }) => {
          if (props.edges === undefined) return;
          const specs = next.map((e) => toEdgeSpec(e));
          emittedEdges = specs;
          emit('update:edges', specs);
        }),
        inst.on('selection:change', (change) => emit('selectionChange', change)),
        inst.on('connect', (change) => emit('connect', change)),
        inst.on('node:click', (change) => emit('nodeClick', change)),
        inst.on('edge:click', (change) => emit('edgeClick', change))
      );

      emit('init', inst);
      if (props.collab) {
        const { transport, actor, presence: presenceOpt, ...rest } = props.collab;
        session = createSyncSession(inst.getModel(), transport, { actor, ...rest } as never);
        session.join();
        if (presenceOpt) {
          presence = bindPresence(inst, session as never, presenceOpt === true ? {} : presenceOpt);
        }
        emit('collabReady', session);
      }
      attachPlugins(props.plugins);
      if (props.layout !== undefined) void runLayout(props.layout);
    });

    // -- controlled data IN --------------------------------------------------
    // Replacing an array and changing it in place both reach the canvas; the
    // canvas's own `update:*` value, written back by v-model, is not applied again.
    // The positional ids (`node-3`) are the renderer reconciler's own default for an id-less spec.
    const model = () => instance.value?.getModel();
    watchControlledList<NodeSpec>({
      source: () => props.nodes,
      idOf: (item, index) => (item as { id?: string }).id ?? `node-${index}`,
      live: (id) => model()?.getNode(id),
      apply: (items) => instance.value?.setNodes(withSlotCustom(items as NodeSpec[])!),
      isOwnEcho: (array) => array === emittedNodes,
    });
    watchControlledList<EdgeSpec>({
      source: () => props.edges,
      idOf: (item, index) => (item as { id?: string }).id ?? `edge-${index}`,
      live: (id) => model()?.getLink(id),
      apply: (items) => instance.value?.setEdges(items as EdgeSpec[]),
      isOwnEcho: (array) => array === emittedEdges,
    });
    watchControlledList<GroupSpec | GroupModel>({
      source: () => props.groups,
      idOf: (item) => item.id,
      live: (id) => model()?.getGroup(id),
      apply: (items) => instance.value?.setGroups(items as Array<GroupSpec | GroupModel>),
    });
    // The theme follows its reference AND its content (a token changed in place).
    watch(
      () => [props.theme, props.theme && isProxy(props.theme) ? specKey(props.theme, null) : ''] as const,
      ([next, key], prev) => {
        if (prev && next === prev[0] && key === prev[1]) return;
        // A colour mode decides the theme while it is set; a stray theme must not fight it.
        if (next && instance.value && !props.colorMode) instance.value.setTheme(toRaw(next));
      }
    );
    watch(
      () => props.colorMode,
      (next) => {
        const inst = instance.value;
        if (next && inst && inst.getColorMode() !== next) inst.setColorMode(next);
      }
    );
    watch(
      () => (props.plugins === undefined ? undefined : JSON.stringify(props.plugins)),
      (key) => attachPlugins(key === undefined ? undefined : JSON.parse(key))
    );
    // The outline layer follows the prop by VALUE (an inline object is fine).
    watch(
      () => JSON.stringify(props.highlighterConfig ?? false),
      (key) => instance.value?.setHighlighterConfig(JSON.parse(key) as boolean | Partial<HighlighterConfig>)
    );
    // …and so does the selection's line highlight. The key only DETECTS a
    // change; the prop itself is applied (JSON turns `depth: Infinity` into null).
    watch(
      () => JSON.stringify(props.highlightConnected ?? false),
      () => instance.value?.setHighlightConnected(props.highlightConnected ?? false)
    );
    // Layout re-runs on VALUE change only (JSON key), never on node data.
    watch(
      () => (props.layout === undefined ? undefined : JSON.stringify(props.layout)),
      (key) => {
        if (key !== undefined) void runLayout(JSON.parse(key));
      }
    );

    onBeforeUnmount(() => {
      presence?.dispose();
      presence = null;
      session?.leave();
      session?.dispose();
      session = null;
      plugins?.dispose();
      plugins = null;
      for (const off of offs) off();
      for (const entry of mounted.values()) vueRender(null, entry.element);
      mounted.clear();
      if (store.value === instance.value) store.value = null;
      instance.value?.dispose();
      instance.value = null;
    });

    expose({
      /** The live DiagramInstance — full engine/renderer surface. */
      getInstance: () => instance.value,
      applyLayout: (req: string | GrafloriaLayoutRequest) => runLayout(req),
      exportSvg: (options?: unknown) => instance.value?.exportSvgString(options as any),
      exportPdf: (options?: unknown) => instance.value?.exportPdf(options as any),
      exportDiagram: (format?: string, options?: unknown) =>
        instance.value?.export(format as any, options as any),
      snapshot: () => instance.value?.getModel().serialize() ?? null,
      exportText: (options?: unknown) => instance.value?.exportText(options as any),
      loadText: (text: string, options?: unknown) => instance.value?.loadText(text, options as any),
      fitView: (padding?: number) => instance.value?.fitView(padding),
    });

    return () => {
      const canvas = h(
        'div',
        mergeProps(
          { ref: container, class: 'grafloria-flow', style: 'width:100%;height:100%;position:relative' },
          attrs
        )
      );
      // Only a flow WITH children renders a fragment; one without keeps its single root.
      const children = slots['default']?.();
      return children ? [canvas, children] : canvas;
    };
  },
});
