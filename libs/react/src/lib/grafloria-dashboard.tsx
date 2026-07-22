'use client';

/**
 * `<GrafloriaDashboard>` — the dashboard kit, the React way.
 *
 * The kit is DATA-FIRST: `views` (or `widgets` for a single view) declare the
 * whole board; the kit wires the pack grid, gestures, and undo. This
 * component adds the React idioms on top — the exact `nodeTypes` pattern,
 * applied to boards:
 *
 * ```tsx
 * <GrafloriaDashboard
 *   views={views}
 *   widgetTypes={{ orders: OrdersCard }}   // real React components
 *   activeView={tab}                        // the tab pattern
 *   onReady={(handle) => …}                 // typed DashboardHandle
 *   onLayoutChange={({ viewId, widgets }) => persist(widgets)}
 * />
 * ```
 *
 * Widget kinds without a component fall back to the kit's built-in painters
 * (kpi / line / bar / donut / funnel / table). Components are PORTAL-mounted
 * into the kit's host elements, so hooks, context, and state work inside.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  dashboard,
  render as renderSpec,
  defaultWidgetRenderer,
  type DashboardHandle,
  type DashboardOptions,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';

/** Props a widget component receives — the `NodeProps` twin for boards. */
export interface WidgetProps<TData = Record<string, unknown>> {
  widget: DashboardWidgetSpec;
  data: TData;
}

export type WidgetTypes = Record<string, ComponentType<WidgetProps>>;

export interface GrafloriaDashboardProps {
  /** Multi-view (tabbed) board. Mutually exclusive with `widgets`. */
  views?: DashboardViewSpec[];
  /** Single-view shorthand. */
  widgets?: DashboardWidgetSpec[];
  /** Board options: columns, gap, sizing, rtl, responsive, binder… */
  options?: Partial<DashboardOptions>;
  /** Maps a widget `kind` to the React component that renders it. */
  widgetTypes?: WidgetTypes;
  /** The visible view (the tab pattern). Omit for kit-managed. */
  activeView?: string;
  /** The typed handle, once the board is live. */
  onReady?: (handle: DashboardHandle) => void;
  /** Mirrors the kit's committed gestures (drag, resize, add, remove). */
  onLayoutChange?: (change: { viewId: string; widgets: DashboardWidgetSpec[] }) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

interface WidgetPortal {
  widget: DashboardWidgetSpec;
  element: HTMLElement;
}

export function GrafloriaDashboard(props: GrafloriaDashboardProps) {
  const { className, style, children } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [handle, setHandle] = useState<DashboardHandle | null>(null);
  const [portals, setPortals] = useState<WidgetPortal[]>([]);

  // Callbacks and widgetTypes live in a ref so inline props do not tear the
  // board down and rebuild it (the GrafloriaFlow discipline).
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const spec = dashboard({
      ...latest.current.options,
      ...(latest.current.views ? { views: latest.current.views } : {}),
      ...(!latest.current.views && latest.current.widgets
        ? { widgets: latest.current.widgets }
        : {}),
      renderWidget: (widget, host) => {
        const type = latest.current.widgetTypes?.[widget.kind ?? ''];
        if (!type) {
          defaultWidgetRenderer(widget, host);
          return;
        }
        setPortals((current) =>
          current.some((p) => p.widget.id === widget.id)
            ? current
            : [...current, { widget, element: host }]
        );
      },
      onLayoutChange: (viewId, widgets) =>
        latest.current.onLayoutChange?.({ viewId, widgets }),
    });

    let instance: DiagramInstance | null = renderSpec(spec, container) as DiagramInstance;
    setHandle(spec.handle);
    if (latest.current.activeView && spec.handle.activeView !== latest.current.activeView) {
      spec.handle.showView(latest.current.activeView);
    }
    latest.current.onReady?.(spec.handle);

    return () => {
      setPortals([]);
      setHandle(null);
      instance?.dispose();
      instance = null;
    };
    // Mount once — data updates flow through the handle, not remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tab pattern: a controlled activeView prop drives showView.
  useEffect(() => {
    if (handle && props.activeView && handle.activeView !== props.activeView) {
      handle.showView(props.activeView);
    }
  }, [handle, props.activeView]);

  const rootStyle = useMemo<CSSProperties>(
    () => ({ position: 'relative', ...style }),
    [style]
  );

  return (
    <div ref={containerRef} className={className} style={rootStyle}>
      {portals.map(({ widget, element }) => {
        const Type = latest.current.widgetTypes?.[widget.kind ?? ''];
        if (!Type) return null;
        return createPortal(
          <Type widget={widget} data={(widget.data ?? {}) as Record<string, unknown>} />,
          element,
          widget.id
        );
      })}
      {children}
    </div>
  );
}
