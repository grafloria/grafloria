/**
 * `dashboard({ views, widgets })` — the DATA-FIRST dashboard authoring API.
 *
 * The exact shape `erDiagram()` / `umlDiagram()` have for ER and UML: you
 * describe WHAT the dashboard is, `render()` runs the returned `finalize(api)`
 * automatically, and every interactive part (the pack grid, drag/resize with
 * live push and a truthful placeholder, fit/grow, float, pin, undoable
 * commands) wires itself.
 *
 * Before this, a developer got `bindDashboardGrid()` — a gesture BINDER one
 * layer down — and had to hand-assemble everything above it: a GroupModel per
 * view, a NodeModel per widget, `useHTMLLayer` / `widgetKind` metadata, grid
 * cells, membership, then the bind. The demo page needed ~143 lines just to
 * build its boards. That was the missing authoring layer; this is it:
 *
 * ```js
 * const SPEC = dashboard({
 *   columns: 12,
 *   sizing: 'fit',
 *   views: [{
 *     id: 'overview', name: 'Overview',
 *     widgets: [
 *       { id: 'rev',   kind: 'kpi',   span: 3, rows: 1, data: {…} },
 *       { id: 'trend', kind: 'line',  span: 8, rows: 2, data: {…} },
 *       { id: 'mix',   kind: 'donut', span: 4, rows: 2, pinned: true },
 *     ],
 *   }],
 *   renderWidget: (widget, host) => { … },   // optional: your charts
 * });
 * render(SPEC, host);
 * ```
 *
 * WHAT IT DELIBERATELY DOES NOT DO: pick a charting library. `renderWidget` is
 * the seam — the kit hands you the widget and a raw HTML host (the renderer's
 * custom-node path, which unlike `metadata.html` is not sanitised, so real
 * `<svg>`/`<canvas>` is fine). Omit it and widgets render a titled frame, so a
 * layout is testable before any chart exists.
 *
 * Cells are the truth and live in the existing `GridItemConfig`, so save/load
 * round-trips with no extra work — same as every other kit.
 */

import {
  BatchCommand,
  GroupModel,
  RemoveFromGroupCommand,
  RemoveNodeCommand,
  type NodeModel,
} from '@grafloria/engine';
import { bindDashboardGrid, type DashboardGridHandle, type DashboardGridOptions } from './grid-binder';
import { ensureDashboardKitStyles } from './styles';

/** A widget, declared as data. */
export interface DashboardWidgetSpec {
  id: string;
  /** Free-form kind string handed back to `renderWidget` (e.g. 'kpi', 'line'). */
  kind?: string;
  /** Column span (default 3) and row span (default 1). */
  span?: number;
  rows?: number;
  /**
   * Explicit cell. Omit and widgets flow in declaration order, wrapping at
   * the column count — the common case needs no coordinates at all.
   */
  x?: number;
  y?: number;
  /** Pinned: never pushed, refuses the mover, survives every reflow. */
  pinned?: boolean;
  /** Your payload — passed straight back to `renderWidget`. */
  data?: Record<string, unknown>;
  /** Optional title used by the built-in fallback renderer. */
  title?: string;
}

/** One board. Multiple views are the tab pattern: only one is on-camera. */
export interface DashboardViewSpec {
  id: string;
  name?: string;
  widgets: DashboardWidgetSpec[];
  /** Per-view overrides of the dashboard-level geometry. */
  columns?: number;
  width?: number;
  height?: number;
}

export interface DashboardOptions {
  /** Column count for every view (default 12). */
  columns?: number;
  /** Gap between widgets AND the board padding, px (default 8). */
  gap?: number;
  /** Sizing mode (default 'fit' — squeeze rows; 'grow' extends the board). */
  sizing?: 'fit' | 'grow';
  /** Row height in 'grow' mode, px (default 130). */
  rowHeight?: number;
  /** Board size, px (default 1180 × 660). */
  width?: number;
  height?: number;
  /** Engine float mode (default false → gravity packs upward). */
  float?: boolean;
  /** One view, or many (the tab pattern). Mutually exclusive with `widgets`. */
  views?: DashboardViewSpec[];
  /** Shorthand for a single unnamed view. */
  widgets?: DashboardWidgetSpec[];
  /**
   * Paint a widget into its host element. Called once per widget when it
   * mounts (the host is reused across re-renders, so this is not a per-frame
   * hook). Omit for a titled placeholder frame.
   */
  renderWidget?: (widget: DashboardWidgetSpec, host: HTMLElement) => void;
  /** Fires after any committed gesture, with the view whose layout changed. */
  onLayoutChange?: (viewId: string, widgets: DashboardWidgetSpec[]) => void;
  /** Extra binder options, merged last (escape hatch to the layer below). */
  binder?: Partial<DashboardGridOptions>;
}

/** What `dashboard()` returns — a render spec plus the runtime handle. */
export interface DashboardSpec {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  renderCustomNode: (node: unknown, host: HTMLElement) => void;
  finalize: (api: unknown) => void;
  /** Live handle, populated by finalize(). */
  readonly handle: DashboardHandle;
}

/** The typed façade — the `erTable`/`umlClass` equivalent for dashboards. */
export interface DashboardHandle {
  /** The view ids, in declaration order. */
  readonly views: string[];
  /** Show a view (the others park off-camera) and frame it. */
  showView(id: string): void;
  /** The currently shown view id. */
  readonly activeView: string;
  /** A widget handle by id (undefined when unknown). */
  widget(id: string): WidgetHandle | undefined;
  /** Every widget handle of a view (default: the active one). */
  widgetsOf(viewId?: string): WidgetHandle[];
  /** Live sizing/float switches — the two prototype toggles. */
  setSizing(mode: 'fit' | 'grow'): void;
  getSizing(): 'fit' | 'grow';
  setFloat(on: boolean): void;
  getFloat(): boolean;
  /** Add a widget to a view (auto-positions when no cell is given). */
  addWidget(spec: DashboardWidgetSpec, viewId?: string): WidgetHandle | undefined;
  /** The current layout as plain data — feed it straight back to dashboard(). */
  toJSON(): DashboardViewSpec[];
  dispose(): void;
}

/** One widget's OO surface (mirrors ErTable/UmlClass). */
export interface WidgetHandle {
  readonly id: string;
  readonly viewId: string;
  readonly node: NodeModel | undefined;
  /** Current cell, as data. */
  readonly cell: { x: number; y: number; w: number; h: number } | undefined;
  /** Resize in CELLS — one undoable step. */
  resize(span: number, rows: number): Promise<void>;
  /** Move to a cell — one undoable step. */
  moveTo(x: number, y: number): Promise<void>;
  /** Pin / unpin (a pinned widget refuses the mover and never gets pushed). */
  pin(on?: boolean): void;
  readonly pinned: boolean;
  /** Remove it (survivors re-pack). */
  remove(): void;
  /** Repaint through `renderWidget` (after your data changed). */
  repaint(): void;
}

const DEFAULTS = { columns: 12, gap: 8, rowHeight: 130, width: 1180, height: 660 };
const OFFSCREEN_X = -20000;

/** Flow widgets that declared no cell: left-to-right, wrapping at `columns`. */
function assignCells(widgets: DashboardWidgetSpec[], columns: number): void {
  let x = 0;
  let y = 0;
  let rowMax = 0;
  for (const w of widgets) {
    const span = Math.max(1, Math.min(columns, w.span ?? 3));
    const rows = Math.max(1, w.rows ?? 1);
    if (w.x === undefined || w.y === undefined) {
      if (x + span > columns) {
        x = 0;
        y += rowMax || 1;
        rowMax = 0;
      }
      w.x = x;
      w.y = y;
      x += span;
      rowMax = Math.max(rowMax, rows);
    }
    w.span = span;
    w.rows = rows;
  }
}

export function dashboard(options: DashboardOptions): DashboardSpec {
  ensureDashboardKitStyles();

  const columns = options.columns ?? DEFAULTS.columns;
  const gap = options.gap ?? DEFAULTS.gap;
  const rowHeight = options.rowHeight ?? DEFAULTS.rowHeight;
  const boardW = options.width ?? DEFAULTS.width;
  const boardH = options.height ?? DEFAULTS.height;

  const views: DashboardViewSpec[] = options.views
    ? options.views.map((v) => ({ ...v, widgets: v.widgets.map((w) => ({ ...w })) }))
    : [{ id: 'main', widgets: (options.widgets ?? []).map((w) => ({ ...w })) }];
  for (const v of views) assignCells(v.widgets, v.columns ?? columns);

  // -- the render spec: one custom-HTML node per widget ----------------------
  const nodes: Array<Record<string, unknown>> = [];
  const specById = new Map<string, DashboardWidgetSpec>();
  const viewOfWidget = new Map<string, string>();
  for (const v of views) {
    for (const w of v.widgets) {
      specById.set(w.id, w);
      viewOfWidget.set(w.id, v.id);
      nodes.push({
        id: w.id,
        type: 'widget',
        position: { x: 0, y: 0 },
        size: { width: 100, height: rowHeight },
        custom: true,
        metadata: {
          useHTMLLayer: true,
          widgetKind: w.kind ?? 'widget',
          widgetSpec: w.data ?? {},
          columnSpan: w.span,
          rowSpan: w.rows,
          gridItem: { columnStart: w.x! + 1, columnEnd: w.x! + 1 + w.span!, rowStart: w.y! + 1, rowEnd: w.y! + 1 + w.rows! },
        },
      });
    }
  }

  const renderWidget =
    options.renderWidget ??
    ((w: DashboardWidgetSpec, host: HTMLElement) => {
      host.innerHTML = '';
      const card = host.ownerDocument.createElement('div');
      card.className = 'axdb-widget';
      const h = host.ownerDocument.createElement('div');
      h.className = 'axdb-widget-h';
      h.textContent = w.title ?? w.kind ?? w.id;
      card.appendChild(h);
      host.appendChild(card);
    });

  // -- runtime, populated by finalize() --------------------------------------
  const binders = new Map<string, DashboardGridHandle>();
  const groups = new Map<string, GroupModel>();
  let active = views[0]?.id ?? 'main';
  let apiRef: {
    getModel(): {
      getNode(id: string): NodeModel | undefined;
      addGroup(g: GroupModel): void;
      getGroup(id: string): GroupModel | undefined;
    };
    getEngine?: () => { commandManager: { execute(c: unknown): unknown } };
    renderNow(): void;
    viewport?: { fitToBounds(r: unknown, pad: number, o?: unknown): void };
  } | null = null;

  const execCommand = (api: typeof apiRef, cmd: unknown): void => {
    void api?.getEngine?.()?.commandManager.execute(cmd);
  };

  const handle: DashboardHandle = {
    get views() {
      return views.map((v) => v.id);
    },
    get activeView() {
      return active;
    },
    showView(id) {
      if (!groups.has(id)) return;
      active = id;
      for (const [vid, g] of groups) {
        const x = vid === id ? 0 : OFFSCREEN_X;
        const s = g.size ?? { width: boardW, height: boardH };
        if (g.position.x !== x) g.setFrame({ x, y: 0, width: s.width, height: s.height });
      }
      binders.get(id)?.sync();
      apiRef?.renderNow();
      const g = groups.get(id)!;
      const gs = g.size ?? { width: boardW, height: boardH };
      apiRef?.viewport?.fitToBounds(
        { x: g.position.x, y: g.position.y, width: gs.width, height: gs.height },
        26,
        { maxZoom: 1 }
      );
    },
    widget(id) {
      return makeWidgetHandle(id);
    },
    widgetsOf(viewId) {
      const v = views.find((x) => x.id === (viewId ?? active));
      return (v?.widgets ?? []).map((w) => makeWidgetHandle(w.id)).filter(Boolean) as WidgetHandle[];
    },
    setSizing(mode) {
      for (const b of binders.values()) b.setSizing(mode);
      apiRef?.renderNow();
    },
    getSizing: () => binders.get(active)?.getSizing() ?? (options.sizing ?? 'fit'),
    setFloat(on) {
      for (const b of binders.values()) b.setFloat(on);
      apiRef?.renderNow();
    },
    getFloat: () => binders.get(active)?.getFloat() ?? (options.float ?? false),
    addWidget(spec, viewId) {
      const vid = viewId ?? active;
      const v = views.find((x) => x.id === vid);
      const model = apiRef?.getModel();
      const group = groups.get(vid);
      if (!v || !model || !group) return undefined;
      const w: DashboardWidgetSpec = { ...spec, span: spec.span ?? 3, rows: spec.rows ?? 1 };
      v.widgets.push(w);
      specById.set(w.id, w);
      viewOfWidget.set(w.id, vid);
      // The binder adopts it on member-add and auto-positions when the cell
      // is absent — the same path the palette uses.
      const node = model.getNode(w.id);
      if (!node) return undefined;
      group.addMember(w.id);
      binders.get(vid)?.sync();
      apiRef?.renderNow();
      return makeWidgetHandle(w.id);
    },
    toJSON() {
      return views.map((v) => ({
        ...v,
        widgets: v.widgets.map((w) => {
          const cell = binders.get(v.id)?.cellOf(w.id);
          return cell ? { ...w, x: cell.x, y: cell.y, span: cell.w, rows: cell.h } : { ...w };
        }),
      }));
    },
    dispose() {
      for (const b of binders.values()) b.dispose();
      binders.clear();
    },
  };

  function makeWidgetHandle(id: string): WidgetHandle | undefined {
    const spec = specById.get(id);
    const viewId = viewOfWidget.get(id);
    if (!spec || !viewId) return undefined;
    const binder = () => binders.get(viewId);
    const node = () => apiRef?.getModel().getNode(id);
    return {
      id,
      viewId,
      get node() {
        return node();
      },
      get cell() {
        return binder()?.cellOf(id);
      },
      get pinned() {
        return node()?.state?.locked === true;
      },
      async resize(span, rows) {
        await binder()?.resizeTo(id, span, rows);
      },
      async moveTo(x, y) {
        await binder()?.moveTo(id, x, y);
      },
      pin(on) {
        const n = node();
        if (!n) return;
        n.setState({ locked: on ?? !(n.state?.locked === true) });
        apiRef?.renderNow();
      },
      remove() {
        const n = node();
        const group = groups.get(viewId);
        const b = binder();
        if (!n || !group || !b) return;
        // ONE undoable step, survivors' re-pack folded in — the same atomic
        // shape the kit's own drag-out-to-remove uses.
        const cmds = [...b.planRemoval(id), new RemoveFromGroupCommand(group.id, id), new RemoveNodeCommand(id)];
        void execCommand(apiRef, new BatchCommand('Remove widget', cmds));
        const v = views.find((x) => x.id === viewId);
        if (v) v.widgets = v.widgets.filter((w) => w.id !== id);
        specById.delete(id);
        viewOfWidget.delete(id);
        b.sync();
        apiRef?.renderNow();
      },
      repaint() {
        const host = hostOf(id);
        if (host) renderWidget(spec, host);
      },
    };
  }

  const hosts = new Map<string, HTMLElement>();
  const hostOf = (id: string) => hosts.get(id);

  return {
    nodes,
    edges: [],
    renderCustomNode: (node: unknown, host: HTMLElement) => {
      const n = node as { id: string };
      const spec = specById.get(n.id);
      if (!spec) return;
      hosts.set(n.id, host);
      renderWidget(spec, host);
    },
    get handle() {
      return handle;
    },
    finalize: (api: unknown) => {
      const a = api as typeof apiRef;
      if (!a) return;
      apiRef = a;
      const model = a.getModel();

      for (const v of views) {
        // One board per view; the group is a pure LAYOUT CONTAINER, so its
        // chrome is suppressed (frameChrome) exactly as a dashboard needs.
        const g = new GroupModel({ id: v.id, name: v.name ?? v.id });
        model.addGroup(g);
        g.setMetadata('frameChrome', 'none');
        g.size = { width: v.width ?? boardW, height: v.height ?? boardH, depth: 0 };
        g.position = { x: v.id === active ? 0 : OFFSCREEN_X, y: 0 };
        groups.set(v.id, g);
        for (const w of v.widgets) {
          const n = model.getNode(w.id);
          if (!n) continue;
          if (w.pinned) n.setState({ locked: true });
          g.addMember(w.id);
        }
        binders.set(
          v.id,
          bindDashboardGrid(a as never, g, {
            columns: v.columns ?? columns,
            gap,
            padding: gap,
            sizing: options.sizing ?? 'fit',
            baseRowHeight: rowHeight,
            designHeight: v.height ?? boardH,
            float: options.float ?? false,
            ...(options.binder ?? {}),
            onGesture: (e) => {
              if (e.type === 'commit' && options.onLayoutChange) {
                const snapshot = handle.toJSON().find((x) => x.id === v.id);
                if (snapshot) options.onLayoutChange(v.id, snapshot.widgets);
              }
              options.binder?.onGesture?.(e);
            },
          })
        );
      }
      handle.showView(active);
    },
  };
}
