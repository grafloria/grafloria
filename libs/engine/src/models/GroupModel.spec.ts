// GroupModel.spec.ts - Tests for GroupModel (Phase 1.6c Part 1)

import { GroupModel } from './GroupModel';
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

describe('GroupModel (Phase 1.6c)', () => {
  describe('Construction', () => {
    it('should create group with name', () => {
      const group = new GroupModel({ name: 'Test Group' });

      expect(group.name).toBe('Test Group');
      expect(group.members.size).toBe(0);
      expect(group.isCollapsed).toBe(false);
      expect(group.bounds).toBeUndefined();
    });

    it('should create group with custom ID', () => {
      const group = new GroupModel({ id: 'group-1', name: 'Custom Group' });

      expect(group.id).toBe('group-1');
      expect(group.name).toBe('Custom Group');
    });
  });

  describe('Member Management', () => {
    let group: GroupModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Test Group' });
    });

    it('should add member to group', () => {
      group.addMember('node-1');

      expect(group.members.has('node-1')).toBe(true);
      expect(group.members.size).toBe(1);
    });

    it('should not add duplicate members', () => {
      group.addMember('node-1');
      group.addMember('node-1');

      expect(group.members.size).toBe(1);
    });

    it('should emit event when member added', () => {
      const handler = jest.fn();
      group.on('member:added', handler);

      group.addMember('node-1');

      expect(handler).toHaveBeenCalledWith('node-1');
    });

    it('should remove member from group', () => {
      group.addMember('node-1');
      const result = group.removeMember('node-1');

      expect(result).toBe(true);
      expect(group.members.has('node-1')).toBe(false);
      expect(group.members.size).toBe(0);
    });

    it('should return false when removing non-existent member', () => {
      const result = group.removeMember('non-existent');

      expect(result).toBe(false);
    });

    it('should emit event when member removed', () => {
      const handler = jest.fn();
      group.addMember('node-1');
      group.on('member:removed', handler);

      group.removeMember('node-1');

      expect(handler).toHaveBeenCalledWith('node-1');
    });

    it('should add multiple members', () => {
      group.addMember('node-1');
      group.addMember('node-2');
      group.addMember('node-3');

      expect(group.members.size).toBe(3);
      expect(group.members.has('node-1')).toBe(true);
      expect(group.members.has('node-2')).toBe(true);
      expect(group.members.has('node-3')).toBe(true);
    });
  });

  describe('Expand/Collapse', () => {
    let group: GroupModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Test Group' });
    });

    it('should start in expanded state', () => {
      expect(group.isCollapsed).toBe(false);
    });

    it('should collapse group', () => {
      group.collapse();

      expect(group.isCollapsed).toBe(true);
    });

    it('should emit event when collapsed', () => {
      const handler = jest.fn();
      group.on('collapsed', handler);

      group.collapse();

      expect(handler).toHaveBeenCalled();
    });

    it('should not emit event when already collapsed', () => {
      const handler = jest.fn();
      group.collapse();
      group.on('collapsed', handler);

      group.collapse();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should expand group', () => {
      group.collapse();
      group.expand();

      expect(group.isCollapsed).toBe(false);
    });

    it('should emit event when expanded', () => {
      const handler = jest.fn();
      group.collapse();
      group.on('expanded', handler);

      group.expand();

      expect(handler).toHaveBeenCalled();
    });

    it('should not emit event when already expanded', () => {
      const handler = jest.fn();
      group.on('expanded', handler);

      group.expand();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Bounds Calculation', () => {
    let diagram: DiagramModel;
    let group: GroupModel;

    beforeEach(() => {
      diagram = new DiagramModel('test');
      group = new GroupModel({ name: 'Test Group' });
    });

    it('should set bounds to undefined when no members', () => {
      group.calculateBounds(diagram);

      expect(group.bounds).toBeUndefined();
    });

    it('should calculate bounds from single node', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 }
      });
      diagram.addNode(node);
      group.addMember(node.id);

      group.calculateBounds(diagram);

      expect(group.bounds).toEqual({
        x: 100,
        y: 100,
        width: 50,
        height: 50
      });
    });

    it('should calculate bounds from multiple nodes', () => {
      const node1 = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 }
      });
      const node2 = new NodeModel({
        type: 'test',
        position: { x: 200, y: 150 },
        size: { width: 60, height: 40 }
      });
      diagram.addNode(node1);
      diagram.addNode(node2);
      group.addMember(node1.id);
      group.addMember(node2.id);

      group.calculateBounds(diagram);

      // node1: (100, 100) to (150, 150)
      // node2: (200, 150) to (260, 190)
      // bounds: (100, 100) to (260, 190) -> width: 160, height: 90
      expect(group.bounds).toEqual({
        x: 100,
        y: 100,
        width: 160,
        height: 90
      });
    });

    it('should use global bounds for transformed nodes', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 }
      });
      node.setRotation(Math.PI / 4); // 45 degrees
      diagram.addNode(node);
      group.addMember(node.id);

      group.calculateBounds(diagram);

      // Rotated bounds should be larger than original
      expect(group.bounds).toBeDefined();
      expect(group.bounds!.width).toBeGreaterThan(50);
      expect(group.bounds!.height).toBeGreaterThan(50);
    });

    it('should skip non-existent nodes', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 }
      });
      diagram.addNode(node);
      group.addMember(node.id);
      group.addMember('non-existent');

      group.calculateBounds(diagram);

      // Should calculate bounds only from existing node
      expect(group.bounds).toEqual({
        x: 100,
        y: 100,
        width: 50,
        height: 50
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize group', () => {
      const group = new GroupModel({ id: 'group-1', name: 'Test Group' });
      group.addMember('node-1');
      group.addMember('node-2');
      group.collapse();
      group.bounds = { x: 10, y: 20, width: 100, height: 80 };

      const serialized = group.serialize();

      expect(serialized.id).toBe('group-1');
      expect(serialized.name).toBe('Test Group');
      expect(serialized.members).toEqual(['node-1', 'node-2']);
      expect(serialized.isCollapsed).toBe(true);
      expect(serialized.bounds).toEqual({ x: 10, y: 20, width: 100, height: 80 });
    });

    it('should deserialize group', () => {
      const data = {
        id: 'group-1',
        uuid: '00000001-0000-4000-a000-000000010000',
        type: 'group',
        version: 1,
        metadata: { color: 'blue' },
        name: 'Test Group',
        members: ['node-1', 'node-2'],
        isCollapsed: true,
        bounds: { x: 10, y: 20, width: 100, height: 80 }
      };

      const group = GroupModel.fromJSON(data);

      expect(group.id).toBe('group-1');
      expect(group.name).toBe('Test Group');
      expect(group.members.size).toBe(2);
      expect(group.members.has('node-1')).toBe(true);
      expect(group.members.has('node-2')).toBe(true);
      expect(group.isCollapsed).toBe(true);
      expect(group.bounds).toEqual({ x: 10, y: 20, width: 100, height: 80 });
      expect(group.metadata.get('color')).toBe('blue');
    });

    it('should round-trip serialize/deserialize', () => {
      const original = new GroupModel({ name: 'Test Group' });
      original.addMember('node-1');
      original.addMember('node-2');
      original.collapse();
      original.metadata.set('key', 'value');

      const serialized = original.serialize();
      const restored = GroupModel.fromJSON(serialized);

      expect(restored.name).toBe(original.name);
      expect(restored.members.size).toBe(original.members.size);
      expect(restored.isCollapsed).toBe(original.isCollapsed);
      expect(restored.metadata.get('key')).toBe('value');
    });
  });
});
