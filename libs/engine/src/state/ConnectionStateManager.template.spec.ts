// ConnectionStateManager Template Integration Tests (Phase 3)

import { ConnectionStateManager } from './ConnectionStateManager';
import { EventBus } from '../events/EventBus';
import { NodeModel, PortModel, DiagramModel } from '../models';
import { DiagramEngine } from '../DiagramEngine';
import { createConnectionGroupValidator } from '../validation/ConnectionGroupValidator';

describe('ConnectionStateManager - Template Integration (Phase 3)', () => {
  let connectionManager: ConnectionStateManager;
  let eventBus: EventBus;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new DiagramEngine();
    diagram = engine.getDiagram();
    connectionManager = new ConnectionStateManager(eventBus);
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

      // Add connection group validator
      const validator = createConnectionGroupValidator();
      connectionManager.addValidator(validator);

      // Start connection
      connectionManager.startConnection(sourcePort, { x: 0, y: 0 });

      // Update with target port - should be valid
      connectionManager.updateConnectionTarget(targetPort, { x: 200, y: 0 }, node2);

      const state = connectionManager.getState();
      expect(state.isOverValidTarget).toBe(true);
      expect(state.validTargetPorts.has(targetPort.id)).toBe(true);
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

      // Add connection group validator
      const validator = createConnectionGroupValidator();
      connectionManager.addValidator(validator);

      // Start connection
      connectionManager.startConnection(sourcePort, { x: 0, y: 0 });

      // Update with target port - should be INVALID
      connectionManager.updateConnectionTarget(targetPort, { x: 200, y: 0 }, node2);

      const state = connectionManager.getState();
      expect(state.isOverValidTarget).toBe(false);
      expect(state.validTargetPorts.has(targetPort.id)).toBe(false);
    });

    it('should allow connections when one node has no connection group', () => {
      // Node 1 has no connection group (unrestricted)
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

      // Add connection group validator
      const validator = createConnectionGroupValidator();
      connectionManager.addValidator(validator);

      // Start connection
      connectionManager.startConnection(sourcePort, { x: 0, y: 0 });

      // Update with target port - should be valid
      connectionManager.updateConnectionTarget(targetPort, { x: 200, y: 0 }, node2);

      const state = connectionManager.getState();
      expect(state.isOverValidTarget).toBe(true);
      expect(state.validTargetPorts.has(targetPort.id)).toBe(true);
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

      // Add connection group validator
      const validator = createConnectionGroupValidator();
      connectionManager.addValidator(validator);

      // Start connection
      connectionManager.startConnection(sourcePort, { x: 0, y: 0 });

      // Update with target port - should be valid
      connectionManager.updateConnectionTarget(targetPort, { x: 200, y: 0 }, node2);

      const state = connectionManager.getState();
      expect(state.isOverValidTarget).toBe(true);
      expect(state.validTargetPorts.has(targetPort.id)).toBe(true);
    });
  });
});

/**
 * Create a connection group validator
 * This validator ensures connections only happen between nodes in the same group
 * If a node has no group, it can connect to any node
 */
function createConnectionGroupValidator() {
  return (sourcePort: PortModel, targetPort: PortModel): boolean => {
    // Get the nodes from the ports
    const sourceNode = getNodeForPort(sourcePort);
    const targetNode = getNodeForPort(targetPort);

    if (!sourceNode || !targetNode) {
      return false; // Can't validate without nodes
    }

    // Get connection groups
    const sourceGroup = sourceNode.getConnectionGroup?.();
    const targetGroup = targetNode.getConnectionGroup?.();

    // If neither has a group, allow connection
    if (!sourceGroup && !targetGroup) {
      return true;
    }

    // If one has a group and the other doesn't, allow connection
    if (!sourceGroup || !targetGroup) {
      return true;
    }

    // Both have groups - must match
    return sourceGroup === targetGroup;
  };
}

/**
 * Helper to get the node that owns a port
 * In real code, this would query the diagram
 */
function getNodeForPort(port: PortModel): NodeModel | null {
  // This is a simplified version for testing
  // In practice, we would need access to the diagram to find the node
  // For now, we'll use a workaround by checking port.nodeId
  // and assume the test has access to the nodes

  // This helper will need to be implemented properly in the actual validator
  // which has access to the diagram via the engine
  return null;
}
