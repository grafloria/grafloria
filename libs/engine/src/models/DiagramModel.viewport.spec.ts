// DiagramModel.viewport.spec.ts - TDD tests for viewport virtualization (Phase 5.1)

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import type { Rectangle } from '../types/geometry.types';

describe('DiagramModel - Viewport Virtualization (Phase 5.1)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('Test Diagram');
  });

  describe('Viewport State', () => {
    it('should have default viewport', () => {
      expect(diagram.viewport).toEqual({
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
        zoom: 1,
      });
    });

    it('should emit viewport:changed event when viewport changes', () => {
      const listener = jest.fn();
      diagram.on('viewport:changed', listener);

      diagram.setViewport(100, 200, 800, 600, 1.5);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 100,
          y: 200,
          zoom: 1.5,
        })
      );
    });

    it('should track viewport changes in history', () => {
      const oldViewport = { ...diagram.viewport };
      diagram.setViewport(100, 200, 800, 600, 1.5);

      const changes = diagram.getChangeLog();
      const viewportChange = changes.find((c) => c.property === 'viewport');

      expect(viewportChange).toBeDefined();
      expect(viewportChange?.oldValue).toEqual(oldViewport);
      expect(viewportChange?.newValue).toEqual({ x: 100, y: 200, width: 800, height: 600, zoom: 1.5 });
    });
  });

  describe('getVisibleNodes()', () => {
    beforeEach(() => {
      // Create a grid of nodes
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          const node = new NodeModel({
            id: `node-${row}-${col}`,
            type: 'basic',
            position: { x: col * 100, y: row * 100 },
            size: { width: 50, height: 50 },
          });
          diagram.addNode(node);
        }
      }
      // Total: 100 nodes
    });

    it('should return all nodes when viewport covers entire diagram', () => {
      const viewport: Rectangle = {
        x: -100,
        y: -100,
        width: 1200,
        height: 1200,
      };

      const visible = diagram.getVisibleNodes(viewport);
      expect(visible.length).toBe(100);
    });

    it('should return only visible nodes in small viewport', () => {
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 250,
        height: 250,
      };

      const visible = diagram.getVisibleNodes(viewport);

      // Should see nodes at (0,0), (100,0), (200,0), (0,100), (100,100), (200,100), (0,200), (100,200), (200,200)
      expect(visible.length).toBeGreaterThanOrEqual(9);
      expect(visible.length).toBeLessThan(100); // Not all nodes
    });

    it('should return empty array when viewport shows no nodes', () => {
      const viewport: Rectangle = {
        x: 2000,
        y: 2000,
        width: 500,
        height: 500,
      };

      const visible = diagram.getVisibleNodes(viewport);
      expect(visible).toEqual([]);
    });

    it('should include partially visible nodes', () => {
      const viewport: Rectangle = {
        x: 75,
        y: 75,
        width: 50,
        height: 50,
      };

      const visible = diagram.getVisibleNodes(viewport);

      // Viewport overlaps node at (100, 100) partially
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.some((n) => n.id === 'node-1-1')).toBe(true);
    });

    it('should handle viewport with zoom factor', () => {
      // Zoomed out viewport (zoom < 1 means larger world area visible)
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500 / 0.5, // Zoom 0.5 = 2x larger world area
        height: 500 / 0.5,
      };

      const visible = diagram.getVisibleNodes(viewport);
      expect(visible.length).toBeGreaterThan(25); // More nodes visible when zoomed out
    });

    it('should be fast with 1000 nodes', () => {
      // Clear and add 1000 nodes
      diagram.nodes.clear();
      for (let i = 0; i < 1000; i++) {
        const node = new NodeModel({
          id: `node-${i}`,
          type: 'basic',
          position: {
            x: Math.random() * 10000,
            y: Math.random() * 10000,
          },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }

      const start = performance.now();

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500,
        height: 500,
      };

      const visible = diagram.getVisibleNodes(viewport);
      const duration = performance.now() - start;

      expect(visible.length).toBeLessThan(1000); // Only subset visible
      expect(duration).toBeLessThan(50); // Fast query < 50ms
    });

    it('should respect node visibility flag', () => {
      const node = new NodeModel({
        id: 'hidden-node',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      node.state.visible = false; // Set visibility in state
      diagram.addNode(node);

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      const visible = diagram.getVisibleNodes(viewport);

      // Should not include hidden node
      expect(visible.find((n) => n.id === 'hidden-node')).toBeUndefined();
    });

    it('should handle nodes with rotation', () => {
      const node = new NodeModel({
        id: 'rotated',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 100, height: 50 },
      });
      node.setRotation(45); // Rotated node has larger bounding box
      diagram.addNode(node);

      const viewport: Rectangle = {
        x: 80,
        y: 80,
        width: 150,
        height: 150,
      };

      const visible = diagram.getVisibleNodes(viewport);

      expect(visible.some((n) => n.id === 'rotated')).toBe(true);
    });

    it('should handle nodes with scale', () => {
      const node = new NodeModel({
        id: 'scaled',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });
      node.setScale(2, 2); // 2x scale = 100x100 effective size
      diagram.addNode(node);

      const viewport: Rectangle = {
        x: 100,
        y: 100,
        width: 120,
        height: 120,
      };

      const visible = diagram.getVisibleNodes(viewport);

      expect(visible.some((n) => n.id === 'scaled')).toBe(true);
    });
  });

  describe('getVisibleLinks()', () => {
    let node1: NodeModel;
    let node2: NodeModel;
    let node3: NodeModel;
    let node4: NodeModel;

    beforeEach(() => {
      node1 = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      node2 = new NodeModel({
        id: 'node2',
        type: 'basic',
        position: { x: 200, y: 0 },
        size: { width: 50, height: 50 },
      });
      node3 = new NodeModel({
        id: 'node3',
        type: 'basic',
        position: { x: 0, y: 200 },
        size: { width: 50, height: 50 },
      });
      node4 = new NodeModel({
        id: 'node4',
        type: 'basic',
        position: { x: 500, y: 500 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);
      diagram.addNode(node4);
    });

    it('should return links where both endpoints are visible', () => {
      const link1 = new LinkModel('port1', 'port2');
      link1.sourceNodeId = 'node1';
      link1.targetNodeId = 'node2';
      link1.setPoints([
        { x: 25, y: 25 },
        { x: 225, y: 25 },
      ]);
      diagram.addLink(link1);

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 300,
        height: 100,
      };

      const visible = diagram.getVisibleLinks(viewport);

      expect(visible.length).toBe(1);
      expect(visible[0]).toBe(link1);
    });

    it('should return links partially visible in viewport', () => {
      const link1 = new LinkModel('port1', 'port3');
      link1.sourceNodeId = 'node1';
      link1.targetNodeId = 'node3';
      link1.setPoints([
        { x: 25, y: 25 },
        { x: 25, y: 225 },
      ]);
      diagram.addLink(link1);

      // Viewport only shows part of the link
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      const visible = diagram.getVisibleLinks(viewport);

      expect(visible.length).toBe(1);
      expect(visible[0]).toBe(link1);
    });

    it('should exclude links completely outside viewport', () => {
      const link1 = new LinkModel('port1', 'port2');
      link1.sourceNodeId = 'node1';
      link1.targetNodeId = 'node2';
      link1.setPoints([
        { x: 25, y: 25 },
        { x: 225, y: 25 },
      ]);

      const link2 = new LinkModel('port3', 'port4');
      link2.sourceNodeId = 'node3';
      link2.targetNodeId = 'node4';
      link2.setPoints([
        { x: 25, y: 225 },
        { x: 525, y: 525 },
      ]);

      diagram.addLink(link1);
      diagram.addLink(link2);

      // Viewport only shows link1 area
      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 300,
        height: 100,
      };

      const visible = diagram.getVisibleLinks(viewport);

      expect(visible.length).toBe(1);
      expect(visible[0]).toBe(link1);
    });

    it('should handle curved links with control points', () => {
      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = 'node1';
      link.targetNodeId = 'node2';
      link.setPoints([
        { x: 25, y: 25 },
        { x: 125, y: 100 }, // Control point
        { x: 225, y: 25 },
      ]);
      diagram.addLink(link);

      // Viewport that includes the curved part
      const viewport: Rectangle = {
        x: 100,
        y: 50,
        width: 100,
        height: 100,
      };

      const visible = diagram.getVisibleLinks(viewport);

      expect(visible.some((l) => l === link)).toBe(true);
    });

    it('should handle links with many points', () => {
      const link = new LinkModel('port1', 'port2');
      link.sourceNodeId = 'node1';
      link.targetNodeId = 'node2';
      // Create a zigzag path
      link.setPoints([
        { x: 25, y: 25 },
        { x: 100, y: 50 },
        { x: 150, y: 25 },
        { x: 200, y: 50 },
        { x: 225, y: 25 },
      ]);
      diagram.addLink(link);

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 300,
        height: 100,
      };

      const visible = diagram.getVisibleLinks(viewport);

      expect(visible.find((l) => l === link)).toBeDefined();
    });

    it('should be fast with many links', () => {
      const testDiagram = new DiagramModel('Large Link Test');

      for (let i = 0; i < 1000; i++) {
        const link = new LinkModel(`port${i}-src`, `port${i}-tgt`);
        link.sourceNodeId = 'node1';
        link.targetNodeId = 'node2';
        const x1 = Math.random() * 10000;
        const y1 = Math.random() * 10000;
        const x2 = Math.random() * 10000;
        const y2 = Math.random() * 10000;
        link.setPoints([
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ]);
        testDiagram.addLink(link);
      }

      const start = performance.now();

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 500,
        height: 500,
      };

      const visible = testDiagram.getVisibleLinks(viewport);
      const duration = performance.now() - start;

      expect(visible.length).toBeLessThan(500); // Only subset visible
      expect(duration).toBeLessThan(50); // Fast query < 50ms
    });
  });

  describe('updateSpatialIndex()', () => {
    it('should update spatial index when node is added', () => {
      const node = new NodeModel({
        id: 'new-node',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node);

      const viewport: Rectangle = {
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      };

      const visible = diagram.getVisibleNodes(viewport);
      expect(visible.some((n) => n.id === 'new-node')).toBe(true);
    });

    it('should update spatial index when node is moved', () => {
      const node = new NodeModel({
        id: 'moving-node',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      diagram.addNode(node);

      // Move node to new position
      node.setPosition(500, 500);

      // Old viewport should not find it
      let viewport: Rectangle = { x: 0, y: 0, width: 100, height: 100 };
      let visible = diagram.getVisibleNodes(viewport);
      expect(visible.find((n) => n.id === 'moving-node')).toBeUndefined();

      // New viewport should find it
      viewport = { x: 500, y: 500, width: 100, height: 100 };
      visible = diagram.getVisibleNodes(viewport);
      expect(visible.some((n) => n.id === 'moving-node')).toBe(true);
    });

    it('should update spatial index when node is resized', () => {
      const node = new NodeModel({
        id: 'resizing-node',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });
      diagram.addNode(node);

      // Resize to make it larger
      node.setSize(200, 200);

      // Viewport that includes the expanded area
      const viewport: Rectangle = {
        x: 200,
        y: 200,
        width: 150,
        height: 150,
      };

      const visible = diagram.getVisibleNodes(viewport);
      expect(visible.some((n) => n.id === 'resizing-node')).toBe(true);
    });

    it('should remove from spatial index when node is removed', () => {
      const node = new NodeModel({
        id: 'temp-node',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });
      diagram.addNode(node);
      diagram.removeNode('temp-node');

      const viewport: Rectangle = {
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      };

      const visible = diagram.getVisibleNodes(viewport);
      expect(visible.find((n) => n.id === 'temp-node')).toBeUndefined();
    });
  });

  describe('getVisibleBounds()', () => {
    it('should return bounding box of visible entities', () => {
      const node1 = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        id: 'node2',
        type: 'basic',
        position: { x: 200, y: 200 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      const viewport: Rectangle = {
        x: 0,
        y: 0,
        width: 300,
        height: 300,
      };

      const bounds = diagram.getVisibleBounds(viewport);

      expect(bounds).toEqual({
        x: 0,
        y: 0,
        width: 250, // node2.x + node2.width
        height: 250, // node2.y + node2.height
      });
    });

    it('should return null when no entities are visible', () => {
      const viewport: Rectangle = {
        x: 1000,
        y: 1000,
        width: 500,
        height: 500,
      };

      const bounds = diagram.getVisibleBounds(viewport);
      expect(bounds).toBeNull();
    });
  });
});
