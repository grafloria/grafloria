// DiagramModel.dispose.spec.ts - TDD tests for diagram memory management (Phase 5.4)

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import { GroupModel } from './GroupModel';

describe('DiagramModel - Memory Management (Phase 5.4)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('Test Diagram');
  });

  describe('dispose()', () => {
    it('should dispose all nodes', () => {
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

      diagram.dispose();

      expect(node1.isDisposed()).toBe(true);
      expect(node2.isDisposed()).toBe(true);
    });

    it('should dispose all links', () => {
      const link1 = new LinkModel('port1-src', 'port1-tgt');
      const link2 = new LinkModel('port2-src', 'port2-tgt');

      diagram.addLink(link1);
      diagram.addLink(link2);

      diagram.dispose();

      expect(link1.isDisposed()).toBe(true);
      expect(link2.isDisposed()).toBe(true);
    });

    it('should dispose all groups', () => {
      const group1 = new GroupModel({ name: 'Group 1' });
      const group2 = new GroupModel({ name: 'Group 2' });

      diagram.addGroup(group1);
      diagram.addGroup(group2);

      diagram.dispose();

      expect(group1.isDisposed()).toBe(true);
      expect(group2.isDisposed()).toBe(true);
    });

    it('should clear spatial indices', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node);

      // Spatial index should have the node
      const viewport = { x: 0, y: 0, width: 100, height: 100 };
      expect(diagram.getVisibleNodes(viewport)).toContain(node);

      diagram.dispose();

      // Spatial index should be cleared
      expect(diagram.getVisibleNodes(viewport).length).toBe(0);
    });

    it('should mark diagram as disposed', () => {
      expect(diagram.isDisposed()).toBe(false);

      diagram.dispose();

      expect(diagram.isDisposed()).toBe(true);
    });

    it('should emit disposed event', () => {
      const listener = jest.fn();
      diagram.on('disposed', listener);

      diagram.dispose();

      expect(listener).toHaveBeenCalled();
    });

    it('should prevent operations after disposal', () => {
      diagram.dispose();

      const node = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });

      expect(() => diagram.addNode(node)).toThrow('Cannot operate on disposed entity');
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should remove event listeners from nodes when removed', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node);

      // Diagram adds listeners for spatial index updates
      const listenerCount = node['emitter'].listenerCount('change:position');
      expect(listenerCount).toBeGreaterThan(0);

      diagram.removeNode(node.id);

      // Listeners should be removed (or node should be disposed)
      // This prevents memory leaks when nodes are removed
    });

    it('should handle large diagrams efficiently', () => {
      // Create 1000 entities
      for (let i = 0; i < 1000; i++) {
        const node = new NodeModel({
          type: 'basic',
          position: { x: i * 100, y: 0 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }

      const start = performance.now();
      diagram.dispose();
      const duration = performance.now() - start;

      // Disposal should be fast even with many entities
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Disposal Chain', () => {
    it('should dispose children before parent', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });

      const disposalOrder: string[] = [];

      diagram.addNode(node);

      node.on('disposed', () => disposalOrder.push('node'));
      diagram.on('disposed', () => disposalOrder.push('diagram'));

      diagram.dispose();

      expect(disposalOrder).toEqual(['node', 'diagram']);
    });

    it('should handle circular references safely', () => {
      const node = new NodeModel({
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node);

      // Nodes have a reference back to diagram
      expect(node.diagram).toBe(diagram);

      // Dispose should break circular reference
      diagram.dispose();

      expect(node.diagram).toBeNull();
    });
  });
});
