/**
 * GridPackEngine — the dashboard-grid interaction engine (Phase 1 of the
 * dashboard-grid plan; `documentation/api-architecture/dashboard-grid-plan.html`).
 *
 * A DOM-free, deterministic INTEGER-CELL engine implementing the gridstack
 * interaction model, with semantics EMPIRICALLY RECORDED from the real
 * gridstackjs.com demos (web1 + web2 driven with Playwright; gs-x/gs-y read at
 * every stage), then hand-tested four rounds on the interactive prototype the
 * plan page embeds. The recordings — not the gridstack source, which we found
 * misleading on E4b — are this engine's contract:
 *
 *   E1  resize grow→shrink in ONE gesture: pushed tiles RETURN when the space
 *       frees (emergent from re-settling after every step).
 *   E2  tiles below CLIMB into vacated space live during a drag; after the
 *       gesture ends there is NO memory (a later gesture re-resolves fresh).
 *   E3  same-size side-by-side tiles SWAP cleanly, no oscillation.
 *   E4b a move ONTO a locked tile is REFUSED outright — the placeholder never
 *       enters it. (The source reads as "skip below"; the live demo refuses.)
 *   E4c grow→shrink taller: full restore — same mechanism as E1.
 *
 * Plus three user-review rules the prototype rounds added:
 *   S1  a swap exchanges CELLS exactly — never "the probe cell" (that left a
 *       one-column overlap when the probe straddled the neighbour's edge).
 *   S2  displaced tiles remember their gesture-start cell and TELEPORT home
 *       when it frees — even from below a pinned row, which gravity alone can
 *       never climb back through. This is a deliberate improvement over
 *       gridstack itself. Memory clears at gesture end (E2).
 *   S3  gridstack's swap() has THREE shapes, not one: same size; same ROW +
 *       equal height (different widths — exchange horizontal order, union
 *       span preserved); same COLUMN + equal width. And the >50% anti-jitter
 *       gate must measure swap-eligible pairs against the SMALLER tile, or a
 *       4-wide can never displace an 8-wide and swapping is one-directional.
 *
 * The engine mutates ONLY the {x,y,w,h} cells of the items it is given. Pixel
 * mapping (row height, margins, the fit/grow sizing modes), placeholders,
 * ghosts and commands belong to the binder built on top (Phase 2) — this
 * class must stay pure enough to drive from a table-driven spec.
 */

/** One tile, in integer grid cells. */
export interface GridPackItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pinned: never pushed, never packed, refuses the mover outright (E4b). */
  locked?: boolean;
  /**
   * Ask add() to IGNORE x/y and scan row-major for the first free hole —
   * gridstack's autoPosition (addWidget without coordinates). Distinct from
   * gravity, which climbs one column: a hole at (3,0) under an occupied
   * column is only reachable by the scan. Seeding/load honours explicit
   * cells; palette-style adds pass this flag.
   */
  autoPosition?: boolean;
}

export interface GridPackOptions {
  /** Column count of the board. Default 12. */
  columns?: number;
  /**
   * Float mode (gridstack `float: true`): tiles stay where placed and gaps
   * are legal; gravity does not pack. Default false (gravity).
   */
  float?: boolean;
}

/** Result of a move/resize attempt. */
export interface GridPackResult {
  /** Whether the board accepted (and applied) the change. */
  changed: boolean;
}

interface GestureMemory {
  x: number;
  y: number;
}

export class GridPackEngine {
  readonly columns: number;
  float: boolean;

  private items: GridPackItem[] = [];
  /** Per-gesture displaced-tile memory (S2/E2). Item id → gesture-start cell. */
  private memory = new Map<string, GestureMemory>();
  /** Gesture-start snapshot of EVERY item, for cancel/Escape restore. */
  private snapshot: Map<string, GestureMemory> | null = null;

  constructor(items: GridPackItem[] = [], options: GridPackOptions = {}) {
    this.columns = options.columns ?? 12;
    this.float = options.float ?? false;
    for (const it of items) this.add(it);
  }

  // -- introspection ---------------------------------------------------------

  getItems(): readonly GridPackItem[] {
    return this.items;
  }

  getItem(id: string): GridPackItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  /** Content height in rows: max(y+h) over all items (0 when empty). */
  rows(): number {
    return this.items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  }

  /** True when any two items overlap — the invariant every op must preserve. */
  hasOverlaps(): boolean {
    for (let i = 0; i < this.items.length; i++) {
      for (let j = i + 1; j < this.items.length; j++) {
        if (GridPackEngine.hit(this.items[i], this.items[j])) return true;
      }
    }
    return false;
  }

  // -- membership ------------------------------------------------------------

  /**
   * Add an item. An explicit legal position is honoured verbatim. When the
   * position collides — or the item asks for `autoPosition` — the tile
   * AUTO-POSITIONS: a row-major scan for the first
   * hole it fits, which is gridstack's `autoPosition` and NOT the same thing
   * as gravity (gravity climbs one column; a hole at (3,0) under an occupied
   * column is only reachable by the scan — the spec's first red proved it).
   */
  add(item: GridPackItem): GridPackItem {
    const it: GridPackItem = { ...item };
    it.w = Math.max(1, Math.min(this.columns, it.w));
    it.x = Math.max(0, Math.min(this.columns - it.w, it.x));
    it.y = Math.max(0, it.y);
    it.h = Math.max(1, it.h);
    const auto = it.autoPosition === true || !!this.collide(it, it);
    delete it.autoPosition;
    if (auto) {
      scan: for (let y = 0; ; y++) {
        for (let x = 0; x <= this.columns - it.w; x++) {
          const probe = { ...it, x, y };
          if (!this.collide(probe, it)) {
            it.x = x;
            it.y = y;
            break scan;
          }
        }
      }
    }
    this.items.push(it);
    this.settle(null);
    return it;
  }

  remove(id: string): void {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    this.items.splice(idx, 1);
    this.memory.delete(id);
    this.settle(null);
  }

  // -- gestures --------------------------------------------------------------

  /**
   * Begin a drag/resize gesture: fresh displaced-tile memory, and a full
   * snapshot so `cancelGesture` (Escape) can restore every tile (gridstack
   * `saveInitial` / `restoreInitial`).
   */
  beginGesture(): void {
    this.memory.clear();
    this.snapshot = new Map(this.items.map((i) => [i.id, { x: i.x, y: i.y }]));
  }

  /** End a gesture: memory does NOT outlive it (E2). */
  endGesture(): void {
    this.memory.clear();
    this.snapshot = null;
  }

  /** Escape: restore every tile to its gesture-start cell. */
  cancelGesture(): void {
    if (this.snapshot) {
      for (const it of this.items) {
        const s = this.snapshot.get(it.id);
        if (s) {
          it.x = s.x;
          it.y = s.y;
        }
      }
    }
    this.endGesture();
  }

  // -- the core: move --------------------------------------------------------

  /**
   * Try to put `id` at cell (x,y). Applies the full pipeline on acceptance:
   * swap (three shapes) | push-down (+skip below locked) → settle (teleport
   * memory + gravity). Refuses: out-of-gesture no-ops, cells intersecting a
   * locked tile (E4b), and collisions under the anti-jitter coverage gate.
   */
  moveCheck(id: string, x: number, y: number): GridPackResult {
    const n = this.getItem(id);
    if (!n || n.locked) return { changed: false };
    x = Math.max(0, Math.min(this.columns - n.w, Math.round(x)));
    y = Math.max(0, Math.round(y));
    if (n.x === x && n.y === y) return { changed: false };

    const probe = { ...n, x, y };
    if (this.collideLocked(probe, n)) return { changed: false }; // E4b: refuse

    const c = this.collide(probe, n);
    if (c) {
      // S3 — the three swap shapes.
      const sameSize = !this.float && c.w === n.w && c.h === n.h;
      const rowSwap = !this.float && !sameSize && c.h === n.h && c.y === n.y;
      const colSwap = !this.float && !sameSize && c.w === n.w && c.x === n.x;

      // Anti-jitter gate. Swap-eligible pairs measure against the SMALLER
      // tile (S3's second half); plain pushes keep the static-tile rule.
      const inter = GridPackEngine.overlapArea(probe, c);
      const gateArea =
        sameSize || rowSwap || colSwap
          ? Math.min(c.w * c.h, n.w * n.h)
          : c.w * c.h;
      if (inter <= 0.5 * gateArea) return { changed: false };

      if (sameSize || rowSwap || colSwap) this.remember(c);

      if (sameSize) {
        // S1: exchange CELLS exactly, never the probe cell.
        const ox = n.x;
        const oy = n.y;
        n.x = c.x;
        n.y = c.y;
        c.x = ox;
        c.y = oy;
        this.settle(n);
        return { changed: true };
      }
      if (rowSwap) {
        // Exchange horizontal ORDER, union span preserved:
        // left(0..8)+right(8..12) → right-at-0(0..4)+left-at-4(4..12).
        const leftX = Math.min(n.x, c.x);
        if (n.x < c.x) {
          c.x = leftX;
          n.x = leftX + c.w;
        } else {
          n.x = leftX;
          c.x = leftX + n.w;
        }
        n.y = c.y;
        this.settle(n);
        return { changed: true };
      }
      if (colSwap) {
        const topY = Math.min(n.y, c.y);
        if (n.y < c.y) {
          c.y = topY;
          n.y = topY + c.h;
        } else {
          n.y = topY;
          c.y = topY + n.h;
        }
        n.x = c.x;
        this.settle(n);
        return { changed: true };
      }
    }

    n.x = x;
    n.y = y;
    this.pushDown(n);
    this.settle(n);
    return { changed: true };
  }

  // -- the core: resize ------------------------------------------------------

  /**
   * Resize `id` to w×h cells. Growth is CLAMPED so the tile never covers a
   * locked tile (E4b applied to size); displaced neighbours push + settle,
   * and return when the size shrinks back (E1/S2).
   */
  resizeCheck(id: string, w: number, h: number): GridPackResult {
    const n = this.getItem(id);
    if (!n) return { changed: false };
    w = Math.max(1, Math.min(this.columns - n.x, Math.round(w)));
    h = Math.max(1, Math.round(h));
    while (w > n.w && this.collideLocked({ ...n, w }, n)) w--;
    while (h > n.h && this.collideLocked({ ...n, h }, n)) h--;
    if (w === n.w && h === n.h) return { changed: false };
    n.w = w;
    n.h = h;
    this.pushDown(n);
    this.settle(n);
    return { changed: true };
  }

  // -- internals -------------------------------------------------------------

  private static hit(a: GridPackItem, b: GridPackItem): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  private static overlapArea(a: GridPackItem, b: GridPackItem): number {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return Math.max(0, w) * Math.max(0, h);
  }

  private collide(probe: GridPackItem, self: GridPackItem): GridPackItem | undefined {
    return this.items.find((o) => o !== self && o.id !== self.id && GridPackEngine.hit(probe, o));
  }

  private collideLocked(probe: GridPackItem, self: GridPackItem): GridPackItem | undefined {
    return this.items.find(
      (o) => o !== self && o.id !== self.id && !!o.locked && GridPackEngine.hit(probe, o)
    );
  }

  private remember(o: GridPackItem): void {
    if (!this.memory.has(o.id)) this.memory.set(o.id, { x: o.x, y: o.y });
  }

  /** Sorted reading order — the deterministic iteration every rule uses. */
  private ordered(): GridPackItem[] {
    return [...this.items].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  /**
   * Displace whatever `placed` now covers: below the placed tile, then past
   * any locked tile it lands on (gridstack `_skipDown` — without it a push
   * cascade can bury the pinned row), recursively.
   */
  private pushDown(placed: GridPackItem): void {
    for (const o of this.ordered()) {
      if (o === placed) continue;
      if (o.locked) continue; // locked: never pushed
      if (!GridPackEngine.hit(placed, o)) continue;
      this.remember(o);
      o.y = placed.y + placed.h;
      let lk: GridPackItem | undefined;
      while ((lk = this.collideLocked(o, o))) o.y = lk.y + lk.h;
      this.pushDown(o);
    }
  }

  /**
   * The settle loop, run after EVERY accepted change: displaced tiles first
   * try to TELEPORT back to their remembered gesture-start cell (works across
   * a pinned row — S2), then gravity packs (each tile climbs while free).
   * Loops until stable so one restore can cascade further restores; this is
   * exactly why gridstack's E1 restore is emergent rather than special-cased.
   */
  private settle(active: GridPackItem | null): void {
    for (let guard = 0; guard < 4 * this.items.length + 8; guard++) {
      let changed = false;
      for (const n of this.ordered()) {
        if (n.locked || n === active) continue;
        const mem = this.memory.get(n.id);
        if (mem && (n.x !== mem.x || n.y !== mem.y)) {
          const home = { ...n, x: mem.x, y: mem.y };
          if (!this.collide(home, n)) {
            n.x = mem.x;
            n.y = mem.y;
            changed = true;
            continue;
          }
        }
        if (!this.float) {
          while (n.y > 0 && !this.collide({ ...n, y: n.y - 1 }, n)) {
            n.y--;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }
}
