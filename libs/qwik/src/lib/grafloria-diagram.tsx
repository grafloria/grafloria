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
 * the component is server-safe.
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
import type { DiagramInstance } from '@grafloria/renderer';
import { MOUNT_EAGERLY } from './visible-task-options';

export interface GrafloriaDiagramProps {
  /** Any kit spec — erDiagram(...), umlDiagram(...), dashboard(...), or DSL text. */
  spec: RenderSpec;
  options?: RenderOptions;
  /** Fires once the kit has rendered, with the live instance. */
  onReady$?: QRL<(instance: DiagramInstance) => void>;
  class?: string;
  style?: Record<string, string | number>;
}

export const GrafloriaDiagram = component$<GrafloriaDiagramProps>((props) => {
  const containerRef = useSignal<HTMLElement>();
  const instanceRef = useSignal<NoSerialize<DiagramInstance>>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const container = containerRef.value;
    if (!container) return;

    const instance = renderSpec(
      props.spec,
      container,
      props.options ?? {}
    ) as DiagramInstance;
    instanceRef.value = noSerialize(instance);
    void props.onReady$?.(instance);

    cleanup(() => {
      instance.dispose();
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
