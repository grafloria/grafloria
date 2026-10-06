/**
 * The Vue composables — the same contract as the React hooks: every one is a
 * subscription to the headless instance; no diagram state lives in Vue and no
 * diagram logic lives in this file.
 *
 * ```vue
 * <GrafloriaProvider>
 *   <Toolbar />          <!-- useGrafloria() works here -->
 *   <GrafloriaFlow … />
 * </GrafloriaProvider>
 * ```
 */
import {
  defineComponent,
  inject,
  provide,
  ref,
  shallowRef,
  watch,
  onScopeDispose,
  type InjectionKey,
  type Ref,
  type ShallowRef,
} from 'vue';
import type { LinkModel, NodeModel } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/renderer';

export const GRAFLORIA_STORE: InjectionKey<ShallowRef<DiagramInstance | null>> =
  Symbol('grafloria-store');

/**
 * Makes the nearest `<GrafloriaFlow>`'s instance reachable by SIBLINGS —
 * toolbars, inspectors, minimaps — through the composables below.
 */
export const GrafloriaProvider = defineComponent({
  name: 'GrafloriaProvider',
  setup(_, { slots }) {
    provide(GRAFLORIA_STORE, shallowRef<DiagramInstance | null>(null));
    return () => slots['default']?.();
  },
});

/**
 * Development builds only: `process.env.NODE_ENV` is replaced by Vite, webpack and
 * every other bundler; with no bundler at all, reading `process` throws and we count
 * that as development too.
 */
const IS_DEV = (() => {
  try {
    return process.env['NODE_ENV'] !== 'production';
  } catch {
    return true;
  }
})();
const warned = new Set<string>();

/**
 * The store, or a ref that will never fill when there is no provider above us. That
 * fallback is correct but silent — a toolbar that forgot the provider just never came
 * alive — so say so, once per composable, in development. No behaviour change.
 */
function storeFor(composable: string): ShallowRef<DiagramInstance | null> {
  const provided = inject(GRAFLORIA_STORE, undefined);
  if (provided) return provided;
  if (IS_DEV && !warned.has(composable)) {
    warned.add(composable);
    console.warn(
      `[grafloria] ${composable} was called outside a <GrafloriaProvider>, so it has no ` +
        `diagram to reach and its ref will stay null. Wrap this component and its ` +
        `<GrafloriaFlow> in <GrafloriaProvider> from @grafloria/vue.`
    );
  }
  return shallowRef<DiagramInstance | null>(null);
}

/** The live `DiagramInstance` ref, `null` until a `<GrafloriaFlow>` mounts. */
export function useGrafloria(): ShallowRef<DiagramInstance | null> {
  return storeFor('useGrafloria()');
}

export interface SelectionChange {
  nodes: NodeModel[];
  edges: LinkModel[];
}

/** Subscribe to an instance event for as long as the instance ref holds it. */
function useInstanceEvent(
  grafloria: ShallowRef<DiagramInstance | null>,
  event: string,
  handler: (payload: never) => void,
  onAttach?: (instance: DiagramInstance) => void
): void {
  const stop = watch(
    grafloria,
    (instance, _prev, onCleanup) => {
      if (!instance) return;
      onAttach?.(instance);
      const off = (instance as { on(e: string, h: unknown): () => void }).on(event, handler);
      onCleanup(off);
    },
    { immediate: true }
  );
  onScopeDispose(stop);
}

/** The current selection as reactive state (for an inspector panel). */
export function useSelection(): Ref<SelectionChange> {
  const selection = ref<SelectionChange>({ nodes: [], edges: [] }) as Ref<SelectionChange>;
  useInstanceEvent(
    storeFor('useSelection()'),
    'selection:change',
    ((change: SelectionChange) => (selection.value = change)) as never,
    (instance) => {
      const model = instance.getModel();
      selection.value = {
        nodes: model.getSelectedNodes(),
        edges: model.getLinks().filter((l: LinkModel) => l.state === 'selected'),
      };
    }
  );
  return selection;
}

/** Fire a callback on every selection change; teardown is automatic. */
export function useOnSelectionChange(handler: (change: SelectionChange) => void): void {
  useInstanceEvent(storeFor('useOnSelectionChange()'), 'selection:change', handler as never);
}

/** The live camera (zoom + world rect) as reactive state. */
export function useViewport(): Ref<{ zoom: number; x: number; y: number }> {
  const state = ref({ zoom: 1, x: 0, y: 0 });
  const read = (instance: DiagramInstance) => {
    const v = instance.viewport.getViewport();
    state.value = { zoom: instance.viewport.getZoom(), x: v.x, y: v.y };
  };
  const grafloria = storeFor('useViewport()');
  useInstanceEvent(
    grafloria,
    'viewport:change',
    (() => grafloria.value && read(grafloria.value)) as never,
    read
  );
  return state;
}
