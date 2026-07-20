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
 * `<svg>`/`<canvas>` is fine). Omit it and `defaultWidgetRenderer` (widgets.ts)
 * draws the declared `kind` from your own `data` with hand-rolled inline SVG —
 * kpi / line / bar / donut / funnel / table, no dependency, no sample dataset —
 * falling back to a titled frame for kinds it does not know, so a layout is
 * testable before any chart exists.
 *
 * Cells are the truth and live in the existing `GridItemConfig`, so save/load
 * round-trips with no extra work — same as every other kit.
 */

import {
  AddToGroupCommand,
  BatchCommand,
  BringNodeToFrontCommand,
  Command,
  GroupModel,
  NodeModel,
  RemoveFromGroupCommand,
  RemoveNodeCommand,
  SendNodeToBackCommand,
} from '@grafloria/engine';
import { bindDashboardGrid, type DashboardGridHandle, type DashboardGridOptions } from './grid-binder';
import { gridItemFromCell } from './grid-mapping';
import { ensureDashboardKitStyles } from './styles';
import { defaultWidgetRenderer } from './widgets';

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
  /**
   * Add a widget to a view. CREATES the node (you do not pre-build one), wires
   * its metadata, and commits node + membership as ONE undoable step.
   * Auto-positions when the spec names no cell.
   */
  addWidget(spec: DashboardWidgetSpec, viewId?: string): WidgetHandle | undefined;
  /**
   * Re-read every board from the model — call after undo/redo, or any
   * out-of-band mutation, so the grid and the projection agree again.
   */
  refresh(): void;
  /** Re-frame the camera on a view (default: the active one). */
  fit(viewId?: string): void;
  /** Live geometry of a view's board (columns, gap, rows, rowHeight, frame…). */
  metrics(viewId?: string): ReturnType<DashboardGridHandle['metrics']> | undefined;
  /** The current layout as plain data — feed it straight back to dashboard(). */
  toJSON(): DashboardViewSpec[];
  /**
   * THE DOCUMENTED ESCAPE HATCH: the view's own `bindDashboardGrid` handle
   * (default: the active view). Reach for it only for what this façade does
   * not cover yet — palette drag-in (`beginPaletteDrag`), board `metrics()`,
   * `cellRectOf`, `planRemoval`, and re-`sync()` after an external undo. Every
   * call site is a named gap in this API, not a normal way to drive a board.
   */
  binderOf(viewId?: string): DashboardGridHandle | undefined;
  dispose(): void;
}

/** One widget's OO surface (mirrors ErTable/UmlClass). */
export interface WidgetHandle {
  readonly id: string;
  readonly viewId: string;
  readonly node: NodeModel | undefined;
  /** The DECLARED spec — read it back (title/kind/data) without a side map. */
  readonly spec: DashboardWidgetSpec;
  /** Current cell, as data. */
  readonly cell: { x: number; y: number; w: number; h: number } | undefined;
  /** The world rect the current cell projects to. */
  readonly rect: { x: number; y: number; width: number; height: number } | undefined;
  /** Resize in CELLS. Resolves TRUE when the board accepted it. */
  resize(span: number, rows: number): Promise<boolean>;
  /** Move to a cell. Resolves TRUE when the board accepted it. */
  moveTo(x: number, y: number): Promise<boolean>;
  /** Pin / unpin (a pinned widget refuses the mover and never gets pushed). */
  pin(on?: boolean): void;
  readonly pinned: boolean;
  /** Raise / lower — one undoable step each (mirrors the toolbar commands). */
  bringToFront(): void;
  sendToBack(): void;
  /**
   * Remove it — ONE undoable step including the survivors' re-pack.
   * `displaced` accepts the commands a drag-out gesture already computed;
   * omit it and the handle plans them itself.
   */
  remove(displaced?: unknown[]): void;
  /** Replace the widget's `data` (and optionally title) and repaint. */
  update(patch: Partial<Pick<DashboardWidgetSpec, 'data' | 'title' | 'kind'>>): void;
  /** Repaint through `renderWidget` (after your data changed). */
  repaint(): void;
}

/**
 * Add a widget node AND its board membership as ONE undoable step.
 *
 * A `BatchCommand([AddNodeCommand, AddToGroupCommand])` cannot express this:
 * the manager validates the whole batch up front, and
 * `AddToGroupCommand.canExecute` pre-gates on the node ALREADY being in the
 * diagram — which it is not until the first command runs. Sequencing two
 * commands works but costs two undo steps, so an interactive "add widget"
 * would need two Ctrl-Z. This composite does both in its own execute(), and
 * unwinds both in undo().
 */
class AddWidgetCommand extends Command {
  constructor(
    private node: NodeModel,
    private groupId: string
  ) {
    super('Add widget');
  }

  override execute(context: { diagram?: unknown }): void {
    const diagram = context.diagram as
      | { addNode(n: NodeModel): void; getGroup(id: string): GroupModel | undefined }
      | undefined;
    if (!diagram) return;
    diagram.addNode(this.node);
    diagram.getGroup(this.groupId)?.addMember(this.node.id);
  }

  override undo(context: { diagram?: unknown }): void {
    const diagram = context.diagram as
      | { removeNode(id: string): unknown; getGroup(id: string): GroupModel | undefined }
      | undefined;
    if (!diagram) return;
    diagram.getGroup(this.groupId)?.removeMember(this.node.id);
    diagram.removeNode(this.node.id);
  }

  override serialize() {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.node.id, groupId: this.groupId },
    };
  }
}

const DEFAULTS = { columns: 12, gap: 8, rowHeight: 130, width: 1180, height: 660 };
const OFFSCREEN_X = -20000;
let autoId = 0;

/** The node a widget spec becomes — one place, so addWidget() and the initial
 *  spec build can never drift apart on metadata. */
function buildWidgetNode(w: DashboardWidgetSpec, rowHeight: number): NodeModel {
  const node = new NodeModel({
    id: w.id,
    type: 'widget',
    position: { x: 0, y: 0 },
    size: { width: 120, height: rowHeight, depth: 0 },
  });
  node.setMetadata('useHTMLLayer', true);
  node.setMetadata('widgetKind', w.kind ?? 'widget');
  node.setMetadata('widgetSpec', w.data ?? {});
  node.setMetadata('columnSpan', w.span ?? 3);
  node.setMetadata('rowSpan', w.rows ?? 1);
  if (w.x !== undefined && w.y !== undefined) {
    node.setGridItem({
      columnStart: w.x + 1,
      columnEnd: w.x + 1 + (w.span ?? 3),
      rowStart: w.y + 1,
      rowEnd: w.y + 1 + (w.rows ?? 1),
    });
  }
  // A dashboard widget is not a wiring endpoint: no ports, no hover glyphs.
  node.setBehavior({ connectable: false });
  for (const p of [...node.getPorts().values()]) node.removePort(p.id);
  return node;
}

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

  // No renderWidget → the built-in renderers draw the declared `kind` from the
  // developer's own `data` (widgets.ts), unknown kinds landing on the titled
  // frame they always did.
  const renderWidget = options.renderWidget ?? defaultWidgetRenderer;

  // -- runtime, populated by finalize() --------------------------------------
  const binders = new Map<string, DashboardGridHandle>();
  const groups = new Map<string, GroupModel>();
  let active = views[0]?.id ?? 'main';
  let apiRef: {
    getModel(): {
      getNode(id: string): NodeModel | undefined;
      addGroup(g: GroupModel): void;
      getGroup(id: string): GroupModel | undefined;
      removeGroup?(id: string): unknown;
    };
    getEngine?: () => { commandManager: { execute(c: unknown): unknown } };
    renderNow(): void;
    viewport?: { fitToBounds(r: unknown, pad: number, o?: unknown): void };
  } | null = null;

  const execCommand = (api: typeof apiRef, cmd: unknown): void => {
    try {
      const r = api?.getEngine?.()?.commandManager.execute(cmd) as { catch?: (f: () => void) => void };
      // Fire-and-forget like the binder's own commits, but never leave an
      // unhandled rejection: a refused command is a no-op, not a crash.
      r?.catch?.(() => undefined);
    } catch {
      /* a refused command must not break the caller */
    }
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
      const w: DashboardWidgetSpec = {
        ...spec,
        id: spec.id || `w-${++autoId}`,
        span: spec.span ?? 3,
        rows: spec.rows ?? 1,
      };
      // REGISTER FIRST: a custom node mounts exactly once, and the painter
      // returns early for an id the spec does not know — so the widget must be
      // known before the node reaches the model, or it paints blank forever.
      v.widgets.push(w);
      specById.set(w.id, w);
      viewOfWidget.set(w.id, vid);

      const existing = model.getNode(w.id);
      const node = existing ?? buildWidgetNode(w, rowHeight);
      if (w.pinned) node.setState({ locked: true });
      // ONE undoable step (see AddWidgetCommand for why this cannot be a batch).
      execCommand(
        apiRef,
        existing ? new AddToGroupCommand(group.id, w.id) : new AddWidgetCommand(node, group.id)
      );

      binders.get(vid)?.sync();
      apiRef?.renderNow();
      return makeWidgetHandle(w.id);
    },
    refresh() {
      for (const b of binders.values()) b.sync();
      apiRef?.renderNow();
    },
    fit(viewId) {
      const g = groups.get(viewId ?? active);
      if (!g) return;
      const gs = g.size ?? { width: boardW, height: boardH };
      apiRef?.viewport?.fitToBounds(
        { x: g.position.x, y: g.position.y, width: gs.width, height: gs.height },
        26,
        { maxZoom: 1 }
      );
    },
    metrics(viewId) {
      return binders.get(viewId ?? active)?.metrics();
    },
    binderOf(viewId) {
      return binders.get(viewId ?? active);
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
      // The groups finalize() created are ours to clean up — leaving them
      // behind made a rebuild stack a second set of boards on the first.
      const model = apiRef?.getModel();
      for (const id of groups.keys()) model?.removeGroup?.(id);
      groups.clear();
      hosts.clear();
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
      get spec() {
        return spec;
      },
      get cell() {
        return binder()?.cellOf(id);
      },
      get rect() {
        return binder()?.cellRectOf(id);
      },
      get pinned() {
        return node()?.state?.locked === true;
      },
      async resize(span, rows) {
        return (await binder()?.resizeTo(id, span, rows)) ?? false;
      },
      async moveTo(x, y) {
        return (await binder()?.moveTo(id, x, y)) ?? false;
      },
      pin(on) {
        const n = node();
        if (!n) return;
        n.setState({ locked: on ?? !(n.state?.locked === true) });
        // Re-sync so the ENGINE's locked flag (never pushed, drags refused)
        // and the hidden corner handle take effect on this frame, not the next
        // gesture.
        binder()?.sync();
        apiRef?.renderNow();
      },
      bringToFront() {
        execCommand(apiRef, new BringNodeToFrontCommand(id));
        apiRef?.renderNow();
      },
      sendToBack() {
        execCommand(apiRef, new SendNodeToBackCommand(id));
        apiRef?.renderNow();
      },
      update(patch) {
        if (patch.data !== undefined) spec.data = patch.data;
        if (patch.title !== undefined) spec.title = patch.title;
        if (patch.kind !== undefined) spec.kind = patch.kind;
        const host = hostOf(id);
        if (host) renderWidget(spec, host);
      },
      remove(displaced) {
        const n = node();
        const group = groups.get(viewId);
        const b = binder();
        if (!n || !group || !b) return;
        // ONE undoable step, survivors' re-pack folded in — the same atomic
        // shape the kit's own drag-out-to-remove uses. A gesture that ALREADY
        // computed the survivors passes them in: after a drag-out the tile is
        // gone from the engine, so planRemoval() would return [] and the
        // survivors' cells would never commit.
        const survivors = (displaced as never[] | undefined) ?? b.planRemoval(id);
        const cmds = [...survivors, new RemoveFromGroupCommand(group.id, id), new RemoveNodeCommand(id)];
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
      // (hosts are captured in renderCustomNode, so repaint works for every
      //  widget the renderer has mounted — including after a rebuild.)
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
          // DECLARED CELLS ARE AUTHORITATIVE. `metadata.gridItem` on the node
          // SPEC is inert — the model's GridItemConfig is a real field
          // (`setGridItem`), and it is the only thing the binder reads. Without
          // this write the board silently auto-positioned instead, which
          // matched the declaration only while flow order happened to agree,
          // and made toJSON() → dashboard() NOT round-trip (a saved layout
          // rebuilt back into its declaration order rather than its cells).
          if (w.x !== undefined && w.y !== undefined) {
            n.setGridItem(gridItemFromCell({ x: w.x, y: w.y, w: w.span ?? 3, h: w.rows ?? 1 }));
          }
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
