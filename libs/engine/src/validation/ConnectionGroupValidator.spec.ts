// ConnectionGroupValidator Tests (Phase 3)

import { createConnectionGroupValidator, isConnectionAllowedByGroup } from './ConnectionGroupValidator';
import { DiagramEngine } from '../DiagramEngine';
import { NodeModel, PortModel } from '../models';

describe('ConnectionGroupValidator (Phase 3)', () => {
  let engine: DiagramEngine;
  let diagram: any;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.getDiagram();
  });

  describe('Connection Group Validation', () => {
    it('should allow connections between nodes in the same connection group', () => {
      // Create two nodes in the same connection group
      const node1 = new NodeModel({
        type: 'test-node',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 60 },
      });
      node1.setConnectionGroup('workflow-1');

      const node2 = new NodeModel({
        type: 'test-node',
        position: { x: 200, y: 0 },
        size: { width: 100, height: 60 },
      });
      node2.setConnectionGroup('workflow-1');

      const sourcePort = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });
      node1.addPort(sourcePort);

      const targetPort = new PortModel({
        id: 'port-2',
        type: 'input',
        side: 'left',
      });
      node2.addPort(targetPort);

      // Add nodes to diagram
      diagram.addNode(node1);
      diagram.addNode(node2);

      // Test validator
      const validator = createConnectionGroupValidator(engine);
      const isValid = validator(sourcePort, targetPort);
      expect(isValid).toBe(true);
    });

    it('should reject connections between nodes in different connection groups', () => {
      // Create two nodes in different connection groups
      const node1 = new NodeModel({
        type: 'test-node',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 60 },
      });
      node1.setConnectionGroup('workflow-1');

      const node2 = new NodeModel({
        type: 'test-node',
        position: { x: 200, y: 0 },
        size: { width: 100, height: 60 },
      });
      node2.setConnectionGroup('workflow-2'); // Different group

      const sourcePort = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });
      node1.addPort(sourcePort);

      const targetPort = new PortModel({
        id: 'port-2',
        type: 'input',
        side: 'left',
      });
      node2.addPort(targetPort);

      // Add nodes to diagram
      diagram.addNode(node1);
      diagram.addNode(node2);

      // Test validator - should REJECT
      const validator = createConnectionGroupValidator(engine);
      const isValid = validator(sourcePort, targetPort);
      expect(isValid).toBe(false);
    });

    it('should allow connections when one node has no connection group', () => {
      // Node 1 has no connection group (unrestricted)
      const node1 = new NodeModel({
        type: 'test-node',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 60 },
      });
      // No connection group set

      const node2 = new NodeModel({
        type: 'test-node',
        position: { x: 200, y: 0 },
        size: { width: 100, height: 60 },
      });
      node2.setConnectionGroup('workflow-1');

      const sourcePort = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });
      node1.addPort(sourcePort);

      const targetPort = new PortModel({
        id: 'port-2',
        type: 'input',
        side: 'left',
      });
      node2.addPort(targetPort);

      // Add nodes to diagram
      diagram.addNode(node1);
      diagram.addNode(node2);

      // Test validator - should ALLOW
      const validator = createConnectionGroupValidator(engine);
      const isValid = validator(sourcePort, targetPort);
      expect(isValid).toBe(true);
    });

    it('should allow connections when both nodes have no connection group', () => {
      // Both nodes have no connection group (unrestricted)
      const node1 = new NodeModel({
        type: 'test-node',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 60 },
      });

      const node2 = new NodeModel({
        type: 'test-node',
        position: { x: 200, y: 0 },
        size: { width: 100, height: 60 },
      });

      const sourcePort = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });
      node1.addPort(sourcePort);

      const targetPort = new PortModel({
        id: 'port-2',
        type: 'input',
        side: 'left',
      });
      node2.addPort(targetPort);

      // Add nodes to diagram
      diagram.addNode(node1);
      diagram.addNode(node2);

      // Test validator - should ALLOW
      const validator = createConnectionGroupValidator(engine);
      const isValid = validator(sourcePort, targetPort);
      expect(isValid).toBe(true);
    });

    it('should reject if source node not found', () => {
      const node2 = new NodeModel({
        type: 'test-node',
        position: { x: 200, y: 0 },
        size: { width: 100, height: 60 },
      });

      const sourcePort = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });
      // sourcePort not added to any node

      const targetPort = new PortModel({
        id: 'port-2',
        type: 'input',
        side: 'left',
      });
      node2.addPort(targetPort);

      // Only add node2
      diagram.addNode(node2);

      // Test validator - should REJECT (source node not found)
      const validator = createConnectionGroupValidator(engine);
      const isValid = validator(sourcePort, targetPort);
      expect(isValid).toBe(false);
    });
  });

  describe('isConnectionAllowedByGroup helper', () => {
    it('should use the validator to check connection', () => {
      const node1 = new NodeModel({
        type: 'test-node',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 60 },
      });
      node1.setConnectionGroup('group-1');

      const node2 = new NodeModel({
        type: 'test-node',
        position: { x: 200, y: 0 },
        size: { width: 100, height: 60 },
      });
      node2.setConnectionGroup('group-1');

      const sourcePort = new PortModel({
        id: 'port-1',
        type: 'output',
        side: 'right',
      });
      node1.addPort(sourcePort);

      const targetPort = new PortModel({
        id: 'port-2',
        type: 'input',
        side: 'left',
      });
      node2.addPort(targetPort);

      diagram.addNode(node1);
      diagram.addNode(node2);

      const isAllowed = isConnectionAllowedByGroup(sourcePort, targetPort, engine);
      expect(isAllowed).toBe(true);
    });
  });
});
