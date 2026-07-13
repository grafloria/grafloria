// Wave 7 (Auto-layout) — Card 0.
//
// Three claims, each of which was FALSE before this card:
//
//   1. REACHABILITY — you can lay out a diagram. `engine.applyLayout()` required
//      `setLayoutService()`, which nothing ever called, so every call threw and
//      the entire adapter stack (dagre/elk/force/spectral/community) was dead.
//   2. DETERMINISM — same graph + same seed => byte-identical coordinates. Three
//      adapters seeded from `Math.random()`.
//   3. IDEMPOTENCE — laying out twice does not move anything the second time.
//
// Plus the subtle one that a naive "just seed the RNG" fix misses: INPUT ORDER.

import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { LayoutRegistry, fromAdapter } from './layout-registry';
import { createLayoutRng, DEFAULT_LAYOUT_SEED, inStableOrder } from './rng';
import type { LayoutAdapter } from './layout-adapter.interface';

/** A diagram with a deterministic shape but a deliberately jumbled insertion order. */
function buildGraph(engine: DiagramEngine, order: string[]): void {
  const diagram = engine.createDiagram('layout-test')!;
  const nodes = new Map<string, NodeModel>();
  for (const id of order) {
    const n = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
    (n as unknown as { id: string }).id = id;
    n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    diagram.addNode(n);
    nodes.set(id, n);
  }
  // a → b → c, a → c  (a fixed DAG regardless of insertion order)
  const edges: Array<[string, string]> = [['a', 'b'], ['b', 'c'], ['a', 'c']];
  for (const [s, t] of edges) {
    if (nodes.has(s) && nodes.has(t)) {
      const link = new LinkModel(`${s}-out`, `${t}-in`, 'orthogonal');
      (link as unknown as { id: string }).id = `${s}->${t}`;
      diagram.addLink(link);
    }
  }
}

const positionsOf = (engine: DiagramEngine): string =>
  JSON.stringify(
    engine
      .getDiagram()!
      .getNodes()
      .map((n) => [n.id, Math.round(n.position.x * 1000) / 1000, Math.round(n.position.y * 1000) / 1000])
      .sort()
  );

describe('Card 0 — the unified layout API', () => {
  describe('reachability: layout works with NO setup call', () => {
    it('engine.layout() lays the diagram out — the old applyLayout() path always threw', async () => {
      const engine = new DiagramEngine();
      buildGraph(engine, ['a', 'b', 'c']);

      const result = await engine.layout('dagre');

      expect(result.algorithm).toBe('dagre');
      expect(result.nodePositions.size).toBe(3);
      // and the positions were COMMITTED to the model, not just returned
      const moved = engine.getDiagram()!.getNodes().some((n) => n.position.x !== 0 || n.position.y !== 0);
      expect(moved).toBe(true);

      // the legacy path, for contrast: still throws without the setup call that
      // nothing in the codebase ever made.
      await expect(engine.applyLayout({ adapter: 'dagre' })).rejects.toThrow(/LayoutService not initialized/);
      engine.destroy();
    });

    it('every built-in adapter is registered and addressable by name', () => {
      const engine = new DiagramEngine();
      expect(engine.getLayoutRegistry().names()).toEqual(
        ['community', 'dagre', 'elk', 'force', 'layered', 'spectral']
      );
      engine.destroy();
    });

    it('Card 1: engine.layout() with NO name runs the layered default', async () => {
      const engine = new DiagramEngine();
      buildGraph(engine, ['a', 'b', 'c']);
      const result = await engine.layout();
      expect(result.algorithm).toBe('layered');
      engine.destroy();
    });

    it('an unknown name fails LOUDLY, listing what is available', async () => {
      const engine = new DiagramEngine();
      buildGraph(engine, ['a', 'b', 'c']);
      // (no /s flag — it is illegal at this lib's TS target; the same TS1501 that
      // took down 24 suites in wave 1.)
      await expect(engine.layout('nope')).rejects.toThrow(/Unknown layout 'nope'/);
      await expect(engine.layout('nope')).rejects.toThrow(/dagre/);
      engine.destroy();
    });
  });

  describe('determinism: same graph + same seed => byte-identical coordinates', () => {
    it.each(['dagre', 'force', 'spectral', 'community'])(
      '%s is reproducible across runs',
      async (name) => {
        const runOnce = async () => {
          const engine = new DiagramEngine();
          buildGraph(engine, ['a', 'b', 'c']);
          await engine.layout(name, { seed: 42 });
          const out = positionsOf(engine);
          engine.destroy();
          return out;
        };
        expect(await runOnce()).toBe(await runOnce());
      }
    );

    it('THE SUBTLE ONE: insertion order must not change the result', async () => {
      // Same graph, different insertion order. Map iteration follows insertion
      // order, so an authored diagram and the same diagram loaded from JSON fed
      // the algorithm in different orders — and diverged even with a fixed seed.
      // The registry sorts by id before handing the graph over.
      const layoutWith = async (order: string[]) => {
        const engine = new DiagramEngine();
        buildGraph(engine, order);
        await engine.layout('force', { seed: 7 });
        const out = positionsOf(engine);
        engine.destroy();
        return out;
      };
      expect(await layoutWith(['a', 'b', 'c'])).toBe(await layoutWith(['c', 'a', 'b']));
    });

    it('a DIFFERENT seed gives a different layout (the seed is really consulted)', async () => {
      const withSeed = async (seed: number) => {
        const engine = new DiagramEngine();
        buildGraph(engine, ['a', 'b', 'c']);
        await engine.layout('force', { seed, randomize: true } as never);
        const out = positionsOf(engine);
        engine.destroy();
        return out;
      };
      expect(await withSeed(1)).not.toBe(await withSeed(999));
    });

    it('the seed used is REPORTED, so a pleasing random layout can be reproduced', async () => {
      const engine = new DiagramEngine();
      buildGraph(engine, ['a', 'b', 'c']);
      const result = await engine.layout('force');
      expect(result.seed).toBe(DEFAULT_LAYOUT_SEED);
      engine.destroy();
    });
  });

  describe('idempotence', () => {
    it('laying out twice does not move anything the second time', async () => {
      const engine = new DiagramEngine();
      buildGraph(engine, ['a', 'b', 'c']);
      await engine.layout('dagre');
      const first = positionsOf(engine);
      await engine.layout('dagre');
      expect(positionsOf(engine)).toBe(first);
      engine.destroy();
    });
  });

  describe('the registry', () => {
    it('a registered layout can REPLACE a built-in, and the disposer restores it', async () => {
      const engine = new DiagramEngine();
      buildGraph(engine, ['a', 'b', 'c']);

      const dispose = engine.getLayoutRegistry().register({
        name: 'dagre',
        async apply() {
          return {
            nodePositions: new Map([['a', { x: 111, y: 222 }]]),
            bounds: { x: 0, y: 0, width: 0, height: 0 },
          };
        },
      });

      await engine.layout('dagre');
      expect(engine.getDiagram()!.getNode('a')!.position).toEqual({ x: 111, y: 222 });

      // …and disposing RESTORES the built-in rather than deleting the name
      // (the convention every wave-6 registry follows).
      dispose();
      expect(engine.getLayoutRegistry().has('dagre')).toBe(true);
      await engine.layout('dagre');
      expect(engine.getDiagram()!.getNode('a')!.position).not.toEqual({ x: 111, y: 222 });
      engine.destroy();
    });

    it('one vocabulary in: `direction` reaches dagre as `rankdir`', async () => {
      const seen: Array<Record<string, unknown>> = [];
      const spy: LayoutAdapter = {
        name: 'spy',
        async apply(_nodes, _links, options) {
          seen.push(options as Record<string, unknown>);
          return { nodePositions: new Map(), bounds: { x: 0, y: 0, width: 0, height: 0 } };
        },
        async applyIncremental() {
          throw new Error('not used');
        },
        validateOptions: () => true,
      };
      const registry = new LayoutRegistry();
      // named 'dagre' so the translator uses dagre's dialect
      registry.register({ ...fromAdapter({ ...spy, name: 'dagre' }) });

      const engine = new DiagramEngine();
      buildGraph(engine, ['a']);
      registry.get('dagre')!.apply(engine.getDiagram()!, { direction: 'LR', nodeSpacing: 33 });
      expect(seen[0]['rankdir']).toBe('LR');
      expect(seen[0]['nodesep']).toBe(33);
      engine.destroy();
    });
  });
});

describe('Card 0 — the seeded generator', () => {
  it('is reproducible and normalises hostile seeds', () => {
    expect(createLayoutRng(5).next()).toBe(createLayoutRng(5).next());
    // NaN would otherwise poison the state and land every node at the same spot,
    // which reads as "layout didn't run" rather than "bad seed".
    expect(Number.isFinite(createLayoutRng(NaN).next())).toBe(true);
    expect(Number.isFinite(createLayoutRng(0).next())).toBe(true);
    expect(Number.isFinite(createLayoutRng(-3.7).next())).toBe(true);
  });

  it('draws are uniform enough to be usable as layout jitter', () => {
    const rng = createLayoutRng(1);
    const draws = Array.from({ length: 2000 }, () => rng.next());
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
    const mean = draws.reduce((s, v) => s + v, 0) / draws.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
  });

  it('inStableOrder canonicalises the graph regardless of insertion order', () => {
    const items = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    expect(inStableOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    // pure: the input is not mutated
    expect(items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});
