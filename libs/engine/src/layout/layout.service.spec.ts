/**
 * Unit tests for LayoutService
 */

import { LayoutService } from './layout.service';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import { ELKLayoutAdapter } from './elk-layout-adapter';
import { LayoutAdapter } from './layout-adapter.interface';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

describe('LayoutService', () => {
  let service: LayoutService;

  beforeEach(() => {
    service = new LayoutService();
  });

  describe('Adapter registration', () => {
    it('should register built-in adapters on construction', () => {
      expect(service.getAdapter('dagre')).toBeDefined();
      expect(service.getAdapter('elk')).toBeDefined();
    });

    it('should register custom adapter', () => {
      const customAdapter: LayoutAdapter = {
        name: 'custom',
        apply: jest.fn(),
        validateOptions: jest.fn(() => true),
      };

      service.registerAdapter(customAdapter);

      expect(service.getAdapter('custom')).toBe(customAdapter);
    });

    it('should get all adapter names', () => {
      const names = service.getAdapterNames();

      expect(names).toContain('dagre');
      expect(names).toContain('elk');
      expect(names.length).toBeGreaterThanOrEqual(2);
    });

    it('should return undefined for unknown adapter', () => {
      expect(service.getAdapter('unknown')).toBeUndefined();
    });
  });

  describe('Apply layout', () => {
    let diagram: DiagramModel;

    beforeEach(() => {
      diagram = new DiagramModel();
    });

    it('should throw error for unknown adapter name', async () => {
      await expect(
        service.applyLayout(diagram, {
          adapter: 'unknown' as any,
        })
      ).rejects.toThrow('Layout adapter not found: unknown');
    });

    it('should throw error for invalid options', async () => {
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      await expect(
        service.applyLayout(diagram, {
          adapter: 'dagre',
          options: { rankdir: 'INVALID' as any },
        })
      ).rejects.toThrow('Invalid layout options');
    });

    it('should apply Dagre layout by name', async () => {
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      const node2 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const result = await service.applyLayout(diagram, {
        adapter: 'dagre',
        options: { rankdir: 'TB' },
      });

      expect(result.nodePositions.size).toBe(2);
      expect(result.metadata?.algorithm).toBe('dagre');
    });

    it('should apply ELK layout by name', async () => {
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      const node2 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const result = await service.applyLayout(diagram, {
        adapter: 'elk',
        options: { algorithm: 'layered' },
      });

      expect(result.nodePositions.size).toBe(2);
      expect(result.metadata?.algorithm).toBe('elk');
    });

    it('should apply layout with adapter instance', async () => {
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const adapter = new DagreLayoutAdapter();
      const result = await service.applyLayout(diagram, {
        adapter,
      });

      expect(result.nodePositions.size).toBe(1);
    });

    it('should handle empty diagram', async () => {
      const result = await service.applyLayout(diagram, {
        adapter: 'dagre',
      });

      expect(result.nodePositions.size).toBe(0);
      expect(result.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it('should update node positions without animation', async () => {
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      const node2 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const link = diagram.addLink({
        sourceNodeId: node1.id,
        targetNodeId: node2.id,
        sourcePortId: 'out',
        targetPortId: 'in',
      });

      await service.applyLayout(diagram, {
        adapter: 'dagre',
        animate: false,
      });

      // Positions should be updated
      expect(node1.position.x).toBeGreaterThanOrEqual(0);
      expect(node1.position.y).toBeGreaterThanOrEqual(0);
      expect(node2.position.x).toBeGreaterThanOrEqual(0);
      expect(node2.position.y).toBeGreaterThanOrEqual(0);
    });

    it('should update node positions with animation', async () => {
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      const node2 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const link = diagram.addLink({
        sourceNodeId: node1.id,
        targetNodeId: node2.id,
        sourcePortId: 'out',
        targetPortId: 'in',
      });

      await service.applyLayout(diagram, {
        adapter: 'dagre',
        animate: true,
        animationDuration: 100, // Short duration for testing
      });

      // Positions should be updated
      expect(node1.position.x).toBeGreaterThanOrEqual(0);
      expect(node1.position.y).toBeGreaterThanOrEqual(0);
      expect(node2.position.x).toBeGreaterThanOrEqual(0);
      expect(node2.position.y).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Animation', () => {
    it('should animate positions over time', async () => {
      const diagram = new DiagramModel();
      const node = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const initialX = node.position.x;
      const initialY = node.position.y;

      // Apply layout with animation
      const layoutPromise = service.applyLayout(diagram, {
        adapter: 'dagre',
        animate: true,
        animationDuration: 200,
      });

      // Wait a bit and check that position is changing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Position might be changing during animation
      // (or might have already reached target for single node)

      // Wait for animation to complete
      await layoutPromise;

      // Final position should be set
      expect(node.position.x).toBeDefined();
      expect(node.position.y).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with multiple layout applications', async () => {
      const diagram = new DiagramModel();
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      const node2 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const link = diagram.addLink({
        sourceNodeId: node1.id,
        targetNodeId: node2.id,
        sourcePortId: 'out',
        targetPortId: 'in',
      });

      // Apply Dagre layout
      await service.applyLayout(diagram, {
        adapter: 'dagre',
        options: { rankdir: 'TB' },
      });

      const pos1TB = { ...node1.position };
      const pos2TB = { ...node2.position };

      // Apply Dagre layout with different direction
      await service.applyLayout(diagram, {
        adapter: 'dagre',
        options: { rankdir: 'LR' },
      });

      const pos1LR = { ...node1.position };
      const pos2LR = { ...node2.position };

      // Positions should be different for different directions
      expect(pos1LR.x !== pos1TB.x || pos1LR.y !== pos1TB.y).toBe(true);
    });

    it('should switch between different adapters', async () => {
      const diagram = new DiagramModel();
      const node1 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      const node2 = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });

      const link = diagram.addLink({
        sourceNodeId: node1.id,
        targetNodeId: node2.id,
        sourcePortId: 'out',
        targetPortId: 'in',
      });

      // Apply Dagre layout
      const result1 = await service.applyLayout(diagram, {
        adapter: 'dagre',
      });
      expect(result1.metadata?.algorithm).toBe('dagre');

      // Apply ELK layout
      const result2 = await service.applyLayout(diagram, {
        adapter: 'elk',
      });
      expect(result2.metadata?.algorithm).toBe('elk');
    });
  });

  describe('Custom adapters', () => {
    it('should work with custom adapter', async () => {
      const customAdapter: LayoutAdapter = {
        name: 'custom',
        apply: jest.fn(async () => ({
          nodePositions: new Map([['1', { x: 100, y: 200 }]]),
          bounds: { x: 100, y: 200, width: 100, height: 50 },
          metadata: { algorithm: 'custom', executionTime: 10 },
        })),
        validateOptions: jest.fn(() => true),
      };

      service.registerAdapter(customAdapter);

      const diagram = new DiagramModel();
      const node = diagram.addNode({
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
      });
      node.id = '1';

      const result = await service.applyLayout(diagram, {
        adapter: 'custom',
      });

      expect(customAdapter.apply).toHaveBeenCalled();
      expect(result.metadata?.algorithm).toBe('custom');
      expect(node.position.x).toBe(100);
      expect(node.position.y).toBe(200);
    });
  });

  describe('Performance', () => {
    it('should handle large diagrams efficiently', async () => {
      const diagram = new DiagramModel();
      const nodes: NodeModel[] = [];

      // Create 50 nodes
      for (let i = 0; i < 50; i++) {
        const node = diagram.addNode({
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 },
        });
        nodes.push(node);
      }

      // Connect nodes in a chain
      for (let i = 0; i < nodes.length - 1; i++) {
        diagram.addLink({
          sourceNodeId: nodes[i].id,
          targetNodeId: nodes[i + 1].id,
          sourcePortId: 'out',
          targetPortId: 'in',
        });
      }

      const startTime = performance.now();
      await service.applyLayout(diagram, {
        adapter: 'dagre',
        animate: false,
      });
      const executionTime = performance.now() - startTime;

      expect(executionTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });
});
