/**
 * `<GrafloriaDashboard>` — the dashboard kit, the Qwik way.
 *
 * ```tsx
 * <GrafloriaDashboard
 *   views={views}
 *   activeView={tab.value}
 *   widgetTypes={{ orders: OrdersCard }}
 *   onLayoutChange$={$(({ viewId, widgets }) => persist(viewId, widgets))}
 * />
 * ```
 *
 * `widgetTypes` maps a widget `kind` to a Qwik component — the same idiom (and
 * the same separate-container caveat) as `nodeTypes` on the flow. Kinds with no
 * entry fall back to the kit's built-in painters (kpi / line / bar / donut /
 * funnel / table).
 */
import {
  component$,
  noSerialize,
  render as qwikRender,
  useSignal,
  useVisibleTask$,
  type Component,
  type NoSerialize,
  type QRL,
} from '@builder.io/qwik';
import {
  dashboard,
  defaultWidgetRenderer,
  render as renderSpec,
  type DashboardHandle,
  type DashboardOptions,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { MOUNT_EAGERLY } from './visible-task-options';

/** Props a custom widget component receives. */
export interface WidgetProps<TData = Record<string, unknown>> {
  widget: DashboardWidgetSpec;
  data: TData;
}

export type WidgetTypes = Record<string, Component<WidgetProps<never>>>;

export interface GrafloriaDashboardProps {
  views?: DashboardViewSpec[];
  widgets?: DashboardWidgetSpec[];
  options?: Partial<DashboardOptions>;
  /** The visible view. */
  activeView?: string;
  /**
   * LIVE SWITCHES — the toolbar toggles as props: applied at mount (over
   * `options`) and, when they change, through the handle (`setLayout` /
   * `setSizing` / `setStatic`), never by remounting. 'split' is the
   * splitter tree; 'grid' the cell grid.
   */
  layout?: 'grid' | 'split';
  sizing?: 'fit' | 'grow';
  /** Static board: the viewer's mode — no drag, no resize, no handles. */
  static?: boolean;
  /** Qwik components for widget kinds, keyed by `kind`. */
  widgetTypes?: WidgetTypes;
  onReady$?: QRL<(handle: DashboardHandle) => void>;
  onLayoutChange$?: QRL<
    (change: { viewId: string; widgets: DashboardWidgetSpec[] }) => void
  >;
  class?: string;
  style?: Record<string, string | number>;
}

export const GrafloriaDashboard = component$<GrafloriaDashboardProps>((props) => {
  const containerRef = useSignal<HTMLElement>();
  const handleRef = useSignal<NoSerialize<DashboardHandle>>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const container = containerRef.value;
    if (!container) return;

    const widgetTypes = props.widgetTypes;
    const mounted = new Map<string, { cleanup(): void }>();

    const spec = dashboard({
      ...props.options,
      ...(props.layout !== undefined ? { layout: props.layout } : {}),
      ...(props.sizing !== undefined ? { sizing: props.sizing } : {}),
      ...(props.static !== undefined ? { static: props.static } : {}),
      ...(props.views ? { views: props.views } : {}),
      ...(!props.views && props.widgets ? { widgets: props.widgets } : {}),
      renderWidget: (widget, hostEl) => {
        const Cmp = widget.kind ? widgetTypes?.[widget.kind] : undefined;
        if (!Cmp) {
          defaultWidgetRenderer(widget, hostEl);
          return;
        }
        // Same mechanism and same caveat as the flow's custom nodes: Qwik's
        // `render()` mounts a SEPARATE container, so keep widgets
        // self-contained and feed them through `widget.data`.
        return qwikRender(hostEl, (
          <Cmp widget={widget} data={(widget.data ?? {}) as never} />
        ) as never).then((result) => {
          mounted.set(widget.id, result);
        });
      },
      onLayoutChange: (viewId, widgets) => {
        void props.onLayoutChange$?.({ viewId, widgets });
      },
    });

    const instance = renderSpec(spec, container) as DiagramInstance;
    handleRef.value = noSerialize(spec.handle);

    if (props.activeView && spec.handle.activeView !== props.activeView) {
      spec.handle.showView(props.activeView);
    }
    void props.onReady$?.(spec.handle);

    cleanup(() => {
      for (const entry of mounted.values()) entry.cleanup();
      mounted.clear();
      instance.dispose();
      handleRef.value = undefined;
    });
  }, MOUNT_EAGERLY);

  // -- the live switches: a changed prop is one handle call, never a remount --
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const view = track(() => props.activeView);
    const handle = track(() => handleRef.value);
    if (!view || !handle || handle.activeView === view) return;
    handle.showView(view);
  }, MOUNT_EAGERLY);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const value = track(() => props.layout);
    const handle = track(() => handleRef.value);
    if (value === undefined || !handle) return;
    // The prop names the BOARD's layout: every view, not only the visible tab.
    for (const id of handle.views) {
      if (handle.getLayout(id) !== value) handle.setLayout(value, id);
    }
  }, MOUNT_EAGERLY);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const value = track(() => props.sizing);
    const handle = track(() => handleRef.value);
    if (value === undefined || !handle || handle.getSizing() === value) return;
    handle.setSizing(value);
  }, MOUNT_EAGERLY);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const value = track(() => props.static);
    const handle = track(() => handleRef.value);
    if (value === undefined || !handle || handle.getStatic() === value) return;
    handle.setStatic(value);
  }, MOUNT_EAGERLY);

  return (
    <div
      ref={containerRef}
      class={['grafloria-dashboard', props.class].filter(Boolean).join(' ')}
      style={{ width: '100%', height: '100%', position: 'relative', ...props.style }}
    />
  );
});
