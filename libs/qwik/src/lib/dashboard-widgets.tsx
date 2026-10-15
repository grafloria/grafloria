import { render as qwikRender, type Component } from '@builder.io/qwik';
import { defaultWidgetRenderer, teardownInOrder, type DashboardWidgetSpec } from '@grafloria/element';

/** Props a custom widget component receives. */
export interface WidgetProps<TData = Record<string, unknown>> {
  widget: DashboardWidgetSpec;
  data: TData;
}

export type WidgetTypes = Record<string, Component<WidgetProps<never>>>;

/** A host's card: the cleanup of its last finished render, and its renders still running. */
interface Mount {
  cleanup?: () => void;
  rendering: number;
  released?: boolean;
}

/**
 * The cards of a Qwik `<GrafloriaDashboard>`: `renderWidget` mounts a
 * `widgetTypes` component into each host the kit paints, and `unmountWidget`
 * unmounts it when the kit releases that host (the widget was removed, or the
 * board disposed), so the other cards stay mounted. The caller's own
 * `options.unmountWidget` still hears each host, after the card is gone.
 *
 * Same mechanism and same caveat as the flow's custom nodes: Qwik's `render()`
 * mounts a SEPARATE container, so keep widgets self-contained and feed them
 * through `widget.data`. It is async: a host released while its card is still
 * rendering is unmounted the moment the render finishes.
 *
 * Kept apart from the component so jest can drive it against a real board: the
 * component mounts in a visible task, which jest cannot fire.
 */
export function widgetMounts(
  widgetTypes: WidgetTypes | undefined,
  callerUnmount?: (widgetId: string, host: HTMLElement) => void
): {
  renderWidget: (widget: DashboardWidgetSpec, host: HTMLElement) => void;
  unmountWidget: (widgetId: string, host: HTMLElement) => void;
} {
  // Keyed by host: a widget an undo or the camera brings back paints a new one.
  // One record per host: `update()` and `repaint()` render into the same host
  // again. A render that fails leaves the card already there, and its cleanup.
  // The host is let go once no render into it is still running, because
  // emptying the container under a running render makes that render throw.
  const mounts = new Map<HTMLElement, Mount>();
  return {
    renderWidget: (widget, host) => {
      const Cmp = widget.kind ? widgetTypes?.[widget.kind] : undefined;
      if (!Cmp) {
        defaultWidgetRenderer(widget, host);
        return;
      }
      const mount = mounts.get(host) ?? { rendering: 0 };
      mounts.set(host, mount);
      mount.rendering++;
      const settle = () => {
        if (--mount.rendering === 0 && mount.released) mount.cleanup?.();
      };
      void qwikRender(host, (
        <Cmp widget={widget} data={(widget.data ?? {}) as never} />
      ) as never).then(
        (result) => {
          mount.cleanup = () => result.cleanup();
          settle();
        },
        (error: unknown) => {
          settle();
          throw error;
        }
      );
    },
    unmountWidget: teardownInOrder((_id: string, host: HTMLElement) => {
      const mount = mounts.get(host);
      mounts.delete(host);
      if (!mount) return;
      mount.released = true;
      if (mount.rendering === 0) mount.cleanup?.();
    }, callerUnmount),
  };
}
