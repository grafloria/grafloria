// Wave 8 (Performance & scale) — Card 6: the obstacle set, indexed.
//
// THE MEASURED PROBLEM. Every obstacle predicate in the routers was a LINEAR
// SCAN of the whole obstacle array:
//
//   collidesWithObstacles(point) → for (const o of obstacles) { ...aabb test... }
//
// and A* calls it once per neighbour of every cell it expands. Profiling one
// node-drag frame on the 5k-node benchmark scene counted
//
//   187,488 collision calls  ×  ~9,998 obstacles each  =  1.87 BILLION aabb tests
//
// in a SINGLE frame — 88% of a 2.2-second frame, all of it inside
// `collidesWithObstacles`. The routing was never the expensive part; scanning
// the scene to ask "is this one cell free?" was.
//
// This is a uniform grid hash over the obstacle rects. A point query looks at
// only the cells the query square touches, so the cost is proportional to the
// obstacles NEAR the query, not to the scene.
//
// PREDICATE PARITY IS THE WHOLE CONTRACT. This index does not approximate: it
// narrows the candidate set and then runs the SAME exact test the linear scan
// ran, including its inclusive (>=/<=) bounds. A point is in the candidate set
// iff its margin-expanded query square shares a grid cell with the obstacle's
// raw rect — and if the square and the rect intersect at all (even by a single
// boundary point, which the inclusive test counts as a hit) that intersection
// lies in some cell that both are registered in. So the candidate set is a
// SUPERSET of the true hits, and the exact test culls the rest: same answer,
// every time. That is what lets it drop under the 225-assertion line harness
// without moving a single pixel.

import type { Obstacle } from './types';

/** World units per cell. Nodes are ~140×70, so this holds a handful each. */
const DEFAULT_CELL_SIZE = 128;

/**
 * An obstacle that spans more than this many cells is not worth exploding into
 * the grid (a diagram-sized collapsed group block would own every cell). It
 * goes in a small "oversized" list that every query checks directly — which is
 * fine, because there are never many of them.
 */
const MAX_CELLS_PER_OBSTACLE = 1024;

/** Cell coordinates beyond this fall back to the oversized list (keeps the packed key exact). */
const MAX_CELL_COORD = 1 << 20;

export class ObstacleIndex {
  private readonly cells = new Map<number, Obstacle[]>();
  private readonly oversized: Obstacle[] = [];
  private readonly cellSize: number;
  private readonly count: number;

  constructor(obstacles: readonly Obstacle[], cellSize: number = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
    let n = 0;
    for (const o of obstacles) {
      if (!o) continue;
      n++;
      this.insert(o);
    }
    this.count = n;
  }

  /** How many obstacles were indexed. */
  get size(): number {
    return this.count;
  }

  private insert(o: Obstacle): void {
    const c = this.cellSize;
    const minCx = Math.floor(o.x / c);
    const maxCx = Math.floor((o.x + o.width) / c);
    const minCy = Math.floor(o.y / c);
    const maxCy = Math.floor((o.y + o.height) / c);

    const spans = (maxCx - minCx + 1) * (maxCy - minCy + 1);
    if (
      !Number.isFinite(spans) ||
      spans > MAX_CELLS_PER_OBSTACLE ||
      Math.abs(minCx) >= MAX_CELL_COORD ||
      Math.abs(maxCx) >= MAX_CELL_COORD ||
      Math.abs(minCy) >= MAX_CELL_COORD ||
      Math.abs(maxCy) >= MAX_CELL_COORD
    ) {
      this.oversized.push(o);
      return;
    }

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = ObstacleIndex.key(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(o);
        else this.cells.set(key, [o]);
      }
    }
  }

  /** Exact, collision-free packing of two cell coords into one number (|coord| < 2^20). */
  private static key(cx: number, cy: number): number {
    return cx * 2097152 + (cy + 1048576);
  }

  /**
   * Does the point, expanded by `margin`, touch any obstacle?
   *
   * Byte-for-byte the predicate `OrthogonalRouter.collidesWithObstacles` used to
   * evaluate against the whole array — inclusive bounds and all.
   */
  collides(px: number, py: number, margin: number): boolean {
    for (const o of this.oversized) {
      if (ObstacleIndex.hit(o, px, py, margin)) return true;
    }
    if (this.cells.size === 0) return false;

    const c = this.cellSize;
    const minCx = Math.floor((px - margin) / c);
    const maxCx = Math.floor((px + margin) / c);
    const minCy = Math.floor((py - margin) / c);
    const maxCy = Math.floor((py + margin) / c);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(ObstacleIndex.key(cx, cy));
        if (!bucket) continue;
        for (const o of bucket) {
          if (ObstacleIndex.hit(o, px, py, margin)) return true;
        }
      }
    }
    return false;
  }

  private static hit(o: Obstacle, px: number, py: number, margin: number): boolean {
    return (
      px >= o.x - margin &&
      px <= o.x + o.width + margin &&
      py >= o.y - margin &&
      py <= o.y + o.height + margin
    );
  }

  /**
   * Every obstacle whose rect could overlap the axis-aligned box — the candidate
   * set for a segment test. Conservative (a superset); the caller runs the exact
   * geometry test on what comes back.
   */
  queryBox(minX: number, minY: number, maxX: number, maxY: number): Obstacle[] {
    const out: Obstacle[] = [];
    const seen = this.oversized.length > 0 || this.cells.size > 0 ? new Set<Obstacle>() : null;
    if (!seen) return out;

    for (const o of this.oversized) {
      if (o.x <= maxX && o.x + o.width >= minX && o.y <= maxY && o.y + o.height >= minY) {
        seen.add(o);
        out.push(o);
      }
    }

    const c = this.cellSize;
    const minCx = Math.floor(minX / c);
    const maxCx = Math.floor(maxX / c);
    const minCy = Math.floor(minY / c);
    const maxCy = Math.floor(maxY / c);

    // A pathological box (an infinite/NaN coordinate) would spin here; bail to
    // the linear answer instead of hanging the frame.
    if (!Number.isFinite(minCx) || !Number.isFinite(maxCx) || !Number.isFinite(minCy) || !Number.isFinite(maxCy)) {
      return this.all();
    }

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(ObstacleIndex.key(cx, cy));
        if (!bucket) continue;
        for (const o of bucket) {
          if (seen.has(o)) continue;
          seen.add(o);
          out.push(o);
        }
      }
    }
    return out;
  }

  /** Every indexed obstacle (deduplicated). Escape hatch for degenerate queries. */
  all(): Obstacle[] {
    const seen = new Set<Obstacle>(this.oversized);
    for (const bucket of this.cells.values()) for (const o of bucket) seen.add(o);
    return [...seen];
  }
}

/**
 * Merge two obstacle sources into one array, collapsing entries that are the
 * SAME obstacle described twice.
 *
 * This exists because `RoutingEngine.route()` unions its global ObstacleMap with
 * the request's obstacles, and the renderer's request repeats what the engine
 * already registered — so a 5,000-node diagram was handing the router a
 * 9,998-entry obstacle array, and every one of those entries was scanned on
 * every collision test. Deduplication is keyed on id AND geometry, so two
 * entries that genuinely disagree about where an obstacle is are both kept:
 * the effective blocked region is unchanged.
 */
export function mergeObstacles(
  a: readonly Obstacle[],
  b: readonly Obstacle[]
): Obstacle[] {
  if (a.length === 0) return b as Obstacle[];
  if (b.length === 0) return a as Obstacle[];
  const out: Obstacle[] = [];
  const seen = new Set<string>();
  for (const src of [a, b]) {
    for (const o of src) {
      if (!o) continue;
      const k = `${o.id}|${o.x}|${o.y}|${o.width}|${o.height}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(o);
    }
  }
  return out;
}
