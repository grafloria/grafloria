// Wave 7 (Auto-layout) — Card 3: the LIVE proof.
//
// Every unit test in layout-host.spec.ts talks to a *fake* port. A fake port is a
// good test — the one here structured-clones both directions, so it is stricter
// than a browser in some ways — but it is not the thing itself. The stack this
// card replaced was 750 lines of worker code that passed its tests and had never,
// not once, been run in a real Worker. Repeating that would be unforgivable.
//
// So this harness constructs an ACTUAL `new Worker()` in an ACTUAL browser, hands
// its port to an ACTUAL DiagramEngine, and checks the things that only break for
// real:
//
//   • structured clone is enforced by the browser, not by us — anything
//     unclonable in the protocol throws DataCloneError here and nowhere else;
//   • `self` really is the worker global, and `serveLayout(self)` really does
//     receive messages through it;
//   • the MessageChannel yield really does let a `cancel` land mid-run inside a
//     worker whose thread is otherwise busy in a simulation loop;
//   • and the coordinates really are byte-identical to the main thread's.

import { DiagramEngine, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { LayoutPort, LayoutProgress } from '@grafloria/engine';

declare const window: any;

function buildEngine(count: number): DiagramEngine {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('worker-live')!;

  const nodes: NodeModel[] = [];
  for (let i = 0; i < count; i++) {
    const id = `n${String(i).padStart(2, '0')}`;
    const node = new NodeModel({
      type: 'basic',
      position: { x: i * 12, y: i * 7 },
      size: { width: 100, height: 50 },
    });
    (node as unknown as { id: string }).id = id;
    node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    diagram.addNode(node);
    nodes.push(node);
  }

  for (let i = 1; i < count; i++) {
    const link = new LinkModel(`${nodes[i - 1].id}-out`, `${nodes[i].id}-in`);
    (link as unknown as { id: string }).id = `${nodes[i - 1].id}->${nodes[i].id}`;
    diagram.addLink(link);
  }

  return engine;
}

const coords = (engine: DiagramEngine): string =>
  JSON.stringify(
    engine
      .getDiagram()!
      .getNodes()
      .map((n) => [n.id, n.position.x, n.position.y])
      .sort()
  );

/** Spin up a REAL Worker from the bundled worker script. */
function spawnWorker(): Worker {
  const source: string = window.__LAYOUT_WORKER_SOURCE__;
  const blob = new Blob([source], { type: 'text/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

window.__runWorkerLayout = async () => {
  const results: Array<{ name: string; pass: boolean; detail: string }> = [];
  const check = (name: string, pass: boolean, detail = '') =>
    results.push({ name, pass, detail });

  // ---------------------------------------------------------------------
  // 1. THE claim: a real Worker gives byte-identical coordinates.
  // ---------------------------------------------------------------------
  {
    const inlineEngine = buildEngine(40);
    const workerEngine = buildEngine(40);

    const worker = spawnWorker();
    workerEngine.setLayoutPort(worker as unknown as LayoutPort);

    const inline = await inlineEngine.layout('force', { seed: 0x5eed, iterations: 200 });
    const viaWorker = await workerEngine.layout('force', { seed: 0x5eed, iterations: 200 });

    check(
      'force: real Worker coordinates are byte-identical to inline',
      coords(workerEngine) === coords(inlineEngine),
      `worker=${coords(workerEngine).slice(0, 60)}… inline=${coords(inlineEngine).slice(0, 60)}…`
    );
    check(
      'force: neither run is partial',
      viaWorker.partial === false && inline.partial === false,
      `worker.partial=${viaWorker.partial} inline.partial=${inline.partial}`
    );
    check(
      'force: the worker really ran the iterations',
      viaWorker.iteration > 0 && viaWorker.iteration === inline.iteration,
      `worker=${viaWorker.iteration} inline=${inline.iteration}`
    );

    worker.terminate();
  }

  // ---------------------------------------------------------------------
  // 2. dagre through a real Worker (the opaque, non-steppable path).
  // ---------------------------------------------------------------------
  {
    const inlineEngine = buildEngine(15);
    const workerEngine = buildEngine(15);

    const worker = spawnWorker();
    workerEngine.setLayoutPort(worker as unknown as LayoutPort);

    await inlineEngine.layout('dagre', { direction: 'LR' });
    await workerEngine.layout('dagre', { direction: 'LR' });

    check(
      'dagre: real Worker coordinates are byte-identical to inline',
      coords(workerEngine) === coords(inlineEngine)
    );
    worker.terminate();
  }

  // ---------------------------------------------------------------------
  // 3. Progress really streams OUT of a real worker thread.
  // ---------------------------------------------------------------------
  {
    const engine = buildEngine(30);
    const worker = spawnWorker();
    engine.setLayoutPort(worker as unknown as LayoutPort);

    const seen: LayoutProgress[] = [];
    const result = await engine.layout('force', {
      seed: 0x5eed,
      iterations: 300,
      sliceMs: 0,
      onProgress: (p: LayoutProgress) => seen.push(p),
    });

    let monotonic = true;
    for (let i = 1; i < seen.length; i++) {
      if (seen[i].progress < seen[i - 1].progress) monotonic = false;
    }

    check('progress: streams from the worker thread', seen.length > 2, `${seen.length} events`);
    check('progress: monotonic and terminal', monotonic && seen[seen.length - 1]?.progress === 1);
    check('progress: run completed', result.partial === false);

    worker.terminate();
  }

  // ---------------------------------------------------------------------
  // 4. Cancellation lands MID-RUN in a real worker — the trap.
  //
  // This is the assertion the old stack could never have passed. A worker
  // busy in a synchronous simulation loop is not reading its message queue,
  // so the `cancel` cannot be delivered at all until the loop is over. Only
  // because the run yields the thread every slice does this work.
  // ---------------------------------------------------------------------
  {
    const engine = buildEngine(60);
    const worker = spawnWorker();
    engine.setLayoutPort(worker as unknown as LayoutPort);

    // WARM THE WORKER FIRST. Without this the abort lands while the worker is
    // still booting (a multi-megabyte bundle takes a moment), the cancel sits in
    // the queue, and the run stops at iteration 1 — which passes the assertion
    // for entirely the wrong reason. We want to interrupt a simulation that is
    // genuinely under way.
    await engine.layout('force', { seed: 1, iterations: 5 });

    const controller = new AbortController();
    const running = engine.layout('force', {
      seed: 0x5eed,
      iterations: 3000,
      // Force converges (and stops) at ~143 iterations on this graph, long
      // before anything could interrupt it. threshold: 0 keeps it working, so
      // there is actually a run in progress to cancel.
      threshold: 0,
      sliceMs: 0,
      signal: controller.signal,
    });

    // Let the worker get properly under way, then interrupt it.
    await new Promise((r) => setTimeout(r, 40));
    controller.abort();

    const result = await running;

    check('cancel: a real worker stops mid-run', result.partial === true, `reason=${result.reason}`);
    check(
      'cancel: it had done REAL work before being interrupted',
      result.iteration > 5,
      `${result.iteration} iterations completed`
    );
    check('cancel: reason is cancelled', result.reason === 'cancelled');
    check(
      'cancel: it stopped EARLY, not at the end',
      result.iteration > 0 && result.iteration < 3000,
      `${result.iteration}/3000 iterations`
    );
    check(
      'cancel: the partial layout was COMMITTED to the diagram',
      engine
        .getDiagram()!
        .getNodes()
        .every((n) => {
          const p = result.nodePositions.get(n.id)!;
          return n.position.x === p.x && n.position.y === p.y;
        })
    );
    check(
      'cancel: every node has a finite position (a usable picture)',
      engine
        .getDiagram()!
        .getNodes()
        .every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))
    );

    worker.terminate();
  }

  // ---------------------------------------------------------------------
  // 5. A time budget really fires inside the worker.
  // ---------------------------------------------------------------------
  {
    const engine = buildEngine(50);
    const worker = spawnWorker();
    engine.setLayoutPort(worker as unknown as LayoutPort);

    const result = await engine.layout('force', {
      seed: 0x5eed,
      iterations: 5000,
      threshold: 0, // do not converge early — we are testing the BUDGET, not convergence
      timeBudgetMs: 25,
      sliceMs: 0,
    });

    check('budget: fired inside the worker', result.partial === true, `reason=${result.reason}`);
    check('budget: reason is timeout', result.reason === 'timeout');
    check(
      'budget: it did real work before giving up',
      result.iteration > 0 && result.iteration < 5000,
      `${result.iteration}/5000 iterations`
    );

    worker.terminate();
  }

  // ---------------------------------------------------------------------
  // 6. The main thread STAYS RESPONSIVE while the worker computes.
  //
  // The entire point of the card. We tick a counter on a 5ms interval on the
  // main thread while a big layout runs in the worker; if layout were running
  // inline, the loop would be starved and the counter would barely move.
  // ---------------------------------------------------------------------
  {
    const engine = buildEngine(120);
    const worker = spawnWorker();
    engine.setLayoutPort(worker as unknown as LayoutPort);

    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    await engine.layout('force', { seed: 0x5eed, iterations: 600, useBarnesHut: false });
    clearInterval(timer);

    const workerTicks = ticks;

    // Same work, same thread as the caller.
    const inlineEngine = buildEngine(120);
    let inlineTicks = 0;
    const inlineTimer = setInterval(() => inlineTicks++, 5);
    await inlineEngine.layout('force', { seed: 0x5eed, iterations: 600, useBarnesHut: false });
    clearInterval(inlineTimer);

    check(
      'responsiveness: the main thread keeps ticking during a worker layout',
      workerTicks > inlineTicks,
      `worker-run ticks=${workerTicks} vs inline-run ticks=${inlineTicks}`
    );

    worker.terminate();
  }

  return results;
};
