/**
 * Worker Layout Adapter Tests
 *
 * Tests for Web Worker-based layout computation system.
 * Note: These tests focus on API contracts and serialization since
 * Web Workers require a browser environment.
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import {
  WorkerLayoutAdapter,
  createWorkerDagreAdapter,
  createWorkerELKAdapter,
} from './worker-layout-adapter';
import {
  serializeNode,
  serializeLink,
  deserializePositions,
  LayoutWorkerPool,
} from './layout-worker.interface';

describe('WorkerLayoutAdapter', () => {
  describe('Serialization', () => {
    it('should serialize NodeModel correctly', () => {
      const node = new NodeModel({
        id: 'node1',
        type: 'process',
        position: { x: 100, y: 200 },
        size: { width: 150, height: 75 },
      });
      node.data = { label: 'Test Node' };

      const serialized = serializeNode(node);

      expect(serialized.id).toBe('node1');
      expect(serialized.nodeType).toBe('process');
      expect(serialized.position).toEqual({ x: 100, y: 200 });
      expect(serialized.size).toEqual({ width: 150, height: 75 });
      expect(serialized.data).toEqual({ label: 'Test Node' });
    });

    it('should serialize LinkModel correctly', () => {
      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = 'node1';
      link.targetNodeId = 'node2';
      link.data = { weight: 5 };

      const serialized = serializeLink(link);

      expect(serialized.id).toBeDefined();
      expect(serialized.sourceNodeId).toBe('node1');
      expect(serialized.targetNodeId).toBe('node2');
      expect(serialized.sourcePortId).toBe('port1');
      expect(serialized.targetPortId).toBe('port2');
      expect(serialized.data).toEqual({ weight: 5 });
    });

    it('should deserialize positions to nodes', () => {
      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
        new NodeModel({
          id: 'node2',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const positions = new Map([
        ['node1', { x: 100, y: 50 }],
        ['node2', { x: 200, y: 150 }],
      ]);

      deserializePositions(nodes, positions);

      expect(nodes[0].position).toEqual({ x: 100, y: 50 });
      expect(nodes[1].position).toEqual({ x: 200, y: 150 });
    });

    it('should handle missing node IDs in deserialization', () => {
      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 10, y: 20 },
        }),
      ];

      const positions = new Map([
        ['node2', { x: 100, y: 50 }], // Different ID
      ]);

      deserializePositions(nodes, positions);

      // Node1 should keep its original position
      expect(nodes[0].position).toEqual({ x: 10, y: 20 });
    });
  });

  describe('WorkerLayoutAdapter', () => {
    it('should create adapter with dagre backend', () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      expect(adapter.name).toBe('worker-dagre');
    });

    it('should create adapter with elk backend', () => {
      const adapter = new WorkerLayoutAdapter('elk');

      expect(adapter.name).toBe('worker-elk');
    });

    it('should report worker availability', () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      // In Node.js test environment, workers are typically not available
      const usingWorkers = adapter.isUsingWorkers();
      expect(typeof usingWorkers).toBe('boolean');
    });

    it('should provide worker statistics', () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const stats = adapter.getWorkerStats();

      expect(stats).toHaveProperty('totalWorkers');
      expect(stats).toHaveProperty('availableWorkers');
      expect(stats).toHaveProperty('activeRequests');
      expect(stats.totalWorkers).toBeGreaterThanOrEqual(0);
    });

    it('should fallback to main thread when workers unavailable', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
        new NodeModel({
          id: 'node2',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const links = [
        new LinkModel('', ''),
      ];
      links[0].sourceNodeId = 'node1';
      links[0].targetNodeId = 'node2';

      // This should use fallback adapter in test environment
      const result = await adapter.apply(nodes, links, {
        worker: { useWorker: false },
      });

      expect(result).toBeDefined();
      expect(result.nodePositions).toBeDefined();
      expect(result.nodePositions.size).toBe(2);
    });

    it('should validate options using fallback adapter', () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const validOptions = {
        calculateQuality: true,
      };

      const isValid = adapter.validateOptions(validOptions);
      expect(typeof isValid).toBe('boolean');
    });

    it('should support incremental layout', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 100, y: 100 },
        }),
      ];

      const links: LinkModel[] = [];

      const incrementalOptions = {
        newNodeIds: ['node1'],
        strategy: 'pin-existing' as const,
      };

      const result = await adapter.applyIncremental(
        nodes,
        links,
        incrementalOptions,
        { worker: { useWorker: false } }
      );

      expect(result).toBeDefined();
      expect(result.incremental).toBeDefined();
    });

    it('should cancel all active requests', () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      // Should not throw even if no active requests
      expect(() => adapter.cancelAll()).not.toThrow();
    });

    it('should terminate cleanly', () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      expect(() => adapter.terminate()).not.toThrow();

      // After termination, stats should show no workers
      const stats = adapter.getWorkerStats();
      expect(stats.totalWorkers).toBe(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create worker Dagre adapter', () => {
      const adapter = createWorkerDagreAdapter();

      expect(adapter).toBeInstanceOf(WorkerLayoutAdapter);
      expect(adapter.name).toBe('worker-dagre');
    });

    it('should create worker ELK adapter', () => {
      const adapter = createWorkerELKAdapter();

      expect(adapter).toBeInstanceOf(WorkerLayoutAdapter);
      expect(adapter.name).toBe('worker-elk');
    });

    it('should accept custom worker script URL', () => {
      const customUrl = '/custom/worker.js';
      const adapter = createWorkerDagreAdapter(customUrl);

      expect(adapter).toBeInstanceOf(WorkerLayoutAdapter);
    });
  });

  describe('LayoutWorkerPool', () => {
    it('should detect worker support', () => {
      const isSupported = LayoutWorkerPool.isSupported();

      expect(typeof isSupported).toBe('boolean');
    });

    it('should handle pool statistics', () => {
      if (!LayoutWorkerPool.isSupported()) {
        // Skip if workers not supported
        return;
      }

      const pool = new LayoutWorkerPool(2);
      const stats = pool.getStats();

      expect(stats).toHaveProperty('totalWorkers');
      expect(stats).toHaveProperty('availableWorkers');
      expect(stats).toHaveProperty('activeRequests');

      pool.terminate();
    });

    it('should cancel all requests safely', () => {
      if (!LayoutWorkerPool.isSupported()) {
        return;
      }

      const pool = new LayoutWorkerPool(1);

      // Should not throw even with no active requests
      expect(() => pool.cancelAll()).not.toThrow();

      pool.terminate();
    });

    it('should terminate cleanly', () => {
      if (!LayoutWorkerPool.isSupported()) {
        return;
      }

      const pool = new LayoutWorkerPool(1);

      expect(() => pool.terminate()).not.toThrow();

      // After termination
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(0);
      expect(stats.availableWorkers).toBe(0);
    });
  });

  describe('Worker Options', () => {
    it('should respect useWorker option', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const links: LinkModel[] = [];

      // Explicitly disable workers
      const result = await adapter.apply(nodes, links, {
        worker: {
          useWorker: false,
        },
      });

      expect(result).toBeDefined();
    });

    it('should respect fallbackToMainThread option', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const links: LinkModel[] = [];

      // Enable fallback
      const result = await adapter.apply(nodes, links, {
        worker: {
          fallbackToMainThread: true,
        },
      });

      expect(result).toBeDefined();
    });

    it('should handle timeout option', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const links: LinkModel[] = [];

      // Set a timeout
      const result = await adapter.apply(nodes, links, {
        worker: {
          useWorker: false, // Use main thread
          timeout: 5000,
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle empty node arrays', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const result = await adapter.apply([], [], {
        worker: { useWorker: false },
      });

      expect(result).toBeDefined();
      expect(result.nodePositions.size).toBe(0);
    });

    it('should handle nodes with no links', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
        new NodeModel({
          id: 'node2',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const result = await adapter.apply(nodes, [], {
        worker: { useWorker: false },
      });

      expect(result).toBeDefined();
      expect(result.nodePositions.size).toBe(2);
    });
  });

  describe('Integration with Layout Features', () => {
    it('should work with constraints', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 100, y: 100 },
        }),
      ];

      const result = await adapter.apply(nodes, [], {
        constraints: {
          constraints: [
            {
              nodeId: 'node1',
              position: { x: 100, y: 100 },
              type: 'pin',
              priority: 10,
            },
          ],
        },
        worker: { useWorker: false },
      });

      expect(result).toBeDefined();
      // Pinned node should be at constrained position
      const position = result.nodePositions.get('node1');
      expect(position).toBeDefined();
      expect(position!.x).toBe(100);
      expect(position!.y).toBe(100);
    });

    it('should work with quality metrics', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
        new NodeModel({
          id: 'node2',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const links = [
        new LinkModel('', ''),
      ];
      links[0].sourceNodeId = 'node1';
      links[0].targetNodeId = 'node2';

      const result = await adapter.apply(nodes, links, {
        calculateQuality: true,
        worker: { useWorker: false },
      });

      expect(result).toBeDefined();
      expect(result.quality).toBeDefined();
    });

    it('should work with edge bundling', async () => {
      const adapter = new WorkerLayoutAdapter('dagre');

      const nodes = [
        new NodeModel({
          id: 'node1',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
        new NodeModel({
          id: 'node2',
          type: 'default',
          position: { x: 0, y: 0 },
        }),
      ];

      const links = [
        new LinkModel('', ''),
      ];
      links[0].sourceNodeId = 'node1';
      links[0].targetNodeId = 'node2';

      const result = await adapter.apply(nodes, links, {
        edgeBundling: {
          enabled: true,
          strategy: 'stub',
        },
        worker: { useWorker: false },
      });

      expect(result).toBeDefined();
      expect(result.edgeBundling).toBeDefined();
    });
  });
});
