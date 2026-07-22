/**
 * `<GrafloriaDashboard>` — the dashboard kit, the Vue way.
 *
 * ```vue
 * <GrafloriaDashboard :views="views" v-model:active-view="tab"
 *     @ready="handle = $event" @layout-change="persist">
 *   <template #widget-orders="{ widget, data }">
 *     <OrdersCard :orders="data.orders" />
 *   </template>
 * </GrafloriaDashboard>
 * ```
 *
 * `#widget-<kind>` slots render that widget kind with real Vue — the same
 * idiom as `#node-<type>` on the flow. Kinds without a slot fall back to the
 * kit's built-in painters (kpi / line / bar / donut / funnel / table).
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
} from 'vue';
import {
  dashboard,
  render as renderSpec,
  defaultWidgetRenderer,
  type DashboardHandle,
  type DashboardOptions,
  type DashboardSnapshot,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';

interface MountedWidget {
  widget: DashboardWidgetSpec;
  element: HTMLElement;
}

export const GrafloriaDashboard = defineComponent({
  name: 'GrafloriaDashboard',
  props: {
    views: { type: Array as PropType<DashboardViewSpec[]>, default: undefined },
    widgets: { type: Array as PropType<DashboardWidgetSpec[]>, default: undefined },
    options: { type: Object as PropType<Partial<DashboardOptions>>, default: () => ({}) },
    /** The visible view — `v-model:active-view`. */
    activeView: { type: String, default: undefined },
  },
  emits: ['update:activeView', 'ready', 'layoutChange'],
  setup(props, { emit, slots, expose }) {
    const container = ref<HTMLElement | null>(null);
    const handle = shallowRef<DashboardHandle | null>(null);
    let instance: DiagramInstance | null = null;
    const mounted = new Map<string, MountedWidget>();

    const slotFor = (widget: DashboardWidgetSpec) => {
      const s: Slots = slots;
      return (widget.kind && (s[`widget-${widget.kind}`] as any)) || (s['widget'] as any) || undefined;
    };

    const paintWidget = (entry: MountedWidget): void => {
      const slot = slotFor(entry.widget);
      if (!slot) return;
      vueRender(
        h('div', { style: 'width:100%;height:100%' }, slot({
          widget: entry.widget,
          data: (entry.widget.data ?? {}) as Record<string, unknown>,
        })),
        entry.element
      );
    };

    onMounted(() => {
      const el = container.value;
      if (!el) return;

      const spec = dashboard({
        ...props.options,
        ...(props.views ? { views: props.views } : {}),
        ...(!props.views && props.widgets ? { widgets: props.widgets } : {}),
        renderWidget: (widget, hostEl) => {
          if (!slotFor(widget)) {
            defaultWidgetRenderer(widget, hostEl);
            return;
          }
          const entry: MountedWidget = { widget, element: hostEl };
          mounted.set(widget.id, entry);
          paintWidget(entry);
        },
        onLayoutChange: (viewId, widgets) => emit('layoutChange', { viewId, widgets }),
      });

      instance = renderSpec(spec, el) as DiagramInstance;
      handle.value = spec.handle;
      // The synchronous mount already painted widgets before `handle` existed —
      // repaint any slot widgets now (the flow component's lesson).
      for (const entry of mounted.values()) paintWidget(entry);

      if (props.activeView && spec.handle.activeView !== props.activeView) {
        spec.handle.showView(props.activeView);
      }
      emit('update:activeView', spec.handle.activeView);
      emit('ready', spec.handle);
    });

    watch(
      () => props.activeView,
      (view) => {
        if (view && handle.value && handle.value.activeView !== view) {
          handle.value.showView(view);
          emit('update:activeView', view);
        }
      }
    );

    onBeforeUnmount(() => {
      for (const entry of mounted.values()) vueRender(null, entry.element);
      mounted.clear();
      instance?.dispose();
      instance = null;
      handle.value = null;
    });

    expose({
      getHandle: () => handle.value,
      snapshot: (): DashboardSnapshot | null => handle.value?.toJSON() ?? null,
    });

    return () =>
      h('div', { ref: container, class: 'grafloria-dashboard', style: 'position:relative' });
  },
});
