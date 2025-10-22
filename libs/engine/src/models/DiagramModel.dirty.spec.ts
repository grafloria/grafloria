// DiagramModel.dirty.spec.ts - TDD tests for dirty entity queries (Phase 5.2)

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import { GroupModel } from './GroupModel';

describe('DiagramModel - Dirty Queries (Phase 5.2)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('Test Diagram');
  });

  describe('getDirtyNodes()', () => {
    it('should return empty array when no nodes are dirty', () => {
      const node1 = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        id: 'node2',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      // Mark all clean
      node1.markClean();
      node2.markClean();

      const dirty = diagram.getDirtyNodes();
      expect(dirty).toEqual([]);
    });

    it('should return dirty nodes only', () => {
      const node1 = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        id: 'node2',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      // Mark node1 clean, node2 stays dirty
      node1.markClean();
      node2.setPosition(200, 200); // Make dirty

      const dirty = diagram.getDirtyNodes();
      expect(dirty.length).toBe(1);
      expect(dirty[0]).toBe(node2);
    });

    it('should track nodes that become dirty after initial add', () => {
      const node = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node);
      node.markClean();

      expect(diagram.getDirtyNodes()).toEqual([]);

      // Make it dirty
      node.setPosition(100, 100);

      const dirty = diagram.getDirtyNodes();
      expect(dirty.length).toBe(1);
      expect(dirty[0]).toBe(node);
    });

    it('should handle multiple dirty nodes', () => {
      const nodes = [];
      for (let i = 0; i < 10; i++) {
        const node = new NodeModel({
          id: `node${i}`,
          type: 'basic',
          position: { x: i * 100, y: 0 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
        nodes.push(node);
      }

      // Mark half clean
      for (let i = 0; i < 5; i++) {
        nodes[i].markClean();
      }

      // Other half should be dirty
      const dirty = diagram.getDirtyNodes();
      expect(dirty.length).toBe(5);
    });
  });

  describe('getDirtyLinks()', () => {
    it('should return empty array when no links are dirty', () => {
      const link1 = new LinkModel('port1', 'port2');
      const link2 = new LinkModel('port3', 'port4');

      diagram.addLink(link1);
      diagram.addLink(link2);

      // Mark all clean
      link1.markClean();
      link2.markClean();

      const dirty = diagram.getDirtyLinks();
      expect(dirty).toEqual([]);
    });

    it('should return dirty links only', () => {
      const link1 = new LinkModel('port1', 'port2');
      const link2 = new LinkModel('port3', 'port4');

      diagram.addLink(link1);
      diagram.addLink(link2);

      // Mark link1 clean, link2 stays dirty
      link1.markClean();
      link2.setPoints([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]);

      const dirty = diagram.getDirtyLinks();
      expect(dirty.length).toBe(1);
      expect(dirty[0]).toBe(link2);
    });

    it('should track links that become dirty after initial add', () => {
      const link = new LinkModel('port1', 'port2');

      diagram.addLink(link);
      link.markClean();

      expect(diagram.getDirtyLinks()).toEqual([]);

      // Make it dirty
      link.setPoints([
        { x: 0, y: 0 },
        { x: 200, y: 200 },
      ]);

      const dirty = diagram.getDirtyLinks();
      expect(dirty.length).toBe(1);
      expect(dirty[0]).toBe(link);
    });
  });

  describe('getDirtyGroups()', () => {
    it('should return empty array when no groups are dirty', () => {
      const group1 = new GroupModel({ name: 'group1' });
      const group2 = new GroupModel({ name: 'group2' });

      diagram.addGroup(group1);
      diagram.addGroup(group2);

      // Mark all clean
      group1.markClean();
      group2.markClean();

      const dirty = diagram.getDirtyGroups();
      expect(dirty).toEqual([]);
    });

    it('should return dirty groups only', () => {
      const group1 = new GroupModel({ name: 'group1' });
      const group2 = new GroupModel({ name: 'group2' });

      diagram.addGroup(group1);
      diagram.addGroup(group2);

      // Mark group1 clean, group2 stays dirty
      group1.markClean();
      group2.setMetadata('changed', 'true');

      const dirty = diagram.getDirtyGroups();
      expect(dirty.length).toBe(1);
      expect(dirty[0]).toBe(group2);
    });
  });

  describe('markAllClean()', () => {
    it('should mark all nodes, links, and groups clean', () => {
      const node = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const link = new LinkModel('port1', 'port2');
      const group = new GroupModel({ name: 'group1' });

      diagram.addNode(node);
      diagram.addLink(link);
      diagram.addGroup(group);

      // All should be dirty initially
      expect(diagram.getDirtyNodes().length).toBeGreaterThan(0);
      expect(diagram.getDirtyLinks().length).toBeGreaterThan(0);
      expect(diagram.getDirtyGroups().length).toBeGreaterThan(0);

      diagram.markAllClean();

      expect(diagram.getDirtyNodes()).toEqual([]);
      expect(diagram.getDirtyLinks()).toEqual([]);
      expect(diagram.getDirtyGroups()).toEqual([]);
    });

    it('should emit dirty:cleared event', () => {
      const listener = jest.fn();
      diagram.on('dirty:cleared', listener);

      const node = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      diagram.addNode(node);

      diagram.markAllClean();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getDirtyCount()', () => {
    it('should return total count of dirty entities', () => {
      const node1 = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        id: 'node2',
        type: 'basic',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });
      const link = new LinkModel('port1', 'port2');
      const group = new GroupModel({ name: 'group1' });

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addLink(link);
      diagram.addGroup(group);

      const count = diagram.getDirtyCount();
      expect(count).toBe(4); // All entities dirty
    });

    it('should return 0 when all entities are clean', () => {
      const node = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      diagram.addNode(node);
      node.markClean();

      expect(diagram.getDirtyCount()).toBe(0);
    });

    it('should update as entities become dirty/clean', () => {
      const node = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      diagram.addNode(node);

      expect(diagram.getDirtyCount()).toBe(1);

      node.markClean();
      expect(diagram.getDirtyCount()).toBe(0);

      node.setPosition(100, 100);
      expect(diagram.getDirtyCount()).toBe(1);
    });
  });

  describe('Performance with Large Diagrams', () => {
    it('should efficiently query dirty nodes from 1000 total', () => {
      // Add 1000 nodes
      for (let i = 0; i < 1000; i++) {
        const node = new NodeModel({
          id: `node${i}`,
          type: 'basic',
          position: { x: i * 10, y: 0 },
          size: { width: 50, height: 50 },
        });
        diagram.addNode(node);
      }

      // Mark 900 clean, leaving 100 dirty
      const nodes = diagram.getNodes();
      for (let i = 0; i < 900; i++) {
        nodes[i].markClean();
      }

      const start = performance.now();
      const dirty = diagram.getDirtyNodes();
      const duration = performance.now() - start;

      expect(dirty.length).toBe(100);
      expect(duration).toBeLessThan(50); // Fast query
    });
  });

  describe('Integration with Viewport Virtualization', () => {
    it('should support getting visible dirty nodes', () => {
      const node1 = new NodeModel({
        id: 'node1',
        type: 'basic',
        position: { x: 0, y: 0 },
        size: { width: 50, height: 50 },
      });
      const node2 = new NodeModel({
        id: 'node2',
        type: 'basic',
        position: { x: 1000, y: 1000 }, // Far away
        size: { width: 50, height: 50 },
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      // Both dirty, but only node1 is visible
      const viewport = {
        x: 0,
        y: 0,
        width: 500,
        height: 500,
      };

      const visibleDirty = diagram.getVisibleDirtyNodes(viewport);

      expect(visibleDirty.length).toBe(1);
      expect(visibleDirty[0]).toBe(node1);
    });

    it('should support getting visible dirty links', () => {
      const link1 = new LinkModel('port1', 'port2');
      link1.setPoints([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]);

      const link2 = new LinkModel('port3', 'port4');
      link2.setPoints([
        { x: 1000, y: 1000 },
        { x: 2000, y: 2000 },
      ]);

      diagram.addLink(link1);
      diagram.addLink(link2);

      const viewport = {
        x: 0,
        y: 0,
        width: 500,
        height: 500,
      };

      const visibleDirty = diagram.getVisibleDirtyLinks(viewport);

      expect(visibleDirty.length).toBe(1);
      expect(visibleDirty[0]).toBe(link1);
    });
  });
});
