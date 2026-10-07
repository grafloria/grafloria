/**
 * The Qwik hooks — the same contract as the React hooks and the Vue
 * composables: every one is a SUBSCRIPTION to the headless instance. No
 * diagram state lives in Qwik and no diagram logic lives in this file.
 *
 * ```tsx
 * <GrafloriaProvider>
 *   <Toolbar />          // useGrafloria() works here
 *   <GrafloriaFlow … />
 * </GrafloriaProvider>
 * ```
 *
 * ## Why everything is `noSerialize`d
 *
 * This is the one constraint Qwik has that React and Vue do not. Qwik
 * SERIALIZES the state a component closes over so the app can resume on the
 * client without replaying it. A `DiagramInstance` owns DOM nodes, an event
 * emitter and a renderer — it is not data, and it cannot survive a round trip
 * through JSON. `noSerialize()` is Qwik's marker for exactly that: the value
 * lives for the lifetime of the page and comes back `undefined` after a
 * resume, which is correct here because a resumed page re-runs
 * `useVisibleTask$` and builds a fresh instance anyway.
 */
import {
  $,
  component$,
  createContextId,
  implicit$FirstArg,
  Slot,
  useContext,
  useContextProvider,
  useSignal,
  useVisibleTask$,
  type NoSerialize,
  type QRL,
  type Signal,
} from '@builder.io/qwik';
import type { LinkModel, NodeModel } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/renderer';
import { MOUNT_EAGERLY } from './visible-task-options';

/**
 * The live instance, or `undefined` until a `<GrafloriaFlow>` mounts. Always
 * `noSerialize`d — see the note at the top of this file.
 */
export type GrafloriaStore = Signal<NoSerialize<DiagramInstance> | undefined>;

export const GRAFLORIA_STORE = createContextId<GrafloriaStore>('grafloria.store');

export interface SelectionChange {
  nodes: NodeModel[];
  edges: LinkModel[];
}

/**
 * Makes the nearest `<GrafloriaFlow>`'s instance reachable by SIBLINGS —
 * toolbars, inspectors, minimaps — through the hooks below.
 */
export const GrafloriaProvider = component$(() => {
  useContextProvider(GRAFLORIA_STORE, useSignal<NoSerialize<DiagramInstance>>());
  return <Slot />;
});

/**
 * Development builds only: `process.env.NODE_ENV` is replaced by Vite (and every
 * other bundler) in a production build; with no bundler at all, reading `process`
 * throws and we count that as development too.
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
 * The provided store, or a component-local signal that will never fill. The
 * fallback is correct but silent — a toolbar that forgot the provider just never
 * came alive — so say so, once per hook, in development (on the server during SSR,
 * in the browser otherwise). No behaviour change.
 */
function useStore(hook: string): GrafloriaStore {
  // Both hooks run unconditionally: Qwik, like React, requires a stable order.
  const local = useSignal<NoSerialize<DiagramInstance>>();
  const provided = useContext(GRAFLORIA_STORE, null);
  if (!provided && IS_DEV && !warned.has(hook)) {
    warned.add(hook);
    console.warn(
      `[grafloria] ${hook} was called outside a <GrafloriaProvider>, so it has no diagram ` +
        `to reach and its signal will stay undefined. Wrap this component and its ` +
        `<GrafloriaFlow> in <GrafloriaProvider> from @grafloria/qwik.`
    );
  }
  return provided ?? local;
}

/**
 * The live `DiagramInstance` signal. Falls back to a component-local signal
 * when there is no `<GrafloriaProvider>` above, so the hook is always safe to
 * call — it simply never fills in without a provider (and says so once, in
 * development).
 */
export function useGrafloria(): GrafloriaStore {
  return useStore('useGrafloria()');
}

/** The current selection as reactive state (for an inspector panel). */
export function useSelection(): Signal<SelectionChange> {
  const store = useStore('useSelection()');
  const selection = useSignal<SelectionChange>({ nodes: [], edges: [] });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const instance = track(() => store.value);
    if (!instance) return;
    const model = instance.getModel();
    selection.value = {
      nodes: model.getSelectedNodes(),
      edges: model.getLinks().filter((l: LinkModel) => l.state === 'selected'),
    };
    cleanup(
      instance.on('selection:change', (change) => {
        selection.value = { nodes: change.nodes, edges: change.edges };
      })
    );
  }, MOUNT_EAGERLY);

  return selection;
}

/** The live camera (zoom + world origin) as reactive state. */
export function useViewport(): Signal<{ zoom: number; x: number; y: number }> {
  const store = useStore('useViewport()');
  const state = useSignal({ zoom: 1, x: 0, y: 0 });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const instance = track(() => store.value);
    if (!instance) return;
    const read = () => {
      const v = instance.viewport.getViewport();
      state.value = { zoom: instance.viewport.getZoom(), x: v.x, y: v.y };
    };
    read();
    cleanup(instance.on('viewport:change', read));
  }, MOUNT_EAGERLY);

  return state;
}

/**
 * Fire a QRL on every selection change; teardown is automatic.
 *
 * The handler is a QRL rather than a plain function because Qwik has to be
 * able to serialize the subscription and load the handler lazily — that is
 * the whole point of the `$` suffix, and it is why this reads
 * `useOnSelectionChange$(...)` at the call site.
 */
export function useOnSelectionChangeQrl(handler: QRL<(change: SelectionChange) => void>): void {
  const store = useStore('useOnSelectionChange$()');

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const instance = track(() => store.value);
    if (!instance) return;
    cleanup(
      instance.on('selection:change', (change) => {
        void handler({ nodes: change.nodes, edges: change.edges });
      })
    );
  }, MOUNT_EAGERLY);
}

export const useOnSelectionChange$ = implicit$FirstArg(useOnSelectionChangeQrl);

/**
 * A `$`-wrapped no-op, handy as a default for optional QRL props so callers
 * never have to branch on `undefined`.
 */
export const noopQrl = $(() => {
  /* intentionally empty */
});
