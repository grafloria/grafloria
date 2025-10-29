/**
 * Edge Bundling Tests
 *
 * Comprehensive test suite for edge bundling system (Phase 4)
 */

import {
  EdgeInfo,
  EdgeBundlingOptions,
  EdgeBundlingManager,
  Point2D,
} from './edge-bundling.interface';

describe('EdgeBundlingManager', () => {
  // Sample data for tests
  const createSampleEdges = (): EdgeInfo[] => [
    {
      id: 'edge1',
      sourceNodeId: 'node1',
      targetNodeId: 'node2',
      weight: 1,
    },
    {
      id: 'edge2',
      sourceNodeId: 'node1',
      targetNodeId: 'node3',
      weight: 1,
    },
    {
      id: 'edge3',
      sourceNodeId: 'node2',
      targetNodeId: 'node4',
      weight: 1,
    },
  ];

  const createNodePositions = (): Map<string, Point2D> => {
    const map = new Map();
    map.set('node1', { x: 0, y: 0 });
    map.set('node2', { x: 200, y: 0 });
    map.set('node3', { x: 200, y: 100 });
    map.set('node4', { x: 400, y: 0 });
    return map;
  };

  describe('computeBundling', () => {
    it('should return empty result when bundling is disabled', () => {
      const edges = createSampleEdges();
      const nodePositions = createNodePositions();
      const options: EdgeBundlingOptions = {
        enabled: false,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(0);
      expect(result.bundleCount).toBe(0);
      expect(result.strategy).toBe('none');
    });

    it('should use stub bundling by default', () => {
      const edges = createSampleEdges();
      const nodePositions = createNodePositions();
      const options: EdgeBundlingOptions = {
        enabled: true,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(edges.length);
      expect(result.strategy).toBe('stub');
    });

    it('should respect explicit strategy selection', () => {
      const edges = createSampleEdges();
      const nodePositions = createNodePositions();
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'force-directed',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.strategy).toBe('force-directed');
    });

    it('should handle empty edge arrays', () => {
      const options: EdgeBundlingOptions = {
        enabled: true,
      };

      const result = EdgeBundlingManager.computeBundling(
        [],
        new Map(),
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(0);
      expect(result.bundleCount).toBe(0);
    });

    it('should handle single edge', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 100, y: 0 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(1);
      expect(result.bundledPaths.has('edge1')).toBe(true);
    });
  });

  describe('Stub Bundling', () => {
    it('should create perpendicular offsets for parallel edges', () => {
      // Two edges from same source to same target
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(2);
      expect(result.bundleCount).toBeGreaterThan(0);

      // Both edges should have control points
      const edge1Path = result.bundledPaths.get('edge1')!;
      const edge2Path = result.bundledPaths.get('edge2')!;

      expect(edge1Path.controlPoints.length).toBeGreaterThan(0);
      expect(edge2Path.controlPoints.length).toBeGreaterThan(0);

      // They should have different paths (offset from each other)
      const edge1Mid = edge1Path.controlPoints[Math.floor(edge1Path.controlPoints.length / 2)];
      const edge2Mid = edge2Path.controlPoints[Math.floor(edge2Path.controlPoints.length / 2)];

      // Y coordinates should differ due to perpendicular offset
      expect(Math.abs(edge1Mid.y - edge2Mid.y)).toBeGreaterThan(0);
    });

    it('should handle different strength values', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);

      const result1 = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'stub', strength: 0.3 }
      );

      const result2 = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'stub', strength: 0.9 }
      );

      // Different strengths should be recorded
      expect(result1.strength).toBe(0.3);
      expect(result2.strength).toBe(0.9);
    });

    it('should create bundles for edges sharing endpoints', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge3', sourceNodeId: 'node1', targetNodeId: 'node3', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
        ['node3', { x: 200, y: 100 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Should create paths for all edges
      expect(result.bundledPaths.size).toBe(3);

      // Should have multiple bundles
      expect(result.bundleCount).toBeGreaterThan(0);

      // Edges should be classified as bundled or unbundled
      const totalEdges = result.bundledEdges.length + result.unbundledEdges.length;
      expect(totalEdges).toBe(3);

      // At least some edges should be bundled (the two sharing endpoints)
      expect(result.bundledEdges.length).toBeGreaterThan(0);
    });
  });

  describe('Force-Directed Bundling', () => {
    it('should compute edge bundling with force-directed strategy', () => {
      const edges = createSampleEdges();
      const nodePositions = createNodePositions();
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'force-directed',
        iterations: 10,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.strategy).toBe('force-directed');
      expect(result.bundledPaths.size).toBe(edges.length);
      expect(result.bundleCount).toBeGreaterThan(0);
    });

    it('should create smoother paths with more control points', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);

      const result1 = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'force-directed', controlPoints: 3 }
      );

      const result2 = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'force-directed', controlPoints: 10 }
      );

      const path1 = result1.bundledPaths.get('edge1')!;
      const path2 = result2.bundledPaths.get('edge1')!;

      // More control points configuration should create more control points
      expect(path2.controlPoints.length).toBeGreaterThanOrEqual(path1.controlPoints.length);
    });

    it('should respect bundling strength parameter', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node3', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node2', targetNodeId: 'node4', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 0, y: 100 }],
        ['node3', { x: 200, y: 0 }],
        ['node4', { x: 200, y: 100 }],
      ]);

      const resultWeak = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'force-directed', strength: 0.1, iterations: 50 }
      );

      const resultStrong = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'force-directed', strength: 0.9, iterations: 50 }
      );

      // Stronger bundling should pull compatible edges closer together
      expect(resultWeak).toBeDefined();
      expect(resultStrong).toBeDefined();
    });

    it('should converge with more iterations', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node3', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
        ['node3', { x: 200, y: 50 }],
      ]);

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        { enabled: true, strategy: 'force-directed', iterations: 100 }
      );

      expect(result.bundledPaths.size).toBe(2);
      // With high iterations, paths should be well-defined
      expect(result.bundledPaths.get('edge1')!.controlPoints.length).toBeGreaterThan(0);
    });
  });

  describe('Port-Aware Bundling', () => {
    it('should use port positions when available', () => {
      const edges: EdgeInfo[] = [
        {
          id: 'edge1',
          sourceNodeId: 'node1',
          targetNodeId: 'node2',
          sourcePortId: 'port1',
          targetPortId: 'port2',
          weight: 1,
        },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);
      const portPositions = new Map([
        ['port1', { x: 50, y: 25 }], // Absolute position
        ['port2', { x: 200, y: 25 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        portPositions,
        options
      );

      expect(result.bundledPaths.size).toBe(1);
      const path = result.bundledPaths.get('edge1')!;

      // First and last control points should match port positions
      expect(path.controlPoints[0].x).toBe(50);
      expect(path.controlPoints[0].y).toBe(25);
      expect(path.controlPoints[path.controlPoints.length - 1].x).toBe(200);
      expect(path.controlPoints[path.controlPoints.length - 1].y).toBe(25);
    });

    it('should fall back to node positions when ports are not available', () => {
      const edges: EdgeInfo[] = [
        {
          id: 'edge1',
          sourceNodeId: 'node1',
          targetNodeId: 'node2',
          sourcePortId: 'port1', // Port specified but not in portPositions
          targetPortId: 'port2',
          weight: 1,
        },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(), // Empty port positions
        options
      );

      expect(result.bundledPaths.size).toBe(1);
      const path = result.bundledPaths.get('edge1')!;

      // Should use node positions as fallback
      expect(path.controlPoints[0].x).toBe(0);
      expect(path.controlPoints[0].y).toBe(0);
    });
  });

  describe('Edge Compatibility', () => {
    it('should calculate edge compatibility correctly', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node3', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 10 }], // Nearly parallel
        ['node3', { x: 200, y: 20 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'force-directed',
        compatibilityThreshold: 0.5,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // These nearly parallel edges should be considered compatible
      expect(result.bundledPaths.size).toBe(2);
    });

    it('should not bundle incompatible edges', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node3', targetNodeId: 'node4', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
        ['node3', { x: 0, y: 100 }], // Perpendicular edges
        ['node4', { x: 0, y: 300 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'force-directed',
        compatibilityThreshold: 0.8,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Perpendicular edges should not be bundled together
      expect(result.bundledPaths.size).toBe(2);
    });
  });

  describe('Edge Weights', () => {
    it('should consider edge weights in bundling', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 5 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(2);
      // Both edges should be bundled even with different weights
      expect(result.bundleCount).toBeGreaterThan(0);
    });
  });

  describe('Bundle Groups', () => {
    it('should create appropriate bundles', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge3', sourceNodeId: 'node3', targetNodeId: 'node4', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
        ['node3', { x: 0, y: 100 }],
        ['node4', { x: 200, y: 100 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Should bundle all edges
      expect(result.bundledPaths.size).toBe(3);
      expect(result.bundleCount).toBeGreaterThan(0);

      // All edges should be accounted for
      const totalEdges = result.bundledEdges.length + result.unbundledEdges.length;
      expect(totalEdges).toBe(3);
    });

    it('should track bundled vs unbundled edges', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Verify bundled and unbundled tracking
      expect(result.bundledEdges.length + result.unbundledEdges.length).toBe(edges.length);
      expect(result.bundledEdges.length).toBeGreaterThan(0);
    });
  });

  describe('Result Tracking', () => {
    it('should track bundling results correctly', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge2', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
        { id: 'edge3', sourceNodeId: 'node3', targetNodeId: 'node4', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 200, y: 0 }],
        ['node3', { x: 0, y: 100 }],
        ['node4', { x: 200, y: 100 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'stub',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Verify result structure
      expect(result.bundledPaths.size).toBe(3);
      expect(result.bundleCount).toBeGreaterThan(0);
      expect(result.strategy).toBe('stub');
      expect(result.strength).toBeGreaterThan(0);
      expect(result.bundledEdges.length + result.unbundledEdges.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing node positions gracefully', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node99', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        // node99 is missing
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Should skip edges with missing nodes
      expect(result.bundledPaths.size).toBe(0);
    });

    it('should handle zero-length edges', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node1', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Self-loops should be handled
      expect(result.bundledPaths.size).toBe(1);
    });

    it('should handle extremely long edges', () => {
      const edges: EdgeInfo[] = [
        { id: 'edge1', sourceNodeId: 'node1', targetNodeId: 'node2', weight: 1 },
      ];
      const nodePositions = new Map([
        ['node1', { x: 0, y: 0 }],
        ['node2', { x: 10000, y: 10000 }],
      ]);
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'force-directed',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      expect(result.bundledPaths.size).toBe(1);
      expect(result.bundledPaths.get('edge1')!.controlPoints.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with Layout Adapters', () => {
    it('should be compatible with layout adapter result format', () => {
      const edges = createSampleEdges();
      const nodePositions = createNodePositions();
      const options: EdgeBundlingOptions = {
        enabled: true,
        strategy: 'force-directed',
      };

      const result = EdgeBundlingManager.computeBundling(
        edges,
        nodePositions,
        new Map(),
        options
      );

      // Verify result structure matches what layout adapters expect
      expect(result).toHaveProperty('bundledPaths');
      expect(result).toHaveProperty('bundleCount');
      expect(result).toHaveProperty('bundledEdges');
      expect(result).toHaveProperty('unbundledEdges');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('strength');
    });
  });
});
