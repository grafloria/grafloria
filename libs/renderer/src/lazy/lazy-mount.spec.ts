// Wave 8 — Card 3: deferred view instantiation, freeze, and the time-sliced mount.
//
// The properties that actually matter, in the order they matter:
//   1. Nothing gets LOST. A deferred entity is mounted late, never never.
//   2. A mount does not re-route what it has already routed (or it is quadratic).
//   3. Freezing drops the view AND its cache entry; the model survives.
//   4. Route replay is abandoned the moment the geometry it assumed moves.

import { DiagramEngine, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import { ProgressiveMounter } from './progressive-mounter';
import { ViewLifecycle } from './view-lifecycle';
import type { EntityKind } from './types';

function scene(nodeCount: number) {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('lazy')!;
  const nodes: NodeModel[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const node = new NodeModel({
      type: 'basic',
      position: { x: i * 200, y: 0 },
      size: { width: 120, height: 60 },
    });
    (node as unknown as { id: string }).id = `n${i}`;
    node.addPort(new PortModel({ id: `n${i}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `n${i}-in`, type: 'input', side: 'left' }));
    diagram.addNode(node);
    nodes.push(node);
  }
  for (let i = 0; i + 1 < nodeCount; i++) {
    const link = new LinkModel(`n${i}-out`, `n${i + 1}-in`, 'orthogonal');
    (link as unknown as { id: string }).id = `l${i}`;
    diagram.addLink(link);
  }
  return { engine, diagram, nodes };
}

/** Every entity id the tree actually drew, by kind. */
function drawn(tree: any): { nodes: Set<string>; links: Set<string> } {
  const nodes = new Set<string>();
  const links = new Set<string>();
  const walk = (v: any) => {
    if (!v || typeof v !== 'object') return;
    const key: string | undefined = v.key;
    if (typeof key === 'string') {
      if (key.startsWith('node-')) nodes.add(key.slice(5));
      if (key.startsWith('link-')) links.add(key.slice(5));
    }
    for (const c of v.children ?? []) walk(c);
  };
  walk(tree);
  return { nodes, links };
}

const VIEWPORT = { x: 0, y: 0, width: 1600, height: 900 };

describe('ViewLifecycle — freeze', () => {
  it('an unfrozen entity is admitted; a frozen one is not', () => {
    const lifecycle = new ViewLifecycle();
    expect(lifecycle.admits('node', 'n1')).toBe(true);

    lifecycle.freeze('node', 'n1');
    expect(lifecycle.admits('node', 'n1')).toBe(false);
    expect(lifecycle.isFrozen('node', 'n1')).toBe(true);

    lifecycle.unfreeze('node', 'n1');
    expect(lifecycle.admits('node', 'n1')).toBe(true);
  });

  it('keys nodes and links separately (an id may be shared)', () => {
    const lifecycle = new ViewLifecycle();
    lifecycle.freeze('node', 'x');
    expect(lifecycle.admits('node', 'x')).toBe(false);
    expect(lifecycle.admits('link', 'x')).toBe(true);
  });

  it('freezing a node stops the renderer from drawing it — the model survives', () => {
    const { engine, diagram } = scene(3);
    const renderer = new SVGRenderer(engine, {});
    const lifecycle = new ViewLifecycle();
    renderer.setViewLifecycle(lifecycle);

    expect(drawn(renderer.render(VIEWPORT, 1)).nodes.has('n1')).toBe(true);

    lifecycle.freeze('node', 'n1');
    expect(drawn(renderer.render(VIEWPORT, 1)).nodes.has('n1')).toBe(false);

    // Still a first-class citizen of the model and of the spatial index.
    expect(diagram.getNode('n1')).toBeTruthy();
    expect(diagram.getVisibleNodes(VIEWPORT).some((n) => n.id === 'n1')).toBe(true);

    lifecycle.unfreeze('node', 'n1');
    expect(drawn(renderer.render(VIEWPORT, 1)).nodes.has('n1')).toBe(true);

    renderer.dispose();
    engine.destroy();
  });

  it('freezing evicts the cached view (a freeze that leaves a VNode behind is a leak)', () => {
    const { engine } = scene(3);
    const renderer = new SVGRenderer(engine, { enableCaching: true });
    const lifecycle = new ViewLifecycle();
    renderer.setViewLifecycle(lifecycle);
    renderer.render(VIEWPORT, 1);

    const cache = (renderer as unknown as { vnodeCache: Map<string, unknown> }).vnodeCache;
    const keysFor = (id: string) =>
      [...cache.keys()].filter((k) => k.startsWith(`node-${id}`)).length;

    expect(keysFor('n1')).toBeGreaterThan(0);
    lifecycle.freeze('node', 'n1');
    expect(keysFor('n1')).toBe(0);

    renderer.dispose();
    engine.destroy();
  });
});

describe('ViewLifecycle — autoFreeze', () => {
  it('drops the view of an entity that leaves the viewport, and rebuilds it on return', () => {
    // 12 nodes on a 200px pitch: a 500px-wide viewport can only ever see a few.
    const { engine } = scene(12);
    const renderer = new SVGRenderer(engine, { enableCaching: true });
    const lifecycle = new ViewLifecycle({ autoFreeze: true });
    renderer.setViewLifecycle(lifecycle);

    const near = { x: 0, y: 0, width: 500, height: 400 };
    const far = { x: 1800, y: 0, width: 500, height: 400 };

    const first = drawn(renderer.render(near, 1));
    expect(first.nodes.has('n0')).toBe(true);
    const retainedNear = lifecycle.retainedCount();

    // Pan away. n0 is off-screen now: its view is dropped, its model is not.
    renderer.render(far, 1);
    const cache = (renderer as unknown as { vnodeCache: Map<string, unknown> }).vnodeCache;
    expect([...cache.keys()].filter((k) => k.startsWith('node-n0')).length).toBe(0);
    expect(engine.getDiagram()!.getNode('n0')).toBeTruthy();

    // The retained set stays bounded by what is ON SCREEN, not by everything the
    // camera has ever passed over. That is the property autoFreeze exists for.
    expect(lifecycle.retainedCount()).toBeLessThanOrEqual(retainedNear * 2);

    // Pan back: the view comes back. Nothing was lost.
    expect(drawn(renderer.render(near, 1)).nodes.has('n0')).toBe(true);

    renderer.dispose();
    engine.destroy();
  });

  it('off by default — the historical behaviour is the default behaviour', () => {
    const lifecycle = new ViewLifecycle();
    expect(lifecycle.isAutoFreeze()).toBe(false);
    lifecycle.retainVisible([['node', 'n0']]);
    expect(lifecycle.retainedCount()).toBe(0); // not even tracked
  });
});

describe('SVGRenderer — the mount gate', () => {
  it('with no lifecycle installed, nothing changes and nothing is deferred', () => {
    const { engine } = scene(4);
    const renderer = new SVGRenderer(engine, {});
    const tree = drawn(renderer.render(VIEWPORT, 1));
    expect(tree.nodes.size).toBe(4);
    expect(renderer.getDeferredEntities()).toEqual([]);
    renderer.dispose();
    engine.destroy();
  });

  it('reports what culling admitted and the gate held back — the mounter’s work queue', () => {
    const { engine } = scene(4);
    const renderer = new SVGRenderer(engine, {});
    const lifecycle = new ViewLifecycle();
    renderer.setViewLifecycle(lifecycle);

    lifecycle.beginDeferred();
    lifecycle.admitAll('node');
    const tree = drawn(renderer.render(VIEWPORT, 1));

    expect(tree.nodes.size).toBe(4); // nodes: admitted wholesale
    expect(tree.links.size).toBe(0); // links: all deferred

    const deferred = renderer.getDeferredEntities();
    expect(deferred.length).toBe(3);
    expect(deferred.every(([kind]) => kind === 'link')).toBe(true);

    renderer.dispose();
    engine.destroy();
  });
});

describe('ProgressiveMounter', () => {
  /** Drive rAF by hand so the test is deterministic, not a race with the browser. */
  function withManualFrames<T>(body: (flush: () => Promise<void>) => Promise<T>): Promise<T> {
    const queue: Array<(t: number) => void> = [];
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
      queue.push(cb);
      return queue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) => {
      queue[handle - 1] = () => undefined;
    }) as typeof globalThis.cancelAnimationFrame;

    const flush = async () => {
      // Run whatever is queued now; a slice queues the next one as it goes.
      for (let guard = 0; guard < 1000 && queue.length > 0; guard++) {
        const cb = queue.shift()!;
        cb(0);
        await Promise.resolve();
      }
    };

    return body(flush).finally(() => {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
    });
  }

  it('mounts EVERYTHING culling admitted — deferred means late, never lost', async () => {
    await withManualFrames(async (flush) => {
      const { engine } = scene(8);
      const renderer = new SVGRenderer(engine, {});
      const lifecycle = new ViewLifecycle();
      renderer.setViewLifecycle(lifecycle);

      let last: unknown = null;
      const mounter = new ProgressiveMounter(
        engine,
        lifecycle,
        (vp, zoom) => {
          last = renderer.render(vp, zoom);
        },
        () => renderer.getDeferredEntities()
      );

      const done = mounter.mount(VIEWPORT, 1, { initialChunk: 2 });

      // The FIRST frame is already on screen, and it has the nodes but no links.
      const firstFrame = drawn(last);
      expect(firstFrame.nodes.size).toBe(8);
      expect(firstFrame.links.size).toBe(0);

      await flush();
      const stats = await done;

      // Everything arrived.
      const final = drawn(last);
      expect(final.nodes.size).toBe(8);
      expect(final.links.size).toBe(7);
      expect(stats.aborted).toBe(false);
      expect(stats.slices).toBeGreaterThan(1);

      // And the gate is handed back, so later frames run the ordinary code path.
      expect(lifecycle.isDeferring()).toBe(false);
      expect(renderer.getDeferredEntities()).toEqual([]);

      renderer.dispose();
      engine.destroy();
    });
  });

  it('does not re-route a link a previous slice already routed', async () => {
    await withManualFrames(async (flush) => {
      const { engine } = scene(10);
      const renderer = new SVGRenderer(engine, {});
      const lifecycle = new ViewLifecycle();
      renderer.setViewLifecycle(lifecycle);

      // Count real routing calls. THE number: without replay this is quadratic in
      // the slice count, and a progressive mount would cost more than the blocking
      // one it replaced.
      const routed: string[] = [];
      const inner = renderer as unknown as {
        computeAutoRoute: (l: LinkModel, e: unknown) => unknown;
      };
      const original = inner.computeAutoRoute.bind(renderer);
      inner.computeAutoRoute = (link: LinkModel, endpoints: unknown) => {
        routed.push(link.id);
        return original(link, endpoints);
      };

      const mounter = new ProgressiveMounter(
        engine,
        lifecycle,
        (vp, zoom) => void renderer.render(vp, zoom),
        () => renderer.getDeferredEntities()
      );

      // One link per slice: the most adversarial schedule for replay.
      await withFlush(mounter.mount(VIEWPORT, 1, { initialChunk: 1, sliceMs: 0.0001 }), flush);

      // 9 links, each routed EXACTLY once across the whole mount.
      const counts = new Map<string, number>();
      for (const id of routed) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect([...counts.keys()].length).toBe(9);
      for (const [, n] of counts) expect(n).toBe(1);

      renderer.dispose();
      engine.destroy();
    });
  });

  it('drops the route seal when the geometry it assumed moves', async () => {
    await withManualFrames(async (flush) => {
      const { engine, diagram } = scene(6);
      const renderer = new SVGRenderer(engine, {});
      const lifecycle = new ViewLifecycle();
      renderer.setViewLifecycle(lifecycle);

      const mounter = new ProgressiveMounter(
        engine,
        lifecycle,
        (vp, zoom) => void renderer.render(vp, zoom),
        () => renderer.getDeferredEntities()
      );

      const done = mounter.mount(VIEWPORT, 1, { initialChunk: 1 });
      await Promise.resolve();

      // A slice admitted l0 and rendered it; sealing it means "its route is on the
      // model, replay it rather than pay for it again".
      lifecycle.admit('link', 'l0');
      lifecycle.sealSlice();
      expect(lifecycle.routeIsSettled('l0')).toBe(true);

      // Now a node moves. Every route computed against it as an obstacle is suspect,
      // so the seal must come off — replaying here would draw a stale path.
      diagram.getNode('n2')!.setPosition(10, 400);
      expect(lifecycle.routeIsSettled('l0')).toBe(false);

      await flush();
      await done;

      renderer.dispose();
      engine.destroy();
    });
  });

  it('cancel() stops the mount and hands the gate back', async () => {
    await withManualFrames(async (flush) => {
      const { engine } = scene(6);
      const renderer = new SVGRenderer(engine, {});
      const lifecycle = new ViewLifecycle();
      renderer.setViewLifecycle(lifecycle);

      const mounter = new ProgressiveMounter(
        engine,
        lifecycle,
        (vp, zoom) => void renderer.render(vp, zoom),
        () => renderer.getDeferredEntities()
      );

      const done = mounter.mount(VIEWPORT, 1, { initialChunk: 1 });
      mounter.cancel();
      await flush();
      const stats = await done;

      expect(stats.aborted).toBe(true);
      expect(lifecycle.isDeferring()).toBe(false);

      // The scene is whole again on the very next ordinary render — a cancelled
      // mount must not leave half a diagram on screen.
      expect(drawn(renderer.render(VIEWPORT, 1)).links.size).toBe(5);

      renderer.dispose();
      engine.destroy();
    });
  });
});

/** Await a mount while pumping the manual rAF queue. */
async function withFlush<T>(promise: Promise<T>, flush: () => Promise<void>): Promise<T> {
  let settled = false;
  const wrapped = promise.finally(() => {
    settled = true;
  });
  for (let i = 0; i < 200 && !settled; i++) {
    await flush();
    await Promise.resolve();
  }
  return wrapped;
}

/** A frozen entity is not admitted even while a mount would otherwise admit it. */
describe('freeze × mount', () => {
  it('an explicit freeze outranks a mount admission', () => {
    const lifecycle = new ViewLifecycle();
    lifecycle.beginDeferred();
    lifecycle.admitAll('node');
    lifecycle.freeze('node', 'n3');

    expect(lifecycle.admits('node', 'n0')).toBe(true);
    expect(lifecycle.admits('node', 'n3')).toBe(false);
  });
});

/** Type-level guard: the gate contract stays structural. */
const _gateShape: (l: ViewLifecycle) => boolean = (l) => l.admits('node' as EntityKind, 'x');
void _gateShape;
