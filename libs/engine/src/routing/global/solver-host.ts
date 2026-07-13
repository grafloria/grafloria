// Wave 5 (Edge routing) — Card 7, the worker seam.
//
// The solver is pure and synchronous; this host runs it EITHER inline (no
// Worker available — jsdom, SSR, tests) or behind a postMessage boundary, with
// one protocol and one code path for callers. The caller never knows which.
//
// Protocol (structured-clone-safe, no functions, no class instances):
//   → { seq, kind: 'solve',       edges, obstacles, options }
//   → { seq, kind: 'incremental', changed, obstacles? }
//   ← { seq, routes: Array<[edgeId, Point[]]>, stats }
//
// `createSolverWorkerScript()` returns the exact onmessage body a bundler-built
// Worker needs, so the renderer (or a server thumbnailer) can instantiate the
// worker however its toolchain likes — new Worker(new URL(...)), a blob, or a
// node worker_thread — and hand the port in. The host does not construct
// Workers itself: doing so would bake ONE bundler's URL scheme into the engine.

import { GlobalRouteSolver, type SolverEdge, type SolverOptions, type SolverStats } from './GlobalRouteSolver';
import type { Obstacle } from '../types';
import type { Point } from '../../types';

export interface SolverRequestSolve {
  seq: number;
  kind: 'solve';
  edges: SolverEdge[];
  obstacles: Obstacle[];
  options?: SolverOptions;
}

export interface SolverRequestIncremental {
  seq: number;
  kind: 'incremental';
  changed: Array<{ edge: SolverEdge; removed?: boolean }>;
  obstacles?: Obstacle[];
}

export type SolverRequest = SolverRequestSolve | SolverRequestIncremental;

export interface SolverResponse {
  seq: number;
  routes: Array<[string, Point[]]>;
  stats: SolverStats;
}

/** The message port surface the host needs — a real Worker satisfies it. */
export interface SolverPort {
  postMessage(msg: SolverRequest): void;
  onmessage: ((ev: { data: SolverResponse }) => void) | null;
}

/**
 * Serve solver requests on a port. This IS the worker's message loop — call it
 * inside the worker script with `self`, or in a test with a fake port.
 */
export function serveSolver(port: {
  onmessage: ((ev: { data: SolverRequest }) => void) | null;
  postMessage(msg: SolverResponse): void;
}): void {
  let solver: GlobalRouteSolver | null = null;
  port.onmessage = (ev) => {
    const req = ev.data;
    if (req.kind === 'solve') {
      solver = new GlobalRouteSolver(req.options);
      const routes = solver.solve(req.edges, req.obstacles);
      port.postMessage({ seq: req.seq, routes: [...routes], stats: { ...solver.stats } });
    } else {
      if (!solver) solver = new GlobalRouteSolver();
      const routes = solver.solveIncremental(req.changed, req.obstacles);
      port.postMessage({ seq: req.seq, routes: [...routes], stats: { ...solver.stats } });
    }
  };
}

/**
 * The caller-side host. Pass a real Worker (or anything satisfying SolverPort)
 * to run remote; pass nothing to run inline on the same thread — identical
 * behaviour, no protocol drift, because BOTH paths speak through serveSolver.
 */
export class SolverHost {
  private seq = 0;
  private pending = new Map<number, (r: SolverResponse) => void>();
  private readonly port: SolverPort;

  constructor(port?: SolverPort) {
    if (port) {
      this.port = port;
    } else {
      // inline fallback: a loopback "port" pair served by the same loop the
      // worker would run — the protocol is exercised even in-process.
      const hostSide: SolverPort = { postMessage: () => void 0, onmessage: null };
      const workerSide = {
        onmessage: null as ((ev: { data: SolverRequest }) => void) | null,
        postMessage: (msg: SolverResponse) => hostSide.onmessage?.({ data: msg }),
      };
      serveSolver(workerSide);
      hostSide.postMessage = (msg: SolverRequest) => workerSide.onmessage?.({ data: msg });
      this.port = hostSide;
    }
    this.port.onmessage = (ev) => {
      const cb = this.pending.get(ev.data.seq);
      this.pending.delete(ev.data.seq);
      cb?.(ev.data);
    };
  }

  solve(
    edges: SolverEdge[],
    obstacles: Obstacle[],
    options?: SolverOptions
  ): Promise<{ routes: Map<string, Point[]>; stats: SolverStats }> {
    return this.request({ seq: ++this.seq, kind: 'solve', edges, obstacles, options });
  }

  solveIncremental(
    changed: Array<{ edge: SolverEdge; removed?: boolean }>,
    obstacles?: Obstacle[]
  ): Promise<{ routes: Map<string, Point[]>; stats: SolverStats }> {
    return this.request({ seq: ++this.seq, kind: 'incremental', changed, obstacles });
  }

  private request(req: SolverRequest): Promise<{ routes: Map<string, Point[]>; stats: SolverStats }> {
    return new Promise((resolve) => {
      this.pending.set(req.seq, (r) => resolve({ routes: new Map(r.routes), stats: r.stats }));
      this.port.postMessage(req);
    });
  }
}
