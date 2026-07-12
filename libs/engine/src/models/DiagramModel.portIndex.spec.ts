// DiagramModel portIndex — O(1) port -> node/port resolution that stays
// correct as nodes and ports are added/removed (Wave 1 rendering foundation).

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';

function makeNode(): NodeModel {
  return new NodeModel({
    type: 'test-node',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 60 },
  });
}

function makePort(id: string): PortModel {
  return new PortModel({ id, type: 'output', side: 'right' });
}

describe('DiagramModel - portIndex (O(1) port lookup)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  it('resolves node AND port by port id (port added before addNode)', () => {
    const node = makeNode();
    const port = makePort('p1');
    node.addPort(port);
    diagram.addNode(node);

    expect(diagram.getNodeByPortId('p1')).toBe(node);
    expect(diagram.getPortById('p1')).toBe(port);
  });

  it('indexes ports added AFTER the node is already in the diagram', () => {
    const node = makeNode();
    diagram.addNode(node);

    // Not yet present
    expect(diagram.getNodeByPortId('late')).toBeUndefined();

    const port = makePort('late');
    node.addPort(port);

    expect(diagram.getNodeByPortId('late')).toBe(node);
    expect(diagram.getPortById('late')).toBe(port);
  });

  it('drops a port from the index when the port is removed from its node', () => {
    const node = makeNode();
    node.addPort(makePort('p1'));
    diagram.addNode(node);
    expect(diagram.getNodeByPortId('p1')).toBe(node);

    node.removePort('p1');

    expect(diagram.getNodeByPortId('p1')).toBeUndefined();
    expect(diagram.getPortById('p1')).toBeUndefined();
  });

  it('drops all of a node\'s ports from the index when the node is removed', () => {
    const node = makeNode();
    node.addPort(makePort('a'));
    node.addPort(makePort('b'));
    diagram.addNode(node);
    expect(diagram.getNodeByPortId('a')).toBe(node);
    expect(diagram.getNodeByPortId('b')).toBe(node);

    diagram.removeNode(node.id);

    expect(diagram.getNodeByPortId('a')).toBeUndefined();
    expect(diagram.getNodeByPortId('b')).toBeUndefined();
  });

  it('stays correct across multiple nodes and interleaved add/remove', () => {
    const n1 = makeNode();
    n1.addPort(makePort('n1-out'));
    const n2 = makeNode();
    n2.addPort(makePort('n2-in'));

    diagram.addNode(n1);
    diagram.addNode(n2);

    expect(diagram.getNodeByPortId('n1-out')).toBe(n1);
    expect(diagram.getNodeByPortId('n2-in')).toBe(n2);

    diagram.removeNode(n1.id);

    // n1's port is gone, n2's remains
    expect(diagram.getNodeByPortId('n1-out')).toBeUndefined();
    expect(diagram.getNodeByPortId('n2-in')).toBe(n2);
  });

  it('does NOT re-pollute the index when a removed node adds a port later', () => {
    const node = makeNode();
    node.addPort(makePort('p1'));
    diagram.addNode(node);
    diagram.removeNode(node.id);
    expect(diagram.getNodeByPortId('p1')).toBeUndefined();

    // A stale listener must not resurrect the mapping
    node.addPort(makePort('p2'));
    expect(diagram.getNodeByPortId('p2')).toBeUndefined();
  });

  it('clearNodes empties the index', () => {
    const node = makeNode();
    node.addPort(makePort('p1'));
    diagram.addNode(node);

    diagram.clearNodes();

    expect(diagram.getNodeByPortId('p1')).toBeUndefined();
  });

  it('addLink resolves owning node ids through the index', () => {
    const n1 = makeNode();
    n1.addPort(new PortModel({ id: 'src', type: 'output', side: 'right' }));
    const n2 = makeNode();
    n2.addPort(new PortModel({ id: 'dst', type: 'input', side: 'left' }));
    diagram.addNode(n1);
    diagram.addNode(n2);

    const { LinkModel } = require('./LinkModel');
    const link = new LinkModel('src', 'dst');
    diagram.addLink(link);

    expect(link.sourceNodeId).toBe(n1.id);
    expect(link.targetNodeId).toBe(n2.id);
  });

  it('restoreNode indexes the restored node\'s ports', () => {
    const node = makeNode();
    node.addPort(makePort('p1'));
    diagram.addNode(node);
    const serialized = node.serialize();

    const fresh = new DiagramModel();
    const restored = fresh.restoreNode(serialized);

    expect(restored).toBeDefined();
    expect(fresh.getNodeByPortId('p1')).toBe(restored);
  });

  it('DiagramModel.fromJSON rebuilds the port index', () => {
    const node = makeNode();
    node.addPort(makePort('p1'));
    diagram.addNode(node);

    const roundTripped = DiagramModel.fromJSON(diagram.serialize());
    const foundNode = roundTripped.getNodeByPortId('p1');

    expect(foundNode).toBeDefined();
    expect(foundNode!.getPort('p1')).toBeDefined();
  });
});
