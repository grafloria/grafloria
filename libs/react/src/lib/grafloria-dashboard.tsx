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
 * into the kit's host elements, so hooks, context, and state work inside, and
 * a widget's component re-renders, state kept, each time the kit paints it
 * again (`handle.widget(id).update()` / `repaint()`). Removing a widget
 * unmounts its component; the other cards stay mounted. An
 * `options.unmountWidget` still hears each host, after the card is let go.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  dashboard,
  render as renderSpec,
  defaultWidgetRenderer,
  teardownInOrder,
  type DashboardHandle,
  type DashboardOptions,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { useCardData } from './card-data';

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
  /**
   * LIVE SWITCHES — the toolbar toggles as props. Each is applied at mount
   * (over `options`) and, when it changes afterwards, through the handle
   * (`setLayout` / `setSizing` / `setStatic`) — no remount, like `activeView`.
   * 'split' is the DevExpress splitter tree; 'grid' the cell grid.
   */
  layout?: 'grid' | 'split';
  sizing?: 'fit' | 'grow';
  /** Static board: the viewer's mode — no drag, no resize, no handles. */
  static?: boolean;
  /** The typed handle, once the board is live. */
  onReady?: (handle: DashboardHandle) => void;
  /** Mirrors the kit's committed gestures (drag, resize, add, remove). */
  onLayoutChange?: (change: { viewId: string; widgets: DashboardWidgetSpec[] }) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

// A layout effect in the browser; on the server, where no effect runs, the
// plain one, which React 17 and 18 do not warn about there.
const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface WidgetPortal {
  widget: DashboardWidgetSpec;
  element: HTMLElement;
  /** Bumped by every paint of this widget, so its card re-renders. */
  version: number;
}

export function GrafloriaDashboard(props: GrafloriaDashboardProps) {
  const { className, style, children } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [handle, setHandle] = useState<DashboardHandle | null>(null);
  const [portals, setPortals] = useState<WidgetPortal[]>([]);
  // Who paints each widget's host. `cards`: the widgets a component painted
  // last. `builtIns`: the widgets an `update({ kind })` took from a component
  // to a built-in painter, waiting for the commit that takes the card out —
  // the painter empties the host, and React's next commit would then remove
  // nodes that are no longer there, which throws.
  const cards = useRef(new Set<string>());
  const builtIns = useRef(new Map<string, [DashboardWidgetSpec, HTMLElement]>());

  // Callbacks and widgetTypes live in a ref so inline props do not tear the
  // board down and rebuild it (the GrafloriaFlow discipline).
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const spec = dashboard({
      ...latest.current.options,
      ...(latest.current.layout !== undefined ? { layout: latest.current.layout } : {}),
      ...(latest.current.sizing !== undefined ? { sizing: latest.current.sizing } : {}),
      ...(latest.current.static !== undefined ? { static: latest.current.static } : {}),
      ...(latest.current.views ? { views: latest.current.views } : {}),
      ...(!latest.current.views && latest.current.widgets
        ? { widgets: latest.current.widgets }
        : {}),
      renderWidget: (widget, host) => {
        const type = latest.current.widgetTypes?.[widget.kind ?? ''];
        if (type) {
          // A host the built-in painter drew last holds its markup: the card
          // replaces it. (One still waiting for its paint holds the card.)
          if (!cards.current.has(widget.id) && !builtIns.current.delete(widget.id)) host.replaceChildren();
          cards.current.add(widget.id);
        } else if (cards.current.delete(widget.id) || builtIns.current.has(widget.id)) {
          builtIns.current.set(widget.id, [widget, host]);
        } else {
          defaultWidgetRenderer(widget, host);
          return;
        }
        // Every paint replaces the widget's entry. `update()` and `repaint()`
        // paint the same host with the same spec object, so only the new
        // version re-renders the card; a widget brought back by undo paints a
        // new host, and its portal moves there.
        setPortals((current) => {
          const at = current.findIndex((p) => p.widget.id === widget.id);
          if (at < 0) return [...current, { widget, element: host, version: 0 }];
          const next = current.slice();
          next[at] = { widget, element: host, version: current[at].version + 1 };
          return next;
        });
      },
      // The host is leaving the board (the widget was removed, or the board
      // disposed): its portal goes, so the card unmounts and its effects clean
      // up. Matched by host too — a widget an undo brings back paints a new one.
      unmountWidget: teardownInOrder((id: string, host: HTMLElement) => {
        cards.current.delete(id);
        builtIns.current.delete(id);
        setPortals((current) => current.filter((p) => p.widget.id !== id || p.element !== host));
      }, latest.current.options?.unmountWidget),
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
      cards.current.clear();
      builtIns.current.clear();
      setHandle(null);
      instance?.dispose();
      instance = null;
    };
    // Mount once — data updates flow through the handle, not remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The built-in paints of widgets whose card this commit took out. A layout
  // effect: it runs inside the commit, so no paint can wait across another
  // commit that still holds the card.
  useCommitEffect(() => {
    for (const [widget, host] of builtIns.current.values()) defaultWidgetRenderer(widget, host);
    builtIns.current.clear();
  });

  // The tab pattern: a controlled activeView prop drives showView.
  useEffect(() => {
    if (handle && props.activeView && handle.activeView !== props.activeView) {
      handle.showView(props.activeView);
    }
  }, [handle, props.activeView]);
  // The switches: a changed prop is one handle call, never a remount.
  useEffect(() => {
    // The prop names the BOARD's layout: every view, not only the visible tab.
    if (!handle || props.layout === undefined) return;
    for (const v of handle.views) if (handle.getLayout(v) !== props.layout) handle.setLayout(props.layout, v);
  }, [handle, props.layout]);
  useEffect(() => {
    if (handle && props.sizing !== undefined && handle.getSizing() !== props.sizing) handle.setSizing(props.sizing);
  }, [handle, props.sizing]);
  useEffect(() => {
    if (handle && props.static !== undefined && handle.getStatic() !== props.static) handle.setStatic(props.static);
  }, [handle, props.static]);

  const rootStyle = useMemo<CSSProperties>(
    () => ({ width: '100%', height: '100%', position: 'relative', ...style }),
    [style]
  );

  return (
    <div ref={containerRef} className={className} style={rootStyle}>
      {portals.map((portal) => {
        const Type = latest.current.widgetTypes?.[portal.widget.kind ?? ''];
        if (!Type) return null;
        return <WidgetPortalHost key={portal.widget.id} portal={portal} Type={Type} />;
      })}
      {children}
    </div>
  );
}

/**
 * One widget component, portal-mounted into the host the kit painted. Its
 * `data` is a new object for each paint and only for a paint: a `React.memo`
 * card follows `update()` and `repaint()`, even after an in-place change to its
 * data, and a card nobody repainted keeps its props when the board re-renders.
 */
function WidgetPortalHost({ portal, Type }: { portal: WidgetPortal; Type: ComponentType<WidgetProps> }) {
  const { widget, element, version } = portal;
  const data = useCardData(widget.data, widget, version);
  return createPortal(<Type widget={widget} data={data} />, element);
}
