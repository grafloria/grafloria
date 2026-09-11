/**
 * `bindDashboardGrid(api, group, options)` — the dashboard-grid gesture binder
 * (Phase 2 of the dashboard-grid plan; the plan page's Section-1 prototype is
 * the executable spec of the feel this reproduces).
 *
 * One binder owns ONE `GridPackEngine` mirroring the group's members — the
 * engine is the single source of truth for cell math (three swap shapes, the
 * >50% anti-jitter gate, locked refusal, push-down + skipDown, teleport-home
 * settle). This module only converts: pointer → cells in, cells → pixels out,
 * gesture → ONE undoable BatchCommand.
 *
 * HOW THE RENDERER'S OWN NODE-DRAG IS BYPASSED — a registered `CanvasTool`
 * (the renderer's wave-6 tool registry, `registerTool`). The tool makes a
 * POINT-SPECIFIC claim (priority 2, like the whiteboard ink tool): any
 * pointerdown whose hit node is a member of the bound group, or that lands
 * inside a member group's frame with no node under it (the KPI-slab dead
 * zone — otherwise the built-in group-drag would fight the pack layout
 * there). A claimed gesture bypasses the ENTIRE built-in ladder — node-drag,
 * selection, marquee, wave-12 resize handles — and the DomEventBinder
 * forwards move/up/cancel with world coordinates already computed. This beats
 * `behavior.draggable = false` (which still runs selection and shows the
 * built-in resize handles) and beats capture-phase DOM listeners (which fight
 * the binder's own preventDefault bookkeeping). `click` is NOT a
 * compatibility mouse event, so the page's click-to-focus keeps firing for
 * sub-threshold presses.
 *
 * DURING a gesture, positions are written through the MODEL, not commands:
 *  - the held tile is a GHOST — transition-exempt, tracking the cursor in
 *    WORLD coordinates (no `position: fixed` hack; the html layer carries the
 *    camera transform, and the tool events arrive already converted);
 *  - every cell crossing runs `engine.moveCheck` / `resizeCheck`; every item
 *    the engine displaced is re-projected cells→pixels. Those writes are
 *    DERIVED state, so they run inside `diagram.runSystemWrite` — which is
 *    also what lets a PINNED tile's pixels follow a fit-mode row-height
 *    change without violating the authoritative geometry lock (its CELLS
 *    never change; the pin protects the document fact, not the projection);
 *  - a dashed PLACEHOLDER (`.axdb-ph`) always shows the engine's current cell
 *    for the held tile — the truthful drop preview.
 *
 * The gesture ends in ONE `BatchCommand`: `SetGridItemCommand` per tile whose
 * cells changed (cells are the truth) + `MoveNodeCommand`/`ResizeNodeCommand`
 * (merge-opted-OUT) per unlocked node whose geometry changed, so a bare undo
 * restores geometry AND cells with no binder help. Escape restores the
 * engine snapshot (`cancelGesture`) and every pixel — nothing is committed.
 *
 * MEMBER GROUPS (e.g. a KPI section) ride as LOCKED slab items — never
 * pushed, never packed, drags onto them refused (the prototype's pinned
 * full-width row). Their cells persist in group metadata `gridItem` (groups
 * carry no GridItemConfig); their INNER layout is their own concern — bind a
 * second `bindDashboardGrid` on the section for a nested pack grid.
 */

import {
  AddToGroupCommand,
  BatchCommand,
  Command,
  GridPackEngine,
  RemoveFromGroupCommand,
  type DiagramModel,
  type GridColumnLayout,
  type GridItemConfig,
  type GridLayoutCache,
  type GridPackItem,
  type GroupModel,
  type NodeModel,
} from '@grafloria/engine';
import { registerTool, type CanvasTool, type ToolPointerEvent } from '@grafloria/renderer';
import {
  buildCommitCommands,
  cellFromGridItem,
  cellToRect,
  columnUnitFor,
  gridItemFromCell,
  pointToCell,
  rowHeightFor,
  sizeToSpan,
  type CellRect,
  type DashboardGridGeometry,
  type TileDelta,
  type WorldRect,
} from './grid-mapping';
import { ensureDashboardKitStyles } from './styles';
import { captionOfGroup, captionPainted, captionPassThrough, captionKey, paintCaptionBand, sectionCaptionReserve, sizeCaptionBand } from './caption';
import { TAB_STRIP_HEIGHT } from './tabs';
import { BESIDE_BAND, resolve as resolveZone, resolveTabZone, type BesideSide, type ZoneBoard, type ZoneContainer } from './zones';
import { SequenceCommand, SetGroupCellCommand, tileCommands } from './commit';
import { EDGE_GRACE, type BoardCtx } from './board-ctx';
import { createProjection } from './project';
import { cursorFor, edgesNear, EDGE_GRIP, NO_EDGES, anyEdge, type ResizeEdges } from './edges';
import { DRAG_HANDLE_CLASS, dragHandleSelector, gripHostOf, normalizeDragHandle, pressOnDragHandle, sameDragHandle, type DragHandleOption } from './grip';
import { createChrome, edgeGripFor, isTabsGroup } from './chrome';
import { createKeyboard, describeCell, liveRegionFor } from './keyboard';
import { createTearOut, TEAR_OUT_MIN_ROWS } from './tear-out';
export { TEAR_OUT_MIN_ROWS } from './tear-out';
export { EDGE_GRIP, anyEdge, type ResizeEdges } from './edges';
export { GRIP_CLASS, DRAG_HANDLE_CLASS, CAPTION_BAND, normalizeDragHandle, dragHandleSelector, gripOf, syncGrip, gripHostOf, pressOnDragHandle, type DragGripOptions, type DragHandleOption } from './grip';
export { SequenceCommand, SetGroupCellCommand } from './commit';

/** The slice of a DiagramInstance the binder needs (structural, test-friendly). */
export interface DashboardGridApi {
  getModel(): DiagramModel;
  getEngine(): { commandManager: { execute(cmd: Command): Promise<unknown> | unknown } };
  readonly container: HTMLElement;
  readonly viewport?: {
    clientToWorld(
      clientX: number,
      clientY: number,
      rect: { left: number; top: number; width: number; height: number }
    ): { x: number; y: number };
  };
  render(): void;
  renderNow(): void;
}

/**
 * RESPONSIVE COLUMN COUNT — gridstack's `columnOpts`, driven by the BOARD's
 * width. Give it `columnWidth`, or `breakpoints`, or both (breakpoints win).
 *
 * The binder owns the recomputation, not the page: it re-evaluates whenever
 * the group's frame changes AND whenever the canvas container resizes, so a
 * board that tracks the viewport and a board resized by a control both work
 * with no page code. Column changes are DERIVED state — they re-project
 * pixels and re-write cells through `runSystemWrite`, never through the
 * command stack, so responding to a window resize can never land in undo.
 */
export interface DashboardResponsiveOptions {
  /**
   * Target width of ONE column, px. The count is `round(boardWidth /
   * columnWidth)`, clamped to `[1, columnMax]` — gridstack's `columnWidth`.
   */
  columnWidth?: number;
  /**
   * Upper bound for the derived count, and the count used when no breakpoint
   * matches. Defaults to the binder's declared `columns`.
   */
  columnMax?: number;
  /**
   * Explicit steps, gridstack-style: the FIRST entry (ascending by `w`) whose
   * `w` is at least the board width decides the count. Wider than every entry
   * → `columnMax`. Each step may name its own re-layout mode.
   */
  breakpoints?: Array<{ w: number; c: number; layout?: GridColumnLayout }>;
  /** Default re-layout mode for a change (see {@link GridColumnLayout}). */
  layout?: GridColumnLayout;
}

export interface DashboardGridOptions {
  /** Column count (default 12). With `responsive`, the starting/maximum count. */
  columns?: number;
  /**
   * RIGHT-TO-LEFT board. Cells are unchanged — x=0 is still the first column —
   * but it renders at the board's RIGHT edge and columns run leftwards. Purely
   * a pixel-mapping concern: the engine, the cells and every saved layout are
   * direction-agnostic.
   */
  rtl?: boolean;
  /** Derive the column count from the board's width (see the interface). */
  responsive?: DashboardResponsiveOptions;
  /** Fires after a responsive (or programmatic) column-count change. */
  onColumnsChange?: (columns: number, previous: number) => void;
  /** Gap between cells, px (default 12). */
  gap?: number;
  /** Board padding, px (default = gap). */
  padding?: number;
  /** Sizing mode (default 'fit' — the user decision recorded in the plan). */
  sizing?: 'fit' | 'grow';
  /** 'grow' row height, px (default 110). */
  baseRowHeight?: number;
  /** 'fit' row-height floor, px (default 28). */
  minRowHeight?: number;
  /**
   * The board's design height (default: the group's height at bind time).
   * 'fit' pins the frame to it; 'grow' never shrinks the frame below it.
   */
  designHeight?: number;
  /** Engine float mode (default false → gravity packs upward). */
  float?: boolean;
  /**
   * Engine row bound (see GridPackOptions.maxRows). A nested strip like the
   * KPI section passes 1: its DESIGN is one row, so height growth and pushes
   * that would spill a sibling downward are refused (siblings shift along the
   * row instead), and the strip can never be squeezed.
   */
  maxRows?: number;
  /**
   * Nested boards only. `true` (default): a child pulled clearly past the
   * bound GROWS the container's slab in the parent (height escalation).
   * `false`: the pane is the bound — the pull is refused where it stands, the
   * container's `sizing: 'fit'`.
   */
  escalate?: boolean;
  /**
   * What dragging a tile OUT of the board means (default 'cancel' — the tile
   * snaps back on release). 'remove' dims the ghost outside the board and a
   * release outside calls `onRemoveRequest` — deletion stays on the page's
   * atomic command path.
   */
  dragOut?: 'remove' | 'cancel';
  /**
   * With dragOut:'remove', restrict deletion to an EXPLICIT drop zone (the
   * page passes "over the palette" — gridstack web2's trash semantics).
   * Outside the zone a release snaps home instead: a 60px overshoot past the
   * frame edge must never destroy a widget (live parity review — the plan
   * prototype clamps at its edges and cannot delete at all).
   */
  removeZone?: (screen: { x: number; y: number }, world: { x: number; y: number }) => boolean;
  /**
   * Page hook for drag-out removal: execute ONE undoable batch that removes
   * `nodeId` AND applies `displaced` (the survivors' cell commits, so undo
   * restores the exact board).
   */
  onRemoveRequest?: (nodeId: string, displaced: Command[]) => void | Promise<void>;
  /**
   * Page hook for palette drag-in release: add `node` (already carrying
   * `cell` in its gridItem) to `target.boardId` — this view, or a page or
   * section the chip was dropped into (tile first, step 4a) — through the
   * page's command path, folding `displaced` into the same batch.
   */
  onDropIn?: (node: NodeModel, cell: CellRect, displaced: Command[], target: { boardId: string }) => void | Promise<void>;
  /**
   * A member is about to LEAVE this board through a gesture (moved into
   * another board, made a tab of its own). Answers the commands that follow
   * it in the same batch — a tab page emptied by the move closes.
   */
  onMemberLeaving?: (memberId: string) => Command[];
  /**
   * A member CONTAINER is moving from this board to another by a gesture
   * (tile first, 4b-ii). Answers the commands that carry the host's own
   * bookkeeping for it — the spec entry, the registry — in the same batch.
   */
  onMemberMoving?: (memberId: string, fromBoardId: string, toBoardId: string) => Command[];
  /** A widget dragged over a tab STRIP becomes a new tab there: the hooks that hit-test, mark and commit it. */
  tabDrop?: TabDropHooks;
  /** Fires after commits/cancels/removals so the page can refocus/refit/flash. */
  onGesture?: (e: {
    type: 'commit' | 'cancel' | 'remove' | 'drop-in';
    kind: 'move' | 'resize' | 'palette';
    nodeId: string;
    changed: boolean;
  }) => void;
  /** Inject the hover-revealed corner resize handle into member hosts (default true). */
  /** The selection on this board changed: the selected member — a widget or a SECTION (container) — or undefined. */
  onSelect?: (id: string | undefined) => void;
  /**
   * SECTION CAPTIONS (0.4.22). Paint a member section's caption band yourself:
   * the band is handed over empty, sized and themed, and keeps its press rules.
   * Default: the kit's icon · text · subtitle · ⓘ · actions.
   */
  renderCaption?: (sectionId: string, host: HTMLElement) => void;
  /** A press on a caption action button (see `SectionCaptionOptions.actions`). */
  onCaptionAction?: (sectionId: string, actionId: string) => void;
  resizeHandles?: boolean;
  /**
   * FLUID board: the group's frame follows the CANVAS CONTAINER — width
   * always, and height too in 'fit' — so the dashboard is laid out at real CSS
   * pixels like every other grid library, never as a picture the camera scales
   * (review D1: a 900-px viewport drew 30-px KPI figures at 18 px). The binder
   * owns the ResizeObserver; `sync()` re-reads the container as well.
   */
  fluid?: boolean;
  /**
   * What FIT mode does past its row floor. 'bounded' (default): the design
   * height is a CAPACITY — a drop, resize or add that would need one row too
   * many is refused (the engine's `capacity`), visibly, at design time.
   * 'scroll': no bound; the frame extends to hold the rows at the floor height
   * so nothing paints outside it, and the canvas pans. Either way a fit board
   * never paints past its own edge (review D6: 204 px of tiles below the frame).
   */
  overflow?: 'bounded' | 'scroll';
  /**
   * STATIC board (gridstack's `staticGrid`): the pointer can neither drag nor
   * resize and no handles are injected; the API (moveTo/resizeTo, adds, undo)
   * still works. The viewer's mode — see `setStatic` for the live switch.
   */
  static?: boolean;
  /**
   * NESTING POLICY (tile first, step 2): the deepest board a DROP may enter,
   * counting a view as 0 — a widget into a section is 1, into a section
   * inside a tab page is 2. Deeper containers are opaque to a drag: the
   * pointer over them means a cell on their parent board (or beside them).
   * Unbounded by default.
   */
  nesting?: number;
  /**
   * DRAG HANDLE (DevExpress drags an item by its caption; gridstack's
   * `handle`). `true` — the CAPTION STRIP is the handle (the header shows grip
   * dots); a selector string — your own element inside the host; a
   * `{ grip: true }` object — a dedicated GRIP the kit paints, positioned
   * left / center / right and, for the top edge, `inside` the header band or
   * `outside` as a tab above the card (the DevExpress item bar). Off
   * (default): the whole card. Resize edges are unaffected and the body stays
   * interactive (scroll a table, click a legend). Live: `setDragHandle`.
   */
  dragHandle?: DragHandleOption;
  /**
   * FIT AND THE ROW FLOOR. `true` (default): a bounded fit board holds as many
   * rows as fit at `minRowHeight` — a gesture that needs another row SQUEEZES
   * every row toward the floor, and is refused only when even that is not
   * enough. `false`: rows FREEZE at the height they have now — the capacity is
   * what the frame holds at the current row height, so a resize, move or add
   * that needs a row the frame does not have is refused outright (placeholder
   * stays, `onGesture` reports `changed: false`) and no other tile shrinks. A
   * board loaded with more rows than fit still squeezes to the frame (fit never
   * scrolls); it just cannot be pushed further by a gesture.
   */
  squeeze?: boolean;
}

/** The member host a press on a painted grip belongs to (the grip may sit OUTSIDE the host's box). */
/**
 * Is this press OURS? The renderer's tool registry is PAGE-GLOBAL: every
 * registered tool is asked about every press on every canvas, ties going to
 * the first registered. Two boards on one page sharing widget ids — a designer
 * beside its preview, a page of examples — had the FIRST board's tool claim
 * the second's presses: it selected its own tile and moved nothing (kit lab,
 * 2026-09-08: 16 of 23 boards dead to the mouse). A tool claims only a press
 * whose DOM target sits in its own container and whose hit node is its own
 * diagram's object, not a namesake from another model.
 */
export function ownsPress(
  container: HTMLElement,
  diagram: { getNode(id: string): unknown },
  ev: ToolPointerEvent,
  hit: { node?: { id: string } }
): boolean {
  const t = (ev.source as { target?: unknown } | undefined)?.target;
  if (typeof Node !== 'undefined' && t instanceof Node && !container.contains(t)) return false;
  if (hit.node && diagram.getNode(hit.node.id) !== hit.node) return false;
  // A press on a PASS-THROUGH element of a caption band (a button, an input,
  // anything the caption's `passThrough` names) is the content's, not any
  // tool's: no selection, no drag, no resize — the DOM handles it.
  if (typeof Element !== 'undefined' && t instanceof Element) {
    // A TAB STRIP is content, never a board press: its tabs are real buttons.
    if (t.closest('.axdb-tabs')) return false;
    const band = t.closest('.axdb-slab > .axdb-slab-h');
    const sid = band?.parentElement?.getAttribute('data-slab-id');
    if (band && sid) {
      const grp = (diagram as { getGroup?(id: string): unknown }).getGroup?.(sid) as Parameters<typeof captionOfGroup>[0];
      if (captionPassThrough(t, band, captionOfGroup(grp))) return false;
    }
  }
  return true;
}
export interface DashboardGridHandle {
  /** Rebuild the engine from the group's members + their cells, re-project pixels. */
  sync(): void;
  setSizing(mode: 'fit' | 'grow'): void;
  getSizing(): 'fit' | 'grow';
  /**
   * Engine float mode, live (the prototype's second toggle): ON — tiles stay
   * exactly where placed, vertical gaps are legal; OFF — gravity re-packs
   * upward immediately.
   */
  setFloat(on: boolean): void;
  getFloat(): boolean;
  /**
   * Change the COLUMN COUNT live (gridstack's `column(n, layout)`), through the
   * engine's per-column layout cache: shrinking caches the layout it leaves,
   * growing back restores it. Returns true when the count actually changed.
   *
   * Calling this directly PINS the count — it switches the responsive
   * evaluator off, so a board under an explicit count is not fought by its own
   * width observer. `setColumns(n, layout, { responsive: true })` is the
   * evaluator's own path back.
   */
  setColumns(n: number, layout?: GridColumnLayout, opts?: { responsive?: boolean }): boolean;
  getColumns(): number;
  /** RTL mirroring, live. Cells never change — only the pixels. */
  setRtl(on: boolean): void;
  getRtl(): boolean;
  /** Static mode, live: pointer gestures off (and handles gone) or back on. */
  setStatic(on: boolean): void;
  getStatic(): boolean;
  /** Drag-handle mode, live: `true` = the caption strip, a selector = your own handle, `{ grip: true, … }` = a painted grip, `false` = the whole card. */
  setDragHandle(v: DragHandleOption): void;
  getDragHandle(): DragHandleOption;
  /**
   * Move keyboard focus to a member (the roving tabindex lands on it). The
   * host takes DOM focus when it exists; returns false for a non-member.
   */
  focusWidget(id: string): boolean;
  /** The member the roving tabindex currently rests on. */
  getFocusedWidget(): string | undefined;
  /**
   * SELECT a member without moving keyboard focus — what a mouse press does
   * (the renderer cancels the press's default, so a click never focuses the
   * host). `undefined` clears. False for a non-member.
   */
  selectWidget(id: string | undefined): boolean;
  /** The selected member: the one wearing the ring and, in grip mode, the grip. */
  getSelectedWidget(): string | undefined;
  /**
   * The layout to PERSIST — from the engine's LARGEST cached column count, so
   * saving while the board is narrow still saves the wide layout the user
   * authored (gridstack's `save()` semantics).
   */
  saveLayout(): { columns: number; cells: Map<string, CellRect> };
  /** Live board metrics (mapping inputs + derived row height / rows). */
  metrics(): {
    /** The LIVE column count — with `responsive`, this is what width chose. */
    columns: number;
    /** The declared maximum (the count the board was authored at). */
    maxColumns: number;
    rtl: boolean;
    responsive: boolean;
    fluid: boolean;
    static: boolean;
    /** `true` = the caption strip, a selector = a custom one, `{ grip: true, … }` = a painted grip, `false` = the whole card. */
    dragHandle: DragHandleOption;
    /** Fit-mode row capacity (undefined when unbounded). */
    capacity: number | undefined;
    gap: number;
    padding: number;
    sizing: 'fit' | 'grow';
    rows: number;
    rowHeight: number;
    columnUnit: number;
    boardHeight: number;
    frame: WorldRect;
  };
  /**
   * Would a w×h tile fit on the board as it is now (gridstack's `willItFit`)?
   * Always true on an unbounded board; on a bounded fit board this is what
   * `addWidget()` asks before creating anything.
   */
  willItFit(w: number, h: number): boolean;
  /** The engine's cell record for a member (undefined when not a member). */
  cellOf(id: string): CellRect | undefined;
  /** World rect the member's current cells project to. */
  cellRectOf(id: string): WorldRect | undefined;
  /** Commands that reconcile the survivors after removing `id` — fold into the remove batch. */
  planRemoval(id: string): Command[];
  /**
   * Programmatic single-step gestures — the demo asserts' deterministic hook.
   * Same pipeline as a pointer gesture, committed as ONE BatchCommand. Unlike
   * a pointer commit (which fire-and-forgets, wave-3 style, because the
   * visible state is already final), these AWAIT the command execution so a
   * caller can undo immediately after.
   */
  moveTo(id: string, x: number, y: number): Promise<boolean>;
  resizeTo(id: string, w: number, h: number): Promise<boolean>;
  /**
   * Palette drag-in: `node` is a DETACHED widget node (not yet in the model).
   * A chip follows the cursor; entering the board places the node's item in
   * the engine (first placement skips the anti-jitter gate, as gridstack's
   * drag-in does) and the normal live-push loop takes over. Release inside →
   * `onDropIn`; release outside / Escape → aborted, nothing committed.
   */
  beginPaletteDrag(
    node: NodeModel,
    spec: { w: number; h: number; chip?: HTMLElement },
    event: PointerEvent
  ): void;
  dispose(): void;
}

interface GeomSnapshot {
  pos: { x: number; y: number };
  size: { width: number; height: number; depth?: number };
}

/**
 * CROSS-CONTAINER HANDOFF. Binders on the same canvas register here; a move
 * gesture whose pointer enters ANOTHER registered board (deepest wins — the
 * nested KPI section beats the tab that contains it) hands the tile off: the
 * source engine drops it (survivors settle home), the target engine ADOPTS it
 * (gateless first placement, then the normal live-push loop), and release
 * commits ONE batch across both boards — displaced tiles on each side,
 * RemoveFromGroup + AddToGroup, the tile's new cells and geometry. This is
 * what makes "drag Total Revenue under Top reps" MOVE the KPI to the main
 * board rather than snapping it home (live review: parking was a guard, not
 * the feature).
 */
interface BinderPeer {
  group: GroupModel;
  /** True when this board's engine holds `id` as an item (member lookup). */
  hasItem(id: string): boolean;
  /**
   * Drop this board's selection: a press that selects a tile on ONE board of
   * a canvas clears the others, so a section and its parent never show two
   * rings at once (Quantia Groups page: three tiles selected across three
   * boards after three clicks).
   */
  clearSelection?(): void;
  /** A nested board's live row bound — what its slab must never shrink below. */
  innerRows?(): number;
  /**
   * SECTION PRESSES. A press on a section's empty band lands on the NESTED
   * board's tool (it claims its own frame), which knows nothing to select;
   * the section is a member of the PARENT. The child asks the parent to
   * select it and, on an edge or the corner handle, to run the section
   * resize — and forwards the rest of the pointer sequence.
   */
  selectMember?(id: string): void;
  beginSlabResize?(id: string, edges: ResizeEdges, ev: ToolPointerEvent): boolean;
  slabMove?(ev: ToolPointerEvent): void;
  slabUp?(): void;
  slabCancel?(): void;
  /** The member's current cell in this board (undefined when absent). */
  memberCell(id: string): CellRect | undefined;
  /**
   * Grow/shrink a member's row span by `dRows` — the parent half of nested
   * HEIGHT ESCALATION: pulling a KPI taller than its one-row strip grows the
   * STRIP's slab in the board that contains it (live report: "i cant
   * increase height"). Returns the cell+frame before/after when accepted.
   */
  resizeMemberBy(id: string, dRows: number): {
    changed: boolean;
    cellBefore?: CellRect;
    cellAfter?: CellRect;
    frameBefore?: WorldRect;
    frameAfter?: WorldRect;
  };
  containsWorld(x: number, y: number): boolean;
  /**
   * Containment plus ONE extra row of grace below the frame — gridstack's
   * `_extraDragRow`: dropping "under the last row" appends a row rather than
   * counting as off-board. Consulted only when NO strict frame matched, so a
   * nested strip's band can never steal a point that strictly belongs to the
   * board below it.
   */
  containsWorldExtended(x: number, y: number): boolean;
  frameArea(): number;
  /** A static board is opaque to the zone walk: never entered (tile first, step 2). */
  isStatic?(): boolean;
  adopt(
    node: { id: string },
    world: { x: number; y: number },
    pxSize: { width: number; height: number },
    opts?: AdoptOptions
  ): AdoptedLeg | null;
  /**
   * Tear a tab page out of its container and onto THIS board, driven by the
   * press that started on its tab. Answers false when the board will not take
   * it, so the strip can leave the press alone.
   */
  tearOutMember(pageId: string, fromGroupId: string, ev: PointerEvent, plan: TearOutPlan): boolean;
  /**
   * Drag member section `id` by a press that did not go through this board's
   * tool (a tab container's strip is a DOM overlay): the board runs the move
   * from the pointer sequence itself. Answers false when it cannot.
   */
  dragMember(id: string, ev: PointerEvent): boolean;
  /** Start a MOVE of member section `id` from a press this board's tool routed here. */
  beginSlabMove?(id: string, ev: ToolPointerEvent): boolean;
}

/**
 * What a torn-out page becomes, decided by the dashboard handle (which owns
 * the specs and the registry) and carried out by the board it lands on. VS
 * Code's rule: a tab dragged out of its group makes a GROUP of its own — so
 * the board receives a new one-page tab container, not the bare page, and the
 * page keeps its tab.
 */
export interface TearOutPlan {
  /** The id the board will hold: the new one-page tab container around the page. */
  arrivingId: string;
  /** What the chip that follows the pointer says. */
  label: string;
  /** Pixel size to arrive at — the page plus the strip the new group needs. */
  size: { width: number; height: number };
  /**
   * The model and registry commands for a landing at `cell`/`rect` on
   * `boardId`. `move` creates the group, moves the page in and registers it;
   * `collapse` (possibly empty) removes the container the page left when it
   * was its last page — VS Code closes an empty group.
   */
  commands(
    cell: { x: number; y: number; w: number; h: number },
    rect: { x: number; y: number; width: number; height: number },
    boardId: string
  ): { move: Command[]; collapse: Command[] };
  /**
   * The tab containers the page may JOIN instead of forming a group of its
   * own — VS Code's editor dragged from one group into another. Every one it
   * may legally enter (not the container it left, none inside itself); the
   * board hit-tests them against the pointer, and a release over one joins.
   */
  joinTargets: string[];
  /** The tab index a release at this CLIENT point means for `targetId`: over the strip, between the tabs there; over the body, the end. */
  dropIndex(targetId: string, clientX: number, clientY: number): number;
  /** Paint (or, with null, clear) the insertion mark on `targetId`'s strip. */
  markDrop(targetId: string | null, index: number | null): void;
  /** The tab index a CLIENT point means along `targetId`'s strip — null when the point is not over that strip. */
  stripIndex(targetId: string, clientX: number, clientY: number, grace?: number): number | null;
  /** The strip's height on `targetId`, px — the band above its body. */
  stripHeight(targetId: string): number;
  /** The page itself and every board inside it — never a board the page can land on. */
  ownBoards: string[];
  /** The commands that REORDER the page to `index` along its own strip. Empty when nothing changes. */
  reorder(index: number): Command[];
  /**
   * The commands for joining `targetId` at `index`: the page becomes its tab
   * — and the active one — and the container it left closes when it was the
   * last page. No cell is taken on any board.
   */
  join(targetId: string, index: number, boardId: string): { move: Command[]; collapse: Command[] };
}


/**
 * A WIDGET dropped on a tab strip becomes a new tab there (a tab dropped on
 * one joins; a widget wraps into a page of its own first). The dashboard
 * handle owns the strips and the registry; the binder owns the gesture.
 */
export interface TabDropHooks {
  /**
   * The strip under a CLIENT point, and the tab index that point means along
   * it. `grace` widens ONE strip's box by that many pixels on every side —
   * the strip a drag is already aiming at keeps the hand through a small
   * overshoot, instead of handing it to the zone underneath on one pixel.
   */
  stripAt(clientX: number, clientY: number, grace?: { containerId: string; px: number }): { containerId: string; index: number } | null;
  /** Paint (or, with null, clear) the insertion mark on a strip. */
  markDrop(containerId: string | null, index: number | null): void;
  /**
   * Which tab slot a CLIENT x means along one named strip — the x alone, with
   * no hit test. The binder decides WHETHER the hand is on a strip from the
   * container's own frame (the model), because a strip element that is gliding
   * — home after a push, or away under one — reports a box the hand is not in
   * yet. Optional: a host with its own hooks and no such method keeps the
   * live hit test for everything.
   */
  tabIndexAt?(containerId: string, clientX: number): number | null;
  /** The commands that make `widgetId` a new tab of `containerId` at `index`; `displaced` are this board's survivors. Empty = refused. */
  dropIntoStrip(widgetId: string, containerId: string, index: number, sourceBoardId: string, displaced: Command[]): Command[];
}

export interface AdoptOptions {
  /**
   * 'shrink': take the cell under the pointer at the height that FITS there
   * (down to TEAR_OUT_MIN_ROWS) before looking for another row — a torn-out
   * page takes the room where it lands, the way a torn-out editor does. The
   * default keeps the tile's size and finds the nearest cell that takes it.
   */
  fit?: 'shrink';
  /** Anchor the tile's TOP edge at the pointer instead of centring it (the pointer holds a tab, the page hangs below it). */
  anchor?: 'top';
  /** Enter WITH INTENT: the tile takes the cell under the hand and pushes the solid tiles there (D2 — a section this board holds refused it). */
  push?: boolean;
  /** Enter BESIDE a container of this board: the container gives way, the tile takes the band's side at the pointer's row. */
  beside?: { containerId: string; side: BesideSide };
}

export interface AdoptedLeg {
  groupId: string;
  /** Drive the target engine from the source binder's pointer stream. `push`: the tile means it — solid tiles under the wanted cell are pushed (D2). */
  move(world: { x: number; y: number }, opts?: { push?: boolean }): void;
  /** Put the tile BESIDE `containerId` on this board, at the row under `world` — the container shifts or the tiles behind it are pushed; a repeat at the same row is a no-op. */
  beside(containerId: string, side: BesideSide, world: { x: number; y: number }): void;
  /** The beside this board holds for the tile, for the zone resolve's stickiness: the container's frame at rest and the cell the tile took — null when none. */
  besideState(): { containerId: string; side: BesideSide; frame0: WorldRect; vacated: WorldRect } | null;
  /**
   * Take the tile OFF the board while the pointer is somewhere the board is
   * not the target (over a group the page will join instead); the tiles it
   * displaced come home. `enter` puts it back at the pointer.
   */
  leave(): void;
  enter(world: { x: number; y: number }): void;
  /** Put the tile at a PRESCRIBED cell (a split's half, a docking band): sized to it, unlocked tiles pushed. Answers whether it sits there. */
  place(cell: { x: number; y: number; w: number; h: number }, pushSolid?: boolean): boolean;
  /** Every other tile's cell before the ghost entered — the layout a row insert translates. */
  baseline(): Map<string, CellRect>;
  /** Where the tile sits right now, or null while it is off the board. */
  cell(): CellRect | null;
  /** That cell in world space, by the adopting board's own geometry. */
  rect(): WorldRect | null;
  /** Undo the adoption: target board back to its pre-entry layout. */
  abort(): void;
  /**
   * Close the leg for commit: the target board's displaced commands (widgets
   * and sections alike), the tile's final cell and its projected rect. Null
   * when the tile is somehow gone.
   */
  finalize(): { commands: Command[]; cell: CellRect; rect: WorldRect } | null;
}

/**
 * Binders on the same canvas find each other here. A WeakMap: a canvas that
 * is gone takes its (empty) peer set with it — the strong Map it replaced kept
 * every container element a dashboard had ever mounted for the life of the
 * page (review D12).
 */
const BOARD_REGISTRY = new WeakMap<HTMLElement, Set<BinderPeer>>();
/** A widget carries no boards: nothing for the zone walk to refuse as its own descendant. */
const EMPTY_SUBTREE: ReadonlySet<string> = new Set();

/**
 * Register a board that is NOT a grid (the split binder on a container) as a
 * peer on its canvas, so the parent grid's hitTest defers a press on one of
 * its tiles to it ("a press on a tile that belongs to a NESTED board must
 * reach that board's tool") whatever the registration order. Returns the
 * unregister. A split board adopts nothing and grows no slab: its `adopt`
 * answers null and `resizeMemberBy` answers unchanged.
 */
/** The board on the canvas that holds `groupId` as a member — a nested board's parent. */
export function parentPeerOf(container: HTMLElement, groupId: string): BinderPeer | null {
  for (const p of BOARD_REGISTRY.get(container) ?? []) if (p.group.id !== groupId && p.hasItem(groupId)) return p;
  return null;
}

/** Clear the selection on every OTHER board of the canvas — one selection per canvas. */
export function clearOtherSelections(container: HTMLElement, self: BinderPeer | null): void {
  for (const p of BOARD_REGISTRY.get(container) ?? []) if (p !== self) p.clearSelection?.();
}

export function registerBoardPeer(container: HTMLElement, peer: BinderPeer): () => void {
  let set = BOARD_REGISTRY.get(container);
  if (!set) {
    set = new Set();
    BOARD_REGISTRY.set(container, set);
  }
  set.add(peer);
  const s = set;
  return () => {
    s.delete(peer);
  };
}
export type { BinderPeer };

/**
 * Undoable cell+frame write for a GROUP member (the strip's slab). The engine
 * has Move/Resize commands for nodes but none for a group's frame, and slab
 * cells live in group metadata — this closes nested height escalation into
 * the gesture's single BatchCommand so one undo restores the strip too.
 */

interface GestureState {
  kind: 'move' | 'resize' | 'palette';
  id: string;
  /**
   * What the hand holds (tile first, step 4b-ii): a WIDGET of this board (or a
   * palette node), or a member GROUP — a section by its caption band, a tab
   * container by its strip's empty space or its frame margin. A group takes
   * the same path as a widget: the zone walk, a leg on another board, beside,
   * the refused push — with intent, since a group moved by hand pushes what
   * stands in its way (0.4.44).
   */
  subject: 'node' | 'group';
  /** The node for a 'node' subject, the group for a 'group' subject. */
  entity: NodeModel | GroupModel;
  pointerId: number | null;
  started: boolean;
  downClient: { x: number; y: number };
  downWorld: { x: number; y: number };
  grab: { dx: number; dy: number };
  startCells: Map<string, CellRect>;
  startGeom: Map<string, GeomSnapshot>;
  startSize: { width: number; height: number };
  /** The tile's rect origin at press — the anchor a resize rebuilds from. */
  startPos: { x: number; y: number };
  /** Which edges a RESIZE moves (the corner handle is s+e; s+w on RTL). */
  edges: ResizeEdges;
  spans: { w: number; h: number };
  /** Drag-out: the item is currently absent from the engine. */
  removedFromBoard: boolean;
  /** The board whose adoption refused this tile: the widget then pushes that board's container on ITS parent (D2) instead of asking again every move. */
  refusedPeer?: BinderPeer | null;
  /** Live cross-container adoption, when the pointer is over another board. */
  leg: { peer: BinderPeer; adopted: AdoptedLeg } | null;
  /** The tab strip under the pointer, when a release would make this widget a new tab there. */
  strip: { containerId: string; index: number } | null;
  /** Last pointer position, world coords — release semantics depend on WHERE. */
  lastWorld: { x: number; y: number } | null;
  /** Last pointer position, screen coords (for the removeZone test). */
  lastScreen: { x: number; y: number } | null;
  /** The ghost's host element, cached for the same-event style fast-path. */
  hostEl: HTMLElement | null;
  /** Nested height escalation: net rows added to OUR group in the parent. */
  esc: {
    peer: BinderPeer;
    rowsAdded: number;
    cellBefore: CellRect;
    frameBefore: WorldRect;
    cellAfter: CellRect;
    frameAfter: WorldRect;
  } | null;
  chip: HTMLElement | null;
}

const DRAG_THRESHOLD = 4;
/**
 * THE STRIP KEEPS THE HAND IT HAS (CSS px). A tab strip is ~30 px tall and
 * the zone right under it moves the whole container out of the way, so at the
 * seam a wobble of a pixel or two toggled a 90-px animated push — the user,
 * aiming a widget at the tabs: "it's switching so fast between having it above
 * the entire tab group or inside as a tab". Once a drag is over a strip, that
 * strip's box counts as this much larger until the hand really leaves. A strip
 * the drag has NOT reached gets no extra room: it never grows under the hand.
 */
export const STRIP_STAY = 9;
/** The node a gesture holds — node-only paths (the pixel ghost, a resize, a strip drop, a removal) ask through this. */
const nodeOf = (g: GestureState): NodeModel => g.entity as NodeModel;
let binderSeq = 0;

export function bindDashboardGrid(
  api: DashboardGridApi,
  group: GroupModel,
  options: DashboardGridOptions = {}
): DashboardGridHandle {
  ensureDashboardKitStyles();

  const diagram = api.getModel();
  /** The DECLARED count — the board's authored width, and the responsive cap. */
  const maxColumns = options.columns ?? 12;
  /** The LIVE count. Responsive width evaluation and `setColumns` move it. */
  let columns = maxColumns;
  let rtl = options.rtl === true;
  const responsive = options.responsive;
  /** An explicit `setColumns` pins the count and stops width evaluation. */
  let responsivePinned = false;
  const gap = options.gap ?? 12;
  const padding = options.padding ?? gap;
  const baseRowHeight = options.baseRowHeight ?? 110;
  const minRowHeight = options.minRowHeight ?? 28;
  const squeeze = options.squeeze !== false;
  let float = options.float ?? false;
  /**
   * The AUTHORED bound — a nested section's design (row-first push,
   * escalation) — and the LIVE bound the gestures respect. A section that
   * escalation grew holds more rows than its design; the live bound follows
   * the members' extent on every rebuild (reload, undo, refresh), and a shrink
   * never takes the section below `designRows`.
   */
  const designRows = options.maxRows;
  let maxRows = options.maxRows;
  const extentOf = (items: readonly GridPackItem[]): number => items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  const liveBound = (items: readonly GridPackItem[]): number | undefined =>
    designRows === undefined ? undefined : Math.max(designRows, extentOf(items));
  /** May a pull past the bound grow the slab in the parent? `false` = the pane is the bound. */
  const escalate = options.escalate !== false;
  const dragOut = options.dragOut ?? 'cancel';
  const wantHandles = options.resizeHandles !== false;
  const fluid = options.fluid === true;
  const overflow = options.overflow ?? 'bounded';
  let isStatic = options.static === true;
  /** The deepest board a drop may enter — a root is 0. Unbounded unless asked for: three-level drops are in the specs today (tile first, step 2). */
  const nesting = options.nesting ?? Number.POSITIVE_INFINITY;
  let dragHandle: DragHandleOption = normalizeDragHandle(options.dragHandle);
  let dragSel = dragHandleSelector(dragHandle);
  api.container.classList.toggle(DRAG_HANDLE_CLASS, dragHandle === true);
  /** The member the ROVING TABINDEX rests on (one tab stop per board). */
  let focusedId: string | undefined;
  const live = liveRegionFor(api.container);
  /** The design height. Fluid boards re-read it from the container. */
  let designH = options.designHeight ?? group.size?.height ?? 0;
  /** Fit-mode CAPACITY in rows (see `overflow`). Undefined = unbounded. */
  let capacity: number | undefined;

  let sizing: 'fit' | 'grow' = options.sizing ?? 'fit';
  /**
   * A fresh engine holding `items` VERBATIM. The constructor add()s each item
   * and settles after every one, so in gravity mode a legal layout with a gap
   * — a tile dropped below free space, exactly what the placeholder promised —
   * was re-packed on every rebuild: refresh(), undo, and (since the kit follows
   * the history) every commit moved a tile the user had just placed. The
   * persisted cells are the truth; a rebuild must not edit them. Float while
   * constructing, then restore the real mode for everything that follows.
   *
   * `pack` is for the two moments gravity IS wanted: the first adoption of the
   * authored spec (a declared cell hovering over an empty row settles — the
   * kit's documented boot contract) and turning float off.
   */
  const engineFrom = (items: GridPackItem[], pack = false, at = columns): GridPackEngine => {
    maxRows = liveBound(items);
    const e = new GridPackEngine(items, { columns: at, float: pack ? float : true, maxRows, capacity });
    e.float = float;
    return e;
  };

  /** The effective row bound a gesture must respect: the strip's, else the fit capacity. */
  const bound = (): number | undefined => squeezeRoom ?? maxRows ?? capacity;
  /** Move the LIVE bound (the engine's too), the way escalation does. */
  const setLiveBound = (n: number | undefined): void => {
    maxRows = n;
    (engine as unknown as { maxRows?: number }).maxRows = n;
  };
  /**
   * Rows a SQUEEZE may use while a tile arrives by hand — the engine's bound
   * only. The binder's `maxRows` also sets the GEOMETRY (`rows()`), and
   * raising it to the room made every tile shrink to a 29-row grid the
   * moment the ghost entered; the rows must shrink only as far as the
   * content actually reaches.
   */
  let squeezeRoom: number | undefined;
  const setSqueeze = (n: number | undefined): void => {
    squeezeRoom = n;
    (engine as unknown as { maxRows?: number }).maxRows = n ?? maxRows;
  };
  /**
   * The rows a NESTED board's live frame holds at the row floor. A page's
   * height is its container's and a section's is its slab's, so a full one
   * cannot ask for room the way the main fit board does (`fitCapacity` reads
   * the design height, which a nested board hands to its parent as 0).
   */
  const elasticRows = (): number | undefined => {
    if (designRows === undefined) return undefined;
    const fh = frame().height;
    if (fh <= 0) return undefined;
    return Math.max(1, Math.floor((fh - 2 * padding + gap) / (minRowHeight + gap)));
  };

  /**
   * The rows the design height can hold at the row floor — what 'bounded' fit
   * enforces. A board is never bounded BELOW what it already holds: a document
   * loaded with more rows than fit keeps every tile (the frame extends, see
   * enforceBoardHeight) and only further growth is refused.
   */
  const fitCapacity = (): number | undefined => {
    if (maxRows !== undefined || sizing !== 'fit' || overflow === 'scroll' || designH <= 0) return undefined;
    // Elastic (default): rows at the floor. Frozen (`squeeze: false`): rows at
    // the height they have NOW, so a gesture never shrinks a neighbour.
    const floor = squeeze ? minRowHeight : Math.max(minRowHeight, rowHeightFor(geom(), rows()));
    const rowsThatFit = Math.floor((designH - 2 * padding + gap) / (floor + gap));
    return Math.max(1, rowsThatFit, engine.rows());
  };

  /** Re-derive the capacity; true when the engine must be rebuilt to carry it. */
  const refreshCapacity = (): boolean => {
    const next = fitCapacity();
    if (next === capacity) return false;
    capacity = next;
    return true;
  };

  /** The canvas container's CSS-pixel box (0 when unmeasurable, e.g. jsdom). */
  const containerBox = (): { w: number; h: number } => ({
    w: api.container.clientWidth || 0,
    h: api.container.clientHeight || 0,
  });

  /**
   * FLUID: make the group's frame the container's box. Width always; the
   * design height follows too, so fit capacity follows the viewport (a shorter
   * window holds fewer rows) and grow never shrinks below the visible area.
   * Returns true when the frame changed. A container that cannot be measured
   * (width 0) leaves the authored frame alone.
   */
  const applyFluidFrame = (): boolean => {
    if (!fluid || disposed) return false;
    const box = containerBox();
    if (box.w <= 0) return false;
    if (box.h > 0) designH = box.h;
    const f = frame();
    const height = sizing === 'fit' && box.h > 0 ? box.h : f.height;
    if (Math.abs(f.width - box.w) < 0.5 && Math.abs(f.height - height) < 0.5) return false;
    writing = true;
    try {
      diagram.runSystemWrite(() => group.setFrame({ x: f.x, y: f.y, width: box.w, height }));
    } finally {
      writing = false;
    }
    return true;
  };

  /**
   * THE PERSISTED COLUMN CACHE (D4). `toJSON()` always saved the wide layout —
   * it reads the engine's widest cached count. The DOCUMENT path read the
   * node's GridItemConfig, and a responsive column change writes the live,
   * NARROW cells into exactly that field: a board saved on a phone reloaded as
   * 1-wide tiles crammed into the left of a 12-column board, because the cache
   * that knew better lived only in this closure. It now rides on the group as
   * `dashboardLayouts` — the cache as plain data plus the live count the
   * GridItemConfigs belong to — and `rebuild()` reads it back on a fresh bind.
   * Written only when there is a cache, so a board that never changed column
   * count serialises exactly as before.
   */
  const persistLayouts = (): void => {
    if (disposed || engine.cachedColumns().length === 0) return;
    writing = true;
    try {
      diagram.runSystemWrite(() =>
        group.setMetadata('dashboardLayouts', { columns: engine.columns, layouts: engine.getLayouts() })
      );
    } finally {
      writing = false;
    }
  };
  let engine = engineFrom([]);
  let gesture: GestureState | null = null;
  let disposed = false;
  /** Reentrancy guard: our own derived frame writes must not re-project. */
  let writing = false;
  /** Foreign tile currently adopted from another binder's gesture. */
  let adoptedGhostId: string | null = null;
  /** The tab page this board is currently tearing out of a container, if any. */
  let tearing: string | null = null;

  /**
   * OUR OWN CAPTION RESERVE: a section carrying a caption gives the band's
   * pixels up at the top of its frame, so no child may take them — and the
   * band is outside `containsWorld`, so a press on it is the PARENT's (it
   * selects the section) rather than an empty press of this board.
   */
  const ownReserve = (): number => sectionCaptionReserve(diagram, group, isStatic);
  const frame = (): WorldRect => {
    const r = ownReserve();
    return {
      x: group.position.x,
      y: group.position.y + r,
      width: group.size?.width ?? 0,
      height: Math.max(0, (group.size?.height ?? 0) - r),
    };
  };

  /** Entity size with GroupModel's optionality flattened away. */
  const sizeOf = (e: {
    size?: { width: number; height: number; depth?: number };
  }): { width: number; height: number; depth?: number } =>
    e.size ?? { width: 0, height: 0 };

  /** Mapping geometry. 'fit' derives row height from the LIVE frame height
   *  (which `enforceBoardHeight` pins to the design height), so an externally
   *  resized board still fits itself. */
  const geom = (): DashboardGridGeometry => ({
    columns,
    gap,
    padding,
    sizing,
    baseRowHeight,
    // BOUNDED FIT NEVER SCROLLS: the floor is a capacity for growth, not a
    // reason to paint past the frame. A board already holding more rows than
    // fit (a Grow→Fit switch, a loaded document) squeezes below it instead.
    minRowHeight: sizing === 'fit' && overflow !== 'scroll' ? 1 : minRowHeight,
    designHeight: sizing === 'fit' ? frame().height : designH,
    rtl,
  });

  /**
   * The rows the board is laid out in. A BOUNDED board (a section) keeps its
   * bound's rows even when its content ends higher — empty rows stay empty
   * rows, as in gridstack — instead of stretching the rest to fill the slab:
   * that stretch made a tile pulled shorter shrink FASTER than the pointer
   * (each row it gave up made the remaining rows taller, so the same pixel
   * height quantised to fewer rows on the next move — kit lab L37).
   */
  const rows = (): number => Math.max(1, engine.rows(), maxRows ?? 0);

  const htmlLayer = (): HTMLElement | null => api.container.querySelector('.grafloria-html-layer');

  const hostOf = (id: string): HTMLElement | null => {
    const esc =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    return api.container.querySelector(`.grafloria-node-host[data-node-id="${esc}"]`);
  };

  const memberEntity = (id: string): NodeModel | GroupModel | undefined =>
    diagram.getNode(id) ?? diagram.getGroup(id);

  const isGroupMember = (id: string): boolean => !diagram.getNode(id) && !!diagram.getGroup(id);

  // -- cells <-> members -----------------------------------------------------

  /** The engine item a member should enter as (cells from GridItemConfig /
   *  group metadata; spans falling back to metadata columnSpan/rowSpan; last
   *  resort: adopt from the current pixel geometry). */
  /**
   * A SECTION's floor: its nested board's live rows (the peer), else the rows
   * it was mounted with — a section resized by hand never squeezes its
   * children below their cells.
   */
  const innerRowsOf = (id: string): number => {
    for (const p of BOARD_REGISTRY.get(api.container) ?? []) if (p.group.id === id && p.innerRows) return Math.max(1, p.innerRows());
    const meta = diagram.getGroup(id)?.getMetadata?.('containerWidget') as { maxRows?: number } | undefined;
    return Math.max(1, meta?.maxRows ?? 1);
  };

  const itemFor = (id: string): GridPackItem => {
    const node = diagram.getNode(id);
    if (node) {
      const spanMeta = Number(node.getMetadata?.('columnSpan')) || 0;
      const rowsMeta = Number(node.getMetadata?.('rowSpan')) || 0;
      const locked = node.state?.locked === true;
      // Per-widget size limits ride on the node as `widgetLimits` and reach the
      // engine as gridstack's minW/maxW/minH/maxH.
      const lim = (node.getMetadata?.('widgetLimits') ?? {}) as {
        minSpan?: number;
        maxSpan?: number;
        minRows?: number;
        maxRows?: number;
      };
      const limits = {
        ...(lim.minSpan !== undefined ? { minW: lim.minSpan } : {}),
        ...(lim.maxSpan !== undefined ? { maxW: lim.maxSpan } : {}),
        ...(lim.minRows !== undefined ? { minH: lim.minRows } : {}),
        ...(lim.maxRows !== undefined ? { maxH: lim.maxRows } : {}),
      };
      const cell = cellFromGridItem(node.getGridItem?.(), {
        w: spanMeta || 1,
        h: rowsMeta || 1,
      });
      if (cell) return { id, ...cell, locked, ...limits };
      const f = frame();
      const g = geom();
      if (node.position && (node.position.x !== 0 || node.position.y !== 0)) {
        // First adoption from pixels: where the tile already sits. The SPAN is
        // resolved first because the mirrored (RTL) mapping needs it to turn a
        // left edge into a cell.
        const s = sizeToSpan(node.size.width, node.size.height, f, g, rows());
        const p = pointToCell(node.position.x, node.position.y, f, g, rows(), spanMeta || s.w);
        return {
          id,
          x: Math.max(0, p.x),
          y: Math.max(0, p.y),
          w: spanMeta || s.w,
          h: rowsMeta || s.h,
          locked,
          ...limits,
        };
      }
      return { id, x: 0, y: 0, w: spanMeta || 1, h: rowsMeta || 1, locked, autoPosition: true, ...limits };
    }
    const grp = diagram.getGroup(id);
    const cell = grp
      ? cellFromGridItem(grp.getMetadata?.('gridItem') as GridItemConfig | undefined)
      : null;
    // A member group is a SOLID tile (tile first, step 3): a widget carried
    // over it slides aside and it never packs — the board under the hand
    // holds still, so its zones (into, a tab, beside) stay reachable — and
    // it is moved by INTENT: placed beside, pushed by a moved section, a
    // dock or a widget it refused, moved by its own gesture.
    if (cell) return { id, ...cell, solid: true };
    return { id, x: 0, y: 0, w: columns, h: 1, solid: true, autoPosition: true };
  };

  /** Persist adopted cells so save/undo round-trips them. */
  const persistAdoptedCell = (id: string, item: GridPackItem): void => {
    const cell = { x: item.x, y: item.y, w: item.w, h: item.h };
    const node = diagram.getNode(id);
    if (node) {
      if (!cellFromGridItem(node.getGridItem?.())) node.setGridItem(gridItemFromCell(cell));
      return;
    }
    const grp = diagram.getGroup(id);
    if (grp && !cellFromGridItem(grp.getMetadata?.('gridItem') as GridItemConfig | undefined)) {
      grp.setMetadata('gridItem', gridItemFromCell(cell));
    }
  };

  // -- the board, as its modules see it (tile first, step 4b-i) --------------

  const ctx: BoardCtx = {
    api,
    group,
    diagram,
    options,
    gap,
    padding,
    baseRowHeight,
    minRowHeight,
    overflow,
    engine: () => engine,
    frame,
    geom,
    rows,
    sizing: () => sizing,
    designH: () => designH,
    rtl: () => rtl,
    isStatic: () => isStatic,
    disposed: () => disposed,
    htmlLayer,
    hostOf,
    memberEntity,
    sizeOf,
    // A NODE ghost follows the hand by pixels and gets the placeholder; a GROUP ghost (a container adopted here) is projected to its cell like any tile, carried.
    ghostId: () => (adoptedGhostId && !diagram.getGroup(adoptedGhostId) ? adoptedGhostId : gesture?.started && gesture.subject === 'node' ? gesture.id : null),
    write: (fn) => {
      writing = true;
      try {
        fn();
      } finally {
        writing = false;
      }
    },
  };

  // -- projection: cells -> pixels (project.ts) ------------------------------

  const projection = createProjection(ctx, { afterProject: () => syncSlabs() });
  const { writeRect, enforceBoardHeight, project, syncPlaceholder, hidePlaceholder, armGlide, disarmGlideSoon, flushGhost, setGhost } = projection;

  // -- chrome: slabs, frames, captions, handles, cursors (chrome.ts) ---------

  const chrome = createChrome(ctx, {
    selectedId: () => selectedId,
    syncA11y: (only) => syncA11y(only),
    grabbing: () => !!slabGesture,
    gestureRunning: () => !!gesture,
    memberGroupAt: (x, y) => memberGroupAt(x, y),
    slabEdgesNear: (grp, x, y) => slabEdgesNear(grp, x, y),
    dragHandle: () => dragHandle,
    wantHandles,
  });
  const { syncSlabs, syncHandles, setCarried, flushCarried, showRefusal, ensureStaticGuard } = chrome;

  // -- resize handles ---------------------------------------------------------

  /** The accessible name of a widget: its title, else its kind, else its id. */
  const nameOf = (node: NodeModel): string => {
    const title = node.getMetadata?.('widgetTitle');
    if (typeof title === 'string' && title) return title;
    // The visible header falls back to a data label (a KPI's `label`) before
    // the kind — the spoken name must agree with what is painted.
    const label = (node.getMetadata?.('widgetSpec') as { label?: unknown } | undefined)?.label;
    if (typeof label === 'string' && label) return label;
    const kind = node.getMetadata?.('widgetKind');
    return typeof kind === 'string' && kind && kind !== 'widget' ? `${kind} widget` : node.id;
  };

  /**
   * ACCESSIBLE CHROME on every member host (WCAG 4.1.2 name/role/value): a
   * group role, a widget role description, a label that carries the cell,
   * and the ROVING TABINDEX — exactly one member per board is a tab stop.
   * Runs with the handles, so a repainted host gets it back too.
   */
  /**
   * THE SELECTED WIDGET — the one a press or keyboard focus last landed on.
   * Stamped on its host as `axdb-selected`; that is what shows the painted
   * grip (the DevExpress designer shows an item's bar on the selected item
   * only). A press on a member selects it even when it starts no gesture; a
   * void click clears it. Distinct from the roving tab stop, which must stay.
   */
  let selectedId: string | undefined;
  const selectWidget = (id: string | undefined): void => {
    if (id !== undefined) clearOtherSelections(api.container, selfPeerRef);
    if (id === selectedId) return;
    selectedId = id;
    syncA11y();
    syncSlabs();
    options.onSelect?.(id);
  };
  /** Set once the peer object exists (below); `selectWidget` runs before that only on boot. */
  let selfPeerRef: BinderPeer | null = null;

  const syncA11y = (only?: ReadonlySet<string>): void => {
    if (disposed) return;
    const members = [...(group.members ?? [])].filter((id) => !!diagram.getNode(id));
    if (focusedId && !members.includes(focusedId)) focusedId = undefined;
    // A selected SECTION is a group member, not a node: keep it as long as it is a member.
    if (selectedId && !members.includes(selectedId) && !(group.members?.has(selectedId) && memberEntity(selectedId))) selectedId = undefined;
    const stop = focusedId ?? members[0];
    for (const id of members) {
      if (only && !only.has(id)) continue;
      const node = diagram.getNode(id);
      const host = hostOf(id);
      if (!node || !host) continue;
      const cell = engine.getItem(id);
      const bits = [nameOf(node)];
      if (cell) bits.push(describeCell(cell));
      if (node.state?.locked === true) bits.push('pinned');
      host.setAttribute('role', 'group');
      host.setAttribute('aria-roledescription', 'dashboard widget');
      host.setAttribute('aria-label', bits.join(', '));
      host.setAttribute('tabindex', id === stop ? '0' : '-1');
      host.classList.toggle('axdb-selected', id === selectedId);
    }
  };

  // -- gesture snapshot / commit ---------------------------------------------

  const snapshotAll = (): { cells: Map<string, CellRect>; geoms: Map<string, GeomSnapshot> } => {
    const cells = new Map<string, CellRect>();
    const geoms = new Map<string, GeomSnapshot>();
    for (const item of engine.getItems()) {
      cells.set(item.id, { x: item.x, y: item.y, w: item.w, h: item.h });
      const e = memberEntity(item.id);
      if (e) {
        const es = sizeOf(e);
        geoms.set(item.id, {
          pos: { x: e.position.x, y: e.position.y },
          size: { width: es.width, height: es.height, depth: es.depth },
        });
      }
    }
    return { cells, geoms };
  };

  const deltasSince = (
    startCells: Map<string, CellRect>,
    startGeom: Map<string, GeomSnapshot>,
    excludeId?: string
  ): TileDelta[] => {
    const out: TileDelta[] = [];
    for (const item of engine.getItems()) {
      if (item.id === excludeId) continue;
      const before = startCells.get(item.id);
      const geomBefore = startGeom.get(item.id);
      const e = memberEntity(item.id);
      if (!before || !geomBefore || !e) continue; // items added mid-gesture commit separately
      out.push({
        id: item.id,
        locked: !!item.locked,
        isGroup: isGroupMember(item.id),
        cellBefore: before,
        cellAfter: { x: item.x, y: item.y, w: item.w, h: item.h },
        posBefore: geomBefore.pos,
        posAfter: { x: e.position.x, y: e.position.y },
        sizeBefore: geomBefore.size,
        sizeAfter: (({ width, height, depth }) => ({ width, height, depth }))(sizeOf(e)),
      });
    }
    return out;
  };

  const execute = (name: string, commands: Command[]): boolean => {
    if (commands.length === 0) return false;
    void api.getEngine().commandManager.execute(new BatchCommand(name, commands));
    return true;
  };

  // -- membership + bounds sync ----------------------------------------------

  /**
   * A DROP LEAVES ITS TILE IN THE ENGINE, waiting for the member the commit
   * adds under the same id — or, for a palette drop, for whatever the host's
   * command adds: a host that mints its own id would otherwise leave the
   * ghost behind as a phantom holding the cell. The next member to arrive
   * claims the phantom's place: the same id simply takes it over, another id
   * removes it first and lands where the drop settled.
   */
  let pendingDrop: string | null = null;
  const onMemberAdded = (id: string): void => {
    if (disposed) return;
    // The cell a waiting tile held for an arriving member of ANOTHER id. The
    // removal settles the board — the tiles the drop pushed float back into
    // the hole — so the member cannot simply be added there: it collided and
    // auto-positioned to the left edge (Quantia's "lands on the cell it was
    // aimed at"). It enters at the bottom edge instead and takes the cell
    // gatelessly, pushing them down again, all inside this one call.
    let claim: { x: number; y: number } | null = null;
    if (pendingDrop && pendingDrop !== id) {
      const ph = engine.getItem(pendingDrop);
      if (ph && !(group.members ?? new Set<string>()).has(pendingDrop)) {
        claim = { x: ph.x, y: ph.y };
        engine.remove(pendingDrop);
      }
    }
    pendingDrop = null;
    if (!engine.getItem(id)) {
      const item = itemFor(id);
      let placed = claim ? engine.add({ ...item, x: 0, y: engine.rows(), autoPosition: false }) : engine.add(item);
      if (placed && claim) {
        engine.moveCheck(id, claim.x, claim.y, { gate: false, pushSolid: !!placed.solid });
        placed = engine.getItem(id) ?? placed;
      }
      if (!placed && capacity !== undefined) {
        // Membership is a document fact (an undo just restored it, say); a
        // bounded board must not strand the node invisible. Lift the capacity
        // for this adoption — it floors at the content on the next refresh.
        capacity = undefined;
        engine = engineFrom([...engine.getItems().map((i) => ({ ...i })), item]);
        placed = engine.getItem(id) ?? null;
        refreshCapacity();
      }
      if (placed) persistAdoptedCell(id, placed);
    }
    project();
    syncHandles();
    api.render();
  };

  const onMemberRemoved = (id: string): void => {
    if (disposed) return;
    if (gesture && gesture.id === id) cancelActiveGesture(false);
    if (!engine.getItem(id)) return;
    engine.remove(id);
    // THE LIVE BOUND FOLLOWS THE MEMBERS. A board that took rows from its
    // parent to hold an arrival (D4) keeps that bound while the tile is here;
    // when the tile leaves — an undo of the drop, a removal — the bound goes
    // back to what the remaining tiles need, or the board stays a row taller
    // than anything in it.
    if (designRows !== undefined) setLiveBound(liveBound(engine.getItems()));
    project();
    api.render();
  };

  const onBoundsChanged = (): void => {
    if (disposed || writing) return;
    if (evaluateResponsive()) return; // a column change already re-projected
    project();
    api.render();
  };

  // -- responsive column count -----------------------------------------------

  /**
   * The column count this board's CURRENT WIDTH asks for. Breakpoints win when
   * given (first step, ascending, whose `w` is at least the board width);
   * otherwise `columnWidth` divides the width. Both clamp to `[1, columnMax]`.
   */
  const columnsForWidth = (width: number): { c: number; layout?: GridColumnLayout } | null => {
    if (!responsive) return null;
    const max = Math.max(1, responsive.columnMax ?? maxColumns);
    if (responsive.breakpoints?.length) {
      const steps = [...responsive.breakpoints].sort((a, b) => a.w - b.w);
      const hit = steps.find((s) => width <= s.w);
      const c = hit ? hit.c : max;
      return { c: Math.max(1, Math.min(max, c)), layout: hit?.layout ?? responsive.layout };
    }
    if (responsive.columnWidth && responsive.columnWidth > 0) {
      const c = Math.round(width / responsive.columnWidth);
      return { c: Math.max(1, Math.min(max, c)), layout: responsive.layout };
    }
    return null;
  };

  /**
   * Re-derive the column count from the board width and apply it. Returns true
   * when the count actually changed (the caller then skips its own project(),
   * because applyColumns already re-projected everything).
   */
  const evaluateResponsive = (): boolean => {
    if (!responsive || responsivePinned || disposed || gesture) return false;
    const want = columnsForWidth(frame().width);
    if (!want || want.c === columns) return false;
    return applyColumns(want.c, want.layout ?? responsive.layout ?? 'moveScale');
  };

  /**
   * Cells written by a column change are DERIVED STATE, not an edit: they go
   * through `runSystemWrite` exactly like the pixel projection does, never
   * through the command stack. A browser resize must not be undoable, and the
   * authored layout is safe regardless — the engine's cache still holds it,
   * and `saveLayout()` serialises from the widest cached count.
   */
  const persistLiveCells = (): void => {
    writing = true;
    try {
      diagram.runSystemWrite(() => {
        for (const item of engine.getItems()) {
          const cell = { x: item.x, y: item.y, w: item.w, h: item.h };
          const node = diagram.getNode(item.id);
          if (node) {
            node.setGridItem(gridItemFromCell(cell));
            continue;
          }
          diagram.getGroup(item.id)?.setMetadata('gridItem', gridItemFromCell(cell));
        }
      });
    } finally {
      writing = false;
    }
    syncSlabs();
  };

  const applyColumns = (n: number, layout: GridColumnLayout): boolean => {
    const prev = columns;
    if (!engine.setColumns(n, layout)) return false;
    columns = engine.columns;
    persistLiveCells();
    persistLayouts();
    armGlide();
    project();
    syncPlaceholder();
    disarmGlideSoon();
    api.renderNow();
    options.onColumnsChange?.(columns, prev);
    return true;
  };

  /**
   * The canvas container resizing is the OTHER trigger for re-evaluation: a
   * page that sizes its boards from the viewport changes the frame in the same
   * turn, and a page that does not still wants the check to run. The binder
   * owns this — pages should never have to wire a ResizeObserver for it.
   */
  const containerObserver =
    (responsive || fluid) && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (disposed) return;
          if (applyFluidFrame()) {
            if (refreshCapacity()) rebuild(false);
            else project();
            api.renderNow();
          }
          evaluateResponsive();
        })
      : null;

  // -- board hit-testing ------------------------------------------------------

  const boardVisualHeight = (): number => {
    const f = frame();
    const g = geom();
    return Math.max(f.height, 2 * padding + rows() * (rowHeightFor(g, rows()) + gap) - gap);
  };

  const worldInsideBoard = (x: number, y: number): boolean => {
    const f = frame();
    return x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + boardVisualHeight();
  };

  /** Small overshoots CLAMP onto the board instead of counting as off-board —
   *  the plan prototype cannot leave its board at all (cells clamp at the
   *  edges), so a 60px slip past the frame must not dim or delete. */
  /** A point inside a member group's own frame (its strip and its pages). */
  const worldInsideGroup = (g: GroupModel, x: number, y: number): boolean => {
    const s = sizeOf(g);
    return x >= g.position.x && x <= g.position.x + s.width && y >= g.position.y && y <= g.position.y + s.height;
  };
  const worldInsideBoardGrace = (x: number, y: number): boolean => {
    if (worldInsideBoardExtended(x, y)) return true;
    const f = frame();
    const band = rowHeightFor(geom(), rows()) + gap;
    return (
      x >= f.x - EDGE_GRACE &&
      x <= f.x + f.width + EDGE_GRACE &&
      y >= f.y - EDGE_GRACE &&
      y <= f.y + boardVisualHeight() + band + EDGE_GRACE
    );
  };

  /** One extra row of grace below the frame (gridstack's extra drag row). */
  const worldInsideBoardExtended = (x: number, y: number): boolean => {
    if (worldInsideBoard(x, y)) return true;
    const f = frame();
    const band = rowHeightFor(geom(), rows()) + gap;
    return x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + boardVisualHeight() + band;
  };

  /** The member SECTION whose frame holds the world point, if any. */
  const memberGroupAt = (x: number, y: number): string | null => {
    for (const id of group.members ?? []) {
      const grp = diagram.getGroup(id);
      if (!grp) continue;
      const p = grp.position;
      const s = sizeOf(grp);
      if (x >= p.x && x <= p.x + s.width && y >= p.y && y <= p.y + s.height) return id;
    }
    return null;
  };
  /** Which of a section frame's edges a world point is within EDGE_GRIP of. */
  const slabEdgesNear = (grp: GroupModel, x: number, y: number, grip = edgeGripFor(grp)): ResizeEdges => {
    const p = grp.position;
    const s = sizeOf(grp);
    return { n: y - p.y <= grip, s: p.y + s.height - y <= grip, w: x - p.x <= grip, e: p.x + s.width - x <= grip };
  };

  /**
   * BESIDE (0.4.45): a WIDGET dragged onto a tab container's outer band — a
   * fifth of its body, the same bands a tab's split uses — lands next to it
   * on that side; the middle still goes INTO its page and the strip still
   * makes a tab. At the board's edge, where there is no room on that side,
   * the container shifts over by the widget's span and the widget takes the
   * edge: the fluid demo's side panel sits at the right edge, and "after it"
   * was nowhere (the user: "if the tab is at an edge I can't add something
   * after it").
   *
   * The container gives way LIVE, with the glide every pushed widget gets
   * (0.4.48): a group is a widget first, and its tab behaviours sit on top of
   * that default. 0.4.47 had frozen the hover behind an overlay, the way a
   * tab's split preview works, and the user missed the slide at once. What
   * his 3440-px frame had caught was the corner: the panel was pushed DOWN
   * as a widget crossed its top band on the way to its right — so the left
   * and right bands win the corners (VS Code's precedence): a one-row widget
   * carried along the top of a tall panel to its far right means "after it",
   * not "above it". The shift is undone if the pointer leaves the band.
   */
  /**
   * The beside the hand holds (tile first, step 3): the container's cell and
   * frame AT REST (the resolve reads the held container at rest), the cell
   * the widget took, and the row it took it at. The shift itself is the
   * engine's `placeBeside`; the sections it pushed remember their cells and
   * come back by themselves when the widget leaves (S2).
   */
  let beside: { id: string; side: BesideSide; from: { x: number; y: number }; frame0: WorldRect; vacated: { x: number; y: number }; row: number } | null = null;
  const endBeside = (restore: boolean): void => {
    if (!beside) return;
    const it = engine.getItem(beside.id);
    let moved = false;
    if (it && restore && (it.x !== beside.from.x || it.y !== beside.from.y)) moved = engine.moveCheck(beside.id, beside.from.x, beside.from.y, { gate: false }).changed;
    beside = null;
    // The frames the zone test reads are the MODEL's: a restore that moved
    // the container without projecting left its frame where the push had
    // put it (the user's 3440-px corner on 0.4.48).
    if (moved) project();
  };
  /** The row of this board's grid under a world y — where a beside lands (D3: the pointer's row, not the container's top). */
  const rowOfPoint = (y: number): number => {
    const r0 = cellToRect({ x: 0, y: 0, w: 1, h: 1 }, frame(), geom(), rows());
    const r1 = cellToRect({ x: 0, y: 1, w: 1, h: 1 }, frame(), geom(), rows());
    const pitch = Math.max(1, r1.y - r0.y);
    return Math.max(0, Math.floor((y - r0.y) / pitch));
  };
  /**
   * The ghost `id` (spanning `spans`) beside container `z.id` on THIS board at
   * `row`: the engine shifts the container or pushes what stands behind it,
   * and the beside is remembered for the resolve's stickiness. One function
   * for a tile of this board and for a tile another board's gesture placed
   * here through its leg.
   */
  const besideOn = (id: string, spans: { w: number; h: number }, z: { id: string; side: BesideSide }, row: number): void => {
    const tc = engine.getItem(z.id);
    if (!tc) return;
    if (beside && (beside.id !== z.id || beside.side !== z.side)) endBeside(true); // another container, or another side of it: from the rest layout
    if (!beside) {
      const grp0 = diagram.getGroup(z.id);
      beside = { id: z.id, side: z.side, from: { x: tc.x, y: tc.y }, frame0: grp0 ? frameOfGroup(grp0) : cellToRect({ x: tc.x, y: tc.y, w: tc.w, h: tc.h }, frame(), geom(), rows()), vacated: { x: tc.x, y: tc.y }, row };
    }
    const r = engine.placeBeside(id, z.id, z.side, row);
    const at = engine.getItem(id);
    if (r.changed && at) {
      beside.vacated = { x: at.x, y: at.y };
      beside.row = row;
    } else if (at) {
      // Refused (a bound): the widget goes where it can, as any refused cell does.
      placeNear(id, at.x, at.y, spans.w);
    }
    project();
  };
  const applyBeside = (g: GestureState, z: { id: string; side: BesideSide }, row: number): void => {
    if (!engine.getItem(z.id)) return;
    if (g.leg) {
      g.leg.adopted.abort();
      g.leg = null;
    }
    if (g.subject === 'group' && !g.removedFromBoard && !beside) {
      // A group ghost pushed its way here with intent: the containers it moved
      // come home (the engine's memory) before the beside is measured on them.
      engine.remove(g.id);
      g.removedFromBoard = true;
    }
    if (g.removedFromBoard) {
      g.removedFromBoard = false;
      setDim(g, false);
      engine.add({ id: g.id, x: 0, y: engine.rows(), w: g.spans.w, h: g.spans.h });
    }
    besideOn(g.id, g.spans, z, row);
  };
  const insideMemberGroupFrame = (x: number, y: number): boolean => {
    for (const id of group.members ?? []) {
      const grp = diagram.getGroup(id);
      if (!grp) continue;
      const p = grp.position;
      const s = sizeOf(grp);
      if (x >= p.x && x <= p.x + s.width && y >= p.y && y <= p.y + s.height) return true;
    }
    return false;
  };

  /**
   * A SECTION RESIZE — the slab's cell in this board follows the pointer,
   * edge by edge, through the engine; the nested board re-lays its children
   * out inside the new frame. Floored by the slab item's `minH` (the
   * children's rows). One undoable step: the displaced tiles plus the
   * section's cell and frame.
   */
  interface SlabGesture {
    id: string;
    edges: ResizeEdges;
    pointerId: number | null;
    started: boolean;
    downScreen: { x: number; y: number };
    startCells: Map<string, CellRect>;
    startGeom: Map<string, GeomSnapshot>;
    cellBefore: CellRect;
    frameBefore: WorldRect;
    /** Pointer-to-edge offset at press, so the pulled edge follows the pointer exactly. */
    grab: { dx: number; dy: number };
    /** A MOVE of the whole section (by its caption or its strip), not a resize. */
    move: boolean;
  }
  let slabGesture: SlabGesture | null = null;
  /** The gesture as it is NOW, for the same reason. */
  const currentGesture = (): GestureState | null => gesture;
  /** The PARENT running a resize of OUR section from a press this tool claimed. */
  let forwardSlab: BinderPeer | null = null;
  const frameOfGroup = (grp: GroupModel): WorldRect => ({ x: grp.position.x, y: grp.position.y, width: sizeOf(grp).width, height: sizeOf(grp).height });
  const beginSlabResize = (id: string, edges: ResizeEdges, ev: ToolPointerEvent): void => {
    const grp = diagram.getGroup(id);
    const it = engine.getItem(id);
    if (!grp || !it || gesture || slabGesture) return;
    engine.beginGesture();
    const snap = snapshotAll();
    slabGesture = {
      id,
      edges,
      pointerId: typeof PointerEvent !== 'undefined' && ev.source instanceof PointerEvent ? ev.source.pointerId : null,
      started: false,
      downScreen: { x: ev.screen.x, y: ev.screen.y },
      startCells: snap.cells,
      startGeom: snap.geoms,
      cellBefore: { x: it.x, y: it.y, w: it.w, h: it.h },
      frameBefore: frameOfGroup(grp),
      grab: {
        dx: edges.e ? grp.position.x + sizeOf(grp).width - ev.world.x : edges.w ? grp.position.x - ev.world.x : 0,
        dy: edges.s ? grp.position.y + sizeOf(grp).height - ev.world.y : edges.n ? grp.position.y - ev.world.y : 0,
      },
      move: false,
    };
    capturePointer(slabGesture.pointerId);
    api.container.style.cursor = cursorFor(edges);
  };
  /**
   * MOVE a section by its caption band, its strip's empty space or its frame
   * margin. A section is a LOCKED tile so that no WIDGET pushes it; for the
   * gesture's duration the moving tile is unlocked, and so are the OTHER
   * member groups (0.4.44): a moved section or group pushes the sections in
   * its way, the way a dock does. They used to stay locked against it too
   * (E4b), so the fluid demo's eight-row side panel, with the Operations
   * section spanning the row beneath it, had no legal column to its left —
   * the refusal tone at every cell, and the release moved nothing ("I can't
   * drag the tab group"). Every unlocked tile gets pushed the way a widget
   * pushes it; a group's children ride along: the frame moves, the nested
   * board re-projects. The others relock on release.
   */
  const beginSlabMove = (id: string, ev: ToolPointerEvent): void => {
    const grp = diagram.getGroup(id);
    const it = engine.getItem(id);
    if (!grp || !it || gesture || slabGesture || isStatic) return;
    // A GROUP MOVE IS A GESTURE OF THE ONE MACHINE (tile first, 4b-ii): the
    // same threshold, snapshot, zone walk, legs, beside and commit a widget
    // gets — the group being the subject. The frame follows its cell.
    //
    // THE PRESS ARMS NOTHING. `beginGestureVisuals` arms the glide when the
    // threshold is crossed, as it does for a widget: arming it here left a
    // plain CLICK on a caption band gliding for 400 ms, and everything the
    // page did next — a caption change, a layout switch — animated instead of
    // landing (the gallery's fluid-board: "and the rows are back" measured a
    // tile still travelling).
    gesture = {
      kind: 'move',
      id,
      subject: 'group',
      entity: grp,
      pointerId: typeof PointerEvent !== 'undefined' && ev.source instanceof PointerEvent ? ev.source.pointerId : null,
      started: false,
      downClient: { x: ev.screen.x, y: ev.screen.y },
      downWorld: { x: ev.world.x, y: ev.world.y },
      grab: { dx: ev.world.x - grp.position.x, dy: ev.world.y - grp.position.y },
      startCells: new Map(),
      startGeom: new Map(),
      startSize: { width: sizeOf(grp).width, height: sizeOf(grp).height },
      startPos: { x: grp.position.x, y: grp.position.y },
      edges: NO_EDGES,
      spans: { w: it.w, h: it.h },
      removedFromBoard: false,
      leg: null,
      strip: null,
      lastWorld: null,
      lastScreen: null,
      hostEl: null,
      esc: null,
      chip: null,
    };
  };
  const slabMove = (ev: ToolPointerEvent): void => {
    if (gesture?.subject === 'group') return onToolMove(ev);
    const g = slabGesture;
    if (!g) return;
    if (!g.started) {
      if (Math.abs(ev.screen.x - g.downScreen.x) + Math.abs(ev.screen.y - g.downScreen.y) < DRAG_THRESHOLD) return;
      g.started = true;
      armGlide();
      if (g.move) setCarried(g.id, true);
    }
    const it = engine.getItem(g.id);
    if (!it) return;
    const f = frame();
    const gg = geom();
    if (g.move) {
      // The section's top-left follows the pointer by the offset it was grabbed at.
      const cell = pointToCell(ev.world.x + g.grab.dx, ev.world.y + g.grab.dy, f, gg, rows(), it.w);
      if (cell.x !== it.x || cell.y !== it.y) {
        // The cell under the pointer, else the nearest legal one — a widget
        // slides along its row past a locked tile; a section grabbed 60 px
        // from its left edge used to have its right edge refused by the
        // locked panel at every cell and simply not move, with nothing on
        // screen to say why (identification round, D6/D7). When even that
        // fails the wanted cell is painted as refused.
        // Along its ROW only: a section dragged LEFT that wandered DOWN its
        // column (the row search) read as the wrong tile moving.
        const was = { x: it.x, y: it.y };
        const moved = engine.moveCheck(g.id, cell.x, cell.y, { gate: false, pushSolid: true }).changed || placeOnRow(g.id, cell.x, cell.y, it.w, true); // a moved section pushes the sections in its way (0.4.44)
        if (moved) {
          project();
          setCarried(g.id, true); // chrome repainted by the projection is carried too
        }
        // STUCK: the pointer asks for another cell and the slab did not budge
        // (placeOnRow counts "already on a legal cell" as placed) — paint what
        // was asked for as refused.
        const now = engine.getItem(g.id);
        const stuck = !!now && now.x === was.x && now.y === was.y && (cell.x !== was.x || cell.y !== was.y);
        showRefusal(stuck ? cell : null, it.w, it.h);
      }
      syncPlaceholder();
      return;
    }
    const cu = columnUnitFor(gg, f.width);
    const rh = rowHeightFor(gg, rows());
    // The grid line nearest the pointer, in cells (mirrored on RTL).
    const colAt = (wx: number): number => Math.round((rtl ? f.x + f.width - padding - wx : wx - f.x - padding) / (cu + gap));
    const rowAt = (wy: number): number => Math.round((wy - f.y - padding) / (rh + gap));
    let { x, y, w, h } = it;
    const px = ev.world.x + g.grab.dx;
    const py = ev.world.y + g.grab.dy;
    if (g.edges.e) w = Math.max(1, colAt(px) - x);
    if (g.edges.s) h = Math.max(1, rowAt(py) - y);
    if (g.edges.w) {
      const nx = Math.max(0, Math.min(x + w - 1, colAt(px)));
      w = x + w - nx;
      x = nx;
    }
    if (g.edges.n) {
      const ny = Math.max(0, Math.min(y + h - 1, rowAt(py)));
      h = y + h - ny;
      y = ny;
    }
    w = Math.max(1, Math.min(w, columns - x));
    // Never below the children's rows (the nested board's live bound).
    const floor = innerRowsOf(g.id);
    if (h < floor) {
      if (g.edges.n) y = y + h - floor;
      h = floor;
    }
    let changed = false;
    if (x !== it.x || y !== it.y) changed = engine.moveCheck(g.id, x, y, { gate: false, pushSolid: true }).changed || changed;
    if (w !== it.w || h !== it.h) changed = engine.resizeCheck(g.id, w, h).changed || changed;
    if (changed) project();
  };
  const slabUp = (): void => {
    if (gesture?.subject === 'group') return onToolUp();
    const g = slabGesture;
    if (!g) return;
    slabGesture = null;
    showRefusal(null, 0, 0);
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    if (g.move && g.started) setCarried(g.id, false); // exempt through the drop write, then the glides resume
    if (!g.started) {
      engine.endGesture();
      return;
    }
    engine.endGesture();
    project();
    // The mover and the sections it PUSHED (0.4.44) commit alike: a group's
    // cell-and-frame command comes out of the same deltas as a node's.
    const commands = tileCommands(deltasSince(g.startCells, g.startGeom));
    const changed = execute(g.move ? 'Move section' : 'Resize section', commands);
    disarmGlideSoon();
    syncHandles();
    api.renderNow();
    options.onGesture?.({ type: 'commit', kind: g.move ? 'move' : 'resize', nodeId: g.id, changed });
  };
  const slabCancel = (): void => {
    if (gesture?.subject === 'group') return cancelActiveGesture();
    const g = slabGesture;
    if (!g) return;
    slabGesture = null;
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    if (g.move && g.started) setCarried(g.id, false);
    if (g.started) engine.cancelGesture();
    else engine.endGesture();
    project();
    disarmGlideSoon();
    options.onGesture?.({ type: 'cancel', kind: 'resize', nodeId: g.id, changed: false });
  };

  const capturePointer = (pointerId: number | null): void => {
    if (pointerId === null) return;
    try {
      api.container.setPointerCapture?.(pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  const releasePointer = (pointerId: number | null): void => {
    if (pointerId === null) return;
    try {
      api.container.releasePointerCapture?.(pointerId);
    } catch {
      /* nothing to release */
    }
  };

  // -- the gesture machine ----------------------------------------------------

  const beginGestureVisuals = (g: GestureState): void => {
    engine.beginGesture();
    const snap = snapshotAll();
    g.startCells = snap.cells;
    g.startGeom = snap.geoms;
    g.started = true;
    armGlide();
    if (g.kind !== 'palette') {
      if (g.subject === 'node') {
        setGhost(g.id, true);
        g.hostEl = hostOf(g.id);
      } else setCarried(g.id, true); // a group moves as one thing: its whole subtree is exempt from the glide
      capturePointer(g.pointerId);
      api.container.style.cursor = g.kind === 'resize' ? 'nwse-resize' : 'grabbing';
    }
    syncPlaceholder();
  };

  /**
   * SAME-EVENT ghost fast-path — the vanilla-parity fix. The prototype writes
   * the tile's style inside the pointermove handler, so the ghost sits at 0px
   * behind the cursor; writing only the MODEL leaves the host to the next
   * render frame (~7.5px measured trailing at hand speed). Hosts live in the
   * HTML layer whose transform carries the camera, so world px == style px;
   * the renderer's next pass writes the identical values from the model — no
   * fight, just no wait.
   */
  const ghostStyleFastPath = (
    g: GestureState,
    rect: { x?: number; y?: number; width?: number; height?: number }
  ): void => {
    const el = g.hostEl;
    if (!el) return;
    if (rect.x !== undefined) el.style.left = `${rect.x}px`;
    if (rect.y !== undefined) el.style.top = `${rect.y}px`;
    if (rect.width !== undefined) el.style.width = `${rect.width}px`;
    if (rect.height !== undefined) el.style.height = `${rect.height}px`;
  };

  /** "A release here lands nowhere": the ghost's host dims, and so does a palette chip (which has no host). */
  const setDim = (g: GestureState, on: boolean): void => {
    hostOf(g.id)?.classList.toggle('axdb-out', on);
    g.chip?.classList.toggle('axdb-out', on);
  };

  const cleanupGestureVisuals = (g: GestureState): void => {
    if (g.kind !== 'palette') {
      if (g.subject === 'node') setGhost(g.id, false);
      else {
        setCarried(g.id, false); // exempt through the drop write, then the glides resume
        showRefusal(null, 0, 0);
      }
    }
    disarmGlideSoon();
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    g.chip?.remove();
    hidePlaceholder();
  };

  const commitGesture = (g: GestureState): void => {
    // SETTLE FIRST, then measure. Mid-drag the board can transiently hold more
    // rows than the drop keeps (hover above a locked slab pushes everything
    // down), and fit-mode row height shrinks with it — every displaced tile is
    // re-projected at that TRANSIENT height. The old order computed the commit
    // deltas from those pixels and, when the engine settled back with no cell
    // changes, nothing ever wrote the pixels back: a refused drop left the
    // whole board at the mid-drag height, KPI value lines clipped to nothing
    // (live audit repro: drag the trend chart above the KPI row → every widget
    // 122px→85px with identical cells). endGesture() keeps the settled cells;
    // project() then derives every member's pixels — the ghost included — from
    // that truth, so the deltas below record settled geometry and undo/redo
    // both replay it faithfully.
    engine.endGesture();
    cleanupGestureVisuals(g);
    gesture = null;
    project();
    const deltas = deltasSince(g.startCells, g.startGeom);
    const commands = tileCommands(deltas); // a container a BESIDE drop shifted commits with the widgets (0.4.45)
    endBeside(false);
    if (g.esc && g.esc.rowsAdded !== 0) {
      commands.push(
        new SetGroupCellCommand(
          group.id,
          g.esc.cellBefore,
          g.esc.cellAfter,
          g.esc.frameBefore,
          g.esc.frameAfter
        )
      );
    }
    const changed = execute(g.kind === 'resize' ? 'Resize widget' : 'Move widget', commands);
    persistLayouts(); // an edit at a narrow count propagated into the wide cache
    if (changed) {
      const it = engine.getItem(g.id);
      if (it && g.subject === 'node') live.announce(`${nameOf(nodeOf(g))} ${g.kind === 'resize' ? 'resized' : 'moved'} to ${describeCell(it)}`);
    }
    syncA11y();
    api.renderNow();
    options.onGesture?.({ type: 'commit', kind: g.kind, nodeId: g.id, changed });
  };

  const cancelActiveGesture = (notify = true): void => {
    if (gesture?.strip) {
      options.tabDrop?.markDrop(null, null);
      gesture.strip = null;
    }
    if (forwardSlab) {
      forwardSlab.slabCancel?.();
      forwardSlab = null;
    }
    if (slabGesture) slabCancel();
    const g = gesture;
    if (!g) return;
    gesture = null;
    if (g.leg) {
      g.leg.adopted.abort(); // target board back to its pre-entry layout
      g.leg = null;
    }
    if (g.esc && g.esc.rowsAdded !== 0) {
      g.esc.peer.resizeMemberBy(group.id, -g.esc.rowsAdded); // slab back down
      g.esc = null;
    }
    endBeside(true);
    if (g.started) {
      // The engine's gesture snapshot restores cells, sizes AND membership
      // (engine 0.3.8): a ghost removed mid-gesture comes back at its start
      // cell, a palette tile added mid-gesture is gone.
      engine.cancelGesture();
      if (designRows !== undefined) {
        maxRows = liveBound(engine.getItems());
        (engine as unknown as { maxRows?: number }).maxRows = maxRows;
      }
      // Restore every pixel to its gesture-start state.
      writing = true;
      try {
        for (const [id, snap] of g.startGeom) {
          const e = memberEntity(id);
          if (!e) continue;
          const node = diagram.getNode(id);
          diagram.runSystemWrite(() => {
            if (node) {
              node.setPosition(snap.pos.x, snap.pos.y);
              node.setSize(snap.size.width, snap.size.height, snap.size.depth ?? 0);
            } else {
              (e as GroupModel).setFrame({
                x: snap.pos.x,
                y: snap.pos.y,
                width: snap.size.width,
                height: snap.size.height,
              });
            }
          });
        }
      } finally {
        writing = false;
      }
    } else {
      engine.endGesture();
    }
    cleanupGestureVisuals(g);
    enforceBoardHeight();
    api.renderNow();
    if (notify) {
      options.onGesture?.({ type: 'cancel', kind: g.kind, nodeId: g.id, changed: false });
    }
  };

  /** Centre a w×h-span tile's top-left under the cursor, in world px. */
  const centredTopLeft = (
    worldX: number,
    worldY: number,
    spans: { w: number; h: number }
  ): { x: number; y: number } => {
    const f = frame();
    const g = geom();
    const cu = columnUnitFor(g, f.width);
    const rh = rowHeightFor(g, rows());
    return {
      x: worldX - (spans.w * (cu + gap) - gap) / 2,
      y: worldY - (spans.h * (rh + gap) - gap) / 2,
    };
  };

  /**
   * THE GHOST FOLLOWS THE HAND — for a tile of this board and for a palette
   * chip alike (tile first, step 4a): the zone under the pointer is resolved
   * once over the boards' membership tree, and whichever board it names
   * takes the ghost through a leg — beside a container of that board, with
   * intent where a section of that board refused it (D2), or on a plain cell.
   */
  const moveGhost = (g: GestureState, ev: ToolPointerEvent): void => {
    const desired = { x: ev.world.x - g.grab.dx, y: ev.world.y - g.grab.dy };
    if (g.subject === 'node') {
      // The pixel ghost follows the hand; a group's frame is projected from its cell, carried.
      nodeOf(g).setPosition(desired.x, desired.y);
      ghostStyleFastPath(g, desired);
    }

    g.lastWorld = { x: ev.world.x, y: ev.world.y };
    g.lastScreen = { x: ev.screen.x, y: ev.screen.y };
    /** The ghost's pixel size on THIS board — a palette chip has spans, not a size. */
    const pxSize = (): { width: number; height: number } => {
      if (g.kind !== 'palette') return sizeOf(g.entity);
      const f = frame();
      const gg = geom();
      return { width: g.spans.w * (columnUnitFor(gg, f.width) + gap) - gap, height: g.spans.h * (rowHeightFor(gg, rows()) + gap) - gap };
    };
    /** The ghost leaves THIS board's engine (survivors settle home); the old leg is closed first. */
    const leaveSelf = (): void => {
      if (g.leg) {
        g.leg.adopted.abort();
        g.leg = null;
      }
      if (!g.removedFromBoard) {
        g.removedFromBoard = true;
        engine.remove(g.id);
        project();
      }
    };
    /** A leg on `peer`, entered with `opts`; the old leg (another board's) is closed first. Answers whether the peer took the ghost. */
    const enterLeg = (peer: BinderPeer, opts: AdoptOptions): boolean => {
      if (g.leg && g.leg.peer !== peer) {
        g.leg.adopted.abort();
        g.leg = null;
      }
      if (!g.removedFromBoard) {
        g.removedFromBoard = true;
        engine.remove(g.id); // survivors settle home (gesture memory intact)
        project();
      }
      if (!g.leg) {
        const adopted = peer.adopt(g.entity, ev.world, pxSize(), opts);
        if (!adopted) return false;
        g.leg = { peer, adopted };
      }
      return true;
    };
    // THE ZONE (tile first, step 2): one recursive resolve over the boards'
    // membership tree — a strip slot, a cell beside a container, a plain
    // cell on the deepest board the pointer may enter, or off — decided
    // BEFORE any engine is asked anything. The strip still wins over every
    // board; a band's stickiness and the vacated cell still hold a beside.
    const z = resolveTileZone(g, ev);
    if (z.kind === 'strip' && options.tabDrop && !isStatic && g.kind !== 'palette' && g.subject === 'node') {
      // -- INTO A STRIP: the widget becomes a new tab there, so it leaves
      // this board (survivors settle home) and the strip marks the slot.
      endBeside(true); // a band's shift gives way to the strip: the container comes back
      leaveSelf();
      setDim(g, false);
      if (!g.strip || g.strip.containerId !== z.containerId || g.strip.index !== z.index) {
        options.tabDrop.markDrop(z.containerId, z.index);
      }
      g.strip = { containerId: z.containerId, index: z.index };
      syncPlaceholder();
      api.render();
      return;
    }
    if (g.strip) {
      options.tabDrop?.markDrop(null, null);
      g.strip = null;
    }
    // -- BESIDE a tab container: its outer band puts the widget next to it
    // — at the board's edge the container shifts over to make room, live
    // and gliding, like any widget gives way (0.4.48). On THIS board the
    // engine is driven directly; on another board its leg drives it (4a).
    if (z.kind === 'beside' && !isStatic && z.board.ref === selfPeer) {
      const row = rowOfPoint(ev.world.y);
      if (!z.kept || !beside || beside.row !== row) applyBeside(g, { id: z.containerId, side: z.side }, row);
      syncPlaceholder();
      return;
    }
    if (beside) endBeside(true); // the hand left the band: the container comes back
    if (z.kind === 'beside' && !isStatic) {
      const peer = z.board.ref as BinderPeer;
      if (g.leg && g.leg.peer === peer) g.leg.adopted.beside(z.containerId, z.side, ev.world);
      else if (enterLeg(peer, { beside: { containerId: z.containerId, side: z.side } })) g.refusedPeer = null;
      setDim(g, !g.leg);
      syncPlaceholder();
      return;
    }
    // Last resort: the grace band — a small slip past the edge stays ON
    // this board (the engine clamps the cell; prototype parity).
    const onSelf = z.kind !== 'off' && z.kind !== 'strip' && z.board.ref === selfPeer;
    const inside = onSelf || (z.kind === 'off' && worldInsideBoardGrace(ev.world.x, ev.world.y));
    const peer = !onSelf && z.kind !== 'off' && z.kind !== 'strip' ? (z.board.ref as BinderPeer) : null;

    /** A section that refused the widget is PUSHED by it on the board that holds the section (D2): this board directly, another through its leg. */
    const pushRefused = (refused: BinderPeer): void => {
      const parent = parentPeerOf(api.container, refused.group.id);
      if (parent === selfPeer) {
        if (g.leg) {
          g.leg.adopted.abort();
          g.leg = null;
        }
        placeOnSelf(g, desired, true);
        setDim(g, false);
      } else if (parent && g.leg && g.leg.peer === parent) {
        g.leg.adopted.move(ev.world, { push: true });
        setDim(g, false);
      } else if (parent && enterLeg(parent, { push: true })) {
        setDim(g, false);
      } else {
        // No board holds the refusing section (a view): dim = will snap home.
        leaveSelf();
        setDim(g, true);
      }
    };

    if (peer && g.refusedPeer === peer) {
      // -- REFUSED, PUSHED (D2): asked once; every move over it pushes.
      pushRefused(peer);
    } else if (peer) {
      // -- HANDOFF: the pointer is over another board -------------------
      if (g.leg && g.leg.peer === peer) {
        g.leg.adopted.move(ev.world);
      } else if (enterLeg(peer, {})) {
        g.refusedPeer = null;
        setDim(g, false);
        g.leg!.adopted.move(ev.world);
      } else {
        // The board refused (full, fit): the widget pushes it on its parent (D2).
        g.refusedPeer = peer;
        pushRefused(peer);
      }
    } else if (inside) {
      // -- back on (or still on) our own board --------------------------
      g.refusedPeer = null;
      if (g.leg) {
        g.leg.adopted.abort();
        g.leg = null;
      }
      setDim(g, false);
      // A group moved by hand takes the cell under the hand and PUSHES what
      // stands in its way (0.4.44) — and the zone walk reads the containers
      // it pushed at REST, so the hand still finds their zones where they were.
      placeOnSelf(g, desired, g.subject === 'group');
    } else {
      // -- outside every board ------------------------------------------
      leaveSelf();
      setDim(g, true);
    }
    syncPlaceholder();
    // A carried group's slab and frame are this board's chrome, but its frame
    // is written by whichever board holds it now: re-sync so they follow.
    if (g.subject === 'group') syncSlabs();
  };

  const onToolMove = (ev: ToolPointerEvent): void => {
    const g = gesture;
    if (!g || g.kind === 'palette') return;
    if (!g.started) {
      const dx = ev.screen.x - g.downClient.x;
      const dy = ev.screen.y - g.downClient.y;
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      beginGestureVisuals(g);
    }

    if (g.kind === 'move') {
      moveGhost(g, ev);
      return;
    }

    // resize: fluid pixel preview on the ghost, cell-stepped live push.
    //
    // ANCHORED ON THE OPPOSITE EDGE. The gesture carries which edges the press
    // took (the corner handle is s+e — s+w on an RTL board, whose corner sits
    // bottom-left — and a press near any border takes that edge), and the
    // tile's rect is rebuilt from its start rect with only those edges moved.
    // A pull from the west or north keeps the right/bottom edge pinned, in
    // cells too: the target cell is anchored, and the engine is driven MOVE
    // then RESIZE when growing (so the push happens on the side that grows)
    // and RESIZE then MOVE when shrinking. The s+e case reproduces the old
    // corner maths exactly, which the scenario battery pins.
    const dx = ev.world.x - g.downWorld.x;
    const dy = ev.world.y - g.downWorld.y;
    const E = g.edges;
    let left = g.startPos.x;
    let right = g.startPos.x + g.startSize.width;
    let top = g.startPos.y;
    let bottom = g.startPos.y + g.startSize.height;
    if (E.e) right += dx;
    if (E.w) left += dx;
    if (E.s) bottom += dy;
    if (E.n) top += dy;
    const f = frame();
    const gg = geom();
    const minW = Math.max(8, columnUnitFor(gg, f.width));
    let w = Math.max(minW, right - left);
    // The height min-clamp is applied AFTER the escalation logic below: on a
    // grown strip "one current row" IS the whole strip, and clamping the
    // fluid pull to it made the de-escalation threshold unreachable — the
    // ratchet's second disguise (grow committed; a fresh shrink gesture could
    // never pull low enough to ask the parent for a row back).
    let h = bottom - top;
    /**
     * Did the escalation below move this tile AS PART OF THE STRIP? A
     * full-height tile shares its row count with every other full-height tile
     * in the section, so once the strip grew, this tile's height is the
     * strip's — not whatever its own pixels re-quantise to. Without this the
     * gesture undid itself for its own tile and left the NEIGHBOUR grown:
     * drag Churn's bottom 70 px and ORDERS became two rows while Churn stayed
     * one (reported from the fluid demo). The cause is the row height
     * changing mid-gesture: 86 px rows make +70 read as 2 rows, and the
     * moment the section grows, rows become 108 px and the same pixels read
     * as 1 again. See the sibling rule for the un-pulled axis below.
     */
    let stripFollow = false;
    // NESTED HEIGHT ESCALATION (live report: "i cant increase height"). A
    // bounded strip cannot grow a tile taller than itself — so pulling
    // clearly past its bottom GROWS THE STRIP: the slab gains a row in the
    // parent board (all tiles inside get taller together); pulling clearly
    // back up REMOVES a row again. SYMMETRIC AND STATELESS ACROSS GESTURES:
    // the first version only de-escalated inside the ledger of the gesture
    // that grew ("rowsAdded > 0"), so grow → release → try to shrink was a
    // RATCHET — the strip could only ever get taller (live report: "Total
    // Revenue widget size can only increase"). Direction is now decided from
    // the strip's CURRENT slab rows, whatever gesture created them; the
    // ledger just accumulates this gesture's net change for the one-batch
    // commit and for Escape.
    // NESTED ESCALATION — a section is a board one level down, and a pull
    // inside it can need rows the section does not hold. Two shapes:
    //  · a tile spanning the section's FULL HEIGHT (any tile of a one-row KPI
    //    strip): the section gains a row and THE DRAGGED TILE takes it; its
    //    siblings keep their own cells, and the row goes back when the tile is
    //    pulled up again, never below the design. (Until 0.4.26 every
    //    full-height tile grew together — "a row stays a row" — but that
    //    resized the widget NEXT to the one under the pointer, which is not
    //    what a grid resize means.)
    //  · a PARTIAL tile (a one-row control in a 14-row panel): it pushes what
    //    is below it; a row the pushed layout needs and the section does not
    //    hold is asked of the board, one per pointer step, and rows the
    //    layout no longer needs go back. The board decides: grow extends, fit
    //    squeezes or refuses. The first version grew the section only for
    //    the full-height case and REFUSED the partial one; before that it
    //    shrank a 14-row panel to 4 (Quantia, Groups page).
    // The live bound `maxRows` follows the section's rows through all of it.
    if (designRows !== undefined && maxRows !== undefined && escalate && g.kind === 'resize') {
      const parent = parentPeer();
      const pulled = engine.getItem(g.id);
      if (parent && pulled) {
        const record = (
          res: ReturnType<BinderPeer['resizeMemberBy']>,
          d: number
        ): void => {
          if (!res.changed || !res.cellBefore || !res.cellAfter || !res.frameBefore || !res.frameAfter)
            return;
          if (!g.esc) {
            g.esc = {
              peer: parent,
              rowsAdded: 0,
              cellBefore: res.cellBefore,
              frameBefore: res.frameBefore,
              cellAfter: res.cellAfter,
              frameAfter: res.frameAfter,
            };
          }
          g.esc.rowsAdded += d;
          g.esc.cellAfter = res.cellAfter;
          g.esc.frameAfter = res.frameAfter;
        };
        const setInnerRows = (n: number): void => {
          maxRows = n;
          (engine as unknown as { maxRows?: number }).maxRows = n;
        };
        const slabRows = parent.memberCell(group.id)?.h ?? maxRows;
        const inner = maxRows;
        const rhNow = rowHeightFor(geom(), rows());
        const rowPx = rhNow + gap;
        // The SAME rounding the resize path quantises with, or the tile shrinks
        // through that path first and the section never gets its row back.
        const wantRows = Math.max(1, Math.round((h + gap) / rowPx));
        const fullHeight = pulled.y === 0 && pulled.h >= inner;
        // For the WHOLE gesture, not just the move that escalated: a strip
        // tile's height is its cells. Set on every move so the tile cannot
        // re-quantise back a row on the moves in between.
        stripFollow = fullHeight;
        /**
         * A STRIP IS MEASURED FROM THE PRESS, NOT FROM ITSELF. Growing the
         * strip changes the row height, so quantising the live pixels against
         * the LIVE row height feeds the decision back into its own input: at
         * 86 px rows a +80 px pull reads as 2 rows, the section grows, rows
         * become 108 px, the same pointer now reads as 1 row, the section
         * shrinks — and the gesture oscillates and lands wherever the last
         * move left it (measured: +60/+70/+90 grew, +80 did nothing).
         * Counting rows from the row height AT PRESS is monotonic in the
         * pointer, so the strip cannot fight itself.
         */
        const startCell = g.startCells.get(g.id);
        const startRowPx = startCell && startCell.h > 0 ? (g.startSize.height + gap) / startCell.h : rowPx;
        const stripRows = startCell
          ? Math.max(1, startCell.h + Math.round((h - g.startSize.height) / startRowPx))
          : wantRows;
        const effWant = fullHeight ? stripRows : wantRows;
        const wantsMore = effWant > pulled.h;
        const wantsLess = effWant < pulled.h;
        let touched = false;
        if (wantsMore) {
          if (fullHeight && !E.s) {
            // A tile that already starts at row 0 has nothing above it, so a
            // TOP-edge pull has nowhere to go: refuse it rather than growing
            // the tile downwards, away from the edge under the pointer. Same
            // rule the partial path follows (0.4.20).
          } else if (fullHeight) {
            const res = parent.resizeMemberBy(group.id, +1);
            if (res.changed) {
              record(res, +1);
              setInnerRows(inner + 1);
              // ONLY THE TILE UNDER THE POINTER CHANGES. The section grows to
              // hold it and its siblings keep their own cells — a grid resize
              // adjusts what you grabbed, nothing else. (This board used to
              // grow EVERY full-height tile together, so pulling one KPI of a
              // strip silently resized its neighbour too.)
              engine.resizeCheck(g.id, pulled.w, pulled.h + 1);
              touched = true;
            }
          } else if (!E.s) {
            // A top-edge pull needs the row ABOVE: the anchored resize path
            // decides it (refused when that row is taken) — never the section.
          } else if (!engine.resizeCheck(g.id, pulled.w, pulled.h + 1).changed) {
            const res = parent.resizeMemberBy(group.id, +1);
            if (res.changed) {
              record(res, +1);
              setInnerRows(inner + 1);
              engine.resizeCheck(g.id, pulled.w, pulled.h + 1);
              touched = true;
            }
          } else {
            touched = true;
          }
        } else if (wantsLess) {
          if (fullHeight) {
            if (slabRows > designRows && inner > 1) {
              // Shrink the dragged tile, then hand back only the rows the
              // section no longer needs — a sibling still using them keeps
              // them (the extent floor below).
              engine.resizeCheck(g.id, pulled.w, Math.max(1, effWant));
              const floor = Math.max(designRows, extentOf(engine.getItems()));
              let slab = slabRows;
              let bound = inner;
              while (slab > floor) {
                const res = parent.resizeMemberBy(group.id, -1);
                if (!res.changed) break;
                record(res, -1);
                slab -= 1;
                bound -= 1;
                setInnerRows(bound);
              }
              touched = true;
            }
          } else if (pulled.h > 1 && E.s) {
            // Shrink to the row the pointer asks for (one row per move lagged
            // a fast pull and overshot a slow one), then hand every row the
            // layout no longer needs back to the board.
            engine.resizeCheck(g.id, pulled.w, Math.max(1, wantRows));
            const floor = Math.max(designRows, extentOf(engine.getItems()));
            let slab = slabRows;
            let bound = inner;
            while (slab > floor) {
              const res = parent.resizeMemberBy(group.id, -1);
              if (!res.changed) break;
              record(res, -1);
              slab -= 1;
              bound -= 1;
              setInnerRows(bound);
            }
            touched = true;
          }
        }
        if (touched) project();
      }
    }
    // The fluid preview must not outrun what the board can accept: on a
    // bounded strip an unclamped ghost ballooned to 273px while the engine
    // (rightly) refused every cell — visually indistinguishable from the
    // squeeze bug it replaced. Clamp to the tile's maximum legal rect: the
    // growing side can reach the board edge on ITS side — column 0 / row 0
    // for a west / north pull, the last column / the bound otherwise.
    // (Escalation above may have just grown OR shrunk the board — re-read.)
    const fNow = frame();
    const ggNow = geom();
    h = Math.max(Math.max(8, rowHeightFor(ggNow, rows())), h);
    const itemNow = engine.getItem(g.id);
    const pullsX = E.e || E.w;
    const pullsY = E.n || E.s;
    if (itemNow) {
      const cuNow = columnUnitFor(ggNow, fNow.width);
      const rhNow = rowHeightFor(ggNow, rows());
      const wCells = E.w ? itemNow.x + itemNow.w : columns - itemNow.x;
      w = Math.min(w, wCells * (cuNow + gap) - gap);
      const b = bound();
      const hCells = E.n ? itemNow.y + itemNow.h : b !== undefined ? Math.max(1, b - itemNow.y) : Infinity;
      if (hCells !== Infinity) h = Math.min(h, hCells * (rhNow + gap) - gap);
      // AN AXIS NOBODY PULLED KEEPS ITS CELLS. In fit mode a push during the
      // gesture reflows the board and the row height shrinks, so a pixel
      // height that never changed re-quantises to MORE rows (measured: a west
      // pull took a 3-row donut to 5). The un-pulled axis follows the live
      // projection of its cell span instead of the start-of-gesture pixels.
      if (!pullsX) w = itemNow.w * (cuNow + gap) - gap;
      // …and a tile the STRIP just moved follows its cells on the pulled axis
      // too: the strip is one row of tiles, so the dragged tile keeps the row
      // count its peers were given rather than re-quantising against the row
      // height the escalation itself just changed.
      if (!pullsY || stripFollow) h = itemNow.h * (rhNow + gap) - gap;
    }
    // Anchor: the pulled edges follow w/h, the opposite ones stay put — on
    // the LIVE projection of the tile's cell, not the start-of-gesture pixels.
    // In fit mode a push during the gesture reflows every row, so the row the
    // tile sits in moves; anchoring on the start rect drew the ghost a row or
    // two below its own placeholder (visual audit, west pull on the donut).
    const liveRect = itemNow ? cellToRect(itemNow, fNow, ggNow, rows()) : null;
    const anchorLeft = liveRect && !E.w && !E.e ? liveRect.x : left;
    const anchorRight = liveRect ? liveRect.x + liveRect.width : right;
    const anchorTop = liveRect && !E.n && !E.s ? liveRect.y : top;
    const anchorBottom = liveRect ? liveRect.y + liveRect.height : bottom;
    const px = E.w ? anchorRight - w : anchorLeft;
    const py = E.n ? anchorBottom - h : anchorTop;
    nodeOf(g).setSize(w, h, nodeOf(g).size.depth ?? 0);
    nodeOf(g).setPosition(px, py);
    ghostStyleFastPath(g, { x: px, y: py, width: w, height: h });
    const spanF = bound() !== undefined ? frame() : f;
    const spanG = bound() !== undefined ? geom() : gg;
    const span = sizeToSpan(w, h, spanF, spanG, rows());
    if (itemNow) {
      if (!pullsX) span.w = itemNow.w;
      if (!pullsY) span.h = itemNow.h;
      const tx = E.w ? itemNow.x + itemNow.w - span.w : itemNow.x;
      const ty = E.n ? itemNow.y + itemNow.h - span.h : itemNow.y;
      const moves = tx !== itemNow.x || ty !== itemNow.y;
      const growing = span.w > itemNow.w || span.h > itemNow.h;
      let changed = false;
      // A north or west pull grows by MOVING the anchor first; when that move
      // is refused (the row above is taken) the growth is refused with it —
      // the first version fell through to a plain resize and grew the tile at
      // the OPPOSITE edge, so pulling a control's top edge up made it taller
      // at the bottom and pushed its section a row (kit lab L37).
      let anchored = true;
      if (moves && growing) {
        // The anchor may move only into FREE cells: a move that pushes would
        // relocate the tile (a top-edge pull sent a control to row 0 and its
        // neighbours below it) instead of growing it.
        const probe = { x: tx, y: ty, w: itemNow.w, h: itemNow.h };
        const blocked = engine.getItems().some((o) => o.id !== g.id && o.x < probe.x + probe.w && probe.x < o.x + o.w && o.y < probe.y + probe.h && probe.y < o.y + o.h);
        anchored = !blocked && engine.moveCheck(g.id, tx, ty, { gate: false }).changed;
        changed = anchored || changed;
      }
      if (anchored) changed = engine.resizeCheck(g.id, span.w, span.h).changed || changed;
      if (moves && !growing) changed = engine.moveCheck(g.id, tx, ty, { gate: false }).changed || changed;
      if (changed) project();
    }
    syncPlaceholder();
  };

  const onToolUp = (): void => {
    const g = gesture;
    if (!g || g.kind === 'palette') return;
    if (!g.started) {
      gesture = null; // a plain click — the page's own click-to-focus handles it
      return;
    }
    if (g.strip && options.tabDrop) {
      // -- INTO A STRIP: the widget becomes a new tab of that container ------
      const target = g.strip;
      g.strip = null;
      options.tabDrop.markDrop(null, null);
      if (g.leg) {
        g.leg.adopted.abort();
        g.leg = null;
      }
      const displaced = tileCommands(deltasSince(g.startCells, g.startGeom, g.id));
      const snap = g.startGeom.get(g.id);
      if (snap) {
        nodeOf(g).setPosition(snap.pos.x, snap.pos.y);
        nodeOf(g).setSize(snap.size.width, snap.size.height, snap.size.depth ?? 0);
      }
      const cmds = options.tabDrop.dropIntoStrip(g.id, target.containerId, target.index, group.id, displaced);
      if (cmds.length === 0) {
        cancelActiveGesture();
        return;
      }
      engine.endGesture();
      cleanupGestureVisuals(g);
      gesture = null;
      execute('Move widget into a new tab', cmds);
      enforceBoardHeight();
      persistLayouts();
      api.renderNow();
      options.onGesture?.({ type: 'commit', kind: g.kind, nodeId: g.id, changed: true });
      return;
    }
    if (g.leg) {
      // -- CROSS-CONTAINER COMMIT: one batch across both boards -----------
      const fin = g.leg.adopted.finalize();
      if (!fin) {
        cancelActiveGesture();
        return;
      }
      const targetGroupId = g.leg.adopted.groupId;
      // Land the ghost on its target rect before the geometry deltas read it.
      writing = true;
      try {
        diagram.runSystemWrite(() => {
          if (g.subject === 'node') {
            nodeOf(g).setPosition(fin.rect.x, fin.rect.y);
            nodeOf(g).setSize(fin.rect.width, fin.rect.height, nodeOf(g).size.depth ?? 0);
          } else (g.entity as GroupModel).setFrame({ ...fin.rect });
        });
      } finally {
        writing = false;
      }
      const sourceDisplaced = tileCommands(deltasSince(g.startCells, g.startGeom, g.id));
      const before = g.startCells.get(g.id);
      const geomBefore = g.startGeom.get(g.id);
      // A GROUP crossing boards: its cell-and-frame command, and the host's
      // bookkeeping for a container that changed boards (the spec entry, the
      // registry) rides along through `onMemberMoving` (tile first, 4b-ii).
      const own: Command[] =
        g.subject === 'group'
          ? [
              new SetGroupCellCommand(
                g.id,
                before ?? fin.cell,
                fin.cell,
                geomBefore ? { x: geomBefore.pos.x, y: geomBefore.pos.y, width: geomBefore.size.width, height: geomBefore.size.height } : fin.rect,
                fin.rect
              ),
              ...(options.onMemberMoving?.(g.id, group.id, targetGroupId) ?? []),
            ]
          : buildCommitCommands([
              {
                id: g.id,
                locked: false,
                isGroup: false,
                cellBefore: before ?? fin.cell,
                cellAfter: fin.cell,
                posBefore: geomBefore?.pos ?? { x: fin.rect.x, y: fin.rect.y },
                posAfter: { x: fin.rect.x, y: fin.rect.y },
                sizeBefore: geomBefore?.size ?? { width: fin.rect.width, height: fin.rect.height },
                sizeAfter: { width: fin.rect.width, height: fin.rect.height },
              },
            ]);
      const crossing: Command[] = [
        ...sourceDisplaced,
        // …and the TARGET board's own displaced tiles. Dropping onto an
        // occupied row pushes that row down, and the ghost draws the pushed
        // layout — but these commands were computed and then dropped on the
        // floor, so nothing persisted the push. The next rebuild read the
        // pre-drop cells, found the arriving tile overlapping them, and pushed
        // IT to the bottom instead: the drop landed a whole row away from the
        // ghost that promised it ("it goes in as an extra row").
        ...fin.commands,
        new RemoveFromGroupCommand(group.id, g.id),
        new AddToGroupCommand(targetGroupId, g.id),
        ...own,
      ];
      // …and whatever follows a member out of this board: an emptied page
      // closes — in which case the membership commands ride INSIDE one
      // sequence with it, or the batch could never undo (its group is gone).
      const leaving = options.onMemberLeaving?.(g.id) ?? [];
      execute('Move widget', leaving.length > 0 ? [new SequenceCommand('Move widget', [...crossing, ...leaving])] : crossing);
      engine.endGesture();
      cleanupGestureVisuals(g);
      gesture = null;
      enforceBoardHeight();
      persistLayouts();
      api.renderNow();
      options.onGesture?.({ type: 'commit', kind: g.kind, nodeId: g.id, changed: true });
      return;
    }
    if (g.removedFromBoard && (dragOut === 'cancel' || g.subject === 'group')) {
      // Released outside every board on a snap-home board: full restore,
      // nothing committed (the parked-outside release).
      cancelActiveGesture();
      return;
    }
    // 'remove' fires ONLY for a release genuinely outside every board. A
    // refused adoption (full strip) leaves removedFromBoard=true while the
    // pointer is still over a board — releasing there must snap home, not
    // delete the tile (the battery's S5 caught exactly that deletion).
    const releasedOutsideAll =
      !g.lastWorld ||
      (!worldInsideBoardGrace(g.lastWorld.x, g.lastWorld.y) &&
        !peerAt(g.lastWorld.x, g.lastWorld.y, true));
    const inRemoveZone =
      !options.removeZone ||
      (g.lastScreen && g.lastWorld && options.removeZone(g.lastScreen, g.lastWorld));
    if (g.removedFromBoard && dragOut === 'remove' && (!releasedOutsideAll || !inRemoveZone)) {
      // Outside-but-not-over-the-trash (or a mere overshoot): snap home.
      cancelActiveGesture();
      return;
    }
    if (g.removedFromBoard && dragOut === 'remove') {
      // Release OUTSIDE the board → remove via the page's atomic command path.
      const displaced = tileCommands(deltasSince(g.startCells, g.startGeom, g.id));
      const snap = g.startGeom.get(g.id);
      if (snap) {
        // Park the node on its start rect so the page's RemoveNodeCommand
        // captures sane geometry for undo.
        nodeOf(g).setPosition(snap.pos.x, snap.pos.y);
        nodeOf(g).setSize(snap.size.width, snap.size.height, snap.size.depth ?? 0);
      }
      engine.endGesture();
      cleanupGestureVisuals(g);
      gesture = null;
      enforceBoardHeight();
      api.renderNow();
      void options.onRemoveRequest?.(g.id, displaced);
      options.onGesture?.({ type: 'remove', kind: g.kind, nodeId: g.id, changed: true });
      return;
    }
    commitGesture(g);
  };

  // -- cross-container peers -------------------------------------------------

  const boardArea = (): number => {
    const f = frame();
    return f.width * boardVisualHeight();
  };

  const peersOnCanvas = (): Set<BinderPeer> => {
    let set = BOARD_REGISTRY.get(api.container);
    if (!set) {
      set = new Set();
      BOARD_REGISTRY.set(api.container, set);
    }
    return set;
  };

  /**
   * The boards of this canvas as the zone walk sees them (tile first, step
   * 2): a ROOT is a board whose group has no parent group (a view); a board's
   * children are its member groups that are containers, each with the board a
   * descent enters — a tab container's ACTIVE page, a section's own board —
   * one level deeper. Built from the peers and the model on every move: a
   * handful of groups, and the frames are live.
   */
  const zoneRoots = (): ZoneBoard[] => {
    const peers = [...peersOnCanvas()];
    const byGroup = new Map(peers.map((p) => [p.group.id, p] as const));
    const boardRef = (p: BinderPeer, depth: number): ZoneBoard => ({
      id: p.group.id,
      depth,
      ref: p,
      contains: (x, y) => p.containsWorld(x, y),
      containsExtended: (x, y) => p.containsWorldExtended(x, y),
      children: () => {
        const out: ZoneContainer[] = [];
        for (const id of p.group.members ?? []) {
          const grp = diagram.getGroup(id);
          if (!grp || diagram.getNode(id)) continue;
          const cw = (grp.getMetadata('containerWidget') ?? {}) as { layout?: string; active?: string };
          const layout: ZoneContainer['layout'] = cw.layout === 'tabs' ? 'tabs' : cw.layout === 'split' ? 'split' : 'grid';
          let innerPeer: BinderPeer | undefined;
          if (layout === 'tabs') {
            const pageId = cw.active && byGroup.has(cw.active) ? cw.active : [...(grp.members ?? [])].find((m) => byGroup.has(m));
            innerPeer = pageId ? byGroup.get(pageId) : undefined;
          } else innerPeer = byGroup.get(id);
          out.push({
            id,
            layout,
            static: innerPeer?.isStatic?.() ?? false,
            frame: frameOfGroup(grp),
            stripHeight: layout === 'tabs' ? TAB_STRIP_HEIGHT : 0,
            band: layout === 'tabs' ? BESIDE_BAND : 0, // a section's whole body is "into" (Quantia's Groups page)
            inner: innerPeer ? boardRef(innerPeer, depth + 1) : null,
          });
        }
        return out;
      },
    });
    return peers.filter((p) => !p.group.parentGroupId).map((p) => boardRef(p, 0));
  };
  /** The ghost takes the cell under the hand on THIS board: re-entering at the bottom edge first (collision-free), then gatelessly; a tile already here moves through the gate. */
  const placeOnSelf = (g: GestureState, desired: { x: number; y: number }, pushSolid = false): void => {
    if (g.removedFromBoard) {
      g.removedFromBoard = false;
      setDim(g, false);
      const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows(), g.spans.w);
      engine.add({ id: g.id, x: 0, y: engine.rows(), w: g.spans.w, h: g.spans.h });
      if (!engine.moveCheck(g.id, cell.x, cell.y, { gate: false, pushSolid }).changed) placeNear(g.id, cell.x, cell.y, g.spans.w, pushSolid);
      project();
    } else if (g.subject === 'group') {
      // The cell under the pointer, else the nearest legal one ALONG ITS ROW
      // (a section dragged left that wandered down its column read as the
      // wrong tile moving); when even that fails the wanted cell is painted
      // as refused (identification round, D6/D7).
      const it = engine.getItem(g.id);
      if (!it) return;
      const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows(), it.w);
      if (cell.x === it.x && cell.y === it.y) return;
      const was = { x: it.x, y: it.y };
      const moved = engine.moveCheck(g.id, cell.x, cell.y, { gate: false, pushSolid: true }).changed || placeOnRow(g.id, cell.x, cell.y, it.w, true);
      if (moved) {
        project();
        setCarried(g.id, true); // chrome repainted by the projection is carried too
      }
      const now = engine.getItem(g.id);
      const stuck = !!now && now.x === was.x && now.y === was.y;
      showRefusal(stuck ? cell : null, it.w, it.h);
    } else {
      const spanW = engine.getItem(g.id)?.w ?? g.spans.w;
      const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows(), spanW);
      if (engine.moveCheck(g.id, cell.x, cell.y, { pushSolid }).changed) project();
    }
  };
  /** What the pointer means for the dragged tile: the resolve over the live tree, with the beside the hand holds. */
  const resolveTileZone = (g: GestureState, ev: ToolPointerEvent) => {
    let strip: { containerId: string; index: number } | null = null;
    if (options.tabDrop && !isStatic && g.kind !== 'palette' && g.subject === 'node') {
      // A group never becomes a tab: over a container's strip it is over the
      // container's margin — a cell on the parent board, pushing with intent.
      const crect = api.container.getBoundingClientRect();
      const cx = crect.left + ev.screen.x;
      const cy = crect.top + ev.screen.y;
      const stay = g.strip ? STRIP_STAY : 0;
      // THE HELD CONTAINER'S STRIP IS READ FROM THE MODEL, AT REST — as its
      // bands are (0.4.49). Two reasons, both measured on the live demo with
      // a widget carried down the panel's strip: a beside SHIFTS or PUSHES the
      // container and its strip travels with it, so tested where the DOM says
      // it is, the tab zone runs away from the hand aiming at it (the tabs
      // became unreachable at any height); and the DOM box GLIDES, so for a
      // frame or two after the container is sent home the strip is still in
      // the air and the hand falls through it.
      const held = beside?.id ?? g.strip?.containerId ?? null;
      if (held && options.tabDrop.tabIndexAt) {
        const grp = diagram.getGroup(held);
        const f = beside && beside.id === held ? beside.frame0 : grp ? frameOfGroup(grp) : null;
        if (f) {
          const s = clientPerWorld();
          const tol = stay / (s.y || 1);
          const inStrip =
            ev.world.x >= f.x - stay / (s.x || 1) &&
            ev.world.x <= f.x + f.width + stay / (s.x || 1) &&
            ev.world.y >= f.y - tol &&
            ev.world.y <= f.y + TAB_STRIP_HEIGHT + tol;
          const idx = inStrip ? options.tabDrop.tabIndexAt(held, cx) : null;
          if (idx !== null) strip = { containerId: held, index: idx };
        }
      }
      if (!strip) strip = options.tabDrop.stripAt(cx, cy, g.strip ? { containerId: g.strip.containerId, px: stay } : undefined);
    }
    return resolveZone({
      x: ev.world.x,
      y: ev.world.y,
      roots: zoneRoots(),
      strip,
      prev: beside
        ? { containerId: beside.id, side: beside.side, frame0: beside.frame0, vacated: cellToRect({ x: beside.vacated.x, y: beside.vacated.y, w: g.spans.w, h: g.spans.h }, frame(), geom(), rows()) }
        : (g.leg?.adopted.besideState() ?? null), // a beside another board holds for the ghost, through its leg
      maxDepth: nesting,
      ghostDepth: g.subject === 'group' ? 1 + levelsInside(g.id) : 0, // a group's widgets sit one board deeper than wherever it lands
      ...(g.subject === 'group' ? { restFrames: restFramesOf(g) } : {}),
      ghostSubtree: g.subject === 'group' ? descendantGroups(g.id) : EMPTY_SUBTREE,
      gap,
      homeChain: homeChain(),
    });
  };
  /** This board's containers as they stood at the press: a group ghost's intent pushes never change what the hand means. */
  const restFramesOf = (g: GestureState): ReadonlyMap<string, WorldRect> => {
    const out = new Map<string, WorldRect>();
    for (const [id, snap] of g.startGeom) {
      if (id === g.id || !isGroupMember(id)) continue;
      out.set(id, { x: snap.pos.x, y: snap.pos.y, width: snap.size.width, height: snap.size.height });
    }
    return out;
  };
  /** Every group under `id`, itself included — the boards a group ghost may never enter. */
  const descendantGroups = (id: string): ReadonlySet<string> => {
    const out = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      if (out.has(cur)) continue;
      const grp = diagram.getGroup(cur);
      if (!grp) continue;
      out.add(cur);
      for (const m of grp.members ?? []) if (diagram.getGroup(m)) queue.push(m);
    }
    return out;
  };
  /**
   * The container LEVELS a group carries INSIDE it: 0 for a section of
   * widgets or a tab container of plain pages (a container and its page are
   * one level), 1 for a section holding a section, and so on. The group's own
   * level is the +1 above: its widgets sit one board deeper than the board it
   * lands on. The nesting policy counts both.
   */
  const levelsInside = (id: string): number => {
    const grp = diagram.getGroup(id);
    if (!grp) return 0;
    const tabs = isTabsGroup(grp);
    let deepest = 0;
    for (const m of grp.members ?? []) {
      if (!diagram.getGroup(m)) continue;
      deepest = Math.max(deepest, tabs ? levelsInside(m) : 1 + levelsInside(m));
    }
    return deepest;
  };
  /** Client pixels per world unit — the camera's scale, measured the way the tear-out measures its bands. */
  const clientPerWorld = (): { x: number; y: number } => {
    const rect = api.container.getBoundingClientRect();
    const toWorld = (cx: number, cy: number): { x: number; y: number } =>
      api.viewport?.clientToWorld ? api.viewport.clientToWorld(cx, cy, rect) : { x: cx - rect.left, y: cy - rect.top };
    const o = toWorld(rect.left, rect.top);
    const u = toWorld(rect.left + 100, rect.top + 100);
    return { x: 100 / (u.x - o.x || 100), y: 100 / (u.y - o.y || 100) };
  };
  /** The groups this board sits in, all the way up: their bands never apply to a tile of this board. */
  const homeChain = (): ReadonlySet<string> => {
    const out = new Set<string>();
    let cur: GroupModel | undefined = group;
    for (let i = 0; cur && i < 32; i++) {
      out.add(cur.id);
      cur = cur.parentGroupId ? diagram.getGroup(cur.parentGroupId) : undefined;
    }
    return out;
  };

  /** The board whose engine holds OUR group as an item (nesting parent). */
  const parentPeer = (): BinderPeer | null => {
    for (const p of peersOnCanvas()) {
      if (p !== selfPeer && p.hasItem(group.id)) return p;
    }
    return null;
  };

  /** Deepest OTHER registered board containing the world point. */
  const peerAt = (x: number, y: number, extended = false): BinderPeer | null => {
    let best: BinderPeer | null = null;
    for (const p of peersOnCanvas()) {
      if (p === selfPeer) continue;
      if (!(extended ? p.containsWorldExtended(x, y) : p.containsWorld(x, y))) continue;
      if (!best || p.frameArea() < best.frameArea()) best = p;
    }
    return best;
  };

  /** `handle.planRemoval` for local use before the handle object exists. */
  const planRemovalOf = (id: string): Command[] => handle.planRemoval(id);

  /** This binder's side of an adoption: enter gateless, then live-push. */
  /**
   * Put an ARRIVING tile as close to the pointer as the board allows. The
   * exact cell is often refused because a SECTION is a locked tile and the
   * incoming tile overlaps it (E4b), and a refused placement left the tile
   * wherever it entered — the bottom row. That read as "it did not drop where
   * I put it". Slide along the row instead, nearest first, so a tile that
   * cannot take the cell under the pointer still lands beside it.
   */
  /**
   * Slide along ONE row, nearest column first. `changed:false` means BOTH
   * "refused" and "it is already there", and reading the second as the first
   * made the search walk straight past the right answer: parked on the nearest
   * legal cell, the next pointer move re-tried the wanted cell (refused),
   * re-tried the cell it was ON (no change, read as refused) and then took a
   * FARTHER one — so the tile oscillated for the whole drag and settled
   * wherever the last swing left it. Ask where the tile IS, not whether the
   * call moved it.
   */
  const placeOnRow = (id: string, x: number, y: number, w: number, pushSolid = false): boolean => {
    const at = (cx: number): boolean => {
      const i = engine.getItem(id);
      return !!i && i.x === cx && i.y === y;
    };
    const maxX = Math.max(0, columns - w);
    if (at(x)) return true;
    if (engine.moveCheck(id, x, y, { gate: false, pushSolid }).changed) return true;
    for (let d = 1; d <= columns; d++) {
      for (const cx of [x - d, x + d]) {
        if (cx < 0 || cx > maxX) continue;
        if (at(cx)) return true;
        if (engine.moveCheck(id, cx, y, { gate: false, pushSolid }).changed) return true;
      }
    }
    return false;
  };
  const placeNear = (id: string, x: number, y: number, w: number, pushSolid = false): boolean => {
    if (placeOnRow(id, x, y, w, pushSolid)) return true;
    // EVERY column on that row refused — which is what a locked section
    // spanning the full width does, and there are plenty of those. Sliding
    // sideways can never clear it, so try the rows either side, nearest first.
    // Without this the drop either fell to the bottom of the board or, when
    // the board had no room down there either, did nothing at all.
    const reach = Math.max(1, rows()) + 2;
    for (let d = 1; d <= reach; d++) {
      for (const cy of [y - d, y + d]) {
        if (cy < 0) continue;
        if (placeOnRow(id, x, cy, w, pushSolid)) return true;
      }
    }
    return false;
  };
  /**
   * Rows free at (x, y) across `w` columns before the nearest LOCKED tile
   * below — a section is a locked tile nothing can push, so that is the hard
   * ceiling on what can land there — capped at the natural height. 0 when the
   * row itself lies under a locked tile.
   */
  const fitHeightAt = (id: string, x: number, y: number, w: number, hNatural: number): number => {
    let limit = hNatural;
    for (const it of engine.getItems()) {
      if (it.id === id || !(it.locked || it.solid)) continue;
      if (!(it.x < x + w && x < it.x + it.w)) continue;
      if (it.y <= y && it.y + it.h > y) return 0;
      if (it.y > y) limit = Math.min(limit, it.y - y);
    }
    const b = bound();
    if (b !== undefined) limit = Math.min(limit, Math.max(0, b - y));
    return limit;
  };
  /**
   * A TEAR-OUT takes the cell under the pointer at the height that fits there
   * — a page dragged out of a full-height panel onto a busy board would
   * otherwise have exactly one legal cell, below the lowest section, and the
   * drop would land a screen away from the pointer with its placeholder out of
   * sight. Only when nothing fits there does it fall back to the nearest row
   * at its natural height.
   */
  const placeFitting = (id: string, x: number, y: number, w: number, hNatural: number): boolean => {
    const it = engine.getItem(id);
    if (!it) return false;
    const hFit = fitHeightAt(id, x, y, w, hNatural);
    if (hFit >= TEAR_OUT_MIN_ROWS) {
      if (it.h !== hFit) engine.resizeCheck(id, w, hFit);
      if (engine.getItem(id)?.h === hFit && placeOnRow(id, x, y, w)) return true;
    }
    const now = engine.getItem(id);
    if (now && now.h !== hNatural) {
      // Growing back where it sits may be refused; the entry row at the bottom
      // always has room, so grow there and let placeNear bring it up.
      engine.resizeCheck(id, w, hNatural);
      if (engine.getItem(id)?.h !== hNatural) {
        engine.moveCheck(id, 0, engine.rows(), { gate: false });
        engine.resizeCheck(id, w, hNatural);
      }
    }
    return placeNear(id, x, y, w);
  };

  const adopt = (
    // Only the id is used: a tab page arriving here is a GROUP, not a node.
    node: { id: string },
    world: { x: number; y: number },
    pxSize: { width: number; height: number },
    opts: AdoptOptions = {}
  ): AdoptedLeg | null => {
    if (disposed) return null;
    const f = frame();
    const gg = geom();
    const span = sizeToSpan(pxSize.width, pxSize.height, f, gg, rows());
    // Clamp to the TARGET board's shape: a tall tile entering a one-row strip
    // arrives as a strip-height tile, not a refusal.
    span.w = Math.max(1, Math.min(columns, span.w));
    const b = bound();
    if (b !== undefined) span.h = Math.max(1, Math.min(b, span.h));
    engine.beginGesture(); // pre-entry snapshot — abort() restores it
    // A FULL nested board SQUEEZES for a tile arriving by hand, the way a fit
    // board squeezes for its own. Its bound is the design the escalation path
    // grows through the parent, and a page has no parent tile to grow (its
    // height is its container's): so the rows shrink toward the floor instead
    // of refusing the drop with no sign of why — the fluid demo's Filters page
    // took a KPI dragged onto it and showed nothing at all. abort() puts the
    // bound back; a commit keeps what the board then holds.
    const squeezeBefore = squeezeRoom;
    let entered = engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: span.h });
    // Only a board with NO parent tile to grow through squeezes — a page. A
    // full SECTION grows instead (D4, below): its height is a tile of its
    // parent, and the parent is what has the rows to give.
    if (!entered && !parentPeer()) {
      const room = elasticRows();
      if (room !== undefined && room > (bound() ?? 0)) {
        setSqueeze(room);
        span.h = Math.max(1, Math.min(room, span.h));
        entered = engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: span.h });
      }
    }
    /**
     * D4 — A GROW CONTAINER TAKES ROWS FOR A TILE ARRIVING BY HAND. A full
     * section is bounded by the rows its slab holds on the parent board, and
     * those rows are the parent's to give: the same escalation a RESIZE inside
     * the section uses (`g.esc`), asked one row at a time until the tile fits
     * or the parent refuses. A FIT container (`escalate: false`) does not
     * grow — it squeezes if it is a page, and otherwise refuses and is pushed
     * by the widget instead (D2), which is what `sizing: 'fit'` means.
     *
     * The rows go back on `abort()`; on `finalize()` the section's own cell and
     * frame commit with the drop, and the parent's re-layout carries whatever
     * that growth pushed (pinned by the escalation spec).
     */
    interface GrownRows {
      peer: BinderPeer;
      rows: number;
      cellBefore: CellRect;
      frameBefore: WorldRect;
      cellAfter: CellRect;
      frameAfter: WorldRect;
    }
    let grown: GrownRows | null = null;
    const ungrow = (): void => {
      const g = grown;
      if (!g) return;
      g.peer.resizeMemberBy(group.id, -g.rows);
      setLiveBound(Math.max(1, (maxRows ?? 1) - g.rows));
      grown = null;
    };
    if (!entered && escalate) {
      const parent = parentPeer();
      let rowsAdded = 0;
      let firstBefore: { cell: CellRect; frame: WorldRect } | null = null;
      let lastAfter: { cell: CellRect; frame: WorldRect } | null = null;
      // At most the tile's own height in rows: past that the board is not
      // "full", it is smaller than the thing being dropped into it.
      for (let i = 0; parent && !entered && i < Math.max(1, span.h); i++) {
        const res = parent.resizeMemberBy(group.id, +1);
        if (!res.changed || !res.cellBefore || !res.cellAfter || !res.frameBefore || !res.frameAfter) break;
        rowsAdded += 1;
        firstBefore = firstBefore ?? { cell: res.cellBefore, frame: res.frameBefore };
        lastAfter = { cell: res.cellAfter, frame: res.frameAfter };
        setLiveBound((maxRows ?? 0) + 1);
        entered = engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: span.h });
      }
      if (parent && rowsAdded > 0 && firstBefore && lastAfter) {
        grown = { peer: parent, rows: rowsAdded, cellBefore: firstBefore.cell, frameBefore: firstBefore.frame, cellAfter: lastAfter.cell, frameAfter: lastAfter.frame };
      }
    }
    if (!entered) {
      ungrow();
      setSqueeze(squeezeBefore);
      engine.endGesture();
      return null; // a bounded, full board refuses the adoption
    }
    // Pre-entry baselines for THIS board's displaced-tile commit.
    const startCells = new Map<string, CellRect>();
    const startGeom = new Map<string, GeomSnapshot>();
    for (const item of engine.getItems()) {
      if (item.id === node.id) continue;
      startCells.set(item.id, { x: item.x, y: item.y, w: item.w, h: item.h });
      const e = memberEntity(item.id);
      if (e) {
        const sz = sizeOf(e);
        startGeom.set(item.id, {
          pos: { x: e.position.x, y: e.position.y },
          size: { width: sz.width, height: sz.height, depth: sz.depth },
        });
      }
    }
    adoptedGhostId = node.id;
    const hNatural = span.h;
    const wantedCell = (wx: number, wy: number, itemW: number, itemH: number): { x: number; y: number } => {
      const tl = centredTopLeft(wx, wy, { w: itemW, h: opts.anchor === 'top' ? 0 : itemH });
      return pointToCell(tl.x, tl.y, frame(), geom(), rows(), itemW);
    };
    const place = (cell: { x: number; y: number }, itemW: number, push = false): boolean =>
      opts.fit === 'shrink' ? placeFitting(node.id, cell.x, cell.y, itemW, hNatural) : placeNear(node.id, cell.x, cell.y, itemW, push);
    let lastWant: { x: number; y: number } | null = null;
    if (opts.beside) {
      besideOn(node.id, span, { id: opts.beside.containerId, side: opts.beside.side }, rowOfPoint(world.y));
    } else {
      const cell0 = wantedCell(world.x, world.y, span.w, span.h);
      lastWant = cell0;
      place(cell0, span.w, opts.push);
    }
    armGlide();
    project();
    syncPlaceholder();
    return {
      groupId: group.id,
      baseline: () => startCells,
      cell: () => {
        const it = engine.getItem(node.id);
        return it ? { x: it.x, y: it.y, w: it.w, h: it.h } : null;
      },
      rect: () => {
        const it = engine.getItem(node.id);
        return it ? cellToRect(it, frame(), geom(), rows()) : null;
      },
      place: (cell, pushSolid = false) => {
        if (!engine.getItem(node.id) && !engine.add({ id: node.id, x: 0, y: engine.rows(), w: cell.w, h: cell.h })) return false;
        const it = engine.getItem(node.id);
        if (!it) return false;
        // Shrink, move, then grow. A resize is clamped at the board's edge
        // where the ghost SITS, so a cell wider than fits there (a full-width
        // dock from a ghost parked mid-board) is reached by moving first —
        // and a cell narrower than the ghost by shrinking first, so the move
        // itself fits.
        const w0 = Math.min(it.w, cell.w);
        const h0 = Math.min(it.h, cell.h);
        if (w0 !== it.w || h0 !== it.h) engine.resizeCheck(node.id, w0, h0);
        const moved = engine.getItem(node.id);
        if (moved && (moved.x !== cell.x || moved.y !== cell.y)) engine.moveCheck(node.id, cell.x, cell.y, { gate: false, pushSolid });
        const now = engine.getItem(node.id);
        if (now && (now.w !== cell.w || now.h !== cell.h)) engine.resizeCheck(node.id, cell.w, cell.h, { pushSolid });
        lastWant = null;
        project();
        syncPlaceholder();
        const at = engine.getItem(node.id);
        return !!at && at.x === cell.x && at.y === cell.y && at.w === cell.w && at.h === cell.h;
      },
      move: (w, o) => {
        const item = engine.getItem(node.id);
        if (!item) return;
        if (beside) endBeside(true); // the hand left the band: the container comes back before the tile takes a plain cell
        const cell = wantedCell(w.x, w.y, item.w, opts.fit === 'shrink' ? hNatural : item.h);
        // The search is worth running once per wanted cell, not per pixel.
        if (lastWant && lastWant.x === cell.x && lastWant.y === cell.y) return;
        lastWant = cell;
        if (place(cell, item.w, !!o?.push)) project();
        syncPlaceholder();
      },
      beside: (containerId, side, w) => {
        if (!engine.getItem(node.id) && !engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: hNatural })) return;
        const row = rowOfPoint(w.y);
        if (beside && beside.id === containerId && beside.side === side && beside.row === row) return;
        lastWant = null;
        besideOn(node.id, span, { id: containerId, side }, row);
        syncPlaceholder();
      },
      besideState: () =>
        beside ? { containerId: beside.id, side: beside.side, frame0: beside.frame0, vacated: cellToRect({ x: beside.vacated.x, y: beside.vacated.y, w: span.w, h: hNatural }, frame(), geom(), rows()) } : null,
      leave: () => {
        if (!engine.getItem(node.id)) return;
        endBeside(true); // a container shifted for the tile comes back by itself: the shift was deliberate, so the memory never brings it
        engine.remove(node.id); // displaced tiles come home (gesture memory)
        lastWant = null;
        project();
        syncPlaceholder();
      },
      enter: (w) => {
        if (!engine.getItem(node.id) && !engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: hNatural })) return;
        const item = engine.getItem(node.id);
        if (!item) return;
        const cell = wantedCell(w.x, w.y, item.w, opts.fit === 'shrink' ? hNatural : item.h);
        lastWant = cell;
        place(cell, item.w);
        project();
        syncPlaceholder();
      },
      abort: () => {
        beside = null; // the snapshot restores the container with everything else
        if (engine.getItem(node.id)) engine.remove(node.id);
        engine.cancelGesture(); // pre-entry layout, memory cleared
        ungrow(); // the rows this board took from its parent for the arrival go back (D4)
        setSqueeze(squeezeBefore);
        adoptedGhostId = null;
        disarmGlideSoon();
        project();
        syncPlaceholder();
      },
      finalize: () => {
        endBeside(false); // the shift stays: the deltas below carry it
        const item = engine.getItem(node.id);
        if (!item) {
          engine.endGesture();
          adoptedGhostId = null;
          syncPlaceholder();
          return null;
        }
        const cell: CellRect = { x: item.x, y: item.y, w: item.w, h: item.h };
        const rect = cellToRect(item, frame(), geom(), rows());
        // Widgets AND sections this board's adoption displaced, as one list: a
        // dock or a push that moved a section commits it with the drop.
        const commands = tileCommands(deltasSince(startCells, startGeom, node.id));
        // …and the rows this board took from its parent to hold the arrival (D4).
        if (grown) {
          commands.push(new SetGroupCellCommand(group.id, grown.cellBefore, grown.cellAfter, grown.frameBefore, grown.frameAfter));
          grown = null;
        }
        engine.endGesture();
        pendingDrop = node.id; // the tile stays for the member the commit (or the host's drop-in) adds
        if (squeezeRoom !== undefined) {
          // What the board now HOLDS is its bound, not the squeeze's room.
          squeezeRoom = undefined;
          setLiveBound(liveBound(engine.getItems()));
        }
        adoptedGhostId = null;
        disarmGlideSoon();
        syncPlaceholder();
        return { commands, cell, rect };
      },
    };
  };

  const selfPeer: BinderPeer = {
    group,
    isStatic: () => isStatic,
    tearOutMember: (pageId, fromGroupId, ev, plan) => beginTearOut(pageId, fromGroupId, ev, plan),
    clearSelection: () => {
      if (selectedId === undefined) return;
      selectedId = undefined;
      syncA11y();
      syncSlabs();
      options.onSelect?.(undefined);
    },
    innerRows: () => maxRows ?? rows(),
    selectMember: (id) => {
      if ((group.members ?? new Set<string>()).has(id)) {
        selectWidget(id);
        api.render();
      }
    },
    beginSlabResize: (id, edges, ev) => {
      if (isStatic) return false;
      beginSlabResize(id, edges, ev);
      return slabGesture?.id === id;
    },
    beginSlabMove: (id, ev) => {
      if (isStatic) return false;
      beginSlabMove(id, ev);
      return gesture?.id === id;
    },
    dragMember: (id, ev) => {
      if (isStatic || disposed || !engine.getItem(id) || gesture || slabGesture) return false;
      const toTool = (e: PointerEvent): ToolPointerEvent => {
        const rect = api.container.getBoundingClientRect();
        const world = api.viewport?.clientToWorld ? api.viewport.clientToWorld(e.clientX, e.clientY, rect) : { x: e.clientX - rect.left, y: e.clientY - rect.top };
        return { world, screen: { x: e.clientX - rect.left, y: e.clientY - rect.top }, source: e } as unknown as ToolPointerEvent;
      };
      beginSlabMove(id, toTool(ev));
      if (currentGesture()?.id !== id) return false;
      const detachAll = (): void => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        window.removeEventListener('keydown', onKey, true);
      };
      const onMove = (e: PointerEvent): void => {
        if (disposed || currentGesture()?.id !== id) return detachAll();
        slabMove(toTool(e));
        api.render();
      };
      const onUp = (): void => {
        detachAll();
        slabUp();
      };
      const onCancel = (): void => {
        detachAll();
        slabCancel();
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') onCancel();
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      window.addEventListener('keydown', onKey, true);
      return true;
    },
    slabMove: (ev) => slabMove(ev),
    slabUp: () => slabUp(),
    slabCancel: () => slabCancel(),
    hasItem: (id) => !!engine.getItem(id),
    memberCell: (id) => {
      const it = engine.getItem(id);
      return it ? { x: it.x, y: it.y, w: it.w, h: it.h } : undefined;
    },
    resizeMemberBy: (id, dRows) => {
      const item = engine.getItem(id);
      if (!item || disposed) return { changed: false };
      const grp = diagram.getGroup(id);
      const cellBefore: CellRect = { x: item.x, y: item.y, w: item.w, h: item.h };
      const fb = grp
        ? { x: grp.position.x, y: grp.position.y, width: sizeOf(grp).width, height: sizeOf(grp).height }
        : undefined;
      const r = engine.resizeCheck(id, item.w, item.h + dRows);
      if (!r.changed) return { changed: false };
      project();
      const after = engine.getItem(id)!;
      const fa = grp
        ? { x: grp.position.x, y: grp.position.y, width: sizeOf(grp).width, height: sizeOf(grp).height }
        : undefined;
      return {
        changed: true,
        cellBefore,
        cellAfter: { x: after.x, y: after.y, w: after.w, h: after.h },
        frameBefore: fb,
        frameAfter: fa,
      };
    },
    containsWorld: worldInsideBoard,
    containsWorldExtended: worldInsideBoardExtended,
    frameArea: boardArea,
    adopt,
  };
  peersOnCanvas().add(selfPeer);
  selfPeerRef = selfPeer;
  // The board's gap, for chrome that must fit BETWEEN tiles (the outside grip tab).
  api.container.style.setProperty('--axdb-gap', `${gap}px`);

  /** A press on one of our containers' strips, claimed so the renderer stays out of it. */
  let stripPress = false;
  const tool: CanvasTool = {
    id: `dashboard-grid:${group.id}:${++binderSeq}`,
    priority: 2, // point-specific claim — outranks mode-style tools (see ext/tools.ts)
    hitTest(ev, hit) {
      if (disposed) return false;
      if (gesture || slabGesture || forwardSlab || stripPress) return true; // own the rest of an in-flight gesture
      // A press on one of OUR containers' TAB STRIPS is ours to CLAIM and then
      // leave alone: the strip's own listeners run the click, the tab drag and
      // the container move. Left unclaimed (ownsPress calls a strip "content")
      // the renderer's ladder cleared the selection and armed its empty-canvas
      // PAN, and the camera slid 10–20 px under every tab drag — the reorder
      // mark lost after a detour, a release outside the canvas that committed,
      // the strip end reading as the right band (identification round, 2026-09-09).
      const stripEl = (ev.source?.target as Element | null | undefined)?.closest?.('.axdb-tabs') ?? null;
      if (stripEl) {
        const cid = stripEl.getAttribute('data-tabs-id');
        return !!cid && (group.members ?? new Set<string>()).has(cid) && api.container.contains(stripEl);
      }
      if (!ownsPress(api.container, diagram, ev, hit)) return false;
      // A press on one of OUR sections' caption bands is ours by the DOM: a
      // 'tab' band sits above the frame, over the gap or the tile above,
      // where the geometry says otherwise.
      const chrome = (ev.source?.target as Element | null | undefined)?.closest?.('.axdb-slab > .axdb-slab-h, .axdb-slab > .axdb-rs');
      const chromeId = chrome?.parentElement?.getAttribute('data-slab-id');
      const mine = !!chromeId && (group.members ?? new Set<string>()).has(chromeId);
      if (mine) return true;
      // Someone else's SECTION HANDLE is never ours to claim. A tab
      // container's pages register before the parent board, so a page's tool
      // won the tie for the CONTAINER's corner handle and, finding no peer to
      // hand it to, just cleared the selection — the container could not be
      // resized by hand at all while the API resized it fine. (Only the
      // handle: declining every foreign band broke the press that reaches the
      // content under a hidden `show: 'hover'` caption.)
      if (chromeId && chrome?.classList.contains('axdb-rs')) return false;
      if (hit.node) {
        if ((group.members ?? new Set<string>()).has(hit.node.id)) return true;
        // A press on a tile that belongs to a NESTED board must reach that
        // board's tool. The dead-zone claim below deadens the slab's EMPTY
        // band — claiming a peer's tile with it swallowed every resize inside
        // an API-built container (which binds child-before-parent, so the
        // parent's tool won the registration-order tie and the child's resize
        // never armed; grid-options binds parent-first and worked by
        // accident).
        for (const p of BOARD_REGISTRY.get(api.container) ?? []) {
          if (p !== selfPeer && p.hasItem(hit.node.id)) return false;
        }
        return insideMemberGroupFrame(ev.world.x, ev.world.y);
      }
      // An EMPTY press inside a NESTED board's frame is that board's: its
      // dividers, its band, its own section press (which it hands back up).
      // Ties went to the first registered tool, and a section re-bound by a
      // layout switch registers AFTER its parent — so the parent took every
      // divider press in a split section (dead dividers) and, near the
      // section's edge, turned it into a section resize (the width changed
      // while a control's height was being dragged — Quantia, Groups page).
      for (const p of BOARD_REGISTRY.get(api.container) ?? []) {
        if (p !== selfPeer && (group.members ?? new Set<string>()).has(p.group.id) && p.containsWorld(ev.world.x, ev.world.y)) return false;
      }
      // Claim (and deaden) empty presses inside a member group's frame so the
      // built-in group-drag cannot fight the pack layout for the KPI slab —
      // and empty presses on the BOARD itself: its group is a layout
      // container, not a thing to drag around the canvas, and on a fluid
      // board there is no void outside it, so the space between tiles IS the
      // void (a click there clears the selection, see onPointerDown).
      return insideMemberGroupFrame(ev.world.x, ev.world.y) || worldInsideBoard(ev.world.x, ev.world.y);
    },
    onPointerDown(ev, hit) {
      if (gesture) return; // mid-palette
      const target = (ev.source?.target ?? null) as Element | null;
      if (target?.closest?.('.axdb-tabs')) {
        stripPress = true; // claimed for the strip: nothing of ours starts
        return;
      }
      // A press on a painted grip names its widget by the DOM: an OUTSIDE tab
      // sits above the card's box, where the hit test sees the gap or the
      // neighbour above.
      const gripHost = gripHostOf(target);
      const gripId = gripHost?.getAttribute('data-node-id') ?? null;
      const onGrip = !!gripId && (group.members ?? new Set<string>()).has(gripId);
      // A SECTION's corner handle sits on top of whatever tile shares that
      // corner; the DOM target names the section, the hit test the tile.
      const sectionHandle = target?.closest?.('.axdb-slab > .axdb-rs') as HTMLElement | null;
      // A SECTION's CAPTION BAND names its section the same way — a 'tab'
      // band sits above the frame, over the gap or the tile above. An action
      // button in it fires and does nothing else.
      const captionBand = target?.closest?.('.axdb-slab > .axdb-slab-h') as HTMLElement | null;
      const captionId = captionBand?.parentElement?.getAttribute('data-slab-id') ?? null;
      const ownCaption = !!captionId && (group.members ?? new Set<string>()).has(captionId);
      // (An action button never reaches here: it is pass-through, and its own
      // `click` fires onCaptionAction — see captionPassThrough.)
      if ((!hit.node && !onGrip) || sectionHandle || ownCaption) {
        // A press on a SECTION — its empty band, its caption, its corner
        // handle or its frame edge — selects the section; the handle or an
        // edge resizes it.
        const slabHandle = target?.closest?.('.axdb-slab > .axdb-rs') as HTMLElement | null;
        const slabId = slabHandle?.parentElement?.getAttribute('data-slab-id') ?? (ownCaption ? captionId : null) ?? memberGroupAt(ev.world.x, ev.world.y);
        const grp = slabId && (group.members ?? new Set<string>()).has(slabId) ? diagram.getGroup(slabId) : undefined;
        if (slabId && grp) {
          selectWidget(slabId);
          api.render();
          if (isStatic) return;
          const edges: ResizeEdges = slabHandle
            ? rtl ? { n: false, e: false, s: true, w: true } : { n: false, e: true, s: true, w: false }
            : slabEdgesNear(grp, ev.world.x, ev.world.y);
          if (anyEdge(edges)) beginSlabResize(slabId, edges, ev);
          // The caption band is the section's handle: pressed and travelled,
          // it moves the whole section (its inner empty space only selects).
          // A TAB CONTAINER's frame is its handle (0.4.43): the margin around
          // its pages moves the group — the strip's empty space, the only
          // handle before, was one nobody found ("I'm not able to drag an
          // entire tab group").
          else if (ownCaption || isTabsGroup(grp)) beginSlabMove(slabId, ev);
          return;
        }
        // OUR OWN empty band, and we are a section of a parent board: the
        // press selects the section there, and its edge or corner handle
        // starts the section resize, which the parent runs while this tool
        // forwards the pointer sequence.
        const parent = parentPeer();
        if (parent?.selectMember && worldInsideBoard(ev.world.x, ev.world.y)) {
          const ownHandle = slabHandle?.parentElement?.getAttribute('data-slab-id') === group.id;
          parent.selectMember(group.id);
          if (!isStatic && parent.beginSlabResize) {
            const edges: ResizeEdges = ownHandle
              ? rtl ? { n: false, e: false, s: true, w: true } : { n: false, e: true, s: true, w: false }
              : slabEdgesNear(group, ev.world.x, ev.world.y);
            if (anyEdge(edges) && parent.beginSlabResize(group.id, edges, ev)) forwardSlab = parent;
            else if (!anyEdge(edges) && captionId === group.id && parent.beginSlabMove?.(group.id, ev)) forwardSlab = parent;
          }
          return;
        }
        // The board's own empty area: a void click. Nothing to drag, and the
        // selection clears exactly as a click outside any board would.
        (diagram as { clearSelection?: () => void }).clearSelection?.();
        selectWidget(undefined);
        api.render();
        return;
      }
      const node = diagram.getNode(onGrip ? (gripId as string) : (hit.node as { id: string }).id);
      if (!node) return;
      selectWidget(node.id); // a press selects, whether or not it starts a gesture
      if (node.state?.locked === true) return; // pinned: refuse; click still focuses
      if (isStatic) return; // a static board: claimed and deadened, click still focuses
      // Which edges did the press take? The corner handle names its own (s+e,
      // or s+w on RTL); a bare press within EDGE_GRIP of the tile's border
      // takes that border; anywhere else is a move. A grip press is a move.
      const onHandle = !!target?.closest?.('.axdb-rs');
      const hostEl = hostOf(node.id);
      const resizable = node.getMetadata?.('widgetResizable') !== false;
      const movable = node.getMetadata?.('widgetMovable') !== false;
      // `ev.screen` is ELEMENT-LOCAL px; host rects are in client px. Compare
      // like with like — the source event's clientX/Y when there is one, else
      // the container's origin plus the local offset.
      const src = ev.source as { clientX?: number; clientY?: number } | undefined;
      const cr = api.container.getBoundingClientRect();
      const cx = typeof src?.clientX === 'number' ? src.clientX : cr.left + ev.screen.x;
      const cy = typeof src?.clientY === 'number' ? src.clientY : cr.top + ev.screen.y;
      let edges: ResizeEdges = NO_EDGES;
      if (resizable && !onGrip) {
        if (onHandle) edges = rtl ? { n: false, e: false, s: true, w: true } : { n: false, e: true, s: true, w: false };
        else if (hostEl) edges = edgesNear(hostEl, cx, cy);
      }
      const isResize = anyEdge(edges);
      if (!isResize && !movable) return; // a fixed tile: refuse the drag, click still focuses
      // Drag-handle mode: only a press on the handle (the caption strip, a
      // custom element, or the painted grip) moves the tile. Anywhere else the
      // press is claimed (no group drag) but starts nothing, so the body keeps
      // its own behaviour — a table scrolls, a legend clicks.
      if (!isResize && dragSel !== null && !pressOnDragHandle(dragSel, target, hostEl, cx, cy)) return;
      // Arm the glide class NOW, a full task before any displacement can
      // happen: a transition defined in the same style recalc as the first
      // left/top write does not run (CSS transitions fire only when the
      // property changes while the transition exists in the BEFORE-change
      // style) — the first pushed neighbour of every gesture TELEPORTED
      // (measured 109px in one frame) while later ones glided.
      armGlide();
      const it = engine.getItem(node.id);
      gesture = {
        kind: isResize ? 'resize' : 'move',
        id: node.id,
        subject: 'node',
        entity: node,
        pointerId:
          typeof PointerEvent !== 'undefined' && ev.source instanceof PointerEvent
            ? ev.source.pointerId
            : null,
        started: false,
        downClient: { x: ev.screen.x, y: ev.screen.y },
        downWorld: { x: ev.world.x, y: ev.world.y },
        grab: { dx: ev.world.x - node.position.x, dy: ev.world.y - node.position.y },
        startCells: new Map(),
        startGeom: new Map(),
        startSize: { width: node.size.width, height: node.size.height },
        startPos: { x: node.position.x, y: node.position.y },
        edges,
        spans: { w: it?.w ?? 1, h: it?.h ?? 1 },
        removedFromBoard: false,
        leg: null,
      strip: null,
        lastWorld: null,
        lastScreen: null,
        hostEl: null,
        esc: null,
        chip: null,
      };
    },
    onPointerMove(ev) {
      if (stripPress) return;
      if (forwardSlab) forwardSlab.slabMove?.(ev);
      else if (slabGesture) slabMove(ev);
      else onToolMove(ev);
    },
    onPointerUp() {
      if (stripPress) {
        stripPress = false;
        return;
      }
      try {
        onPointerUpInner();
      } finally {
        flushDeferredRebuild();
        // EVERY press ends disarmed. The press armed the glide (a task ahead
        // of any displacement — see onPointerDown); a drop disarms on its own
        // path, but a press that never travelled — a plain CLICK — left it
        // armed for good, and every later left/top write eased: a tab switch
        // slid its page in from 20,000 px off canvas over 280 ms (0.4.36).
        disarmGlideSoon();
      }
    },
    onCancel() {
      stripPress = false;
      try {
        cancelActiveGesture();
      } finally {
        flushDeferredRebuild();
        disarmGlideSoon();
      }
    },
  };
  const onPointerUpInner = (): void => {
    if (forwardSlab) {
      forwardSlab.slabUp?.();
      forwardSlab = null;
    } else if (slabGesture) slabUp();
    else onToolUp();
  };

  const unregisterTool = registerTool(tool);

  api.container.addEventListener('pointermove', chrome.onHover, { passive: true });
  api.container.addEventListener('pointerleave', chrome.onHoverLeave, { passive: true });

  // -- keyboard operation (keyboard.ts) --------------------------------------

  const keyboard = createKeyboard(ctx, {
    handle: () => handle,
    live,
    nameOf,
    focusedId: () => focusedId,
    setFocusedId: (id) => {
      focusedId = id;
    },
    selectedId: () => selectedId,
    selectWidget,
    syncA11y: () => syncA11y(),
    gestureRunning: () => !!gesture,
  });
  api.container.addEventListener('focusin', keyboard.onFocusIn);
  api.container.addEventListener('keydown', keyboard.onKey);

  // -- tab tear-out -----------------------------------------------------------

  // -- tab tear-out (tear-out.ts) --------------------------------------------

  const beginTearOut = createTearOut(ctx, {
    columns: () => columns,
    adopt: (node, world, pxSize, opts) => adopt(node, world, pxSize, opts),
    boardArea,
    peersOnCanvas,
    selfPeer: () => selfPeer,
    worldInsideBoard,
    worldInsideGroup,
    frameOfGroup,
    execute,
    project,
    hidePlaceholder,
    armGlide,
    disarmGlideSoon,
    enforceBoardHeight,
    persistLayouts,
    busy: () => !!gesture || !!slabGesture,
    tearing: () => tearing,
    setTearing: (id) => {
      tearing = id;
    },
  });

  // -- palette drag-in --------------------------------------------------------

  const beginPaletteDrag = (
    node: NodeModel,
    spec: { w: number; h: number; chip?: HTMLElement },
    event: PointerEvent
  ): void => {
    if (disposed || gesture || isStatic) return;
    const chip = spec.chip ?? null;
    if (chip) {
      chip.classList.add('axdb-drag-chip');
      document.body.appendChild(chip);
      chip.style.left = `${event.clientX + 6}px`;
      chip.style.top = `${event.clientY + 6}px`;
    }
    const g: GestureState = {
      kind: 'palette',
      id: node.id,
      subject: 'node',
      entity: node,
      pointerId: event.pointerId ?? null,
      started: false,
      downClient: { x: event.clientX, y: event.clientY },
      downWorld: { x: 0, y: 0 },
      grab: { dx: 0, dy: 0 },
      startCells: new Map(),
      startGeom: new Map(),
      startSize: { width: 0, height: 0 },
      startPos: { x: 0, y: 0 },
      edges: NO_EDGES,
      spans: { w: Math.max(1, spec.w), h: Math.max(1, spec.h) },
      removedFromBoard: true,
      leg: null,
      strip: null,
      lastWorld: null,
      lastScreen: null,
      hostEl: null,
      esc: null,
      chip,
    };
    gesture = g;

    const toWorld = (cx: number, cy: number): { x: number; y: number } => {
      const rect = api.container.getBoundingClientRect();
      return api.viewport?.clientToWorld
        ? api.viewport.clientToWorld(cx, cy, rect)
        : { x: cx - rect.left, y: cy - rect.top };
    };

    const detach = (): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
    };

    const onMove = (e: PointerEvent): void => {
      if (gesture !== g) return detach();
      if (!g.started) {
        if (
          Math.abs(e.clientX - g.downClient.x) + Math.abs(e.clientY - g.downClient.y) <
          DRAG_THRESHOLD
        ) {
          return;
        }
        beginGestureVisuals(g);
        // The chip is held by its middle: the ghost centres under the hand.
        const f = frame();
        const gg = geom();
        g.grab = { dx: (g.spans.w * (columnUnitFor(gg, f.width) + gap) - gap) / 2, dy: (g.spans.h * (rowHeightFor(gg, rows()) + gap) - gap) / 2 };
      }
      if (chip) {
        chip.style.left = `${e.clientX + 6}px`;
        chip.style.top = `${e.clientY + 6}px`;
      }
      // THE SAME PATH AS A TILE OF THIS BOARD (tile first, step 4a): the zone
      // under the hand names the board — this one, a page, a section — and
      // that board takes the ghost. The palette used to test "inside this
      // board" and nothing else, so a chip over a page landed under it.
      const rect = api.container.getBoundingClientRect();
      const world = toWorld(e.clientX, e.clientY);
      moveGhost(g, { type: 'move', world, screen: { x: e.clientX - rect.left, y: e.clientY - rect.top }, modifiers: { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey } } as ToolPointerEvent);
      api.render();
    };

    /** The drop, on whichever board holds the ghost: the node carries its cell, the host's command adds it there. */
    const dropOn = (boardId: string, cell: CellRect, displaced: Command[]): void => {
      node.setGridItem(gridItemFromCell(cell));
      if (boardId === group.id) pendingDrop = g.id; // on another board its own finalize() pended it
      engine.endGesture();
      cleanupGestureVisuals(g);
      gesture = null;
      void options.onDropIn?.(node, cell, displaced, { boardId });
      persistLayouts();
      options.onGesture?.({ type: 'drop-in', kind: 'palette', nodeId: g.id, changed: true });
      api.renderNow();
    };
    const finish = (commit: boolean): void => {
      detach();
      if (gesture !== g) return;
      if (!g.started) {
        // Never crossed the threshold: a plain palette CLICK — the page's
        // click-to-add handler owns it.
        gesture = null;
        chip?.remove();
        return;
      }
      if (commit && g.leg) {
        // Dropped into another board (a page, a section): its leg closes with
        // that board's displaced tiles; this board displaced nothing.
        const fin = g.leg.adopted.finalize();
        const boardId = g.leg.adopted.groupId;
        g.leg = null;
        if (fin) {
          dropOn(boardId, fin.cell, [...tileCommands(deltasSince(g.startCells, g.startGeom, g.id)), ...fin.commands]);
          return;
        }
      } else if (commit && !g.removedFromBoard && engine.getItem(g.id)) {
        const item = engine.getItem(g.id)!;
        endBeside(false); // a container that shifted for the chip stays shifted: its delta commits with the drop
        dropOn(group.id, { x: item.x, y: item.y, w: item.w, h: item.h }, tileCommands(deltasSince(g.startCells, g.startGeom, g.id)));
        return;
      }
      // Abort (released outside, or Escape): restore the board.
      cancelActiveGesture();
    };

    const onUp = (): void => finish(true);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('keydown', onKey, true);
  };

  // -- handle -----------------------------------------------------------------

  const subs: Array<() => void> = [
    group.on('member:added', ((id: string) => onMemberAdded(id)) as (...args: unknown[]) => void),
    group.on('member:removed', ((id: string) => onMemberRemoved(id)) as (
      ...args: unknown[]
    ) => void),
    group.on('bounds:changed', (() => onBoundsChanged()) as (...args: unknown[]) => void),
  ];

  /** Run one programmatic gesture through the same snapshot→op→commit pipeline. */
  const programmatic = async (
    name: string,
    id: string,
    op: () => boolean
  ): Promise<boolean> => {
    if (disposed || gesture || !engine.getItem(id)) return false;
    engine.beginGesture();
    const snap = snapshotAll();
    const ok = op();
    if (!ok) {
      engine.endGesture();
      return false;
    }
    armGlide();
    project();
    writing = true;
    try {
      const it = engine.getItem(id);
      if (it) writeRect(id, cellToRect(it, frame(), geom(), rows()));
    } finally {
      writing = false;
    }
    const commands = tileCommands(deltasSince(snap.cells, snap.geoms)); // a section's cell-and-frame command rides with the nodes'
    engine.endGesture();
    disarmGlideSoon();
    enforceBoardHeight();
    if (commands.length > 0) {
      await api.getEngine().commandManager.execute(new BatchCommand(name, commands));
    }
    persistLayouts();
    api.renderNow();
    return true;
  };

  /** Rebuild the engine from the members' persisted cells. `pack` runs gravity
   *  over the result (boot, float→off); a plain sync keeps the cells verbatim. */
  /**
   * A rebuild asked for while a gesture is live waits for the gesture. The
   * pointer's own crossing re-lays boards — adopting a widget into the Nested
   * page moved the inner tabs container, the tabs runtime re-placed its
   * pages, and the inner page's binder rebuilt from the model: its gesture
   * cancelled mid-drag, the dragged widget re-added, the ghost class gone
   * and the target's placeholder leaked through release and undo
   * (identification round, L5). The frame change itself is answered by
   * `onBoundsChanged` (a re-projection); the model is rebuilt afterwards.
   */
  let rebuildDeferred: { pack: boolean } | null = null;
  const flushDeferredRebuild = (): void => {
    if (!rebuildDeferred || gesture || slabGesture) return;
    const { pack } = rebuildDeferred;
    rebuildDeferred = null;
    rebuild(pack);
  };
  const rebuild = (pack: boolean): void => {
    if (disposed) return;
    if (gesture || slabGesture) {
      rebuildDeferred = { pack: pack || rebuildDeferred?.pack === true };
      project();
      return;
    }
    applyFluidFrame();
    pendingDrop = null; // rebuilt from the members: a phantom is gone with the engine
    const items: GridPackItem[] = [];
    for (const id of group.members ?? []) {
      if (!memberEntity(id)) continue;
      items.push(itemFor(id));
    }
    // CARRY THE PER-COLUMN CACHE ACROSS THE REBUILD. sync() runs on every
    // undo, member add and refresh; without this handoff a responsive board
    // would silently lose its wide layouts the first time anything else
    // happened, and growing back would re-derive instead of restoring. On a
    // FRESH bind (a loaded document) the cache comes from the group instead.
    const persisted = group.getMetadata?.('dashboardLayouts') as
      | { columns?: number; layouts?: GridLayoutCache }
      | undefined;
    const carried = engine.cachedColumns().length > 0 ? engine.getLayouts() : (persisted?.layouts ?? {});
    // The document's cells belong to the count it was SAVED at. When that is
    // not the count this board is bound at, build the engine at the saved
    // count — where the cells are legal — hand it the cache, and let its own
    // column change bring the board to the bound count: known items come back
    // from the cache exactly, the rest scale. (Only a fresh bind can see a
    // mismatch; every later rebuild finds cells the binder itself wrote.)
    const savedAt = engine.cachedColumns().length === 0 && typeof persisted?.columns === 'number' ? persisted.columns : columns;
    engine = engineFrom(items, pack, savedAt);
    engine.setLayouts(carried);
    const converted = savedAt !== columns && engine.setColumns(columns, responsive?.layout ?? 'moveScale');
    // A PACKED or CONVERTED rebuild may have moved cells; write them all back
    // so the next verbatim sync reads the settled board, not the pre-pack one.
    // A verbatim rebuild only fills in cells that were never persisted.
    if (pack || converted) persistLiveCells();
    else for (const item of engine.getItems()) persistAdoptedCell(item.id, item);
    // The capacity is derived from the design height AND floors at the content
    // just rebuilt, so it is computed here and carried into the engine.
    if (refreshCapacity()) engine = engineFrom(engine.getItems().map((i) => ({ ...i })), false);
    persistLayouts();
    project();
    syncHandles();
    api.renderNow();
    evaluateResponsive();
  };

  const handle: DashboardGridHandle = {
    sync(): void {
      rebuild(false);
    },
    setColumns(n, layout, opts): boolean {
      if (disposed) return false;
      if (!opts?.responsive) responsivePinned = true;
      return applyColumns(n, layout ?? responsive?.layout ?? 'moveScale');
    },
    getColumns: () => columns,
    setRtl(on): void {
      if (on === rtl) return;
      rtl = on;
      // Pixels only — the cells are already correct in both directions.
      project();
      syncHandles();
      api.renderNow();
    },
    getRtl: () => rtl,
    focusWidget(id): boolean {
      if (disposed || !(group.members ?? new Set<string>()).has(id) || !diagram.getNode(id)) return false;
      focusedId = id;
      selectWidget(id);
      syncA11y();
      hostOf(id)?.focus?.({ preventScroll: true });
      return true;
    },
    getFocusedWidget: () => focusedId,
    selectWidget(id): boolean {
      if (disposed) return false;
      if (id !== undefined && (!(group.members ?? new Set<string>()).has(id) || !memberEntity(id))) return false;
      selectWidget(id);
      return true;
    },
    getSelectedWidget: () => selectedId,
    setStatic(on): void {
      if (on === isStatic) return;
      isStatic = on;
      if (gesture) cancelActiveGesture(false);
      // A `show: 'design'` caption leaves under static and its reserve with
      // it (or comes back): the frame moved, re-project the tiles.
      project();
      syncHandles();
      api.renderNow();
    },
    getStatic: () => isStatic,
    setDragHandle(v): void {
      const next = normalizeDragHandle(v);
      if (sameDragHandle(next, dragHandle)) return;
      dragHandle = next;
      dragSel = dragHandleSelector(next);
      if (gesture) cancelActiveGesture(false);
      api.container.classList.toggle(DRAG_HANDLE_CLASS, dragHandle === true);
      syncHandles();
      api.renderNow();
    },
    getDragHandle: () => (typeof dragHandle === 'object' ? { ...dragHandle } : dragHandle),
    saveLayout() {
      const saved = engine.saveLayout();
      return {
        columns: saved.columns,
        cells: new Map(saved.items.map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }])),
      };
    },
    setSizing(mode): void {
      if (mode === sizing) return;
      sizing = mode;
      applyFluidFrame();
      if (refreshCapacity()) rebuild(false);
      else project();
      api.renderNow();
    },
    getSizing: () => sizing,
    setFloat(on): void {
      if (on === float) return;
      float = on;
      // Rebuild from persisted cells under the new mode, PACKED: gravity (when
      // float turns off) applies immediately through the rebuild's settle.
      rebuild(true);
      api.renderNow();
    },
    getFloat: () => float,
    metrics() {
      const f = frame();
      const g = geom();
      const r = rows();
      return {
        columns,
        maxColumns,
        rtl,
        responsive: !!responsive && !responsivePinned,
        fluid,
        static: isStatic,
        dragHandle: typeof dragHandle === 'object' ? { ...dragHandle } : dragHandle,
        capacity,
        gap,
        padding,
        sizing,
        rows: r,
        rowHeight: rowHeightFor(g, r),
        columnUnit: columnUnitFor(g, f.width),
        boardHeight: f.height,
        frame: f,
      };
    },
    willItFit(w, h) {
      if (bound() === undefined) return true;
      const probe = engineFrom(engine.getItems().map((i) => ({ ...i })));
      return probe.add({ id: '\u0000probe', x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h), autoPosition: true }) !== null;
    },
    cellOf(id) {
      const it = engine.getItem(id);
      return it ? { x: it.x, y: it.y, w: it.w, h: it.h } : undefined;
    },
    cellRectOf(id) {
      const it = engine.getItem(id);
      return it ? cellToRect(it, frame(), geom(), rows()) : undefined;
    },
    planRemoval(id) {
      const it = engine.getItem(id);
      if (!it) return [];
      // A float:false engine PACKS as it is built, in ARRAY order — so a tile
      // that entered the engine last (one just adopted by a drop) is packed
      // last, and everything above it in the array floats up through the room
      // it occupies. The plan then "moved" tiles the removal never touched and
      // undid the drop's own push (L64: B back onto the cell the torn-out
      // group had just taken, and the group auto-placed into the hole the
      // closed container left). Packing in row-then-column order is gravity,
      // whatever order the tiles arrived in.
      const clone = new GridPackEngine(
        engine
          .getItems()
          .map((i) => ({ ...i }))
          .sort((a, b) => a.y - b.y || a.x - b.x),
        { columns, float }
      );
      clone.remove(id);
      const f = frame();
      const g = geom();
      const rAfter = Math.max(1, clone.rows());
      const deltas: TileDelta[] = [];
      for (const item of clone.getItems()) {
        const before = engine.getItem(item.id);
        const e = memberEntity(item.id);
        if (!before || !e) continue;
        const target = cellToRect(item, f, g, rAfter);
        deltas.push({
          id: item.id,
          locked: !!item.locked,
          isGroup: isGroupMember(item.id),
          cellBefore: { x: before.x, y: before.y, w: before.w, h: before.h },
          cellAfter: { x: item.x, y: item.y, w: item.w, h: item.h },
          posBefore: { x: e.position.x, y: e.position.y },
          posAfter: { x: target.x, y: target.y },
          sizeBefore: (({ width, height, depth }) => ({ width, height, depth }))(sizeOf(e)),
          sizeAfter: { width: target.width, height: target.height },
        });
      }
      return tileCommands(deltas);
    },
    moveTo(id, x, y) {
      return programmatic('Move widget', id, () => engine.moveCheck(id, x, y, { pushSolid: isGroupMember(id) }).changed);
    },
    resizeTo(id, w, h) {
      const hh = isGroupMember(id) ? Math.max(h, innerRowsOf(id)) : h; // a section: never below its children
      return programmatic('Resize widget', id, () => engine.resizeCheck(id, w, hh).changed);
    },
    beginPaletteDrag,
    dispose(): void {
      if (disposed) return;
      cancelActiveGesture(false);
      disposed = true;
      peersOnCanvas().delete(selfPeer);
      unregisterTool();
      api.container.removeEventListener('pointermove', chrome.onHover);
      api.container.removeEventListener('pointerleave', chrome.onHoverLeave);
      api.container.removeEventListener('focusin', keyboard.onFocusIn);
      api.container.removeEventListener('keydown', keyboard.onKey);
      containerObserver?.disconnect();
      tearing = null;
      for (const off of subs) off();
      // The corner handles are THIS binder's affordance: a board re-bound as a
      // split layout must not keep showing a resize corner it cannot act on.
      for (const id of group.members ?? []) hostOf(id)?.querySelector(':scope > .axdb-rs')?.remove();
      chrome.dispose(); // slabs, frames, the refused cell, the carried subtree, the host observer, the static guard
      projection.dispose(); // the placeholder, the glide timer, a pending ghost
      api.container.style.cursor = '';
    },
  };

  // Boot: adopt the current members (PACKED — a declared cell hovering over an
  // empty row settles, the documented contract), observe host churn for handle
  // re-injection, and let a responsive board settle on the count its width asks
  // for before the first frame (a 400px board declared at 12 columns must not
  // flash at 12).
  rebuild(true);
  const layer = htmlLayer();
  if (layer) chrome.observe(layer);
  containerObserver?.observe(api.container);

  return handle;
}
