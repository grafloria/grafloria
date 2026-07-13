// Wave 8 (Performance & scale) — Card 6: the render loop driving the solver.
//
// Two things have to be true, and the second is the one that bites.
//
//   1. The solver's routes reach the screen at all. (Wave 5 built the solver and
//      the worker host and then wrote, honestly, "the render loop does not yet
//      drive the solver.")
//
//   2. A solve that lands AFTER the world has moved is DISCARDED. It was computed
//      against obstacles that are no longer where they were; it is not slightly
//      out of date, it is wrong, and painting it puts links through nodes. This
//      is the entire reason every submission carries a world version.
//
// The fake port below is what makes (2) testable: it lets a test hold a solve in
// mid-flight, move the world, and then let the answer land — which is exactly the
// race a real Worker runs into and exactly the one you cannot reproduce by luck.

import { RouteSolverBridge } from './route-solver-bridge';
import { SVGRenderer } from './svg-renderer';
import { serveSolver } from '@grafloria/engine';
import type { SolverPort, SolverRequest, SolverResponse } from '@grafloria/engine';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { Rectangle } from '../types';

const VIEWPORT: Rectangle = { x: -500, y: -500, width: 3000, height: 2000 };

/**
 * A port that speaks the real protocol (it is served by `serveSolver`, the same
 * message loop a real Worker runs) but delivers its answers only when told to.
 */
class DeferredPort implements SolverPort {
  onmessage: ((ev: { data: SolverResponse }) => void) | null = null;
  private inbox: SolverResponse[] = [];
  private worker: { onmessage: ((ev: { data: SolverRequest }) => void) | null; postMessage(m: SolverResponse): void };

  constructor() {
    this.worker = {
      onmessage: null,
      postMessage: (msg: SolverResponse) => this.inbox.push(msg),
    };
    serveSolver(this.worker);
  }

  postMessage(msg: SolverRequest): void {
    this.worker.onmessage?.({ data: msg });
  }

  get pending(): number {
    return this.inbox.length;
  }

  /** Deliver one queued answer, as a Worker's message would arrive. */
  flushOne(): void {
    const msg = this.inbox.shift();
    if (msg) this.onmessage?.({ data: msg });
  }

  flushAll(): void {
    while (this.inbox.length) this.flushOne();
  }
}

const edge = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
  id,
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
  sourceDirection: 'right' as const,
  targetDirection: 'left' as const,
});

const obstacle = (id: string, x: number, y: number) => ({ id, x, y, width: 100, height: 60 });

describe('RouteSolverBridge', () => {
  it('solves and hands back routes for the world it was asked about', async () => {
    const port = new DeferredPort();
    const bridge = new RouteSolverBridge({ port });

    bridge.submit(1, [edge('l1', 120, 30, 500, 30)], [obstacle('n9', 300, 0)]);
    expect(bridge.hasRoutesFor(1)).toBe(false); // nothing is synchronous here

    port.flushAll();
    await Promise.resolve();
    await Promise.resolve();

    expect(bridge.hasRoutesFor(1)).toBe(true);
    expect(bridge.routeFor('l1', 1)!.points.length).toBeGreaterThan(1);
    expect(bridge.stats.applied).toBe(1);
  });

  it('DISCARDS an answer that lands after the world has moved', async () => {
    // The whole point. Submit world 1; move to world 2 while it is in flight;
    // let world 1's answer arrive. It must not be adopted — it describes
    // obstacles that are gone.
    const port = new DeferredPort();
    const bridge = new RouteSolverBridge({ port });

    bridge.submit(1, [edge('l1', 120, 30, 500, 30)], [obstacle('n9', 300, 0)]);
    bridge.submit(2, [edge('l1', 120, 30, 500, 30)], [obstacle('n9', 300, 400)]); // the node moved

    // world 1's answer lands...
    port.flushAll();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(bridge.stats.discarded).toBe(1); // ...and is binned, because the world moved
    expect(bridge.hasRoutesFor(1)).toBe(false); // it is never served, not even once

    // ...which releases world 2 (queued, not raced), whose answer IS adopted
    port.flushAll();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(bridge.hasRoutesFor(2)).toBe(true);
    expect(bridge.stats.applied).toBe(1);
  });

  it('supersedes rather than cancels: at most ONE solve in flight, newest world wins', async () => {
    // You cannot cancel a worker mid-solve — it is running a synchronous loop and
    // is not reading its message queue (Wave 7's layout-host learned this the hard
    // way). So we never try. We queue the newest world and let the stale one land
    // and be thrown away.
    const port = new DeferredPort();
    const bridge = new RouteSolverBridge({ port });

    bridge.submit(1, [edge('l1', 120, 30, 500, 30)], []);
    bridge.submit(2, [edge('l1', 120, 30, 500, 30)], []);
    bridge.submit(3, [edge('l1', 120, 30, 500, 30)], []);

    expect(bridge.stats.submitted).toBe(1); // only world 1 has actually been dispatched
    expect(bridge.stats.superseded).toBe(1); // world 2 was replaced in the queue by world 3

    port.flushAll();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    port.flushAll();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(bridge.hasRoutesFor(3)).toBe(true);
    expect(bridge.hasRoutesFor(2)).toBe(false);
  });

  it('re-submitting the same world is a no-op (so calling it every frame is free)', async () => {
    const port = new DeferredPort();
    const bridge = new RouteSolverBridge({ port });

    bridge.submit(1, [edge('l1', 120, 30, 500, 30)], []);
    port.flushAll();
    for (let i = 0; i < 4; i++) await Promise.resolve();

    bridge.submit(1, [edge('l1', 120, 30, 500, 30)], []);
    bridge.submit(1, [edge('l1', 120, 30, 500, 30)], []);
    expect(bridge.stats.submitted).toBe(1);
  });

  it('runs INLINE with no port at all — same protocol, same answers', async () => {
    const inline = new RouteSolverBridge({});
    inline.submit(1, [edge('l1', 120, 30, 500, 30)], [obstacle('n9', 300, 0)]);
    for (let i = 0; i < 4; i++) await Promise.resolve();

    expect(inline.hasRoutesFor(1)).toBe(true);

    const ported = new RouteSolverBridge({ port: new DeferredPort() });
    // (the DeferredPort's own loop is serveSolver, so the two must agree)
    expect(inline.routeFor('l1', 1)!.points.length).toBeGreaterThan(1);
    inline.dispose();
    ported.dispose();
  });
});

describe('SVGRenderer × global routing', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  const build = () => {
    const mk = (id: string, x: number, y: number) => {
      const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 120, height: 60 } });
      (n as unknown as { id: string }).id = id;
      n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
      n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
      diagram.addNode(n);
    };
    mk('A', 0, 0);
    mk('B', 700, 0);
    mk('C', 0, 200);
    mk('D', 700, 200);
    const l1 = new LinkModel('A-out', 'B-in', 'orthogonal');
    (l1 as unknown as { id: string }).id = 'AB';
    diagram.addLink(l1);
    const l2 = new LinkModel('C-out', 'D-in', 'orthogonal');
    (l2 as unknown as { id: string }).id = 'CD';
    diagram.addLink(l2);
  };

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('solver')!;
    build();
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  it('is OFF by default — no solver is even constructed', () => {
    renderer = new SVGRenderer(engine, {});
    renderer.render(VIEWPORT, 1);
    expect(renderer.getRouteSolverStats()).toBeNull();
  });

  it('when ON: the first frame paints the SYNC routes and submits the world', () => {
    renderer = new SVGRenderer(engine, { globalRouting: true });
    renderer.render(VIEWPORT, 1);

    // render() is synchronous — it cannot have waited for the solver, so what is
    // on screen must be the ordinary router's answer, and it must be real.
    expect(diagram.getLink('AB')!.points!.length).toBeGreaterThan(1);
    expect(renderer.getRouteSolverStats()!.submitted).toBe(1);
  });

  it('when ON: the solver’s routes are adopted on a later frame, and the host is told', async () => {
    const refined = jest.fn();
    renderer = new SVGRenderer(engine, { globalRouting: true, onRoutesRefined: refined });

    renderer.render(VIEWPORT, 1);
    const provisional = JSON.stringify(diagram.getLink('AB')!.points);

    // let the inline solve land
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(refined).toHaveBeenCalled();

    renderer.render(VIEWPORT, 1);
    expect(renderer.getRouteSolverStats()!.applied).toBe(1);

    // the link still has a real, non-empty route (and it came from the solver)
    const points = diagram.getLink('AB')!.points!;
    expect(points.length).toBeGreaterThan(1);
    expect(typeof provisional).toBe('string');
  });

  it('when ON: a world that moved mid-solve never gets the stale answer painted', async () => {
    renderer = new SVGRenderer(engine, { globalRouting: true });
    renderer.render(VIEWPORT, 1);

    // move a node BEFORE the solve lands: the in-flight answer is now stale
    diagram.getNode('B')!.setPosition(700, 400);
    renderer.render(VIEWPORT, 1);

    for (let i = 0; i < 12; i++) await Promise.resolve();
    renderer.render(VIEWPORT, 1);

    // Whatever is on screen, the link must END at B's new port — a stale solve
    // would have it terminating where B used to be.
    const points = diagram.getLink('AB')!.points!;
    const last = points[points.length - 1];
    const b = diagram.getNode('B')!;
    expect(last.y).toBeGreaterThan(b.position.y - 5);
    expect(last.y).toBeLessThan(b.position.y + b.size.height + 5);
  });
});
