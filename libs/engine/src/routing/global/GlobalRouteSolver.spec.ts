// Wave 5 (Edge routing) — Card 7: the global penalty solver.
//
// What distinguishes a GLOBAL solver from per-edge routing is testable directly:
// edges must pay for each other. Two edges that would independently pick the
// same corridor must come out of the solver on different channels; crossings
// must cost; a change must re-route only its neighbourhood; and the whole thing
// must be deterministic, because the worker host round-trips it through a
// structured-clone protocol and the two sides must never disagree.

import { GlobalRouteSolver, type SolverEdge } from './GlobalRouteSolver';
import { SolverHost, serveSolver, type SolverRequest, type SolverResponse } from './solver-host';

function corridorEdges(): SolverEdge[] {
  // Two edges whose independent Manhattan routes share the y=100 corridor.
  return [
    { id: 'a', start: { x: 0, y: 100 }, end: { x: 400, y: 100 }, sourceDirection: 'right', targetDirection: 'left' },
    { id: 'b', start: { x: 0, y: 100 }, end: { x: 400, y: 100 }, sourceDirection: 'right', targetDirection: 'left' },
  ];
}

/** cells of a polyline on the solver grid, as "x,y" strings */
function cells(points: Array<{ x: number; y: number }>, step = 20): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / step;
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * (n === 0 ? 0 : k / n);
      const y = a.y + (b.y - a.y) * (n === 0 ? 0 : k / n);
      out.add(`${Math.round(x / step)},${Math.round(y / step)}`);
    }
  }
  return out;
}

function sharedCells(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const c of a) if (b.has(c)) n++;
  return n;
}

describe('GlobalRouteSolver (Wave 5, Card 7)', () => {
  it('edges pay for congestion: two identical edges come out on different channels', () => {
    const solver = new GlobalRouteSolver();
    const routes = solver.solve(corridorEdges(), []);
    const a = routes.get('a')!;
    const b = routes.get('b')!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    // Their interiors must not ride the same cells (endpoints/stubs are shared
    // by construction — both edges use the same ports here).
    const interiorA = cells(a.slice(2, -2));
    const interiorB = cells(b.slice(2, -2));
    const overlap = sharedCells(interiorA, interiorB);
    expect(overlap).toBeLessThanOrEqual(2); // corners may touch; the RUN must not
  });

  it('a solo edge routes exactly like plain Manhattan (the field term is zero)', () => {
    const solver = new GlobalRouteSolver();
    const routes = solver.solve(
      [{ id: 'x', start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, sourceDirection: 'right', targetDirection: 'left' }],
      []
    );
    const pts = routes.get('x')!;
    // straight shot: no reason to bend
    expect(pts.every((p) => p.y === 0)).toBe(true);
  });

  it('is deterministic: same input, byte-identical output', () => {
    const s1 = new GlobalRouteSolver().solve(corridorEdges(), []);
    const s2 = new GlobalRouteSolver().solve(corridorEdges(), []);
    expect(JSON.stringify([...s1])).toBe(JSON.stringify([...s2]));
  });

  it('respects node obstacles while dodging other edges', () => {
    const wall = { id: 'wall', x: 180, y: 60, width: 40, height: 80 };
    const solver = new GlobalRouteSolver();
    const routes = solver.solve(corridorEdges(), [wall]);
    for (const id of ['a', 'b']) {
      const pts = routes.get(id)!;
      for (let i = 0; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        const inside = midX > wall.x && midX < wall.x + wall.width && midY > wall.y && midY < wall.y + wall.height;
        expect(inside).toBe(false);
      }
    }
  });

  it('incremental: an unrelated far-away edge is served from the previous solution', () => {
    const solver = new GlobalRouteSolver();
    const far: SolverEdge = {
      id: 'far', start: { x: 0, y: 2000 }, end: { x: 400, y: 2000 },
      sourceDirection: 'right', targetDirection: 'left',
    };
    solver.solve([...corridorEdges(), far], []);

    // move edge b — far's corridor is 1900px away and shares no cells
    const moved: SolverEdge = {
      id: 'b', start: { x: 0, y: 140 }, end: { x: 400, y: 140 },
      sourceDirection: 'right', targetDirection: 'left',
    };
    const routes = solver.solveIncremental([{ edge: moved }]);
    expect(routes.get('far')).toBeDefined();
    // b re-routed; a MAY re-route (it shared cells with b's old corridor);
    // far must have been reused, not re-routed
    expect(solver.stats.edgesRouted).toBeLessThan(3);
    expect(solver.stats.edgesReused).toBeGreaterThanOrEqual(1);
  });

  it('removing an edge frees its channel for the survivors', () => {
    const solver = new GlobalRouteSolver();
    const first = solver.solve(corridorEdges(), []);
    const bBefore = first.get('b')!;
    const bentBefore = bBefore.some((p) => p.y !== 100);
    expect(bentBefore).toBe(true); // b had to dodge a

    const routes = solver.solveIncremental([
      { edge: corridorEdges()[0], removed: true }, // remove a
      { edge: corridorEdges()[1] },                // re-route b
    ]);
    const bAfter = routes.get('b')!;
    // with a gone, b takes the straight corridor
    expect(bAfter.every((p) => p.y === 100)).toBe(true);
    expect(routes.has('a')).toBe(false);
  });
});

describe('SolverHost — one protocol, worker or inline (Wave 5, Card 7)', () => {
  it('inline host (no worker) solves through the SAME protocol', async () => {
    const host = new SolverHost();
    const { routes, stats } = await host.solve(corridorEdges(), []);
    expect(routes.size).toBe(2);
    expect(stats.edgesRouted).toBeGreaterThan(0);
  });

  it('a fake worker port produces byte-identical results to the inline path', async () => {
    // fake "worker": the serve loop on one side of a hand-rolled port pair —
    // exactly what a real Worker does, minus the thread.
    const workerSide: {
      onmessage: ((ev: { data: SolverRequest }) => void) | null;
      postMessage: (msg: SolverResponse) => void;
    } = {
      onmessage: null,
      postMessage: () => void 0,
    };
    const hostSide = {
      postMessage: (msg: SolverRequest) => workerSide.onmessage?.({ data: msg }),
      onmessage: null as ((ev: { data: SolverResponse }) => void) | null,
    };
    serveSolver(workerSide);
    workerSide.postMessage = (msg: SolverResponse) => hostSide.onmessage?.({ data: msg });

    const viaWorker = await new SolverHost(hostSide).solve(corridorEdges(), []);
    const inline = await new SolverHost().solve(corridorEdges(), []);
    expect(JSON.stringify([...viaWorker.routes])).toBe(JSON.stringify([...inline.routes]));
  });

  it('incremental requests keep worker-side state across messages', async () => {
    const host = new SolverHost();
    await host.solve(corridorEdges(), []);
    const { routes } = await host.solveIncremental([
      { edge: corridorEdges()[0], removed: true },
      { edge: corridorEdges()[1] },
    ]);
    expect(routes.get('b')!.every((p) => p.y === 100)).toBe(true);
  });
});
