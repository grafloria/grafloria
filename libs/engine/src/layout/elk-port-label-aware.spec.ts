// Wave 7 — Card 7a. ELK, port- and label-aware.
//
// The audit's headline finding: ELK's port and edge-routing output was being
// DISCARDED — the adapter read back child.x/child.y and nothing else. It was
// worse than that. ELK was never SENT any ports at all (children were bare
// {id,width,height} boxes, edges were node-to-node), so it could not have done
// port-aware layout even if we had read the answer. These tests pin both halves:
// what goes IN, and what comes back OUT.

import { ELKLayoutAdapter } from './elk-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';

function makeNode(id: string, w = 100, h = 60): NodeModel {
  const node = new NodeModel({ id, type: 'default', position: { x: 0, y: 0 } });
  node.setSize(w, h);
  return node;
}

function declarePort(
  node: NodeModel,
  id: string,
  side: 'left' | 'right' | 'top' | 'bottom',
  type: 'input' | 'output' | 'bi' = 'output'
): PortModel {
  const port = new PortModel({ id, type, side });
  port.nodeId = node.id;
  node.addPort(port);
  return port;
}

function link(id: string, from: NodeModel, to: NodeModel, fromPort = '', toPort = ''): LinkModel {
  const l = new LinkModel(fromPort, toPort);
  (l as any).id = id;
  l.sourceNodeId = from.id;
  l.targetNodeId = to.id;
  return l;
}

describe('ELK adapter — port-aware layout (Card 7)', () => {
  let adapter: ELKLayoutAdapter;

  beforeEach(() => {
    adapter = new ELKLayoutAdapter();
  });

  it('respects a declared port side: an edge leaving a RIGHT port does not place the target to the left', async () => {
    // THE REQUIREMENT, stated as a test. `a` emits from its right side, so in a
    // left-to-right layered layout `b` must end up to the RIGHT of `a`.
    const a = makeNode('a');
    const b = makeNode('b');
    declarePort(a, 'a-out', 'right', 'output');
    declarePort(b, 'b-in', 'left', 'input');

    const result = await adapter.apply([a, b], [link('l1', a, b, 'a-out', 'b-in')], {
      algorithm: 'layered',
      'elk.direction': 'RIGHT',
    });

    const posA = result.nodePositions.get('a')!;
    const posB = result.nodePositions.get('b')!;
    expect(posB.x).toBeGreaterThan(posA.x);
  });

  it('SENDS the declared ports to ELK and constrains only the nodes that have them', async () => {
    const a = makeNode('a');
    const bare = makeNode('bare'); // only the four auto-created default ports
    declarePort(a, 'a-out', 'right', 'output');

    const result = await adapter.apply([a, bare], [link('l1', a, bare, 'a-out')], {
      algorithm: 'layered',
    });

    // One node carries declared ports; the bare node is left FREE, so ELK keeps
    // every degree of freedom it had before port-awareness existed.
    expect(result.metadata!['portConstrainedNodes']).toBe(1);
  });

  it('reads ELK port positions back instead of binning them', async () => {
    const a = makeNode('a');
    const b = makeNode('b');
    declarePort(a, 'a-out', 'right', 'output');
    declarePort(b, 'b-in', 'left', 'input');

    const result = await adapter.apply([a, b], [link('l1', a, b, 'a-out', 'b-in')], {
      algorithm: 'layered',
      'elk.direction': 'RIGHT',
    });

    const ports = result.routing!.portPositions;
    expect(ports.has('a-out')).toBe(true);
    expect(ports.has('b-in')).toBe(true);

    // Positions are ABSOLUTE (lifted out of ELK's node-relative frame), and the
    // right-side port of `a` sits on `a`'s right edge.
    const posA = result.nodePositions.get('a')!;
    const aOut = ports.get('a-out')!;
    expect(aOut.side).toBe('right');
    expect(aOut.x).toBeCloseTo(posA.x + a.size.width, 0);
  });

  it('reads ELK edge routes back — the output that used to be discarded', async () => {
    const a = makeNode('a');
    const b = makeNode('b');

    const result = await adapter.apply([a, b], [link('l1', a, b)], { algorithm: 'layered' });

    const route = result.routing!.edgeRoutes.get('l1');
    expect(route).toBeDefined();
    expect(route!.start).toEqual(expect.objectContaining({ x: expect.any(Number) }));
    expect(route!.end).toEqual(expect.objectContaining({ y: expect.any(Number) }));
    expect(result.routing!.orthogonal).toBe(true);
  });

  it('leaves a bare graph byte-identical — port-awareness is a no-op without declared ports', async () => {
    // The safety property that lets this ship ON by default.
    const a = makeNode('a');
    const b = makeNode('b');
    const links = [link('l1', a, b)];

    const on = await adapter.apply([a, b], links, { algorithm: 'layered' });
    const off = await adapter.apply([a, b], links, { algorithm: 'layered', portConstraints: 'free' });

    expect(on.metadata!['portConstrainedNodes']).toBe(0);
    expect([...on.nodePositions.entries()]).toEqual([...off.nodePositions.entries()]);
  });
});

describe('ELK adapter — label-aware layout (Card 7)', () => {
  let adapter: ELKLayoutAdapter;

  beforeEach(() => {
    adapter = new ELKLayoutAdapter();
  });

  it('reserves space for an edge label, so the label has somewhere to live', async () => {
    // Layout's job is the RESERVATION; the renderer's edge optimizer still does
    // the placement. Without this, layout packs the ranks tight and the optimizer
    // is asked to fit a label into a gap that does not exist.
    const a = makeNode('a');
    const b = makeNode('b');

    const bare = link('l1', a, b);
    const labelled = link('l1', a, b);
    labelled.addLabel({ text: 'a fairly long edge label', position: 0.5 });

    const withoutLabel = await adapter.apply([a, b], [bare], {
      algorithm: 'layered',
      'elk.direction': 'RIGHT',
    });
    const withLabel = await adapter.apply([a, b], [labelled], {
      algorithm: 'layered',
      'elk.direction': 'RIGHT',
    });

    const gap = (r: typeof withLabel) =>
      r.nodePositions.get('b')!.x - (r.nodePositions.get('a')!.x + a.size.width);

    // The labelled layout leaves a WIDER channel between the ranks than the bare
    // one — that extra room is the label's.
    expect(gap(withLabel)).toBeGreaterThan(gap(withoutLabel));
    expect(withLabel.metadata!['labelledEdges']).toBe(1);
  });

  it('reports the reserved box per link', async () => {
    const a = makeNode('a');
    const b = makeNode('b');
    const l = link('l1', a, b);
    l.addLabel({ text: 'hello', position: 0.5 });

    const result = await adapter.apply([a, b], [l], { algorithm: 'layered' });

    const space = result.routing!.labelSpace.get('l1')!;
    expect(space.width).toBeCloseTo(5 * 14 * 0.6); // renderer's own estimate
    expect(space.height).toBeGreaterThan(0);
  });

  it('reserves nothing when no edge is labelled', async () => {
    const a = makeNode('a');
    const b = makeNode('b');

    const result = await adapter.apply([a, b], [link('l1', a, b)], { algorithm: 'layered' });

    expect(result.routing!.labelSpace.size).toBe(0);
    expect(result.metadata!['labelledEdges']).toBe(0);
  });
});
