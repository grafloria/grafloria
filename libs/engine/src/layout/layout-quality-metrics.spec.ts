/**
 * Unit tests for Layout Quality Metrics
 */

import { LayoutQualityMetrics, LayoutQualityResult } from './layout-quality-metrics';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';

describe('LayoutQualityMetrics', () => {
  describe('assess()', () => {
    it('should return quality result with all metrics', () => {
      const nodes = createSimpleLayout();
      const links = createSimpleLinks(nodes);

      const result = LayoutQualityMetrics.assess(nodes, links);

      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.grade).toMatch(/^[ABCDF]$/);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.edgeCrossings).toBeDefined();
      expect(result.metrics.nodeOverlap).toBeDefined();
      expect(result.metrics.edgeLength).toBeDefined();
      expect(result.metrics.nodeDistribution).toBeDefined();
      expect(result.metrics.symmetry).toBeDefined();
      expect(result.metrics.aspectRatio).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should include suggestions when requested', () => {
      const nodes = createOverlappingNodes();
      const links: LinkModel[] = [];

      const result = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
      });

      expect(result.topSuggestions).toBeDefined();
      expect(result.topSuggestions.length).toBeGreaterThan(0);
      expect(result.metrics.nodeOverlap.suggestions).toBeDefined();
      expect(result.metrics.nodeOverlap.suggestions!.length).toBeGreaterThan(0);
    });

    it('should handle empty diagram', () => {
      const result = LayoutQualityMetrics.assess([], []);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.grade).toBeDefined();
    });

    it('should use custom weights', () => {
      const nodes = createSimpleLayout();
      const links = createSimpleLinks(nodes);

      const result = LayoutQualityMetrics.assess(nodes, links, {
        customWeights: {
          edgeCrossings: 0.5,
          nodeOverlap: 0.5,
          edgeLength: 0,
          nodeDistribution: 0,
          symmetry: 0,
          aspectRatio: 0,
        },
      });

      expect(result).toBeDefined();
      expect(result.metrics.edgeCrossings.weight).toBe(0.5);
      expect(result.metrics.nodeOverlap.weight).toBe(0.5);
    });
  });

  describe('Edge Crossings Metric', () => {
    it('should score 100 for no crossings', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 200, 0),
        createNode('3', 0, 200),
        createNode('4', 200, 200),
      ];

      const links = [
        createLink('1', '2'),
        createLink('3', '4'),
      ];

      const result = LayoutQualityMetrics.assess(nodes, links);

      expect(result.metrics.edgeCrossings.score).toBe(100);
    });

    it('should detect crossing edges', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 200, 200),
        createNode('3', 0, 200),
        createNode('4', 200, 0),
      ];

      const links = [
        createLink('1', '2'), // Crosses with link 2
        createLink('3', '4'),
      ];

      const result = LayoutQualityMetrics.assess(nodes, links);

      expect(result.metrics.edgeCrossings.score).toBeLessThan(100);
    });

    it('should provide suggestions for crossings', () => {
      const nodes = createCrossingLayout();
      const links = createCrossingLinks(nodes);

      const result = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
      });

      expect(result.metrics.edgeCrossings.suggestions).toBeDefined();
      expect(result.metrics.edgeCrossings.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('Node Overlap Metric', () => {
    it('should score 100 for no overlaps', () => {
      const nodes = [
        createNode('1', 0, 0, 100, 50),
        createNode('2', 150, 0, 100, 50), // No overlap
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.nodeOverlap.score).toBe(100);
    });

    it('should detect overlapping nodes', () => {
      const nodes = [
        createNode('1', 0, 0, 100, 50),
        createNode('2', 50, 0, 100, 50), // Overlaps with node 1
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.nodeOverlap.score).toBeLessThan(100);
    });

    it('should provide suggestions for overlaps', () => {
      const nodes = createOverlappingNodes();

      const result = LayoutQualityMetrics.assess(nodes, [], {
        includeSuggestions: true,
      });

      expect(result.metrics.nodeOverlap.suggestions).toBeDefined();
      expect(result.metrics.nodeOverlap.suggestions!.length).toBeGreaterThan(0);
      expect(result.metrics.nodeOverlap.suggestions![0]).toContain('overlap');
    });
  });

  describe('Edge Length Metric', () => {
    it('should score well for ideal edge lengths (100-300px)', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 200, 0), // 200px apart (ideal)
      ];

      const links = [createLink('1', '2')];

      const result = LayoutQualityMetrics.assess(nodes, links);

      expect(result.metrics.edgeLength.score).toBeGreaterThan(90);
    });

    it('should score lower for very short edges', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 30, 0), // 30px apart (too short)
      ];

      const links = [createLink('1', '2')];

      const result = LayoutQualityMetrics.assess(nodes, links);

      expect(result.metrics.edgeLength.score).toBeLessThan(80);
    });

    it('should score lower for very long edges', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 700, 0), // 700px apart (too long)
      ];

      const links = [createLink('1', '2')];

      const result = LayoutQualityMetrics.assess(nodes, links);

      expect(result.metrics.edgeLength.score).toBeLessThan(80);
    });
  });

  describe('Node Distribution Metric', () => {
    it('should score well for evenly distributed nodes', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 100, 0),
        createNode('3', 0, 100),
        createNode('4', 100, 100),
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.nodeDistribution.score).toBeGreaterThan(70);
    });

    it('should score lower for clustered nodes', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 10, 0),
        createNode('3', 0, 10),
        createNode('4', 500, 500), // Outlier
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.nodeDistribution.score).toBeLessThan(90);
    });
  });

  describe('Symmetry Metric', () => {
    it('should score well for symmetric layouts', () => {
      const nodes = [
        createNode('1', 50, 50),
        createNode('2', 150, 50),
        createNode('3', 50, 150),
        createNode('4', 150, 150),
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.symmetry.score).toBeGreaterThan(90);
    });

    it('should score lower for asymmetric layouts', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 10, 0),
        createNode('3', 500, 500),
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.symmetry.score).toBeLessThan(70);
    });

    it('should handle too few nodes gracefully', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 100, 0),
      ];

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.symmetry.score).toBe(100);
    });
  });

  describe('Aspect Ratio Metric', () => {
    it('should score well when layout matches canvas', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 400, 0),
        createNode('3', 0, 300),
        createNode('4', 400, 300),
      ];

      const result = LayoutQualityMetrics.assess(nodes, [], {
        canvasDimensions: { width: 800, height: 600 }, // 4:3 aspect
      });

      expect(result.metrics.aspectRatio.score).toBeGreaterThan(80);
    });

    it('should score lower when layout is too wide', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 1000, 0), // Very wide
        createNode('3', 0, 100),
        createNode('4', 1000, 100),
      ];

      const result = LayoutQualityMetrics.assess(nodes, [], {
        canvasDimensions: { width: 600, height: 600 }, // Square canvas
      });

      expect(result.metrics.aspectRatio.score).toBeLessThan(90);
    });

    it('should work without canvas dimensions', () => {
      const nodes = createSimpleLayout();

      const result = LayoutQualityMetrics.assess(nodes, []);

      expect(result.metrics.aspectRatio.score).toBeGreaterThan(0);
    });
  });

  describe('Grade Calculation', () => {
    it('should assign grade A for scores >= 90', () => {
      const nodes = createPerfectLayout();
      const links: LinkModel[] = [];

      const result = LayoutQualityMetrics.assess(nodes, links);

      if (result.overallScore >= 90) {
        expect(result.grade).toBe('A');
      }
    });

    it('should assign grade B for scores 80-89', () => {
      // Create layout with minor issues
      const nodes = createGoodLayout();
      const links = createSimpleLinks(nodes);

      const result = LayoutQualityMetrics.assess(nodes, links);

      if (result.overallScore >= 80 && result.overallScore < 90) {
        expect(result.grade).toBe('B');
      }
    });

    it('should assign grade F for scores < 60', () => {
      // Create poor layout
      const nodes = createPoorLayout();
      const links = createCrossingLinks(nodes);

      const result = LayoutQualityMetrics.assess(nodes, links);

      if (result.overallScore < 60) {
        expect(result.grade).toBe('F');
      }
    });
  });

  describe('Top Suggestions', () => {
    it('should return top 3 suggestions', () => {
      const nodes = createPoorLayout();
      const links = createCrossingLinks(nodes);

      const result = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
      });

      expect(result.topSuggestions).toBeDefined();
      expect(result.topSuggestions.length).toBeLessThanOrEqual(3);
    });

    it('should prioritize suggestions from lowest scoring metrics', () => {
      const nodes = createOverlappingNodes();
      const links: LinkModel[] = [];

      const result = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
      });

      // Overlap suggestions should be prioritized
      expect(result.topSuggestions.length).toBeGreaterThan(0);
      expect(result.topSuggestions[0]).toContain('overlap');
    });
  });
});

// Helper functions to create test data

function createNode(
  id: string,
  x: number,
  y: number,
  width: number = 150,
  height: number = 50
): NodeModel {
  const node = new NodeModel({ x, y }, { width, height });
  node.id = id;
  return node;
}

function createLink(sourceId: string, targetId: string): LinkModel {
  const link = new LinkModel('port1', 'port2');
  link.sourceNodeId = sourceId;
  link.targetNodeId = targetId;
  return link;
}

function createSimpleLayout(): NodeModel[] {
  return [
    createNode('1', 0, 0),
    createNode('2', 200, 0),
    createNode('3', 100, 150),
  ];
}

function createSimpleLinks(nodes: NodeModel[]): LinkModel[] {
  return [
    createLink(nodes[0].id, nodes[2].id),
    createLink(nodes[1].id, nodes[2].id),
  ];
}

function createOverlappingNodes(): NodeModel[] {
  return [
    createNode('1', 0, 0, 150, 50),
    createNode('2', 75, 0, 150, 50), // Overlaps with node 1
    createNode('3', 150, 0, 150, 50), // Overlaps with node 2
  ];
}

function createCrossingLayout(): NodeModel[] {
  return [
    createNode('1', 0, 0),
    createNode('2', 200, 200),
    createNode('3', 0, 200),
    createNode('4', 200, 0),
  ];
}

function createCrossingLinks(nodes: NodeModel[]): LinkModel[] {
  return [
    createLink(nodes[0].id, nodes[1].id),
    createLink(nodes[2].id, nodes[3].id),
  ];
}

function createPerfectLayout(): NodeModel[] {
  // Grid layout with perfect spacing
  return [
    createNode('1', 0, 0),
    createNode('2', 200, 0),
    createNode('3', 400, 0),
    createNode('4', 0, 150),
    createNode('5', 200, 150),
    createNode('6', 400, 150),
  ];
}

function createGoodLayout(): NodeModel[] {
  // Decent layout with minor imperfections
  return [
    createNode('1', 0, 0),
    createNode('2', 180, 10),
    createNode('3', 380, 5),
    createNode('4', 10, 160),
    createNode('5', 200, 150),
  ];
}

function createPoorLayout(): NodeModel[] {
  // Poor layout with overlaps and clustering
  return [
    createNode('1', 0, 0, 150, 50),
    createNode('2', 50, 10, 150, 50), // Overlaps
    createNode('3', 100, 5, 150, 50), // Overlaps
    createNode('4', 600, 600), // Far outlier
  ];
}
