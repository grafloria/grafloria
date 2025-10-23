/**
 * Visual Integration Tests for Layout Algorithms - CORRECTED
 *
 * Based on research from DiagramModel.viewport.spec.ts (29/29 tests passing)
 *
 * CRITICAL: These tests verify what users ACTUALLY SEE, not implementation details.
 *
 * Key Principles:
 * 1. Test getVisibleNodes(viewport) - what renderer shows
 * 2. Use diagram.getViewport() - dynamic viewport set by layout
 * 3. Verify ALL nodes are visible after layout
 * 4. Test spatial indexing integration
 *
 * Previous Mistake:
 * - Tested getNodes() (model) instead of getVisibleNodes() (renderer)
 * - Used static VIEWPORT instead of diagram.getViewport()
 * - Tests passed but app showed only 2/4 nodes!
 */

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';

describe('Layout Visual Integration Tests - CORRECTED', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('Test Diagram');
    // Set initial viewport (will be updated by layout)
    diagram.setViewport(0, 0, 1200, 800);
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
   * Helper: Debug invisible nodes (useful when tests fail)
   */
  function debugInvisibleNodes(layoutViewport: any) {
    const allNodes = diagram.getNodes();
    const visibleNodes = diagram.getVisibleNodes(layoutViewport);
    const invisibleNodes = allNodes.filter(n => !visibleNodes.includes(n));

    if (invisibleNodes.length > 0) {
      console.error('\n❌ INVISIBLE NODES DETECTED:');
      console.error(`Total nodes: ${allNodes.length}`);
      console.error(`Visible nodes: ${visibleNodes.length}`);
      console.error(`Invisible nodes: ${invisibleNodes.length}`);
      console.error('\nLayout Viewport:', layoutViewport);
      console.error('\nInvisible node details:');
      invisibleNodes.forEach(node => {
        const bounds = node.getBoundingBox();
        console.error(`  - ${node.getMetadata('label') || node.id}:`);
        console.error(`    Position: (${node.position.x}, ${node.position.y})`);
        console.error(`    Bounds: left=${bounds.left}, right=${bounds.right}, top=${bounds.top}, bottom=${bounds.bottom}`);
        console.error(`    Viewport: x=${layoutViewport.x}, y=${layoutViewport.y}, w=${layoutViewport.width}, h=${layoutViewport.height}`);

        // Check why it's outside
        const outsideX = bounds.right < layoutViewport.x || bounds.left > layoutViewport.x + layoutViewport.width;
        const outsideY = bounds.bottom < layoutViewport.y || bounds.top > layoutViewport.y + layoutViewport.height;
        console.error(`    Outside: X=${outsideX}, Y=${outsideY}`);
      });
    }

    return invisibleNodes;
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

  describe('Hierarchical Layout - Visibility Correctness', () => {
    it('CRITICAL: All nodes must be VISIBLE after layout', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      // Get the viewport that layout actually set
      const layoutViewport = diagram.getViewport();

      // CRITICAL: Test what renderer actually sees
      const allNodes = diagram.getNodes();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      // Debug if fails
      const invisibleNodes = debugInvisibleNodes(layoutViewport);

      // ALL nodes must be visible
      expect(visibleNodes.length).toBe(allNodes.length);
      expect(visibleNodes.length).toBe(3);
      expect(invisibleNodes.length).toBe(0);
    });

    it('CRITICAL: Viewport should be updated after layout', async () => {
      createTestDiagram();

      const initialViewport = diagram.getViewport();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const updatedViewport = diagram.getViewport();

      // Viewport should change after layout (at minimum, recalculated)
      // Note: Might be same if nodes already fit, but should be set
      expect(updatedViewport).toBeDefined();
      expect(updatedViewport.width).toBeGreaterThan(0);
      expect(updatedViewport.height).toBeGreaterThan(0);
    });

    it('CRITICAL: Viewport bounds should contain all node bounds', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const diagramBounds = calculateDiagramBounds();

      const margin = 50;

      // Viewport should contain ALL nodes with margin
      expect(layoutViewport.x).toBeLessThanOrEqual(diagramBounds.minX - margin);
      expect(layoutViewport.y).toBeLessThanOrEqual(diagramBounds.minY - margin);
      expect(layoutViewport.x + layoutViewport.width).toBeGreaterThanOrEqual(diagramBounds.maxX + margin);
      expect(layoutViewport.y + layoutViewport.height).toBeGreaterThanOrEqual(diagramBounds.maxY + margin);
    });

    it('should center diagram in viewport', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const bounds = calculateDiagramBounds();

      const diagramCenterX = bounds.minX + bounds.width / 2;
      const diagramCenterY = bounds.minY + bounds.height / 2;

      const viewportCenterX = layoutViewport.x + layoutViewport.width / 2;
      const viewportCenterY = layoutViewport.y + layoutViewport.height / 2;

      // Diagram should be centered (within 10% tolerance)
      const toleranceX = layoutViewport.width * 0.1;
      const toleranceY = layoutViewport.height * 0.1;

      expect(Math.abs(diagramCenterX - viewportCenterX)).toBeLessThan(toleranceX);
      expect(Math.abs(diagramCenterY - viewportCenterY)).toBeLessThan(toleranceY);
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

      // AND all should be visible
      const layoutViewport = diagram.getViewport();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);
      expect(visibleNodes.length).toBe(nodes.length);
    });

    it('should handle single node correctly', async () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 }
      });
      node.setMetadata('label', 'Single Node');
      diagram.addNode(node);

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();

      // Single node should be visible
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);
      expect(visibleNodes.length).toBe(1);
      expect(visibleNodes[0]).toBe(node);

      // And centered in viewport
      const bounds = node.getBoundingBox();
      const nodeCenterX = bounds.left + bounds.width / 2;
      const nodeCenterY = bounds.top + bounds.height / 2;

      const viewportCenterX = layoutViewport.x + layoutViewport.width / 2;
      const viewportCenterY = layoutViewport.y + layoutViewport.height / 2;

      const toleranceX = layoutViewport.width * 0.1;
      const toleranceY = layoutViewport.height * 0.1;

      expect(Math.abs(nodeCenterX - viewportCenterX)).toBeLessThan(toleranceX);
      expect(Math.abs(nodeCenterY - viewportCenterY)).toBeLessThan(toleranceY);
    });

    it('should handle large diagrams (10+ nodes) - all visible', async () => {
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

      const layoutViewport = diagram.getViewport();
      const allNodes = diagram.getNodes();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      debugInvisibleNodes(layoutViewport);

      // CRITICAL: ALL 10 nodes must be visible
      expect(visibleNodes.length).toBe(10);
      expect(visibleNodes.length).toBe(allNodes.length);
    });
  });

  describe('Grid Layout - Visibility Correctness', () => {
    it('CRITICAL: All nodes must be VISIBLE after grid layout', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('grid');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const allNodes = diagram.getNodes();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      debugInvisibleNodes(layoutViewport);

      expect(visibleNodes.length).toBe(allNodes.length);
      expect(visibleNodes.length).toBe(3);
    });

    it('should center grid in viewport', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('grid');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const bounds = calculateDiagramBounds();

      const diagramCenterX = bounds.minX + bounds.width / 2;
      const diagramCenterY = bounds.minY + bounds.height / 2;

      const viewportCenterX = layoutViewport.x + layoutViewport.width / 2;
      const viewportCenterY = layoutViewport.y + layoutViewport.height / 2;

      const toleranceX = layoutViewport.width * 0.15;
      const toleranceY = layoutViewport.height * 0.15;

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

  describe('Force-Directed Layout - Visibility Correctness', () => {
    it('CRITICAL: All nodes must be VISIBLE after force-directed layout', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('force-directed');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const allNodes = diagram.getNodes();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      debugInvisibleNodes(layoutViewport);

      expect(visibleNodes.length).toBe(allNodes.length);
      expect(visibleNodes.length).toBe(3);
    });
  });

  describe('Hybrid Layout - Visibility Correctness', () => {
    it('CRITICAL: All nodes must be VISIBLE after hybrid layout', async () => {
      createTestDiagram();

      diagram.setLayoutAlgorithm('hybrid');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const allNodes = diagram.getNodes();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      debugInvisibleNodes(layoutViewport);

      expect(visibleNodes.length).toBe(allNodes.length);
      expect(visibleNodes.length).toBe(3);
    });
  });

  describe('Viewport Adaptation', () => {
    it('should adapt to different viewport sizes', async () => {
      createTestDiagram();

      // Test with small viewport
      diagram.setViewport(0, 0, 600, 400);
      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      let layoutViewport = diagram.getViewport();
      let visibleNodes = diagram.getVisibleNodes(layoutViewport);
      expect(visibleNodes.length).toBe(3); // All still visible

      // Test with large viewport
      diagram.setViewport(0, 0, 2000, 1500);
      await diagram.reLayout();

      layoutViewport = diagram.getViewport();
      visibleNodes = diagram.getVisibleNodes(layoutViewport);
      expect(visibleNodes.length).toBe(3); // All still visible
    });

    it('should handle viewport offset (not at origin)', async () => {
      createTestDiagram();

      // Viewport not at (0,0)
      diagram.setViewport(500, 300, 1200, 800);
      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      // All nodes should still be visible
      expect(visibleNodes.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty diagram gracefully', async () => {
      diagram.setLayoutAlgorithm('hierarchical');
      await expect(diagram.reLayout()).resolves.not.toThrow();

      const layoutViewport = diagram.getViewport();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);
      expect(visibleNodes.length).toBe(0);
    });

    it('should handle nodes with varying sizes', async () => {
      const smallNode = new NodeModel({
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 50 }
      });
      smallNode.setMetadata('label', 'Small');

      const largeNode = new NodeModel({
        type: 'basic',
        position: { x: 300, y: 100 },
        size: { width: 400, height: 200 }
      });
      largeNode.setMetadata('label', 'Large');

      diagram.addNode(smallNode);
      diagram.addNode(largeNode);
      diagram.connectNodes(smallNode, largeNode);

      diagram.setLayoutAlgorithm('hierarchical');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);

      debugInvisibleNodes(layoutViewport);

      // Both should be visible
      expect(visibleNodes.length).toBe(2);
      expect(visibleNodes).toContain(smallNode);
      expect(visibleNodes).toContain(largeNode);
    });
  });

  describe('Spatial Indexing Integration', () => {
    it('should use spatial index for visibility queries (performance test)', async () => {
      // Create 100 nodes in grid
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          const node = new NodeModel({
            type: 'basic',
            position: { x: col * 150, y: row * 120 },
            size: { width: 100, height: 80 }
          });
          diagram.addNode(node);
        }
      }

      diagram.setLayoutAlgorithm('grid');
      await diagram.reLayout();

      const layoutViewport = diagram.getViewport();

      // Query should be fast (< 50ms)
      const start = performance.now();
      const visibleNodes = diagram.getVisibleNodes(layoutViewport);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      expect(visibleNodes.length).toBeGreaterThan(0);
      expect(visibleNodes.length).toBeLessThanOrEqual(100);
    });

    it('should handle partial viewport showing subset of nodes', async () => {
      // Create nodes at known positions
      for (let i = 0; i < 5; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: i * 300, y: 100 },
          size: { width: 200, height: 100 }
        });
        node.setMetadata('label', `Node ${i + 1}`);
        diagram.addNode(node);
      }

      // Set small viewport to see only some nodes
      diagram.setViewport(0, 0, 500, 400);

      const visibleNodes = diagram.getVisibleNodes(diagram.getViewport());

      // Should see only nodes that fit in 500x400 viewport
      expect(visibleNodes.length).toBeGreaterThan(0);
      expect(visibleNodes.length).toBeLessThan(5);
    });
  });
});
