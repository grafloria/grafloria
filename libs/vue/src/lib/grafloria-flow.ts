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
 * into the engine's HTML layer with Vue's low-level `render()`.
 */
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  render as vueRender,
  shallowRef,
  watch,
  type PropType,
  type Slots,
  type VNode,
} from 'vue';
import { inject } from 'vue';
import { createSyncSession } from '@grafloria/engine';
import type { NodeModel, LinkModel, DiagramEngine, SyncAdapter, SyncTransport } from '@grafloria/engine';
import { GRAFLORIA_STORE } from './composables';

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

interface MountedNode {
  node: NodeModel;
  element: HTMLElement;
}

export const GrafloriaFlow = defineComponent({
  name: 'GrafloriaFlow',
  props: {
    /** Controlled nodes — `v-model:nodes`. */
    nodes: { type: Array as PropType<NodeSpec[]>, default: undefined },
    /** Controlled edges — `v-model:edges`. */
    edges: { type: Array as PropType<EdgeSpec[]>, default: undefined },
    /** Uncontrolled initial data. */
    defaultNodes: { type: Array as PropType<NodeSpec[]>, default: undefined },
    defaultEdges: { type: Array as PropType<EdgeSpec[]>, default: undefined },
    theme: { type: Object as PropType<Theme>, default: undefined },
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
  },
  emits: [
    'update:nodes',
    'update:edges',
    'init',
    'selectionChange',
    'connect',
    'nodeClick',
    'edgeClick',
    'layoutDone',
    'collabReady',
  ],
  setup(props, { emit, slots, expose }) {
    const container = ref<HTMLElement | null>(null);
    const instance = shallowRef<DiagramInstance | null>(null);
    // Publish to the nearest <GrafloriaProvider>, if any, so useGrafloria()
    // works from siblings (toolbars, inspectors).
    const providedStore = inject(GRAFLORIA_STORE, undefined);
    const mounted = new Map<string, MountedNode>();
    const offs: Array<() => void> = [];

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
        spec.custom === undefined && spec.type && slots[`node-${spec.type}`]
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
      vueRender(h('div', { style: 'width:100%;height:100%' }, slot(ctx)), entry.element);
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
        nodes: withSlotCustom(props.nodes ?? props.defaultNodes) ?? [],
        edges: props.edges ?? props.defaultEdges ?? [],
        theme: props.theme,
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
        renderCustomNode: (node: NodeModel, element: HTMLElement) => {
          const entry: MountedNode = { node, element };
          mounted.set(node.id, entry);
          paintSlot(entry);
        },
      } as any);
      instance.value = inst;
      // createDiagram paints synchronously DURING the call above, so
      // renderCustomNode fired before `instance.value` existed and paintSlot
      // bailed — paint every mounted host now that the instance is available.
      repaintSlots();

      offs.push(
        inst.on('nodes:change', ({ nodes: next }: { nodes: NodeModel[] }) => {
          repaintSlots();
          if (props.nodes !== undefined) emit('update:nodes', next.map((n) => toNodeSpec(n)));
        }),
        inst.on('edges:change', ({ edges: next }: { edges: LinkModel[] }) => {
          if (props.edges !== undefined) emit('update:edges', next.map((e) => toEdgeSpec(e)));
        }),
        inst.on('selection:change', (change: unknown) => emit('selectionChange', change)),
        inst.on('connect', (change: unknown) => emit('connect', change)),
        inst.on('node:click', (change: unknown) => emit('nodeClick', change)),
        inst.on('edge:click', (change: unknown) => emit('edgeClick', change))
      );

      emit('init', inst);
      if (providedStore) providedStore.value = inst;
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
    watch(
      () => props.nodes,
      (next) => {
        if (next && instance.value) instance.value.setNodes(withSlotCustom(next)!);
      }
    );
    watch(
      () => props.edges,
      (next) => {
        if (next && instance.value) instance.value.setEdges(next);
      }
    );
    watch(
      () => props.theme,
      (next) => {
        if (next && instance.value) instance.value.setTheme(next);
      }
    );
    watch(
      () => (props.plugins === undefined ? undefined : JSON.stringify(props.plugins)),
      (key) => attachPlugins(key === undefined ? undefined : JSON.parse(key))
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
      instance.value?.dispose();
      instance.value = null;
      if (providedStore) providedStore.value = null;
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

    return () =>
      h('div', {
        ref: container,
        class: 'grafloria-flow',
        style: 'width:100%;height:100%;position:relative',
      });
  },
});
