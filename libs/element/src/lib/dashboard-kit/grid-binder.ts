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
  type GridItemConfig,
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

export interface DashboardGridOptions {
  /** Column count (default 12). */
  columns?: number;
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
  resizeHandles?: boolean;
}

export interface DashboardGridHandle {
  /** Rebuild the engine from the group's members + their cells, re-project pixels. */
  sync(): void;
  setSizing(mode: 'fit' | 'grow'): void;
  getSizing(): 'fit' | 'grow';
  /** Live board metrics (mapping inputs + derived row height / rows). */
  metrics(): {
    columns: number;
    gap: number;
    padding: number;
    sizing: 'fit' | 'grow';
    rows: number;
    rowHeight: number;
    columnUnit: number;
    boardHeight: number;
    frame: WorldRect;
  };
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

const BOARD_REGISTRY = new Map<HTMLElement, Set<BinderPeer>>();

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
  spans: { w: number; h: number };
  /** Drag-out: the item is currently absent from the engine. */
  removedFromBoard: boolean;
  /** Live cross-container adoption, when the pointer is over another board. */
  leg: { peer: BinderPeer; adopted: AdoptedLeg } | null;
  /** Last pointer position, world coords — release semantics depend on WHERE. */
  lastWorld: { x: number; y: number } | null;
  /** Last pointer position, screen coords (for the removeZone test). */
  lastScreen: { x: number; y: number } | null;
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

let binderSeq = 0;

export function bindDashboardGrid(
  api: DashboardGridApi,
  group: GroupModel,
  options: DashboardGridOptions = {}
): DashboardGridHandle {
  ensureDashboardKitStyles();

  const diagram = api.getModel();
  const columns = options.columns ?? 12;
  const gap = options.gap ?? 12;
  const padding = options.padding ?? gap;
  const baseRowHeight = options.baseRowHeight ?? 110;
  const minRowHeight = options.minRowHeight ?? 28;
  const float = options.float ?? false;
  const maxRows = options.maxRows;
  const dragOut = options.dragOut ?? 'cancel';
  const wantHandles = options.resizeHandles !== false;
  const designH = options.designHeight ?? group.size?.height ?? 0;

  let sizing: 'fit' | 'grow' = options.sizing ?? 'fit';
  let engine = new GridPackEngine([], { columns, float, maxRows });
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
    minRowHeight,
    designHeight: sizing === 'fit' ? frame().height : designH,
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
  const itemFor = (id: string): GridPackItem => {
    const node = diagram.getNode(id);
    if (node) {
      const spanMeta = Number(node.getMetadata?.('columnSpan')) || 0;
      const rowsMeta = Number(node.getMetadata?.('rowSpan')) || 0;
      const locked = node.state?.locked === true;
      const cell = cellFromGridItem(node.getGridItem?.(), {
        w: spanMeta || 1,
        h: rowsMeta || 1,
      });
      if (cell) return { id, ...cell, locked };
      const f = frame();
      const g = geom();
      if (node.position && (node.position.x !== 0 || node.position.y !== 0)) {
        // First adoption from pixels: where the tile already sits.
        const p = pointToCell(node.position.x, node.position.y, f, g, rows());
        const s = sizeToSpan(node.size.width, node.size.height, f, g, rows());
        return {
          id,
          x: Math.max(0, p.x),
          y: Math.max(0, p.y),
          w: spanMeta || s.w,
          h: rowsMeta || s.h,
          locked,
        };
      }
      return { id, x: 0, y: 0, w: spanMeta || 1, h: rowsMeta || 1, locked, autoPosition: true };
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
    const target =
      sizing === 'fit'
        ? designH
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

  const setGhost = (id: string, on: boolean): void => {
    const host = hostOf(id);
    if (!host) return;
    if (on) {
      if (ghostTimer) clearTimeout(ghostTimer);
      host.classList.add('axdb-ghost');
      host.classList.remove('axdb-out');
    } else {
      host.classList.remove('axdb-out');
      // Keep transition-exemption through the drop write so the snap into the
      // placeholder is INSTANT (gridstack-style), then let glides resume.
      if (ghostTimer) clearTimeout(ghostTimer);
      ghostTimer = setTimeout(() => host.classList.remove('axdb-ghost'), 60);
    }
  };

  // -- resize handles ---------------------------------------------------------

  const syncHandles = (): void => {
    if (!wantHandles || disposed) return;
    for (const id of group.members ?? []) {
      const node = diagram.getNode(id);
      if (!node) continue;
      const host = hostOf(id);
      if (!host) continue;
      const existing = host.querySelector(':scope > .axdb-rs');
      if (node.state?.locked === true) {
        existing?.remove();
        continue;
      }
      if (!existing) {
        const rs = document.createElement('div');
        rs.className = 'axdb-rs';
        rs.setAttribute('title', 'Resize');
        host.appendChild(rs);
      }
    }
  };

  const hostObserver = new MutationObserver(() => syncHandles());

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
      const placed = engine.add(item);
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
    project();
    api.render();
  };

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
      capturePointer(g.pointerId);
      api.container.style.cursor = g.kind === 'resize' ? 'nwse-resize' : 'grabbing';
    }
    syncPlaceholder();
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
    // Snap the ghost into its engine cell — the instant, truthful drop.
    const item = engine.getItem(g.id);
    if (item) {
      writing = true;
      try {
        writeRect(g.id, cellToRect(item, frame(), geom(), rows()));
      } finally {
        writing = false;
      }
    }
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
    engine.endGesture();
    cleanupGestureVisuals(g);
    gesture = null;
    enforceBoardHeight();
    api.renderNow();
    options.onGesture?.({ type: 'commit', kind: g.kind, nodeId: g.id, changed });
  };

  const cancelActiveGesture = (notify = true): void => {
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
        engine = new GridPackEngine(items, { columns, float, maxRows });
      } else {
        engine.cancelGesture();
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
          const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows());
          // Re-enter at the bottom edge (collision-free), then take the cursor
          // cell GATELESSLY — a first placement skips the anti-jitter gate.
          engine.add({ id: g.id, x: 0, y: engine.rows(), w: g.spans.w, h: g.spans.h });
          engine.moveCheck(g.id, cell.x, cell.y, { gate: false });
          project();
        } else {
          const cell = pointToCell(desired.x, desired.y, frame(), geom(), rows());
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
    const dw = ev.world.x - g.downWorld.x;
    const dh = ev.world.y - g.downWorld.y;
    const f = frame();
    const gg = geom();
    const minW = Math.max(8, columnUnitFor(gg, f.width));
    const minH = Math.max(8, rowHeightFor(gg, rows()));
    let w = Math.max(minW, g.startSize.width + dw);
    let h = Math.max(minH, g.startSize.height + dh);
    // NESTED HEIGHT ESCALATION (live report: "i cant increase height"). A
    // bounded strip cannot grow a tile taller than itself — so pulling
    // clearly past its bottom GROWS THE STRIP: the slab gains a row in the
    // parent board (all tiles inside get taller together), and releasing the
    // pull removes it again. The whole ledger commits inside this gesture's
    // one BatchCommand; Escape reverts it.
    if (maxRows !== undefined && g.kind === 'resize') {
      const visual = boardVisualHeight();
      const parent = parentPeer();
      if (parent) {
        const slabRows = g.esc ? g.esc.cellAfter.h : 1;
        const rowPx = visual / Math.max(1, slabRows);
        if (h > visual + 24) {
          const res = parent.resizeMemberBy(group.id, +1);
          if (res.changed && res.cellBefore && res.cellAfter && res.frameBefore && res.frameAfter) {
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
            g.esc.rowsAdded += 1;
            g.esc.cellAfter = res.cellAfter;
            g.esc.frameAfter = res.frameAfter;
            project();
          }
        } else if (g.esc && g.esc.rowsAdded > 0 && h < visual - rowPx * 0.7) {
          const res = parent.resizeMemberBy(group.id, -1);
          if (res.changed && res.cellAfter && res.frameAfter) {
            g.esc.rowsAdded -= 1;
            g.esc.cellAfter = res.cellAfter;
            g.esc.frameAfter = res.frameAfter;
            project();
          }
        }
      }
    }
    // The fluid preview must not outrun what the board can accept: on a
    // bounded strip an unclamped ghost ballooned to 273px while the engine
    // (rightly) refused every cell — visually indistinguishable from the
    // squeeze bug it replaced. Clamp to the tile's maximum legal rect.
    // (Escalation above may have just grown the board — re-read the frame.)
    const fNow = frame();
    const ggNow = geom();
    const itemNow = engine.getItem(g.id);
    if (itemNow) {
      const cuNow = columnUnitFor(ggNow, fNow.width);
      const rhNow = rowHeightFor(ggNow, rows());
      w = Math.min(w, (columns - itemNow.x) * (cuNow + gap) - gap);
      if (maxRows !== undefined) {
        h = Math.min(h, Math.max(1, maxRows - itemNow.y) * (rhNow + gap) - gap);
      }
    }
    g.node.setSize(w, h, g.node.size.depth ?? 0);
    const spanF = maxRows !== undefined ? frame() : f;
    const spanG = maxRows !== undefined ? geom() : gg;
    const span = sizeToSpan(w, h, spanF, spanG, rows());
    if (engine.resizeCheck(g.id, span.w, span.h).changed) project();
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
    if (maxRows !== undefined) span.h = Math.max(1, Math.min(maxRows, span.h));
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
    const cell0 = pointToCell(tl.x, tl.y, f, gg, rows());
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
        const cell = pointToCell(tlm.x, tlm.y, frame(), geom(), rows());
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
    hasItem: (id) => !!engine.getItem(id),
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

  const tool: CanvasTool = {
    id: `dashboard-grid:${group.id}:${++binderSeq}`,
    priority: 2, // point-specific claim — outranks mode-style tools (see ext/tools.ts)
    hitTest(ev, hit) {
      if (disposed) return false;
      if (gesture) return true; // own the rest of an in-flight gesture
      if (hit.node) return (group.members ?? new Set<string>()).has(hit.node.id);
      // Claim (and deaden) empty presses inside a member group's frame so the
      // built-in group-drag cannot fight the pack layout for the KPI slab.
      return insideMemberGroupFrame(ev.world.x, ev.world.y);
    },
    onPointerDown(ev, hit) {
      if (gesture || !hit.node) return; // dead zone (slab area), or mid-palette
      const node = diagram.getNode(hit.node.id);
      if (!node || node.state?.locked === true) return; // pinned: refuse; click still focuses
      const target = (ev.source?.target ?? null) as Element | null;
      const isResize = !!target?.closest?.('.axdb-rs');
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
        spans: { w: it?.w ?? 1, h: it?.h ?? 1 },
        removedFromBoard: false,
        leg: null,
        lastWorld: null,
        lastScreen: null,
        esc: null,
        chip: null,
      };
    },
    onPointerMove(ev) {
      onToolMove(ev);
    },
    onPointerUp() {
      onToolUp();
    },
    onCancel() {
      cancelActiveGesture();
    },
  };

  const unregisterTool = registerTool(tool);

  // -- palette drag-in --------------------------------------------------------

  const beginPaletteDrag = (
    node: NodeModel,
    spec: { w: number; h: number; chip?: HTMLElement },
    event: PointerEvent
  ): void => {
    if (disposed || gesture) return;
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
      spans: { w: Math.max(1, spec.w), h: Math.max(1, spec.h) },
      removedFromBoard: true,
      leg: null,
      lastWorld: null,
      lastScreen: null,
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
        const cell = pointToCell(tl.x, tl.y, frame(), geom(), rows());
        if (g.removedFromBoard) {
          g.removedFromBoard = false;
          // Enter at the bottom edge (collision-free), then take the cursor
          // cell GATELESSLY — gridstack's drag-in skips the gate on entry.
          engine.add({ id: g.id, x: 0, y: engine.rows(), w: g.spans.w, h: g.spans.h });
          engine.moveCheck(g.id, cell.x, cell.y, { gate: false });
          project();
        } else if (engine.moveCheck(g.id, cell.x, cell.y).changed) {
          project();
        }
      } else if (!g.removedFromBoard) {
        g.removedFromBoard = true;
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
    engine.endGesture();
    disarmGlideSoon();
    enforceBoardHeight();
    if (commands.length > 0) {
      await api.getEngine().commandManager.execute(new BatchCommand(name, commands));
    }
    api.renderNow();
    return true;
  };

  const handle: DashboardGridHandle = {
    sync(): void {
      if (disposed) return;
      if (gesture) cancelActiveGesture(false);
      const items: GridPackItem[] = [];
      for (const id of group.members ?? []) {
        if (!memberEntity(id)) continue;
        items.push(itemFor(id));
      }
      engine = new GridPackEngine(items, { columns, float, maxRows });
      for (const item of engine.getItems()) persistAdoptedCell(item.id, item);
      project();
      syncHandles();
      api.renderNow();
    },
    setSizing(mode): void {
      if (mode === sizing) return;
      sizing = mode;
      project();
      api.renderNow();
    },
    getSizing: () => sizing,
    metrics() {
      const f = frame();
      const g = geom();
      const r = rows();
      return {
        columns,
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
      return programmatic('Resize widget', id, () => engine.resizeCheck(id, w, h).changed);
    },
    beginPaletteDrag,
    dispose(): void {
      if (disposed) return;
      cancelActiveGesture(false);
      disposed = true;
      peersOnCanvas().delete(selfPeer);
      unregisterTool();
      hostObserver.disconnect();
      for (const off of subs) off();
      placeholder?.remove();
      placeholder = null;
      if (glideTimer) clearTimeout(glideTimer);
      if (ghostTimer) clearTimeout(ghostTimer);
      htmlLayer()?.classList.remove('axdb-glide');
      api.container.style.cursor = '';
    },
  };

  // Boot: adopt the current members, observe host churn for handle re-injection.
  handle.sync();
  const layer = htmlLayer();
  if (layer) hostObserver.observe(layer, { childList: true, subtree: true });

  return handle;
}
