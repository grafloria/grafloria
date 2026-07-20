/**
 * Dashboard-kit pure math — Phase 2 of the dashboard-grid plan
 * (`documentation/api-architecture/dashboard-grid-plan.html`).
 *
 * Everything here is DOM-free and instance-free so it can be table-driven from
 * a jest spec: the cell↔pixel mapping in both sizing modes, the
 * GridItemConfig↔GridPackItem round-trip, and the gesture commit-batch
 * construction. The stateful binder (`grid-binder.ts`) is a thin pointer loop
 * over these functions plus the engine's `GridPackEngine` — the engine owns
 * ALL cell math (push/swap/gate/settle); this module owns only how cells and
 * pixels convert into each other and into undoable commands.
 *
 * SIZING MODES (user decision, recorded in the plan's Section 6):
 *   'fit'  — DevExtreme-style compact. The board keeps its DESIGN height and
 *            the row height re-derives from the content's row count, so every
 *            widget always stays inside the frame — nothing can be pushed out
 *            of reach. Guarded by `minRowHeight` so a pathological row count
 *            squeezes to a floor instead of zero.
 *   'grow' — rows keep `baseRowHeight` and the board frame extends downward
 *            to hold them (never below the design height). Camera refit after
 *            growth is the page's concern (its existing `frameTab`).
 */

import {
  MoveNodeCommand,
  ResizeNodeCommand,
  SetGridItemCommand,
  type Command,
  type GridItemConfig,
} from '@grafloria/engine';

/** One tile in integer board cells — the shape `GridPackEngine` speaks. */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A world-space rectangle (the group frame, or a projected tile). */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DashboardGridGeometry {
  /** Column count of the board (default 12). */
  columns: number;
  /** Gap between cells, px. */
  gap: number;
  /** Padding between the board frame and the outermost cells, px. */
  padding: number;
  sizing: 'fit' | 'grow';
  /** Row height in 'grow' mode, px. */
  baseRowHeight: number;
  /** Floor for the derived 'fit' row height, px. */
  minRowHeight: number;
  /** The board's design height — 'fit' keeps it, 'grow' never shrinks below it. */
  designHeight: number;
  /**
   * RIGHT-TO-LEFT boards. The MODEL is direction-agnostic — cell x=0 is always
   * "the first column" and every rule in `GridPackEngine` (push, swap, gravity,
   * the anti-jitter gate) is written in cells, so none of it changes. ONLY this
   * module's pixel mapping mirrors: x=0 renders at the board's RIGHT edge and
   * columns run leftwards. A layout saved in one direction therefore renders
   * mirrored in the other with byte-identical cells, which is the property the
   * kit's spec and the e2e battery both assert.
   */
  rtl?: boolean;
}

/** Row height for a board currently `rows` rows tall (both modes). */
export function rowHeightFor(g: DashboardGridGeometry, rows: number): number {
  if (g.sizing === 'grow') return g.baseRowHeight;
  const r = Math.max(1, rows);
  // design = 2*padding + r*rowH + (r-1)*gap  →  solve for rowH.
  return Math.max(g.minRowHeight, (g.designHeight - 2 * g.padding - (r - 1) * g.gap) / r);
}

/** The board frame height the mode implies for `rows` rows. */
export function boardHeightFor(g: DashboardGridGeometry, rows: number): number {
  if (g.sizing === 'fit') return g.designHeight;
  const r = Math.max(0, rows);
  const content = 2 * g.padding + (r === 0 ? 0 : r * g.baseRowHeight + (r - 1) * g.gap);
  return Math.max(g.designHeight, content);
}

/** Width of one column cell for a board `width` px wide. */
export function columnUnitFor(g: DashboardGridGeometry, width: number): number {
  return (width - 2 * g.padding - (g.columns - 1) * g.gap) / g.columns;
}

/** Width in px of a `w`-column span (the pitch identity used by both mappings). */
export function spanWidthPx(w: number, g: DashboardGridGeometry, frameWidth: number): number {
  const cu = columnUnitFor(g, frameWidth);
  return w * cu + (w - 1) * g.gap;
}

/**
 * Project integer cells into a world rectangle inside `frame`.
 *
 * RTL mirrors about the board's vertical centre line: the distance from the
 * board's RIGHT padding edge to the tile's RIGHT edge equals what the LTR
 * distance from the left padding edge to the tile's LEFT edge would be. Only
 * the x term changes — rows, heights and spans are direction-agnostic.
 */
export function cellToRect(
  cell: CellRect,
  frame: WorldRect,
  g: DashboardGridGeometry,
  rows: number
): WorldRect {
  const cu = columnUnitFor(g, frame.width);
  const rh = rowHeightFor(g, rows);
  const width = cell.w * cu + (cell.w - 1) * g.gap;
  return {
    x: g.rtl
      ? frame.x + frame.width - g.padding - cell.x * (cu + g.gap) - width
      : frame.x + g.padding + cell.x * (cu + g.gap),
    y: frame.y + g.padding + cell.y * (rh + g.gap),
    width,
    height: cell.h * rh + (cell.h - 1) * g.gap,
  };
}

/**
 * The cell whose slot a tile TOP-LEFT at world (x, y) is closest to — the
 * prototype's margin-adjusted midpoint rounding (`round(L / cellPitch)`).
 * Clamping to the board is the ENGINE's job (moveCheck clamps), not ours.
 *
 * `spanW` is the tile's COLUMN SPAN and is used only when `g.rtl`: mirrored,
 * the cell is decided by the tile's RIGHT edge (its leading edge), so the
 * span is what converts the given left edge into it. LTR ignores it entirely,
 * which is why every existing call site keeps its exact behaviour. Getting
 * this wrong is the classic RTL drag bug — the tile lands a span away from
 * the placeholder — so the e2e battery asserts drop-on-placeholder in RTL.
 */
export function pointToCell(
  x: number,
  y: number,
  frame: WorldRect,
  g: DashboardGridGeometry,
  rows: number,
  spanW = 1
): { x: number; y: number } {
  const cu = columnUnitFor(g, frame.width);
  const rh = rowHeightFor(g, rows);
  const right = x + spanWidthPx(spanW, g, frame.width);
  return {
    x: g.rtl
      ? Math.round((frame.x + frame.width - g.padding - right) / (cu + g.gap))
      : Math.round((x - frame.x - g.padding) / (cu + g.gap)),
    y: Math.round((y - frame.y - g.padding) / (rh + g.gap)),
  };
}

/**
 * The integer span a fluid pixel size rounds to — the prototype's
 * `round((W + margin) / cellPitch)`, floored at 1×1.
 */
export function sizeToSpan(
  widthPx: number,
  heightPx: number,
  frame: WorldRect,
  g: DashboardGridGeometry,
  rows: number
): { w: number; h: number } {
  const cu = columnUnitFor(g, frame.width);
  const rh = rowHeightFor(g, rows);
  return {
    w: Math.max(1, Math.round((widthPx + g.gap) / (cu + g.gap))),
    h: Math.max(1, Math.round((heightPx + g.gap) / (rh + g.gap))),
  };
}

// ---------------------------------------------------------------------------
// GridItemConfig ↔ engine cells.
//
// The cell state lives in the EXISTING GridItemConfig (1-based, exclusive-end
// line numbers — CSS grid vocabulary): columnStart/rowStart are the cell + 1,
// columnEnd/rowEnd are cell + span + 1. Nothing new is persisted; save/load
// already round-trips gridItem.
// ---------------------------------------------------------------------------

/** Engine cells → the GridItemConfig that persists them. */
export function gridItemFromCell(cell: CellRect): GridItemConfig {
  return {
    columnStart: cell.x + 1,
    columnEnd: cell.x + cell.w + 1,
    rowStart: cell.y + 1,
    rowEnd: cell.y + cell.h + 1,
  };
}

/**
 * GridItemConfig → engine cells, or null when the config carries no usable
 * placement (absent, or 'auto' lines). `fallback` fills spans a partial
 * config omits — the first-adoption path uses metadata `columnSpan` there.
 */
export function cellFromGridItem(
  gi: GridItemConfig | undefined,
  fallback?: { w?: number; h?: number }
): CellRect | null {
  if (!gi) return null;
  const num = (v: number | 'auto' | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const cs = num(gi.columnStart);
  const rs = num(gi.rowStart);
  if (cs === null || rs === null) return null;
  const ce = num(gi.columnEnd);
  const re = num(gi.rowEnd);
  const w = ce !== null ? ce - cs : fallback?.w ?? 1;
  const h = re !== null ? re - rs : fallback?.h ?? 1;
  return { x: cs - 1, y: rs - 1, w: Math.max(1, w), h: Math.max(1, h) };
}

// ---------------------------------------------------------------------------
// Commit-batch construction.
//
// A gesture ends in ONE BatchCommand reconciling gesture-start → final state:
//   - SetGridItemCommand for every tile whose CELLS changed (cells are the
//     truth — undo restores them, and a later sync re-derives pixels);
//   - MoveNodeCommand / ResizeNodeCommand for every UNLOCKED node whose
//     geometry changed, so a bare undo (no binder sync) still restores what
//     the user sees. Locked tiles never get geometry commands: the model's
//     authoritative lock refuses those writes — their pixels are DERIVED
//     state the binder re-projects via runSystemWrite.
//   - MoveNodeCommand opts OUT of merging: one command per completed gesture
//     must stay one undo step; the manager's 500ms merge window would fold
//     two quick drags of the same tile into one.
// ---------------------------------------------------------------------------

export interface TileDelta {
  id: string;
  locked?: boolean;
  /** Group members (layout slabs) get cells-only commands — never Move/Resize. */
  isGroup?: boolean;
  cellBefore: CellRect;
  cellAfter: CellRect;
  posBefore: { x: number; y: number };
  posAfter: { x: number; y: number };
  sizeBefore: { width: number; height: number; depth?: number };
  sizeAfter: { width: number; height: number; depth?: number };
}

const cellsDiffer = (a: CellRect, b: CellRect): boolean =>
  a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;

const EPS = 0.5;

export function buildCommitCommands(deltas: TileDelta[]): Command[] {
  const commands: Command[] = [];
  for (const d of deltas) {
    const cellChanged = cellsDiffer(d.cellBefore, d.cellAfter);
    if (cellChanged && !d.isGroup) {
      commands.push(new SetGridItemCommand(d.id, gridItemFromCell(d.cellAfter)));
    }
    if (d.locked || d.isGroup) continue;
    if (
      Math.abs(d.posAfter.x - d.posBefore.x) > EPS ||
      Math.abs(d.posAfter.y - d.posBefore.y) > EPS
    ) {
      commands.push(
        new MoveNodeCommand(d.id, { ...d.posAfter }, { ...d.posBefore }, { mergeable: false })
      );
    }
    if (
      Math.abs(d.sizeAfter.width - d.sizeBefore.width) > EPS ||
      Math.abs(d.sizeAfter.height - d.sizeBefore.height) > EPS
    ) {
      commands.push(
        new ResizeNodeCommand(
          d.id,
          { depth: 0, ...d.sizeAfter },
          { depth: 0, ...d.sizeBefore }
        )
      );
    }
  }
  return commands;
}
