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

/** The live `DiagramInstance` ref, `null` until a `<GrafloriaFlow>` mounts. */
export function useGrafloria(): ShallowRef<DiagramInstance | null> {
  return inject(GRAFLORIA_STORE, undefined) ?? shallowRef<DiagramInstance | null>(null);
}

export interface SelectionChange {
  nodes: NodeModel[];
  edges: LinkModel[];
}

/** Subscribe to an instance event for as long as the instance ref holds it. */
function useInstanceEvent(
  event: string,
  handler: (payload: never) => void,
  onAttach?: (instance: DiagramInstance) => void
): void {
  const grafloria = useGrafloria();
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
  useInstanceEvent('selection:change', handler as never);
}

/** The live camera (zoom + world rect) as reactive state. */
export function useViewport(): Ref<{ zoom: number; x: number; y: number }> {
  const state = ref({ zoom: 1, x: 0, y: 0 });
  const read = (instance: DiagramInstance) => {
    const v = instance.viewport.getViewport();
    state.value = { zoom: instance.viewport.getZoom(), x: v.x, y: v.y };
  };
  const grafloria = useGrafloria();
  useInstanceEvent(
    'viewport:change',
    (() => grafloria.value && read(grafloria.value)) as never,
    read
  );
  return state;
}
