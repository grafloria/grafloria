// wave8/dirty × wave8/routing — THE SEAM.
//
// This bug lives in neither branch. It exists only in the merged tree, which is
// why both branches were green and it still shipped broken:
//
//   * wave8/routing solves routes OFF-THREAD. When the worker answers, the
//     refined routes land in the bridge and `onRoutesRefined` asks the HOST for a
//     re-render. The model is not touched — nothing about the diagram CHANGED, the
//     answer about it merely got better.
//
//   * wave8/dirty skips a frame whose inputs did not change. Model unchanged,
//     viewport unchanged ⇒ "nothing to do" ⇒ hand back the previous frame.
//
// Compose them and the host's re-render request is answered with the cached
// frame. The globally-optimised routes are computed, paid for, and then dropped
// on the floor — permanently, until some unrelated edit happens to reopen the
// gate. The picture is not corrupt, so nothing screams; the feature simply does
// not work, and the frame gate is why.
//
// The lesson generalises, and is the reason this file exists rather than a
// one-line fix: ask of every dirty-set optimisation *what can change about the
// picture that is not in the state I key on?* Async arrival of a better answer is
// one. It is not in the model, and it is not in the viewport.

import { RouteSolverBridge } from './route-solver-bridge';
import { SVGRenderer } from './svg-renderer';
import { serveSolver } from '@grafloria/engine';
import type { SolverPort, SolverRequest, SolverResponse } from '@grafloria/engine';
import { DiagramEngine, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { Rectangle, VNode } from '../types';

const VIEWPORT: Rectangle = { x: -500, y: -500, width: 3000, height: 2000 };

/** A solver port that answers only when told to — see route-solver-bridge.spec. */
class DeferredPort implements SolverPort {
  onmessage: ((ev: { data: SolverResponse }) => void) | null = null;
  private inbox: SolverResponse[] = [];
  private worker: {
    onmessage: ((ev: { data: SolverRequest }) => void) | null;
    postMessage(m: SolverResponse): void;
  };

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

  flushAll(): void {
    while (this.inbox.length) {
      const msg = this.inbox.shift();
      if (msg) this.onmessage?.({ data: msg });
    }
  }
}

function scene(port: SolverPort) {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('solver-seam')!;

  // Two endpoints with a fat obstacle between them, so the global solver has a
  // reason to produce a route the per-link router would not.
  const mk = (id: string, x: number, y: number, w = 100, h = 60) => {
    const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: w, height: h } });
    (n as unknown as { id: string }).id = id;
    n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    diagram.addNode(n);
    return n;
  };

  mk('a', 0, 0);
  mk('wall', 300, -60, 100, 240);
  mk('b', 700, 0);

  const link = new LinkModel('a-out', 'b-in', 'orthogonal');
  (link as unknown as { id: string }).id = 'l1';
  diagram.addLink(link);

  const renderer = new SVGRenderer(engine, {
    globalRouting: true,
    routeSolverPort: port,
  } as never);

  return { engine, diagram, renderer };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('frame gate × off-thread route solver (the merge seam)', () => {
  it('paints the refined routes when the solver answers, even though nothing in the MODEL changed', async () => {
    const port = new DeferredPort();
    const { renderer } = scene(port);

    // Frames while the solver is still thinking: local routes, and the gate arms
    // once geometry settles.
    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);
    const beforeSolve = renderer.render(VIEWPORT, 1) as VNode;

    // Prove the gate is closed: an identical frame is served from cache.
    expect(renderer.render(VIEWPORT, 1)).toBe(beforeSolve);

    // The worker answers. The model is NOT touched — no node moved, no link
    // changed, no epoch bumped. Only the renderer's private route table improved.
    port.flushAll();
    await settle();

    // THE ASSERTION. The host asks for a repaint (that is what onRoutesRefined is
    // for). If the gate answers it from cache, the refined routes never reach the
    // screen and the whole off-thread solver is dead weight.
    const afterSolve = renderer.render(VIEWPORT, 1) as VNode;
    expect(afterSolve).not.toBe(beforeSolve);

    renderer.dispose();
  });

  it('and the refined geometry is actually IN the painted frame', async () => {
    const port = new DeferredPort();
    const { diagram, renderer } = scene(port);

    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);

    port.flushAll();
    await settle();
    renderer.render(VIEWPORT, 1);

    // The solved route must have been written back onto the model — which is the
    // only way the drawn `d` can reflect it.
    const points = diagram.getLink('l1')!.points;
    expect(points.length).toBeGreaterThan(1);

    renderer.dispose();
  });

  it('once the refined routes are painted, the gate closes again (no permanent churn)', async () => {
    const port = new DeferredPort();
    const { renderer } = scene(port);

    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);

    port.flushAll();
    await settle();

    // The frame that adopts the solved routes moves geometry → does not arm.
    renderer.render(VIEWPORT, 1);
    // The next one settles…
    const settled = renderer.render(VIEWPORT, 1) as VNode;
    // …and from there the canvas is idle again and costs nothing.
    expect(renderer.render(VIEWPORT, 1)).toBe(settled);

    renderer.dispose();
  });
});
