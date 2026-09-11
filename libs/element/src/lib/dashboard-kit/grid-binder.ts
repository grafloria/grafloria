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
import { LiveRegionController, registerTool, type CanvasTool, type ToolPointerEvent } from '@grafloria/renderer';
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
   * `cell` in its gridItem, already placed in the engine) through the page's
   * command path, folding `displaced` into the same batch.
   */
  onDropIn?: (node: NodeModel, cell: CellRect, displaced: Command[]) => void | Promise<void>;
  /**
   * A member is about to LEAVE this board through a gesture (moved into
   * another board, made a tab of its own). Answers the commands that follow
   * it in the same batch — a tab page emptied by the move closes.
   */
  onMemberLeaving?: (memberId: string) => Command[];
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

/** A painted grip: the only drag zone, placed along the card's top edge. */
export interface DragGripOptions {
  grip: true;
  /** Where along the top edge. Default 'left'. */
  position?: 'left' | 'center' | 'right';
  /** In the header band, or a tab above the card. Default 'inside'. */
  placement?: 'inside' | 'outside';
}
export type DragHandleOption = boolean | string | DragGripOptions;

/** The class of the painted grip element (a child of the node host). */
export const GRIP_CLASS = 'axdb-grip';
/** The container class that turns the caption strip's grip dots on. */
export const DRAG_HANDLE_CLASS = 'axdb-drag-handle';

/** A `dragHandle` value with its defaults filled in — the form the handle reports. */
export const normalizeDragHandle = (v: DragHandleOption | undefined): DragHandleOption =>
  typeof v === 'object' && v !== null && v.grip
    ? { grip: true, position: v.position ?? 'left', placement: v.placement ?? 'inside' }
    : v === true ? true : typeof v === 'string' && v.length > 0 ? v : false;
/** The selector a `dragHandle` value names — `null` when the whole card is the handle. */
export const dragHandleSelector = (v: DragHandleOption): string | null =>
  v === true ? '.axdb-widget-h' : typeof v === 'string' ? v : typeof v === 'object' ? '.' + GRIP_CLASS : null;
/** The grip config of a value, or null when it paints no grip. */
export const gripOf = (v: DragHandleOption): DragGripOptions | null => (typeof v === 'object' ? v : null);
const sameDragHandle = (a: DragHandleOption, b: DragHandleOption): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Paint (or remove) the grip on one host, and stamp the host with the grip's
 * placement so the header can make room for it. `movable` false = no grip.
 */
export function syncGrip(host: HTMLElement, cfg: DragGripOptions | null, movable: boolean): void {
  const existing = host.querySelector(':scope > .' + GRIP_CLASS);
  host.classList.remove('axdb-gp-inside', 'axdb-gp-outside', 'axdb-gp-left', 'axdb-gp-center', 'axdb-gp-right');
  if (!cfg || !movable) {
    existing?.remove();
    return;
  }
  const el = (existing as HTMLElement | null) ?? host.ownerDocument.createElement('div');
  if (!existing) {
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('title', 'Drag');
    host.appendChild(el);
  }
  el.className = `${GRIP_CLASS} ${GRIP_CLASS}--${cfg.position ?? 'left'} ${GRIP_CLASS}--${cfg.placement ?? 'inside'}`;
  host.classList.add(`axdb-gp-${cfg.placement ?? 'inside'}`, `axdb-gp-${cfg.position ?? 'left'}`);
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
export function gripHostOf(target: Element | null): HTMLElement | null {
  const grip = target?.closest?.('.' + GRIP_CLASS);
  return (grip?.closest('.grafloria-node-host') as HTMLElement | null) ?? null;
}
/**
 * Did a press land on the drag handle? A press INSIDE the handle element
 * always does. The default handle is a CAPTION BAR the DevExpress way: the
 * strip from the card's top edge down to the header's bottom, padding
 * included — so the pointer need not hit the header's text to grab the tile.
 */
export function pressOnDragHandle(sel: string, target: Element | null, hostEl: HTMLElement | null, clientX: number, clientY: number): boolean {
  const grip = target?.closest?.(sel) ?? null;
  if (grip && (!hostEl || hostEl.contains(grip))) return true;
  if (sel !== '.axdb-widget-h' || !hostEl) return false;
  const hr = hostEl.getBoundingClientRect();
  const header = hostEl.querySelector('.axdb-widget-h');
  // A host painting its own content has no kit header: its caption is the top
  // band of the card, so `dragHandle: true` still means something there.
  const bottom = header ? header.getBoundingClientRect().bottom : hr.top + CAPTION_BAND;
  return clientX >= hr.left && clientX <= hr.right && clientY >= hr.top && clientY <= bottom;
}
/** The caption strip of a host with no kit header, px from the card's top. */
export const CAPTION_BAND = 28;

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
  stripIndex(targetId: string, clientX: number, clientY: number): number | null;
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

/** A torn-out page never arrives shorter than this: a strip with no room under it is not a group. */
export const TEAR_OUT_MIN_ROWS = 2;

/**
 * Steps that depend on each other's RESULT — create a group, then move a page
 * into it, then place the group on the board; or remove a member and then the
 * group it emptied — run as one history step. A batch checks every member's
 * `canExecute` before running any of them and every member's `canUndo` before
 * undoing any, and a membership command's precondition (its group exists) is
 * exactly what a neighbouring step creates or removes. This runs the chain in
 * order and reverses it on undo, judging nothing up front.
 */
export class SequenceCommand extends Command {
  constructor(name: string, private steps: Command[]) {
    super(name);
  }
  override execute(context: Parameters<Command['execute']>[0]): void {
    for (const c of this.steps) c.execute(context);
  }
  override undo(context: Parameters<Command['undo']>[0]): void {
    for (let i = this.steps.length - 1; i >= 0; i--) this.steps[i].undo(context);
  }
  override canExecute(): boolean {
    return true;
  }
  override canUndo(): boolean {
    return true;
  }
  override serialize() {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { steps: this.steps.map((c) => c.serialize()) } };
  }
}

/**
 * A WIDGET dropped on a tab strip becomes a new tab there (a tab dropped on
 * one joins; a widget wraps into a page of its own first). The dashboard
 * handle owns the strips and the registry; the binder owns the gesture.
 */
export interface TabDropHooks {
  /** The strip under a CLIENT point, and the tab index that point means along it. */
  stripAt(clientX: number, clientY: number): { containerId: string; index: number } | null;
  /** Paint (or, with null, clear) the insertion mark on a strip. */
  markDrop(containerId: string | null, index: number | null): void;
  /** The commands that make `widgetId` a new tab of `containerId` at `index`; `displaced` are this board's survivors. Empty = refused. */
  dropIntoStrip(widgetId: string, containerId: string, index: number, sourceBoardId: string, displaced: Command[]): Command[];
}

interface AdoptOptions {
  /**
   * 'shrink': take the cell under the pointer at the height that FITS there
   * (down to TEAR_OUT_MIN_ROWS) before looking for another row — a torn-out
   * page takes the room where it lands, the way a torn-out editor does. The
   * default keeps the tile's size and finds the nearest cell that takes it.
   */
  fit?: 'shrink';
  /** Anchor the tile's TOP edge at the pointer instead of centring it (the pointer holds a tab, the page hangs below it). */
  anchor?: 'top';
}

interface AdoptedLeg {
  groupId: string;
  /** Drive the target engine from the source binder's pointer stream. */
  move(world: { x: number; y: number }): void;
  /**
   * Take the tile OFF the board while the pointer is somewhere the board is
   * not the target (over a group the page will join instead); the tiles it
   * displaced come home. `enter` puts it back at the pointer.
   */
  leave(): void;
  enter(world: { x: number; y: number }): void;
  /** Put the tile at a PRESCRIBED cell (a split's half, a docking band): sized to it, unlocked tiles pushed. Answers whether it sits there. */
  place(cell: { x: number; y: number; w: number; h: number }): boolean;
  /** Every other tile's cell before the ghost entered — the layout a row insert translates. */
  baseline(): Map<string, CellRect>;
  /** Where the tile sits right now, or null while it is off the board. */
  cell(): CellRect | null;
  /** That cell in world space, by the adopting board's own geometry. */
  rect(): WorldRect | null;
  /** Undo the adoption: target board back to its pre-entry layout. */
  abort(): void;
  /**
   * Close the leg for commit: returns the target-side displaced commands, the
   * tile's final cell and its projected rect — and the member GROUPS the
   * adoption moved (the node commands skip groups; a dock that pushed sections
   * commits them through these). Null when the tile is somehow gone.
   */
  finalize(): {
    commands: Command[];
    cell: CellRect;
    rect: WorldRect;
    groups: Array<{ id: string; cellBefore: CellRect; cellAfter: CellRect; frameBefore: WorldRect; frameAfter: WorldRect }>;
  } | null;
}

/**
 * Binders on the same canvas find each other here. A WeakMap: a canvas that
 * is gone takes its (empty) peer set with it — the strong Map it replaced kept
 * every container element a dashboard had ever mounted for the life of the
 * page (review D12).
 */
const BOARD_REGISTRY = new WeakMap<HTMLElement, Set<BinderPeer>>();

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
 * ONE aria-live region per canvas, shared by every board on it — the
 * renderer's own controller (coalescing, de-duplicating), so a dashboard
 * announces through the same channel a diagram does. WeakMap: the region
 * follows the container out of memory.
 */
const LIVE_REGIONS = new WeakMap<HTMLElement, LiveRegionController>();
function liveRegionFor(container: HTMLElement): LiveRegionController {
  let live = LIVE_REGIONS.get(container);
  if (!live) {
    live = new LiveRegionController(container);
    LIVE_REGIONS.set(container, live);
  }
  return live;
}

function directionName(dx: number, dy: number): string {
  return dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
}

/** "column 4, row 2, 3 by 1" — the cell as a person hears it (1-based). */
function describeCell(c: CellRect): string {
  return `column ${c.x + 1}, row ${c.y + 1}, ${c.w} by ${c.h}`;
}

/**
 * Undoable cell+frame write for a GROUP member (the strip's slab). The engine
 * has Move/Resize commands for nodes but none for a group's frame, and slab
 * cells live in group metadata — this closes nested height escalation into
 * the gesture's single BatchCommand so one undo restores the strip too.
 */
class SetGroupCellCommand extends Command {
  constructor(
    private groupId: string,
    private cellBefore: CellRect,
    private cellAfter: CellRect,
    private frameBefore: WorldRect,
    private frameAfter: WorldRect
  ) {
    super('Resize section');
  }

  private apply(context: { diagram?: unknown }, cell: CellRect, frame: WorldRect): void {
    const diagram = context.diagram as DiagramModel | undefined;
    const grp = diagram?.getGroup(this.groupId);
    if (!grp) return;
    grp.setMetadata('gridItem', gridItemFromCell(cell));
    grp.setFrame({ ...frame });
  }

  override execute(context: { diagram?: unknown }): void {
    this.apply(context, this.cellAfter, this.frameAfter);
  }

  override undo(context: { diagram?: unknown }): void {
    this.apply(context, this.cellBefore, this.frameBefore);
  }

  override serialize() {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        cellBefore: this.cellBefore,
        cellAfter: this.cellAfter,
        frameBefore: this.frameBefore,
        frameAfter: this.frameAfter,
      },
    };
  }
}

interface GestureState {
  kind: 'move' | 'resize' | 'palette';
  id: string;
  node: NodeModel;
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
const GLIDE_OFF_DELAY = 400;
/** A press this close (CSS px) to a tile's border takes that edge for a resize. */
export const EDGE_GRIP = 7;

export interface ResizeEdges {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}
const NO_EDGES: ResizeEdges = { n: false, e: false, s: false, w: false };

/** Which of a host's edges a client point is within EDGE_GRIP of (none when outside). */
function edgesNear(host: Element, cx: number, cy: number): ResizeEdges {
  const r = host.getBoundingClientRect();
  if (cx < r.left - 2 || cx > r.right + 2 || cy < r.top - 2 || cy > r.bottom + 2) return NO_EDGES;
  return {
    n: cy - r.top <= EDGE_GRIP,
    s: r.bottom - cy <= EDGE_GRIP,
    w: cx - r.left <= EDGE_GRIP,
    e: r.right - cx <= EDGE_GRIP,
  };
}

export const anyEdge = (E: ResizeEdges): boolean => E.n || E.e || E.s || E.w;

/** The resize cursor for a set of edges ('' when none). */
function cursorFor(E: ResizeEdges): string {
  const v = E.n || E.s;
  const h = E.e || E.w;
  if (v && h) return (E.n && E.w) || (E.s && E.e) ? 'nwse-resize' : 'nesw-resize';
  if (v) return 'ns-resize';
  if (h) return 'ew-resize';
  return '';
}

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
  let placeholder: HTMLElement | null = null;
  /** Foreign tile currently adopted from another binder's gesture. */
  let adoptedGhostId: string | null = null;
  /** The tab page this board is currently tearing out of a container, if any. */
  let tearing: string | null = null;
  let glideTimer: ReturnType<typeof setTimeout> | null = null;
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;

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
    // Member groups are LOCKED slabs (see the module doc).
    if (cell) return { id, ...cell, locked: true };
    return { id, x: 0, y: 0, w: columns, h: 1, locked: true, autoPosition: true };
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

  // -- projection: cells -> pixels -------------------------------------------

  /** Write one member's projected rect (derived state → system write). */
  const writeRect = (id: string, r: WorldRect): void => {
    const node = diagram.getNode(id);
    if (node) {
      if (
        Math.abs(node.position.x - r.x) > 0.25 ||
        Math.abs(node.position.y - r.y) > 0.25 ||
        Math.abs(node.size.width - r.width) > 0.25 ||
        Math.abs(node.size.height - r.height) > 0.25
      ) {
        diagram.runSystemWrite(() => {
          node.setPosition(r.x, r.y);
          node.setSize(r.width, r.height, node.size.depth ?? 0);
        });
      }
      return;
    }
    const grp = diagram.getGroup(id);
    if (grp) {
      const p = grp.position;
      const s = sizeOf(grp);
      if (
        Math.abs(p.x - r.x) > 0.25 ||
        Math.abs(p.y - r.y) > 0.25 ||
        Math.abs(s.width - r.width) > 0.25 ||
        Math.abs(s.height - r.height) > 0.25
      ) {
        diagram.runSystemWrite(() => grp.setFrame({ ...r }));
      }
    }
  };

  /** Enforce the board-frame height the sizing mode implies. */
  const enforceBoardHeight = (): void => {
    if (designH <= 0) return;
    const r = rows();
    // FIT keeps its design height, full stop — the user's rule: "the board
    // stays the same and the widgets change size so all of them fit". Only
    // overflow:'scroll' lets the frame EXTEND to hold the rows at the floor
    // height (and the canvas pan). Grow extends at the base row height.
    const target =
      sizing === 'fit'
        ? overflow === 'scroll'
          ? Math.max(designH, 2 * padding + r * minRowHeight + (r - 1) * gap)
          : designH
        : Math.max(designH, 2 * padding + r * baseRowHeight + (r - 1) * gap);
    const f = frame();
    if (Math.abs(f.height - target) > 0.5) {
      writing = true;
      try {
        diagram.runSystemWrite(() =>
          group.setFrame({ x: f.x, y: f.y, width: f.width, height: target })
        );
      } finally {
        writing = false;
      }
    }
  };

  /** Project every member from its engine cells (the ghost is exempt). */
  const project = (): void => {
    enforceBoardHeight();
    writing = true;
    try {
      const f = frame();
      const g = geom();
      const r = rows();
      for (const item of engine.getItems()) {
        if (gesture?.started && item.id === gesture.id) continue; // the ghost
        if (item.id === adoptedGhostId) continue; // a ghost adopted from another binder
        writeRect(item.id, cellToRect(item, f, g, r));
      }
    } finally {
      writing = false;
    }
    syncPlaceholder();
    // The section overlays are projected chrome like the placeholder: they
    // follow every frame write, not only a rebuild. Painted at bind time only,
    // a section two levels down kept the geometry of its parent's placeholder
    // frame (100 × 34) after the view board had laid the parent out (the kit
    // lab's L47, 2026-09-08).
    syncSlabs();
  };

  // -- placeholder / ghost chrome --------------------------------------------

  /** The placeholder exists ONLY while a gesture is live — so at any moment
   *  the DOM holds at most one `.axdb-ph` per active gesture, not one idle
   *  div per bound board. */
  const syncPlaceholder = (): void => {
    const ghostId =
      adoptedGhostId ?? (gesture?.started && !gesture.removedFromBoard ? gesture.id : null);
    const item = ghostId ? engine.getItem(ghostId) : undefined;
    const live = !!item;
    if (!live || !item) {
      placeholder?.remove();
      placeholder = null;
      return;
    }
    const layer = htmlLayer();
    if (!layer) return;
    if (!placeholder || placeholder.parentElement !== layer) {
      placeholder?.remove();
      placeholder = document.createElement('div');
      placeholder.className = 'axdb-ph';
      layer.prepend(placeholder);
    }
    const r = cellToRect(item, frame(), geom(), rows());
    placeholder.style.display = 'block';
    placeholder.style.left = `${r.x}px`;
    placeholder.style.top = `${r.y}px`;
    placeholder.style.width = `${r.width}px`;
    placeholder.style.height = `${r.height}px`;
  };

  const armGlide = (): void => {
    htmlLayer()?.classList.add('axdb-glide');
    if (glideTimer) clearTimeout(glideTimer);
  };

  const disarmGlideSoon = (): void => {
    if (glideTimer) clearTimeout(glideTimer);
    glideTimer = setTimeout(() => htmlLayer()?.classList.remove('axdb-glide'), GLIDE_OFF_DELAY);
  };

  /** The host whose ghost class the pending timer will lift. */
  let ghostHost: HTMLElement | null = null;
  /**
   * Lift a pending ghost NOW. One timer serves every host, so superseding it
   * (a new gesture within 60 ms of the last drop — ③ then ④ in the
   * nested-containers checks — or a dispose on a rebind) used to clear the
   * timer and leave the previous tile lifted for good: a permanent drop
   * shadow the visual gate finally caught.
   */
  const flushGhost = (): void => {
    if (ghostTimer) clearTimeout(ghostTimer);
    ghostTimer = null;
    ghostHost?.classList.remove('axdb-ghost', 'axdb-out');
    ghostHost = null;
  };
  const setGhost = (id: string, on: boolean): void => {
    const host = hostOf(id);
    if (!host) return;
    if (ghostHost && ghostHost !== host) flushGhost();
    if (on) {
      if (ghostTimer) clearTimeout(ghostTimer);
      ghostTimer = null;
      host.classList.add('axdb-ghost');
      host.classList.remove('axdb-out');
      ghostHost = host;
    } else {
      host.classList.remove('axdb-out');
      // Keep transition-exemption through the drop write so the snap into the
      // placeholder is INSTANT (gridstack-style), then let glides resume.
      if (ghostTimer) clearTimeout(ghostTimer);
      ghostHost = host;
      ghostTimer = setTimeout(() => {
        host.classList.remove('axdb-ghost');
        ghostTimer = null;
        if (ghostHost === host) ghostHost = null;
      }, 60);
    }
  };

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

  /**
   * The chrome on every member host: the painted grip (or none) and the corner
   * resize handle — ONE host lookup per member, which the host observer's
   * budget counts (a repaint of one host must cost that host's lookup, not a
   * second pass).
   */
  const syncHandles = (only?: ReadonlySet<string>): void => {
    syncA11y(only);
    if (disposed) return;
    ensureStaticGuard();
    syncSlabs();
    const grip = gripOf(dragHandle);
    for (const id of group.members ?? []) {
      if (only && !only.has(id)) continue;
      const node = diagram.getNode(id);
      if (!node) continue;
      const host = hostOf(id);
      if (!host) continue;
      syncGrip(host, grip, node.state?.locked !== true && !isStatic && node.getMetadata?.('widgetMovable') !== false);
      if (!wantHandles) continue;
      const existing = host.querySelector(':scope > .axdb-rs');
      if (node.state?.locked === true || isStatic || node.getMetadata?.('widgetResizable') === false) {
        existing?.remove();
        continue;
      }
      const rs = existing ?? document.createElement('div');
      if (!existing) {
        rs.className = 'axdb-rs';
        rs.setAttribute('title', 'Resize');
        host.appendChild(rs);
      }
      // The grab corner mirrors with the board: bottom-right LTR, bottom-left
      // RTL — the same corner the tile actually grows from in each direction.
      rs.classList.toggle('axdb-rs--rtl', rtl);
    }
  };

  /**
   * Only a HOST-LEVEL change matters: a host arriving (a mount) or a host's
   * own children changing (a repaint that wiped the injected handle). A
   * chart's internal churn — most of what a live dashboard mutates — targets
   * deeper nodes and is ignored, and the hosts the records DO name are the
   * only ones re-synced. This was members × repaints `querySelector` calls
   * per wave (9,216 at 96 widgets, review D10); it is now proportional to the
   * hosts that actually changed.
   */
  const hostObserver = new MutationObserver((records) => {
    const touched = new Set<string>();
    const noteHost = (el: Node | null): void => {
      const e = el as Element | null;
      if (e?.classList?.contains('grafloria-node-host')) {
        const id = e.getAttribute('data-node-id');
        if (id) touched.add(id);
      }
    };
    for (const r of records) {
      // Our own re-injected handle arriving is not a change to answer — it
      // would echo one more pass per repaint.
      const ownEcho =
        r.removedNodes.length === 0 &&
        r.addedNodes.length > 0 &&
        Array.from(r.addedNodes).every((n) => (n as Element).classList?.contains('axdb-rs'));
      if (ownEcho) continue;
      noteHost(r.target);
      r.addedNodes.forEach((n) => noteHost(n));
    }
    if (touched.size) syncHandles(touched);
  });

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

  /** The member groups a gesture displaced, as their own cell commands — `buildCommitCommands` skips groups by design. */
  const groupCellCommands = (deltas: TileDelta[]): Command[] => {
    const out: Command[] = [];
    for (const d of deltas) {
      if (!d.isGroup || (d.cellBefore.x === d.cellAfter.x && d.cellBefore.y === d.cellAfter.y && d.cellBefore.w === d.cellAfter.w && d.cellBefore.h === d.cellAfter.h)) continue;
      const og = diagram.getGroup(d.id);
      if (!og) continue;
      out.push(new SetGroupCellCommand(d.id, d.cellBefore, d.cellAfter, { x: d.posBefore.x, y: d.posBefore.y, width: d.sizeBefore.width, height: d.sizeBefore.height }, frameOfGroup(og)));
    }
    return out;
  };

  const execute = (name: string, commands: Command[]): boolean => {
    if (commands.length === 0) return false;
    void api.getEngine().commandManager.execute(new BatchCommand(name, commands));
    return true;
  };

  // -- membership + bounds sync ----------------------------------------------

  const onMemberAdded = (id: string): void => {
    if (disposed) return;
    if (!engine.getItem(id)) {
      const item = itemFor(id);
      let placed = engine.add(item);
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
  const EDGE_GRACE = 60;
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
   * SECTION CHROME. A section (member group) paints no card of its own, so it
   * had nothing to press: a click on its empty band cleared the selection and
   * its frame had no handle and no edge — a section with many children could
   * not be selected at all, and could only be resized by pulling a child
   * (Quantia, Groups page). Every section gets a pointer-transparent overlay
   * in the HTML layer that wears the selection ring and, while selected, the
   * corner handle; its frame edges answer the resize cursor.
   */
  const slabEls = new Map<string, HTMLElement>();
  /**
   * GROUP FRAME (0.4.43): a TAB CONTAINER wears a frame by default — its slab
   * is bordered and a tinted surface lies under its pages, first in the layer
   * so the tiles paint over it. A page torn out with two widgets under its tab
   * read as a strip floating over two loose cards: nothing said the second
   * card was the tab's. A plain section keeps its invisible slab.
   */
  const groupBgs = new Map<string, HTMLElement>();
  const syncGroupBg = (layer: HTMLElement, id: string, on: boolean, x: number, y: number, w: number, h: number): void => {
    let bg = groupBgs.get(id) ?? null;
    if (!on) {
      bg?.remove();
      groupBgs.delete(id);
      return;
    }
    if (!bg || bg.parentElement !== layer) {
      bg?.remove();
      bg = document.createElement('div');
      bg.className = 'axdb-group-bg';
      bg.setAttribute('data-group-bg', id);
      layer.prepend(bg);
      groupBgs.set(id, bg);
    }
    bg.style.left = `${x}px`;
    bg.style.top = `${y}px`;
    bg.style.width = `${w}px`;
    bg.style.height = `${h}px`;
  };
  const isTabsGroup = (grp: GroupModel): boolean => (grp.getMetadata('containerWidget') as { layout?: string } | undefined)?.layout === 'tabs';
  /**
   * A TAB CONTAINER's frame is its drag handle (0.4.43): its 8-px margin —
   * under the strip, beside the pages — moves the group, so the edge-resize
   * zone shrinks to 3 px there (the corner handle still resizes). A section's
   * edges keep the full grip: its empty band is a drop target, not a handle.
   */
  const TAB_FRAME_GRIP = 3;
  const edgeGripFor = (grp: GroupModel): number => (isTabsGroup(grp) ? TAB_FRAME_GRIP : EDGE_GRIP);
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
   * The hover MOVES NOTHING (0.4.47): the ghost leaves the board and an
   * overlay marks the cell the widget will take — the 0.4.42 model for a
   * tab's split and dock. The shift, or the push a top/bottom band needs,
   * happens on release. Until then the container shifted or was pushed as
   * the pointer entered the band, and on a 3440-px desktop the user's panel
   * jumped DOWN as a widget crossed its top band on the way to its right.
   * The left and right bands win the corners (VS Code's precedence): a
   * one-row widget carried along the top of a tall panel to its far right
   * means "after it", not "above it".
   */
  type BesideSide = 'left' | 'right' | 'top' | 'bottom';
  const BESIDE_BAND = 0.2;
  /** How much wider the band is for a pointer ALREADY in it — a hand resting on the boundary must not flicker between beside and into. */
  const BESIDE_STAY = 0.05;
  /** The outer band of a container FRAME the point is in — null in the strip, in the middle, or outside. */
  const bandOf = (f: WorldRect, wx: number, wy: number, band = BESIDE_BAND): BesideSide | null => {
    if (wx < f.x || wx > f.x + f.width || wy < f.y || wy > f.y + f.height) return null;
    const bodyY = f.y + TAB_STRIP_HEIGHT;
    const bodyH = Math.max(1, f.height - TAB_STRIP_HEIGHT);
    const rx = (wx - f.x) / Math.max(1, f.width);
    const ry = (wy - bodyY) / bodyH;
    if (ry < 0) return null; // the strip: a new tab, the strip's own business
    if (rx < band) return 'left'; // the sides first: they take the corners
    if (rx > 1 - band) return 'right';
    if (ry < band) return 'top';
    if (ry > 1 - band) return 'bottom';
    return null; // the middle: into the page
  };
  const besideZoneAt = (wx: number, wy: number): { id: string; side: BesideSide } | null => {
    for (const id of group.members ?? []) {
      const grp = diagram.getGroup(id);
      if (!grp || diagram.getNode(id) || !isTabsGroup(grp)) continue;
      const side = bandOf(frameOfGroup(grp), wx, wy);
      if (side) return { id, side };
    }
    return null;
  };
  /** The BESIDE promise the overlay shows: the cell the widget takes on release, and where the container shifts to make it (null: it is pushed, or has room). */
  let beside: { id: string; side: BesideSide; cell: { x: number; y: number }; shiftTo: { x: number; y: number } | null } | null = null;
  let besideEl: HTMLElement | null = null;
  const showBesideOverlay = (r: WorldRect): void => {
    const layer = htmlLayer();
    if (!layer) return;
    if (!besideEl || besideEl.parentElement !== layer) {
      besideEl?.remove();
      besideEl = document.createElement('div');
      besideEl.className = 'axdb-join';
      layer.prepend(besideEl);
    }
    besideEl.style.left = `${r.x}px`;
    besideEl.style.top = `${r.y}px`;
    besideEl.style.width = `${r.width}px`;
    besideEl.style.height = `${r.height}px`;
  };
  const hideBesideOverlay = (): void => {
    besideEl?.remove();
    besideEl = null;
  };
  /** The promise withdrawn (the pointer left, the gesture ended) or kept (realized and committed): the overlay goes, the container and the others relock. */
  const endBeside = (): void => {
    if (!beside) return;
    const it = engine.getItem(beside.id);
    if (it) it.locked = true;
    relockOthersForSlab();
    hideBesideOverlay();
    beside = null;
  };
  /** Where a widget of this span lands beside the container, and where the container goes to make room — from the layout AT REST, since nothing moves while held. */
  const besidePlan = (tc: GridPackItem, side: BesideSide, w: number): { cell: { x: number; y: number }; shiftTo: { x: number; y: number } | null } => {
    let cell: { x: number; y: number };
    let shiftTo: { x: number; y: number } | null = null;
    switch (side) {
      case 'right':
        cell = { x: tc.x + tc.w, y: tc.y };
        if (cell.x + w > columns) {
          shiftTo = { x: columns - w - tc.w, y: tc.y };
          cell = { x: columns - w, y: tc.y };
        }
        break;
      case 'left':
        cell = { x: tc.x - w, y: tc.y };
        if (cell.x < 0) {
          shiftTo = { x: w, y: tc.y };
          cell = { x: 0, y: tc.y };
        }
        break;
      case 'top':
        cell = { x: Math.max(0, Math.min(tc.x, columns - w)), y: tc.y }; // the widget takes the container's rows; the container is pushed down under it
        break;
      default:
        cell = { x: Math.max(0, Math.min(tc.x, columns - w)), y: tc.y + tc.h };
    }
    if (shiftTo && shiftTo.x < 0) shiftTo = null; // no room even shifted: the widget goes where it can
    return { cell, shiftTo };
  };
  const applyBeside = (g: GestureState, z: { id: string; side: BesideSide }): void => {
    const tc = engine.getItem(z.id);
    if (!tc) return;
    if (g.leg) {
      g.leg.adopted.abort();
      g.leg = null;
    }
    // The ghost leaves the board, as it does over a strip: the survivors
    // settle home and nothing under the hand moves until the release.
    if (!g.removedFromBoard) {
      g.removedFromBoard = true;
      engine.remove(g.id);
      project();
    }
    hostOf(g.id)?.classList.remove('axdb-out');
    const plan = besidePlan(tc, z.side, g.spans.w);
    if (!beside || beside.id !== z.id || beside.side !== z.side || beside.cell.x !== plan.cell.x || beside.cell.y !== plan.cell.y) {
      beside = { id: z.id, side: z.side, cell: plan.cell, shiftTo: plan.shiftTo };
      showBesideOverlay(cellToRect({ x: plan.cell.x, y: plan.cell.y, w: g.spans.w, h: g.spans.h }, frame(), geom(), rows()));
    }
  };
  /**
   * The release: the container shifts (or is pushed) and the ghost takes the
   * promised cell — for real now, so the commit's deltas carry both. The
   * ghost steps back on at the bottom edge first: the engine will not push
   * the dragged tile, so a chart as wide as the panel had its own cell as the
   * panel's target and the shift was refused (lab L94).
   */
  const realizeBeside = (g: GestureState): void => {
    if (!beside) return;
    const tc = engine.getItem(beside.id);
    if (!tc) return;
    const w = g.spans.w;
    const h = g.spans.h;
    // The other sections give way to the shift the way they give way to a
    // moved group (0.4.44): on the demo the Operations section spans the
    // row under the panel and a locked tile refused the shift outright.
    unlockOthersForSlab(beside.id);
    tc.locked = false; // it shifts, or the ghost pushes it
    if (beside.shiftTo && (tc.x !== beside.shiftTo.x || tc.y !== beside.shiftTo.y)) engine.moveCheck(beside.id, beside.shiftTo.x, beside.shiftTo.y, { gate: false });
    if (g.removedFromBoard) {
      g.removedFromBoard = false;
      hostOf(g.id)?.classList.remove('axdb-out');
    }
    if (!engine.getItem(g.id)) engine.add({ id: g.id, x: 0, y: engine.rows(), w, h });
    if (!engine.moveCheck(g.id, beside.cell.x, beside.cell.y, { gate: false }).changed) {
      const at = engine.getItem(g.id);
      if (!at || at.x !== beside.cell.x || at.y !== beside.cell.y) placeNear(g.id, beside.cell.x, beside.cell.y, w);
    }
    project();
  };
  /**
   * CARRIED (0.4.43): a group dragged by its strip or band moves as ONE thing.
   * The held TILE is transition-exempt (the ghost), but a group has no host of
   * its own: its strip jumped to the pointer while its pages' tiles GLIDED
   * after it — on the live demo the content trailed the strip by up to 140 px
   * at every step. Everything in the group's subtree — tiles, strips, slabs,
   * the surface — is exempt for the gesture and, like the ghost, through the
   * drop write; then the glides resume.
   */
  const carriedEls = new Set<Element>();
  let carriedTimer: ReturnType<typeof setTimeout> | null = null;
  const subtreeIds = (id: string): { groups: string[]; nodes: string[] } => {
    const groups: string[] = [];
    const nodes: string[] = [];
    const queue = [id];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const grp = diagram.getGroup(cur);
      if (grp) {
        groups.push(cur);
        for (const m of grp.members ?? []) queue.push(m);
      } else if (diagram.getNode(cur)) nodes.push(cur);
    }
    return { groups, nodes };
  };
  const cssId = (id: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"'));
  const setCarried = (id: string, on: boolean): void => {
    const layer = htmlLayer();
    if (!layer) return;
    if (carriedTimer) {
      clearTimeout(carriedTimer);
      carriedTimer = null;
    }
    if (on) {
      const { groups, nodes } = subtreeIds(id);
      const els: Element[] = [];
      for (const n of nodes) {
        const h = hostOf(n);
        if (h) els.push(h);
      }
      for (const g of groups) {
        els.push(...Array.from(layer.querySelectorAll(`:scope > .axdb-tabs[data-tabs-id="${cssId(g)}"], :scope > .axdb-slab[data-slab-id="${cssId(g)}"], :scope > .axdb-group-bg[data-group-bg="${cssId(g)}"]`)));
      }
      for (const el of els) {
        el.classList.add('axdb-carried');
        carriedEls.add(el);
      }
      return;
    }
    carriedTimer = setTimeout(() => {
      for (const el of carriedEls) el.classList.remove('axdb-carried');
      carriedEls.clear();
      carriedTimer = null;
    }, 60);
  };
  const flushCarried = (): void => {
    if (carriedTimer) clearTimeout(carriedTimer);
    carriedTimer = null;
    for (const el of carriedEls) el.classList.remove('axdb-carried');
    carriedEls.clear();
  };
  let slabLayer: HTMLElement | null = null;
  const syncSlabs = (): void => {
    if (disposed) return;
    const layer = slabLayer?.isConnected ? slabLayer : (slabLayer = htmlLayer());
    if (!layer) return;
    const seen = new Set<string>();
    for (const id of group.members ?? []) {
      const grp = diagram.getGroup(id);
      if (!grp || diagram.getNode(id)) continue;
      seen.add(id);
      let el = slabEls.get(id);
      if (!el || el.parentElement !== layer) {
        el?.remove();
        el = document.createElement('div');
        el.className = 'axdb-slab';
        el.setAttribute('data-slab-id', id);
        const rs = document.createElement('div');
        rs.className = 'axdb-rs';
        rs.setAttribute('title', 'Resize section');
        el.appendChild(rs);
        layer.appendChild(el);
        slabEls.set(id, el);
      }
      const p = grp.position;
      const sz = sizeOf(grp);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.width = `${sz.width}px`;
      el.style.height = `${sz.height}px`;
      el.classList.toggle('axdb-slab--selected', selectedId === id);
      el.classList.toggle('axdb-slab--static', isStatic);
      el.querySelector(':scope > .axdb-rs')?.classList.toggle('axdb-rs--rtl', rtl);
      const tabs = isTabsGroup(grp);
      el.classList.toggle('axdb-slab--tabs', tabs);
      syncGroupBg(layer, id, tabs, p.x, p.y, sz.width, sz.height);
      syncCaption(el, id, grp, sz.height);
    }
    for (const [id, el] of slabEls) {
      if (!seen.has(id)) {
        el.remove();
        hoverSlabs.delete(el);
        slabEls.delete(id);
        groupBgs.get(id)?.remove();
        groupBgs.delete(id);
      }
    }
  };

  /**
   * THE CAPTION BAND of a section, on its slab overlay. Painted from the
   * group's persisted caption; repainted only when its identity changes (the
   * options, RTL, static, the tier) so a custom `renderCaption` is not run
   * per frame. The band takes the pointer (the slab itself does not): a press
   * on it selects the section, an action fires, pass-through reaches content.
   */
  const syncCaption = (el: HTMLElement, id: string, grp: GroupModel, sectionH: number): void => {
    const cap = captionOfGroup(grp);
    let band = el.querySelector(':scope > .axdb-slab-h') as HTMLElement | null;
    if (!cap || !captionPainted(cap, isStatic)) {
      band?.remove();
      hoverSlabs.delete(el);
      el.classList.remove('axdb-slab--hot');
      el.removeAttribute('aria-label');
      el.removeAttribute('role');
      return;
    }
    if (cap.show === 'hover') hoverSlabs.add(el);
    else {
      hoverSlabs.delete(el);
      el.classList.remove('axdb-slab--hot');
    }
    const ctx = { rtl, static: isStatic, sectionH };
    const key = captionKey(cap, ctx);
    if (band && band.getAttribute('data-key') === key) {
      sizeCaptionBand(band, cap, sectionH); // the tier follows the live size
      return;
    }
    band?.remove();
    band = document.createElement('div');
    el.prepend(band);
    const render = options.renderCaption;
    paintCaptionBand(band, cap, {
      ...ctx,
      ...(render ? { render: (host: HTMLElement) => render(id, host) } : {}),
      onAction: (actionId: string) => options.onCaptionAction?.(id, actionId),
    });
    band.setAttribute('data-key', key);
    // A named group, so the caption text is the section's name in the
    // accessibility tree rather than a stray label on an unnamed div. (The
    // band is not a tab stop yet — the actions are deliberately out of the
    // tab order so a board keeps exactly ONE stop; see the plan.)
    if (cap.text) {
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', cap.text);
    } else {
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
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
  /** The slab gesture as it is NOW — read through a call so a guard's narrowing does not stick. */
  const currentSlab = (): SlabGesture | null => slabGesture;
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
    // A TOP or LEFT edge moves the slab's origin, and the engine refuses to
    // move a locked tile: the move never landed, only the resize did, and a
    // section pulled up by its caption grew DOWNWARD a row per pointer step
    // — 18 rows for a 2-row pull (identification round, F16). Unlocked for
    // its own gesture, as a move is; relocked on release.
    if (edges.n || edges.w) it.locked = false;
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
  let slabUnlocked: string[] = [];
  const unlockOthersForSlab = (id: string): void => {
    slabUnlocked = [];
    for (const o of engine.getItems()) {
      if (o.id !== id && o.locked && isGroupMember(o.id)) {
        o.locked = false;
        slabUnlocked.push(o.id);
      }
    }
  };
  const relockOthersForSlab = (): void => {
    for (const oid of slabUnlocked) {
      const o = engine.getItem(oid);
      if (o) o.locked = true;
    }
    slabUnlocked = [];
  };
  const beginSlabMove = (id: string, ev: ToolPointerEvent): void => {
    const grp = diagram.getGroup(id);
    const it = engine.getItem(id);
    if (!grp || !it || gesture || slabGesture || isStatic) return;
    engine.beginGesture();
    const snap = snapshotAll();
    it.locked = false;
    unlockOthersForSlab(id);
    slabGesture = {
      id,
      edges: NO_EDGES,
      pointerId: typeof PointerEvent !== 'undefined' && ev.source instanceof PointerEvent ? ev.source.pointerId : null,
      started: false,
      downScreen: { x: ev.screen.x, y: ev.screen.y },
      startCells: snap.cells,
      startGeom: snap.geoms,
      cellBefore: { x: it.x, y: it.y, w: it.w, h: it.h },
      frameBefore: frameOfGroup(grp),
      grab: { dx: grp.position.x - ev.world.x, dy: grp.position.y - ev.world.y },
      move: true,
    };
    capturePointer(slabGesture.pointerId);
    api.container.style.cursor = 'grabbing';
  };
  const relockSlab = (id: string): void => {
    const it = engine.getItem(id);
    if (it) it.locked = true;
  };
  /** The cell a slab move asked for and could not have — painted so the refusal is visible; null clears it. */
  let refusal: HTMLElement | null = null;
  const showRefusal = (cell: { x: number; y: number } | null, w: number, h: number): void => {
    const layer = htmlLayer();
    if (!cell || !layer) {
      refusal?.remove();
      refusal = null;
      api.container.style.cursor = slabGesture ? 'grabbing' : '';
      return;
    }
    if (!refusal || refusal.parentElement !== layer) {
      refusal?.remove();
      refusal = document.createElement('div');
      refusal.className = 'axdb-ph axdb-ph--no';
      layer.prepend(refusal);
    }
    const r = cellToRect({ x: cell.x, y: cell.y, w, h }, frame(), geom(), rows());
    refusal.style.left = `${r.x}px`;
    refusal.style.top = `${r.y}px`;
    refusal.style.width = `${r.width}px`;
    refusal.style.height = `${r.height}px`;
    api.container.style.cursor = 'not-allowed';
  };
  const slabMove = (ev: ToolPointerEvent): void => {
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
        const moved = engine.moveCheck(g.id, cell.x, cell.y, { gate: false }).changed || placeOnRow(g.id, cell.x, cell.y, it.w);
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
    if (x !== it.x || y !== it.y) changed = engine.moveCheck(g.id, x, y, { gate: false }).changed || changed;
    if (w !== it.w || h !== it.h) changed = engine.resizeCheck(g.id, w, h).changed || changed;
    if (changed) project();
  };
  const slabUp = (): void => {
    const g = slabGesture;
    if (!g) return;
    slabGesture = null;
    showRefusal(null, 0, 0);
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    relockSlab(g.id);
    relockOthersForSlab();
    if (g.move && g.started) setCarried(g.id, false); // exempt through the drop write, then the glides resume
    if (!g.started) {
      engine.endGesture();
      return;
    }
    engine.endGesture();
    project();
    const it = engine.getItem(g.id);
    const grp = diagram.getGroup(g.id);
    const deltas = deltasSince(g.startCells, g.startGeom, g.id);
    const commands = buildCommitCommands(deltas);
    // The sections and groups the move PUSHED (0.4.44): the tile commit skips
    // groups by design (a group's cell is its own command), so they are
    // committed here the way a dock commits the groups it displaced — or the
    // model snapped every one of them, and the mover, straight back.
    commands.push(...groupCellCommands(deltas));
    const b = g.cellBefore;
    if (it && grp && (b.x !== it.x || b.y !== it.y || b.w !== it.w || b.h !== it.h)) {
      commands.push(new SetGroupCellCommand(g.id, b, { x: it.x, y: it.y, w: it.w, h: it.h }, g.frameBefore, frameOfGroup(grp)));
    }
    const changed = execute(g.move ? 'Move section' : 'Resize section', commands);
    disarmGlideSoon();
    syncHandles();
    api.renderNow();
    options.onGesture?.({ type: 'commit', kind: g.move ? 'move' : 'resize', nodeId: g.id, changed });
  };
  const slabCancel = (): void => {
    const g = slabGesture;
    if (!g) return;
    slabGesture = null;
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    relockSlab(g.id);
    relockOthersForSlab();
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
      setGhost(g.id, true);
      g.hostEl = hostOf(g.id);
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

  const cleanupGestureVisuals = (g: GestureState): void => {
    if (g.kind !== 'palette') setGhost(g.id, false);
    disarmGlideSoon();
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    g.chip?.remove();
    placeholder?.remove();
    placeholder = null;
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
    const commands = buildCommitCommands(deltas);
    commands.push(...groupCellCommands(deltas)); // a container a BESIDE drop shifted (0.4.45)
    endBeside();
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
      if (it) live.announce(`${nameOf(g.node)} ${g.kind === 'resize' ? 'resized' : 'moved'} to ${describeCell(it)}`);
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
    if (g.kind !== 'palette' && g.leg) {
      g.leg.adopted.abort(); // target board back to its pre-entry layout
      g.leg = null;
    }
    if (g.kind !== 'palette' && g.esc && g.esc.rowsAdded !== 0) {
      g.esc.peer.resizeMemberBy(group.id, -g.esc.rowsAdded); // slab back down
      g.esc = null;
    }
    endBeside();
    if (g.started) {
      if (g.removedFromBoard || g.kind === 'palette') {
        // The engine cannot resurrect a removed item — rebuild from the
        // gesture-start snapshot (cells are pure data; the constructor
        // honours legal layouts verbatim).
        engine.endGesture();
        const items: GridPackItem[] = [];
        for (const [id, c] of g.startCells) {
          const lockedNode = diagram.getNode(id)?.state?.locked === true;
          items.push({ id, ...c, locked: lockedNode || isGroupMember(id) });
        }
        engine = engineFrom(items);
      } else {
        engine.cancelGesture();
      }
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
      const desired = { x: ev.world.x - g.grab.dx, y: ev.world.y - g.grab.dy };
      g.node.setPosition(desired.x, desired.y);
      ghostStyleFastPath(g, desired);

      g.lastWorld = { x: ev.world.x, y: ev.world.y };
      g.lastScreen = { x: ev.screen.x, y: ev.screen.y };
      // A TAB STRIP under the pointer wins over every board: the widget will
      // become a new tab there, so it leaves this board (survivors settle
      // home) and the strip marks the slot.
      if (options.tabDrop && !isStatic) {
        const crect = api.container.getBoundingClientRect();
        const hitStrip = options.tabDrop.stripAt(crect.left + ev.screen.x, crect.top + ev.screen.y);
        if (hitStrip) {
          if (g.leg) {
            g.leg.adopted.abort();
            g.leg = null;
          }
          endBeside(); // a band's promise gives way to the strip's
          if (!g.removedFromBoard) {
            g.removedFromBoard = true;
            engine.remove(g.id);
            project();
          }
          hostOf(g.id)?.classList.remove('axdb-out');
          if (!g.strip || g.strip.containerId !== hitStrip.containerId || g.strip.index !== hitStrip.index) {
            options.tabDrop.markDrop(hitStrip.containerId, hitStrip.index);
          }
          g.strip = hitStrip;
          syncPlaceholder();
          api.render();
          return;
        }
        if (g.strip) {
          options.tabDrop.markDrop(null, null);
          g.strip = null;
        }
      }
      // BESIDE a tab container (0.4.45): its outer band puts the widget next
      // to it — at the board's edge the container shifts over to make room.
      // Nothing moves while held (0.4.47): an overlay marks the cell.
      if (!isStatic) {
        const z = besideZoneAt(ev.world.x, ev.world.y);
        if (z) {
          applyBeside(g, z);
          syncPlaceholder();
          return;
        }
        if (beside) {
          // Off the band — unless the hand is resting on its boundary: the
          // band is a little wider for a pointer already in it, so the
          // promise does not flicker against "into the page" at the line.
          const grp = diagram.getGroup(beside.id);
          const stay = !!grp && bandOf(frameOfGroup(grp), ev.world.x, ev.world.y, BESIDE_BAND + BESIDE_STAY) === beside.side;
          if (stay) {
            syncPlaceholder();
            return;
          }
          endBeside(); // the overlay goes; the handoff below puts the ghost back on a board
        }
      }
      // Deepest board under the pointer wins: the nested KPI strip beats the
      // tab that contains it; a foreign board beats "outside". Strict frames
      // first; the one-row grace band below each board (gridstack's extra
      // drag row) is consulted only when NO strict frame matched — so "under
      // the last row" appends instead of reading as off-board.
      const strictSelf = worldInsideBoard(ev.world.x, ev.world.y);
      let peer = peerAt(ev.world.x, ev.world.y);
      let inside = strictSelf;
      if (!strictSelf && !peer) {
        if (worldInsideBoardExtended(ev.world.x, ev.world.y)) inside = true;
        else peer = peerAt(ev.world.x, ev.world.y, true);
        // Last resort: the grace band — a small slip past the edge stays ON
        // this board (the engine clamps the cell; prototype parity).
        if (!inside && !peer && worldInsideBoardGrace(ev.world.x, ev.world.y)) inside = true;
      }
      const selfWins = inside && (!peer || boardArea() <= peer.frameArea());

      if (peer && !selfWins) {
        // -- HANDOFF: the pointer is over another board -------------------
        if (g.leg && g.leg.peer === peer) {
          g.leg.adopted.move(ev.world);
        } else {
          if (g.leg) {
            g.leg.adopted.abort();
            g.leg = null;
          }
          if (!g.removedFromBoard) {
            g.removedFromBoard = true;
            engine.remove(g.id); // survivors settle home (gesture memory intact)
            project();
          }
          const adopted = peer.adopt(g.node, ev.world, {
            width: g.node.size.width,
            height: g.node.size.height,
          });
          if (adopted) {
            hostOf(g.id)?.classList.remove('axdb-out');
            g.leg = { peer, adopted };
            g.leg.adopted.move(ev.world);
          } else {
            // Bounded/full board refused the adoption: dim = will snap home.
            hostOf(g.id)?.classList.add('axdb-out');
          }
        }
      } else if (inside) {
        // -- back on (or still on) our own board --------------------------
        if (g.leg) {
          g.leg.adopted.abort();
          g.leg = null;
        }
        if (g.removedFromBoard) {
          g.removedFromBoard = false;
          hostOf(g.id)?.classList.remove('axdb-out');
          const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows(), g.spans.w);
          // Re-enter at the bottom edge (collision-free), then take the cursor
          // cell GATELESSLY — a first placement skips the anti-jitter gate.
          engine.add({ id: g.id, x: 0, y: engine.rows(), w: g.spans.w, h: g.spans.h });
          engine.moveCheck(g.id, cell.x, cell.y, { gate: false });
          project();
        } else {
          const spanW = engine.getItem(g.id)?.w ?? g.spans.w;
          const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows(), spanW);
          if (engine.moveCheck(g.id, cell.x, cell.y).changed) project();
        }
      } else {
        // -- outside every board ------------------------------------------
        if (g.leg) {
          g.leg.adopted.abort();
          g.leg = null;
        }
        if (!g.removedFromBoard) {
          g.removedFromBoard = true;
          engine.remove(g.id); // survivors settle home; cells minted nowhere
          hostOf(g.id)?.classList.add('axdb-out');
          project();
        }
      }
      syncPlaceholder();
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
    g.node.setSize(w, h, g.node.size.depth ?? 0);
    g.node.setPosition(px, py);
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
      const displaced = buildCommitCommands(deltasSince(g.startCells, g.startGeom, g.id));
      const snap = g.startGeom.get(g.id);
      if (snap) {
        g.node.setPosition(snap.pos.x, snap.pos.y);
        g.node.setSize(snap.size.width, snap.size.height, snap.size.depth ?? 0);
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
    if (beside) {
      // -- BESIDE A TAB CONTAINER (0.4.47): the shift or push the overlay
      // promised happens now, and the commit below records both.
      realizeBeside(g);
      commitGesture(g);
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
          g.node.setPosition(fin.rect.x, fin.rect.y);
          g.node.setSize(fin.rect.width, fin.rect.height, g.node.size.depth ?? 0);
        });
      } finally {
        writing = false;
      }
      const sourceDisplaced = buildCommitCommands(deltasSince(g.startCells, g.startGeom, g.id));
      const before = g.startCells.get(g.id);
      const geomBefore = g.startGeom.get(g.id);
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
        ...buildCommitCommands([
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
        ]),
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
    if (g.removedFromBoard && dragOut === 'cancel') {
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
      const displaced = buildCommitCommands(deltasSince(g.startCells, g.startGeom, g.id));
      const snap = g.startGeom.get(g.id);
      if (snap) {
        // Park the node on its start rect so the page's RemoveNodeCommand
        // captures sane geometry for undo.
        g.node.setPosition(snap.pos.x, snap.pos.y);
        g.node.setSize(snap.size.width, snap.size.height, snap.size.depth ?? 0);
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
  const placeOnRow = (id: string, x: number, y: number, w: number): boolean => {
    const at = (cx: number): boolean => {
      const i = engine.getItem(id);
      return !!i && i.x === cx && i.y === y;
    };
    const maxX = Math.max(0, columns - w);
    if (at(x)) return true;
    if (engine.moveCheck(id, x, y, { gate: false }).changed) return true;
    for (let d = 1; d <= columns; d++) {
      for (const cx of [x - d, x + d]) {
        if (cx < 0 || cx > maxX) continue;
        if (at(cx)) return true;
        if (engine.moveCheck(id, cx, y, { gate: false }).changed) return true;
      }
    }
    return false;
  };
  const placeNear = (id: string, x: number, y: number, w: number): boolean => {
    if (placeOnRow(id, x, y, w)) return true;
    // EVERY column on that row refused — which is what a locked section
    // spanning the full width does, and there are plenty of those. Sliding
    // sideways can never clear it, so try the rows either side, nearest first.
    // Without this the drop either fell to the bottom of the board or, when
    // the board had no room down there either, did nothing at all.
    const reach = Math.max(1, rows()) + 2;
    for (let d = 1; d <= reach; d++) {
      for (const cy of [y - d, y + d]) {
        if (cy < 0) continue;
        if (placeOnRow(id, x, cy, w)) return true;
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
      if (it.id === id || !it.locked) continue;
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
    // full SECTION keeps refusing (grid-options s05: refused, then joined once
    // a strip was removed); growing its slab for a dropped tile is the
    // escalation path's, not a squeeze's, and is not built yet.
    if (!entered && !parentPeer()) {
      const room = elasticRows();
      if (room !== undefined && room > (bound() ?? 0)) {
        setSqueeze(room);
        span.h = Math.max(1, Math.min(room, span.h));
        entered = engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: span.h });
      }
    }
    if (!entered) {
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
    const place = (cell: { x: number; y: number }, itemW: number): boolean =>
      opts.fit === 'shrink' ? placeFitting(node.id, cell.x, cell.y, itemW, hNatural) : placeNear(node.id, cell.x, cell.y, itemW);
    let lastWant: { x: number; y: number } | null = null;
    const cell0 = wantedCell(world.x, world.y, span.w, span.h);
    lastWant = cell0;
    place(cell0, span.w);
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
      place: (cell) => {
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
        if (moved && (moved.x !== cell.x || moved.y !== cell.y)) engine.moveCheck(node.id, cell.x, cell.y, { gate: false });
        const now = engine.getItem(node.id);
        if (now && (now.w !== cell.w || now.h !== cell.h)) engine.resizeCheck(node.id, cell.w, cell.h);
        lastWant = null;
        project();
        syncPlaceholder();
        const at = engine.getItem(node.id);
        return !!at && at.x === cell.x && at.y === cell.y && at.w === cell.w && at.h === cell.h;
      },
      move: (w) => {
        const item = engine.getItem(node.id);
        if (!item) return;
        const cell = wantedCell(w.x, w.y, item.w, opts.fit === 'shrink' ? hNatural : item.h);
        // The search is worth running once per wanted cell, not per pixel.
        if (lastWant && lastWant.x === cell.x && lastWant.y === cell.y) return;
        lastWant = cell;
        if (place(cell, item.w)) project();
        syncPlaceholder();
      },
      leave: () => {
        if (!engine.getItem(node.id)) return;
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
        if (engine.getItem(node.id)) engine.remove(node.id);
        engine.cancelGesture(); // pre-entry layout, memory cleared
        setSqueeze(squeezeBefore);
        adoptedGhostId = null;
        disarmGlideSoon();
        project();
        syncPlaceholder();
      },
      finalize: () => {
        const item = engine.getItem(node.id);
        if (!item) {
          engine.endGesture();
          adoptedGhostId = null;
          syncPlaceholder();
          return null;
        }
        const cell: CellRect = { x: item.x, y: item.y, w: item.w, h: item.h };
        const rect = cellToRect(item, frame(), geom(), rows());
        const commands = buildCommitCommands(deltasSince(startCells, startGeom, node.id));
        const groups: Array<{ id: string; cellBefore: CellRect; cellAfter: CellRect; frameBefore: WorldRect; frameAfter: WorldRect }> = [];
        for (const [id, before] of startCells) {
          if (!isGroupMember(id)) continue;
          const it = engine.getItem(id);
          const g0 = startGeom.get(id);
          if (!it || !g0) continue;
          if (it.x === before.x && it.y === before.y && it.w === before.w && it.h === before.h) continue;
          groups.push({
            id,
            cellBefore: before,
            cellAfter: { x: it.x, y: it.y, w: it.w, h: it.h },
            frameBefore: { x: g0.pos.x, y: g0.pos.y, width: g0.size.width, height: g0.size.height },
            frameAfter: cellToRect(it, frame(), geom(), rows()),
          });
        }
        engine.endGesture();
        if (squeezeRoom !== undefined) {
          // What the board now HOLDS is its bound, not the squeeze's room.
          squeezeRoom = undefined;
          setLiveBound(liveBound(engine.getItems()));
        }
        adoptedGhostId = null;
        disarmGlideSoon();
        syncPlaceholder();
        return { commands, cell, rect, groups };
      },
    };
  };

  const selfPeer: BinderPeer = {
    group,
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
      return slabGesture?.id === id;
    },
    dragMember: (id, ev) => {
      if (isStatic || disposed || !engine.getItem(id) || gesture || slabGesture) return false;
      const toTool = (e: PointerEvent): ToolPointerEvent => {
        const rect = api.container.getBoundingClientRect();
        const world = api.viewport?.clientToWorld ? api.viewport.clientToWorld(e.clientX, e.clientY, rect) : { x: e.clientX - rect.left, y: e.clientY - rect.top };
        return { world, screen: { x: e.clientX - rect.left, y: e.clientY - rect.top }, source: e } as unknown as ToolPointerEvent;
      };
      beginSlabMove(id, toTool(ev));
      if (currentSlab()?.id !== id) return false;
      const detachAll = (): void => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        window.removeEventListener('keydown', onKey, true);
      };
      const onMove = (e: PointerEvent): void => {
        if (disposed || currentSlab()?.id !== id) return detachAll();
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
        node,
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

  /**
   * Edge affordance: the cursor says which border a press would take, the
   * way gridstack's invisible edge handles do. One passive listener on the
   * container; the corner handle keeps its own cursor from the stylesheet.
   */
  let hoverHost: HTMLElement | null = null;
  /**
   * A `show: 'hover'` caption cannot ride CSS `:hover`: the slab overlay takes
   * no pointer (by design — it must never steal a press), and while the band
   * is hidden it takes none either, so nothing in the section is ever hovered
   * in CSS terms. The binder already tracks the pointer; it marks the section
   * under it instead.
   */
  /** Only the sections carrying a `show: 'hover'` band — usually none, so the
   *  pointer handler costs nothing on a board that has no hover caption. */
  const hoverSlabs = new Set<HTMLElement>();
  const markHotSection = (clientX: number, clientY: number): void => {
    if (!hoverSlabs.size) return;
    for (const el of hoverSlabs) {
      const r = el.getBoundingClientRect();
      el.classList.toggle('axdb-slab--hot', clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom);
    }
  };
  const onHoverLeave = (): void => {
    for (const el of hoverSlabs) el.classList.remove('axdb-slab--hot');
  };

  const onHover = (e: PointerEvent): void => {
    if (disposed || gesture) return;
    markHotSection(e.clientX, e.clientY);
    // The event may target the host, its content, or (when a host's content
    // is pointer-transparent) the canvas under it — find the member host by
    // the pointer's position in that case.
    let host = (e.target as Element | null)?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host) {
      for (const id of group.members ?? []) {
        const h = hostOf(id);
        if (!h) continue;
        const r = h.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          host = h;
          break;
        }
      }
    }
    if (hoverHost && hoverHost !== host) {
      hoverHost.style.cursor = '';
      hoverHost.removeAttribute('data-axdb-edge'); // the affordance follows the pointer off a tile
    }
    hoverHost = host;
    if (!host) {
      // No tile under the pointer: a SECTION's frame edge still says resize.
      const wpt = api.viewport?.clientToWorld ? api.viewport.clientToWorld(e.clientX, e.clientY, api.container.getBoundingClientRect()) : null;
      const sid = wpt ? memberGroupAt(wpt.x, wpt.y) : null;
      const grp = sid ? diagram.getGroup(sid) : undefined;
      const c = grp && wpt && !isStatic ? cursorFor(slabEdgesNear(grp, wpt.x, wpt.y)) : '';
      if (!slabGesture) api.container.style.cursor = c;
      return;
    }
    if (!slabGesture && api.container.style.cursor) api.container.style.cursor = '';
    const id = host.getAttribute('data-node-id') ?? '';
    if (!(group.members ?? new Set<string>()).has(id)) return;
    const node = diagram.getNode(id);
    const resizable =
      !!node && !isStatic && node.state?.locked !== true && node.getMetadata?.('widgetResizable') !== false;
    const cursor = resizable ? cursorFor(edgesNear(host, e.clientX, e.clientY)) : '';
    // The affordance rides on an ATTRIBUTE, not the inline style: a repaint
    // rewrites the host's style and used to clear the cursor mid-hover, and
    // content that sets its own cursor (a chart canvas) hid it — the
    // stylesheet applies the attribute's cursor to the host and everything in it.
    if (cursor) host.setAttribute('data-axdb-edge', cursor);
    else host.removeAttribute('data-axdb-edge');
  };
  api.container.addEventListener('pointermove', onHover, { passive: true });
  api.container.addEventListener('pointerleave', onHoverLeave, { passive: true });

  /**
   * STATIC BOARDS LET CONTENT BE CLICKED. The renderer prevents the default of
   * every press a tool claims, which cancels the compatibility mouse events —
   * a chart inside a read-only board could not be clicked. So under `static`
   * a press inside a member's CONTENT (not on kit chrome) is stopped on the
   * HTML layer, in the bubble phase: the content has already received it, the
   * renderer never does, nothing is prevented.
   */
  const staticGuard = (e: Event): void => {
    if (!isStatic || disposed) return;
    const t = e.target as Element | null;
    const host = t?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host || !(group.members ?? new Set<string>()).has(host.getAttribute('data-node-id') ?? '')) return;
    if (t?.closest?.('.axdb-rs, .axdb-grip, .axdb-div')) return;
    e.stopPropagation();
  };
  let guardedLayer: HTMLElement | null = null;
  const ensureStaticGuard = (): void => {
    // One lookup, ever: the host observer budgets container lookups per
    // repaint, and the layer element lives as long as the instance.
    if (guardedLayer?.isConnected) return;
    const layer = htmlLayer();
    if (!layer) return;
    guardedLayer?.removeEventListener('pointerdown', staticGuard);
    guardedLayer = layer;
    layer.addEventListener('pointerdown', staticGuard);
  };

  /**
   * KEYBOARD OPERATION (WCAG 2.1.1, and the non-drag alternative 2.5.7 asks
   * for): on a focused member, arrows move it one cell, Shift+arrows resize it
   * one cell, Home/End jump to the first/last member. Every move and resize is
   * the same programmatic gesture the API uses — one undoable step, reported
   * through onLayoutChange — and every outcome is spoken: the tile's new
   * cell, each neighbour it displaced, or why it was refused. Handled keys
   * stop here so the renderer's own pixel nudge never fights the grid.
   */
  const memberHostAt = (target: EventTarget | null): { id: string; host: HTMLElement } | null => {
    const host = (target as Element | null)?.closest?.('.grafloria-node-host') as HTMLElement | null;
    if (!host) return null;
    const id = host.getAttribute('data-node-id') ?? '';
    if (!(group.members ?? new Set<string>()).has(id) || !diagram.getNode(id)) return null;
    return { id, host };
  };

  const onFocusIn = (e: FocusEvent): void => {
    const hit = memberHostAt(e.target);
    if (!hit || disposed) return;
    if (focusedId !== hit.id || selectedId !== hit.id) {
      focusedId = hit.id;
      selectWidget(hit.id);
      syncA11y();
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (disposed || gesture) return;
    const hit = memberHostAt(e.target);
    if (!hit) {
      // Tab reaches the diagram's own root (the svg) before any widget. An
      // arrow or Enter there hands focus to the board's tab stop, so a
      // keyboard user is never parked on "Diagram, 8 nodes" with nowhere to go.
      const el = e.target as Element | null;
      const onRoot = !!el && el.tagName?.toLowerCase() === 'svg' && el.classList?.contains('grafloria-diagram');
      if (onRoot && (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ')) {
        const members = [...(group.members ?? [])].filter((id) => !!diagram.getNode(id) && !!hostOf(id));
        const target = focusedId && members.includes(focusedId) ? focusedId : members[0];
        if (target && handle.focusWidget(target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      return;
    }
    const members = [...(group.members ?? [])].filter((id) => !!diagram.getNode(id) && !!hostOf(id));
    if (e.key === 'Home' || e.key === 'End') {
      const id = e.key === 'Home' ? members[0] : members[members.length - 1];
      if (id) handle.focusWidget(id);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!arrow) return;
    e.preventDefault();
    e.stopPropagation();
    if (isStatic) return; // readable, not editable
    const node = diagram.getNode(hit.id);
    const item = engine.getItem(hit.id);
    if (!node || !item) return;
    const name = nameOf(node);
    if (node.state?.locked === true) {
      live.announceError(`${name} is pinned`);
      return;
    }
    const [dx, dy] = arrow;
    const before = new Map(engine.getItems().map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]));
    const resize = e.shiftKey;
    if (resize && node.getMetadata?.('widgetResizable') === false) {
      live.announceError(`${name} cannot be resized`);
      return;
    }
    if (!resize && node.getMetadata?.('widgetMovable') === false) {
      live.announceError(`${name} cannot be moved`);
      return;
    }
    // A one-cell keyboard step onto a neighbour would be refused by the
    // pointer's anti-jitter gate (a 3-wide covering a third of its neighbour
    // is not "more than half"). A key press is deliberate, so when the step
    // is refused and a neighbour sits there, aim at the neighbour's far edge —
    // the same swap a full drag lands on.
    const stepOrSwap = async (): Promise<boolean> => {
      if (await handle.moveTo(hit.id, item.x + dx, item.y + dy)) return true;
      const probe = { x: item.x + dx, y: item.y + dy, w: item.w, h: item.h };
      const c = engine
        .getItems()
        .find((o) => o.id !== hit.id && probe.x < o.x + o.w && o.x < probe.x + probe.w && probe.y < o.y + o.h && o.y < probe.y + probe.h);
      if (!c) return false;
      const tx = dx > 0 ? c.x + c.w - item.w : dx < 0 ? c.x : item.x;
      const ty = dy > 0 ? c.y + c.h - item.h : dy < 0 ? c.y : item.y;
      return handle.moveTo(hit.id, tx, ty);
    };
    const op = resize ? handle.resizeTo(hit.id, item.w + dx, item.h + dy) : stepOrSwap();
    void op.then((ok) => {
      if (disposed) return;
      const after = engine.getItem(hit.id);
      if (!ok || !after) {
        live.announceError(
          resize ? `Cannot resize ${name} that way` : `Cannot move ${name} ${directionName(dx, dy)}`
        );
        return;
      }
      const parts = [`${name} ${resize ? 'resized' : 'moved'} to ${describeCell(after)}`];
      for (const other of engine.getItems()) {
        if (other.id === hit.id) continue;
        const was = before.get(other.id);
        if (!was || (was.x === other.x && was.y === other.y)) continue;
        const o = diagram.getNode(other.id);
        parts.push(`${o ? nameOf(o) : other.id} moved to ${describeCell(other)}`);
      }
      live.announce(parts.join('. '), 'polite', true);
      syncA11y();
      hostOf(hit.id)?.focus?.({ preventScroll: true });
    });
  };
  api.container.addEventListener('focusin', onFocusIn);
  api.container.addEventListener('keydown', onKey);

  // -- tab tear-out -----------------------------------------------------------

  /**
   * A press that TRAVELLED on a tab drags the whole page onto this board, the
   * way dragging a VS Code tab out of its group makes a group of its own. The
   * page is a GROUP, so it rides the same `adopt` leg a widget uses — entry at
   * the bottom, `placeNear` under the pointer, the dashed placeholder drawn
   * from the live cell — and the commit is one batch: the cell and frame it
   * landed on, out of the container, into this board, plus every tile this
   * board had to push aside.
   *
   * Like VS Code, the page itself does not follow the pointer; a chip carrying
   * the tab's label does, and the placeholder shows where the drop will land.
   */
  const beginTearOut = (pageId: string, fromGroupId: string, ev: PointerEvent, plan: TearOutPlan): boolean => {
    if (disposed || gesture || slabGesture || isStatic || tearing) return false;
    const from = diagram.getGroup(fromGroupId);
    if (!from || !diagram.getGroup(pageId) || !engine.getItem(fromGroupId)) return false;
    const toWorld = (cx: number, cy: number): { x: number; y: number } => {
      const rect = api.container.getBoundingClientRect();
      return api.viewport?.clientToWorld ? api.viewport.clientToWorld(cx, cy, rect) : { x: cx - rect.left, y: cy - rect.top };
    };
    // The board holds the NEW group, not the bare page: it is adopted under the
    // group's id, sized for the page plus its strip, taking the room under the
    // pointer with its top edge at the pointer — the tab is what the pointer
    // holds, the page hangs below it. NOT at the press: a ghost in the engine
    // costs rows, and on a fit board every tile squeezes the moment it enters,
    // so the ghost enters only when the pointer is over free board space, and
    // leaves whenever it is over a strip, a group or an edge. A full board that
    // refuses the ghost still lets the page join, reorder or split.
    let leg: AdoptedLeg | null = null;
    /** The board holding the leg: null = this one, else the foreign peer under the pointer. */
    let legPeer: BinderPeer | null = null;
    const ensureLeg = (world: { x: number; y: number }, peer: BinderPeer | null = null): AdoptedLeg | null => {
      // The page TRAVELS at most half the board tall (the dock's measure): at
      // its natural height — a page fills its container, eight rows on the
      // demo — the ghost crossing the KPI row tore the whole dashboard apart
      // on its way to a cell (identification round, D1 03–08).
      const capPx = dockSpan.h * (rowHeightFor(geom(), rows()) + gap) - gap;
      const size = { width: plan.size.width, height: Math.min(plan.size.height, capPx) };
      // A different board under the pointer takes the leg over, the old one
      // back to its pre-entry layout first. An INNER tab used to know only
      // the board owning its container — over the main board the chip dimmed
      // and the release did nothing (identification round, L2).
      if (leg && legPeer !== peer) {
        leg.abort();
        leg = null;
      }
      if (!leg) {
        leg = peer ? peer.adopt({ id: plan.arrivingId }, world, size, { fit: 'shrink', anchor: 'top' }) : adopt({ id: plan.arrivingId }, world, size, { fit: 'shrink', anchor: 'top' });
        legPeer = leg ? peer : null;
      }
      return leg;
    };
    /** The deepest OTHER board under the point that may take the page — never one of the page's own boards. */
    const foreignAt = (wx: number, wy: number): BinderPeer | null => {
      let best: BinderPeer | null = null;
      for (const p of peersOnCanvas()) {
        if (p === selfPeer || plan.ownBoards.includes(p.group.id)) continue;
        if (!p.containsWorld(wx, wy)) continue;
        if (!best || p.frameArea() < best.frameArea()) best = p;
      }
      return best;
    };
    const naturalSpan = ((): { w: number; h: number } => {
      const sp = sizeToSpan(plan.size.width, plan.size.height, frame(), geom(), rows());
      return { w: Math.max(1, Math.min(columns, sp.w)), h: Math.max(TEAR_OUT_MIN_ROWS, sp.h) };
    })();
    // A DOCKED group takes at most HALF the board — VS Code's edge drop splits
    // the area in two. A page as tall as the container it left would
    // otherwise shove the whole dashboard out of view. Half of the board as
    // it stood at the press, and of what the canvas shows, whichever is less.
    const dockSpan = ((): { w: number; h: number } => {
      const rows0 = rows();
      const rect = api.container.getBoundingClientRect();
      const rh = rowHeightFor(geom(), rows0) + gap;
      const visible = rect.height > 0 && rh > 0 ? Math.max(1, Math.floor((rect.height + gap) / rh)) : rows0;
      const halfRows = Math.max(TEAR_OUT_MIN_ROWS, Math.ceil(Math.min(rows0, visible) / 2));
      const halfCols = Math.max(1, Math.ceil(columns / 2));
      return { w: Math.min(naturalSpan.w, halfCols), h: Math.min(naturalSpan.h, halfRows) };
    })();

    tearing = pageId;
    const doc = api.container.ownerDocument ?? document;
    const chip = doc.createElement('div');
    chip.className = 'axdb-drag-chip axdb-tab-chip';
    chip.textContent = plan.label;
    doc.body.appendChild(chip);
    const moveChip = (cx: number, cy: number): void => {
      chip.style.left = `${cx + 6}px`;
      chip.style.top = `${cy + 6}px`;
    };
    moveChip(ev.clientX, ev.clientY);
    armGlide();
    api.render();

    // -- the drop model: where the pointer is decides what the release does --------
    // Over ANOTHER tab container: its strip joins at a slot; the centre third of
    // its body joins on the end; an outer third SPLITS it — the target keeps one
    // half of its cell, the page takes the other (Lumino's thirds, VS Code's
    // feel). Over the board's own edges the page DOCKS against the whole board.
    // Over its own strip it reorders; over its own body it goes home. Deepest
    // target wins, so a group inside the container the page came from is a
    // target, not "home".
    type Side = 'left' | 'right' | 'top' | 'bottom';
    type Zone =
      | { kind: 'strip'; target: GroupModel; index: number }
      | { kind: 'join'; target: GroupModel }
      | { kind: 'split'; target: GroupModel; side: Side; keep: CellRect; born: CellRect }
      | { kind: 'root'; side: Side; cell: CellRect }
      | { kind: 'reorder'; index: number }
      | { kind: 'home' }
      /** Free board space — this board's, or a FOREIGN board's when one lies under the pointer (deeper than this one, or outside it). */
      | { kind: 'board'; peer?: BinderPeer }
      /** Outside the visible canvas (plus grace): nothing lands, whatever the world point under the pointer says. */
      | { kind: 'off' };
    const layer = htmlLayer();
    const area = (g: GroupModel): number => {
      const sz = sizeOf(g);
      return sz.width * sz.height;
    };
    const targets = plan.joinTargets
      .map((id) => diagram.getGroup(id))
      .filter((g): g is GroupModel => !!g && g.id !== fromGroupId)
      .sort((a, b) => area(a) - area(b));
    // GEOMETRY MUST NOT MOVE WITH THE GHOST. On a fit board the rows squeeze
    // while the ghost occupies some and relax when it leaves, so a target's
    // frame changes with the very decision being made about it: a join makes
    // the ghost leave, the frame grows, and the same pointer now reads as a
    // split. The target and its frame are therefore anchored when the pointer
    // enters it and kept until it leaves; the board frame is the one at press.
    let anchor: { g: GroupModel; frame: WorldRect; stripH: number } | null = null;
    const inRect = (r: WorldRect, wx: number, wy: number): boolean => wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height;
    const targetAt = (wx: number, wy: number): GroupModel | null => {
      if (anchor && inRect(anchor.frame, wx, wy)) return anchor.g;
      const t = targets.find((x) => worldInsideGroup(x, wx, wy)) ?? null;
      if (t) leg?.leave(); // the ghost leaves first, so the frame anchored is the relaxed one
      anchor = t ? { g: t, frame: frameOfGroup(t), stripH: plan.stripHeight(t.id) } : null;
      return t;
    };
    // THE BANDS ARE ON THE SCREEN. Dockview measures its container edges on
    // the element, and so must we: the camera moves during the drag (the
    // board glides, the ghost adds rows a bounded scroll answers to), so a
    // band fixed in world space at the press drifts away from the edge the
    // user sees. The frame is mapped to client space through the live
    // camera and clipped to the canvas, so a scrolled board's bands sit at
    // its VISIBLE edges.
    const ROOT_TOP = 20;
    const ROOT_BOTTOM = 20;
    const ROOT_SIDE = 40;
    // THE EDGE BANDS ARE A FIFTH OF THE BODY — Dockview's activation size, not
    // VS Code's third. Two thirds of every group read as "beside" under the
    // thirds, and the user, putting a page back into the panel it came from,
    // never found the "into": "close to the edge means beside it, the content
    // area means inside, the header means a new tab" (0.4.42).
    const EDGE_BAND = 0.2;
    const visibleFrame = (): { left: number; top: number; right: number; bottom: number } => {
      const rect = api.container.getBoundingClientRect();
      const o = toWorld(rect.left, rect.top);
      const u = toWorld(rect.left + 100, rect.top + 100);
      const sx = 100 / (u.x - o.x || 100);
      const sy = 100 / (u.y - o.y || 100);
      const f = frame();
      const left = rect.left + (f.x - o.x) * sx;
      const top = rect.top + (f.y - o.y) * sy;
      const right = left + f.width * sx;
      const bottom = top + f.height * sy;
      if (rect.width <= 0 || rect.height <= 0) return { left, top, right, bottom }; // unlaid-out: nothing to clip to
      return { left: Math.max(left, rect.left), top: Math.max(top, rect.top), right: Math.min(right, rect.right), bottom: Math.min(bottom, rect.bottom) };
    };
    /** Inside the VISIBLE canvas plus the grace band, on the screen — a camera that moved must not turn a pointer outside the canvas into a world point inside the board. */
    const clientInsideCanvasGrace = (cx: number, cy: number): boolean => {
      // The CANVAS, not this board's frame: a nested page's binder runs the
      // tear-out of the tabs inside it, and its pages must still land on the
      // boards around it. An unmeasurable container (no layout) is never off.
      const rect = api.container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return true;
      return cx >= rect.left - EDGE_GRACE && cx <= rect.right + EDGE_GRACE && cy >= rect.top - EDGE_GRACE && cy <= rect.bottom + EDGE_GRACE;
    };
    /**
     * The board's rows for a dock: as they stood BEFORE the ghost entered.
     * Read live, the ghost's own pushing inflated them on every re-entry —
     * side docks 14, 21, 104 rows tall, a bottom dock landing at row 29.
     */
    const baseRows = (): number => {
      const b = leg?.baseline();
      if (!b) return rowsWithout(plan.arrivingId);
      let r = 0;
      for (const c of b.values()) r = Math.max(r, c.y + c.h);
      return r;
    };
    const worldToClient = (wx: number, wy: number): { x: number; y: number } => {
      const rect = api.container.getBoundingClientRect();
      const o = toWorld(rect.left, rect.top);
      const u = toWorld(rect.left + 100, rect.top + 100);
      return { x: rect.left + (wx - o.x) * (100 / (u.x - o.x || 100)), y: rect.top + (wy - o.y) * (100 / (u.y - o.y || 100)) };
    };
    /**
     * Would the page land where the user cannot see it? A cell whose room
     * lies below the fold (the only cell left under a locked section — D1
     * hold3) used to take the drop a screen away. Hidden = not one pixel of
     * the cell inside the visible canvas: a landing whose top edge shows,
     * the rest below the fold of a small canvas, is a landing the user can
     * see and a grow board scrolls to (lab L61 dropped at the canvas foot).
     */
    const landingHidden = (): boolean => {
      const r = leg?.rect();
      const rect = api.container.getBoundingClientRect();
      if (!r || rect.width <= 0 || rect.height <= 0) return false;
      const tl = worldToClient(r.x, r.y);
      const br = worldToClient(r.x + r.width, r.y + r.height);
      return tl.y >= rect.bottom || br.y <= rect.top || tl.x >= rect.right || br.x <= rect.left;
    };
    const rootAt = (cx: number, cy: number): Zone | null => {
      // The bands reach a little OUTSIDE the frame too: a pointer that
      // overshoots the board's top edge by a few pixels means "the top".
      const v = visibleFrame();
      if (cx < v.left - ROOT_SIDE || cx > v.right + ROOT_SIDE || cy < v.top - ROOT_TOP || cy > v.bottom + ROOT_BOTTOM) return null;
      const rows = Math.max(TEAR_OUT_MIN_ROWS, baseRows());
      const w = dockSpan.w;
      const h = dockSpan.h;
      if (cy - v.top <= ROOT_TOP) return { kind: 'root', side: 'top', cell: { x: 0, y: 0, w: columns, h } };
      if (cx - v.left <= ROOT_SIDE) return { kind: 'root', side: 'left', cell: { x: 0, y: 0, w, h: rows } };
      if (v.right - cx <= ROOT_SIDE) return { kind: 'root', side: 'right', cell: { x: Math.max(0, columns - w), y: 0, w, h: rows } };
      if (v.bottom - cy <= ROOT_BOTTOM) return { kind: 'root', side: 'bottom', cell: { x: 0, y: rows, w: columns, h } };
      return null;
    };
    const rowsWithout = (id: string): number => {
      let r = 0;
      for (const it of engine.getItems()) if (it.id !== id) r = Math.max(r, it.y + it.h);
      return r;
    };
    /** A split being previewed: the target shrunk to its half, to be restored when the pointer leaves. */
    let split: { id: string; before: CellRect; frameBefore: WorldRect; keep: CellRect } | null = null;
    const halves = (target: GroupModel, side: Side): { keep: CellRect; born: CellRect } | null => {
      // The cell to halve is the target's own — not the half it is already
      // shrunk to while a split is being previewed.
      const live = engine.getItem(target.id);
      const it = split && split.id === target.id ? split.before : live;
      if (!it || !live) return null; // a group on another board: no cell of ours to halve
      if (side === 'left' || side === 'right') {
        if (it.w < 2) return null;
        const a = Math.ceil(it.w / 2);
        const b = it.w - a;
        return side === 'right'
          ? { keep: { x: it.x, y: it.y, w: a, h: it.h }, born: { x: it.x + a, y: it.y, w: b, h: it.h } }
          : { keep: { x: it.x + b, y: it.y, w: a, h: it.h }, born: { x: it.x, y: it.y, w: b, h: it.h } };
      }
      if (it.h < 2 * TEAR_OUT_MIN_ROWS) return null;
      const a = Math.ceil(it.h / 2);
      const b = it.h - a;
      return side === 'bottom'
        ? { keep: { x: it.x, y: it.y, w: it.w, h: a }, born: { x: it.x, y: it.y + a, w: it.w, h: b } }
        : { keep: { x: it.x, y: it.y + b, w: it.w, h: a }, born: { x: it.x, y: it.y, w: it.w, h: b } };
    };
    const zoneAt = (cx: number, cy: number, world: { x: number; y: number }): Zone => {
      // A pointer OUTSIDE the visible canvas is off, full stop: a camera that
      // moved can map it to a world point inside a group, and that group
      // took a join or a split from a release in the page header.
      if (!clientInsideCanvasGrace(cx, cy)) return { kind: 'off' };
      const target = targetAt(world.x, world.y);
      const home = !target && worldInsideGroup(from, world.x, world.y);
      // A strip is the most precise target there is: anyone's wins outright.
      if (target) {
        const idx = plan.stripIndex(target.id, cx, cy);
        if (idx !== null) return { kind: 'strip', target, index: idx };
      } else if (home) {
        const idx = plan.stripIndex(fromGroupId, cx, cy);
        if (idx !== null) return { kind: 'reorder', index: idx };
      }
      // The board's own edges beat whatever sits against them — Dockview's
      // container edges over its groups — so a group at the top of the board
      // still leaves the top band to the board.
      const root = rootAt(cx, cy);
      if (root) return root;
      if (target) {
        const f = anchor && anchor.g === target ? anchor.frame : frameOfGroup(target);
        const stripH = anchor && anchor.g === target ? anchor.stripH : plan.stripHeight(target.id);
        const bodyH = Math.max(1, f.height - stripH);
        const rx = Math.min(1, Math.max(0, (world.x - f.x) / Math.max(1, f.width)));
        const ry = Math.min(1, Math.max(0, (world.y - f.y - stripH) / bodyH));
        if (rx >= EDGE_BAND && rx <= 1 - EDGE_BAND && ry >= EDGE_BAND && ry <= 1 - EDGE_BAND) return { kind: 'join', target };
        const d: Array<[Side, number]> = [['left', rx], ['right', 1 - rx], ['top', ry], ['bottom', 1 - ry]];
        d.sort((p, q) => p[1] - q[1]);
        const h = halves(target, d[0][0]);
        return h ? { kind: 'split', target, side: d[0][0], ...h } : { kind: 'join', target };
      }
      if (home) return { kind: 'home' };
      const foreign = foreignAt(world.x, world.y);
      if (foreign && (!worldInsideBoard(world.x, world.y) || foreign.frameArea() < boardArea())) return { kind: 'board', peer: foreign };
      return { kind: 'board' };
    };
    const zoneKey = (z: Zone): string => JSON.stringify(z, (k, v) => (k === 'target' ? (v as GroupModel).id : k === 'peer' ? (v as BinderPeer).group.id : v));

    // DOCKING PUSHES SECTIONS. A section is a locked tile so that a widget
    // never pushes it; a group docked against the board's edge is the one
    // gesture that must — everything below the top band moves down. For the
    // preview every member group is unlocked; they are relocked when the
    // pointer leaves the band, and their moved cells are committed with the
    // dock.
    let unlockedGroups: string[] = [];
    const unlockGroups = (): void => {
      if (unlockedGroups.length > 0) return;
      for (const it of engine.getItems()) {
        if (it.id !== plan.arrivingId && it.locked && isGroupMember(it.id)) {
          it.locked = false;
          unlockedGroups.push(it.id);
        }
      }
    };
    const relockGroups = (): void => {
      for (const id of unlockedGroups) {
        const it = engine.getItem(id);
        if (it) it.locked = true;
      }
      unlockedGroups = [];
    };
    const groupCommands = (fin: NonNullable<ReturnType<AdoptedLeg['finalize']>>, except?: string): Command[] =>
      fin.groups.filter((g) => g.id !== except).map((g) => new SetGroupCellCommand(g.id, g.cellBefore, g.cellAfter, g.frameBefore, g.frameAfter));

    // A TOP DOCK INSERTS ROWS. The engine's push cascade resolves the band's
    // collisions one tile at a time and scrambles what stood beneath it (the
    // demo's KPI row came apart, two of its tiles under the chart). VS Code
    // shoves the whole area down intact, so after the ghost takes the band
    // every tile that stood at or below it is put back at its own column,
    // exactly the band's height lower — a translation of a layout without
    // overlaps has none — and comes back the same way when the pointer leaves.
    // The layout translated is the one from BEFORE the ghost entered (the
    // leg's baseline), not the engine's mid-gesture state: the adoption
    // itself pushes tiles about, and a snapshot taken after it would carry
    // that cascade into the insert.
    let inserted: Map<string, CellRect> | null = null;
    const insertRows = (cell: CellRect, l: AdoptedLeg): void => {
      if (cell.w < columns) return; // a side dock has no whole rows to insert
      inserted = l.baseline();
      for (const [id, c] of inserted) {
        const it = engine.getItem(id);
        if (!it) continue;
        it.x = c.x;
        it.y = c.y >= cell.y ? c.y + cell.h : c.y;
      }
    };
    const undoInsertRows = (): void => {
      if (!inserted) return;
      leg?.leave(); // the ghost frees its rows first
      for (const [id, c] of inserted) {
        const it = engine.getItem(id);
        if (it) {
          it.x = c.x;
          it.y = c.y;
        }
      }
      inserted = null;
      project();
    };

    let joinEl: HTMLElement | null = null;
    const showOverlay = (r: WorldRect): void => {
      if (!layer) return;
      if (!joinEl) {
        joinEl = doc.createElement('div');
        joinEl.className = 'axdb-join';
        layer.prepend(joinEl);
      }
      joinEl.style.left = `${r.x}px`;
      joinEl.style.top = `${r.y}px`;
      joinEl.style.width = `${r.width}px`;
      joinEl.style.height = `${r.height}px`;
    };
    const hideOverlay = (): void => {
      joinEl?.remove();
      joinEl = null;
    };
    const undoSplitPreview = (): void => {
      if (!split) return;
      const it = engine.getItem(split.id);
      leg?.leave(); // the born half must be free before the target grows back into it
      if (it) {
        if (it.x !== split.before.x || it.y !== split.before.y) engine.moveCheck(split.id, split.before.x, split.before.y, { gate: false });
        if (it.w !== split.before.w || it.h !== split.before.h) engine.resizeCheck(split.id, split.before.w, split.before.h);
        it.locked = true;
      }
      split = null;
      project();
    };
    const previewSplit = (z: Extract<Zone, { kind: 'split' }>, world: { x: number; y: number }): boolean => {
      const it = engine.getItem(z.target.id);
      const l = ensureLeg(world, null);
      if (!it || !l) return false;
      split = { id: z.target.id, before: { x: it.x, y: it.y, w: it.w, h: it.h }, frameBefore: frameOfGroup(z.target), keep: z.keep };
      it.locked = false; // its own gesture for the moment: it may shrink and shift
      if (it.w !== z.keep.w || it.h !== z.keep.h) engine.resizeCheck(z.target.id, z.keep.w, z.keep.h);
      const now = engine.getItem(z.target.id);
      if (now && (now.x !== z.keep.x || now.y !== z.keep.y)) engine.moveCheck(z.target.id, z.keep.x, z.keep.y, { gate: false });
      const ok = l.place(z.born);
      project();
      placeholder?.remove(); // the accent overlay says which half; the grey placeholder under it is noise
      placeholder = null;
      return ok;
    };
    /** The band a dock is promised: the cell it takes — a BOTTOM dock's lies past the last row, so its tint sits on the board's last rows instead. */
    const dockOverlayRect = (z: Extract<Zone, { kind: 'root' }>): WorldRect => {
      const cell = z.side === 'bottom' ? { ...z.cell, y: Math.max(0, z.cell.y - z.cell.h) } : z.cell;
      return cellToRect(cell, frame(), geom(), rows());
    };
    /** The dock, applied for real at the release: the ghost takes the band, every member group is pushed, a top dock inserts rows. */
    const realizeDock = (z: Extract<Zone, { kind: 'root' }>, world: { x: number; y: number }): boolean => {
      const l = ensureLeg(world, null);
      if (!l) return false;
      unlockGroups();
      l.place(z.cell);
      insertRows(z.cell, l);
      project();
      placeholder?.remove();
      placeholder = null;
      return true;
    };
    let zone: Zone = { kind: 'board' };
    let key = zoneKey(zone);
    const applyZone = (z: Zone, world: { x: number; y: number }): void => {
      const k = zoneKey(z);
      const same = k === key;
      key = k;
      zone = z;
      if (same) {
        if (z.kind === 'board') ensureLeg(world, z.peer ?? null)?.move(world);
        return;
      }
      undoSplitPreview();
      undoInsertRows();
      relockGroups();
      plan.markDrop(null, null);
      hideOverlay();
      // A PREVIEW IS AN OVERLAY. A split and a dock used to be applied LIVE
      // while the pointer hovered — the target halved and moved to its other
      // half, a top dock shoved every tile down — so the very group the user
      // was entering jumped away from under the pointer (the fluid demo's
      // side panel went off the screen in one frame as a page came back to
      // it). VS Code, Dockview and Golden Layout tint the half or the band and
      // move nothing until the drop; so does this now: the layout stays where
      // the user sees it, and the halving or the row insert happens on release.
      switch (z.kind) {
        case 'strip':
          leg?.leave();
          showOverlay(frameOfGroup(z.target));
          plan.markDrop(z.target.id, z.index);
          break;
        case 'join':
          leg?.leave();
          showOverlay(frameOfGroup(z.target));
          break;
        case 'split':
          leg?.leave(); // the ghost leaves first, so the half is measured on the relaxed board
          showOverlay(cellToRect(z.born, frame(), geom(), rows()));
          break;
        case 'root':
          leg?.leave();
          showOverlay(dockOverlayRect(z));
          break;
        case 'reorder':
          leg?.leave();
          plan.markDrop(fromGroupId, z.index);
          break;
        case 'home':
        case 'off':
          leg?.leave();
          break;
        case 'board': {
          const l = ensureLeg(world, z.peer ?? null);
          l?.enter(world);
          break;
        }
      }
    };

    let last = { x: ev.clientX, y: ev.clientY };
    const detach = (): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
    };
    const onMove = (e: PointerEvent): void => {
      if (disposed) return detach();
      last = { x: e.clientX, y: e.clientY };
      moveChip(e.clientX, e.clientY);
      const world = toWorld(e.clientX, e.clientY);
      const z = zoneAt(e.clientX, e.clientY, world);
      applyZone(z, world);
      // Dimmed = a release here does nothing: home, off the board, or a board
      // that refused the ghost (bounded and full).
      chip.classList.toggle('axdb-out', zone.kind === 'home' || zone.kind === 'off' || (zone.kind === 'board' && (!leg || landingHidden())));
      api.render();
    };
    const done = (changed: boolean, kind: 'commit' | 'cancel'): void => {
      disarmGlideSoon();
      enforceBoardHeight();
      persistLayouts();
      api.renderNow();
      options.onGesture?.({ type: kind, kind: 'move', nodeId: pageId, changed });
    };
    const finish = (commit: boolean): void => {
      detach();
      chip.remove();
      hideOverlay();
      plan.markDrop(null, null);
      tearing = null;
      if (disposed) return;
      const world = toWorld(last.x, last.y);
      const z: Zone = commit ? zoneAt(last.x, last.y, world) : { kind: 'home' };
      if (z.kind !== 'root') undoInsertRows();
      if (!commit || z.kind === 'home' || z.kind === 'off' || (z.kind === 'root' && !ensureLeg(world, null)) || (z.kind === 'board' && (!ensureLeg(world, z.peer ?? null) || landingHidden()))) {
        undoSplitPreview();
        leg?.abort();
        relockGroups();
        done(false, 'cancel');
        return;
      }
      if (z.kind === 'reorder') {
        undoSplitPreview();
        leg?.abort();
        const cmds = plan.reorder(z.index);
        const changed = cmds.length > 0 ? execute('Reorder tab', cmds) : false;
        done(changed, changed ? 'commit' : 'cancel');
        return;
      }
      if (z.kind === 'strip' || z.kind === 'join') {
        // JOIN: no cell on this board — the leg is abandoned (its displaced
        // tiles are already home) and the page becomes the target's tab.
        undoSplitPreview();
        const index = z.kind === 'strip' ? z.index : plan.dropIndex(z.target.id, last.x, last.y);
        leg?.abort();
        const planned = plan.join(z.target.id, index, group.id);
        done(execute('Move tab', [...planned.move, ...planned.collapse]), 'commit');
        return;
      }
      if (z.kind === 'split') {
        // SPLIT: the target keeps one half of its cell, the page's new group the
        // other. The hover only tinted the half; the halving happens NOW.
        hideOverlay();
        plan.markDrop(null, null);
        if (!previewSplit(z, world)) {
          // The half cannot be taken (a bounded board with no room for the
          // ghost): the page joins the target instead, as it would have had
          // the target been too small to halve.
          leg?.abort();
          const planned = plan.join(z.target.id, plan.dropIndex(z.target.id, last.x, last.y), group.id);
          done(execute('Move tab', [...planned.move, ...planned.collapse]), 'commit');
          return;
        }
        const fin = leg?.finalize() ?? null;
        const it = engine.getItem(z.target.id);
        const before = split;
        if (it) it.locked = true;
        split = null;
        if (!fin || !before || !it) {
          leg?.abort();
          done(false, 'cancel');
          return;
        }
        const keep: CellRect = { x: it.x, y: it.y, w: it.w, h: it.h };
        const planned = plan.commands(fin.cell, fin.rect, group.id);
        const changed = execute('Split group', [
          ...fin.commands,
          ...groupCommands(fin, z.target.id),
          new SetGroupCellCommand(z.target.id, before.before, keep, before.frameBefore, cellToRect(keep, frame(), geom(), rows())),
          ...planned.move,
          ...planned.collapse,
        ]);
        done(changed, 'commit');
        return;
      }
      // ROOT DOCK: the hover only tinted the band; the ghost takes it NOW. A
      // free cell on the board: the leg already sits where it will land.
      if (z.kind === 'root') realizeDock(z, world);
      else if (zoneKey(zone) !== zoneKey(z)) applyZone(z, world);
      hideOverlay(); // a re-applied zone repaints its preview; the release is not a preview
      plan.markDrop(null, null);
      const fin = leg?.finalize() ?? null;
      relockGroups();
      if (!fin) {
        done(false, 'cancel');
        return;
      }
      const planned = plan.commands(fin.cell, fin.rect, leg?.groupId ?? group.id);
      done(execute(z.kind === 'root' ? 'Dock tab' : 'Move tab out', [...fin.commands, ...groupCommands(fin), ...planned.move, ...planned.collapse]), 'commit');
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
    return true;
  };

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
      node,
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
      }
      if (chip) {
        chip.style.left = `${e.clientX + 6}px`;
        chip.style.top = `${e.clientY + 6}px`;
      }
      const world = toWorld(e.clientX, e.clientY);
      const inside = worldInsideBoard(world.x, world.y);
      if (inside) {
        const tl = centredTopLeft(world.x, world.y, g.spans);
        const cell = pointToCell(tl.x, tl.y, frame(), geom(), rows(), g.spans.w);
        if (g.removedFromBoard) {
          g.removedFromBoard = false;
          // Enter at the bottom edge (collision-free), then take the cursor
          // cell GATELESSLY — gridstack's drag-in skips the gate on entry.
          // A bounded board with no room refuses the entry: the chip dims to
          // say so, and the release will snap it home.
          const entered = engine.add({ id: g.id, x: 0, y: engine.rows(), w: g.spans.w, h: g.spans.h });
          chip?.classList.toggle('axdb-out', !entered);
          if (entered) engine.moveCheck(g.id, cell.x, cell.y, { gate: false });
          project();
        } else if (engine.moveCheck(g.id, cell.x, cell.y).changed) {
          project();
        }
      } else if (!g.removedFromBoard) {
        g.removedFromBoard = true;
        chip?.classList.remove('axdb-out');
        engine.remove(g.id); // displaced tiles come home (gesture memory)
        project();
      }
      syncPlaceholder();
      api.render();
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
      if (commit && !g.removedFromBoard && engine.getItem(g.id)) {
        const item = engine.getItem(g.id)!;
        const cell: CellRect = { x: item.x, y: item.y, w: item.w, h: item.h };
        node.setGridItem(gridItemFromCell(cell));
        const displaced = buildCommitCommands(deltasSince(g.startCells, g.startGeom, g.id));
        engine.endGesture();
        cleanupGestureVisuals(g);
        gesture = null;
        void options.onDropIn?.(node, cell, displaced);
        persistLayouts();
        options.onGesture?.({ type: 'drop-in', kind: 'palette', nodeId: g.id, changed: true });
        api.renderNow();
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
    // A section is a LOCKED tile; for ITS OWN move it is the one moving.
    const self = engine.getItem(id);
    const wasLocked = !!self?.locked;
    if (self && isGroupMember(id)) self.locked = false;
    const ok = op();
    if (self && isGroupMember(id)) self.locked = wasLocked;
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
    const commands = buildCommitCommands(deltasSince(snap.cells, snap.geoms));
    if (isGroupMember(id)) {
      // A SECTION: its cell lives in group metadata and its frame is written
      // by project(); the node commands above skip groups (D5 of the review).
      const it = engine.getItem(id);
      const grp = diagram.getGroup(id);
      const cb = snap.cells.get(id);
      const gb = snap.geoms.get(id);
      if (it && grp && cb && gb && (cb.x !== it.x || cb.y !== it.y || cb.w !== it.w || cb.h !== it.h)) {
        commands.push(new SetGroupCellCommand(id, cb, { x: it.x, y: it.y, w: it.w, h: it.h }, { x: gb.pos.x, y: gb.pos.y, width: gb.size.width, height: gb.size.height }, frameOfGroup(grp)));
      }
    }
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
      return buildCommitCommands(deltas);
    },
    moveTo(id, x, y) {
      return programmatic('Move widget', id, () => engine.moveCheck(id, x, y).changed);
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
      api.container.removeEventListener('pointermove', onHover);
      api.container.removeEventListener('pointerleave', onHoverLeave);
      guardedLayer?.removeEventListener('pointerdown', staticGuard);
      api.container.removeEventListener('focusin', onFocusIn);
      api.container.removeEventListener('keydown', onKey);
      hostObserver.disconnect();
      containerObserver?.disconnect();
      tearing = null;
      for (const off of subs) off();
      // The corner handles are THIS binder's affordance: a board re-bound as a
      // split layout must not keep showing a resize corner it cannot act on.
      for (const id of group.members ?? []) hostOf(id)?.querySelector(':scope > .axdb-rs')?.remove();
      placeholder?.remove();
      placeholder = null;
      if (glideTimer) clearTimeout(glideTimer);
      for (const el of slabEls.values()) el.remove();
      slabEls.clear();
      hoverSlabs.clear();
      for (const bg of groupBgs.values()) bg.remove();
      groupBgs.clear();
      // A rebind inside the 60 ms window (a layout switch right after an undo)
      // disposed this binder with the timer pending — the host kept its
      // lifted ghost for good (visual gate, nested-containers ⑤).
      flushGhost();
      flushCarried();
      htmlLayer()?.classList.remove('axdb-glide');
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
  if (layer) hostObserver.observe(layer, { childList: true, subtree: true });
  containerObserver?.observe(api.container);

  return handle;
}
