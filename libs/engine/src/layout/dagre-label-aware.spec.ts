// Wave 7 — Card 7a. Dagre: label-aware, multigraph-correct, and no longer
// binning the route it computes.
//
// Dagre is the DEFAULT algorithm behind `engine.layout()`, so label reservation
// matters here more than anywhere.

import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

function makeNode(id: string, w = 100, h = 60): NodeModel {
  const node = new NodeModel({ id, type: 'default', position: { x: 0, y: 0 } });
  node.setSize(w, h);
  return node;
}

function link(id: string, from: NodeModel, to: NodeModel): LinkModel {
  const l = new LinkModel(`${id}-sp`, `${id}-tp`);
  (l as any).id = id;
  l.sourceNodeId = from.id;
  l.targetNodeId = to.id;
  return l;
}

describe('Dagre adapter — label-aware layout (Card 7)', () => {
  let adapter: DagreLayoutAdapter;

  beforeEach(() => {
    adapter = new DagreLayoutAdapter();
  });

  it('widens the rank channel to make room for an edge label', async () => {
    const a = makeNode('a');
    const b = makeNode('b');

    const bare = link('l1', a, b);
    const labelled = link('l1', a, b);
    labelled.addLabel({ text: 'a fairly long edge label', position: 0.5 });

    const without = await adapter.apply([a, b], [bare], { rankdir: 'TB' });
    const with_ = await adapter.apply([a, b], [labelled], { rankdir: 'TB' });

    const gap = (r: typeof with_) =>
      r.nodePositions.get('b')!.y - (r.nodePositions.get('a')!.y + a.size.height);

    // Dagre ranks the label as a dummy node, so the channel genuinely grows.
    // That extra room is what the renderer's edge optimizer places the label into.
    expect(gap(with_)).toBeGreaterThan(gap(without));
    expect(with_.metadata!['labelledEdges']).toBe(1);
  });

  it('keeps PARALLEL edges distinct (dagre is not a multigraph by default)', async () => {
    // THE LATENT BUG. `setEdge(a, b)` keys an edge by its endpoints alone, so two
    // links A→B collapsed into ONE and dagre ranked the graph as if the second did
    // not exist — and would have reserved room for one label where two were needed.
    const a = makeNode('a');
    const b = makeNode('b');

    const l1 = link('l1', a, b);
    const l2 = link('l2', a, b);
    l1.addLabel({ text: 'first', position: 0.5 });
    l2.addLabel({ text: 'second', position: 0.5 });

    const result = await adapter.apply([a, b], [l1, l2], { rankdir: 'TB' });

    // Both edges survive as separate routes and both labels are reserved for.
    expect(result.routing!.edgeRoutes.size).toBe(2);
    expect(result.routing!.labelSpace.size).toBe(2);
    expect(result.metadata!['labelledEdges']).toBe(2);
  });

  it('reads back the route dagre computed instead of discarding it', async () => {
    const a = makeNode('a');
    const b = makeNode('b');

    const result = await adapter.apply([a, b], [link('l1', a, b)], { rankdir: 'TB' });

    const route = result.routing!.edgeRoutes.get('l1')!;
    expect(route).toBeDefined();
    expect(route.start.y).toBeLessThan(route.end.y); // TB: flows downward
    expect(result.routing!.orthogonal).toBe(false); // dagre emits a polyline
  });

  it('is a no-op on an unlabelled graph', async () => {
    const a = makeNode('a');
    const b = makeNode('b');
    const links = [link('l1', a, b)];

    const on = await adapter.apply([a, b], links, { rankdir: 'TB' });
    const off = await adapter.apply([a, b], links, { rankdir: 'TB', labelAware: false });

    expect([...on.nodePositions.entries()]).toEqual([...off.nodePositions.entries()]);
    expect(on.routing!.labelSpace.size).toBe(0);
  });
});
