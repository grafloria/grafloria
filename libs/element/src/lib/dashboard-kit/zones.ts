/**
 * zones — where a dragged tile lands, decided once, recursively (tile first,
 * step 2).
 *
 * Every board is an engine; every container is a tile of its parent's board
 * and a board for its own children. `resolve` walks that tree from the roots
 * inward and answers, for a pointer, one of four things:
 *
 *   - `strip`  — a tab slot in a container's strip (the client-space hit the
 *                binder supplies wins over every board, as it always has);
 *   - `beside` — the outer fifth of a container: a cell next to it on the
 *                board the container itself sits on;
 *   - `plain`  — a cell on the deepest board under the pointer that can be
 *                entered; "into a container" is nothing more than descending
 *                one level, so it needs no kind of its own;
 *   - `off`    — outside every board.
 *
 * A container is OPAQUE — never entered, its bands still answering — when it
 * is static, when entering it would exceed the depth policy, or when it is
 * part of the dragged subtree (a container cannot be dropped into its own
 * descendant). The strip rows of a tab container are nobody's band, and its
 * margin (inside the frame, outside the page) is a plain cell on the parent.
 *
 * This module is pure geometry: no DOM, no engine, no model. The binder
 * builds the tree for each move from its peers and the model, and acts on
 * the answer.
 */

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BesideSide = 'left' | 'right' | 'top' | 'bottom';

/** A board in the walk: the binder's peer behind it rides in `ref`. */
export interface ZoneBoard {
  id: string;
  /** Roots are 0; a container's inner board is its board's depth + 1. */
  depth: number;
  ref?: unknown;
  contains(x: number, y: number): boolean;
  /** Containment plus the one-row grace under the board (gridstack's extra drag row). */
  containsExtended(x: number, y: number): boolean;
  children(): ZoneContainer[];
}

/** A container as the walk sees it: a frame on its board, a layout, and the board inside it. */
export interface ZoneContainer {
  id: string;
  layout: 'grid' | 'split' | 'tabs';
  static: boolean;
  frame: ZoneRect;
  /** The rows at the top that belong to the strip: never a band. 0 for a section. */
  stripHeight: number;
  /** The outer fraction of the body that means "beside"; 0 for a container whose whole body is "into" (a section). */
  band: number;
  /** The board a descent enters: a tab container's ACTIVE page, a section's own board. Null: nothing to enter. */
  inner: ZoneBoard | null;
}

export interface StripHit {
  containerId: string;
  index: number;
}

/** The beside the hand already holds, with the container's frame AT REST and the cell the widget took. */
export interface BesideMemory {
  containerId: string;
  side: BesideSide;
  frame0: ZoneRect;
  vacated: ZoneRect;
}

export interface ResolveInput {
  x: number;
  y: number;
  roots: ZoneBoard[];
  strip: StripHit | null;
  prev: BesideMemory | null;
  /** The deepest board a drop may enter (a root is 0). */
  maxDepth: number;
  /** The depth of the dragged subtree: 0 for a widget, 1 for a section, 2 for a section holding a section. */
  ghostDepth: number;
  /** The groups inside the dragged tile: never entered. */
  ghostSubtree: ReadonlySet<string>;
  /** The board's gap, the tolerance around the vacated cell. */
  gap: number;
}

export type Zone =
  | { kind: 'off' }
  | { kind: 'plain'; board: ZoneBoard; grace: boolean }
  | { kind: 'strip'; containerId: string; index: number }
  | { kind: 'beside'; board: ZoneBoard; containerId: string; side: BesideSide; kept: boolean };

/** The outer fifth of a container's body is beside it — the bands a tab's split uses. */
export const BESIDE_BAND = 0.2;
/** How much wider a band is for a hand ALREADY in it: a hand resting on the line must not flicker. */
export const BESIDE_STAY = 0.05;

const inRect = (r: ZoneRect, x: number, y: number, tol = 0): boolean =>
  x >= r.x - tol && x <= r.x + r.width + tol && y >= r.y - tol && y <= r.y + r.height + tol;

/**
 * The band of a container frame a point is in: null in the strip rows, in
 * the middle, or outside. The left and right bands take the corners (VS
 * Code's precedence): a one-row widget carried along the top of a tall panel
 * to its far right means "after it", not "above it".
 */
export function bandOf(f: ZoneRect, stripHeight: number, x: number, y: number, band = BESIDE_BAND): BesideSide | null {
  if (band <= 0 || !inRect(f, x, y)) return null;
  const bodyY = f.y + stripHeight;
  const bodyH = Math.max(1, f.height - stripHeight);
  const rx = (x - f.x) / Math.max(1, f.width);
  const ry = (y - bodyY) / bodyH;
  if (ry < 0) return null; // the strip: a new tab, the strip's own business
  if (rx < band) return 'left';
  if (rx > 1 - band) return 'right';
  if (ry < band) return 'top';
  if (ry > 1 - band) return 'bottom';
  return null;
}

/** The board a container sits on, found by id through the tree. */
function boardOf(roots: ZoneBoard[], containerId: string): ZoneBoard | null {
  const visit = (b: ZoneBoard): ZoneBoard | null => {
    for (const c of b.children()) {
      if (c.id === containerId) return b;
      const deeper = c.inner ? visit(c.inner) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  for (const r of roots) {
    const found = visit(r);
    if (found) return found;
  }
  return null;
}

export function resolve(input: ResolveInput): Zone {
  const { x, y } = input;
  if (input.strip) return { kind: 'strip', containerId: input.strip.containerId, index: input.strip.index };

  // The beside the hand already holds: the same band of the container's
  // ORIGINAL frame (a little wider), or the cell the widget took, keeps it —
  // the container is what moved, and its live frame is no guide. A different
  // band of that frame is a zone change and wins over the vacated cell; the
  // middle of it is a zone change too (into the page).
  if (input.prev) {
    const p = input.prev;
    const stripH = stripHeightOf(input.roots, p.containerId);
    const stay = bandOf(p.frame0, stripH, x, y, BESIDE_BAND + BESIDE_STAY);
    const other = bandOf(p.frame0, stripH, x, y);
    const held = stay === p.side || (!(other !== null && other !== p.side) && inRect(p.vacated, x, y, input.gap));
    if (held) {
      const board = boardOf(input.roots, p.containerId);
      if (board) return { kind: 'beside', board, containerId: p.containerId, side: p.side, kept: true };
    }
  }

  const opaque = (board: ZoneBoard, c: ZoneContainer): boolean =>
    c.static || input.ghostSubtree.has(c.id) || board.depth + 1 + input.ghostDepth > input.maxDepth;

  // The container the hand holds is read at REST: its live frame is where the
  // beside pushed or shifted it, and a hand crossing from its top band to its
  // corner would otherwise find it gone from under the pointer (0.4.48's
  // corner). Its subtree moved with it, so those boards are tested at the
  // same displacement.
  const held = input.prev;
  const descend = (board: ZoneBoard, dx: number, dy: number): Zone => {
    const px = x + dx;
    const py = y + dy;
    for (const c of board.children()) {
      const atRest = held && c.id === held.containerId ? held.frame0 : null;
      const frame = atRest ?? c.frame;
      const tx = atRest ? x : px;
      const ty = atRest ? y : py;
      if (!inRect(frame, tx, ty)) continue;
      const side = bandOf(frame, c.stripHeight, tx, ty, c.band);
      if (side) return { kind: 'beside', board, containerId: c.id, side, kept: false };
      if (opaque(board, c) || !c.inner) return { kind: 'plain', board, grace: false };
      const ndx = atRest ? c.frame.x - atRest.x : dx;
      const ndy = atRest ? c.frame.y - atRest.y : dy;
      if (!c.inner.contains(x + ndx, y + ndy)) return { kind: 'plain', board, grace: false }; // the margin: the container's own frame
      return descend(c.inner, ndx, ndy);
    }
    return { kind: 'plain', board, grace: false };
  };

  for (const root of input.roots) if (root.contains(x, y)) return descend(root, 0, 0);

  // Nothing strict matched: the deepest board whose grace row holds the point.
  let deepest: ZoneBoard | null = null;
  const visit = (b: ZoneBoard): void => {
    if (b.containsExtended(x, y) && (!deepest || b.depth > deepest.depth)) deepest = b;
    for (const c of b.children()) if (c.inner) visit(c.inner);
  };
  for (const root of input.roots) visit(root);
  return deepest ? { kind: 'plain', board: deepest, grace: true } : { kind: 'off' };
}

function stripHeightOf(roots: ZoneBoard[], containerId: string): number {
  const visit = (b: ZoneBoard): number | null => {
    for (const c of b.children()) {
      if (c.id === containerId) return c.stripHeight;
      const deeper = c.inner ? visit(c.inner) : null;
      if (deeper !== null) return deeper;
    }
    return null;
  };
  for (const r of roots) {
    const h = visit(r);
    if (h !== null) return h;
  }
  return 0;
}
