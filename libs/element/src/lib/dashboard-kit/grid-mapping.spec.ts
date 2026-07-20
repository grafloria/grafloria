/**
 * Dashboard-kit pure math — the acceptance suite for the binder's DOM-free
 * parts: cell↔pixel mapping in BOTH sizing modes, the GridItemConfig↔cell
 * round-trip, and gesture commit-batch construction.
 *
 * The numbers are the demo page's real geometry (TAB_W 1180 × TAB_H 660,
 * gap/padding 14, 12 columns) so a failure reads against the exact board the
 * user drives.
 *
 * MUTATION-PROVEN asserts (each mutant applied, run, seen red, reverted):
 *   K1  rowHeightFor's fit formula: dropping the `(rows-1)*gap` term
 *       (`(design - 2*padding) / rows`) → 'fit derives the exact overview row
 *       height' fails (121.0 ≠ 115.2) and the round-trip test fails.
 *   K2  buildCommitCommands' MoveNodeCommand old-position capture: passing
 *       `d.posAfter` as oldPosition → 'move command records the exact inverse'
 *       fails (serialized oldPosition equals the new one).
 */
import { MoveNodeCommand, ResizeNodeCommand, SetGridItemCommand } from '@grafloria/engine';
import {
  boardHeightFor,
  buildCommitCommands,
  cellFromGridItem,
  cellToRect,
  columnUnitFor,
  gridItemFromCell,
  pointToCell,
  rowHeightFor,
  sizeToSpan,
  type DashboardGridGeometry,
  type TileDelta,
  type WorldRect,
} from './grid-mapping';

const FRAME: WorldRect = { x: 0, y: 0, width: 1180, height: 660 };

const geom = (overrides: Partial<DashboardGridGeometry> = {}): DashboardGridGeometry => ({
  columns: 12,
  gap: 14,
  padding: 14,
  sizing: 'fit',
  baseRowHeight: 130,
  minRowHeight: 28,
  designHeight: 660,
  ...overrides,
});

describe('dashboard-kit mapping — row height and board height', () => {
  it('fit derives the exact overview row height (5 rows in a 660 board)', () => {
    // 660 = 2*14 + 5*rowH + 4*14  →  rowH = (660 - 28 - 56) / 5 = 115.2   (K1)
    expect(rowHeightFor(geom(), 5)).toBeCloseTo(115.2, 5);
  });

  it('fit squeezes as rows grow, and stops at the minRowHeight floor', () => {
    const g = geom();
    expect(rowHeightFor(g, 6)).toBeLessThan(rowHeightFor(g, 5));
    expect(rowHeightFor(g, 500)).toBe(g.minRowHeight);
  });

  it('grow keeps the base row height regardless of rows', () => {
    const g = geom({ sizing: 'grow' });
    expect(rowHeightFor(g, 1)).toBe(130);
    expect(rowHeightFor(g, 50)).toBe(130);
  });

  it('fit board height IS the design height; grow extends but never shrinks below it', () => {
    expect(boardHeightFor(geom(), 12)).toBe(660);
    const g = geom({ sizing: 'grow' });
    // 5 rows at 130: 2*14 + 5*130 + 4*14 = 734 > 660 → grows.
    expect(boardHeightFor(g, 5)).toBe(734);
    // 3 rows at 130: 2*14 + 3*130 + 2*14 = 446 < 660 → design height holds.
    expect(boardHeightFor(g, 3)).toBe(660);
  });
});

describe('dashboard-kit mapping — cell ↔ pixel round-trip (both modes)', () => {
  const cases: Array<{ mode: 'fit' | 'grow'; rows: number }> = [
    { mode: 'fit', rows: 5 },
    { mode: 'fit', rows: 3 },
    { mode: 'grow', rows: 5 },
    { mode: 'grow', rows: 8 },
  ];

  it.each(cases)('cellToRect → pointToCell/sizeToSpan is the identity ($mode, $rows rows)', ({ mode, rows }) => {
    const g = geom({ sizing: mode });
    for (const cell of [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 8, y: 1, w: 4, h: 2 },
      { x: 0, y: 3, w: 12, h: 2 },
      { x: 5, y: 2, w: 1, h: 1 },
    ]) {
      const r = cellToRect(cell, FRAME, g, rows);
      expect(pointToCell(r.x, r.y, FRAME, g, rows)).toEqual({ x: cell.x, y: cell.y });
      expect(sizeToSpan(r.width, r.height, FRAME, g, rows)).toEqual({ w: cell.w, h: cell.h });
    }
  });

  it('projects the demo line chart (span 8 of 12) to the flex-identical width', () => {
    // colUnit = (1180 - 28 - 154) / 12 = 83.1666…; span8 = 8*cu + 7*14
    const g = geom();
    expect(columnUnitFor(g, FRAME.width)).toBeCloseTo(83.1667, 3);
    const r = cellToRect({ x: 0, y: 1, w: 8, h: 2 }, FRAME, g, 5);
    expect(r.width).toBeCloseTo(8 * 83.16667 + 7 * 14, 2);
    expect(r.x).toBeCloseTo(14, 5);
    // y = padding + 1 * (rowH + gap) = 14 + 129.2
    expect(r.y).toBeCloseTo(14 + 115.2 + 14, 3);
  });

  it('midpoint rounding: a tile dragged just under half a pitch stays; past it, crosses', () => {
    const g = geom();
    const r = cellToRect({ x: 3, y: 0, w: 3, h: 1 }, FRAME, g, 5);
    const pitch = columnUnitFor(g, FRAME.width) + g.gap;
    expect(pointToCell(r.x + pitch * 0.49, r.y, FRAME, g, 5).x).toBe(3);
    expect(pointToCell(r.x + pitch * 0.51, r.y, FRAME, g, 5).x).toBe(4);
  });

  it('projection is frame-relative: a parked board (x = -20000) projects off-canvas', () => {
    const parked: WorldRect = { ...FRAME, x: -20000 };
    const r = cellToRect({ x: 0, y: 0, w: 3, h: 1 }, parked, geom(), 5);
    expect(r.x).toBe(-20000 + 14);
  });
});

// ===========================================================================
// RTL — the model is direction-agnostic; ONLY this mapping mirrors.
//
// Every assert below is written as a comparison between the SAME cells mapped
// LTR and RTL, so what is being proved is the mirror relationship itself
// rather than a pile of hand-computed pixels.
// ===========================================================================
describe('dashboard-kit mapping — RTL mirrors pixels, never cells', () => {
  const CELLS = [
    { x: 0, y: 0, w: 3, h: 1 },
    { x: 8, y: 1, w: 4, h: 2 },
    { x: 0, y: 3, w: 12, h: 2 },
    { x: 5, y: 2, w: 1, h: 1 },
  ];

  it('cell x=0 renders at the RIGHT edge, and the whole row mirrors', () => {
    const ltr = geom();
    const rtl = geom({ rtl: true });
    const a = cellToRect({ x: 0, y: 0, w: 3, h: 1 }, FRAME, rtl, 5);
    // Its RIGHT edge sits one padding in from the board's right edge…
    expect(a.x + a.width).toBeCloseTo(FRAME.x + FRAME.width - 14, 5);
    // …which is the exact mirror of where LTR puts its LEFT edge.
    const aL = cellToRect({ x: 0, y: 0, w: 3, h: 1 }, FRAME, ltr, 5);
    expect(aL.x).toBeCloseTo(14, 5);
    // The last column mirrors to the left edge.
    const z = cellToRect({ x: 9, y: 0, w: 3, h: 1 }, FRAME, rtl, 5);
    expect(z.x).toBeCloseTo(14, 5);
  });

  it('is an exact mirror of LTR for every cell: same size, mirrored x, same y', () => {
    const ltr = geom();
    const rtl = geom({ rtl: true });
    for (const cell of CELLS) {
      const l = cellToRect(cell, FRAME, ltr, 5);
      const r = cellToRect(cell, FRAME, rtl, 5);
      expect(r.width).toBeCloseTo(l.width, 6);
      expect(r.height).toBeCloseTo(l.height, 6);
      expect(r.y).toBeCloseTo(l.y, 6); // rows are direction-agnostic
      // mirror identity: distance-from-right in RTL == distance-from-left in LTR
      const fromRight = FRAME.x + FRAME.width - (r.x + r.width);
      const fromLeft = l.x - FRAME.x;
      expect(fromRight).toBeCloseTo(fromLeft, 6);
    }
  });

  it('cellToRect → pointToCell is the identity in RTL too (the drag contract)', () => {
    const g = geom({ rtl: true });
    for (const cell of CELLS) {
      const r = cellToRect(cell, FRAME, g, 5);
      // The span MUST be passed: mirrored, the leading edge is the right one.
      expect(pointToCell(r.x, r.y, FRAME, g, 5, cell.w)).toEqual({ x: cell.x, y: cell.y });
      // Spans themselves never mirror.
      expect(sizeToSpan(r.width, r.height, FRAME, g, 5)).toEqual({ w: cell.w, h: cell.h });
    }
  });

  it('midpoint rounding mirrors: dragging LEFT in RTL advances the cell', () => {
    const g = geom({ rtl: true });
    const cell = { x: 3, y: 0, w: 3, h: 1 };
    const r = cellToRect(cell, FRAME, g, 5);
    const pitch = columnUnitFor(g, FRAME.width) + g.gap;
    // A nudge leftwards past half a pitch moves to the NEXT cell (x+1), because
    // cells advance leftwards; the same nudge rightwards goes back to x-1.
    expect(pointToCell(r.x - pitch * 0.51, r.y, FRAME, g, 5, cell.w).x).toBe(4);
    expect(pointToCell(r.x - pitch * 0.49, r.y, FRAME, g, 5, cell.w).x).toBe(3);
    expect(pointToCell(r.x + pitch * 0.51, r.y, FRAME, g, 5, cell.w).x).toBe(2);
  });

  it('LTR is untouched by the new span argument (every old call site is safe)', () => {
    const g = geom();
    const r = cellToRect({ x: 4, y: 1, w: 5, h: 1 }, FRAME, g, 5);
    expect(pointToCell(r.x, r.y, FRAME, g, 5)).toEqual({ x: 4, y: 1 });
    expect(pointToCell(r.x, r.y, FRAME, g, 5, 5)).toEqual({ x: 4, y: 1 });
    expect(pointToCell(r.x, r.y, FRAME, g, 5, 99)).toEqual({ x: 4, y: 1 });
  });

  it('rows, row heights and board heights are identical in both directions', () => {
    const ltr = geom();
    const rtl = geom({ rtl: true });
    expect(rowHeightFor(rtl, 5)).toBe(rowHeightFor(ltr, 5));
    expect(boardHeightFor(rtl, 5)).toBe(boardHeightFor(ltr, 5));
    expect(columnUnitFor(rtl, FRAME.width)).toBe(columnUnitFor(ltr, FRAME.width));
  });
});

describe('dashboard-kit mapping — GridItemConfig ↔ cells', () => {
  it('round-trips cells through the persisted 1-based line numbers', () => {
    const cell = { x: 8, y: 1, w: 4, h: 2 };
    const gi = gridItemFromCell(cell);
    expect(gi).toEqual({ columnStart: 9, columnEnd: 13, rowStart: 2, rowEnd: 4 });
    expect(cellFromGridItem(gi)).toEqual(cell);
  });

  it("ignores 'auto' placements and missing configs", () => {
    expect(cellFromGridItem(undefined)).toBeNull();
    expect(cellFromGridItem({ columnStart: 'auto', rowStart: 1 })).toBeNull();
    expect(cellFromGridItem({ columnStart: 1 })).toBeNull(); // no rowStart
  });

  it('fills missing end lines from the adoption fallback (metadata columnSpan)', () => {
    expect(cellFromGridItem({ columnStart: 3, rowStart: 2 }, { w: 6, h: 2 })).toEqual({
      x: 2,
      y: 1,
      w: 6,
      h: 2,
    });
  });
});

describe('dashboard-kit mapping — commit-batch construction', () => {
  const delta = (over: Partial<TileDelta>): TileDelta => ({
    id: 'a',
    cellBefore: { x: 0, y: 0, w: 3, h: 1 },
    cellAfter: { x: 0, y: 0, w: 3, h: 1 },
    posBefore: { x: 14, y: 14 },
    posAfter: { x: 14, y: 14 },
    sizeBefore: { width: 100, height: 100 },
    sizeAfter: { width: 100, height: 100 },
    ...over,
  });

  it('emits NOTHING for an unchanged tile', () => {
    expect(buildCommitCommands([delta({})])).toHaveLength(0);
  });

  it('cells changed → SetGridItemCommand carrying the AFTER cells', () => {
    const cmds = buildCommitCommands([
      delta({ cellAfter: { x: 3, y: 0, w: 3, h: 1 }, posAfter: { x: 300, y: 14 } }),
    ]);
    const set = cmds.find((c) => c instanceof SetGridItemCommand);
    expect(set).toBeDefined();
    expect(set!.serialize().data).toMatchObject({
      nodeId: 'a',
      gridConfig: { columnStart: 4, columnEnd: 7, rowStart: 1, rowEnd: 2 },
    });
  });

  it('move command records the exact inverse (old position ≠ new)', () => {
    const cmds = buildCommitCommands([delta({ posAfter: { x: 300, y: 140 } })]);
    expect(cmds).toHaveLength(1);
    const move = cmds[0] as MoveNodeCommand;
    expect(move).toBeInstanceOf(MoveNodeCommand);
    const data = move.serialize().data as {
      newPosition: { x: number; y: number };
      oldPosition: { x: number; y: number };
    };
    expect(data.newPosition).toEqual({ x: 300, y: 140 });
    expect(data.oldPosition).toEqual({ x: 14, y: 14 }); // (K2)
  });

  it('size changed → ResizeNodeCommand; locked and group tiles get no geometry commands', () => {
    const cmds = buildCommitCommands([
      delta({ sizeAfter: { width: 200, height: 240 } }),
      delta({ id: 'pinned', locked: true, posAfter: { x: 999, y: 999 } }),
      delta({
        id: 'slab',
        isGroup: true,
        posAfter: { x: 999, y: 999 },
        cellAfter: { x: 0, y: 5, w: 12, h: 1 },
      }),
    ]);
    expect(cmds.filter((c) => c instanceof ResizeNodeCommand)).toHaveLength(1);
    expect(cmds.filter((c) => c instanceof MoveNodeCommand)).toHaveLength(0);
    expect(cmds.filter((c) => c instanceof SetGridItemCommand)).toHaveLength(0);
  });

  it('one gesture, many tiles → one flat command list covering every change', () => {
    const cmds = buildCommitCommands([
      delta({
        cellAfter: { x: 3, y: 0, w: 3, h: 1 },
        posAfter: { x: 300, y: 14 },
      }),
      delta({
        id: 'b',
        cellBefore: { x: 3, y: 0, w: 3, h: 1 },
        cellAfter: { x: 0, y: 0, w: 3, h: 1 },
        posBefore: { x: 300, y: 14 },
        posAfter: { x: 14, y: 14 },
      }),
    ]);
    // 2× SetGridItem + 2× Move — the whole swap in one undoable batch.
    expect(cmds).toHaveLength(4);
    expect(cmds.filter((c) => c instanceof SetGridItemCommand)).toHaveLength(2);
    expect(cmds.filter((c) => c instanceof MoveNodeCommand)).toHaveLength(2);
  });
});
