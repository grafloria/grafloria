/**
 * `<GrafloriaDiagram>` — the generic kit host, the Qwik way:
 *
 * ```tsx
 * <GrafloriaDiagram
 *   spec={erDiagram({ entities, relationships })}
 *   onReady$={$((instance) => { … })}
 * />
 * ```
 *
 * Takes any kit spec — `erDiagram(...)`, `umlDiagram(...)`, `dashboard(...)` —
 * or DSL text, and renders it. All DOM work happens in `useVisibleTask$`, so
 * the component is server-safe. A CHANGED spec (or options) replaces the
 * diagram and fires `onReady$` again; an equal one built again does not.
 */
import {
  component$,
  noSerialize,
  useSignal,
  useVisibleTask$,
  type NoSerialize,
  type QRL,
} from '@builder.io/qwik';
import { render as renderSpec, type RenderOptions, type RenderSpec } from '@grafloria/element';
import type { ColorMode, DiagramInstance } from '@grafloria/renderer';
import { MOUNT_EAGERLY } from './visible-task-options';
import { specKey } from './spec-key';

export interface GrafloriaDiagramProps {
  /** Any kit spec — erDiagram(...), umlDiagram(...), dashboard(...), or DSL text. */
  spec: RenderSpec;
  options?: RenderOptions;
  /** Fires once the kit has rendered, with the live instance. */
  onReady$?: QRL<(instance: DiagramInstance) => void>;
  /**
   * `'light'`, `'dark'` or `'system'` (follow the OS). Applied at mount; a change
   * applies live — unlike changed `options`, it does not replace the diagram.
   */
  colorMode?: ColorMode;
  class?: string;
  style?: Record<string, string | number>;
}

export const GrafloriaDiagram = component$<GrafloriaDiagramProps>((props) => {
  const containerRef = useSignal<HTMLElement>();
  const instanceRef = useSignal<NoSerialize<DiagramInstance>>();
  const mountedKey = useSignal('');

  // Mount, and remount when the spec or options change by VALUE.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const spec = track(() => props.spec);
    const options = track(() => props.options);
    const container = containerRef.value;
    if (!container) return;
    const key = specKey(spec, options);
    if (instanceRef.value && key === mountedKey.value) return;

    instanceRef.value?.dispose();
    mountedKey.value = key;
    // Read, not tracked: a colour-mode change is applied live below, never by a remount.
    const colorMode = props.colorMode;
    const instance = renderSpec(spec, container, {
      ...(options ?? {}),
      ...(colorMode ? { colorMode } : {}),
    }) as DiagramInstance;
    instanceRef.value = noSerialize(instance);
    void props.onReady$?.(instance);
  }, MOUNT_EAGERLY);

  // Live colour mode: one call on the instance, never a remount.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const mode = track(() => props.colorMode);
    const instance = track(() => instanceRef.value);
    if (!mode || !instance || instance.getColorMode() === mode) return;
    instance.setColorMode(mode);
  }, MOUNT_EAGERLY);

  // Dispose on unmount only — a re-run of the task above must not.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    cleanup(() => {
      instanceRef.value?.dispose();
      instanceRef.value = undefined;
    });
  }, MOUNT_EAGERLY);

  return (
    <div
      ref={containerRef}
      class={['grafloria-diagram', props.class].filter(Boolean).join(' ')}
      style={{ width: '100%', height: '100%', position: 'relative', ...props.style }}
    />
  );
});
