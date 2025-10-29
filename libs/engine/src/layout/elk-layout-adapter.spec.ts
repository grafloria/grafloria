/**
 * Unit tests for ELKLayoutAdapter
 */

import { ELKLayoutAdapter, ELKLayoutOptions, ELKAlgorithm } from './elk-layout-adapter';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

describe('ELKLayoutAdapter', () => {
  let adapter: ELKLayoutAdapter;

  beforeEach(() => {
    adapter = new ELKLayoutAdapter();
  });

  describe('Basic functionality', () => {
    it('should create adapter with correct name', () => {
      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('elk');
    });

    it('should handle empty node array', async () => {
      const result = await adapter.apply([], []);

      expect(result.nodePositions.size).toBe(0);
      expect(result.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
      expect(result.metadata?.algorithm).toBe('elk');
    });

    it('should handle single node', async () => {
      const node = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node.id = '1';

      const result = await adapter.apply([node], []);

      expect(result.nodePositions.size).toBe(1);
      expect(result.nodePositions.has('1')).toBe(true);
      expect(result.metadata?.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Layout algorithms', () => {
    const createTestGraph = () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      return { nodes: [node1, node2], links: [link] };
    };

    it('should support layered algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'layered',
      });

      expect(result.metadata?.elkAlgorithm).toBe('layered');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support force algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'force',
      });

      expect(result.metadata?.elkAlgorithm).toBe('force');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support stress algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'stress',
      });

      expect(result.metadata?.elkAlgorithm).toBe('stress');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support mrtree algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'mrtree',
      });

      expect(result.metadata?.elkAlgorithm).toBe('mrtree');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support radial algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'radial',
      });

      expect(result.metadata?.elkAlgorithm).toBe('radial');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should support disco algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'disco',
      });

      expect(result.metadata?.elkAlgorithm).toBe('disco');
      expect(result.nodePositions.size).toBe(2);
    });

    it('should default to layered algorithm', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links);

      expect(result.metadata?.elkAlgorithm).toBe('layered');
    });
  });

  describe('Layout direction', () => {
    const createTestGraph = () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      return { nodes: [node1, node2], links: [link] };
    };

    it('should layout nodes left-to-right (RIGHT)', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'layered',
        'elk.direction': 'RIGHT',
      });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be to the right of node 1
      expect(pos2.x).toBeGreaterThan(pos1.x);
      expect(result.metadata?.direction).toBe('RIGHT');
    });

    it('should layout nodes top-to-bottom (DOWN)', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'layered',
        'elk.direction': 'DOWN',
      });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be below node 1
      expect(pos2.y).toBeGreaterThan(pos1.y);
    });

    it('should layout nodes right-to-left (LEFT)', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'layered',
        'elk.direction': 'LEFT',
      });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be to the left of node 1
      expect(pos2.x).toBeLessThan(pos1.x);
    });

    it('should layout nodes bottom-to-top (UP)', async () => {
      const { nodes, links } = createTestGraph();
      const result = await adapter.apply(nodes, links, {
        algorithm: 'layered',
        'elk.direction': 'UP',
      });

      const pos1 = result.nodePositions.get('1')!;
      const pos2 = result.nodePositions.get('2')!;

      // Node 2 should be above node 1
      expect(pos2.y).toBeLessThan(pos1.y);
    });
  });

  describe('Spacing options', () => {
    it('should respect node spacing option', async () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';
      const node3 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node3.id = '3';

      const link1 = new LinkModel('port1', 'port2');
      link1.sourceNodeId = '1';
      link1.targetNodeId = '2';
      const link2 = new LinkModel('port1', 'port3');
      link2.sourceNodeId = '1';
      link2.targetNodeId = '3';

      const result = await adapter.apply([node1, node2, node3], [link1, link2], {
        algorithm: 'layered',
        'elk.spacing.nodeNode': 100,
      });

      // Should complete successfully with spacing applied
      expect(result.nodePositions.size).toBe(3);
    });
  });

  describe('Layered algorithm options', () => {
    const createTestGraph = () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      return { nodes: [node1, node2], links: [link] };
    };

    it('should support node placement strategies', async () => {
      const { nodes, links } = createTestGraph();
      const strategies: Array<
        'SIMPLE' | 'INTERACTIVE' | 'LINEAR_SEGMENTS' | 'BRANDES_KOEPF' | 'NETWORK_SIMPLEX'
      > = ['SIMPLE', 'INTERACTIVE', 'LINEAR_SEGMENTS', 'BRANDES_KOEPF', 'NETWORK_SIMPLEX'];

      for (const strategy of strategies) {
        const result = await adapter.apply(nodes, links, {
          algorithm: 'layered',
          'elk.layered.nodePlacement.strategy': strategy,
        });

        expect(result.nodePositions.size).toBe(2);
      }
    });

    it('should support crossing minimization strategies', async () => {
      const { nodes, links } = createTestGraph();
      const strategies: Array<'LAYER_SWEEP' | 'INTERACTIVE'> = ['LAYER_SWEEP', 'INTERACTIVE'];

      for (const strategy of strategies) {
        const result = await adapter.apply(nodes, links, {
          algorithm: 'layered',
          'elk.layered.crossingMinimization.strategy': strategy,
        });

        expect(result.nodePositions.size).toBe(2);
      }
    });
  });

  describe('Force algorithm options', () => {
    it('should support force algorithm options', async () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], {
        algorithm: 'force',
        'elk.force.repulsion': 100,
        'elk.force.temperature': 0.5,
        'elk.force.iterations': 50,
      });

      expect(result.nodePositions.size).toBe(2);
    });
  });

  describe('Radial algorithm options', () => {
    it('should support radial algorithm options', async () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';

      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = '1';
      link.targetNodeId = '2';

      const result = await adapter.apply([node1, node2], [link], {
        algorithm: 'radial',
        'elk.radial.radius': 200,
        'elk.radial.compaction': true,
      });

      expect(result.nodePositions.size).toBe(2);
    });
  });

  describe('Option validation', () => {
    it('should validate algorithm option', () => {
      expect(adapter.validateOptions({ algorithm: 'layered' })).toBe(true);
      expect(adapter.validateOptions({ algorithm: 'force' })).toBe(true);
      expect(adapter.validateOptions({ algorithm: 'stress' })).toBe(true);
      expect(adapter.validateOptions({ algorithm: 'mrtree' })).toBe(true);
      expect(adapter.validateOptions({ algorithm: 'radial' })).toBe(true);
      expect(adapter.validateOptions({ algorithm: 'disco' })).toBe(true);
      expect(adapter.validateOptions({ algorithm: 'invalid' as any })).toBe(false);
    });

    it('should validate direction option', () => {
      expect(adapter.validateOptions({ 'elk.direction': 'RIGHT' })).toBe(true);
      expect(adapter.validateOptions({ 'elk.direction': 'LEFT' })).toBe(true);
      expect(adapter.validateOptions({ 'elk.direction': 'DOWN' })).toBe(true);
      expect(adapter.validateOptions({ 'elk.direction': 'UP' })).toBe(true);
      expect(adapter.validateOptions({ 'elk.direction': 'INVALID' as any })).toBe(false);
    });

    it('should validate node placement strategy', () => {
      expect(adapter.validateOptions({ 'elk.layered.nodePlacement.strategy': 'SIMPLE' })).toBe(
        true
      );
      expect(
        adapter.validateOptions({ 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' })
      ).toBe(true);
      expect(
        adapter.validateOptions({ 'elk.layered.nodePlacement.strategy': 'INVALID' as any })
      ).toBe(false);
    });

    it('should validate numeric options are positive', () => {
      expect(adapter.validateOptions({ 'elk.spacing.nodeNode': 50 })).toBe(true);
      expect(adapter.validateOptions({ 'elk.spacing.nodeNode': -10 })).toBe(false);
      expect(adapter.validateOptions({ 'elk.force.repulsion': 100 })).toBe(true);
      expect(adapter.validateOptions({ 'elk.force.repulsion': -20 })).toBe(false);
    });
  });

  describe('Bounds calculation', () => {
    it('should calculate correct bounds', async () => {
      const node1 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node1.id = '1';
      const node2 = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node2.id = '2';

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
      const node = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node.id = '1';

      const result = await adapter.apply([node], []);

      expect(result.metadata).toBeDefined();
      expect(result.metadata!.executionTime).toBeGreaterThan(0);
      expect(result.metadata!.algorithm).toBe('elk');
      expect(result.metadata!.nodeCount).toBe(1);
      expect(result.metadata!.linkCount).toBe(0);
    });

    it('should include algorithm in metadata', async () => {
      const node = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
      node.id = '1';

      const result = await adapter.apply([node], [], { algorithm: 'force' });

      expect(result.metadata!.elkAlgorithm).toBe('force');
    });
  });

  describe('Performance', () => {
    it('should layout 100 nodes in reasonable time', async () => {
      const nodes: NodeModel[] = [];
      const links: LinkModel[] = [];

      // Create a tree structure
      for (let i = 0; i < 100; i++) {
        const node = new NodeModel({ x: 0, y: 0 }, { width: 100, height: 50 });
        node.id = `${i}`;
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
      expect(executionTime).toBeLessThan(2000); // Should complete in less than 2 seconds
    });
  });
});
