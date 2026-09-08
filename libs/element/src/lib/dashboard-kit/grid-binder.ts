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
    node: NodeModel,
    world: { x: number; y: number },
    pxSize: { width: number; height: number }
  ): AdoptedLeg | null;
}

interface AdoptedLeg {
  groupId: string;
  /** Drive the target engine from the source binder's pointer stream. */
  move(world: { x: number; y: number }): void;
  /** Undo the adoption: target board back to its pre-entry layout. */
  abort(): void;
  /**
   * Close the leg for commit: returns the target-side displaced commands, the
   * tile's final cell and its projected rect. Null when the tile is somehow
   * gone (treat as abort).
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

/**
 * Register a board that is NOT a grid (the split binder on a container) as a
 * peer on its canvas, so the parent grid's hitTest defers a press on one of
 * its tiles to it ("a press on a tile that belongs to a NESTED board must
 * reach that board's tool") whatever the registration order. Returns the
 * unregister. A split board adopts nothing and grows no slab: its `adopt`
 * answers null and `resizeMemberBy` answers unchanged.
 */
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
const EDGE_GRIP = 7;

interface ResizeEdges {
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

const anyEdge = (E: ResizeEdges): boolean => E.n || E.e || E.s || E.w;

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
  const bound = (): number | undefined => maxRows ?? capacity;

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
  let glideTimer: ReturnType<typeof setTimeout> | null = null;
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;

  const frame = (): WorldRect => ({
    x: group.position.x,
    y: group.position.y,
    width: group.size?.width ?? 0,
    height: group.size?.height ?? 0,
  });

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

  const rows = (): number => Math.max(1, engine.rows());

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
  const slabEdgesNear = (grp: GroupModel, x: number, y: number): ResizeEdges => {
    const p = grp.position;
    const s = sizeOf(grp);
    return { n: y - p.y <= EDGE_GRIP, s: p.y + s.height - y <= EDGE_GRIP, w: x - p.x <= EDGE_GRIP, e: p.x + s.width - x <= EDGE_GRIP };
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
    }
    for (const [id, el] of slabEls) {
      if (!seen.has(id)) {
        el.remove();
        slabEls.delete(id);
      }
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
  }
  let slabGesture: SlabGesture | null = null;
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
    };
    capturePointer(slabGesture.pointerId);
    api.container.style.cursor = cursorFor(edges);
  };
  const slabMove = (ev: ToolPointerEvent): void => {
    const g = slabGesture;
    if (!g) return;
    if (!g.started) {
      if (Math.abs(ev.screen.x - g.downScreen.x) + Math.abs(ev.screen.y - g.downScreen.y) < DRAG_THRESHOLD) return;
      g.started = true;
      armGlide();
    }
    const it = engine.getItem(g.id);
    if (!it) return;
    const f = frame();
    const gg = geom();
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
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
    if (!g.started) {
      engine.endGesture();
      return;
    }
    engine.endGesture();
    project();
    const it = engine.getItem(g.id);
    const grp = diagram.getGroup(g.id);
    const commands = buildCommitCommands(deltasSince(g.startCells, g.startGeom, g.id));
    const b = g.cellBefore;
    if (it && grp && (b.x !== it.x || b.y !== it.y || b.w !== it.w || b.h !== it.h)) {
      commands.push(new SetGroupCellCommand(g.id, b, { x: it.x, y: it.y, w: it.w, h: it.h }, g.frameBefore, frameOfGroup(grp)));
    }
    const changed = execute('Resize section', commands);
    disarmGlideSoon();
    syncHandles();
    api.renderNow();
    options.onGesture?.({ type: 'commit', kind: 'resize', nodeId: g.id, changed });
  };
  const slabCancel = (): void => {
    const g = slabGesture;
    if (!g) return;
    slabGesture = null;
    releasePointer(g.pointerId);
    api.container.style.cursor = '';
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
    //  · a tile spanning the section's FULL HEIGHT (every tile of a one-row
    //    KPI strip): the section gains a row and every full-height tile grows
    //    with it — a row of tiles pulled taller stays a row (s21) — and gives
    //    it back when pulled up, never below the design;
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
        const wantsMore = wantRows > pulled.h;
        const wantsLess = wantRows < pulled.h;
        const fullHeight = pulled.y === 0 && pulled.h >= inner;
        const fullOnes = engine.getItems().filter((i) => i.y === 0 && i.h >= inner).map((i) => i.id);
        const resizeAll = (ids: string[], rowsTo: number): void => {
          for (const id of ids) {
            const it = engine.getItem(id);
            if (it) engine.resizeCheck(id, it.w, rowsTo);
          }
        };
        let touched = false;
        if (wantsMore) {
          if (fullHeight) {
            const res = parent.resizeMemberBy(group.id, +1);
            if (res.changed) {
              record(res, +1);
              setInnerRows(inner + 1);
              resizeAll(fullOnes, inner + 1);
              touched = true;
            }
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
              resizeAll(fullOnes, inner - 1);
              const res = parent.resizeMemberBy(group.id, -1);
              if (res.changed) {
                record(res, -1);
                setInnerRows(inner - 1);
              } else {
                resizeAll(fullOnes, inner);
              }
              touched = true;
            }
          } else if (pulled.h > 1) {
            engine.resizeCheck(g.id, pulled.w, pulled.h - 1);
            const floor = Math.max(designRows, extentOf(engine.getItems()));
            if (slabRows > floor) {
              const res = parent.resizeMemberBy(group.id, -1);
              if (res.changed) {
                record(res, -1);
                setInnerRows(inner - 1);
              }
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
      if (!pullsY) h = itemNow.h * (rhNow + gap) - gap;
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
      if (moves && growing) changed = engine.moveCheck(g.id, tx, ty, { gate: false }).changed || changed;
      changed = engine.resizeCheck(g.id, span.w, span.h).changed || changed;
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
      execute('Move widget', crossing);
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

  /** This binder's side of an adoption: enter gateless, then live-push. */
  const adopt = (
    node: NodeModel,
    world: { x: number; y: number },
    pxSize: { width: number; height: number }
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
    const entered = engine.add({ id: node.id, x: 0, y: engine.rows(), w: span.w, h: span.h });
    if (!entered) {
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
    const tl = centredTopLeft(world.x, world.y, span);
    const cell0 = pointToCell(tl.x, tl.y, f, gg, rows(), span.w);
    engine.moveCheck(node.id, cell0.x, cell0.y, { gate: false });
    armGlide();
    project();
    syncPlaceholder();
    return {
      groupId: group.id,
      move: (w) => {
        const item = engine.getItem(node.id);
        if (!item) return;
        const tlm = centredTopLeft(w.x, w.y, { w: item.w, h: item.h });
        const cell = pointToCell(tlm.x, tlm.y, frame(), geom(), rows(), item.w);
        if (engine.moveCheck(node.id, cell.x, cell.y).changed) project();
        syncPlaceholder();
      },
      abort: () => {
        engine.remove(node.id);
        engine.cancelGesture(); // pre-entry layout, memory cleared
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
        engine.endGesture();
        adoptedGhostId = null;
        disarmGlideSoon();
        syncPlaceholder();
        return { commands, cell, rect };
      },
    };
  };

  const selfPeer: BinderPeer = {
    group,
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

  const tool: CanvasTool = {
    id: `dashboard-grid:${group.id}:${++binderSeq}`,
    priority: 2, // point-specific claim — outranks mode-style tools (see ext/tools.ts)
    hitTest(ev, hit) {
      if (disposed) return false;
      if (gesture || slabGesture || forwardSlab) return true; // own the rest of an in-flight gesture
      if (!ownsPress(api.container, diagram, ev, hit)) return false;
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
      // A press on a painted grip names its widget by the DOM: an OUTSIDE tab
      // sits above the card's box, where the hit test sees the gap or the
      // neighbour above.
      const gripHost = gripHostOf(target);
      const gripId = gripHost?.getAttribute('data-node-id') ?? null;
      const onGrip = !!gripId && (group.members ?? new Set<string>()).has(gripId);
      if (!hit.node && !onGrip) {
        // A press on a SECTION — its empty band, its corner handle or its
        // frame edge — selects the section; the handle or an edge resizes it.
        const slabHandle = target?.closest?.('.axdb-slab > .axdb-rs') as HTMLElement | null;
        const slabId = slabHandle?.parentElement?.getAttribute('data-slab-id') ?? memberGroupAt(ev.world.x, ev.world.y);
        const grp = slabId && (group.members ?? new Set<string>()).has(slabId) ? diagram.getGroup(slabId) : undefined;
        if (slabId && grp) {
          selectWidget(slabId);
          api.render();
          if (isStatic) return;
          const edges: ResizeEdges = slabHandle
            ? rtl ? { n: false, e: false, s: true, w: true } : { n: false, e: true, s: true, w: false }
            : slabEdgesNear(grp, ev.world.x, ev.world.y);
          if (anyEdge(edges)) beginSlabResize(slabId, edges, ev);
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
        lastWorld: null,
        lastScreen: null,
        hostEl: null,
        esc: null,
        chip: null,
      };
    },
    onPointerMove(ev) {
      if (forwardSlab) forwardSlab.slabMove?.(ev);
      else if (slabGesture) slabMove(ev);
      else onToolMove(ev);
    },
    onPointerUp() {
      if (forwardSlab) {
        forwardSlab.slabUp?.();
        forwardSlab = null;
      } else if (slabGesture) slabUp();
      else onToolUp();
    },
    onCancel() {
      cancelActiveGesture();
    },
  };

  const unregisterTool = registerTool(tool);

  /**
   * Edge affordance: the cursor says which border a press would take, the
   * way gridstack's invisible edge handles do. One passive listener on the
   * container; the corner handle keeps its own cursor from the stylesheet.
   */
  let hoverHost: HTMLElement | null = null;
  const onHover = (e: PointerEvent): void => {
    if (disposed || gesture) return;
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
    if (!op()) {
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
  const rebuild = (pack: boolean): void => {
    if (disposed) return;
    if (gesture) cancelActiveGesture(false);
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
      const clone = new GridPackEngine(
        engine.getItems().map((i) => ({ ...i })),
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
      guardedLayer?.removeEventListener('pointerdown', staticGuard);
      api.container.removeEventListener('focusin', onFocusIn);
      api.container.removeEventListener('keydown', onKey);
      hostObserver.disconnect();
      containerObserver?.disconnect();
      for (const off of subs) off();
      // The corner handles are THIS binder's affordance: a board re-bound as a
      // split layout must not keep showing a resize corner it cannot act on.
      for (const id of group.members ?? []) hostOf(id)?.querySelector(':scope > .axdb-rs')?.remove();
      placeholder?.remove();
      placeholder = null;
      if (glideTimer) clearTimeout(glideTimer);
      for (const el of slabEls.values()) el.remove();
      slabEls.clear();
      // A rebind inside the 60 ms window (a layout switch right after an undo)
      // disposed this binder with the timer pending — the host kept its
      // lifted ghost for good (visual gate, nested-containers ⑤).
      flushGhost();
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
