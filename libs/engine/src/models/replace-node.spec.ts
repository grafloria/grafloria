/**
 * `DiagramModel.replaceNode()` — swap the live model under an id for another
 * instance WITHOUT losing the links attached to it.
 *
 * `setNodes()` given a different `NodeModel` under an id already on the canvas
 * (a reloaded document: `setNodes(fromDocument(json).nodes)`) did
 * `removeNode(id); addNode(next)`, and `removeNode` cascades the node's links —
 * so every edge of every swapped node vanished. Links whose endpoints still
 * exist must survive the swap, rebound to the new model's ports: the same port
 * id when the new model has it, else the port on the same side. A link to a
 * port with no counterpart on the new model goes, as a removal would take it.
 */
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';
import { LinkModel } from './LinkModel';
import { expectConverged, link, node, peer } from '../collab/test-helpers';
import type { Op } from '../collab/op';

const plain = (id: string, x = 0) =>
  new NodeModel({ id, type: 'default', position: { x, y: 0 }, size: { width: 100, height: 50 } });

function connected() {
  const diagram = new DiagramModel();
  const a = plain('a');
  const b = plain('b', 300);
  diagram.addNode(a);
  diagram.addNode(b);
  const l = new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id, 'direct');
  diagram.addLink(l);
  return { diagram, a, b, l };
}

describe('DiagramModel.replaceNode', () => {
  it('a clone with the SAME port ids (a reloaded document) keeps the link on those ports', () => {
    const { diagram, a, l } = connected();
    const next = NodeModel.fromJSON(JSON.parse(JSON.stringify(a.serialize())));
    next.setPosition(40, 80);
    const portId = l.sourcePortId;

    diagram.replaceNode(next);

    expect(diagram.getNode('a')).toBe(next);
    expect(diagram.getLinks().map((x) => x.id)).toEqual([l.id]);
    expect(l.sourcePortId).toBe(portId);
    expect(diagram.getNodeByPortId(portId)).toBe(next);
    expect(next.getPort(portId)!.getConnectionCount()).toBe(1);
    expect(diagram.getLinksForNode('a')).toEqual([l]);
  });

  it('a fresh model (new port ids) gets the link rebound to the port on the same side', () => {
    const { diagram, b, l } = connected();
    const next = plain('b', 500);

    diagram.replaceNode(next);

    expect(diagram.getLink(l.id)).toBe(l);
    expect(l.targetPortId).toBe(next.getPortBySide('left')!.id);
    expect(l.targetNodeId).toBe('b');
    expect(diagram.getNodeByPortId(l.targetPortId)).toBe(next);
    expect(next.getPortBySide('left')!.getConnectionCount()).toBe(1);
    expect(b.diagram).toBeUndefined(); // the old model is detached
  });

  it('a self-loop is rebound at both ends', () => {
    const diagram = new DiagramModel();
    const a = plain('a');
    diagram.addNode(a);
    const loop = new LinkModel(a.getPortBySide('right')!.id, a.getPortBySide('top')!.id, 'direct');
    diagram.addLink(loop);
    const next = plain('a');

    diagram.replaceNode(next);

    expect(diagram.getLink(loop.id)).toBe(loop);
    expect(loop.sourcePortId).toBe(next.getPortBySide('right')!.id);
    expect(loop.targetPortId).toBe(next.getPortBySide('top')!.id);
  });

  it('a link to a port that has no counterpart on the new model goes', () => {
    const diagram = new DiagramModel();
    const a = plain('a');
    const b = plain('b', 300);
    diagram.addNode(a);
    diagram.addNode(b);
    const kept = new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id, 'direct');
    diagram.addLink(kept);
    const next = plain('a');
    // The new model has no port on the BOTTOM side at all.
    next.removePort(next.getPortBySide('bottom')!.id);
    const dropped = new LinkModel(a.getPortBySide('bottom')!.id, b.getPortBySide('top')!.id, 'direct');
    diagram.addLink(dropped);

    diagram.replaceNode(next);

    expect(diagram.getLinks().map((x) => x.id)).toEqual([kept.id]);
  });

  it('emits node:removed / node:added for the swap, and link:removed only for a dropped link', () => {
    const { diagram, a } = connected();
    const events: string[] = [];
    for (const e of ['node:removed', 'node:added', 'link:removed', 'link:added']) {
      diagram.on(e, () => events.push(e));
    }
    diagram.replaceNode(NodeModel.fromJSON(JSON.parse(JSON.stringify(a.serialize()))));
    expect(events).toEqual(['node:removed', 'node:added']);
  });

  it('an id that is not on the canvas is simply added', () => {
    const diagram = new DiagramModel();
    const n = plain('x');
    diagram.replaceNode(n);
    expect(diagram.getNode('x')).toBe(n);
  });

  it('is refused on a read-only diagram', () => {
    const { diagram, a } = connected();
    diagram.setReadonly(true);
    diagram.replaceNode(plain('a'));
    expect(diagram.getNode('a')).toBe(a);
    expect(diagram.getLinks()).toHaveLength(1);
  });

  it('collab: the swap converges and the link survives on the peer too', () => {
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.addNode(node('n2', 300, 0));
    seeder.diagram.addLink(link('l1', 'n1', 'n2'));

    const aliceOps: Op[] = [];
    const alice = peer('alice', seeder.diagram, aliceOps);
    const bob = peer('bob', seeder.diagram);
    alice.receive(seedOps);
    bob.receive(seedOps);

    const current = alice.diagram.getNode('n1')!;
    const next = NodeModel.fromJSON(JSON.parse(JSON.stringify(current.serialize())));
    next.setPosition(0, 200);
    alice.diagram.replaceNode(next);
    bob.receive(aliceOps);

    for (const p of [alice, bob]) {
      expect(p.diagram.getLink('l1')).toBeDefined();
      expect(p.diagram.getNode('n1')!.position.y).toBe(200);
    }
    expectConverged(alice.diagram, bob.diagram);
    [seeder, alice, bob].forEach((p) => p.dispose());
  });

  it('collab: a swap that rebinds by side converges too', () => {
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('n1', 0, 0));
    seeder.diagram.addNode(node('n2', 300, 0));
    seeder.diagram.addLink(link('l1', 'n1', 'n2'));

    const aliceOps: Op[] = [];
    const alice = peer('alice', seeder.diagram, aliceOps);
    const bob = peer('bob', seeder.diagram);
    alice.receive(seedOps);
    bob.receive(seedOps);

    // A model without the custom `n1-out` port: the link's source goes to the right side.
    const next = new NodeModel({ id: 'n1', type: 'basic', position: { x: 0, y: 0 }, size: { width: 120, height: 60 } });
    next.addPort(new PortModel({ id: 'n1-east', type: 'output', side: 'right' }));
    alice.diagram.replaceNode(next);
    bob.receive(aliceOps);

    for (const p of [alice, bob]) {
      const l = p.diagram.getLink('l1');
      expect(l).toBeDefined();
      expect(p.diagram.getNodeByPortId(l!.sourcePortId)?.id).toBe('n1');
    }
    expectConverged(alice.diagram, bob.diagram);
    [seeder, alice, bob].forEach((p) => p.dispose());
  });
});
