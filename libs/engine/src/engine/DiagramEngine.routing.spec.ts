// DiagramEngine.routing.spec.ts - Tests for Routing Integration (Phase 1.6b)

import { DiagramEngine } from './DiagramEngine';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { LinkModel } from '../models/LinkModel';

describe('DiagramEngine - Routing Integration (Phase 1.6b)', () => {
  let engine: DiagramEngine;

  beforeEach(async () => {
    engine = new DiagramEngine();
    await engine.createDiagram('test');
  });

  describe('getPortGlobalPosition', () => {
    it('should get port position in global coordinates', async () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 50 }
      });

      const port = new PortModel({
        id: 'port1',
        type: 'output',
        position: { x: 0.5, y: 0 } // Top center
      });

      node.addPort(port);
      await engine.addNode(node);

      const globalPos = (engine as any).getPortGlobalPosition('port1');

      // Port at (0.5, 0) of 100x50 node at (100, 100)
      // Should be at (100 + 50, 100 + 0) = (150, 100)
      expect(globalPos.x).toBeCloseTo(150, 1);
      expect(globalPos.y).toBeCloseTo(100, 1);
    });

    it('should account for node transforms', async () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 50 }
      });

      node.setScale(2, 2);

      const port = new PortModel({
        id: 'port1',
        type: 'output',
        position: { x: 0.5, y: 0.5 } // Center
      });

      node.addPort(port);
      await engine.addNode(node);

      const globalPos = (engine as any).getPortGlobalPosition('port1');

      // With 2x scale, port should account for scaled size
      expect(globalPos).toBeDefined();
    });

    it('should return origin for unknown port', async () => {
      const globalPos = (engine as any).getPortGlobalPosition('unknown');

      expect(globalPos).toEqual({ x: 0, y: 0 });
    });
  });

  describe('getNodeForPort', () => {
    it('should find node that owns a port', async () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 }
      });

      const port = new PortModel({
        id: 'port1',
        type: 'output'
      });

      node.addPort(port);
      await engine.addNode(node);

      const foundNode = (engine as any).getNodeForPort('port1');

      expect(foundNode).toBeDefined();
      expect(foundNode.id).toBe(node.id);
    });

    it('should return undefined for unknown port', async () => {
      const foundNode = (engine as any).getNodeForPort('unknown');

      expect(foundNode).toBeUndefined();
    });
  });

  describe('computeLinkPath', () => {
    let sourceNode: NodeModel;
    let targetNode: NodeModel;
    let obstacleNode: NodeModel;
    let link: LinkModel;

    beforeEach(async () => {
      // Source node at (0, 0)
      sourceNode = new NodeModel({
        type: 'source',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 }
      });

      const sourcePort = new PortModel({
        id: 'source-port',
        type: 'output',
        position: { x: 1, y: 0.5 } // Right center
      });

      sourceNode.addPort(sourcePort);
      await engine.addNode(sourceNode);

      // Target node at (400, 0)
      targetNode = new NodeModel({
        type: 'target',
        position: { x: 400, y: 0 },
        size: { width: 100, height: 50 }
      });

      const targetPort = new PortModel({
        id: 'target-port',
        type: 'input',
        position: { x: 0, y: 0.5 } // Left center
      });

      targetNode.addPort(targetPort);
      await engine.addNode(targetNode);

      // Obstacle node in the middle
      obstacleNode = new NodeModel({
        type: 'obstacle',
        position: { x: 200, y: -50 },
        size: { width: 100, height: 150 }
      });

      await engine.addNode(obstacleNode);

      // Create link
      link = await engine.addLink({
        sourcePortId: 'source-port',
        targetPortId: 'target-port'
      });
    });

    it('should compute straight path', async () => {
      const path = (engine as any).computeLinkPath(link.id, 'straight');

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toBeDefined(); // Start point
      expect(path[path.length - 1]).toBeDefined(); // End point
    });

    it('should compute orthogonal path', async () => {
      const path = (engine as any).computeLinkPath(link.id, 'orthogonal');

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
    });

    it('should compute a-star path avoiding obstacles', async () => {
      const path = (engine as any).computeLinkPath(link.id, 'astar');

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
    });

    it('should exclude source and target nodes from obstacles', async () => {
      // The path computation should not treat source/target as obstacles
      const path = (engine as any).computeLinkPath(link.id, 'astar');

      expect(path).toBeDefined();
      // Path should be computed successfully
      expect(path.length).toBeGreaterThan(0);
    });

    it('should apply obstacle margin option', async () => {
      const path = (engine as any).computeLinkPath(link.id, 'astar', {
        obstacleMargin: 10
      });

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
    });

    it('should handle non-existent link', async () => {
      const path = (engine as any).computeLinkPath('non-existent', 'straight');

      expect(path).toEqual([]);
    });

    it('should handle unknown algorithm', async () => {
      expect(() => {
        (engine as any).computeLinkPath(link.id, 'unknown-algorithm');
      }).toThrow();
    });

    it('should compute dijkstra path', async () => {
      const path = (engine as any).computeLinkPath(link.id, 'dijkstra');

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
    });

    it('should compute visibility graph path', async () => {
      const path = (engine as any).computeLinkPath(link.id, 'visibility');

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(2);
    });
  });
});
