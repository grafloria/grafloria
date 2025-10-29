/**
 * Unit tests for Incremental Layout
 */

import { IncrementalLayoutManager, IncrementalLayoutOptions } from './incremental-layout.interface';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

describe('IncrementalLayoutManager', () => {
  describe('identifyNewNodes', () => {
    it('should use explicitly provided new node IDs', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100),
        createNode('2', 200, 200),
        createNode('3', 0, 0), // At origin
      ];

      const options: IncrementalLayoutOptions = {
        newNodeIds: ['1', '2'],
      };

      const result = IncrementalLayoutManager.identifyNewNodes(nodes, options);
      expect(result).toEqual(['1', '2']);
    });

    it('should identify nodes at origin as new', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100), // Existing
        createNode('2', 0, 0),     // New (at origin)
        createNode('3', 0, 0),     // New (at origin)
      ];

      const options: IncrementalLayoutOptions = {};

      const result = IncrementalLayoutManager.identifyNewNodes(nodes, options);
      expect(result).toContain('2');
      expect(result).toContain('3');
      expect(result).not.toContain('1');
    });

    it('should handle empty node array', () => {
      const result = IncrementalLayoutManager.identifyNewNodes([], {});
      expect(result).toEqual([]);
    });
  });

  describe('identifyExistingNodes', () => {
    it('should identify nodes not in new nodes list', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100),
        createNode('2', 200, 200),
        createNode('3', 300, 300),
      ];

      const newNodeIds = ['3'];

      const result = IncrementalLayoutManager.identifyExistingNodes(nodes, newNodeIds);
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).not.toContain('3');
    });
  });

  describe('generateConstraints - pin-existing strategy', () => {
    it('should pin all existing nodes', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 200),
        createNode('2', 300, 400),
        createNode('3', 0, 0), // New node
      ];

      const options: IncrementalLayoutOptions = {
        strategy: 'pin-existing',
        newNodeIds: ['3'],
      };

      const result = IncrementalLayoutManager.generateConstraints(nodes, options);

      // Should have constraints for nodes 1 and 2
      expect(result.constraints.length).toBe(2);

      const node1Constraint = result.constraints.find(c => c.nodeId === '1');
      expect(node1Constraint?.type).toBe('pin');
      expect(node1Constraint?.position).toEqual({ x: 100, y: 200 });

      const node2Constraint = result.constraints.find(c => c.nodeId === '2');
      expect(node2Constraint?.type).toBe('pin');
      expect(node2Constraint?.position).toEqual({ x: 300, y: 400 });
    });
  });

  describe('generateConstraints - fix-anchors strategy', () => {
    it('should pin high-connectivity nodes and bound low-connectivity nodes', () => {
      const nodes: NodeModel[] = [];

      // Node 1: high connectivity (4 connections)
      const node1 = createNode('1', 100, 100);
      node1.getIncomingLinks = jest.fn(() => [
        new LinkModel('p1', 'p2'),
        new LinkModel('p3', 'p4'),
      ]);
      node1.getOutgoingLinks = jest.fn(() => [
        new LinkModel('p5', 'p6'),
        new LinkModel('p7', 'p8'),
      ]);
      nodes.push(node1);

      // Node 2: low connectivity (1 connection)
      const node2 = createNode('2', 200, 200);
      node2.getIncomingLinks = jest.fn(() => []);
      node2.getOutgoingLinks = jest.fn(() => [new LinkModel('p9', 'p10')]);
      nodes.push(node2);

      // Node 3: new node
      const node3 = createNode('3', 0, 0);
      node3.getIncomingLinks = jest.fn(() => []);
      node3.getOutgoingLinks = jest.fn(() => []);
      nodes.push(node3);

      const options: IncrementalLayoutOptions = {
        strategy: 'fix-anchors',
        newNodeIds: ['3'],
      };

      const result = IncrementalLayoutManager.generateConstraints(nodes, options);

      const node1Constraint = result.constraints.find(c => c.nodeId === '1');
      expect(node1Constraint?.type).toBe('pin'); // High connectivity = pinned

      const node2Constraint = result.constraints.find(c => c.nodeId === '2');
      expect(node2Constraint?.type).toBe('boundary'); // Low connectivity = bounded
    });
  });

  describe('generateConstraints - proximity-aware strategy', () => {
    it('should pin nodes far from new nodes', () => {
      const nodes: NodeModel[] = [
        createNode('1', 0, 0),     // Far from new nodes
        createNode('2', 500, 500), // Close to new nodes
        createNode('3', 550, 550), // New node
      ];

      const options: IncrementalLayoutOptions = {
        strategy: 'proximity-aware',
        proximityRadius: 100,
        newNodeIds: ['3'],
      };

      const result = IncrementalLayoutManager.generateConstraints(nodes, options);

      const node1Constraint = result.constraints.find(c => c.nodeId === '1');
      expect(node1Constraint?.type).toBe('pin'); // Far = pinned

      const node2Constraint = result.constraints.find(c => c.nodeId === '2');
      expect(node2Constraint?.type).toBe('boundary'); // Close = bounded
    });
  });

  describe('generateConstraints - minimal-shift strategy', () => {
    it('should constrain all existing nodes within maxShift', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100),
        createNode('2', 200, 200),
        createNode('3', 0, 0), // New
      ];

      const options: IncrementalLayoutOptions = {
        strategy: 'minimal-shift',
        maxShift: 50,
        newNodeIds: ['3'],
      };

      const result = IncrementalLayoutManager.generateConstraints(nodes, options);

      const node1Constraint = result.constraints.find(c => c.nodeId === '1');
      expect(node1Constraint?.type).toBe('boundary');
      expect(node1Constraint?.boundary).toEqual({
        minX: 50,
        maxX: 150,
        minY: 50,
        maxY: 150,
      });

      const node2Constraint = result.constraints.find(c => c.nodeId === '2');
      expect(node2Constraint?.type).toBe('boundary');
      expect(node2Constraint?.boundary).toEqual({
        minX: 150,
        maxX: 250,
        minY: 150,
        maxY: 250,
      });
    });
  });

  describe('generateConstraints - anchor nodes', () => {
    it('should add highest priority constraints for anchor nodes', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100),
        createNode('2', 200, 200),
        createNode('3', 0, 0), // New
      ];

      const options: IncrementalLayoutOptions = {
        strategy: 'pin-existing',
        anchorNodeIds: ['1'],
        newNodeIds: ['3'],
      };

      const result = IncrementalLayoutManager.generateConstraints(nodes, options);

      const anchorConstraint = result.constraints.find(c => c.nodeId === '1' && c.priority === 100);
      expect(anchorConstraint).toBeDefined();
      expect(anchorConstraint?.type).toBe('pin');
    });
  });

  describe('generateConstraints - custom constraints', () => {
    it('should merge custom constraints with generated ones', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100),
        createNode('2', 0, 0), // New
      ];

      const options: IncrementalLayoutOptions = {
        strategy: 'pin-existing',
        newNodeIds: ['2'],
        customConstraints: {
          constraints: [
            {
              nodeId: '1',
              type: 'boundary',
              boundary: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
              priority: 5,
            },
          ],
        },
      };

      const result = IncrementalLayoutManager.generateConstraints(nodes, options);

      // Should have pin constraint (from strategy) + custom boundary constraint
      const node1Constraints = result.constraints.filter(c => c.nodeId === '1');
      expect(node1Constraints.length).toBeGreaterThanOrEqual(2);

      const customConstraint = node1Constraints.find(c => c.type === 'boundary');
      expect(customConstraint).toBeDefined();
    });
  });

  describe('calculateResult', () => {
    it('should calculate movement statistics', () => {
      const nodes: NodeModel[] = [
        createNode('1', 150, 150), // Moved 50 px from (100, 100)
        createNode('2', 200, 200), // Not moved
        createNode('3', 100, 100), // New node
      ];

      const oldPositions = new Map([
        ['1', { x: 100, y: 100 }],
        ['2', { x: 200, y: 200 }],
      ]);

      const newNodeIds = ['3'];

      const constraints = {
        constraints: [
          {
            nodeId: '2',
            type: 'pin' as const,
            position: { x: 200, y: 200 },
            priority: 50,
          },
        ],
        conflictResolution: 'priority' as const,
      };

      const result = IncrementalLayoutManager.calculateResult(
        nodes,
        oldPositions,
        newNodeIds,
        constraints,
        'pin-existing'
      );

      expect(result.newlyLaidOutNodeIds).toEqual(['3']);
      expect(result.pinnedNodeIds).toContain('2');
      expect(result.movedNodeIds).toContain('1');
      expect(result.movedNodeIds).not.toContain('2'); // Didn't move
      expect(result.maxMovement).toBeCloseTo(70.71, 1); // sqrt(50^2 + 50^2)
      expect(result.strategy).toBe('pin-existing');
      expect(result.autoConstraintCount).toBe(1);
    });

    it('should handle case with no movement', () => {
      const nodes: NodeModel[] = [
        createNode('1', 100, 100),
        createNode('2', 200, 200),
      ];

      const oldPositions = new Map([
        ['1', { x: 100, y: 100 }],
        ['2', { x: 200, y: 200 }],
      ]);

      const result = IncrementalLayoutManager.calculateResult(
        nodes,
        oldPositions,
        [],
        { constraints: [] },
        'pin-existing'
      );

      expect(result.movedNodeIds).toEqual([]);
      expect(result.maxMovement).toBe(0);
      expect(result.avgMovement).toBe(0);
    });
  });
});

// Helper function to create test nodes
function createNode(id: string, x: number, y: number): NodeModel {
  const node = new NodeModel({ x, y }, { width: 100, height: 50 });
  node.id = id;

  // Mock getIncomingLinks and getOutgoingLinks with default empty arrays
  node.getIncomingLinks = jest.fn(() => []);
  node.getOutgoingLinks = jest.fn(() => []);

  return node;
}
