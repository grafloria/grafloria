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
  BatchCommand,
  BringNodeToFrontCommand,
  Command,
  GroupModel,
  NodeModel,
  RemoveFromGroupCommand,
  RemoveGroupCommand,
  RemoveNodeCommand,
  SendNodeToBackCommand,
  type GridColumnLayout,
} from '@grafloria/engine';
import {
  bindDashboardGrid,
  type DashboardGridHandle,
  type DashboardGridOptions,
  type DashboardResponsiveOptions,
} from './grid-binder';
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
  /**
   * SIZE LIMITS in cells (gridstack's minW/maxW/minH/maxH). A resize — by
   * hand, by the API, or by a column change scaling widths — clamps to them.
   * `maxRows` here is the WIDGET's row limit; a container's inner row count is
   * its own `maxRows` field one level up, which is why these live in `limits`.
   */
  limits?: { minSpan?: number; maxSpan?: number; minRows?: number; maxRows?: number };
  /** May the user drag it? Default true. The API can always move it. */
  movable?: boolean;
  /** May the user resize it? Default true (no handle when false). The API can always resize it. */
  resizable?: boolean;
  /** Your payload — passed straight back to `renderWidget`. */
  data?: Record<string, unknown>;
  /** Optional title used by the built-in fallback renderer. */
  title?: string;
  /**
   * CONTAINMENT. A widget carrying `widgets` is a CONTAINER: it mounts as a
   * member group (a locked slab in its parent's grid, exactly like a view's
   * board one level down) with its own nested pack grid bound on it. Children
   * lay out inside its frame; dragging a tile across the boundary adopts it
   * live in either direction, and one undo restores the whole gesture.
   * Containers may nest — tested to TWO levels; deeper is not exercised by
   * the gates and rides at your own risk. A container renders no card of its
   * own (`kind`/`data` are carried for your bookkeeping and serialization,
   * not painted).
   */
  widgets?: DashboardWidgetSpec[];
  /**
   * Container only: column count of the INNER grid (default: the parent
   * board's column count).
   */
  columns?: number;
  /**
   * Container only: the inner grid's designed row count. A child resized past
   * it ESCALATES — the container's slab grows a row in the parent board (the
   * ratchet), instead of the child overflowing the frame. Default: the row
   * extent of the declared children.
   */
  maxRows?: number;
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
  /**
   * Sizing mode. 'grow': rows keep `rowHeight` and the board extends
   * downward — the default on a FLUID board, and what every grid library
   * does: dragging one tile never resizes another. 'fit': the board keeps its
   * height and rows squeeze so everything stays on one screen (bounded, see
   * `overflow`) — the default on a FIXED board, and the choice for a designer
   * who wants the whole dashboard visible at once.
   */
  sizing?: 'fit' | 'grow';
  /** Row height in 'grow' mode, px (default 130). */
  rowHeight?: number;
  /** Board size, px (default 1180 × 660). */
  width?: number;
  height?: number;
  /** Engine float mode (default false → gravity packs upward). */
  float?: boolean;
  /**
   * DIAGRAM OR LAYOUT — the one switch (decision of 2026-09-06).
   *
   * 'fluid' (the default): the board is 100% of its container, laid out at
   *   real CSS pixels; zoom is pinned at 1; a plain wheel scrolls; in 'fit' the
   *   height follows the container too. What every grid library does, and
   *   what "responsive" means to a dashboard author.
   * 'fixed': the authored `width`/`height` are the world, and the camera frames
   *   them — today's behaviour, kept for a dashboard embedded inside a larger
   *   diagram. An explicit `width` implies 'fixed', so existing boards keep
   *   their behaviour without naming a mode.
   */
  mode?: 'fluid' | 'fixed';
  /**
   * FIT MEANS BOUNDED. In 'fit' the board never changes size; widgets do. Past
   * the row floor the design height is a CAPACITY: a drop, resize or
   * `addWidget()` that would need one row too many is refused (the placeholder
   * stays put, the palette chip dims, `addWidget` returns undefined) — at
   * design time, instead of tiles painted past the frame. A board that already
   * holds more than fits (a grow→fit switch, a loaded document) squeezes its
   * rows below the floor: a bounded fit board NEVER scrolls. 'scroll' is the
   * opt-in for boards that want more than fits: the frame extends to hold the
   * rows at the floor height and the canvas pans.
   */
  overflow?: 'bounded' | 'scroll';
  /**
   * STATIC board (gridstack's `staticGrid`): no drag, no resize, no handles —
   * the viewer's mode. The API (moveTo, resize, addWidget, undo) still works,
   * so a designer/viewer pair is one flag apart. Live: `handle.setStatic()`.
   */
  static?: boolean;
  /**
   * RIGHT-TO-LEFT boards: column x=0 renders at the RIGHT edge and columns run
   * leftwards. Cells are untouched — the same `widgets` array describes the
   * same layout in both directions, and a layout saved in one renders mirrored
   * in the other with identical cells.
   */
  rtl?: boolean;
  /**
   * RESPONSIVE COLUMN COUNT: derive the live count from each board's width.
   * `{ columnWidth: 100 }` gives one column per ~100px (capped by `columns`);
   * `{ breakpoints: [{ w: 480, c: 1 }, { w: 900, c: 6 }] }` names the steps.
   * The count changes through the engine's per-column layout CACHE, so
   * narrowing and widening again restores the wide layout exactly, and
   * `toJSON()` keeps serialising the widest layout however narrow the board is.
   */
  responsive?: DashboardResponsiveOptions;
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
  /**
   * Instance options the spec asks `render()` to apply — a fluid board pins
   * the zoom range to 1 so the layout can never become a scaled picture.
   */
  renderOptions?: { minZoom?: number; maxZoom?: number };
}

/**
 * A whole board as plain data: every `DashboardOptions` field except the
 * function seams. `dashboard({ ...snapshot, renderWidget })` rebuilds it.
 *
 * Typed as an Omit rather than a hand-written twin on purpose — a field added
 * to `DashboardOptions` then joins the snapshot automatically instead of being
 * silently dropped, which is the exact failure this type exists to end.
 */
export type DashboardSnapshot = Omit<
  DashboardOptions,
  'renderWidget' | 'onLayoutChange' | 'views'
> & { views: DashboardViewSpec[] };

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
   * Set the COLUMN COUNT of every board (or one view), live. Goes through the
   * engine's per-column layout cache, so shrinking then growing back restores
   * the wide layout rather than re-deriving it. An explicit call PINS the
   * count — the width-driven `responsive` evaluator stops overriding it.
   */
  setColumns(n: number, layout?: GridColumnLayout, viewId?: string): void;
  /** The LIVE column count of a view (default: the active one). */
  getColumns(viewId?: string): number;
  /** RTL mirroring, live — pixels only, cells never change. */
  setRtl(on: boolean): void;
  getRtl(): boolean;
  /** Static (read-only for the pointer) mode, live — the viewer/designer switch. */
  setStatic(on: boolean): void;
  getStatic(): boolean;
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
  /**
   * The whole board as plain data — feed it straight back to `dashboard()`:
   *
   * ```ts
   * dashboard({ ...handle.toJSON(), renderWidget });   // a true round trip
   * ```
   *
   * Everything `DashboardOptions` takes EXCEPT the function seams
   * (`renderWidget`, `onLayoutChange`), which cannot be written to a file and
   * must be supplied again on the way back in.
   *
   * Values are read from the LIVE board, not from the authored literal, so a
   * mode or column count the user changed after mount is what you get back.
   *
   * This used to return only `views`, which made the round-trip claim true of
   * the layout and false of the board: a board authored `grow` at a 10-column,
   * 6px-gap geometry reloaded as a 12-column `fit` one. It is also what
   * `JSON.stringify(handle)` calls, so the partial answer was a permanent
   * footgun in a save API rather than merely an omission.
   */
  toJSON(): DashboardSnapshot;
  /**
   * The node ids ONE view occupies — pass straight to `includeIds` to export
   * just that board:
   *
   * ```ts
   * api.export('pdf', { includeIds: handle.exportIds() });
   * ```
   *
   * WHY THIS EXISTS. Tabs park the inactive views far off-camera, which is
   * invisible on screen and ruinous on export: `export()` frames the whole
   * MODEL, so a two-view board writes a ~21,000px document that is almost
   * entirely empty — with no warning, because nothing is technically wrong.
   * Scoping was always possible; knowing WHAT to scope to was not.
   *
   * The set includes the view's GROUP as well as its widgets. Rolling this by
   * hand from `toJSON()` looks equivalent and is not — it drops the group, and
   * the widgets export without the frame they sit in.
   */
  exportIds(viewId?: string): Set<string>;
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
  /**
   * `registry` is the kit's bookkeeping for the widget (see
   * RegisterWidgetCommand): it is applied INSIDE this command rather than in a
   * batch beside it, because a batch runs its members across awaits and the
   * node would reach the model a microtask after the caller's `addWidget()`
   * returned — every consumer that read the model right after would have
   * broken. `nodeWasInModel` covers re-adding a node that already exists
   * (membership only), the case that used to be a separate AddToGroupCommand.
   */
  constructor(
    private node: NodeModel,
    private groupId: string,
    private registry?: { register(): void; unregister(): void },
    private nodeWasInModel = false
  ) {
    super('Add widget');
  }

  override execute(context: { diagram?: unknown }): void {
    const diagram = context.diagram as
      | { addNode(n: NodeModel): void; getNode(id: string): NodeModel | undefined; getGroup(id: string): GroupModel | undefined }
      | undefined;
    if (!diagram) return;
    this.registry?.register();
    if (!this.nodeWasInModel && !diagram.getNode(this.node.id)) diagram.addNode(this.node);
    diagram.getGroup(this.groupId)?.addMember(this.node.id);
  }

  override undo(context: { diagram?: unknown }): void {
    const diagram = context.diagram as
      | { removeNode(id: string): unknown; getGroup(id: string): GroupModel | undefined }
      | undefined;
    if (!diagram) return;
    diagram.getGroup(this.groupId)?.removeMember(this.node.id);
    if (!this.nodeWasInModel) diagram.removeNode(this.node.id);
    this.registry?.unregister();
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

/**
 * The kit's BOOKKEEPING for a widget — its spec, its board, its slot in the
 * authored array — travels through the history WITH the node.
 *
 * It did not, and that was D2 of the 2026-09-06 review: `remove()` deleted the
 * spec synchronously while the removal itself was a command, so undo restored
 * the node and the membership through the model and the painter — asked to
 * paint a node whose id the kit no longer knew — returned without drawing. A
 * blank host where the donut was, `widget(id)` undefined, not listed. The
 * comment on AddWidgetCommand already warns that the painter needs the spec
 * BEFORE the node reaches the model; the same holds on the way back in.
 *
 * `register`/`unregister` are idempotent so the handle may also apply them
 * synchronously (execute() is async, and the caller reads the handle right
 * after) without double-counting when the command runs.
 */
class RegisterWidgetCommand extends Command {
  constructor(
    private registry: { register(): void; unregister(): void },
    private direction: 'register' | 'unregister'
  ) {
    super(direction === 'register' ? 'Register widget' : 'Unregister widget');
  }

  override execute(): void {
    if (this.direction === 'register') this.registry.register();
    else this.registry.unregister();
  }

  override undo(): void {
    if (this.direction === 'register') this.registry.unregister();
    else this.registry.register();
  }

  override serialize() {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { direction: this.direction } };
  }
}

/**
 * Pin as ONE undoable step. `pin()` wrote the node's lock directly, which made
 * it the only layout mutation outside the history (Ctrl-Z after a pin undid the
 * gesture before it) and the reason toJSON() never saw it — D5. `before` is
 * captured at construction so the handle can apply the lock synchronously and
 * let the command re-apply it idempotently when it runs.
 */
class SetWidgetLockCommand extends Command {
  constructor(
    private nodeId: string,
    private before: boolean,
    private after: boolean
  ) {
    super(after ? 'Pin widget' : 'Unpin widget');
  }

  private apply(context: { diagram?: unknown }, locked: boolean): void {
    const diagram = context.diagram as { getNode(id: string): NodeModel | undefined } | undefined;
    diagram?.getNode(this.nodeId)?.setState({ locked });
  }

  override execute(context: { diagram?: unknown }): void {
    this.apply(context, this.after);
  }

  override undo(context: { diagram?: unknown }): void {
    this.apply(context, this.before);
  }

  override serialize() {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, before: this.before, after: this.after },
    };
  }
}

/** The history events a layout can change on — the engine's DiagramEventTypes
 *  values, spelled out so the kit needs no import from the engine's type bag. */
const HISTORY_EVENTS = ['command:executed', 'command:undone', 'command:redone'] as const;

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
  // The TITLE was the one authored field that never reached the node — so a
  // document-level reload rebuilt every card with `titleOf()` falling through to
  // the kind, and a board of "Revenue vs target" / "Top reps by revenue" came
  // back as "line" / "table". Only written when authored, so an untitled widget
  // serialises exactly as it always did.
  if (w.title !== undefined) node.setMetadata('widgetTitle', w.title);
  node.setMetadata('columnSpan', w.span ?? 3);
  node.setMetadata('rowSpan', w.rows ?? 1);
  // Limits and the two pointer flags reach the node too, so the binder reads
  // them and a reload rebuilds them (only when authored — an unconstrained
  // widget serialises exactly as it always did).
  if (w.limits !== undefined) node.setMetadata('widgetLimits', { ...w.limits });
  if (w.movable === false) node.setMetadata('widgetMovable', false);
  if (w.resizable === false) node.setMetadata('widgetResizable', false);
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

function cloneWidgets(ws: DashboardWidgetSpec[]): DashboardWidgetSpec[] {
  return ws.map((w) => ({ ...w, ...(w.widgets ? { widgets: cloneWidgets(w.widgets) } : {}) }));
}

/** A container's inner column count: authored, else its own span — inner cells
 *  then ride the parent's column rhythm, which is what a section reads as. */
function innerColumnsOf(w: DashboardWidgetSpec): number {
  return Math.max(1, w.columns ?? w.span ?? 3);
}

/** The row extent of a laid-out widget list (the inner grid's design height). */
function rowExtentOf(widgets: DashboardWidgetSpec[]): number {
  let max = 1;
  for (const w of widgets) max = Math.max(max, (w.y ?? 0) + (w.rows ?? 1));
  return max;
}

/** Recursive `assignCells`: a container flows in its parent like any widget,
 *  and its children flow inside its OWN column count. */
function assignCellsDeep(widgets: DashboardWidgetSpec[], columns: number): void {
  assignCells(widgets, columns);
  for (const w of widgets) {
    if (w.widgets) assignCellsDeep(w.widgets, innerColumnsOf(w));
  }
}

/** Flow widgets that declared no cell: left-to-right, wrapping at `columns`. */
function assignCells(widgets: DashboardWidgetSpec[], columns: number): void {
  let x = 0;
  let y = 0;
  let rowMax = 0;
  for (const w of widgets) {
    const lim = w.limits ?? {};
    let span = Math.max(1, Math.min(columns, w.span ?? 3));
    if (lim.minSpan !== undefined) span = Math.max(span, lim.minSpan);
    if (lim.maxSpan !== undefined) span = Math.min(span, lim.maxSpan);
    span = Math.max(1, Math.min(columns, span));
    let rows = Math.max(1, w.rows ?? 1);
    if (lim.minRows !== undefined) rows = Math.max(rows, lim.minRows);
    if (lim.maxRows !== undefined) rows = Math.min(rows, lim.maxRows);
    rows = Math.max(1, rows);
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

/**
 * The API surface the handle drives — the slice of a DiagramInstance both
 * `dashboard().finalize` and `fromDocument().finalize` hand in. Named (was an
 * inline type on the old `apiRef` local) because two call sites now share it.
 */
export interface DashboardApiRef {
  getModel(): {
    getNode(id: string): NodeModel | undefined;
    addGroup(g: GroupModel): void;
    getGroup(id: string): GroupModel | undefined;
    removeGroup?(id: string): unknown;
    removeNode?(id: string): unknown;
  };
  getEngine?: () => {
    commandManager: { execute(c: unknown): unknown };
    /** The engine's bus — the kit listens for history events on it (D3). */
    eventBus?: { on(event: string, handler: (...args: unknown[]) => void): () => void };
  };
  renderNow(): void;
  viewport?: {
    fitToBounds(r: unknown, pad: number, o?: unknown): void;
    /** Fluid boards pin the camera instead of framing the board. */
    setZoom?(z: number): unknown;
    getViewport?(): { x: number; y: number; width: number; height: number };
    setViewport?(r: { x: number; y: number; width: number; height: number }): void;
    /** Camera changes (wheel, drag-pan, a canvas resize) — the fluid clamp listens. */
    onChange?(listener: (state: unknown) => void): () => void;
  };
}

/**
 * Everything one `DashboardHandle` closes over, gathered into ONE object so a
 * single builder can serve both `dashboard()` (context built from the authored
 * literal) and `fromDocument()` (context reconstructed from the loaded model).
 *
 * `active` and `apiRef` are the two MUTABLE cells: the handle READS them on
 * every call and the builder WRITES them (showView reassigns `active`, the
 * caller's finalize sets `apiRef`). They live here rather than as free `let`s
 * precisely because there are now two call sites — a boxed cell one builder
 * reads and writes is the whole reason a second handle implementation, which
 * would silently drift, is not needed.
 */
export interface DashboardHandleContext {
  /** The views — MUTATED in place by addWidget (push) and remove (filter). */
  views: DashboardViewSpec[];
  groups: Map<string, GroupModel>;
  binders: Map<string, DashboardGridHandle>;
  specById: Map<string, DashboardWidgetSpec>;
  /** Widget id → the BOARD that owns it (a view id, or a container id). */
  viewOfWidget: Map<string, string>;
  /** Every board group — the views PLUS every container. Views also live in
   *  `groups` (the parking map showView drives); containers deliberately do
   *  NOT — parking flings a group to OFFSCREEN_X, and a container must follow
   *  its parent, not travel on its own. */
  boardGroups: Map<string, GroupModel>;
  /** Board id → its authored widgets array (views and containers alike). */
  boardWidgets: Map<string, DashboardWidgetSpec[]>;
  /** Board id → the VIEW it belongs to (identity for views). */
  viewOfBoard: Map<string, string>;
  hosts: Map<string, HTMLElement>;
  renderWidget: (widget: DashboardWidgetSpec, host: HTMLElement) => void;
  columns: number;
  gap: number;
  rowHeight: number;
  boardW: number;
  boardH: number;
  /** See DashboardOptions.mode / overflow. */
  mode: 'fluid' | 'fixed';
  overflow: 'bounded' | 'scroll';
  /**
   * Spread verbatim into `toJSON()` output — carries width/height/responsive
   * and any other authored option so a new `DashboardOptions` field round-trips
   * for free (dashboard() passes the whole `options`; fromDocument() passes the
   * geometry it can recover from the persisted board metadata).
   */
  optionsBase: Partial<DashboardOptions>;
  /** MUTABLE — reassigned by showView(). */
  active: string;
  /** MUTABLE — set by the caller's finalize once the render API exists. */
  apiRef: DashboardApiRef | null;
  /** The consumer's layout hook, if any (dashboard() passes its option). */
  onLayoutChange?: (viewId: string, widgets: DashboardWidgetSpec[]) => void;
  /**
   * Set by createDashboardHandle. `reportChanged()` fires `onLayoutChange` for
   * every view whose layout differs from the last report — ONE reporter for
   * pointer commits, API calls, undo/redo and column changes alike, so a
   * consumer's autosave sees every change and never the same change twice.
   * `attachHistory()` is what finalize calls once `apiRef` exists: it
   * subscribes the boards to the command history so an undo re-syncs them
   * without the consumer calling refresh().
   */
  reportChanged?: () => void;
  attachHistory?: () => void;
  /** Unsubscribers dispose() runs. */
  subscriptions?: Array<() => void>;
  /**
   * Re-bind a CONTAINER whose group came back through the history (undo of a
   * container removal restores the group as a fresh GroupModel, which the old
   * binder cannot see). Set by the two finalizes; called by the history
   * handler for any board group the model holds without a binder.
   */
  rebindContainer?: (id: string) => void;
}

/**
 * Build THE `DashboardHandle` — the one and only implementation, shared by
 * `dashboard()` and `fromDocument()`. Reads/writes the mutable `ctx.active` /
 * `ctx.apiRef` cells so the caller's finalize can wire the API in afterwards.
 */
export function createDashboardHandle(ctx: DashboardHandleContext): DashboardHandle {
  const { views, groups, binders, specById, viewOfWidget } = ctx;

  const hostOf = (id: string): HTMLElement | undefined => ctx.hosts.get(id);

  /**
   * Put the camera on a view. FLUID: the board IS the container, so the camera
   * sits at zoom 1 with the board's origin at the top-left — never a fit, which
   * is what made a dashboard a scaled picture (D1). FIXED: frame the board.
   */
  const frameView = (g: GroupModel): void => {
    const vp = ctx.apiRef?.viewport;
    if (!vp) return;
    const gs = g.size ?? { width: ctx.boardW, height: ctx.boardH };
    if (ctx.mode === 'fluid' && vp.setViewport && vp.getViewport) {
      vp.setZoom?.(1);
      const cur = vp.getViewport();
      vp.setViewport({ x: g.position.x, y: g.position.y, width: cur.width, height: cur.height });
      return;
    }
    vp.fitToBounds(
      { x: g.position.x, y: g.position.y, width: gs.width, height: gs.height },
      26,
      { maxZoom: 1 }
    );
  };

  /**
   * FLUID: the camera is a SCROLL POSITION over the board, never a free pan.
   * Bounded to the active board's frame — the page-scroll model of every grid
   * library — so a wheel cannot run past the last row, and a frame that
   * shrinks under a scrolled camera (Fit after a scroll in Grow; an undo that
   * removes rows) pulls the camera back into the board. Found by the user
   * switching Fit and Grow on the live page: Fit shrank the board to the
   * canvas while the camera stayed 600 px down — the top half of the board
   * out of view above an empty canvas. FIXED boards are diagrams and pan free.
   */
  let clamping = false;
  const clampCamera = (): void => {
    if (ctx.mode !== 'fluid' || clamping) return;
    const vp = ctx.apiRef?.viewport;
    const g = groups.get(ctx.active);
    if (!vp?.getViewport || !vp.setViewport || !g) return;
    const cur = vp.getViewport();
    const gs = g.size ?? { width: ctx.boardW, height: ctx.boardH };
    const x = Math.min(Math.max(cur.x, g.position.x), g.position.x + Math.max(0, gs.width - cur.width));
    const y = Math.min(Math.max(cur.y, g.position.y), g.position.y + Math.max(0, gs.height - cur.height));
    if (Math.abs(x - cur.x) < 0.5 && Math.abs(y - cur.y) < 0.5) return;
    clamping = true;
    try {
      vp.setViewport({ x, y, width: cur.width, height: cur.height });
    } finally {
      clamping = false;
    }
  };

  /**
   * A board's widgets as a NESTED tree, derived from LIVE membership — not the
   * authored arrays. A cross-boundary drag moves membership through commands
   * (and undo moves it back); the authored arrays do not follow. Deriving from
   * the groups + engines is what makes toJSON() and onLayoutChange report a
   * tile under the container it is actually in, in every one of those states.
   */
  const treeOf = (boardId: string): DashboardWidgetSpec[] => {
    const g = ctx.boardGroups.get(boardId);
    const b = binders.get(boardId);
    if (!g) return [];
    // Cells from the binder's serialisation (largest cached layout — the
    // saving-on-a-phone rule), falling back to the live engine cell.
    const saved = b?.saveLayout();
    const cellOf = (id: string) => saved?.cells.get(id) ?? b?.cellOf(id);
    const entries: DashboardWidgetSpec[] = [];
    for (const memberId of g.members ?? []) {
      const spec = specById.get(memberId);
      const cell = cellOf(memberId);
      const at = cell ? { x: cell.x, y: cell.y, span: cell.w, rows: cell.h } : {};
      if (ctx.boardGroups.has(memberId)) {
        entries.push({ id: memberId, ...(spec ?? {}), ...at, widgets: treeOf(memberId) });
      } else if (spec) {
        // `pinned` is read from the NODE's lock, not the authored spec: pin()
        // changes the node, and a saved board must come back pinned the way
        // the user left it (D5). Written only when true, so an unpinned
        // widget serialises exactly as it always did.
        const entry: DashboardWidgetSpec = { ...spec, ...at };
        if (ctx.apiRef?.getModel().getNode(memberId)?.state?.locked === true) entry.pinned = true;
        else delete entry.pinned;
        entries.push(entry);
      }
    }
    entries.sort((p1, p2) => (p1.y ?? 0) - (p2.y ?? 0) || (p1.x ?? 0) - (p2.x ?? 0));
    return entries;
  };

  /** Bookkeeping closures for one widget, shared by the add and remove
   *  commands (and applied synchronously by the handle — idempotent). */
  const registryOf = (id: string, boardId: string, spec: DashboardWidgetSpec) => {
    let slot = -1;
    return {
      register: (): void => {
        specById.set(id, spec);
        viewOfWidget.set(id, boardId);
        const arr = ctx.boardWidgets.get(boardId);
        if (arr && !arr.some((w) => w.id === id)) {
          arr.splice(slot < 0 ? arr.length : Math.min(slot, arr.length), 0, spec);
        }
      },
      unregister: (): void => {
        specById.delete(id);
        viewOfWidget.delete(id);
        const arr = ctx.boardWidgets.get(boardId);
        if (arr) {
          const i = arr.findIndex((w) => w.id === id);
          if (i >= 0) {
            slot = i; // remembered so undo puts it back where it was
            arr.splice(i, 1);
          }
        }
      },
    };
  };

  // ONE reporter for every path that changes a layout (D3). Diff-based: a
  // pointer commit reports synchronously, the history event that follows finds
  // nothing new and stays quiet.
  const lastReported = new Map<string, string>();
  const reportChanged = (): void => {
    if (!ctx.onLayoutChange || !ctx.apiRef) return;
    for (const v of handle.toJSON().views) {
      const key = JSON.stringify(v.widgets);
      if (lastReported.get(v.id) === key) continue;
      lastReported.set(v.id, key);
      ctx.onLayoutChange(v.id, v.widgets);
    }
  };
  ctx.reportChanged = reportChanged;

  // The boards follow the HISTORY, not the consumer's memory of it: after any
  // command lands, is undone or redone, every binder re-reads the model and the
  // reporter runs. This is what retires "call refresh() after undo".
  ctx.attachHistory = (): void => {
    const bus = ctx.apiRef?.getEngine?.()?.eventBus;
    if (!bus) return;
    // Prime the reporter so the boot layout is never reported as a change.
    for (const v of handle.toJSON().views) lastReported.set(v.id, JSON.stringify(v.widgets));
    const onHistory = (): void => {
      if (!ctx.apiRef) return;
      const model = ctx.apiRef.getModel();
      for (const id of [...ctx.boardGroups.keys()]) {
        if (!binders.has(id) && model.getGroup(id)) ctx.rebindContainer?.(id);
      }
      for (const b of binders.values()) b.sync();
      clampCamera();
      ctx.apiRef.renderNow();
      reportChanged();
    };
    ctx.subscriptions = ctx.subscriptions ?? [];
    for (const ev of HISTORY_EVENTS) ctx.subscriptions.push(bus.on(ev, onHistory));
    const vp = ctx.apiRef?.viewport;
    if (ctx.mode === 'fluid' && vp?.onChange) ctx.subscriptions.push(vp.onChange(() => clampCamera()));
  };

  const execCommand = (cmd: unknown): void => {
    try {
      const r = ctx.apiRef?.getEngine?.()?.commandManager.execute(cmd) as {
        catch?: (f: () => void) => void;
      };
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
      return ctx.active;
    },
    showView(id) {
      if (!groups.has(id)) return;
      ctx.active = id;
      for (const [vid, g] of groups) {
        const x = vid === id ? 0 : OFFSCREEN_X;
        const s = g.size ?? { width: ctx.boardW, height: ctx.boardH };
        if (g.position.x !== x) g.setFrame({ x, y: 0, width: s.width, height: s.height });
      }
      binders.get(id)?.sync();
      ctx.apiRef?.renderNow();
      frameView(groups.get(id)!);
    },
    widget(id) {
      return makeWidgetHandle(id);
    },
    widgetsOf(viewId) {
      const v = views.find((x) => x.id === (viewId ?? ctx.active));
      return (v?.widgets ?? []).map((w) => makeWidgetHandle(w.id)).filter(Boolean) as WidgetHandle[];
    },
    setSizing(mode) {
      for (const b of binders.values()) b.setSizing(mode);
      clampCamera();
      ctx.apiRef?.renderNow();
    },
    getSizing: () =>
      binders.get(ctx.active)?.getSizing() ?? ctx.optionsBase.sizing ?? (ctx.mode === 'fluid' ? 'grow' : 'fit'),
    setFloat(on) {
      for (const b of binders.values()) b.setFloat(on);
      ctx.apiRef?.renderNow();
      reportChanged(); // gravity re-packs when float turns off
    },
    getFloat: () => binders.get(ctx.active)?.getFloat() ?? (ctx.optionsBase.float ?? false),
    setColumns(n, layout, viewId) {
      const targets = viewId ? [binders.get(viewId)] : [...binders.values()];
      for (const b of targets) b?.setColumns(n, layout);
      ctx.apiRef?.renderNow();
      reportChanged(); // derived state, never a command — report it here
    },
    getColumns: (viewId) => binders.get(viewId ?? ctx.active)?.getColumns() ?? ctx.columns,
    setRtl(on) {
      for (const b of binders.values()) b.setRtl(on);
      ctx.apiRef?.renderNow();
    },
    getRtl: () => binders.get(ctx.active)?.getRtl() ?? (ctx.optionsBase.rtl ?? false),
    setStatic(on) {
      for (const b of binders.values()) b.setStatic(on);
      ctx.apiRef?.renderNow();
    },
    getStatic: () => binders.get(ctx.active)?.getStatic() ?? (ctx.optionsBase.static ?? false),
    addWidget(spec, viewId) {
      const vid = viewId ?? ctx.active;
      // `vid` may name a view OR a container — both are boards with a group,
      // a binder and an authored array.
      const arr = ctx.boardWidgets.get(vid);
      const model = ctx.apiRef?.getModel();
      const group = ctx.boardGroups.get(vid);
      if (!arr || !model || !group) return undefined;
      const w: DashboardWidgetSpec = {
        ...spec,
        id: spec.id || `w-${++autoId}`,
        span: spec.span ?? 3,
        rows: spec.rows ?? 1,
      };
      // REGISTER FIRST: a custom node mounts exactly once, and the painter
      // returns early for an id the spec does not know — so the widget must be
      // known before the node reaches the model, or it paints blank forever.
      // The registration ALSO rides in the batch, so undo un-lists the widget
      // and redo lists it again before the node comes back.
      // A bounded fit board with no room says so HERE, before anything is
      // created: undefined, the same answer as an unknown board.
      if (binders.get(vid)?.willItFit(w.span!, w.rows!) === false) return undefined;

      const registry = registryOf(w.id, vid, w);
      registry.register();

      const existing = model.getNode(w.id);
      const node = existing ?? buildWidgetNode(w, ctx.rowHeight);
      if (w.pinned) node.setState({ locked: true });
      // ONE undoable step, registration included (see AddWidgetCommand).
      execCommand(new AddWidgetCommand(node, group.id, registry, !!existing));

      binders.get(vid)?.sync();
      ctx.apiRef?.renderNow();
      return makeWidgetHandle(w.id);
    },
    refresh() {
      for (const b of binders.values()) b.sync();
      ctx.apiRef?.renderNow();
    },
    fit(viewId) {
      const g = groups.get(viewId ?? ctx.active);
      if (g) frameView(g);
    },
    metrics(viewId) {
      return binders.get(viewId ?? ctx.active)?.metrics();
    },
    binderOf(viewId) {
      return binders.get(viewId ?? ctx.active);
    },
    exportIds(viewId) {
      const id = viewId ?? ctx.active;
      const ids = new Set<string>();
      // A view with no group is a view that was never finalized — an empty set
      // is the honest answer, and scoping an export to nothing is a visible
      // failure rather than a silently enormous document.
      if (!groups.has(id)) return ids;
      ids.add(id);
      // Read the SPEC, not the group's member Set: membership is maintained by
      // commands and an in-flight drag can have a widget momentarily reparented.
      // The spec is what the view IS. Containers add themselves AND their
      // subtree — an exported container without its children is an empty frame.
      const walk = (ws: DashboardWidgetSpec[]): void => {
        for (const w of ws) {
          ids.add(w.id);
          if (w.widgets) walk(w.widgets);
        }
      };
      walk(views.find((v) => v.id === id)?.widgets ?? []);
      return ids;
    },
    toJSON() {
      // SAVING ON A PHONE SAVES THE DESKTOP LAYOUT. The binder serialises from
      // the engine's LARGEST cached column count (gridstack's `save()`), so a
      // board currently squeezed to 1 column still writes out the 12-column
      // layout its user authored — and the view's `columns` is that count, so
      // feeding this straight back into dashboard() rebuilds the wide board.
      const savedViews = views.map((v) => {
        const saved = binders.get(v.id)?.saveLayout();
        const live = treeOf(v.id);
        return {
          ...v,
          ...(saved ? { columns: saved.columns } : {}),
          // Live membership when the view is mounted; the authored tree before
          // finalize (a spec serialised without ever rendering keeps its shape).
          widgets: live.length > 0 || (ctx.boardGroups.get(v.id)?.members?.size ?? 0) > 0 ? live : v.widgets.map((w) => ({ ...w })),
        };
      });

      // Board options come off the LIVE board wherever the handle can see it —
      // `sizing` and `float` are the two a user changes from the toolbar, and
      // reading them from the authored literal would restore the board they
      // started with rather than the one they are looking at.
      return {
        ...ctx.optionsBase,
        renderWidget: undefined,
        onLayoutChange: undefined,
        columns: ctx.columns,
        gap: ctx.gap,
        rowHeight: ctx.rowHeight,
        mode: ctx.mode,
        overflow: ctx.overflow,
        sizing: handle.getSizing(),
        float: handle.getFloat(),
        rtl: handle.getRtl(),
        static: handle.getStatic(),
        views: savedViews,
      } as DashboardSnapshot;
    },
    dispose() {
      for (const off of ctx.subscriptions ?? []) off();
      ctx.subscriptions = [];
      for (const b of binders.values()) b.dispose();
      binders.clear();
      // The groups finalize() created are ours to clean up — leaving them
      // behind made a rebuild stack a second set of boards on the first.
      const model = ctx.apiRef?.getModel();
      // …and so are the widget NODES (D9): they used to stay behind with live
      // hosts, so a consumer switching dashboards in one canvas accumulated
      // orphans, and a rebuild with the same ids re-added nodes that existed.
      for (const id of specById.keys()) {
        if (!ctx.boardGroups.has(id)) model?.removeNode?.(id);
      }
      // Deepest first: a container group removed after its parent is an orphan
      // the model never saw inside a board.
      for (const id of [...ctx.boardGroups.keys()].reverse()) model?.removeGroup?.(id);
      for (const id of groups.keys()) model?.removeGroup?.(id);
      groups.clear();
      ctx.boardGroups.clear();
      ctx.hosts.clear();
    },
  };

  function makeWidgetHandle(id: string): WidgetHandle | undefined {
    const spec = specById.get(id);
    const viewId = viewOfWidget.get(id);
    if (!spec || !viewId) return undefined;
    const binder = () => binders.get(viewId);
    const node = () => ctx.apiRef?.getModel().getNode(id);
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
        const before = n.state?.locked === true;
        const after = on ?? !before;
        if (after === before) return;
        // Applied now so the handle reads back correctly at once, AND recorded
        // as one undoable step (D5) — the command re-applies idempotently.
        n.setState({ locked: after });
        execCommand(new SetWidgetLockCommand(id, before, after));
        // Re-sync so the ENGINE's locked flag (never pushed, drags refused)
        // and the hidden corner handle take effect on this frame, not the next
        // gesture.
        binder()?.sync();
        ctx.apiRef?.renderNow();
        reportChanged();
      },
      bringToFront() {
        execCommand(new BringNodeToFrontCommand(id));
        ctx.apiRef?.renderNow();
      },
      sendToBack() {
        execCommand(new SendNodeToBackCommand(id));
        ctx.apiRef?.renderNow();
      },
      update(patch) {
        if (patch.data !== undefined) spec.data = patch.data;
        if (patch.title !== undefined) spec.title = patch.title;
        if (patch.kind !== undefined) spec.kind = patch.kind;
        const host = hostOf(id);
        if (host) ctx.renderWidget(spec, host);
      },
      remove(displaced) {
        if (spec.widgets) {
          // A CONTAINER (review D12): its subtree, its own group, its slab in
          // the parent board and the parent's re-pack, as ONE undoable batch.
          // Undo restores the groups as fresh GroupModels, so the history
          // handler re-binds the container's grid (ctx.rebindContainer).
          const parentGroup = ctx.boardGroups.get(viewId);
          const parentBinder = binders.get(viewId);
          const model = ctx.apiRef?.getModel();
          if (!parentGroup || !parentBinder || !model) return;
          // ORDER MATTERS FOR UNDO. A batch may only undo when EVERY member
          // can, checked before any of them runs — and RemoveFromGroupCommand
          // can undo only while its group exists. So no membership commands
          // for the members of a group that is going: the group is removed
          // FIRST (its serialized members ride with it and come back on undo),
          // its nodes after; on undo the nodes return, then the group with its
          // membership, then the slab's membership in the parent.
          const cmds: Command[] = [
            ...((displaced as Command[] | undefined) ?? parentBinder.planRemoval(id)),
            new RemoveFromGroupCommand(parentGroup.id, id),
          ];
          const nodeRemovals: Command[] = [];
          const unregisters: Command[] = [];
          const removeSubtree = (boardId: string): void => {
            const g = ctx.boardGroups.get(boardId);
            cmds.push(new RemoveGroupCommand(boardId));
            for (const m of [...(g?.members ?? [])]) {
              const mSpec = specById.get(m);
              if (mSpec) unregisters.push(new RegisterWidgetCommand(registryOf(m, boardId, mSpec), 'unregister'));
              if (ctx.boardGroups.has(m)) removeSubtree(m);
              else nodeRemovals.push(new RemoveNodeCommand(m));
              binders.get(m)?.dispose();
              binders.delete(m);
            }
          };
          removeSubtree(id);
          const registry = registryOf(id, viewId, spec);
          cmds.push(...nodeRemovals, ...unregisters, new RegisterWidgetCommand(registry, 'unregister'));
          binders.get(id)?.dispose();
          binders.delete(id);
          void execCommand(new BatchCommand('Remove section', cmds));
          registry.unregister();
          parentBinder.sync();
          ctx.apiRef?.renderNow();
          return;
        }
        const n = node();
        const group = ctx.boardGroups.get(viewId);
        const b = binder();
        if (!n || !group || !b) return;
        // ONE undoable step, survivors' re-pack folded in — the same atomic
        // shape the kit's own drag-out-to-remove uses. A gesture that ALREADY
        // computed the survivors passes them in: after a drag-out the tile is
        // gone from the engine, so planRemoval() would return [] and the
        // survivors' cells would never commit.
        const survivors = (displaced as never[] | undefined) ?? b.planRemoval(id);
        // The un-registration is the LAST command so that undo — which runs
        // the batch in reverse — re-registers the spec BEFORE the node and its
        // membership come back and the painter is asked to paint it (D2).
        const registry = registryOf(id, viewId, spec);
        const cmds = [
          ...survivors,
          new RemoveFromGroupCommand(group.id, id),
          new RemoveNodeCommand(id),
          new RegisterWidgetCommand(registry, 'unregister'),
        ];
        void execCommand(new BatchCommand('Remove widget', cmds));
        registry.unregister(); // now, for the caller reading the handle next
        b.sync();
        ctx.apiRef?.renderNow();
      },
      repaint() {
        const host = hostOf(id);
        if (host) ctx.renderWidget(spec, host);
      },
      // (hosts are captured in renderCustomNode, so repaint works for every
      //  widget the renderer has mounted — including after a rebuild.)
    };
  }

  return handle;
}

export function dashboard(options: DashboardOptions): DashboardSpec {
  ensureDashboardKitStyles();

  const columns = options.columns ?? DEFAULTS.columns;
  const gap = options.gap ?? DEFAULTS.gap;
  const rowHeight = options.rowHeight ?? DEFAULTS.rowHeight;
  const boardW = options.width ?? DEFAULTS.width;
  const boardH = options.height ?? DEFAULTS.height;
  // An explicit width is a fixed world; everything else lays out fluid.
  const mode: 'fluid' | 'fixed' = options.mode ?? (options.width !== undefined ? 'fixed' : 'fluid');
  const overflow: 'bounded' | 'scroll' = options.overflow ?? 'bounded';
  // A fluid board grows (fixed row heights, the board extends); a fixed board
  // fits (its authored height is the picture).
  const sizing: 'fit' | 'grow' = options.sizing ?? (mode === 'fluid' ? 'grow' : 'fit');

  const views: DashboardViewSpec[] = options.views
    ? options.views.map((v) => ({ ...v, widgets: cloneWidgets(v.widgets) }))
    : [{ id: 'main', widgets: cloneWidgets(options.widgets ?? []) }];
  for (const v of views) assignCellsDeep(v.widgets, v.columns ?? columns);

  // -- the render spec: one custom-HTML node per widget ----------------------
  const nodes: Array<Record<string, unknown>> = [];
  const specById = new Map<string, DashboardWidgetSpec>();
  const viewOfWidget = new Map<string, string>();
  const boardWidgets = new Map<string, DashboardWidgetSpec[]>();
  const viewOfBoard = new Map<string, string>();
  // Recursive walk: a CONTAINER contributes no node (it becomes a group in
  // finalize) but registers like a widget, and its children flatten into the
  // render spec with the container as their board.
  const flatten = (boardId: string, viewId: string, widgets: DashboardWidgetSpec[]): void => {
    for (const w of widgets) {
      specById.set(w.id, w);
      viewOfWidget.set(w.id, boardId);
      if (w.widgets) {
        boardWidgets.set(w.id, w.widgets);
        viewOfBoard.set(w.id, viewId);
        flatten(w.id, viewId, w.widgets);
        continue;
      }
      pushWidgetNode(w);
    }
  };
  const pushWidgetNode = (w: DashboardWidgetSpec): void => {
    {
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
          // See buildWidgetNode(): the title has to reach the node or a reload
          // cannot rebuild the card's header. These two paths are the drift the
          // comment on buildWidgetNode warns about — they must agree.
          ...(w.title !== undefined ? { widgetTitle: w.title } : {}),
          ...(w.limits !== undefined ? { widgetLimits: { ...w.limits } } : {}),
          ...(w.movable === false ? { widgetMovable: false } : {}),
          ...(w.resizable === false ? { widgetResizable: false } : {}),
          columnSpan: w.span,
          rowSpan: w.rows,
          gridItem: { columnStart: w.x! + 1, columnEnd: w.x! + 1 + w.span!, rowStart: w.y! + 1, rowEnd: w.y! + 1 + w.rows! },
        },
      });
    }
  };
  for (const v of views) {
    boardWidgets.set(v.id, v.widgets);
    viewOfBoard.set(v.id, v.id);
    flatten(v.id, v.id, v.widgets);
  }

  // No renderWidget → the built-in renderers draw the declared `kind` from the
  // developer's own `data` (widgets.ts), unknown kinds landing on the titled
  // frame they always did.
  const renderWidget = options.renderWidget ?? defaultWidgetRenderer;

  // -- runtime: ONE shared handle over a boxed context -----------------------
  // The two MUTABLE cells the handle used to close over as free `let`s —
  // `active` (showView reassigns it) and `apiRef` (finalize sets it) — are boxed
  // on `ctx`, so the SAME builder that fromDocument() calls reads and writes
  // them. Everything else is the stable state; the handle is identical to what
  // was inline here, moved verbatim into createDashboardHandle().
  const ctx: DashboardHandleContext = {
    views,
    groups: new Map<string, GroupModel>(),
    binders: new Map<string, DashboardGridHandle>(),
    specById,
    viewOfWidget,
    boardGroups: new Map<string, GroupModel>(),
    boardWidgets,
    viewOfBoard,
    hosts: new Map<string, HTMLElement>(),
    renderWidget,
    columns,
    gap,
    rowHeight,
    boardW,
    boardH,
    mode,
    overflow,
    optionsBase: options,
    active: views[0]?.id ?? 'main',
    apiRef: null,
    onLayoutChange: options.onLayoutChange,
  };
  const { binders, groups } = ctx;
  const handle = createDashboardHandle(ctx);

  return {
    nodes,
    edges: [],
    // A fluid board can never be zoomed into a scaled picture.
    ...(mode === 'fluid' ? { renderOptions: { minZoom: 1, maxZoom: 1 } } : {}),
    renderCustomNode: (node: unknown, host: HTMLElement) => {
      const n = node as { id: string };
      const spec = specById.get(n.id);
      if (!spec) return;
      ctx.hosts.set(n.id, host);
      renderWidget(spec, host);
    },
    get handle() {
      return handle;
    },
    finalize: (api: unknown) => {
      const a = api as DashboardApiRef | null;
      if (!a) return;
      ctx.apiRef = a;
      const model = a.getModel();
      // FLUID: the board starts at the container's box when it can be measured
      // (the binder keeps it there); the authored defaults only fill in for a
      // container with no size yet.
      const box =
        mode === 'fluid'
          ? { w: (a as { container?: HTMLElement }).container?.clientWidth || 0, h: (a as { container?: HTMLElement }).container?.clientHeight || 0 }
          : { w: 0, h: 0 };
      const viewW = (v: DashboardViewSpec): number => (mode === 'fluid' && box.w > 0 ? box.w : v.width ?? boardW);
      const viewH = (v: DashboardViewSpec): number => (mode === 'fluid' && box.h > 0 ? box.h : v.height ?? boardH);

      for (const v of views) {
        // One board per view; the group is a pure LAYOUT CONTAINER, so its
        // chrome is suppressed (frameChrome) exactly as a dashboard needs.
        const g = new GroupModel({ id: v.id, name: v.name ?? v.id });
        model.addGroup(g);
        g.setMetadata('frameChrome', 'none');
        // THE BOARD'S GEOMETRY, PERSISTED. Cells alone do not describe a board:
        // the column count, gap and sizing mode are what turn them into pixels,
        // and they live only in the `dashboard()` call. Without them a reloaded
        // document could paint the widgets but never rebind the grid — the
        // reload would be a picture of a dashboard rather than a dashboard.
        // Serializable values only: the binder's callbacks belong to the app.
        g.setMetadata('dashboardBoard', {
          columns: v.columns ?? columns,
          gap,
          padding: gap,
          sizing,
          baseRowHeight: rowHeight,
          designHeight: viewH(v),
          float: options.float ?? false,
          rtl: options.rtl ?? false,
          fluid: mode === 'fluid',
          overflow,
          static: options.static ?? false,
        });
        g.size = { width: viewW(v), height: viewH(v), depth: 0 };
        g.position = { x: v.id === ctx.active ? 0 : OFFSCREEN_X, y: 0 };
        groups.set(v.id, g);
        ctx.boardGroups.set(v.id, g);
        mountBoard(v.id, v.id, v.widgets, g);
        binders.set(
          v.id,
          bindDashboardGrid(a as never, g, {
            columns: v.columns ?? columns,
            gap,
            padding: gap,
            sizing,
            baseRowHeight: rowHeight,
            designHeight: viewH(v),
            float: options.float ?? false,
            rtl: options.rtl ?? false,
            fluid: mode === 'fluid',
            overflow,
            static: options.static ?? false,
            ...(options.responsive ? { responsive: options.responsive } : {}),
            ...(options.binder ?? {}),
            onGesture: (e) => {
              if (e.type === 'commit') reportChanged();
              options.binder?.onGesture?.(e);
            },
          })
        );
      }
      handle.showView(ctx.active);
      ctx.rebindContainer = (id: string): void => {
        const g = model.getGroup(id);
        const w = specById.get(id);
        if (!g || !w || !w.widgets) return;
        ctx.boardGroups.set(id, g);
        bindContainer(g, w, ctx.viewOfBoard.get(id) ?? ctx.active);
      };
      ctx.attachHistory?.();
      return;

      /**
       * Mount one board's widgets into its group — and recurse for CONTAINERS.
       * A container is a view's construction one level down: a frameless
       * member group with a slab cell in the PARENT's grid, its own
       * `dashboardBoard` metadata (so `fromDocument()` rebinds it like any
       * board), and a second `bindDashboardGrid` on the same canvas — which
       * registers it as a BinderPeer, so cross-boundary drag, deepest-wins
       * hit-testing and the height-escalation ratchet all apply unchanged.
       */
      function mountBoard(
        boardId: string,
        viewId: string,
        widgets: DashboardWidgetSpec[],
        boardGroup: GroupModel
      ): void {
        for (const w of widgets) {
          if (w.widgets) {
            const innerColumns = innerColumnsOf(w);
            const innerRows = w.maxRows ?? rowExtentOf(w.widgets);
            const cg = new GroupModel({ id: w.id, name: w.title ?? w.id });
            model.addGroup(cg);
            cg.setMetadata('frameChrome', 'none');
            // Slab cells live in GROUP metadata (groups carry no GridItemConfig).
            cg.setMetadata('gridItem', gridItemFromCell({ x: w.x!, y: w.y!, w: w.span!, h: w.rows! }));
            // The container's own spec fields, persisted ON the group — a
            // reloaded document has no authored literal to read them from.
            cg.setMetadata('containerWidget', {
              ...(w.kind !== undefined ? { kind: w.kind } : {}),
              ...(w.title !== undefined ? { title: w.title } : {}),
              columns: innerColumns,
              maxRows: innerRows,
              ...(w.data !== undefined ? { data: w.data } : {}),
            });
            cg.setMetadata('dashboardBoard', {
              columns: innerColumns,
              gap,
              padding: 0,
              sizing: 'fit',
              baseRowHeight: rowHeight,
              // The slab's height is the PARENT's business — 0 hands it over,
              // which is what makes escalation grow the slab instead of the
              // container fighting its own frame.
              designHeight: 0,
              maxRows: innerRows,
              float: false,
              rtl: options.rtl ?? false,
            });
            cg.size = { width: 100, height: rowHeight, depth: 0 };
            boardGroup.addMember(w.id);
            ctx.boardGroups.set(w.id, cg);
            mountBoard(w.id, viewId, w.widgets, cg);
            bindContainer(cg, w, viewId);
            continue;
          }
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
          // A dashboard widget is not a wiring endpoint. This MUST happen here
          // rather than on the node spec: the render-input path IGNORES a
          // spec-level `behavior` (the same trap erDiagram documents for
          // `resizable`), so a DECLARED widget shipped connectable with four
          // default ports and sprouted glyphs on hover — while addWidget()'s
          // directly-built nodes were already correct. One path being right is
          // exactly what hid it, and why the tooth now covers both.
          n.setBehavior({ connectable: false });
          for (const p of [...n.getPorts().values()]) n.removePort(p.id);
          boardGroup.addMember(w.id);
        }
      }

      /** Bind (or re-bind) a container's inner grid on its group. */
      function bindContainer(cg: GroupModel, w: DashboardWidgetSpec, viewId: string): void {
        binders.set(
          w.id,
          bindDashboardGrid(a as never, cg, {
            columns: innerColumnsOf(w),
            gap,
            padding: 0,
            sizing: 'fit',
            baseRowHeight: rowHeight,
            designHeight: 0,
            maxRows: w.maxRows ?? rowExtentOf(w.widgets ?? []),
            float: false,
            rtl: options.rtl ?? false,
            static: options.static ?? false,
            onGesture: (e) => {
              if (e.type === 'commit') reportChanged();
              options.binder?.onGesture?.(e);
            },
          })
        );
      }

      /**
       * One reporter for every binder on a view — the view's own and each
       * container's — and for every API call, undo and redo (D3): the handle's
       * diff-based `reportChanged`. The payload is the view's FULL NESTED TREE
       * derived from live membership (handle.toJSON()), so an inner commit
       * reports the same truth an outer one does, and a tile that crossed a
       * boundary shows up under its NEW parent.
       */
      function reportChanged(): void {
        ctx.reportChanged?.();
      }
    },
  };
}
