// DiagramModel.getNodeByPortId Tests (Phase 3)

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';

describe('DiagramModel - getNodeByPortId (Phase 3)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  it('should find node by port ID', () => {
    const node = new NodeModel({
      type: 'test-node',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 60 },
    });

    const port = new PortModel({
      id: 'port-1',
      type: 'output',
      side: 'right',
    });

    node.addPort(port);
    diagram.addNode(node);

    const foundNode = diagram.getNodeByPortId('port-1');
    expect(foundNode).toBe(node);
  });

  it('should return undefined if port not found', () => {
    const node = new NodeModel({
      type: 'test-node',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 60 },
    });

    diagram.addNode(node);

    const foundNode = diagram.getNodeByPortId('non-existent-port');
    expect(foundNode).toBeUndefined();
  });

  it('should handle multiple nodes with multiple ports', () => {
    const node1 = new NodeModel({
      type: 'test-node',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 60 },
    });
    const port1 = new PortModel({
      id: 'port-1',
      type: 'output',
      side: 'right',
    });
    node1.addPort(port1);

    const node2 = new NodeModel({
      type: 'test-node',
      position: { x: 200, y: 0 },
      size: { width: 100, height: 60 },
    });
    const port2 = new PortModel({
      id: 'port-2',
      type: 'input',
      side: 'left',
    });
    node2.addPort(port2);

    diagram.addNode(node1);
    diagram.addNode(node2);

    expect(diagram.getNodeByPortId('port-1')).toBe(node1);
    expect(diagram.getNodeByPortId('port-2')).toBe(node2);
  });

  it('should return undefined for empty diagram', () => {
    const foundNode = diagram.getNodeByPortId('any-port');
    expect(foundNode).toBeUndefined();
  });
});
