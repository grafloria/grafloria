/**
 * PLACEMENT FROM CODE — where a widget goes when the page moves it into a
 * board instead of the hand (`handle.place`), and where an added one goes at
 * an index (`addWidget(spec, list, { index })`).
 *
 * A LIST (a one-column `stack` section: a Kanban column) is an ORDER: the
 * widget takes position `index` among the other cards and the list is laid
 * out top to bottom in that order — the same rule a card dropped into a list
 * by hand follows, so `stackInOrder` is the binder's too. A BOARD has no
 * order: the widget takes the first free cell, top row first, then left to
 * right — the cell an added section takes.
 *
 * Pure cell math. The dashboard turns the answer into commands, which are
 * either one undo step or a history-free system write (`history: false`).
 */
import type { CellRect } from './grid-mapping';

/**
 * Lay `order` out top to bottom, each card right under the one before it, at
 * column 0 — a list's layout. Writes the cells in place; true when any moved.
 */
export function stackInOrder(order: Array<{ x: number; y: number; h: number }>): boolean {
  let y = 0;
  let changed = false;
  for (const it of order) {
    if (it.y !== y || it.x !== 0) {
      it.y = y;
      it.x = 0;
      changed = true;
    }
    y += it.h;
  }
  return changed;
}

/**
 * The first cell a `w`×`h` tile fits among `taken`, top row first, then left
 * to right; null when it is wider than the board or no row up to `maxRows`
 * has room.
 */
export function firstFreeCell(
  taken: readonly CellRect[],
  columns: number,
  w: number,
  h: number,
  maxRows = 1000
): { x: number; y: number } | null {
  const hit = (x: number, y: number): boolean => taken.some((c) => x < c.x + c.w && c.x < x + w && y < c.y + c.h && c.y < y + h);
  for (let y = 0; y < maxRows; y++) {
    for (let x = 0; x + w <= columns; x++) if (!hit(x, y)) return { x, y };
  }
  return null;
}

/**
 * A list's cards in their ORDER, top to bottom — the order an `index` counts
 * in, for `placeAtIndex` and for the keyboard that reads a card's position.
 */
export function inListOrder<T extends { cell: CellRect }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
}

/** A card the placement moved, and the cells it moved between. */
export interface MovedCard {
  id: string;
  before: CellRect;
  after: CellRect;
}

/**
 * A card arriving in a LIST at `index` among `others` (clamped; omitted, the
 * end): the cell it takes, and every other card the list then moves. `me` is
 * the card's cell as it is now — its height travels, its width is the list's.
 */
export function placeAtIndex(
  others: ReadonlyArray<{ id: string; cell: CellRect }>,
  me: CellRect,
  index?: number
): { cell: CellRect; moved: MovedCard[] } {
  const order = inListOrder(others).map((o) => ({ id: o.id, before: o.cell, ...o.cell }));
  const at = Math.max(0, Math.min(index ?? order.length, order.length));
  const self = { id: '', before: me, ...me, w: 1 };
  order.splice(at, 0, self);
  stackInOrder(order);
  const moved: MovedCard[] = [];
  for (const o of order) {
    if (o === self || (o.x === o.before.x && o.y === o.before.y)) continue;
    moved.push({ id: o.id, before: o.before, after: { x: o.x, y: o.y, w: o.w, h: o.h } });
  }
  return { cell: { x: self.x, y: self.y, w: self.w, h: self.h }, moved };
}
