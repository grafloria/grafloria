/**
 * Unit tests for DagreLayoutAdapter
 */

import { DagreLayoutAdapter, DagreLayoutOptions } from './dagre-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

describe('DagreLayoutAdapter', () => {
  let adapter: DagreLayoutAdapter;

  beforeEach(() => {
    adapter = new DagreLayoutAdapter();
  });

  describe('Basic functionality', () => {
    it('should create adapter with correct name', () => {
      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('dagre');
    });

    it('should handle empty node array', async () => {
      const result = await adapter.apply([], []);

      expect(result.nodePositions.size).toBe(0);
      expect(result.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
      expect(result.metadata?.algorithm).toBe('dagre');
    });

    it('should handle single node', async () => {
      const node = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const result = await adapter.apply([node], []);

      expect(result.nodePositions.size).toBe(1);
      expect(result.nodePositions.has('1')).toBe(true);
      expect(result.metadata?.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Layout direction', () => {
    it('should layout nodes top-to-bottom (TB)', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], { rankdir: 'TB' });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be below node 1 in TB layout
      expect(pos2.y).toBeGreaterThan(pos1.y);
    });

    it('should layout nodes left-to-right (LR)', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], { rankdir: 'LR' });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be to the right of node 1 in LR layout
      expect(pos2.x).toBeGreaterThan(pos1.x);
    });

    it('should layout nodes bottom-to-top (BT)', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], { rankdir: 'BT' });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be above node 1 in BT layout
      expect(pos2.y).toBeLessThan(pos1.y);
    });

    it('should layout nodes right-to-left (RL)', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], { rankdir: 'RL' });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be to the left of node 1 in RL layout
      expect(pos2.x).toBeLessThan(pos1.x);
    });
  });

  describe('Spacing options', () => {
    it('should respect nodesep option', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node3 = new NodeModel({ id: '3', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link1 = new LinkModel('port1', 'port2');
      link1.sourceNodeId = '1';
      link1.targetNodeId = '2';
      const link2 = new LinkModel('port1', 'port3');
      link2.sourceNodeId = '1';
      link2.targetNodeId = '3';

      const result = await adapter.apply([node1, node2, node3], [link1, link2], {
        rankdir: 'TB',
        nodesep: 100,
      });

      const pos2 = result.nodePositions.get('2')!;
      const pos3 = result.nodePositions.get('3')!;

      // Nodes 2 and 3 should be separated horizontally by at least nodesep
      const distance = Math.abs(pos3.x - pos2.x);
      expect(distance).toBeGreaterThanOrEqual(100);
    });

    it('should respect ranksep option', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], {
        rankdir: 'TB',
        ranksep: 150,
      });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Vertical separation should be at least ranksep
      const distance = pos2.y - (pos1.y + 50); // 50 is node height
      expect(distance).toBeGreaterThanOrEqual(150);
    });
  });

  describe('Ranker algorithms', () => {
    const createTestGraph = () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      return { nodes: [node1, node2], links: [link] };
    };

    it('should support network-simplex ranker', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        ranker: 'network-simplex',
      });

      expect(result.metadata?.['ranker']).toBe('network-simplex');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support tight-tree ranker', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        ranker: 'tight-tree',
      });

      expect(result.metadata?.['ranker']).toBe('tight-tree');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support longest-path ranker', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        ranker: 'longest-path',
      });

      expect(result.metadata?.['ranker']).toBe('longest-path');
      expect(result.nodePositions.size).toBe(2);
    });
  });

  describe('Option validation', () => {
    it('should validate rankdir option', () => {
      expect(adapter.validateOptions({ rankdir: 'TB' })).toBe(true);
      expect(adapter.validateOptions({ rankdir: 'BT' })).toBe(true);
      expect(adapter.validateOptions({ rankdir: 'LR' })).toBe(true);
      expect(adapter.validateOptions({ rankdir: 'RL' })).toBe(true);
      expect(adapter.validateOptions({ rankdir: 'INVALID' as any })).toBe(false);
    });

    it('should validate align option', () => {
      expect(adapter.validateOptions({ align: 'UL' })).toBe(true);
      expect(adapter.validateOptions({ align: 'UR' })).toBe(true);
      expect(adapter.validateOptions({ align: 'DL' })).toBe(true);
      expect(adapter.validateOptions({ align: 'DR' })).toBe(true);
      expect(adapter.validateOptions({ align: 'INVALID' as any })).toBe(false);
    });

    it('should validate ranker option', () => {
      expect(adapter.validateOptions({ ranker: 'network-simplex' })).toBe(true);
      expect(adapter.validateOptions({ ranker: 'tight-tree' })).toBe(true);
      expect(adapter.validateOptions({ ranker: 'longest-path' })).toBe(true);
      expect(adapter.validateOptions({ ranker: 'invalid' as any })).toBe(false);
    });

    it('should validate numeric options are positive', () => {
      expect(adapter.validateOptions({ nodesep: 50 })).toBe(true);
      expect(adapter.validateOptions({ nodesep: -10 })).toBe(false);
      expect(adapter.validateOptions({ edgesep: 20 })).toBe(true);
      expect(adapter.validateOptions({ edgesep: -5 })).toBe(false);
      expect(adapter.validateOptions({ ranksep: 100 })).toBe(true);
      expect(adapter.validateOptions({ ranksep: -20 })).toBe(false);
    });
  });

  describe('Bounds calculation', () => {
    it('should calculate correct bounds', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link]);

      expect(result.bounds).toBeDefined();
      expect(result.bounds.width).toBeGreaterThan(0);
      expect(result.bounds.height).toBeGreaterThan(0);
    });
  });

  describe('Metadata', () => {
    it('should return execution time in metadata', async () => {
      const node = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const result = await adapter.apply([node], []);

      expect(result.metadata).toBeDefined();
      expect(result.metadata!.executionTime).toBeGreaterThan(0);
      expect(result.metadata!.algorithm).toBe('dagre');
      expect(result.metadata!['nodeCount']).toBe(1);
      expect(result.metadata!['linkCount']).toBe(0);
    });

    it('should include direction in metadata', async () => {
      const node = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const result = await adapter.apply([node], [], { rankdir: 'LR' });

      expect(result.metadata!['direction']).toBe('LR');
    });
  });

  describe('Performance', () => {
    it('should layout 100 nodes in reasonable time', async () => {
      const nodes: NodeModel[] = [];
      const links: LinkModel[] = [];

      // Create a tree structure
      for (let i = 0; i < 100; i++) {
        const node = new NodeModel({ id: `${i}`, type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
        nodes.push(node);

        if (i > 0) {
          const link = new LinkModel(`port${Math.floor((i - 1) / 2)}`, `port${i}`);
          link.sourceNodeId = `${Math.floor((i - 1) / 2)}`;
          link.targetNodeId = `${i}`;
          links.push(link);
        }
      }

      const startTime = performance.now();
      const result = await adapter.apply(nodes, links);
      const executionTime = performance.now() - startTime;

      expect(result.nodePositions.size).toBe(100);
      expect(executionTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });

  describe('Layout Constraints', () => {
    it('should pin node to fixed position', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], {
        rankdir: 'TB',
        constraints: {
          constraints: [
            {
              nodeId: '1',
              type: 'pin',
              position: { x: 100, y: 50 },
            },
          ],
        },
      });

      // Node 1 should be pinned to exact position
      const pos1 = result.nodePositions.get('1')!;
      expect(pos1.x).toBe(100);
      expect(pos1.y).toBe(50);

      // Node 2 should be laid out normally
      expect(result.nodePositions.has('2')).toBe(true);
    });

    it('should fix X coordinate while allowing Y to vary', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node2 = new NodeModel({ id: '2', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
      const node3 = new NodeModel({ id: '3', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const link1 = new LinkModel('port1', 'port2');
      link1.sourceNodeId = '1';
      link1.targetNodeId = '2';
      // Chain 2→3 so the nodes land on DIFFERENT ranks: TB siblings share the
      // same y by design, which would make the "Y varies" assertion meaningless
      const link2 = new LinkModel('port2', 'port3');
      link2.sourceNodeId = '2';
      link2.targetNodeId = '3';

      const result = await adapter.apply([node1, node2, node3], [link1, link2], {
        rankdir: 'TB',
        constraints: {
          constraints: [
            {
              nodeId: '2',
              type: 'fix-x',
              value: 200,
            },
            {
              nodeId: '3',
              type: 'fix-x',
              value: 200,
            },
          ],
        },
      });

      // Nodes 2 and 3 should have fixed X coordinate
      const pos2 = result.nodePositions.get('2')!;
      const pos3 = result.nodePositions.get('3')!;
      expect(pos2.x).toBe(200);
      expect(pos3.x).toBe(200);

      // But Y coordinates should be different (laid out vertically)
      expect(pos2.y).not.toBe(pos3.y);
    });

    it('should clamp positions within boundaries', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const result = await adapter.apply([node1], [], {
        constraints: {
          constraints: [
            {
              nodeId: '1',
              type: 'boundary',
              boundary: { minX: 100, maxX: 500, minY: 100, maxY: 300 },
            },
          ],
        },
      });

      const pos1 = result.nodePositions.get('1')!;
      // Position should be within boundaries
      expect(pos1.x).toBeGreaterThanOrEqual(100);
      expect(pos1.x).toBeLessThanOrEqual(500);
      expect(pos1.y).toBeGreaterThanOrEqual(100);
      expect(pos1.y).toBeLessThanOrEqual(300);
    });

    it('should handle multiple constraints with priority', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const result = await adapter.apply([node1], [], {
        constraints: {
          constraints: [
            {
              nodeId: '1',
              type: 'fix-x',
              value: 150,
              priority: 1,
            },
            {
              nodeId: '1',
              type: 'fix-y',
              value: 250,
              priority: 2,
            },
          ],
          conflictResolution: 'priority',
        },
      });

      const pos1 = result.nodePositions.get('1')!;
      expect(pos1.x).toBe(150);
      expect(pos1.y).toBe(250);
    });

    it('should work without constraints', async () => {
      const node1 = new NodeModel({ id: '1', type: 'layout-test', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });

      const result = await adapter.apply([node1], []);

      // Should work normally without constraints
      expect(result.nodePositions.has('1')).toBe(true);
    });
  });
});
