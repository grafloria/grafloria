// Wave 5 (Edge routing) — Card 3: Manhattan router with JointJS+-parity knobs.
//
// A first-class GRID router: A* over grid cells where the search state carries
// the entry DIRECTION, so turns are explicit moves — they cost extra (the bend
// penalty), U-turns are forbidden outright, and every produced path is
// orthogonal BY CONSTRUCTION rather than by post-rectification.
//
// The knobs, mapped onto the existing RoutingOptions vocabulary so callers
// don't learn a second config language:
//
//   step                  → options.gridSize        (default 20)
//   obstacle padding      → options.obstacleMargin  (default 10)
//   maximumLoops          → options.maxIterations   (default 10000 expansions)
//   turn penalty          → options.costs.bends     (default 10)
//   perpendicular ends    → options.jetty           (default = step; Manhattan
//                           ALWAYS stubs — that is what makes it Manhattan)
//
// Exhausting the loop cap returns null — the caller's fallback chain (the
// renderer falls back to the plain orthogonal route) handles it, which is the
// same contract JointJS+'s fallbackRoute serves.

import type { IRouter, RouteRequest, RoutedPath, RouteSegment, Obstacle } from '../types';
import type { Point } from '../../types';
import { OrthogonalRouter } from './OrthogonalRouter';

type Side = 'left' | 'right' | 'top' | 'bottom';

const DIR_VECTORS: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** The four grid moves, indexed so opposites are (i + 2) % 4 — the U-turn test. */
const MOVES: Array<{ dx: number; dy: number; side: Side }> = [
  { dx: 1, dy: 0, side: 'right' },
  { dx: 0, dy: 1, side: 'bottom' },
  { dx: -1, dy: 0, side: 'left' },
  { dx: 0, dy: -1, side: 'top' },
];

interface SearchNode {
  x: number; // grid coords
  y: number;
  move: number; // index into MOVES of the move that ENTERED this cell; -1 at start
  g: number;
  f: number;
  parent: SearchNode | null;
}

export class ManhattanRouter implements IRouter {
  getName(): string {
    return 'manhattan';
  }

  route(request: RouteRequest): RoutedPath | null {
    const { start, end, sourceDirection, targetDirection } = request;
    const obstacles = request.obstacles ?? [];
    const options = request.options ?? {};

    const step = Math.max(1, options.gridSize ?? 20);
    const padding = options.obstacleMargin ?? 10;
    const maxLoops = options.maxIterations ?? 10000;
    const bendCost = options.costs?.bends ?? 10;
    // Manhattan ALWAYS leaves perpendicular: an unset jetty defaults to one step.
    const jetty = options.jetty ?? step;

    const srcSide: Side = sourceDirection ?? OrthogonalRouter.deriveExitSide(start, end);
    const tgtSide: Side = targetDirection ?? OrthogonalRouter.deriveExitSide(end, start);

    // Stub points: the search runs between them; the anchors join at the end.
    const sv = DIR_VECTORS[srcSide];
    const tv = DIR_VECTORS[tgtSide];
    const sStub: Point = { x: start.x + sv.x * jetty, y: start.y + sv.y * jetty };
    const tStub: Point = { x: end.x + tv.x * jetty, y: end.y + tv.y * jetty };

    const inflated = obstacles.map((o) => this.inflate(o, padding));

    const gridPath = this.search(sStub, tStub, srcSide, inflated, step, bendCost, maxLoops);
    if (!gridPath) return null;

    // anchor → stub → (orthogonal joins) grid path (orthogonal joins) → stub → anchor
    const pts: Point[] = [
      { ...start },
      sStub,
      ...this.orthogonalJoin(sStub, gridPath[0], srcSide),
      ...gridPath,
      ...this.orthogonalJoin(gridPath[gridPath.length - 1], tStub, undefined),
      tStub,
      { ...end },
    ];

    const cleaned = this.cleanup(pts);
    const totalLength = this.pathLength(cleaned);
    const bendCount = Math.max(0, cleaned.length - 2);
    return {
      points: cleaned,
      totalLength,
      bendCount,
      cost: totalLength + bendCount * bendCost,
      segments: this.segments(cleaned),
    };
  }

  // ------------------------------------------------------------------ search

  private search(
    from: Point,
    to: Point,
    startSide: Side,
    obstacles: Obstacle[],
    step: number,
    bendCost: number,
    maxLoops: number
  ): Point[] | null {
    const sx = Math.round(from.x / step);
    const sy = Math.round(from.y / step);
    const tx = Math.round(to.x / step);
    const ty = Math.round(to.y / step);

    const startMove = MOVES.findIndex((m) => m.side === startSide);
    const h = (x: number, y: number) => (Math.abs(x - tx) + Math.abs(y - ty)) * step;

    const open: SearchNode[] = [
      { x: sx, y: sy, move: startMove, g: 0, f: h(sx, sy), parent: null },
    ];
    // best g seen per (cell, entry-direction) — direction is part of the state,
    // which is exactly what makes turns first-class.
    const best = new Map<string, number>();
    best.set(`${sx},${sy},${startMove}`, 0);

    let expansions = 0;
    while (open.length > 0) {
      if (++expansions > maxLoops) return null; // maximumLoops: give up honestly

      // extract-min (open sets stay small at these grid sizes; a heap would be
      // an optimisation, not a correctness change)
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const node = open.splice(bi, 1)[0];

      if (node.x === tx && node.y === ty) {
        const cells: Point[] = [];
        let cur: SearchNode | null = node;
        while (cur) {
          cells.push({ x: cur.x * step, y: cur.y * step });
          cur = cur.parent;
        }
        return cells.reverse();
      }

      for (let mi = 0; mi < MOVES.length; mi++) {
        // U-turns are forbidden: a 180° flip is never a legal Manhattan move.
        if (node.move >= 0 && mi === (node.move + 2) % 4) continue;

        const m = MOVES[mi];
        const nx = node.x + m.dx;
        const ny = node.y + m.dy;
        const wx = nx * step;
        const wy = ny * step;

        // the TARGET cell is always enterable (ports sit at node edges whose
        // inflated obstacle covers them); everything else respects obstacles
        if (!(nx === tx && ny === ty) && this.blocked(wx, wy, obstacles)) continue;

        const turn = node.move >= 0 && mi !== node.move ? bendCost : 0;
        const g = node.g + step + turn;
        const key = `${nx},${ny},${mi}`;
        const known = best.get(key);
        if (known !== undefined && known <= g) continue;
        best.set(key, g);
        open.push({ x: nx, y: ny, move: mi, g, f: g + h(nx, ny), parent: node });
      }
    }
    return null;
  }

  private blocked(x: number, y: number, obstacles: Obstacle[]): boolean {
    for (const o of obstacles) {
      if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height) return true;
    }
    return false;
  }

  private inflate(o: Obstacle, padding: number): Obstacle {
    const m = padding + (o.margin ?? 0);
    return { id: o.id, x: o.x - m, y: o.y - m, width: o.width + 2 * m, height: o.height + 2 * m };
  }

  // ------------------------------------------------------------------ joins

  /**
   * Orthogonal connection between two (possibly off-grid vs on-grid) points.
   * Returns the INTERIOR joint(s) only — the endpoints themselves are already
   * in the path. Prefers continuing along `preferSide`'s axis first so the join
   * doesn't immediately break the stub's perpendicularity.
   */
  private orthogonalJoin(a: Point, b: Point, preferSide: Side | undefined): Point[] {
    if (a.x === b.x || a.y === b.y) return [];
    const preferHorizontalFirst = preferSide === 'left' || preferSide === 'right';
    return preferHorizontalFirst ? [{ x: b.x, y: a.y }] : [{ x: a.x, y: b.y }];
  }

  private cleanup(pts: Point[]): Point[] {
    // dedupe
    const dedup: Point[] = [];
    for (const p of pts) {
      const last = dedup[dedup.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) dedup.push({ ...p });
    }
    // merge collinear runs (also swallows out-and-back retraces on the same line)
    const out: Point[] = [];
    for (const p of dedup) {
      while (out.length >= 2) {
        const a = out[out.length - 2];
        const b = out[out.length - 1];
        const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
        if (collinear) out.pop();
        else break;
      }
      out.push(p);
    }
    return out;
  }

  private pathLength(pts: Point[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    }
    return len;
  }

  private segments(pts: Point[]): RouteSegment[] {
    const segs: RouteSegment[] = [];
    for (let i = 1; i < pts.length; i++) {
      const s = pts[i - 1];
      const e = pts[i];
      const length = Math.hypot(e.x - s.x, e.y - s.y);
      segs.push({ start: s, end: e, length, angle: (Math.atan2(e.y - s.y, e.x - s.x) * 180) / Math.PI });
    }
    return segs;
  }
}
