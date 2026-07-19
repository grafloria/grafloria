// Wave 7 (Auto-layout) — Card 3: off-main-thread layout.
//
// The claims, each of which was FALSE before this card (see the audit in
// layout-host.ts and layout.worker.ts):
//
//   1. A layout can run behind a postMessage boundary AT ALL. The old
//      `LayoutWorkerPool` was never instantiated by anything, and pointed at a
//      hardcoded `/assets/workers/layout.worker.js` that no build produces.
//   2. Progress STREAMS to the caller. The old pool declared a `ProgressCallback`
//      type, an `onProgress` option and a `reportProgress` flag — and never once
//      wired a callback into the request it read `request.onProgress` from. Dead
//      end to end.
//   3. Cancellation is COOPERATIVE AND PROMPT, not a flag checked at the end.
//   4. A cancelled run RETURNS ITS WORK. The old pool *rejected* the promise, so
//      200 of 300 completed force iterations went in the bin.
//   5. Worker and inline produce BYTE-IDENTICAL coordinates. This is the single
//      most valuable test here: it is what makes the worker path trustworthy,
//      and it is what stops Card 0's determinism guarantee from quietly dying
//      the moment layout moves off-thread.
//
// The fake port below is deliberately harsher than a real Worker: it delivers
// ASYNCHRONOUSLY (so nothing can accidentally rely on synchronous delivery) and
// it `structuredClone`s every message in both directions (so anything that is
// not actually postMessage-able — a function, a class instance, a Map where an
// array was promised — throws right here instead of in production).

import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import {
  LayoutHost,
  serveLayout,
  type LayoutPort,
  type LayoutRequest,
  type LayoutResponse,
  type LayoutServePort,
  type ServeLayoutDeps,
  type LayoutProgress,
} from './layout-host';
import { serializeGraph, reviveGraph } from './layout-graph';
import { ForceLayoutAdapter } from './force-layout-adapter';
import { DEFAULT_LAYOUT_SEED } from './rng';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildNodes(count: number): { nodes: NodeModel[]; links: LinkModel[] } {
  const nodes: NodeModel[] = [];
  for (let i = 0; i < count; i++) {
    const node = new NodeModel({
      type: 'basic',
      position: { x: i * 10, y: i * 5 },
      size: { width: 100, height: 50 },
    });
    (node as unknown as { id: string }).id = `n${String(i).padStart(2, '0')}`;
    node.addPort(new PortModel({ id: `n${String(i).padStart(2, '0')}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `n${String(i).padStart(2, '0')}-in`, type: 'input', side: 'left' }));
    nodes.push(node);
  }

  const links: LinkModel[] = [];
  for (let i = 1; i < count; i++) {
    const source = nodes[i - 1];
    const target = nodes[i];
    const link = new LinkModel(`${source.id}-out`, `${target.id}-in`);
    (link as unknown as { id: string }).id = `${source.id}->${target.id}`;
    link.sourceNodeId = source.id;
    link.targetNodeId = target.id;
    links.push(link);
  }

  return { nodes, links };
}

const graphOf = (count: number) => {
  const { nodes, links } = buildNodes(count);
  return serializeGraph(nodes, links);
};

/**
 * A fake worker: asynchronous delivery + structured clone in both directions.
 *
 * If a message is not genuinely postMessage-able, `structuredClone` throws here
 * — which is the point. A synchronous loopback would happily pass a function
 * across and we would only find out in a browser.
 */
function createFakeWorker(deps: ServeLayoutDeps = {}): {
  port: LayoutPort;
  requests: LayoutRequest[];
} {
  const requests: LayoutRequest[] = [];

  const hostSide: LayoutPort = { postMessage: () => void 0, onmessage: null };

  const workerSide: LayoutServePort = {
    onmessage: null,
    postMessage: (message: LayoutResponse) => {
      const cloned = structuredClone(message);
      setTimeout(() => hostSide.onmessage?.({ data: cloned }), 0);
    },
  };

  serveLayout(workerSide, deps);

  hostSide.postMessage = (message: LayoutRequest) => {
    requests.push(message);
    const cloned = structuredClone(message);
    setTimeout(() => workerSide.onmessage?.({ data: cloned }), 0);
  };

  return { port: hostSide, requests };
}

/** Coordinates, to the last bit. No rounding — "byte-identical" means it. */
const coords = (positions: Map<string, { x: number; y: number }>): string =>
  JSON.stringify([...positions.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

// ---------------------------------------------------------------------------

describe('Card 3 — worker and inline produce byte-identical coordinates', () => {
  // THE test. Everything else in this card is worthless if this is false: a
  // layout you cannot reproduce off-thread is a layout you cannot move
  // off-thread, and Card 0 just paid for determinism.
  it('force: a worker run and an inline run agree to the last bit', async () => {
    const graph = graphOf(30);

    const { port } = createFakeWorker();
    const viaWorker = await new LayoutHost(port).run('force', graph, {
      seed: DEFAULT_LAYOUT_SEED,
    });
    const inline = await new LayoutHost().run('force', graph, {
      seed: DEFAULT_LAYOUT_SEED,
    });

    expect(coords(viaWorker.nodePositions)).toBe(coords(inline.nodePositions));
    expect(viaWorker.bounds).toEqual(inline.bounds);
    expect(viaWorker.partial).toBe(false);
    expect(inline.partial).toBe(false);
  });

  it('dagre: same', async () => {
    const graph = graphOf(12);

    const { port } = createFakeWorker();
    const viaWorker = await new LayoutHost(port).run('dagre', graph, {});
    const inline = await new LayoutHost().run('dagre', graph, {});

    expect(coords(viaWorker.nodePositions)).toBe(coords(inline.nodePositions));
  });

  it('and a PARTIAL result is byte-identical too — pre-empted at the same iteration', async () => {
    // A time budget is a nondeterministic stopping rule (it asks a clock), so a
    // partial produced by one cannot be compared bit-for-bit. `stopAfterIteration`
    // is the deterministic counterpart, and it is what lets us prove the thing
    // that actually matters: the two paths are running the SAME simulation, and
    // an interrupted worker hands back exactly what an interrupted main thread
    // would have.
    const graph = graphOf(25);

    const { port } = createFakeWorker();
    const viaWorker = await new LayoutHost(port).run(
      'force',
      graph,
      { seed: DEFAULT_LAYOUT_SEED },
      { stopAfterIteration: 40, sliceMs: 0 }
    );
    const inline = await new LayoutHost().run(
      'force',
      graph,
      { seed: DEFAULT_LAYOUT_SEED },
      { stopAfterIteration: 40, sliceMs: 0 }
    );

    expect(viaWorker.iteration).toBe(40);
    expect(inline.iteration).toBe(40);
    expect(viaWorker.partial).toBe(true);
    expect(coords(viaWorker.nodePositions)).toBe(coords(inline.nodePositions));

    // ...and it is genuinely a half-baked layout, not a finished one relabelled.
    const finished = await new LayoutHost().run('force', graph, {
      seed: DEFAULT_LAYOUT_SEED,
    });
    expect(coords(viaWorker.nodePositions)).not.toBe(coords(finished.nodePositions));
  });
});

describe('Card 3 — cancellation is cooperative, prompt, and keeps the work', () => {
  it('a cancelled force run returns the BEST-SO-FAR layout, flagged partial', async () => {
    const { port } = createFakeWorker();
    const host = new LayoutHost(port);
    const controller = new AbortController();

    const running = host.run(
      'force',
      graphOf(40),
      { seed: DEFAULT_LAYOUT_SEED, iterations: 300 },
      { signal: controller.signal, sliceMs: 0 }
    );

    controller.abort();
    const result = await running;

    expect(result.partial).toBe(true);
    expect(result.reason).toBe('cancelled');

    // The whole point: the work is HANDED BACK, not binned. Every node has a
    // position, and the run stopped early rather than quietly finishing.
    expect(result.nodePositions.size).toBe(40);
    expect(result.iteration).toBeLessThan(result.totalIterations);
    for (const position of result.nodePositions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });

  it('PROMPT: it stops within a few iterations, not at the end', async () => {
    // The failure this guards against is an algorithm that "supports
    // cancellation" by checking a flag once, after the loop. That would still
    // report partial=true — and would still have burned all 300 iterations.
    const { port } = createFakeWorker();
    const controller = new AbortController();

    const running = new LayoutHost(port).run(
      'force',
      graphOf(30),
      { seed: DEFAULT_LAYOUT_SEED, iterations: 300 },
      { signal: controller.signal, sliceMs: 0 }
    );
    controller.abort();

    const result = await running;
    expect(result.iteration).toBeLessThan(50); // nowhere near the 300 it was asked for
  });

  it('an ALREADY-aborted signal costs zero iterations', async () => {
    // Deterministic, so it can be asserted exactly: the cancel is posted before
    // the run is, message order is preserved, and the server sees itself
    // cancelled before it does any work at all.
    const controller = new AbortController();
    controller.abort();

    const { port } = createFakeWorker();
    const result = await new LayoutHost(port).run(
      'force',
      graphOf(10),
      { seed: DEFAULT_LAYOUT_SEED },
      { signal: controller.signal }
    );

    expect(result.partial).toBe(true);
    expect(result.reason).toBe('cancelled');
    expect(result.iteration).toBe(0);
  });

  it('a non-steppable algorithm (dagre) cancelled before it starts returns the graph unchanged', async () => {
    // Honest about its limits: dagre is one call into third-party code and there
    // is no way to interrupt it half-way. It can still be cancelled BEFORE it
    // starts, and it still runs off the main thread — which is the actual win.
    const controller = new AbortController();
    controller.abort();

    const graph = graphOf(6);
    const { port } = createFakeWorker();
    const result = await new LayoutHost(port).run(
      'dagre',
      graph,
      {},
      { signal: controller.signal }
    );

    expect(result.partial).toBe(true);
    expect(result.reason).toBe('cancelled');
    for (const node of graph.nodes) {
      expect(result.nodePositions.get(node.id)).toEqual(node.position);
    }
  });
});

describe('Card 3 — time budgets', () => {
  it('a zero budget returns immediately with a partial, flagged timeout', async () => {
    // Deterministic by construction (elapsed >= 0 is always true), so this test
    // asserts on BEHAVIOUR and cannot flake on a loaded CI box — no wall-clock
    // threshold to race.
    const { port } = createFakeWorker();
    const result = await new LayoutHost(port).run(
      'force',
      graphOf(20),
      { seed: DEFAULT_LAYOUT_SEED },
      { timeBudgetMs: 0 }
    );

    expect(result.partial).toBe(true);
    expect(result.reason).toBe('timeout');
    expect(result.iteration).toBe(0);
    expect(result.nodePositions.size).toBe(20);
  });

  it('a budget that expires MID-RUN keeps the iterations it managed', async () => {
    // The clock is injected, so "time" advances by fiat: 1ms per reading. The
    // budget therefore bites at a known iteration and the test is exact rather
    // than hopeful.
    let fakeTime = 0;
    const { port } = createFakeWorker({ now: () => fakeTime++ });

    const result = await new LayoutHost(port).run(
      'force',
      graphOf(15),
      { seed: DEFAULT_LAYOUT_SEED, iterations: 300 },
      { timeBudgetMs: 40, sliceMs: 1000 }
    );

    expect(result.reason).toBe('timeout');
    expect(result.partial).toBe(true);
    expect(result.iteration).toBeGreaterThan(0);
    expect(result.iteration).toBeLessThan(300);
  });

  it('a generous budget does not fire, and the result is NOT partial', async () => {
    const { port } = createFakeWorker();
    const result = await new LayoutHost(port).run(
      'force',
      graphOf(20),
      { seed: DEFAULT_LAYOUT_SEED, iterations: 50 },
      { timeBudgetMs: 60_000 }
    );

    expect(result.partial).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

describe('Card 3 — streaming progress', () => {
  it('progress reaches the caller, monotonically, and ends at 1', async () => {
    // The regression guard for the deadest code in the old stack: the pool
    // declared ProgressCallback / onProgress / reportProgress, and then read
    // `request.onProgress` from a request it never put an onProgress into.
    const { port } = createFakeWorker();
    const seen: LayoutProgress[] = [];

    await new LayoutHost(port).run(
      'force',
      graphOf(20),
      { seed: DEFAULT_LAYOUT_SEED, iterations: 60 },
      { onProgress: (p) => seen.push(p), sliceMs: 0 }
    );

    expect(seen.length).toBeGreaterThan(2);
    expect(seen[0].progress).toBe(0);
    expect(seen[seen.length - 1].progress).toBe(1);

    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].progress).toBeGreaterThanOrEqual(seen[i - 1].progress);
      expect(seen[i].iteration).toBeGreaterThanOrEqual(seen[i - 1].iteration);
    }
    expect(seen.every((p) => p.progress >= 0 && p.progress <= 1)).toBe(true);
  });

  it('progress reports the REAL iteration count, not the worker\'s own bookkeeping', async () => {
    // The old worker posted 0/10/30/90 at fixed points in its own setup — numbers
    // that had nothing to do with how far the algorithm had actually got.
    const { port } = createFakeWorker();
    const seen: LayoutProgress[] = [];

    const result = await new LayoutHost(port).run(
      'force',
      graphOf(15),
      { seed: DEFAULT_LAYOUT_SEED, iterations: 40 },
      { onProgress: (p) => seen.push(p), sliceMs: 0 }
    );

    const mid = seen.filter((p) => p.phase === 'iterating');
    expect(mid.length).toBeGreaterThan(0);
    for (const p of mid) {
      expect(p.totalIterations).toBe(40);
      expect(p.progress).toBeCloseTo(p.iteration / 40, 10);
    }
    expect(result.iteration).toBeLessThanOrEqual(40);
  });
});

describe('Card 3 — the protocol is genuinely postMessage-able', () => {
  it('a callback passed in options never reaches the wire', async () => {
    // Callers hand `engine.layout()` ONE options bag, and it is entirely
    // reasonable for it to carry a callback. Posting one to a real Worker throws
    // DataCloneError — a crash that appears only once someone turns the worker
    // on. The fake port structured-clones every request, so if the strip at the
    // seam ever regresses, this test throws rather than a user's browser.
    const { port, requests } = createFakeWorker();

    const result = await new LayoutHost(port).run('force', graphOf(8), {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSomething: (() => undefined) as any,
    });

    expect(result.nodePositions.size).toBe(8);
    const run = requests.find((r) => r.kind === 'run');
    expect(run && 'options' in run && 'onSomething' in run.options).toBe(false);
  });

  it('an unknown algorithm fails loudly through the port', async () => {
    const { port } = createFakeWorker();
    await expect(
      new LayoutHost(port).run('no-such-layout', graphOf(3), {})
    ).rejects.toThrow(/Unknown layout/);
  });

  it('concurrent runs on one port do not cross their wires', async () => {
    const { port } = createFakeWorker();
    const host = new LayoutHost(port);

    const [a, b] = await Promise.all([
      host.run('force', graphOf(10), { seed: 1, iterations: 20 }),
      host.run('force', graphOf(10), { seed: 999, iterations: 20 }),
    ]);

    // Different seeds, so different pictures — if the seq routing were broken
    // these would be equal (both resolved from whichever result landed last).
    expect(coords(a.nodePositions)).not.toBe(coords(b.nodePositions));
  });
});

describe('Card 3 — the wire graph', () => {
  it('revives ports with their ids intact, so links still point at something', () => {
    // NodeModel's constructor auto-creates four default ports with FRESH ids. A
    // naive revive therefore hands the algorithm a node whose ports no longer
    // match the sourcePortId/targetPortId on the links aimed at it — referential
    // integrity broken in silence, and port-aware layout quietly wrong.
    const { nodes, links } = buildNodes(3);
    const revived = reviveGraph(serializeGraph(nodes, links));

    for (let i = 0; i < nodes.length; i++) {
      const original = nodes[i].getPorts().map((p) => p.id).sort();
      const copy = revived.nodes[i].getPorts().map((p) => p.id).sort();
      expect(copy).toEqual(original);
    }

    const portIds = new Set(revived.nodes.flatMap((n) => n.getPorts().map((p) => p.id)));
    for (const link of revived.links) {
      expect(portIds.has(link.sourcePortId)).toBe(true);
      expect(portIds.has(link.targetPortId)).toBe(true);
    }
  });

  it('is emitted in canonical id order regardless of insertion order', () => {
    const { nodes, links } = buildNodes(5);
    const forwards = serializeGraph(nodes, links);
    const backwards = serializeGraph([...nodes].reverse(), [...links].reverse());
    expect(forwards).toEqual(backwards);
  });

  it('carries geometry and topology — and survives structuredClone', () => {
    const { nodes, links } = buildNodes(4);
    const graph = serializeGraph(nodes, links);

    expect(() => structuredClone(graph)).not.toThrow();
    expect(graph.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(graph.nodes[0].size).toEqual({ width: 100, height: 50 });
    expect(graph.links[0].sourceNodeId).toBe('n00');
  });
});

describe('Card 3 — the steppable run', () => {
  it('snapshot() is valid after ZERO steps — the empty partial is still an answer', () => {
    const { nodes, links } = buildNodes(6);
    const run = new ForceLayoutAdapter().createRun(nodes, links, {
      seed: DEFAULT_LAYOUT_SEED,
    });

    const snapshot = run.snapshot();
    expect(snapshot.nodePositions.size).toBe(6);
    expect(run.iteration).toBe(0);
  });

  it('driving the run by hand equals calling apply() — one implementation, not two', async () => {
    // The refactor's load-bearing property. If `apply()` and `createRun()` ever
    // became separate copies of the physics, the worker and the main thread
    // would drift and the determinism test above would start lying.
    const a = buildNodes(12);
    const b = buildNodes(12);

    const run = new ForceLayoutAdapter().createRun(a.nodes, a.links, {
      seed: DEFAULT_LAYOUT_SEED,
    });
    while (run.step()) {
      /* to convergence */
    }
    const stepped = run.snapshot();

    const applied = await new ForceLayoutAdapter().apply(b.nodes, b.links, {
      seed: DEFAULT_LAYOUT_SEED,
    });

    expect(coords(stepped.nodePositions)).toBe(coords(applied.nodePositions));
  });
});

describe('Card 3 — engine.layout() composes with it (no second entry point)', () => {
  function engineWith(count: number): DiagramEngine {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('worker-layout')!;
    const { nodes, links } = buildNodes(count);
    nodes.forEach((n) => diagram.addNode(n));
    links.forEach((l) => diagram.addLink(l));
    return engine;
  }

  it('a cancelled engine.layout() COMMITS the partial positions to the diagram', async () => {
    // Partial results are not just "honest", they are usable: they land on the
    // real nodes via setPosition(), so the spatial index and the routing
    // obstacle map see them. A cancelled layout leaves a coherent picture, not a
    // half-updated one.
    const engine = engineWith(25);
    const controller = new AbortController();

    const running = engine.layout('force', {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 300,
      signal: controller.signal,
      sliceMs: 0,
    });
    controller.abort();

    const result = await running;
    expect(result.partial).toBe(true);
    expect(result.reason).toBe('cancelled');

    for (const [id, position] of result.nodePositions) {
      const node = engine.getDiagram()!.getNode(id)!;
      expect(node.position.x).toBe(position.x);
      expect(node.position.y).toBe(position.y);
    }
  });

  it('streams progress and reports the seed, through the engine API', async () => {
    const engine = engineWith(15);
    const seen: number[] = [];

    const result = await engine.layout('force', {
      seed: 4242,
      iterations: 50,
      sliceMs: 0,
      onProgress: (p) => seen.push(p.progress),
    });

    expect(result.seed).toBe(4242);
    expect(result.partial).toBe(false);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('attaching a worker port changes nothing about the answer', async () => {
    // The composition claim, end to end: the SAME engine call, once inline and
    // once through a port, lands the same coordinates on the same diagram.
    const inlineEngine = engineWith(20);
    const workerEngine = engineWith(20);

    const { port } = createFakeWorker();
    workerEngine.setLayoutPort(port);

    const inline = await inlineEngine.layout('force', { seed: 7, iterations: 80 });
    const viaWorker = await workerEngine.layout('force', { seed: 7, iterations: 80 });

    expect(coords(viaWorker.nodePositions)).toBe(coords(inline.nodePositions));

    const positionsOf = (engine: DiagramEngine) =>
      JSON.stringify(engine.getDiagram()!.getNodes().map((n) => [n.id, n.position.x, n.position.y]).sort());
    expect(positionsOf(workerEngine)).toBe(positionsOf(inlineEngine));
  });

  it('a time budget through the engine API yields a partial, and it still commits', async () => {
    const engine = engineWith(20);
    const before = engine.getDiagram()!.getNodes().map((n) => ({ ...n.position }));

    const result = await engine.layout('force', {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 300,
      timeBudgetMs: 0,
    });

    expect(result.partial).toBe(true);
    expect(result.reason).toBe('timeout');

    // Zero iterations, but the seeded RANDOMISED start positions are still an
    // answer, and they are committed — the diagram moved.
    const after = engine.getDiagram()!.getNodes().map((n) => ({ ...n.position }));
    expect(after).not.toEqual(before);
  });

  it('calculateQuality survives the worker path (options are not silently dropped)', async () => {
    // "Config declared but never consumed" is the bug shape this codebase keeps
    // producing. An option that works inline and vanishes off-thread is the same
    // bug wearing a hat.
    const engine = engineWith(10);
    engine.setLayoutPort(createFakeWorker().port);

    const result = await engine.layout('force', {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 30,
      calculateQuality: true,
    });

    expect(result.quality).toBeDefined();
    expect(typeof result.quality!.overallScore).toBe('number');
    expect(result.quality!.metrics.nodeOverlap).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// wave10/gallery — the steppable path skipped the overlap pass.
// ---------------------------------------------------------------------------
//
// Found by demos/layout/auto-layout.html, in a real browser, within a minute of
// the gallery first driving `engine.layout()` through the PUBLIC entry point:
// force came back with fifteen pairs of intersecting node boxes.
//
// The mechanism, and why nothing here caught it: the overlap pass lived inside
// `layoutWithComponentPacking`, which is reached from `adapter.apply()`. The host's
// steppable branch does NOT call `apply()` — it drives createRun()/step()/snapshot()
// so the run can stream progress and be cancelled — and it returned `snapshot()`
// raw. Force is the only steppable built-in, and force is the ONLY algorithm that
// genuinely needs the pass (it lays out dimensionless points). So the one algorithm
// that needed it took the one path that skipped it, and every existing test reached
// force through apply().
describe('wave10 — the steppable path separates overlapping boxes (regression)', () => {
  /** Node boxes that intersect. A layout that returns any of these is not a layout. */
  function overlappingPairs(engine: DiagramEngine): string[] {
    const nodes = engine.getDiagram()!.getNodes();
    const hits: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (
          a.position.x < b.position.x + b.size.width &&
          b.position.x < a.position.x + a.size.width &&
          a.position.y < b.position.y + b.size.height &&
          b.position.y < a.position.y + a.size.height
        ) {
          hits.push(`${a.id}x${b.id}`);
        }
      }
    }
    return hits;
  }

  function engineWith(count: number): DiagramEngine {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('overlap')!;
    const { nodes, links } = buildNodes(count);
    nodes.forEach((n) => diagram.addNode(n));
    links.forEach((l) => diagram.addLink(l));
    return engine;
  }

  it('engine.layout("force") leaves NO two node boxes intersecting', async () => {
    const engine = engineWith(12);
    await engine.layout('force', { seed: DEFAULT_LAYOUT_SEED, iterations: 120 });
    expect(overlappingPairs(engine)).toEqual([]);
  });

  it('…and a CANCELLED force run still leaves a coherent picture, not a pile', async () => {
    // The partial result is committed to the diagram (see the cancellation test
    // above). "Usable partial" has to mean usable: separated boxes, not a stack.
    const engine = engineWith(12);
    const controller = new AbortController();

    const running = engine.layout('force', {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 300,
      signal: controller.signal,
      sliceMs: 0,
    });
    controller.abort();

    const result = await running;
    expect(result.partial).toBe(true);
    expect(overlappingPairs(engine)).toEqual([]);
  });

  it('the worker path separates them identically — one rule, both threads', async () => {
    const inline = engineWith(12);
    const viaWorker = engineWith(12);
    viaWorker.setLayoutPort(createFakeWorker().port);

    const a = await inline.layout('force', { seed: 9, iterations: 90 });
    const b = await viaWorker.layout('force', { seed: 9, iterations: 90 });

    expect(coords(b.nodePositions)).toBe(coords(a.nodePositions));
    expect(overlappingPairs(viaWorker)).toEqual([]);
  });

  it('`removeOverlaps: false` still hands back the simulation\'s raw output', async () => {
    // The escape hatch has to survive the fix, or "opt out for the algorithm's raw
    // output" becomes a lie on the one algorithm anybody would want it for.
    //
    // wave layout-cigar: the old proxy here — "raw output must contain
    // overlapping boxes" — died with the fix, because the physics is now
    // size-aware (box-gap repulsion, box-density initialisation) and its raw
    // equilibrium simply has no overlaps to show. So assert the contract
    // DIRECTLY: with the hatch thrown, the engine's answer is byte-identical
    // to the adapter's own raw run — no host overlap pass, no snapshot-time
    // cleanup, nothing touched the simulation's answer.
    const engine = engineWith(12);
    await engine.layout('force', {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 120,
      removeOverlaps: false,
    });

    const { nodes, links } = buildNodes(12);
    const run = new ForceLayoutAdapter().createRun(nodes, links, {
      seed: DEFAULT_LAYOUT_SEED,
      iterations: 120,
      removeOverlaps: false,
    });
    while (run.step()) {
      // drive to the same stopping point the host reached
    }
    const raw = run.snapshot();

    for (const node of engine.getDiagram()!.getNodes()) {
      expect(node.position).toEqual(raw.nodePositions.get(node.id));
    }
  });

  it('reports bounds that actually CONTAIN the separated boxes', async () => {
    // The pass MOVES boxes, so a `bounds` computed before it is stale — and a host
    // that fits the camera to it would clip the diagram it just laid out.
    const engine = engineWith(12);
    const result = await engine.layout('force', { seed: DEFAULT_LAYOUT_SEED, iterations: 120 });

    for (const node of engine.getDiagram()!.getNodes()) {
      expect(node.position.x).toBeGreaterThanOrEqual(result.bounds.x);
      expect(node.position.y).toBeGreaterThanOrEqual(result.bounds.y);
      expect(node.position.x + node.size.width).toBeLessThanOrEqual(
        result.bounds.x + result.bounds.width + 0.001
      );
      expect(node.position.y + node.size.height).toBeLessThanOrEqual(
        result.bounds.y + result.bounds.height + 0.001
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Progress emission is THROTTLED, independent of sliceMs.
//
// Found live: the steppable loop coupled progress EMISSION to the YIELD cadence
// at each slice boundary. With sliceMs:0 (maximal preemptibility) that emitted
// one postMessage per iteration — ~4000 messages for a 4000-iteration run —
// flooding the caller's event loop so badly that a setTimeout-based abort fired
// AFTER the run completed: signal cancellation raced, machine-speed dependent.
// The yield cadence is the cancellation contract and must stay per-slice; only
// the emission needed decoupling (≥16ms apart OR ≥10% progress, plus a final
// event so progress always reaches its true end value).
// ---------------------------------------------------------------------------
describe('progress throttling — sliceMs:0 must not flood the caller', () => {
  it('emits a bounded, monotonic stream that still reaches exactly 1', async () => {
    const graph = graphOf(30);
    const { port } = createFakeWorker();
    const progress: LayoutProgress[] = [];
    const t0 = Date.now();
    const result = await new LayoutHost(port).run(
      'force',
      graph,
      { seed: DEFAULT_LAYOUT_SEED, iterations: 600, threshold: 0 },
      { sliceMs: 0, onProgress: (p: LayoutProgress) => progress.push(p) }
    );
    const elapsed = Date.now() - t0;

    // The stream contract the off-thread demo asserts, preserved verbatim:
    expect(progress.length).toBeGreaterThan(2);
    const values = progress.map((p) => p.progress);
    expect([...values].sort((a, b) => a - b)).toEqual(values); // monotonic
    expect(values[values.length - 1]).toBe(1); // reaches exactly 1
    expect(result.partial).toBe(false);

    // THE THROTTLE: bounded by wall-clock/16ms + 10%-progress steps + start/final
    // — never by iteration count. Pre-fix this was ~600 (one per iteration).
    const bound = Math.ceil(elapsed / 16) + 10 + 3;
    expect(progress.length).toBeLessThanOrEqual(bound);
    expect(progress.length).toBeLessThan(600 / 4);
  });
});
