// Wave 8 (Performance & scale) — Card 6: route only what actually changed.
//
// THE BUG THIS EXISTS TO KILL. `renderLinksLayer` re-routed EVERY visible link
// on EVERY frame:
//
//     for (const link of sortedLinks) { ... this.computeAutoRoute(link, endpoints) ... }
//
// whether or not anything had moved. Obstacle-avoiding routing is not cheap, so
// an idle frame paid for a full re-solve of the visible scene, and moving ONE
// node cost 5.5 seconds at 10k nodes — O(scene) work for an O(1) edit.
//
// WHAT MAKES A ROUTE STALE. Two different things, and getting only the first is
// the trap:
//
//   1. The link's own inputs changed — its endpoints moved (because a node it is
//      attached to moved or resized), its router changed, its lane in a parallel
//      bundle changed. This is captured by the cache KEY: the key is built from
//      the routing inputs, so a change to any of them is a miss. Endpoint moves
//      need no special case at all — the endpoint coordinates ARE the key.
//
//   2. THE OBSTACLE CASE, which "did an endpoint move?" misses entirely: a node
//      that this link does not touch moved INTO (or OUT OF) the corridor the
//      link routes through. Nothing about the link changed; its correct route
//      did. A cache that only watches endpoints serves a route straight through
//      the new obstacle — fast and wrong.
//
// Wave 4 hit this same shape from the other side: the link VNode cache keyed off
// `link.isDirty`, but a link's rendered output also depends on where its NODES
// went, so it served stale geometry. The fix there was `markLinksWhoseFrameChanged`.
// This is the same discipline one level down, on the ROUTE rather than the VNode.
//
// HOW CASE 2 IS CAUGHT. Every frame we diff the node rectangles against last
// frame's. Each node that moved, resized, appeared or vanished contributes its
// OLD and NEW rectangles as a dirty region. The engine's link spatial index —
// which is keyed on each link's routed bounding box, because `syncLinkPoints`
// refreshes it — is then asked which links' boxes intersect those regions,
// inflated by the routing clearance. Those links are invalidated. A link that
// neither moved nor had its corridor disturbed keeps its route, forever, for
// free.

import type { RoutedPath } from '@grafloria/engine';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteMemoStats {
  /** links whose route had to be computed this frame */
  routed: number;
  /** links served from the previous frame's route */
  reused: number;
}

/**
 * How far outside a link's routed bounding box an obstacle can still have shaped
 * that route. The router pushes off the port by `gapOffset` (30), keeps
 * `obstacleMargin` (20) clearance from every body, and moves on a `gridSize`
 * (10) lattice — so an obstacle that shaped this route is within ~60 units of
 * it. 80 buys margin over that without pulling in half the diagram.
 *
 * This is the one approximation in the cache, and it is deliberately generous:
 * being too eager here costs a re-route, being too clever costs a wrong route.
 */
export const ROUTE_INFLUENCE_PAD = 80;

/** Entries above this are evicted oldest-first — a deleted link must not leak forever. */
const MAX_ENTRIES = 50_000;

export class RouteMemo {
  private entries = new Map<string, { key: string; routed: RoutedPath }>();
  private prevRects = new Map<string, Rect>();
  /** Bumped by the caller when something OUTSIDE the node rects changes the obstacle set. */
  private epoch = '';
  private _stats: RouteMemoStats = { routed: 0, reused: 0 };

  get stats(): Readonly<RouteMemoStats> {
    return this._stats;
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Start a frame. Diffs this frame's node rectangles against last frame's and
   * returns the world regions that changed — each moved node contributes BOTH
   * where it was and where it now is, because a link routed around its old
   * position is just as stale as one routed through its new one.
   *
   * `obstacleEpoch` covers obstacle-set changes that are NOT node rects — a
   * group collapsing hides its members and adds a block, and no node moved. A
   * change there drops the whole cache, which is the honest thing to do: it is
   * rare, and reasoning about which links a collapse touched is how you ship a
   * stale route.
   */
  beginFrame(rects: Map<string, Rect>, obstacleEpoch: string): Rect[] {
    this._stats = { routed: 0, reused: 0 };

    if (obstacleEpoch !== this.epoch) {
      this.epoch = obstacleEpoch;
      this.entries.clear();
      this.prevRects = rects;
      // Everything is stale; no point enumerating regions.
      return [];
    }

    const dirty: Rect[] = [];

    for (const [id, now] of rects) {
      const before = this.prevRects.get(id);
      if (!before) {
        dirty.push(now); // appeared
        continue;
      }
      if (
        before.x !== now.x ||
        before.y !== now.y ||
        before.width !== now.width ||
        before.height !== now.height
      ) {
        dirty.push(before); // vacated
        dirty.push(now); // occupied
      }
    }

    for (const [id, before] of this.prevRects) {
      if (!rects.has(id)) dirty.push(before); // vanished
    }

    this.prevRects = rects;
    return dirty;
  }

  /** The route for this link if its inputs are unchanged since we cached it. */
  lookup(linkId: string, key: string): RoutedPath | undefined {
    const hit = this.entries.get(linkId);
    if (!hit || hit.key !== key) return undefined;
    this._stats.reused++;
    return hit.routed;
  }

  store(linkId: string, key: string, routed: RoutedPath): void {
    this._stats.routed++;
    if (this.entries.size >= MAX_ENTRIES && !this.entries.has(linkId)) {
      // Map iterates in insertion order, so this drops the oldest.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(linkId, { key, routed });
  }

  /** A route computed but NOT cacheable (e.g. no route found) must not keep a stale entry. */
  drop(linkId: string): void {
    this.entries.delete(linkId);
  }

  invalidate(linkIds: Iterable<string>): void {
    for (const id of linkIds) this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
    this.prevRects.clear();
    this.epoch = '';
  }
}

/** Grow a rect by `pad` on every side. */
export function inflate(r: Rect, pad: number): Rect {
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

/**
 * Merge dirty rects that overlap or nearly touch, so a drag of one node does not
 * fire N separate spatial queries. Cheap and approximate: one pass, absorbing
 * into the first box that already covers the candidate's neighbourhood. The
 * result is a SUPERSET of the input regions, which is the safe direction — it
 * can only invalidate more links, never fewer.
 */
export function coalesce(rects: Rect[], maxBoxes = 16): Rect[] {
  if (rects.length <= 1) return rects;

  const boxes: Rect[] = [];
  for (const r of rects) {
    let merged = false;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (
        r.x <= b.x + b.width &&
        r.x + r.width >= b.x &&
        r.y <= b.y + b.height &&
        r.y + r.height >= b.y
      ) {
        const minX = Math.min(b.x, r.x);
        const minY = Math.min(b.y, r.y);
        const maxX = Math.max(b.x + b.width, r.x + r.width);
        const maxY = Math.max(b.y + b.height, r.y + r.height);
        boxes[i] = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        merged = true;
        break;
      }
    }
    if (!merged) boxes.push({ ...r });
  }

  // A pathological frame (a layout run moving every node) must not turn into
  // thousands of spatial queries. Past the cap, collapse to one covering box:
  // strictly more invalidation, strictly less bookkeeping.
  if (boxes.length > maxBoxes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return [{ x: minX, y: minY, width: maxX - minX, height: maxY - minY }];
  }

  return boxes;
}
