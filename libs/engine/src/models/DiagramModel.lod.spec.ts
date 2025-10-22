// DiagramModel.lod.spec.ts - TDD tests for Level of Detail rendering (Phase 5.3)

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import type { Rectangle } from '../types/geometry.types';
import type { LODLevel, EntityWithLOD } from '../types/performance.types';

describe('DiagramModel - Level of Detail (Phase 5.3)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('LOD Test');
  });

  describe('LOD Level Determination', () => {
    it('should return HIGH detail for zoom > 1.0', () => {
      const level = diagram.getLODLevel(1.5);
      expect(level).toBe('high');
    });

    it('should return MEDIUM detail for 0.5 < zoom <= 1.0', () => {
      expect(diagram.getLODLevel(1.0)).toBe('medium');
      expect(diagram.getLODLevel(0.75)).toBe('medium');
      expect(diagram.getLODLevel(0.6)).toBe('medium');
    });

    it('should return LOW detail for zoom <= 0.5', () => {
      expect(diagram.getLODLevel(0.5)).toBe('low');
      expect(diagram.getLODLevel(0.3)).toBe('low');
      expect(diagram.getLODLevel(0.1)).toBe('low');
    });

    it('should handle edge cases', () => {
      expect(diagram.getLODLevel(0)).toBe('low');
      expect(diagram.getLODLevel(10)).toBe('high');
    });
  });

  describe('getNodesWithLOD()', () => {
    beforeEach(() => {
      // Create test nodes
      for (let i = 0; i < 10; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: i * 100, y: i * 100 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }
    });

    it('should return all nodes with HIGH LOD', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 1.5);

      expect(nodesWithLOD.length).toBeGreaterThan(0);
      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('high');
        expect(item.entity).toBeInstanceOf(NodeModel);
      });
    });

    it('should return nodes with MEDIUM LOD', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 0.75);

      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('medium');
      });
    });

    it('should return nodes with LOW LOD', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 0.3);

      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('low');
      });
    });

    it('should only return visible nodes', () => {
      const smallViewport: Rectangle = {
        x: 0,
        y: 0,
        width: 150,
        height: 150,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(smallViewport, 1.0);

      // Should only include nodes in viewport (0,0) and (100,100)
      expect(nodesWithLOD.length).toBeLessThan(10);
    });

    it('should combine viewport virtualization with LOD', () => {
      const viewport: Rectangle = {
        x: 200,
        y: 200,
        width: 250,
        height: 250,
      };

      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 1.5);

      // Should only return nodes 2,3,4 which are in the viewport
      expect(nodesWithLOD.length).toBeGreaterThan(0);
      expect(nodesWithLOD.length).toBeLessThan(10);
      nodesWithLOD.forEach((item) => {
        expect(item.lod).toBe('high');
      });
    });
  });

  describe('getLinksWithLOD()', () => {
    beforeEach(() => {
      // Create test links
      for (let i = 0; i < 5; i++) {
        const link = new LinkModel(`port${i}-src`, `port${i}-tgt`);
        link.setPoints([
          { x: i * 100, y: 0 },
          { x: i * 100 + 50, y: 100 },
        ]);
        diagram.addLink(link);
      }
    });

    it('should return links with appropriate LOD level', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500,
        height: 150,
      };

      const highLOD = diagram.getLinksWithLOD(viewport, 1.5);
      const mediumLOD = diagram.getLinksWithLOD(viewport, 0.75);
      const lowLOD = diagram.getLinksWithLOD(viewport, 0.3);

      expect(highLOD.every((item) => item.lod === 'high')).toBe(true);
      expect(mediumLOD.every((item) => item.lod === 'medium')).toBe(true);
      expect(lowLOD.every((item) => item.lod === 'low')).toBe(true);
    });

    it('should only return visible links', () => {
      const smallViewport: Rectangle = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      const linksWithLOD = diagram.getLinksWithLOD(smallViewport, 1.0);

      expect(linksWithLOD.length).toBeLessThan(5);
    });
  });

  describe('Performance with LOD', () => {
    it('should efficiently process large diagrams', () => {
      // Create 1000 nodes
      for (let i = 0; i < 1000; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: (i % 50) * 100, y: Math.floor(i / 50) * 100 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500,
        height: 500,
      };

      const start = performance.now();
      const nodesWithLOD = diagram.getNodesWithLOD(viewport, 0.3);
      const duration = performance.now() - start;

      // Should be fast even with 1000 nodes
      expect(duration).toBeLessThan(50);
      expect(nodesWithLOD.length).toBeGreaterThan(0);
      expect(nodesWithLOD.length).toBeLessThan(1000); // Viewport culling works
    });
  });

  describe('LOD Rendering Hints', () => {
    it('should provide shouldRenderLabels hint', () => {
      expect(diagram.shouldRenderLabels('high')).toBe(true);
      expect(diagram.shouldRenderLabels('medium')).toBe(true);
      expect(diagram.shouldRenderLabels('low')).toBe(false);
    });

    it('should provide shouldRenderIcons hint', () => {
      expect(diagram.shouldRenderIcons('high')).toBe(true);
      expect(diagram.shouldRenderIcons('medium')).toBe(false);
      expect(diagram.shouldRenderIcons('low')).toBe(false);
    });

    it('should provide shouldRenderBorders hint', () => {
      expect(diagram.shouldRenderBorders('high')).toBe(true);
      expect(diagram.shouldRenderBorders('medium')).toBe(true);
      expect(diagram.shouldRenderBorders('low')).toBe(false);
    });

    it('should provide shouldRenderShadows hint', () => {
      expect(diagram.shouldRenderShadows('high')).toBe(true);
      expect(diagram.shouldRenderShadows('medium')).toBe(false);
      expect(diagram.shouldRenderShadows('low')).toBe(false);
    });
  });

  describe('Integration with Dirty Marking', () => {
    it('should combine LOD with dirty marking for optimal rendering', () => {
      // Create nodes
      const node1 = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      // Mark all clean
      diagram.markAllClean();

      // Modify one node
      node1.setPosition(10, 10);

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      };

      // Get visible + dirty nodes
      const visibleDirty = diagram.getVisibleDirtyNodes(viewport);
      const visibleWithLOD = diagram.getNodesWithLOD(viewport, 1.0);

      // node1 should be in both lists
      expect(visibleDirty).toContain(node1);
      expect(visibleWithLOD.some((item) => item.entity === node1)).toBe(true);
    });
  });
});
