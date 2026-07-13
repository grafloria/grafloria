// Wave 5 (Edge routing) — Card 7: a global penalty-based solver.
//
// Everything before this card routes edges ONE AT A TIME: each edge sees nodes
// as obstacles but not the other edges, so shared corridors, crossings and
// congestion are patched afterwards (fan-out, nudging, jumps). A
// libavoid/Adaptagrams-class solver inverts that: ALL edges route against one
// shared penalty model, so an edge pays for crossing another edge or crowding a
// corridor at ROUTING time and picks a different channel by itself.
//
// The model, deliberately small:
//   - per-edge geometry: ManhattanRouter (jetty, U-turn ban, turn cost) with
//     its obstacle set = the diagram's obstacles;
//   - plus a shared PENALTY FIELD sampled per grid cell: occupancy laid down by
//     every OTHER edge's current route (congestion), with crossings priced via
//     perpendicular-occupancy (a horizontal step through a cell some other
//     edge crossed vertically is what a crossing IS on a grid);
//   - passes: edges route in deterministic order, each pass re-routing against
//     the field the previous pass produced; the field converges quickly (2
//     passes default) because the penalties are additive and static within a
//     pass.
//
// INCREMENTAL: the solver keeps each edge's last route and the field; a change
// re-routes only the changed edges plus the edges whose routes touch the cells
// the change dirtied — the same dirty-set discipline the edge optimizer uses.
//
// The solver is PURE and synchronous — no DOM, no Date.now, no randomness —
// which is what lets the worker host (see solver-host.ts) run the identical
// code on either side of a postMessage boundary and lets tests prove
// determinism by simple re-runs.

import { ManhattanRouter } from '../algorithms/ManhattanRouter';
import type { Obstacle, RoutedPath } from '../types';
import type { Point } from '../../types';

type Side = 'left' | 'right' | 'top' | 'bottom';

export interface SolverEdge {
  id: string;
  start: Point;
  end: Point;
  sourceDirection?: Side;
  targetDirection?: Side;
  /** per-edge jetty override; defaults to the solver's gridSize */
  jetty?: number;
}

export interface SolverOptions {
  gridSize?: number;
  obstacleMargin?: number;
  /** cost added per step through a cell occupied by K other edges: K × this */
  congestionPenalty?: number;
  /** cost added per step through a cell that another edge crosses PERPENDICULAR to this step */
  crossingPenalty?: number;
  /** refinement passes over the whole edge set */
  passes?: number;
  /** per-edge search budget (ManhattanRouter maxIterations) */
  maxIterations?: number;
  bendCost?: number;
}

export interface SolverStats {
  /** edges routed in the last solve/solveIncremental call */
  edgesRouted: number;
  /** edges served untouched from the previous solution */
  edgesReused: number;
}

const DEFAULTS: Required<SolverOptions> = {
  gridSize: 20,
  obstacleMargin: 10,
  congestionPenalty: 30,
  crossingPenalty: 60,
  passes: 2,
  maxIterations: 20000,
  bendCost: 10,
};

/** cell key for a world point on the solver grid */
function cellKey(x: number, y: number, step: number): string {
  return `${Math.round(x / step)},${Math.round(y / step)}`;
}

export class GlobalRouteSolver {
  private readonly options: Required<SolverOptions>;
  private readonly router = new ManhattanRouter();

  // last solution + the field it produced
  private routes = new Map<string, Point[]>();
  private edges = new Map<string, SolverEdge>();
  private obstacles: Obstacle[] = [];
  /** cell → per-axis occupancy laid down by each edge: id → 'h' | 'v' */
  private field = new Map<string, Map<string, 'h' | 'v'>>();

  private _stats: SolverStats = { edgesRouted: 0, edgesReused: 0 };

  constructor(options: SolverOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get stats(): Readonly<SolverStats> {
    return this._stats;
  }

  /** Full solve. Deterministic: edges route in id order, every pass. */
  solve(edges: SolverEdge[], obstacles: Obstacle[]): Map<string, Point[]> {
    this.edges = new Map(edges.map((e) => [e.id, e]));
    this.obstacles = obstacles;
    this.routes.clear();
    this.field.clear();
    this._stats = { edgesRouted: 0, edgesReused: 0 };

    const order = [...edges].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let pass = 0; pass < this.options.passes; pass++) {
      for (const edge of order) {
        this.routeEdge(edge);
      }
    }
    return new Map(this.routes);
  }

  /**
   * Re-solve after a change: `changed` edges re-route (removed ones pass with
   * `removed: true`), and so does every edge whose current route touches a cell
   * a changed edge occupied before or after. Everything else is served as-is.
   */
  solveIncremental(
    changed: Array<{ edge: SolverEdge; removed?: boolean }>,
    obstacles?: Obstacle[]
  ): Map<string, Point[]> {
    if (obstacles) this.obstacles = obstacles;
    this._stats = { edgesRouted: 0, edgesReused: 0 };

    // cells dirtied by the change: old routes of changed edges
    const dirtyCells = new Set<string>();
    for (const { edge } of changed) {
      for (const [cell, byEdge] of this.field) {
        if (byEdge.has(edge.id)) dirtyCells.add(cell);
      }
    }

    for (const { edge, removed } of changed) {
      this.clearFromField(edge.id);
      if (removed) {
        this.routes.delete(edge.id);
        this.edges.delete(edge.id);
      } else {
        this.edges.set(edge.id, edge);
      }
    }

    // route the changed (surviving) edges — collecting the cells they now hold
    const toRoute = changed.filter((c) => !c.removed).map((c) => c.edge);
    for (const edge of [...toRoute].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      this.routeEdge(edge);
      for (const [cell, byEdge] of this.field) {
        if (byEdge.has(edge.id)) dirtyCells.add(cell);
      }
    }

    // neighbourhood: edges whose route passes through any dirty cell
    const neighbours = new Set<string>();
    for (const cell of dirtyCells) {
      for (const id of this.field.get(cell)?.keys() ?? []) {
        if (!changed.some((c) => c.edge.id === id)) neighbours.add(id);
      }
    }
    for (const id of [...neighbours].sort()) {
      const edge = this.edges.get(id);
      if (edge) this.routeEdge(edge);
    }

    this._stats.edgesReused = this.edges.size - this._stats.edgesRouted;
    return new Map(this.routes);
  }

  // -------------------------------------------------------------------------

  private routeEdge(edge: SolverEdge): void {
    this.clearFromField(edge.id);

    const step = this.options.gridSize;
    // The penalty field enters through the ManhattanRouter's container hook? No —
    // it needs per-cell costs, so the router is given a costFn via obstacles?
    // Neither fits; the field is applied by wrapping the router's own search
    // through a penalized obstacle expansion: we inflate the request with
    // PSEUDO-obstacle costs by re-running Manhattan on a costed grid. To keep
    // ManhattanRouter untouched (it is a shipped card), the solver runs its own
    // copy of the same search with the extra per-cell term. See penalisedRoute.
    const routed = this.penalisedRoute(edge, step);
    if (!routed) return;

    this.routes.set(edge.id, routed.points);
    this._stats.edgesRouted++;

    // lay the route into the field
    const pts = routed.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const horizontal = a.y === b.y;
      const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / step;
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * (n === 0 ? 0 : k / n);
        const y = a.y + (b.y - a.y) * (n === 0 ? 0 : k / n);
        const cell = cellKey(x, y, step);
        let byEdge = this.field.get(cell);
        if (!byEdge) {
          byEdge = new Map();
          this.field.set(cell, byEdge);
        }
        byEdge.set(edge.id, horizontal ? 'h' : 'v');
      }
    }
  }

  /**
   * Manhattan-style search with the shared penalty field added per step:
   * congestion (any other edge in the cell) and crossing (another edge through
   * the cell PERPENDICULAR to this step). Same moves, same U-turn ban, same
   * jetty handling as ManhattanRouter — the field term is the only addition.
   */
  private penalisedRoute(edge: SolverEdge, step: number): RoutedPath | null {
    const { congestionPenalty, crossingPenalty } = this.options;
    const self = this;

    // Delegate the mechanical parts to ManhattanRouter by pre-charging the
    // field into a transient obstacle-cost surface is not expressible via its
    // public options — so the solver reuses the router for the BASE route and
    // falls back to it when the field is empty (fast path), and otherwise runs
    // the costed variant below.
    const fieldEmpty = this.field.size === 0;
    const base = () =>
      this.router.route({
        start: edge.start,
        end: edge.end,
        sourceDirection: edge.sourceDirection,
        targetDirection: edge.targetDirection,
        obstacles: this.obstacles,
        options: {
          gridSize: step,
          obstacleMargin: this.options.obstacleMargin,
          maxIterations: this.options.maxIterations,
          costs: { bends: this.options.bendCost },
          jetty: edge.jetty ?? step,
        },
      });
    if (fieldEmpty) return base();

    // ---- costed grid search (the router's algorithm + the field term) -------
    const jetty = edge.jetty ?? step;
    const DIR: Record<Side, Point> = {
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
      top: { x: 0, y: -1 },
      bottom: { x: 0, y: 1 },
    };
    const srcSide: Side =
      edge.sourceDirection ??
      (Math.abs(edge.end.x - edge.start.x) >= Math.abs(edge.end.y - edge.start.y)
        ? edge.end.x >= edge.start.x ? 'right' : 'left'
        : edge.end.y >= edge.start.y ? 'bottom' : 'top');
    const tgtSide: Side =
      edge.targetDirection ??
      (Math.abs(edge.start.x - edge.end.x) >= Math.abs(edge.start.y - edge.end.y)
        ? edge.start.x >= edge.end.x ? 'right' : 'left'
        : edge.start.y >= edge.end.y ? 'bottom' : 'top');

    const sv = DIR[srcSide];
    const tv = DIR[tgtSide];
    const sStub = { x: edge.start.x + sv.x * jetty, y: edge.start.y + sv.y * jetty };
    const tStub = { x: edge.end.x + tv.x * jetty, y: edge.end.y + tv.y * jetty };

    const margin = this.options.obstacleMargin;
    const inflated = this.obstacles.map((o) => ({
      x: o.x - margin - (o.margin ?? 0),
      y: o.y - margin - (o.margin ?? 0),
      width: o.width + 2 * (margin + (o.margin ?? 0)),
      height: o.height + 2 * (margin + (o.margin ?? 0)),
    }));
    const blocked = (x: number, y: number) =>
      inflated.some((o) => x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);

    const MOVES = [
      { dx: 1, dy: 0, h: true },
      { dx: 0, dy: 1, h: false },
      { dx: -1, dy: 0, h: true },
      { dx: 0, dy: -1, h: false },
    ];
    const sx = Math.round(sStub.x / step), sy = Math.round(sStub.y / step);
    const tx = Math.round(tStub.x / step), ty = Math.round(tStub.y / step);
    const startMove = MOVES.findIndex((m) =>
      (srcSide === 'right' && m.dx === 1) || (srcSide === 'left' && m.dx === -1) ||
      (srcSide === 'bottom' && m.dy === 1) || (srcSide === 'top' && m.dy === -1));
    const h = (x: number, y: number) => (Math.abs(x - tx) + Math.abs(y - ty)) * step;

    interface N { x: number; y: number; move: number; g: number; f: number; parent: N | null }
    const open: N[] = [{ x: sx, y: sy, move: startMove, g: 0, f: h(sx, sy), parent: null }];
    const best = new Map<string, number>([[`${sx},${sy},${startMove}`, 0]]);
    let expansions = 0;

    const fieldCost = (x: number, y: number, moveHorizontal: boolean): number => {
      const byEdge = self.field.get(`${x},${y}`);
      if (!byEdge) return 0;
      let cost = 0;
      for (const [id, axis] of byEdge) {
        if (id === edge.id) continue;
        cost += congestionPenalty;
        // perpendicular occupancy = a crossing on a grid
        if ((axis === 'h') !== moveHorizontal) cost += crossingPenalty;
      }
      return cost;
    };

    while (open.length > 0) {
      if (++expansions > this.options.maxIterations) return base(); // budget: fall back, never spin
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const node = open.splice(bi, 1)[0];

      if (node.x === tx && node.y === ty) {
        const cells: Point[] = [];
        let cur: N | null = node;
        while (cur) { cells.push({ x: cur.x * step, y: cur.y * step }); cur = cur.parent; }
        cells.reverse();
        const join = (a: Point, b: Point, horizFirst: boolean): Point[] =>
          a.x === b.x || a.y === b.y ? [] : [horizFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y }];
        const raw: Point[] = [
          { ...edge.start }, sStub,
          ...join(sStub, cells[0], sv.x !== 0),
          ...cells,
          ...join(cells[cells.length - 1], tStub, true),
          tStub, { ...edge.end },
        ];
        // dedupe + collinear merge
        const pts: Point[] = [];
        for (const p of raw) {
          const last = pts[pts.length - 1];
          if (last && last.x === p.x && last.y === p.y) continue;
          while (pts.length >= 2) {
            const a2 = pts[pts.length - 2], b2 = pts[pts.length - 1];
            if ((a2.x === b2.x && b2.x === p.x) || (a2.y === b2.y && b2.y === p.y)) pts.pop();
            else break;
          }
          pts.push({ ...p });
        }
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
        return { points: pts, totalLength: len, bendCount: Math.max(0, pts.length - 2) };
      }

      for (let mi = 0; mi < MOVES.length; mi++) {
        if (node.move >= 0 && mi === (node.move + 2) % 4) continue; // no U-turns
        const m = MOVES[mi];
        const nx = node.x + m.dx, ny = node.y + m.dy;
        const wx = nx * step, wy = ny * step;
        if (!(nx === tx && ny === ty) && blocked(wx, wy)) continue;
        const turn = node.move >= 0 && mi !== node.move ? this.options.bendCost : 0;
        const g = node.g + step + turn + fieldCost(nx, ny, m.h);
        const key = `${nx},${ny},${mi}`;
        const known = best.get(key);
        if (known !== undefined && known <= g) continue;
        best.set(key, g);
        open.push({ x: nx, y: ny, move: mi, g, f: g + h(nx, ny), parent: node });
      }
    }
    return base();
  }

  private clearFromField(edgeId: string): void {
    for (const [cell, byEdge] of this.field) {
      byEdge.delete(edgeId);
      if (byEdge.size === 0) this.field.delete(cell);
    }
  }
}
