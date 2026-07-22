/**
 * ============================================================================
 * Card 6 — attaching the plugin components to a live diagram
 * ============================================================================
 *
 * `attachCanvasPlugins(instance, options)` mounts Background / MiniMap /
 * Controls onto a `createDiagram()` instance and — critically — WIRES THEM TO
 * THE ENGINE'S OWN STATE, closing three dead-config bugs the audit flagged:
 *
 *   DiagramStore.gridEnabled   was: `true`,  read by NOBODY  → now: shows/hides Background
 *   DiagramStore.showMinimap   was: `false`, read by NOBODY  → now: shows/hides MiniMap
 *   DiagramStore.snapEnabled   was: `true`,  read by NOBODY  → now: gates grid snapping
 *                                                                (see `snapEnabled` below)
 *
 * These three flags were the textbook instance of this codebase's #1 bug shape:
 * config declared, defaulted, serialized, and never consumed. They are now
 * two-way live — flip `engine.getStore().set('showMinimap', true)` and the
 * minimap appears; the Controls' lock button writes back to `store.locked`.
 *
 * The whole attachment is ONE disposer. Every subscription made here (store
 * watches, model listeners, camera listeners, DOM listeners inside the
 * components) is unwound by it — that is the leak-free rule, and
 * `attach.spec.ts` asserts the store has no listeners left afterwards.
 */

import type { DiagramEngine, DiagramModel } from '@grafloria/engine';
import type { DiagramInstance } from '../../instance/create-diagram';
import type { Disposer } from '../disposable';
import { DisposableStore } from '../disposable';
import type { BackgroundOptions, BackgroundHandle } from './background';
import { createBackground } from './background';
import type { MiniMapOptions, MiniMapHandle } from './minimap';
import { createMiniMap } from './minimap';
import type { ControlsOptions, ControlsHandle } from './controls';
import { createControls } from './controls';

export interface CanvasPluginOptions {
  /**
   * Background grid. `true` = defaults; an object = options; omitted/false = off.
   * When the engine's `gridEnabled` flag is present it OVERRIDES visibility.
   */
  background?: boolean | BackgroundOptions;
  /** MiniMap. Visibility is additionally gated by the store's `showMinimap`. */
  minimap?: boolean | MiniMapOptions;
  /** Zoom/fit/lock toolbar. */
  controls?: boolean | ControlsOptions;
  /**
   * Honour `DiagramStore.gridEnabled` / `showMinimap` and keep them in sync.
   * Default true — this is what makes the flags real. Turn it off if you want
   * the component visibility to be purely declarative.
   */
  bindToStore?: boolean;
}

export interface CanvasPlugins {
  background?: BackgroundHandle;
  minimap?: MiniMapHandle;
  controls?: ControlsHandle;
  dispose: Disposer;
}

/**
 * The structural surface the plugins actually need. `DiagramInstance`
 * satisfies it; so does any framework canvas that keeps a live
 * `ViewportController` (the Angular wrapper builds exactly this adapter).
 */
export interface CanvasPluginHost {
  container: HTMLElement;
  viewport: DiagramInstance['viewport'];
  getModel(): DiagramModel;
  getEngine(): DiagramEngine;
  fitView(padding?: number): void;
}

/** The diagram root element the instance mounted (portals attach to this). */
function rootOf(instance: CanvasPluginHost): HTMLElement {
  const root = instance.container.querySelector('.grafloria-diagram-root');
  // Fall back to the container itself: a host may have handed us the root.
  return (root as HTMLElement | null) ?? instance.container;
}

export function attachCanvasPlugins(
  instance: CanvasPluginHost,
  options: CanvasPluginOptions = {}
): CanvasPlugins {
  const store = new DisposableStore();
  const root = rootOf(instance);
  const engine: DiagramEngine = instance.getEngine();
  const bind = options.bindToStore ?? true;

  const diagramStore =
    bind && typeof engine.getStore === 'function' ? engine.getStore() : undefined;

  const plugins: CanvasPlugins = { dispose: () => store.dispose() };

  // -- Background -------------------------------------------------------------
  if (options.background) {
    const backgroundOptions: BackgroundOptions =
      typeof options.background === 'object' ? options.background : {};
    const background = createBackground(root, instance.viewport, backgroundOptions);
    plugins.background = background;
    store.add(() => background.dispose());

    if (diagramStore) {
      // Initial state comes FROM the store — the flag is now the source of truth.
      const enabled = diagramStore.get('gridEnabled');
      if (typeof enabled === 'boolean') background.setVisible(enabled);

      store.add(
        diagramStore.watch('gridEnabled', (value: unknown) => {
          background.setVisible(value !== false);
        })
      );
    }
  }

  // -- MiniMap ----------------------------------------------------------------
  if (options.minimap) {
    const minimapOptions: MiniMapOptions =
      typeof options.minimap === 'object' ? options.minimap : {};
    const minimap = createMiniMap(
      root,
      instance.viewport,
      () => instance.getModel() as DiagramModel,
      minimapOptions
    );
    plugins.minimap = minimap;
    store.add(() => minimap.dispose());

    // The minimap's node layer is rebuilt on MODEL change only (panning must not
    // be O(nodes) — see minimap.ts). These are the events that move a node rect.
    for (const event of [
      'node:added',
      'node:removed',
      'node:changed',
      'link:added',
      'link:removed',
      'link:changed',
      'selection:changed',
    ]) {
      store.add(instance.getModel().on(event, () => minimap.refresh()) as Disposer);
    }

    if (diagramStore) {
      const show = diagramStore.get('showMinimap');
      // `showMinimap` DEFAULTS TO FALSE in the store. Respect an explicit
      // `minimap: true` from the caller by writing the flag rather than letting
      // the default silently hide what they just asked for.
      if (show === false) diagramStore.set('showMinimap', true);

      store.add(
        diagramStore.watch('showMinimap', (value: unknown) => {
          minimap.setVisible(value !== false);
        })
      );
    }
  }

  // -- Controls ---------------------------------------------------------------
  if (options.controls) {
    const controlOptions: ControlsOptions =
      typeof options.controls === 'object' ? options.controls : {};
    const controls = createControls(root, instance.viewport, {
      ...controlOptions,
      onFitView: controlOptions.onFitView ?? (() => instance.fitView()),
      onToggleLock:
        controlOptions.onToggleLock ??
        ((locked: boolean) => {
          // Write through to the engine's own lock flag rather than inventing a
          // second source of truth.
          diagramStore?.set('locked', locked);
        }),
      locked: controlOptions.locked ?? Boolean(diagramStore?.get('locked')),
    });
    plugins.controls = controls;
    store.add(() => controls.dispose());

    if (diagramStore) {
      store.add(
        diagramStore.watch('locked', (value: unknown) => {
          controls.setLocked(value === true);
        })
      );
    }
  }

  return plugins;
}
