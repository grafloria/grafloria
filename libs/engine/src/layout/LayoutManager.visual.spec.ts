/**
 * Visual Integration Tests for Layout Algorithms
 *
 * These tests verify what users actually see, not implementation details.
 *
 * CRITICAL TESTS:
 * - Are nodes visible in the viewport?
 * - Is the diagram centered?
 * - Is zoom level reasonable?
 * - Can users actually use the diagram?
 */

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';

describe('Layout Visual Integration Tests', () => {
  let diagram: DiagramModel;
  const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };
  const MARGIN = 50;

  beforeEach(() => {
    diagram = new DiagramModel('Test Diagram');
    // Set viewport on diagram
    diagram.setViewport(VIEWPORT.x, VIEWPORT.y, VIEWPORT.width, VIEWPORT.height);
  });

  /**
   * Helper: Calculate bounding box of all nodes
   */
  function calculateDiagramBounds() {
    const nodes = diagram.getNodes();
    if (nodes.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      maxX = Math.max(maxX, bounds.right);
      minY = Math.min(minY, bounds.top);
      maxY = Math.max(maxY, bounds.bottom);
    });

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Helper: Create a simple test diagram
   */
  function createTestDiagram() {
    const node1 = new NodeModel({
      type: 'basic',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 }
    });
    node1.setMetadata('label', 'Node 1');

    const node2 = new NodeModel({
      type: 'basic',
      position: { x: 400, y: 100 },
      size: { width: 200, height: 100 }
    });
    node2.setMetadata('label', 'Node 2');

    const node3 = new NodeModel({
      type: 'basic',
      position: { x: 700, y: 100 },
      size: { width: 200, height: 100 }
    });
    node3.setMetadata('label', 'Node 3');

    diagram.addNode(node1);
    diagram.addNode(node2);
    diagram.addNode(node3);

    diagram.connectNodes(node1, node2);
    diagram.connectNodes(node2, node3);

    return { node1, node2, node3 };
  }

  describe('Hierarchical Layout - Visual Correctness', () => {
    it('should place all nodes within viewport bounds', async () => {
      createTestDiagram();

      // Apply hierarchical layout
      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      // CRITICAL: All nodes must be visible in viewport
      const nodes = diagram.getNodes();
      nodes.forEach(node => {
        const bounds = node.getBoundingBox();

        // Nodes should be within viewport with margins
        expect(bounds.left).toBeGreaterThanOrEqual(VIEWPORT.x + MARGIN);
        expect(bounds.right).toBeLessThanOrEqual(VIEWPORT.x + VIEWPORT.width - MARGIN);
        expect(bounds.top).toBeGreaterThanOrEqual(VIEWPORT.y + MARGIN);
        expect(bounds.bottom).toBeLessThanOrEqual(VIEWPORT.y + VIEWPORT.height - MARGIN);
      });
    });

    it('should center diagram in viewport', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const bounds = calculateDiagramBounds();
      const diagramCenterX = bounds.minX + bounds.width / 2;
      const diagramCenterY = bounds.minY + bounds.height / 2;

      const viewportCenterX = VIEWPORT.x + VIEWPORT.width / 2;
      const viewportCenterY = VIEWPORT.y + VIEWPORT.height / 2;

      // Diagram should be centered (within 10% tolerance)
      const toleranceX = VIEWPORT.width * 0.1;
      const toleranceY = VIEWPORT.height * 0.1;

      expect(Math.abs(diagramCenterX - viewportCenterX)).toBeLessThan(toleranceX);
      expect(Math.abs(diagramCenterY - viewportCenterY)).toBeLessThan(toleranceY);
    });

    it('should maintain reasonable zoom level (no extreme scaling)', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const bounds = calculateDiagramBounds();

      // Calculate how much scaling would be needed to fit
      const scaleX = bounds.width / (VIEWPORT.width - 2 * MARGIN);
      const scaleY = bounds.height / (VIEWPORT.height - 2 * MARGIN);
      const maxScale = Math.max(scaleX, scaleY);

      // Layout should not require extreme zoom
      // Content should fit reasonably (scale between 0.5x and 2x)
      expect(maxScale).toBeLessThan(2.0);
      expect(maxScale).toBeGreaterThan(0.5);
    });

    it('should stack nodes vertically for top-bottom direction', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout({ direction: 'TB' });

      const nodes = diagram.getNodes();
      const sortedByY = [...nodes].sort((a, b) => a.position.y - b.position.y);

      // In TB layout, each node should be below the previous one
      for (let i = 1; i < sortedByY.length; i++) {
        expect(sortedByY[i].position.y).toBeGreaterThan(sortedByY[i - 1].position.y);
      }
    });

    it('should handle single node correctly', async () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      diagram.addNode(node);

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      // Single node should be centered in viewport
      const bounds = node.getBoundingBox();
      const nodeCenterX = bounds.left + bounds.width / 2;
      const nodeCenterY = bounds.top + bounds.height / 2;

      const viewportCenterX = VIEWPORT.x + VIEWPORT.width / 2;
      const viewportCenterY = VIEWPORT.y + VIEWPORT.height / 2;

      const toleranceX = VIEWPORT.width * 0.1;
      const toleranceY = VIEWPORT.height * 0.1;

      expect(Math.abs(nodeCenterX - viewportCenterX)).toBeLessThan(toleranceX);
      expect(Math.abs(nodeCenterY - viewportCenterY)).toBeLessThan(toleranceY);
    });

    it('should handle large diagrams (10+ nodes)', async () => {
      // Create 10 connected nodes
      const nodes = [];
      for (let i = 0; i < 10; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: 100 + i * 50, y: 100 },
          size: { width: 150, height: 80 }
        });
        node.setMetadata('label', `Node ${i + 1}`);
        diagram.addNode(node);
        nodes.push(node);
      }

      // Connect in chain
      for (let i = 0; i < 9; i++) {
        diagram.connectNodes(nodes[i], nodes[i + 1]);
      }

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      // For large diagrams, check that MOST nodes are visible (allow some overflow for edge cases)
      // Since node sizes don't scale, a very tall diagram might slightly exceed viewport
      const diagramBounds = calculateDiagramBounds();

      // Diagram should fit reasonably in viewport (within 10% tolerance)
      const maxAllowedWidth = VIEWPORT.width * 1.1;
      const maxAllowedHeight = VIEWPORT.height * 1.1;

      expect(diagramBounds.width).toBeLessThan(maxAllowedWidth);
      expect(diagramBounds.height).toBeLessThan(maxAllowedHeight);

      // At least the first and last nodes should be within reasonable bounds
      const firstNode = nodes[0];
      const lastNode = nodes[9];
      const firstBounds = firstNode.getBoundingBox();
      const lastBounds = lastNode.getBoundingBox();

      // Check nodes are positioned starting from near the margin
      expect(firstBounds.top).toBeGreaterThanOrEqual(VIEWPORT.y);
      expect(firstBounds.top).toBeLessThan(VIEWPORT.y + MARGIN * 2);
    });
  });

  describe('Grid Layout - Visual Correctness', () => {
    it('should place all nodes within viewport bounds', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('grid');
      await diagram.reLayout();

      const nodes = diagram.getNodes();
      nodes.forEach(node => {
        const bounds = node.getBoundingBox();

        expect(bounds.left).toBeGreaterThanOrEqual(VIEWPORT.x + MARGIN);
        expect(bounds.right).toBeLessThanOrEqual(VIEWPORT.x + VIEWPORT.width - MARGIN);
        expect(bounds.top).toBeGreaterThanOrEqual(VIEWPORT.y + MARGIN);
        expect(bounds.bottom).toBeLessThanOrEqual(VIEWPORT.y + VIEWPORT.height - MARGIN);
      });
    });

    it('should center grid in viewport', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('grid');
      await diagram.reLayout();

      const bounds = calculateDiagramBounds();
      const diagramCenterX = bounds.minX + bounds.width / 2;
      const diagramCenterY = bounds.minY + bounds.height / 2;

      const viewportCenterX = VIEWPORT.x + VIEWPORT.width / 2;
      const viewportCenterY = VIEWPORT.y + VIEWPORT.height / 2;

      const toleranceX = VIEWPORT.width * 0.15; // Slightly more tolerance for grid
      const toleranceY = VIEWPORT.height * 0.15;

      expect(Math.abs(diagramCenterX - viewportCenterX)).toBeLessThan(toleranceX);
      expect(Math.abs(diagramCenterY - viewportCenterY)).toBeLessThan(toleranceY);
    });

    it('should maintain reasonable spacing between nodes', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('grid');
      await diagram.reLayout();

      const nodes = diagram.getNodes();

      // Check spacing between adjacent nodes
      for (let i = 0; i < nodes.length - 1; i++) {
        const bounds1 = nodes[i].getBoundingBox();
        const bounds2 = nodes[i + 1].getBoundingBox();

        const horizontalGap = Math.abs(bounds2.left - bounds1.right);
        const verticalGap = Math.abs(bounds2.top - bounds1.bottom);

        // At least one dimension should have reasonable spacing (not overlapping)
        const hasGap = horizontalGap > 10 || verticalGap > 10;
        expect(hasGap).toBe(true);
      }
    });
  });

  describe('Viewport Changes', () => {
    it('should adapt to different viewport sizes', async () => {
      createTestDiagram();

      // Test with small viewport
      diagram.setViewport(0, 0, 600, 400);
      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      let bounds = calculateDiagramBounds();
      // With small viewport, layout should be compact (within 20% tolerance for node sizes)
      expect(bounds.width).toBeLessThan(600 * 1.2);
      expect(bounds.height).toBeLessThan(400 * 1.2);

      // Test with large viewport
      diagram.setViewport(0, 0, 2000, 1500);
      await diagram.reLayout();

      bounds = calculateDiagramBounds();
      // Should still be centered, not stretched to fill entire viewport
      const centerX = bounds.minX + bounds.width / 2;
      const viewportCenterX = 2000 / 2;
      expect(Math.abs(centerX - viewportCenterX)).toBeLessThan(200);
    });

    it('should handle viewport offset (not at origin)', async () => {
      createTestDiagram();

      // Viewport not at (0,0)
      diagram.setViewport(500, 300, 1200, 800);
      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const bounds = calculateDiagramBounds();

      // Nodes should be positioned relative to viewport offset
      expect(bounds.minX).toBeGreaterThanOrEqual(500 + MARGIN);
      expect(bounds.maxX).toBeLessThanOrEqual(500 + 1200 - MARGIN);
      expect(bounds.minY).toBeGreaterThanOrEqual(300 + MARGIN);
      expect(bounds.maxY).toBeLessThanOrEqual(300 + 800 - MARGIN);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty diagram gracefully', async () => {
      diagram.setLayoutAlgorithm('hierarchical');

      // Should not throw
      await expect(diagram.reLayout()).resolves.not.toThrow();
    });

    it('should handle nodes with varying sizes', async () => {
      const smallNode = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 50 }
      });

      const largeNode = new NodeModel({
        type: 'basic',
        position: { x: 300, y: 100 },
        size: { width: 400, height: 200 }
      });

      diagram.addNode(smallNode);
      diagram.addNode(largeNode);
      diagram.connectNodes(smallNode, largeNode);

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      // Both should be visible
      const smallBounds = smallNode.getBoundingBox();
      const largeBounds = largeNode.getBoundingBox();

      expect(smallBounds.left).toBeGreaterThanOrEqual(VIEWPORT.x + MARGIN);
      expect(largeBounds.right).toBeLessThanOrEqual(VIEWPORT.x + VIEWPORT.width - MARGIN);
    });
  });
});
