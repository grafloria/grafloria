/**
 * `<GrafloriaDiagram>` — the generic kit host, the Qwik way:
 *
 * ```tsx
 * <GrafloriaDiagram
 *   spec$={() => erDiagram({ entities, relationships })}
 *   onReady$={$((instance) => { … })}
 * />
 * ```
 *
 * Takes any kit spec — `erDiagram(...)`, `umlDiagram(...)`, `dashboard(...)` —
 * or DSL text, and renders it. All DOM work happens in `useVisibleTask$`, so the
 * component renders on the server — with the one condition below. A CHANGED `spec`
 * (or options) replaces the diagram and fires `onReady$` again; an equal one built
 * again does not.
 *
 * ## `spec` or `spec$` — and why SSR cares
 *
 * Every kit spec carries FUNCTIONS (a painter, a `finalize` hook), and Qwik cannot
 * serialize a function into server-rendered HTML. So:
 *
 *   - `spec$={() => erDiagram(…)}` — the spec is BUILT in the browser, from a QRL.
 *     Works everywhere, and it is the only way a kit spec survives server
 *     rendering. Use it for every kit. It is read once, at mount (a `$` prop is
 *     fixed in Qwik): change the component's `key` to rebuild from new data.
 *   - `spec={…}` — plain data (`{ nodes, edges }`, a JSON/DSL string) works
 *     everywhere. A spec WITH functions works only in a client-rendered app, and
 *     only in a production build — Qwik's dev mode checks every component prop is
 *     serializable — unless you wrap it in `noSerialize(spec)`. On the server such
 *     a spec is refused with an error that says to use `spec$`, because neither
 *     form would reach the browser: a raw one cannot be serialized, and a
 *     `noSerialize`d one comes back `undefined` on resume and draws nothing.
 */
import {
  component$,
  noSerialize,
  useSignal,
  useVisibleTask$,
  type NoSerialize,
  type QRL,
} from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import { render as renderSpec, type RenderOptions, type RenderSpec } from '@grafloria/element';
import type { ColorMode, DiagramInstance } from '@grafloria/renderer';
import { MOUNT_EAGERLY } from './visible-task-options';
import { specKey } from './spec-key';

export interface GrafloriaDiagramProps {
  /**
   * The spec as DATA — `{ nodes, edges }`, or JSON/DSL text. A kit spec carries
   * functions; under SSR pass it through `spec$` instead (see the note above).
   */
  spec?: RenderSpec;
  /**
   * A QRL that BUILDS the spec in the browser: `spec$={() => erDiagram({ … })}`.
   * The way to pass any kit spec, and the only one that survives server rendering.
   *
   * It runs once, at mount: Qwik treats a `$` prop as fixed for the life of the
   * component, so a new closure over new values never reaches it. To rebuild the
   * diagram when the data behind it changes, give the component a `key` that changes
   * with that data (`key={schemaVersion}`) — or edit the live diagram through the
   * instance `onReady$` hands you.
   */
  spec$?: QRL<() => RenderSpec | Promise<RenderSpec>>;
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

/**
 * The first value in `value` that Qwik could not serialize — a function or a class
 * instance — as a readable path (`spec.finalize`), or null when it is plain data.
 */
function unserializablePath(value: unknown, path: string, seen: Set<object>): string | null {
  if (typeof value === 'function') return path;
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = unserializablePath(value[i], `${path}[${i}]`, seen);
      if (found) return found;
    }
    return null;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return path;
  for (const [key, item] of Object.entries(value)) {
    const found = unserializablePath(item, `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
}

export const GrafloriaDiagram = component$<GrafloriaDiagramProps>((props) => {
  const containerRef = useSignal<HTMLElement>();
  const instanceRef = useSignal<NoSerialize<DiagramInstance>>();
  const mountedKey = useSignal('');
  const runs = useSignal(0);

  // A kit spec handed over as `spec` cannot reach the browser from a server render.
  // Qwik's own failure ("Value cannot be serialized in _.finalize") names neither the
  // prop nor the fix, so refuse it here, first, with both.
  if (isServer && props.spec !== undefined && !props.spec$) {
    const where = unserializablePath(props.spec, 'spec', new Set());
    if (where) {
      throw new Error(
        `<GrafloriaDiagram>: ${where} is a function or class instance, which Qwik cannot ` +
          `serialize into server-rendered HTML (noSerialize() does not help either: the spec ` +
          `would arrive in the browser as undefined). Build the spec in the browser instead: ` +
          `spec$={() => erDiagram({ … })}.`
      );
    }
  }

  // Mount, and remount when the spec or options change by VALUE.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const specQrl = track(() => props.spec$);
    const specData = track(() => props.spec);
    const options = track(() => props.options);
    const container = containerRef.value;
    if (!container) return;
    const run = ++runs.value;
    const spec = specQrl ? await specQrl() : specData;
    // A newer spec arrived while this one was being built: it wins.
    if (run !== runs.value) return;
    if (spec === undefined) {
      console.error(
        '<GrafloriaDiagram>: no spec to draw. Pass spec$={() => kit({ … })} — a spec handed ' +
          'over as noSerialize(spec) from a server render does not survive the trip to the browser.'
      );
      return;
    }
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
