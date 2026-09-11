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
  AddGroupCommand,
  AddToGroupCommand,
  RemoveFromGroupCommand,
  RemoveGroupCommand,
  RemoveNodeCommand,
  SendNodeToBackCommand,
  type GridColumnLayout,
} from '@grafloria/engine';
import {
  bindDashboardGrid,
  parentPeerOf,
  SequenceCommand,
  type DashboardGridHandle,
  type TabDropHooks,
  type TearOutPlan,
  type DashboardGridOptions,
  type DashboardResponsiveOptions,
} from './grid-binder';
import type { DragHandleOption } from './grid-binder';
import { bindDashboardSplit, SPLIT_TREE_KEY, type DashboardSplitHandle } from './split-binder';
import type { SplitNode } from './split-layout';
import { gridItemFromCell } from './grid-mapping';
import { ensureDashboardKitStyles } from './styles';
import type { SectionCaption } from './caption';
import { paintTabStrip, tabStripKey, tabStripReserve, type TabsOptions, tabPageInset } from './tabs';
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
  /**
   * Container only: the inner board's layout, exactly as a view's. `'grid'`
   * (default) packs the children in cells; `'split'` is a splitter tree that
   * always covers the pane. Switch live with `setLayout(mode, containerId)`;
   * `toJSON()` writes it per container.
   */
  layout?: 'grid' | 'split' | 'tabs';
  /**
   * TAB CONTAINER (`layout: 'tabs'`). Every child that carries `widgets` is a
   * PAGE: one is visible at a time, and a strip of tabs across the top
   * switches between them (DevExpress' Tab Container; VS Code's editor area
   * is a split of these). `active` is the page showing, persisted by
   * `toJSON()`; `tabs` styles the strip.
   */
  active?: string;
  tabs?: TabsOptions;
  /**
   * Container only: a CAPTION painted by the kit on the section's slab —
   * `true` for the title, a string, or the full options (subtitle,
   * description, icon, position, alignment, typography, box, show, actions,
   * pass-through, className). Reserved inside the frame, selectable, themed,
   * persisted by `toJSON()`; live through `setCaption()`. Default: none.
   */
  caption?: SectionCaption;
  /**
   * Container only, split layout: the authored splitter tree. Omit it and the
   * tree is derived from the children's cells. `toJSON()` writes it back.
   */
  tree?: SplitNode | null;
  /**
   * Container only: what a pull past the pane's rows does. `'grow'` (default):
   * the container's slab grows a row in the parent — the ratchet above.
   * `'fit'`: the pane is the bound — a child that needs a row the pane does
   * not hold is refused where it stands, and nothing outside the pane moves.
   */
  sizing?: 'fit' | 'grow';
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
  /** Per-view layout (default: the dashboard-level `layout`). `toJSON()` writes it per view. */
  layout?: 'grid' | 'split';
  /**
   * SPLIT layout only: the authored splitter tree (see `layout`). Omit it and
   * the tree is derived from the widgets' cells, so a grid-authored view keeps
   * its proportions when it opens as a split board. `toJSON()` writes it back.
   */
  tree?: SplitNode | null;
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
  /**
   * HOW THE BOARD IS LAID OUT (the DevExpress question, decided 6 Sep 2026).
   * 'grid' (the default): the cell grid — columns, spans, push, gravity, the
   *   gridstack model. 'split': a splitter tree — the board is always covered;
   *   one widget fills it, a second halves it, a third halves the larger half
   *   the other way; dividers drag as percentages; a drag lifts the widget out
   *   and an insertion line on the nearest edge says where it lands; a removed
   *   widget's slot goes to its siblings. Sizing is always fit under 'split'.
   *   Switch live with `handle.setLayout()`: grid cells become a tree by
   *   guillotine cuts, a tree becomes cells by snapping to the columns.
   */
  layout?: 'grid' | 'split';
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
  /** The deepest board a drop may enter (a view is 0; unbounded by default). See the grid binder's `nesting`. */
  nesting?: number;
  /**
   * DRAG HANDLE — DevExpress drags an item by its caption. `true`: the caption
   * strip is the only handle (the header shows grip dots); a selector string:
   * your own element inside the card; `{ grip: true, position, placement }`:
   * a painted grip, left / center / right along the top edge, `inside` the
   * header band or `outside` as a tab above the card; off (default): the
   * whole card. Resize edges and the keyboard are unaffected; the body stays
   * interactive. Live: `handle.setDragHandle()`.
   */
  dragHandle?: DragHandleOption;
  /**
   * FIT AND THE ROW FLOOR. `true` (default): a bounded fit board squeezes its
   * rows toward `minRowHeight` before refusing growth. `false`: rows freeze at
   * the height they have now — a gesture that needs a row the frame does not
   * hold is refused outright and no other tile shrinks. See the grid binder's
   * `squeeze` for the exact rule.
   */
  squeeze?: boolean;
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
  /**
   * The selection changed on a board: the selected id — a widget or a SECTION
   * (container) — or undefined when cleared, and the view it belongs to. A
   * press on a section's empty band selects the section.
   */
  onSelect?: (id: string | undefined, viewId: string) => void;
  /**
   * Paint a section's caption band yourself (the escape hatch `renderWidget`
   * is for cards): the band arrives empty, sized and themed, and keeps its
   * press rules — a press on it selects the section, a pass-through element
   * (a button, an input, `[data-axdb-pass]`) reaches your content.
   */
  renderCaption?: (widget: DashboardWidgetSpec, host: HTMLElement) => void;
  /** A press on a caption action (`caption.actions`): the section, the action id, the view. */
  onCaptionAction?: (sectionId: string, actionId: string, viewId: string) => void;
  /** A tab container switched pages: the container, the page now showing, the view. */
  onTabChange?: (containerId: string, pageId: string, viewId: string) => void;
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
  /**
   * SELECT a widget and move keyboard focus to it — what a press on the widget
   * does. The selected widget shows its painted grip (`dragHandle: { grip }`)
   * and a quiet ring; a void click clears. False when the id is unknown.
   */
  focusWidget(id: string): boolean;
  /**
   * SELECT a widget WITHOUT moving keyboard focus — the ring and the grip,
   * nothing else; what a mouse press does. `undefined` clears the selection
   * on every view. False when the id is unknown.
   */
  selectWidget(id: string | undefined): boolean;
  /** The selected widget, if any (across views: only the on-camera one can be). */
  getSelectedWidget(): string | undefined;
  /** Every widget handle of a view (default: the active one). */
  widgetsOf(viewId?: string): WidgetHandle[];
  /**
   * Switch a view (default: the active one) between the cell grid and the
   * split tree, live and keeping the picture: cells → tree by guillotine cuts,
   * tree → cells by snapping to the columns. Persisted on the board, so a
   * saved document reopens in the layout it was left in.
   */
  setLayout(layout: 'grid' | 'split', viewId?: string): void;
  /** A container built with `layout: 'tabs'` reports 'tabs'; views never do. */
  getLayout(viewId?: string): 'grid' | 'split' | 'tabs';
  /**
   * Set a SECTION's caption live — `false` removes it, `true` is the title, a
   * string or the options. Repaints the band, gives the reserve back or takes
   * it, persists on the section, one undo step. False for anything that is
   * not a container.
   */
  setCaption(id: string, caption: SectionCaption): boolean;
  /** The caption as authored or last set; undefined when the section has none. */
  getCaption(id: string): SectionCaption | undefined;
  /**
   * Show a PAGE of a tab container (`layout: 'tabs'`). False when the
   * container or the page is not one. Persisted, so a saved board reopens on
   * the page it was left on.
   */
  activateTab(containerId: string, pageId: string): boolean;
  /** The page showing in a tab container. */
  getActiveTab(containerId: string): string | undefined;
  /**
   * Move a WIDGET into `containerId` as a NEW TAB at `index` (default: the
   * end): the widget becomes the only member of a fresh page named by its
   * title, and that page the active tab — what dropping a widget on a strip
   * does. One undoable step; the board it left re-packs, and a page it
   * emptied closes.
   */
  moveToTab(widgetId: string, containerId: string, index?: number): Promise<boolean>;
  /** Reorder a page along its container's strip. One undoable step; the order is saved with the container. */
  moveTab(containerId: string, pageId: string, index: number): boolean;
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
  /** Drag-handle mode, live, every view: `true` = the caption strip, a selector = your own handle, `{ grip: true, … }` = a painted grip, `false` = the whole card. */
  setDragHandle(v: DragHandleOption): void;
  getDragHandle(): DragHandleOption;
  /**
   * Add a widget to a view. CREATES the node (you do not pre-build one), wires
   * its metadata, and commits node + membership as ONE undoable step.
   * Auto-positions when the spec names no cell. `opts.displaced`: the
   * commands a palette drop handed `onDropIn` for the tiles the placeholder
   * pushed aside — folded into the same step, so the widget lands on the cell
   * the drop showed and undo puts the pushed tiles back with it. Left out,
   * the board is re-read from the model and the push is forgotten: the new
   * widget then auto-positions into whatever hole is left (Quantia's "lands
   * on the cell it was aimed at", element 0.4.54).
   */
  addWidget(spec: DashboardWidgetSpec, viewId?: string, opts?: { displaced?: Command[] }): WidgetHandle | undefined;
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

/**
 * Parking is a TELEPORT, never a glide. `.axdb-glide` on the html layer eases
 * every left/top write while a gesture runs and for 400 ms past its drop; a
 * page or a view coming back from OFFSCREEN_X under it SLID in from 20,000 px
 * away over 280 ms (0.4.36). The class comes off for the writes, the styles
 * are flushed so the landing becomes the before-change state, and the class
 * goes back to whichever gesture still holds it.
 */
const teleport = (container: HTMLElement | null, fn: () => void): void => {
  const layer = container?.querySelector('.grafloria-html-layer') as HTMLElement | null | undefined;
  const held = layer?.classList.contains('axdb-glide') === true;
  if (held) layer!.classList.remove('axdb-glide');
  try {
    fn();
  } finally {
    if (held && layer) {
      void layer.offsetWidth; // flush: the new positions are the before-change style now
      layer.classList.add('axdb-glide');
    }
  }
};
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

/**
 * EVERY CHILD OF A TAB CONTAINER IS A PAGE. A page is a container, so a plain
 * widget written among them is wrapped in one carrying its title. Without this
 * the tab system simply ignored it: it was never positioned and painted at the
 * board's origin at its 100×60 placeholder size, silently losing part of the
 * author's layout (measured on a container mixing a widget with two pages).
 */
function wrapTabPages(ws: DashboardWidgetSpec[]): DashboardWidgetSpec[] {
  for (const w of ws) {
    if (!w.widgets) continue;
    if (w.layout === 'tabs') {
      w.widgets = w.widgets.map((c) =>
        c.widgets
          ? c
          : {
              id: `${c.id}__page`,
              title: c.title ?? c.id,
              ...(w.columns !== undefined ? { columns: w.columns } : {}),
              widgets: [{ ...c, x: 0, y: 0 }],
            }
      );
    }
    wrapTabPages(w.widgets);
  }
  return ws;
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
    /** Derived writes (a layout switch) bypass the history like the binder's own. */
    runSystemWrite?(fn: () => void): void;
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
/**
 * TAB CONTAINER RUNTIME, shared by `dashboard()` and `fromDocument()`.
 *
 * A tab container binds no grid of its own: it positions its PAGES itself —
 * one into its frame under the strip, the rest parked off-canvas, exactly as
 * `showView` parks a view one level up — and paints the strip. Each page is an
 * ordinary container with an ordinary binder, so a page can be a grid or a
 * split, and the parent board still sees ONE member group to place and resize.
 *
 * Both entry points call this, so a board reloaded from a document behaves
 * like one built from a literal (the first version lived inside `dashboard()`
 * and `fromDocument` silently produced a tab container that never switched).
 */
const cssEscape = (v: string): string =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"');

export function attachTabsRuntime(
  ctx: DashboardHandleContext,
  model: { getGroup(id: string): GroupModel | undefined; runSystemWrite?(fn: () => void): void },
  container: HTMLElement | null,
  handle: DashboardHandle
): void {
  // Pages come from LIVE membership, in the authored order, with anything that
  // arrived later on the end. Reading the authored spec instead meant a page
  // that LEFT the container kept its tab — a tab pointing at nothing, which is
  // exactly the "the content is taken and the tab remains" report — and a page
  // that arrived never got one.
  const pagesOf = (id: string): { id: string; label: string }[] => {
    const cg = ctx.boardGroups.get(id) ?? model.getGroup(id);
    const authored = (ctx.specById.get(id)?.widgets ?? []).map((c) => c.id);
    const live = [...(cg?.members ?? [])].filter((m) => !!model.getGroup(m));
    // A REORDERED strip persists its order on the container; it outranks the
    // authored list, which outranks arrival order.
    const saved = ((cg?.getMetadata('containerWidget') as { order?: string[] } | undefined)?.order ?? []) as string[];
    const rank = (pid: string): number => {
      const o = saved.indexOf(pid);
      if (o >= 0) return o;
      // A plain child is wrapped as `<id>__page`, so the authored order is
      // keyed on the id BEFORE the wrap as well as after it.
      const i = authored.indexOf(pid);
      const j = i < 0 ? authored.indexOf(pid.replace(/__page$/, '')) : i;
      return j < 0 ? Number.MAX_SAFE_INTEGER : saved.length + j;
    };
    live.sort((a, b) => rank(a) - rank(b));
    return live.map((pid) => ({ id: pid, label: ctx.specById.get(pid)?.title ?? pid }));
  };
  const isTabs = (id: string): boolean =>
    (ctx.layoutOf.get(id) ?? ctx.specById.get(id)?.layout) === 'tabs' && pagesOf(id).length > 0;

  /**
   * A tab dragged off its strip tears its page out onto the board that owns
   * the container — VS Code's "drag a tab out and it becomes a group of its
   * own". Only the board below can place it, so the gesture is handed to that
   * binder; a container with a single page keeps it, because a tab container
   * with no pages has nothing to show.
   */
  const tearOut = (containerId: string, pageId: string, ev: PointerEvent): boolean => {
    if (!container) return false;
    if (!pagesOf(containerId).some((p) => p.id === pageId)) return false;
    const peer = parentPeerOf(container, containerId);
    const plan = ctx.tearOutPlan?.(containerId, pageId);
    if (!peer || !plan) return false;
    return peer.tearOutMember(pageId, containerId, ev, plan);
  };

  const paintStrip = (id: string, f: { x: number; y: number; width: number }, h: number, pages: { id: string; label: string }[], active: string): void => {
    const layer = container?.querySelector('.grafloria-html-layer') as HTMLElement | null;
    if (!layer) return;
    let el = ctx.tabStrips.get(id);
    if (!el || el.parentElement !== layer) {
      el?.remove();
      el = document.createElement('div');
      el.setAttribute('data-tabs-id', id);
      layer.appendChild(el);
      ctx.tabStrips.set(id, el);
    }
    el.style.position = 'absolute';
    el.style.left = `${f.x}px`;
    el.style.top = `${f.y}px`;
    el.style.width = `${f.width}px`;
    el.style.height = `${h}px`;
    const rtl = ctx.binders.get(ctx.viewOfBoard.get(id) ?? ctx.active)?.getRtl() ?? false;
    const key = tabStripKey(pages, active, ctx.tabsOf.get(id), rtl);
    if (el.getAttribute('data-key') === key) return;
    paintTabStrip(
      el,
      pages,
      active,
      ctx.tabsOf.get(id),
      rtl,
      (pid) => handle.activateTab(id, pid),
      (e) => {
        // The strip's empty space selects the container — and, travelled,
        // drags the whole group by it, as a section is dragged by its caption.
        handle.selectWidget(id);
        if (container) parentPeerOf(container, id)?.dragMember(id, e);
      },
      (pid, ev) => tearOut(id, pid, ev)
    );
    el.setAttribute('data-key', key);
  };

  const sync = (id: string): void => {
    const cg = ctx.boardGroups.get(id) ?? model.getGroup(id);
    if (!cg || !isTabs(id)) return;
    const pages = pagesOf(id);
    // The page that was showing may have just been dragged out or closed:
    // whatever shows now is the active one, and it is written back so the
    // handle answers what the strip paints.
    let active = ctx.activeTab.get(id) ?? pages[0].id;
    if (!pages.some((p) => p.id === active)) active = pages[0].id;
    ctx.activeTab.set(id, active);
    const strip = tabStripReserve(ctx.tabsOf.get(id), pages.length);
    // The pages sit INSET in the container's frame (0.4.43): below the strip
    // and its inset, `inset` px in from the sides and the bottom, so their
    // cards read as inside the panel rather than as loose cards under a strip.
    const inset = tabPageInset(ctx.tabsOf.get(id));
    const f = { x: cg.position.x, y: cg.position.y, width: cg.size?.width ?? 0, height: cg.size?.height ?? 0 };
    const inner = { width: Math.max(0, f.width - 2 * inset), height: Math.max(0, f.height - strip - 2 * inset) };
    const write = (fn: () => void): void => (model.runSystemWrite ? model.runSystemWrite(fn) : fn());
    write(() => {
      for (const p of pages) {
        const pg = model.getGroup(p.id);
        if (!pg) continue;
        // A PARKED page keeps its size, so its own board keeps its layout and
        // comes back exactly as it was; only its x leaves the canvas.
        pg.setFrame({ x: p.id === active ? f.x + inset : OFFSCREEN_X, y: f.y + strip + inset, width: inner.width, height: inner.height });
      }
    });
    for (const p of pages) ctx.binders.get(p.id)?.sync();
    // A PARKED page is off-canvas but still in the DOM: take its widgets out
    // of the tab order and hide them from assistive tech, or a keyboard user
    // tabs through pages nobody can see (the accessibility scenario counted
    // five tab stops on a board with three of them hidden).
    for (const p of pages) {
      const pg = model.getGroup(p.id);
      const parked = p.id !== active;
      for (const m of pg?.members ?? []) {
        const host = container?.querySelector(`.grafloria-node-host[data-node-id="${cssEscape(m)}"]`) as HTMLElement | null;
        if (!host) continue;
        if (parked) {
          host.setAttribute('aria-hidden', 'true');
          host.tabIndex = -1;
        } else host.removeAttribute('aria-hidden');
      }
    }
    paintStrip(id, f, strip, pages, active);
  };

  ctx.syncTabs = sync;
  ctx.subscriptions = ctx.subscriptions ?? [];
  const subsOf = new Map<string, Array<() => void>>();
  const attach = (id: string): void => {
    const cg = ctx.boardGroups.get(id) ?? model.getGroup(id);
    if (!cg || subsOf.has(id)) return;
    if ((ctx.layoutOf.get(id) ?? ctx.specById.get(id)?.layout) !== 'tabs') return;
    const pages = pagesOf(id);
    if (!ctx.activeTab.has(id) && pages.length > 0) {
      const meta = cg.getMetadata('containerWidget') as { active?: string; tabs?: TabsOptions } | undefined;
      const want = ctx.specById.get(id)?.active ?? meta?.active;
      ctx.activeTab.set(id, want && pages.some((p) => p.id === want) ? want : pages[0].id);
      if (meta?.tabs && !ctx.tabsOf.has(id)) ctx.tabsOf.set(id, meta.tabs);
    }
    // Re-lay the pages whenever the parent moves or resizes the container —
    // and whenever a page joins or leaves, so the strip always shows the pages
    // that are actually there.
    const offs: Array<() => void> = [];
    for (const ev of ['bounds:changed', 'member:added', 'member:removed']) {
      const off = cg.on(ev, (() => sync(id)) as (...args: unknown[]) => void);
      if (typeof off === 'function') offs.push(off);
    }
    subsOf.set(id, offs);
    ctx.subscriptions?.push(() => detach(id));
    sync(id);
  };
  const detach = (id: string): void => {
    for (const off of subsOf.get(id) ?? []) off();
    subsOf.delete(id);
    ctx.tabStrips.get(id)?.remove();
    ctx.tabStrips.delete(id);
  };
  ctx.attachTabsContainer = attach;
  ctx.detachTabsContainer = detach;
  for (const id of ctx.boardGroups.keys()) if (isTabs(id)) attach(id);
}


/** `setCaption` as one history step: execute re-applies the value, undo the previous one. */
class SetCaptionCommand extends Command {
  constructor(
    private sectionId: string,
    private before: SectionCaption | undefined,
    private after: SectionCaption,
    private apply: (c: SectionCaption | undefined) => void
  ) {
    super('Set section caption');
  }
  override execute(): void {
    this.apply(this.after);
  }
  override undo(): void {
    this.apply(this.before);
  }
  override serialize() {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { sectionId: this.sectionId, before: this.before, after: this.after } };
  }
}

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
  /** See DashboardOptions.layout — per view. */
  layoutOf: Map<string, 'grid' | 'split' | 'tabs'>;
  /** Tab containers: the page showing, the strip options, the strip element. */
  activeTab: Map<string, string>;
  tabsOf: Map<string, TabsOptions>;
  tabStrips: Map<string, HTMLElement>;
  /** Set by finalize: re-lay a tab container's pages and repaint its strip. */
  syncTabs?: (containerId: string) => void;
  /**
   * Tab-container runtime hooks (attachTabsRuntime): a container created or
   * removed AFTER boot — a page torn out into a group of its own, a container
   * closed because its last page left — registers and unregisters through
   * these, on execute and on undo alike.
   */
  attachTabsContainer?: (containerId: string) => void;
  detachTabsContainer?: (containerId: string) => void;
  /** The plan that makes a torn-out page a one-tab group of its own (the handle builder owns the specs and the registry). */
  tearOutPlan?: (containerId: string, pageId: string) => TearOutPlan | null;
  /** The commands that close `boardId` when it is a tab PAGE about to lose its last member `leaving` — and its container when that was its last page. */
  closePageIfEmptied?: (boardId: string, leaving: string) => Command[];
  /** The bookkeeping for a CONTAINER a gesture moved from one board to another (tile first, 4b-ii): its spec entry, its registry. */
  moveContainerCommands?: (containerId: string, fromBoardId: string, toBoardId: string) => Command[];
  /** A widget dragged over a strip: hit-test, marks, and the drop that makes it a new tab. Handed to every binder. */
  tabDrop?: TabDropHooks;
  /** Set by finalize: the user's `onTabChange`, so the handle can fire it. */
  onTabChange?: (containerId: string, pageId: string, viewId: string) => void;
  /** Set by finalize: re-bind a VIEW's board under the given layout (setLayout). */
  rebindView?: (viewId: string, layout: 'grid' | 'split') => void;
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
  /** MUTABLE — the canvas element, set with apiRef; parking a page or a view
   *  reaches the html layer through it (see `teleport`). */
  container: HTMLElement | null;
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
        // The container's LIVE layout and, under split, its live tree — the
        // authored `tree` is stale the moment a divider moves.
        const { tree: _authored, ...rest } = spec ?? {};
        void _authored;
        const clayout = ctx.layoutOf.get(memberId) ?? spec?.layout ?? 'grid';
        const cb = binders.get(memberId) as Partial<DashboardSplitHandle> | undefined;
        const ctree = clayout === 'split' && cb?.getSplitTree ? cb.getSplitTree() : undefined;
        entries.push({ id: memberId, ...rest, ...at, layout: clayout, ...(ctree !== undefined ? { tree: ctree } : {}), widgets: treeOf(memberId) });
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
    if (ctx.layoutOf.get(boardId) === 'tabs') {
      // A tab container's pages have no cells that mean anything: their order
      // is the strip's (the authored list, as reordered), not a sort by cell.
      const order = (specById.get(boardId)?.widgets ?? []).map((w) => w.id);
      const rank = (id: string): number => (order.indexOf(id) < 0 ? Number.MAX_SAFE_INTEGER : order.indexOf(id));
      entries.sort((p1, p2) => rank(p1.id) - rank(p2.id));
      return entries;
    }
    entries.sort((p1, p2) => (p1.y ?? 0) - (p2.y ?? 0) || (p1.x ?? 0) - (p2.x ?? 0));
    return entries;
  };

  /**
   * TEARING A TAB OUT — what the page becomes. VS Code: a tab dragged out of
   * its group makes a group of its own, still wearing its tab. So the board
   * receives a NEW one-page tab container, `<page>__group`, built exactly as
   * mountBoard() builds an authored one (slab cell in `gridItem`, spec fields
   * in `containerWidget`, board metadata so fromDocument() rebinds it), the
   * page moves into it, and the handle's own registry follows — on execute and
   * on undo. A container left with no page closes, as VS Code closes a group
   * whose last editor leaves; undo reopens it. The board that lands it adds
   * its own displaced-tile commands around these.
   */
  /** The tab index a CLIENT x means along a strip: before the first tab whose middle lies past it. */
  const indexInStrip = (strip: HTMLElement, cx: number): number => {
    const rtl = strip.getAttribute('dir') === 'rtl';
    let i = 0;
    for (const t of Array.from(strip.querySelectorAll('.axdb-tab'))) {
      const tr = t.getBoundingClientRect();
      const mid = tr.left + tr.width / 2;
      if (rtl ? cx < mid : cx > mid) i++;
      else break;
    }
    return i;
  };
  /** Paint (or, with null, clear) the insertion mark on a strip. */
  const markTabDrop = (targetId: string | null, index: number | null): void => {
    for (const [id, el] of ctx.tabStrips) {
      const on = id === targetId;
      el.classList.toggle('axdb-tabs--drop', on);
      const tabs = Array.from(el.querySelectorAll('.axdb-tab'));
      tabs.forEach((t, i) => t.classList.toggle('axdb-tab--drop-before', on && index !== null && i === index));
      el.classList.toggle('axdb-tabs--drop-end', on && index !== null && index >= tabs.length);
    }
  };
  const livePages = (containerId: string): string[] => {
    const model = ctx.apiRef?.getModel();
    return [...(ctx.boardGroups.get(containerId)?.members ?? [])].filter((m) => !!model?.getGroup(m));
  };

  /**
   * CLOSE a tab container: its slab leaves `boardId` (the tiles around it
   * settle as a removal settles them), its registry goes and its strip with
   * it. Undo reopens it. The registry goes FIRST so that on undo it comes
   * back AFTER the group and its slab do.
   */
  const closeContainer = (containerId: string, boardId: string): Command[] => {
    const model = ctx.apiRef?.getModel();
    if (!model) return [];
    const fromSpec = specById.get(containerId);
    const viewId = ctx.viewOfBoard.get(containerId) ?? ctx.active;
    let fromSlot = -1;
    const gone = {
      register: (): void => {
        const live = model.getGroup(containerId);
        if (!live) return;
        ctx.boardGroups.set(containerId, live);
        ctx.layoutOf.set(containerId, 'tabs');
        ctx.viewOfBoard.set(containerId, viewId);
        if (fromSpec) specById.set(containerId, fromSpec);
        const arr = ctx.boardWidgets.get(boardId);
        if (arr && fromSpec && !arr.some((w) => w.id === containerId)) {
          arr.splice(fromSlot < 0 ? arr.length : Math.min(fromSlot, arr.length), 0, fromSpec);
        }
        ctx.attachTabsContainer?.(containerId);
      },
      unregister: (): void => {
        ctx.detachTabsContainer?.(containerId);
        ctx.boardGroups.delete(containerId);
        ctx.layoutOf.delete(containerId);
        ctx.viewOfBoard.delete(containerId);
        specById.delete(containerId);
        const arr = ctx.boardWidgets.get(boardId);
        if (arr) {
          const i = arr.findIndex((w) => w.id === containerId);
          if (i >= 0) {
            fromSlot = i;
            arr.splice(i, 1);
          }
        }
      },
    };
    return [
      ...(binders.get(boardId)?.planRemoval(containerId) ?? []),
      new SequenceCommand('Close empty tab container', [
        new RegisterWidgetCommand(gone, 'unregister'),
        new RemoveFromGroupCommand(boardId, containerId),
        new RemoveGroupCommand(containerId),
      ]),
    ];
  };

  /** The tab container that holds `pageId` as a page, if any. */
  const containerOfPage = (pageId: string): string | undefined => {
    for (const [cid, g] of ctx.boardGroups) if (ctx.layoutOf.get(cid) === 'tabs' && g.members?.has(pageId)) return cid;
    return undefined;
  };

  /**
   * AN EMPTY PAGE CLOSES. When a page's last widget leaves — dragged out, moved
   * into another board, removed, made a tab of its own — the page and its tab
   * go, and if that was the container's last page the container goes too: a
   * tab pointing at nothing is what "the content is taken and the tab remains"
   * looked like. Undo reopens the page (its grid re-binds on the history event)
   * and then the widget comes back into it.
   */
  /**
   * A CONTAINER CROSSES BOARDS by hand (tile first, 4b-ii): a section carried
   * into a page, a tab container into a section. The membership commands
   * move it; this moves what the kit keeps beside the membership — the
   * authored entry from the old board's list to the new one's, and which
   * board the container is filed under — as a register/unregister pair, the
   * way the tear-out plan files a group it creates. `toJSON()` reads the
   * membership, so the document is right either way; the registry is what
   * `addWidget` and the page-closing rule read.
   */
  ctx.moveContainerCommands = (containerId: string, fromBoardId: string, toBoardId: string): Command[] => {
    if (!ctx.boardGroups.has(containerId)) return [];
    const spec = specById.get(containerId);
    const fromArr = ctx.boardWidgets.get(fromBoardId);
    const toArr = ctx.boardWidgets.get(toBoardId);
    const prevFiled = viewOfWidget.get(containerId);
    let slot = -1;
    const moved = {
      register: (): void => {
        viewOfWidget.set(containerId, toBoardId);
        if (spec && fromArr) {
          const i = fromArr.findIndex((w) => w.id === containerId);
          if (i >= 0) {
            slot = i;
            fromArr.splice(i, 1);
          }
        }
        if (spec && toArr && !toArr.some((w) => w.id === containerId)) toArr.push(spec);
      },
      unregister: (): void => {
        if (prevFiled !== undefined) viewOfWidget.set(containerId, prevFiled);
        else viewOfWidget.delete(containerId);
        if (spec && toArr) {
          const i = toArr.findIndex((w) => w.id === containerId);
          if (i >= 0) toArr.splice(i, 1);
        }
        if (spec && fromArr && !fromArr.some((w) => w.id === containerId)) {
          fromArr.splice(slot < 0 ? fromArr.length : Math.min(slot, fromArr.length), 0, spec);
        }
      },
    };
    return [new RegisterWidgetCommand(moved, 'register')];
  };

  ctx.closePageIfEmptied = (boardId: string, leaving: string): Command[] => {
    const model = ctx.apiRef?.getModel();
    const pg = ctx.boardGroups.get(boardId);
    if (!model || !pg) return [];
    if ([...(pg.members ?? [])].some((m) => m !== leaving)) return [];
    const containerId = containerOfPage(boardId);
    if (!containerId) return [];
    const container = ctx.boardGroups.get(containerId);
    if (!container) return [];
    const hostBoard = viewOfWidget.get(containerId) ?? ctx.viewOfBoard.get(containerId) ?? ctx.active;
    const viewId = ctx.viewOfBoard.get(boardId) ?? ctx.active;
    const pageSpec = specById.get(boardId);
    const containerSpec = specById.get(containerId);
    const layout = ctx.layoutOf.get(boardId) ?? 'grid';
    const prevActive = ctx.activeTab.get(containerId);
    let slot = -1;
    const page = {
      register: (): void => {
        const live = model.getGroup(boardId);
        if (!live) return;
        ctx.boardGroups.set(boardId, live);
        ctx.layoutOf.set(boardId, layout);
        ctx.viewOfBoard.set(boardId, viewId);
        if (pageSpec) {
          specById.set(boardId, pageSpec);
          ctx.boardWidgets.set(boardId, pageSpec.widgets ?? []);
          if (containerSpec?.widgets && !containerSpec.widgets.some((p) => p.id === boardId)) {
            containerSpec.widgets.splice(slot < 0 ? containerSpec.widgets.length : Math.min(slot, containerSpec.widgets.length), 0, pageSpec);
          }
        }
        if (prevActive) ctx.activeTab.set(containerId, prevActive);
      },
      unregister: (): void => {
        binders.get(boardId)?.dispose();
        binders.delete(boardId);
        ctx.boardGroups.delete(boardId);
        ctx.layoutOf.delete(boardId);
        ctx.viewOfBoard.delete(boardId);
        specById.delete(boardId);
        ctx.boardWidgets.delete(boardId);
        if (containerSpec?.widgets) {
          const i = containerSpec.widgets.findIndex((p) => p.id === boardId);
          if (i >= 0) {
            slot = i;
            containerSpec.widgets.splice(i, 1);
          }
        }
        if (ctx.activeTab.get(containerId) === boardId) ctx.activeTab.delete(containerId);
      },
    };
    const cmds: Command[] = [
      new SequenceCommand('Close empty tab page', [
        new RegisterWidgetCommand(page, 'unregister'),
        new RemoveFromGroupCommand(containerId, boardId),
        new RemoveGroupCommand(boardId),
      ]),
    ];
    if (livePages(containerId).filter((m) => m !== boardId).length === 0) cmds.push(...closeContainer(containerId, hostBoard));
    return cmds;
  };

  /**
   * A WIDGET BECOMES A TAB: the commands that wrap `widgetId` into a fresh page
   * `<widget>__page` — built as an authored page is — and put that page into
   * `containerId` at `index`, active. `displaced` are the source board's
   * survivors' cells (a drag has them; the API plans them). The board it left
   * re-packs, and a page it emptied closes.
   */
  const moveWidgetToTabCommands = (widgetId: string, containerId: string, index: number, sourceBoardId: string, displaced: Command[]): Command[] => {
    const model = ctx.apiRef?.getModel();
    const node = model?.getNode(widgetId);
    const spec = specById.get(widgetId);
    const container = ctx.boardGroups.get(containerId);
    const containerSpec = specById.get(containerId);
    if (!model || !node || !spec || spec.widgets || !container || !containerSpec) return [];
    if ((ctx.layoutOf.get(containerId) ?? containerSpec.layout) !== 'tabs') return [];
    const pageId = `${widgetId}__page`;
    if (model.getGroup(pageId)) return [];
    const title = spec.title ?? widgetId;
    const cw = (container.getMetadata('containerWidget') ?? {}) as { columns?: number };
    const cols = Math.max(1, cw.columns ?? containerSpec.columns ?? spec.span ?? 3);
    const rows = Math.max(1, spec.rows ?? 1);
    const g = new GroupModel({ id: pageId, name: title });
    g.setMetadata('frameChrome', 'none');
    g.setMetadata('gridItem', gridItemFromCell({ x: 0, y: 0, w: cols, h: rows }));
    g.setMetadata('containerWidget', { title, columns: cols, maxRows: rows, layout: 'grid' });
    g.setMetadata('dashboardBoard', {
      columns: cols,
      gap: ctx.gap,
      padding: 0,
      sizing: 'fit',
      baseRowHeight: ctx.rowHeight,
      designHeight: 0,
      maxRows: rows,
      float: false,
      rtl: ctx.optionsBase.rtl ?? false,
      layout: 'grid',
      escalate: true,
    });
    g.position = { x: container.position.x, y: container.position.y };
    g.size = { width: container.size?.width ?? 100, height: container.size?.height ?? 100, depth: 0 };
    const pageSpec: DashboardWidgetSpec = { id: pageId, title, columns: cols, widgets: [spec] };
    const viewId = ctx.viewOfBoard.get(containerId) ?? ctx.active;
    const prevActive = ctx.activeTab.get(containerId);
    const prevXY = { x: spec.x, y: spec.y };
    const prevGrid = node.getGridItem?.();
    let srcSlot = -1;
    const cwOf = (): Record<string, unknown> => (container.getMetadata('containerWidget') ?? {}) as Record<string, unknown>;
    const reg = {
      register: (): void => {
        const live = model.getGroup(pageId);
        if (!live) return;
        ctx.boardGroups.set(pageId, live);
        ctx.layoutOf.set(pageId, 'grid');
        ctx.viewOfBoard.set(pageId, viewId);
        specById.set(pageId, pageSpec);
        ctx.boardWidgets.set(pageId, pageSpec.widgets!);
        viewOfWidget.set(pageId, containerId);
        viewOfWidget.set(widgetId, pageId);
        const src = ctx.boardWidgets.get(sourceBoardId);
        if (src) {
          const i = src.findIndex((w) => w.id === widgetId);
          if (i >= 0) {
            srcSlot = i;
            src.splice(i, 1);
          }
        }
        containerSpec.widgets = containerSpec.widgets ?? [];
        if (!containerSpec.widgets.some((p) => p.id === pageId)) {
          containerSpec.widgets.splice(Math.max(0, Math.min(index, containerSpec.widgets.length)), 0, pageSpec);
        }
        spec.x = 0;
        spec.y = 0;
        node.setGridItem(gridItemFromCell({ x: 0, y: 0, w: Math.min(cols, spec.span ?? cols), h: rows }));
        ctx.activeTab.set(containerId, pageId);
        containerSpec.active = pageId;
        container.setMetadata('containerWidget', { ...cwOf(), active: pageId });
      },
      unregister: (): void => {
        binders.get(pageId)?.dispose();
        binders.delete(pageId);
        ctx.boardGroups.delete(pageId);
        ctx.layoutOf.delete(pageId);
        ctx.viewOfBoard.delete(pageId);
        specById.delete(pageId);
        ctx.boardWidgets.delete(pageId);
        viewOfWidget.delete(pageId);
        viewOfWidget.set(widgetId, sourceBoardId);
        const src = ctx.boardWidgets.get(sourceBoardId);
        if (src && !src.some((w) => w.id === widgetId)) src.splice(srcSlot < 0 ? src.length : Math.min(srcSlot, src.length), 0, spec);
        if (containerSpec.widgets) {
          const i = containerSpec.widgets.findIndex((p) => p.id === pageId);
          if (i >= 0) containerSpec.widgets.splice(i, 1);
        }
        spec.x = prevXY.x;
        spec.y = prevXY.y;
        if (prevGrid) node.setGridItem(prevGrid);
        if (prevActive) {
          ctx.activeTab.set(containerId, prevActive);
          containerSpec.active = prevActive;
          container.setMetadata('containerWidget', { ...cwOf(), active: prevActive });
        } else ctx.activeTab.delete(containerId);
      },
    };
    return [
      new SequenceCommand('Move widget into a new tab', [
        ...displaced,
        new AddGroupCommand(g),
        new RemoveFromGroupCommand(sourceBoardId, widgetId),
        new AddToGroupCommand(pageId, widgetId),
        new AddToGroupCommand(containerId, pageId),
        new RegisterWidgetCommand(reg, 'register'),
      ]),
      ...(ctx.closePageIfEmptied?.(sourceBoardId, widgetId) ?? []),
    ];
  };

  /** REORDER a page along its strip: the container's spec order and its saved `order` move together. */
  const reorderTabCommands = (containerId: string, pageId: string, index: number): Command[] => {
    const containerSpec = specById.get(containerId);
    const container = ctx.boardGroups.get(containerId);
    if (!container || !containerSpec?.widgets || !container.members?.has(pageId)) return [];
    const before = livePages(containerId).sort((a, b) => {
      const ia = containerSpec.widgets!.findIndex((p) => p.id === a);
      const ib = containerSpec.widgets!.findIndex((p) => p.id === b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
    const from = before.indexOf(pageId);
    if (from < 0) return [];
    const to = Math.max(0, Math.min(index, before.length - 1));
    if (to === from) return [];
    const after = [...before];
    after.splice(from, 1);
    after.splice(to, 0, pageId);
    const apply = (order: string[]): void => {
      const rank = (id: string): number => (order.indexOf(id) < 0 ? Number.MAX_SAFE_INTEGER : order.indexOf(id));
      containerSpec.widgets!.sort((p, q) => rank(p.id) - rank(q.id));
      container.setMetadata('containerWidget', { ...((container.getMetadata('containerWidget') ?? {}) as object), order });
      ctx.syncTabs?.(containerId);
    };
    return [new RegisterWidgetCommand({ register: () => apply(after), unregister: () => apply(before) }, 'register')];
  };

  ctx.tabDrop = {
    stripAt: (cx, cy, grace) => {
      // The strip the drag already holds is tested with its box widened by
      // `grace.px` (see STRIP_STAY): a small overshoot still means the tabs.
      // Its own hit is checked FIRST, so a neighbour never steals it back.
      const hit = (id: string, el: HTMLElement, pad: number): { containerId: string; index: number } | null => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0) return null;
        return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad
          ? { containerId: id, index: indexInStrip(el, cx) }
          : null;
      };
      if (grace && grace.px > 0) {
        const el = ctx.tabStrips.get(grace.containerId);
        if (el && ctx.boardGroups.has(grace.containerId)) {
          const held = hit(grace.containerId, el, grace.px);
          if (held) return held;
        }
      }
      for (const [id, el] of ctx.tabStrips) {
        if (!ctx.boardGroups.has(id)) continue;
        const h = hit(id, el, 0);
        if (h) return h;
      }
      return null;
    },
    tabIndexAt: (containerId, cx) => {
      const el = ctx.tabStrips.get(containerId);
      if (!el || !ctx.boardGroups.has(containerId)) return null;
      return indexInStrip(el, cx);
    },
    markDrop: markTabDrop,
    dropIntoStrip: (widgetId, containerId, index, sourceBoardId, displaced) => moveWidgetToTabCommands(widgetId, containerId, index, sourceBoardId, displaced),
  };

  ctx.tearOutPlan = (containerId: string, pageId: string): TearOutPlan | null => {
    const model = ctx.apiRef?.getModel();
    const from = ctx.boardGroups.get(containerId);
    const pg = ctx.boardGroups.get(pageId) ?? model?.getGroup(pageId);
    const fromSpec = specById.get(containerId);
    const pageSpec = specById.get(pageId);
    if (!model || !from || !pg || !pageSpec) return null;
    const viewId = ctx.viewOfBoard.get(containerId) ?? ctx.active;
    // The new group's id. `${pageId}__group` is the usual — but when the page
    // is leaving the very group that was BORN from it (torn out twice), that
    // id is still taken until the emptied group closes later in the same
    // batch: AddGroup threw "already exists" mid-batch, the split preview
    // stayed applied and the chip stayed on screen (0.4.39). Take the next
    // free suffix instead.
    let W = `${pageId}__group`;
    for (let n = 2; model.getGroup(W) || ctx.boardGroups.has(W); n++) W = `${pageId}__group${n}`;
    const tabsOpts = ctx.tabsOf.get(containerId) ?? {};
    const label = pageSpec.title ?? pageId;
    // The new group is sized for the page PLUS its frame: the strip above, the inset around.
    const inset = tabPageInset(tabsOpts);
    const size = { width: (pg.size?.width ?? 0) + 2 * inset, height: (pg.size?.height ?? 0) + tabStripReserve(tabsOpts, 1) + 2 * inset };
    const remaining = [...(from.members ?? [])].filter((m) => m !== pageId && !!model.getGroup(m));
    // The page that was showing when the gesture began. Undo puts the tab
    // back — and shows THAT page again, not the one the container switched to
    // when the tab left (the live walk: Filters showing, tear out, undo, Alerts
    // showing — 0.4.41). It goes FIRST in each move sequence so its undo runs
    // LAST, after the tab is back among the pages: a sync fired in between by
    // a neighbour's reflow would otherwise reset a page that is not there yet.
    const showing = ctx.activeTab.get(containerId);
    const showingAgain = (): Command =>
      new RegisterWidgetCommand(
        {
          register: (): void => {},
          unregister: (): void => {
            const cg = ctx.boardGroups.get(containerId) ?? model.getGroup(containerId);
            const spec = specById.get(containerId);
            if (!showing || !cg || !spec || ctx.activeTab.get(containerId) === showing) return;
            if (!(spec.widgets ?? []).some((p) => p.id === showing) || !cg.members?.has(showing)) return;
            ctx.activeTab.set(containerId, showing);
            spec.active = showing;
            const cw = (cg.getMetadata('containerWidget') as Record<string, unknown> | undefined) ?? {};
            cg.setMetadata('containerWidget', { ...cw, active: showing });
            teleport(ctx.container, () => ctx.syncTabs?.(containerId));
          },
        },
        'register'
      );
    return {
      arrivingId: W,
      label,
      size,
      commands: (cell, rect, boardId) => {
        const fromMeta = (from.getMetadata('containerWidget') ?? {}) as { columns?: number; maxRows?: number };
        const fromBoard = (from.getMetadata('dashboardBoard') ?? {}) as Record<string, unknown>;
        const g = new GroupModel({ id: W, name: label });
        g.setMetadata('frameChrome', 'none');
        g.setMetadata('gridItem', gridItemFromCell(cell));
        g.setMetadata('containerWidget', {
          title: label,
          columns: fromMeta.columns ?? cell.w,
          maxRows: fromMeta.maxRows ?? cell.h,
          layout: 'tabs',
          active: pageId,
          ...(Object.keys(tabsOpts).length ? { tabs: tabsOpts } : {}),
        });
        g.setMetadata('dashboardBoard', { ...fromBoard, layout: 'tabs' });
        g.position = { x: rect.x, y: rect.y };
        g.size = { width: rect.width, height: rect.height, depth: 0 };
        const wSpec: DashboardWidgetSpec = {
          id: W,
          title: label,
          layout: 'tabs',
          active: pageId,
          ...(Object.keys(tabsOpts).length ? { tabs: tabsOpts } : {}),
          columns: fromMeta.columns ?? cell.w,
          widgets: [pageSpec],
        };
        let slot = -1;
        const born = {
          register: (): void => {
            const live = model.getGroup(W);
            if (!live) return;
            ctx.boardGroups.set(W, live);
            ctx.layoutOf.set(W, 'tabs');
            ctx.activeTab.set(W, pageId);
            ctx.tabsOf.set(W, tabsOpts);
            specById.set(W, wSpec);
            ctx.viewOfBoard.set(W, viewId);
            viewOfWidget.set(W, boardId);
            viewOfWidget.set(pageId, W);
            if (fromSpec?.widgets) {
              const i = fromSpec.widgets.findIndex((p) => p.id === pageId);
              if (i >= 0) {
                slot = i;
                fromSpec.widgets.splice(i, 1);
              }
            }
            const arr = ctx.boardWidgets.get(boardId);
            if (arr && !arr.some((w) => w.id === W)) arr.push(wSpec);
            ctx.boardWidgets.set(W, wSpec.widgets!);
            ctx.attachTabsContainer?.(W);
          },
          unregister: (): void => {
            ctx.detachTabsContainer?.(W);
            ctx.boardGroups.delete(W);
            ctx.layoutOf.delete(W);
            ctx.activeTab.delete(W);
            ctx.tabsOf.delete(W);
            specById.delete(W);
            ctx.viewOfBoard.delete(W);
            viewOfWidget.delete(W);
            viewOfWidget.set(pageId, containerId);
            if (fromSpec?.widgets && !fromSpec.widgets.some((p) => p.id === pageId)) {
              fromSpec.widgets.splice(slot < 0 ? fromSpec.widgets.length : Math.min(slot, fromSpec.widgets.length), 0, pageSpec);
            }
            const arr = ctx.boardWidgets.get(boardId);
            if (arr) {
              const i = arr.findIndex((w) => w.id === W);
              if (i >= 0) arr.splice(i, 1);
            }
            ctx.boardWidgets.delete(W);
          },
        };
        const move: Command[] = [
          new SequenceCommand('Move tab out', [
            showingAgain(),
            new AddGroupCommand(g),
            new RemoveFromGroupCommand(containerId, pageId),
            new AddToGroupCommand(W, pageId),
            new AddToGroupCommand(boardId, W),
            new RegisterWidgetCommand(born, 'register'),
          ]),
        ];
        return { move, collapse: remaining.length > 0 ? [] : collapseOf(boardId) };
      },
      joinTargets: [...ctx.layoutOf.keys()].filter(
        (id) => id !== containerId && id !== pageId && (ctx.layoutOf.get(id) ?? specById.get(id)?.layout) === 'tabs' && !!model!.getGroup(id) && !insidePage(id)
      ),
      stripHeight: (targetId) => tabStripReserve(ctx.tabsOf.get(targetId), Math.max(1, liveCount(targetId))),
      ownBoards: [pageId, ...[...ctx.boardGroups.keys()].filter((id) => insidePage(id))],
      stripIndex: (targetId, cx, cy, grace = 0) => {
        const strip = ctx.tabStrips.get(targetId);
        if (!strip) return null;
        const r = strip.getBoundingClientRect();
        if (r.width === 0 || cx < r.left - grace || cx > r.right + grace || cy < r.top - grace || cy > r.bottom + grace) return null;
        return indexInStrip(strip, cx);
      },
      dropIndex: (targetId, cx, cy) => {
        const strip = ctx.tabStrips.get(targetId);
        const n = liveCount(targetId);
        if (!strip) return n;
        const r = strip.getBoundingClientRect();
        if (r.width === 0 || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return n;
        return indexInStrip(strip, cx);
      },
      markDrop: markTabDrop,
      reorder: (index) => reorderTabCommands(containerId, pageId, index),
      join: (targetId, index, boardId) => {
        const target = ctx.boardGroups.get(targetId) ?? model.getGroup(targetId);
        const targetSpec = specById.get(targetId);
        if (!target || !targetSpec) return { move: [], collapse: [] };
        const prevActive = ctx.activeTab.get(targetId);
        const cwOf = (g: GroupModel): Record<string, unknown> => (g.getMetadata('containerWidget') ?? {}) as Record<string, unknown>;
        let slot = -1;
        const joined = {
          register: (): void => {
            viewOfWidget.set(pageId, targetId);
            if (fromSpec?.widgets) {
              const i = fromSpec.widgets.findIndex((p) => p.id === pageId);
              if (i >= 0) {
                slot = i;
                fromSpec.widgets.splice(i, 1);
              }
            }
            targetSpec.widgets = targetSpec.widgets ?? [];
            if (!targetSpec.widgets.some((p) => p.id === pageId)) {
              targetSpec.widgets.splice(Math.max(0, Math.min(index, targetSpec.widgets.length)), 0, pageSpec);
            }
            ctx.boardWidgets.set(targetId, targetSpec.widgets);
            // The moved tab is the one showing, as it is in VS Code.
            ctx.activeTab.set(targetId, pageId);
            targetSpec.active = pageId;
            target.setMetadata('containerWidget', { ...cwOf(target), active: pageId });
          },
          unregister: (): void => {
            viewOfWidget.set(pageId, containerId);
            if (targetSpec.widgets) {
              const i = targetSpec.widgets.findIndex((p) => p.id === pageId);
              if (i >= 0) targetSpec.widgets.splice(i, 1);
            }
            if (fromSpec?.widgets && !fromSpec.widgets.some((p) => p.id === pageId)) {
              fromSpec.widgets.splice(slot < 0 ? fromSpec.widgets.length : Math.min(slot, fromSpec.widgets.length), 0, pageSpec);
            }
            if (prevActive) {
              ctx.activeTab.set(targetId, prevActive);
              targetSpec.active = prevActive;
              target.setMetadata('containerWidget', { ...cwOf(target), active: prevActive });
            }
          },
        };
        const move: Command[] = [
          new SequenceCommand('Move tab', [
            showingAgain(),
            new RemoveFromGroupCommand(containerId, pageId),
            new AddToGroupCommand(targetId, pageId),
            new RegisterWidgetCommand(joined, 'register'),
          ]),
        ];
        return { move, collapse: remaining.length > 0 ? [] : collapseOf(boardId) };
      },
    };

    /** A tab container nested inside the page being moved cannot be its target. */
    function insidePage(id: string): boolean {
      let cur = model!.getGroup(id);
      for (let i = 0; cur && i < 32; i++) {
        if (cur.id === pageId) return true;
        cur = cur.parentGroupId ? model!.getGroup(cur.parentGroupId) : undefined;
      }
      return false;
    }
    function liveCount(id: string): number {
      return [...(model!.getGroup(id)?.members ?? [])].filter((m) => !!model!.getGroup(m)).length;
    }
    /** The last page left: the container closes (see closeContainer). */
    function collapseOf(boardId: string): Command[] {
      return closeContainer(containerId, boardId);
    }
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
        // A TAB CONTAINER deliberately has no binder — it places its pages
        // itself. "No binder" must not read as "needs rebinding", or every
        // history event bound a GRID on it and laid the three pages out as
        // cells side by side (measured: 2×2 of 216×200 after one resize).
        if (ctx.layoutOf.get(id) === 'tabs') continue;
        if (!binders.has(id) && model.getGroup(id)) ctx.rebindContainer?.(id);
      }
      for (const b of binders.values()) b.sync();
      // …and undo/redo of a section resize must re-place the pages under the
      // strip, which only the tabs runtime knows how to do.
      for (const id of ctx.layoutOf.keys()) if (ctx.layoutOf.get(id) === 'tabs') ctx.syncTabs?.(id);
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
      teleport(ctx.container, () => {
        for (const [vid, g] of groups) {
          const x = vid === id ? 0 : OFFSCREEN_X;
          const s = g.size ?? { width: ctx.boardW, height: ctx.boardH };
          if (g.position.x !== x) g.setFrame({ x, y: 0, width: s.width, height: s.height });
        }
        binders.get(id)?.sync();
        ctx.apiRef?.renderNow();
      });
      frameView(groups.get(id)!);
    },
    widget(id) {
      return makeWidgetHandle(id);
    },
    focusWidget(id) {
      const b = binders.get(boardOfWidget(id) ?? '');
      if (!b) return false;
      if (b.focusWidget(id)) return true;
      // A widget added in this same tick is not a member yet (adds commit
      // asynchronously): the spec knows it, so select it once the commit lands.
      if (!specById.has(id)) return false;
      const retry = (n: number): void => { if (!b.focusWidget(id) && n > 0) setTimeout(() => retry(n - 1), 16); };
      queueMicrotask(() => retry(4));
      return true;
    },
    selectWidget(id) {
      if (id === undefined) {
        for (const b of binders.values()) b.selectWidget(undefined);
        return true;
      }
      const b = binders.get(boardOfWidget(id) ?? '');
      return !!b && b.selectWidget(id);
    },
    getSelectedWidget() {
      for (const b of binders.values()) {
        const s = b.getSelectedWidget();
        if (s) return s;
      }
      return undefined;
    },
    widgetsOf(viewId) {
      const v = views.find((x) => x.id === (viewId ?? ctx.active));
      return (v?.widgets ?? []).map((w) => makeWidgetHandle(w.id)).filter(Boolean) as WidgetHandle[];
    },
    setLayout(layout, viewId) {
      const vid = viewId ?? ctx.active;
      // A view, or a CONTAINER (item 7): the same switch one level down.
      if (!views.some((v) => v.id === vid) && !ctx.boardGroups.has(vid)) return;
      if ((ctx.layoutOf.get(vid) ?? 'grid') === layout) return;
      ctx.rebindView?.(vid, layout);
      clampCamera();
      ctx.apiRef?.renderNow();
      reportChanged();
    },
    getLayout: (viewId) => ctx.layoutOf.get(viewId ?? ctx.active) ?? 'grid',
    setCaption(id, caption) {
      const cg = ctx.boardGroups.get(id);
      const w = specById.get(id);
      if (!cg || !w || !w.widgets || views.some((v) => v.id === id)) return false;
      const before = w.caption;
      if (JSON.stringify(before ?? null) === JSON.stringify(caption ?? null)) return true;
      const apply = (c: SectionCaption | undefined): void => {
        if (c === undefined) delete w.caption;
        else w.caption = c;
        const cw = (cg.getMetadata('containerWidget') as Record<string, unknown> | undefined) ?? {};
        const next = { ...cw };
        if (c === undefined) delete next['caption'];
        else next['caption'] = c;
        cg.setMetadata('containerWidget', next);
        // The section's own board re-projects under its new frame; the parent
        // repaints the slab (the band lives there).
        binders.get(id)?.sync();
        binders.get(viewOfWidget.get(id) ?? '')?.sync();
        ctx.apiRef?.renderNow();
      };
      // Applied NOW (a caller reads the band right after), then recorded as
      // one history step whose execute re-applies the same value.
      apply(caption);
      execCommand(new SetCaptionCommand(id, before, caption, apply));
      reportChanged();
      return true;
    },
    getCaption: (id) => specById.get(id)?.caption,
    activateTab(containerId, pageId) {
      const cg = ctx.boardGroups.get(containerId);
      const w = specById.get(containerId);
      if (!cg || !w || (ctx.layoutOf.get(containerId) ?? w.layout) !== 'tabs') return false;
      if (!(w.widgets ?? []).some((p) => p.id === pageId && p.widgets)) return false;
      if (ctx.activeTab.get(containerId) === pageId) return true;
      ctx.activeTab.set(containerId, pageId);
      w.active = pageId;
      const cw = (cg.getMetadata('containerWidget') as Record<string, unknown> | undefined) ?? {};
      cg.setMetadata('containerWidget', { ...cw, active: pageId });
      teleport(ctx.container, () => {
        ctx.syncTabs?.(containerId);
        ctx.apiRef?.renderNow();
      });
      ctx.onTabChange?.(containerId, pageId, ctx.viewOfBoard.get(containerId) ?? ctx.active);
      reportChanged();
      return true;
    },
    getActiveTab: (containerId) => ctx.activeTab.get(containerId),
    async moveToTab(widgetId, containerId, index) {
      const sourceBoardId = viewOfWidget.get(widgetId);
      if (!sourceBoardId) return false;
      const cmds = moveWidgetToTabCommands(widgetId, containerId, index ?? Number.MAX_SAFE_INTEGER, sourceBoardId, binders.get(sourceBoardId)?.planRemoval(widgetId) ?? []);
      if (cmds.length === 0) return false;
      await execCommand(new BatchCommand('Move widget into a new tab', cmds));
      ctx.apiRef?.renderNow();
      reportChanged();
      return true;
    },
    moveTab(containerId, pageId, index) {
      const cmds = reorderTabCommands(containerId, pageId, index);
      if (cmds.length === 0) return false;
      void execCommand(new BatchCommand('Reorder tab', cmds));
      ctx.apiRef?.renderNow();
      reportChanged();
      return true;
    },
    setSizing(mode) {
      // THE VIEWS ONLY. A nested board (a page, a section) is bound fit with no
      // design height — its height is its container's business — and switched
      // to grow it painted its rows at the base height, 700 px past a torn-out
      // group or a split pane (0.4.38).
      for (const [id, b] of binders) if (groups.has(id)) b.setSizing(mode);
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
    setDragHandle(v) {
      for (const b of binders.values()) b.setDragHandle(v);
      ctx.apiRef?.renderNow();
    },
    getDragHandle: () => binders.get(ctx.active)?.getDragHandle() ?? (ctx.optionsBase.dragHandle ?? false),
    addWidget(spec, viewId, opts) {
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
      // ONE undoable step, registration included (see AddWidgetCommand). The
      // tiles a drop pushed aside ride in front of it, in a SEQUENCE: a batch
      // runs its members across awaits, and the board is re-read right after
      // this call — the pushed cells must be in the model by then.
      const add = new AddWidgetCommand(node, group.id, registry, !!existing);
      const displaced = opts?.displaced ?? [];
      execCommand(displaced.length > 0 ? new SequenceCommand('Add widget', [...displaced, add]) : add);

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
        const layout = ctx.layoutOf.get(v.id) ?? 'grid';
        const split = binders.get(v.id) as Partial<DashboardSplitHandle> | undefined;
        const tree = layout === 'split' && split?.getSplitTree ? split.getSplitTree() : undefined;
        return {
          ...v,
          ...(saved ? { columns: saved.columns } : {}),
          layout,
          ...(tree !== undefined ? { tree } : {}),
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
        dragHandle: handle.getDragHandle(),
        layout: handle.getLayout(),
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

  /**
   * The board that HOLDS a widget NOW — live membership, the way toJSON reads
   * it. A cross-board drag moves membership through the binder's own
   * commands, which the mount-time map never sees; a handle that kept asking
   * the widget's FIRST board answered `cell: null` for a tile that had just
   * been dropped into a page. The map is the fallback for a widget that is
   * not a member yet (an add still committing).
   */
  const boardOfWidget = (id: string): string | undefined => {
    for (const [cid, g] of ctx.boardGroups) if (g.members?.has(id)) return cid;
    const model = ctx.apiRef?.getModel();
    if (model) for (const vid of binders.keys()) if (model.getGroup(vid)?.members?.has(id)) return vid;
    return viewOfWidget.get(id);
  };
  function makeWidgetHandle(id: string): WidgetHandle | undefined {
    const spec = specById.get(id);
    if (!spec || !boardOfWidget(id)) return undefined;
    const board = (): string => boardOfWidget(id) ?? '';
    const binder = () => binders.get(board());
    const node = () => ctx.apiRef?.getModel().getNode(id);
    return {
      id,
      get viewId() {
        return boardOfWidget(id) ?? '';
      },
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
          const parentGroup = ctx.boardGroups.get(board());
          const parentBinder = binders.get(board());
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
          const registry = registryOf(id, board(), spec);
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
        const group = ctx.boardGroups.get(board());
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
        const registry = registryOf(id, board(), spec);
        // …and the page it emptied, if it was one, closes with it — in which
        // case everything rides INSIDE one sequence, or the batch could never
        // undo (a membership command cannot undo once its group is gone).
        const closing = ctx.closePageIfEmptied?.(board(), id) ?? [];
        const cmds = [
          ...survivors,
          new RemoveFromGroupCommand(group.id, id),
          new RemoveNodeCommand(id),
          new RegisterWidgetCommand(registry, 'unregister'),
          ...closing,
        ];
        void execCommand(closing.length > 0 ? new SequenceCommand('Remove widget', cmds) : new BatchCommand('Remove widget', cmds));
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
  const layout: 'grid' | 'split' = options.layout ?? 'grid';

  const views: DashboardViewSpec[] = options.views
    ? options.views.map((v) => ({ ...v, widgets: wrapTabPages(cloneWidgets(v.widgets)) }))
    : [{ id: 'main', widgets: wrapTabPages(cloneWidgets(options.widgets ?? [])) }];
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
    activeTab: new Map(),
    tabsOf: new Map(),
    tabStrips: new Map(),
    layoutOf: new Map(views.map((v) => [v.id, v.layout ?? layout])),
    optionsBase: options,
    active: views[0]?.id ?? 'main',
    apiRef: null,
    container: null,
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
      ctx.container = (a as { container?: HTMLElement }).container ?? null;
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
          dragHandle: options.dragHandle ?? false,
          layout: ctx.layoutOf.get(v.id) ?? layout,
        });
        if ((ctx.layoutOf.get(v.id) ?? layout) === 'split' && v.tree !== undefined) g.setMetadata(SPLIT_TREE_KEY, v.tree);
        g.size = { width: viewW(v), height: viewH(v), depth: 0 };
        g.position = { x: v.id === ctx.active ? 0 : OFFSCREEN_X, y: 0 };
        groups.set(v.id, g);
        ctx.boardGroups.set(v.id, g);
        mountBoard(v.id, v.id, v.widgets, g);
        binders.set(v.id, bindView(v, g, (ctx.layoutOf.get(v.id) as 'grid' | 'split') ?? layout));
      }
      // LIVE LAYOUT SWITCH (setLayout): keep the picture, swap the binder.
      // Either way the outgoing binder's cells are written where the grid
      // binder reads members' cells (gridItem metadata): grid → split derives
      // its tree from exactly those, so any stale tree is cleared first;
      // split → grid rebuilds from them, so the column cache goes too.
      ctx.rebindView = (viewId, next) => {
        const v = views.find((x) => x.id === viewId);
        if (!v) {
          rebindContainerLayout(viewId, next);
          return;
        }
        const g = groups.get(viewId);
        const b = binders.get(viewId);
        if (!v || !g || !b) return;
        const cells = b.saveLayout().cells;
        const live = { rtl: b.getRtl(), static: b.getStatic(), dragHandle: b.getDragHandle() };
        const focused = b.getFocusedWidget();
        const selected = b.getSelectedWidget();
        b.dispose();
        const write = (fn: () => void): void => (model.runSystemWrite ? model.runSystemWrite(fn) : fn());
        write(() => {
          for (const [id, cell] of cells) {
            const n = model.getNode(id);
            if (n) n.setMetadata('gridItem', gridItemFromCell(cell));
            else model.getGroup(id)?.setMetadata('gridItem', gridItemFromCell(cell));
          }
          g.setMetadata(SPLIT_TREE_KEY, undefined);
          g.setMetadata('dashboardLayouts', undefined);
          const board = (g.getMetadata('dashboardBoard') as Record<string, unknown> | undefined) ?? {};
          g.setMetadata('dashboardBoard', { ...board, layout: next });
        });
        ctx.layoutOf.set(viewId, next);
        binders.set(viewId, bindView(v, g, next, live));
        binders.get(viewId)?.sync();
        // The selected widget (and its grip) survives the switch, as it does in
        // the DevExpress designer — the host used to have to restate it. A
        // MOUSE selection is not a focus (the press never focuses the host),
        // so it is carried on its own: the kit lab's L21 lost it (2026-09-08).
        if (focused) binders.get(viewId)?.focusWidget(focused);
        else if (selected) binders.get(viewId)?.selectWidget(selected);
      };
      handle.showView(ctx.active);
      ctx.rebindContainer = (id: string): void => {
        const g = model.getGroup(id);
        const w = specById.get(id);
        if (!g || !w || !w.widgets) return;
        if ((ctx.layoutOf.get(id) ?? w.layout) === 'tabs') return; // places its own pages
        ctx.boardGroups.set(id, g);
        bindContainer(g, w, ctx.viewOfBoard.get(id) ?? ctx.active);
      };
      /**
       * LIVE LAYOUT SWITCH ON A CONTAINER (item 7) — the view's contract one
       * level down: cells persisted where the grid reads them, the tree and
       * column cache cleared, the container's `layout` flipped on its spec and
       * its metadata, a fresh binder on the same group, selection carried.
       */
      function rebindContainerLayout(id: string, next: 'grid' | 'split'): void {
        const cg = ctx.boardGroups.get(id);
        const w = specById.get(id);
        const b = binders.get(id);
        if (!cg || !w || !w.widgets || !b) return;
        const cells = b.saveLayout().cells;
        const focused = b.getFocusedWidget();
        const selected = b.getSelectedWidget();
        b.dispose();
        const write = (fn: () => void): void => (model.runSystemWrite ? model.runSystemWrite(fn) : fn());
        write(() => {
          for (const [cid, cell] of cells) {
            const n = model.getNode(cid);
            if (n) n.setMetadata('gridItem', gridItemFromCell(cell));
            else model.getGroup(cid)?.setMetadata('gridItem', gridItemFromCell(cell));
          }
          cg.setMetadata(SPLIT_TREE_KEY, undefined);
          cg.setMetadata('dashboardLayouts', undefined);
          const board = (cg.getMetadata('dashboardBoard') as Record<string, unknown> | undefined) ?? {};
          cg.setMetadata('dashboardBoard', { ...board, layout: next });
          const cw = (cg.getMetadata('containerWidget') as Record<string, unknown> | undefined) ?? {};
          cg.setMetadata('containerWidget', { ...cw, layout: next });
        });
        w.layout = next;
        delete w.tree;
        ctx.layoutOf.set(id, next);
        // The inner bound is the slab's LIVE row count, not the authored design:
        // a child escalation grew to two rows must keep them through a
        // split → grid round trip (the visual gate caught it collapsing to one
        // inside a two-row slab).
        void binders.get(ctx.viewOfWidget.get(id) ?? '')?.cellOf(id);
        bindContainer(cg, w, ctx.viewOfBoard.get(id) ?? ctx.active);
        binders.get(id)?.sync();
        if (focused) binders.get(id)?.focusWidget(focused);
        else if (selected) binders.get(id)?.selectWidget(selected);
      }
      // (Statements must live BEFORE this return — everything below it is a
      // hoisted function declaration, so an assignment placed there never
      // runs. That cost me a debugging round: `ctx.syncTabs` stayed undefined
      // and every tab switch silently did nothing.)
      ctx.onTabChange = options.onTabChange;
      attachTabsRuntime(ctx, model, (a as unknown as { container?: HTMLElement }).container ?? null, handle);
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
              ...(w.layout !== undefined ? { layout: w.layout } : {}),
              ...(w.sizing !== undefined ? { sizing: w.sizing } : {}),
              ...(w.caption !== undefined ? { caption: w.caption } : {}),
            });
            // Item 7: the container's own layout and bound, persisted like a view's.
            ctx.layoutOf.set(w.id, w.layout ?? 'grid');
            if (w.layout === 'split' && w.tree !== undefined) cg.setMetadata(SPLIT_TREE_KEY, w.tree);
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
              layout: w.layout ?? 'grid',
              escalate: w.sizing !== 'fit',
            });
            cg.size = { width: 100, height: rowHeight, depth: 0 };
            boardGroup.addMember(w.id);
            ctx.boardGroups.set(w.id, cg);
            mountBoard(w.id, viewId, w.widgets, cg);
            if (w.layout === 'tabs') {
              // A TAB CONTAINER lays its pages out itself — one visible, the
              // rest parked — so it binds no grid of its own. Its pages are
              // ordinary containers with ordinary binders. The runtime that
              // positions them is attached once, after every board is mounted.
              const pages = (w.widgets ?? []).filter((c) => !!c.widgets);
              const active = w.active && pages.some((p) => p.id === w.active) ? w.active : pages[0]?.id;
              if (active) {
                ctx.activeTab.set(w.id, active);
                w.active = active;
              }
              cg.setMetadata('containerWidget', { ...(cg.getMetadata('containerWidget') as object), layout: 'tabs', ...(active ? { active } : {}), ...(w.tabs ? { tabs: w.tabs } : {}) });
              ctx.tabsOf.set(w.id, w.tabs ?? {});
              continue;
            }
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

      /** Bind a VIEW's board on its group, under the given layout. */
      /**
       * Bind a view's board. `live` carries the switches a previous binder of
       * the same view held (a re-bind on a layout change): without it a board
       * switched to static, RTL or drag-by-header LIVE snapped back to its
       * authored options the moment its layout changed (s34 caught it).
       */
      /** The caption escape hatches, with the spec and the view filled in. */
      function captionHooks(viewId: string): Pick<DashboardGridOptions, 'renderCaption' | 'onCaptionAction'> {
        const render = options.renderCaption;
        return {
          ...(render
            ? {
                renderCaption: (sectionId: string, host: HTMLElement) => {
                  const spec = specById.get(sectionId);
                  if (spec) render(spec, host);
                },
              }
            : {}),
          onCaptionAction: (sectionId: string, actionId: string) => options.onCaptionAction?.(sectionId, actionId, viewId),
        };
      }
      function bindView(
        v: DashboardViewSpec,
        g: GroupModel,
        viewLayout: 'grid' | 'split',
        live?: { rtl: boolean; static: boolean; dragHandle: DragHandleOption }
      ): DashboardGridHandle {
        const common = {
          gap,
          padding: gap,
          rtl: live?.rtl ?? options.rtl ?? false,
          fluid: mode === 'fluid',
          static: live?.static ?? options.static ?? false,
          ...(options.nesting !== undefined ? { nesting: options.nesting } : {}),
          dragHandle: live?.dragHandle ?? options.dragHandle ?? false,
          ...(options.squeeze !== undefined ? { squeeze: options.squeeze } : {}),
          ...(options.binder ?? {}),
          onGesture: (e: Parameters<NonNullable<DashboardGridOptions['onGesture']>>[0]) => {
            if (e.type === 'commit') reportChanged();
            options.binder?.onGesture?.(e);
          },
          onSelect: (id: string | undefined) => options.onSelect?.(id, v.id),
          ...captionHooks(v.id),
          onMemberLeaving: (memberId: string) => ctx.closePageIfEmptied?.(v.id, memberId) ?? [],
          onMemberMoving: (memberId: string, from: string, to: string) => ctx.moveContainerCommands?.(memberId, from, to) ?? [],
          ...(ctx.tabDrop ? { tabDrop: ctx.tabDrop } : {}),
        };
        if (viewLayout === 'split') {
          return bindDashboardSplit(a as never, g, {
            ...common,
            columns: v.columns ?? columns,
            baseRowHeight: rowHeight,
            designHeight: viewH(v),
            ...(v.tree !== undefined ? { tree: v.tree } : {}),
          });
        }
        return bindDashboardGrid(a as never, g, {
          ...common,
          columns: v.columns ?? columns,
          sizing,
          baseRowHeight: rowHeight,
          designHeight: viewH(v),
          float: options.float ?? false,
          overflow,
          ...(options.responsive ? { responsive: options.responsive } : {}),
        });
      }

      /** Bind (or re-bind) a container's inner grid on its group. */
      function bindContainer(cg: GroupModel, w: DashboardWidgetSpec, viewId: string, innerRows?: number): void {
        void viewId;
        // The LIVE switches ride on the view's binder when it exists (a
        // container bound after a setStatic/setRtl/setDragHandle must match).
        const vb = binders.get(ctx.viewOfBoard.get(w.id) ?? ctx.active);
        const inner = {
          columns: innerColumnsOf(w),
          gap,
          padding: 0,
          baseRowHeight: rowHeight,
          rtl: vb?.getRtl() ?? options.rtl ?? false,
          static: vb?.getStatic() ?? options.static ?? false,
          dragHandle: vb?.getDragHandle() ?? options.dragHandle ?? false,
          ...(options.nesting !== undefined ? { nesting: options.nesting } : {}),
          ...(options.squeeze !== undefined ? { squeeze: options.squeeze } : {}),
          onGesture: (e: Parameters<NonNullable<DashboardGridOptions['onGesture']>>[0]) => {
            if (e.type === 'commit') reportChanged();
            options.binder?.onGesture?.(e);
          },
          onSelect: (id: string | undefined) => options.onSelect?.(id, ctx.viewOfBoard.get(w.id) ?? ctx.active),
          ...captionHooks(ctx.viewOfBoard.get(w.id) ?? ctx.active),
          onMemberLeaving: (memberId: string) => ctx.closePageIfEmptied?.(w.id, memberId) ?? [],
          onMemberMoving: (memberId: string, from: string, to: string) => ctx.moveContainerCommands?.(memberId, from, to) ?? [],
          ...(ctx.tabDrop ? { tabDrop: ctx.tabDrop } : {}),
        };
        if ((ctx.layoutOf.get(w.id) ?? w.layout) === 'split') {
          // A splitter tree covering the pane; the pane's frame is the parent's
          // slab, so no design height of its own.
          binders.set(w.id, bindDashboardSplit(a as never, cg, { ...inner, ...(w.tree !== undefined ? { tree: w.tree } : {}) }));
          return;
        }
        binders.set(
          w.id,
          bindDashboardGrid(a as never, cg, {
            ...inner,
            sizing: 'fit',
            designHeight: 0,
            // The DESIGN: authored, else what the group was mounted with, else
            // the children's extent — the binder's live bound follows the cells.
            maxRows: innerRows ?? w.maxRows ?? (cg.getMetadata('containerWidget') as { maxRows?: number } | undefined)?.maxRows ?? rowExtentOf(w.widgets ?? []),
            float: false,
            escalate: w.sizing !== 'fit',
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
