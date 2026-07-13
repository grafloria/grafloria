// Wave 8 (Performance & scale) — Card 6: the render loop finally drives the solver.
//
// Wave 5 (Card 7) built `GlobalRouteSolver` — all edges routed against ONE shared
// penalty field, so an edge pays for crossing another edge or crowding a corridor
// at ROUTING time — and `SolverHost`, the worker seam, whose inline fallback
// speaks the identical protocol. And then it wrote, honestly, in its own notes:
// "the render loop does not yet drive the solver." This is that wire.
//
// THE CONSTRAINT THAT DICTATES THE ARCHITECTURE. `render()` is SYNCHRONOUS: it
// returns a VNode tree, and every link's geometry must be final before it does.
// A worker cannot be awaited from inside it. There is no clever way around this;
// Wave 7's layout-host learned the neighbouring version of the same lesson the
// hard way (a worker running a synchronous loop is not reading its message queue,
// so it cannot even RECEIVE the cancel you sent it).
//
// So the wiring is PROVISIONAL-THEN-REFINED, which is what libavoid-class systems
// do and the only thing that is actually sound here:
//
//   1. the synchronous incremental router paints immediately — it is correct, and
//      after this card it is also fast (a one-node drag at 10k nodes is ~90ms);
//   2. the global solver runs OFF THE MAIN THREAD against the same world;
//   3. when its answer lands it is adopted, and a re-render is requested.
//
// THE BUG THIS MUST NOT HAVE, and the reason for every `version` below: an answer
// that arrives after the world has moved was computed against an obstacle set that
// no longer exists. Painting it puts links through nodes. So every submission
// carries the world version it was computed for, and a result whose version is no
// longer current is DISCARDED, not adopted. Late is fine. Wrong is not.
//
// And we never try to CANCEL an in-flight solve — see the layout-host note above,
// it does not work. We SUPERSEDE: the newest world wins, and at most one solve is
// ever in flight.

import { SolverHost } from '@grafloria/engine';
import type { SolverEdge, SolverOptions, SolverPort, Obstacle, Point, RoutedPath } from '@grafloria/engine';

export interface RouteSolverBridgeOptions {
  /**
   * A real Worker (or anything satisfying SolverPort). Omit to run the solver
   * INLINE — same protocol, same code, same answers, just on this thread. The
   * bridge does not construct a Worker itself: that would bake one bundler's URL
   * scheme into the renderer, which is the mistake the old LayoutWorkerPool made.
   */
  port?: SolverPort;
  solver?: SolverOptions;
  /** "I have better routes than the ones you painted." Ask for a re-render. */
  onRoutesReady?: () => void;
}

export interface RouteSolverStats {
  submitted: number;
  applied: number;
  /** answers thrown away because the world had moved on under them */
  discarded: number;
  superseded: number;
}

export class RouteSolverBridge {
  private readonly host: SolverHost;
  private readonly options?: SolverOptions;
  private readonly onRoutesReady?: () => void;

  /** The solver's latest accepted answer, and the world it describes. */
  private routes = new Map<string, RoutedPath>();
  private routesVersion = -1;

  private inFlightVersion = -1;
  private queued: { version: number; edges: SolverEdge[]; obstacles: Obstacle[] } | null = null;

  private _stats: RouteSolverStats = { submitted: 0, applied: 0, discarded: 0, superseded: 0 };
  private disposed = false;

  constructor(options: RouteSolverBridgeOptions = {}) {
    this.host = new SolverHost(options.port);
    this.options = options.solver;
    this.onRoutesReady = options.onRoutesReady;
  }

  get stats(): Readonly<RouteSolverStats> {
    return this._stats;
  }

  /** True once the solver has an answer for THIS world — i.e. one safe to paint. */
  hasRoutesFor(version: number): boolean {
    return this.routesVersion === version && this.routes.size > 0;
  }

  routeFor(linkId: string, version: number): RoutedPath | undefined {
    if (this.routesVersion !== version) return undefined;
    return this.routes.get(linkId);
  }

  /**
   * Ask for this world to be solved. Idempotent per version: submitting the same
   * world twice does nothing, so calling this every frame is free.
   *
   * If a solve is already running for an older world, the new one is QUEUED, not
   * raced — and if a third arrives first, it replaces the queued one. At most one
   * solve in flight, and the newest world always wins.
   */
  submit(version: number, edges: SolverEdge[], obstacles: Obstacle[]): void {
    if (this.disposed) return;
    if (version === this.routesVersion) return; // already solved
    if (version === this.inFlightVersion) return; // already solving

    if (this.inFlightVersion >= 0) {
      if (this.queued) this._stats.superseded++;
      this.queued = { version, edges, obstacles };
      return;
    }

    this.dispatch({ version, edges, obstacles });
  }

  private dispatch(job: { version: number; edges: SolverEdge[]; obstacles: Obstacle[] }): void {
    this.inFlightVersion = job.version;
    this._stats.submitted++;

    this.host
      .solve(job.edges, job.obstacles, this.options)
      .then(({ routes }) => {
        if (this.disposed) return;
        this.inFlightVersion = -1;

        // The world may have moved while we were solving. If it did, this answer
        // describes obstacles that are no longer where they were — it is not
        // "slightly out of date", it is wrong, and painting it would run links
        // through nodes. Drop it; the queued job below is already solving the
        // world as it now is.
        const stillCurrent = this.queued === null || this.queued.version === job.version;
        if (!stillCurrent) {
          this._stats.discarded++;
        } else {
          this.routes = new Map();
          for (const [id, points] of routes) {
            if (points.length < 2) continue;
            this.routes.set(id, toRoutedPath(points));
          }
          this.routesVersion = job.version;
          this._stats.applied++;
        }

        const next = this.queued;
        this.queued = null;
        if (next) this.dispatch(next);
        else if (stillCurrent) this.onRoutesReady?.();
      })
      .catch(() => {
        // A solver that throws must not wedge the bridge: the sync router is
        // already painting correct geometry, so the worst case here is that we
        // never refine. Reset and let the next frame try again.
        this.inFlightVersion = -1;
        const next = this.queued;
        this.queued = null;
        if (next) this.dispatch(next);
      });
  }

  dispose(): void {
    this.disposed = true;
    this.routes.clear();
    this.queued = null;
  }
}

function toRoutedPath(points: Point[]): RoutedPath {
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return {
    points: points.map((p) => ({ x: p.x, y: p.y })),
    totalLength,
    bendCount: Math.max(0, points.length - 2),
    cost: totalLength,
  };
}
