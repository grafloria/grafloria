// Motion-stable routing — WHO is currently animating?
//
// The route pipeline re-decides obstacle detours from scratch every frame, which
// is correct at rest and visibly WRONG during continuous motion: while a tween or
// drag sweeps node bodies through link chords, the straight-router links snap
// between shape classes (direct cubic ↔ detour spline ↔ rounded-orthogonal) —
// measured at 17 flips / 22 discontinuity events in one 900ms 8-node tween on
// demos/nodes/node-position-animation.html, worst flip 327px in a 21px frame.
//
// This tracker supplies the one fact the suppression needs: which nodes are IN
// MOTION — meaning their rect changed in TWO consecutive observed frames. Two,
// not one: a single `setPosition` + render is a programmatic jump whose very
// frame must keep today's detour behaviour (unit tests and hosts rely on it); a
// tween or drag writes every frame, so it earns the streak on its second frame
// and loses it on the first still frame — which is exactly the settle frame
// where the proper route returns.
//
// Fed from `invalidateStaleRoutes()` with the same per-frame rect map the route
// memo diffs, so it costs one extra Map scan per painted frame and nothing at all
// on gated (skipped) frames — a frame nobody painted moved nobody.

import type { Rect } from './route-memo';

export class MotionTracker {
  /** Rects as of the previous observed frame. */
  private prev = new Map<string, Rect>();
  /** Nodes whose rect changed in the previous frame's diff. */
  private prevMoved = new Set<string>();
  /** Nodes whose rect changed this frame AND last — continuous motion. */
  private inMotion = new Set<string>();

  /**
   * Observe a frame. `rects` is only read, never mutated — sharing the map the
   * route memo takes ownership of is safe.
   */
  beginFrame(rects: Map<string, Rect>): void {
    const moved = new Set<string>();
    for (const [id, now] of rects) {
      const before = this.prev.get(id);
      if (
        before &&
        (before.x !== now.x ||
          before.y !== now.y ||
          before.width !== now.width ||
          before.height !== now.height)
      ) {
        moved.add(id);
      }
    }

    this.inMotion.clear();
    for (const id of moved) {
      if (this.prevMoved.has(id)) this.inMotion.add(id);
    }
    this.prevMoved = moved;
    this.prev = rects;
  }

  isInMotion(id: string): boolean {
    return this.inMotion.has(id);
  }

  /** True while anything at all is mid-animation. */
  get hasMotion(): boolean {
    return this.inMotion.size > 0;
  }

  clear(): void {
    this.prev.clear();
    this.prevMoved.clear();
    this.inMotion.clear();
  }
}
