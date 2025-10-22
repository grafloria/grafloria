// DiagramEngine.groups.spec.ts - Tests for DiagramEngine Group API (Phase 1.6c Part 4)

import { DiagramEngine } from './DiagramEngine';
import { GroupModel } from '../models/GroupModel';

describe('DiagramEngine - Group API (Phase 1.6c Part 4)', () => {
  let engine: DiagramEngine;

  beforeEach(async () => {
    engine = new DiagramEngine();
    await engine.createDiagram('test');
  });

  describe('addGroup', () => {
    it('should add group via command', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });

      expect(group).toBeDefined();
      expect(group.name).toBe('Test Group');
      expect(engine.getDiagram()?.getGroup(group.id)).toBeDefined();
    });

    it('should support undo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const groupId = group.id;

      await engine.undo();

      expect(engine.getDiagram()?.getGroup(groupId)).toBeUndefined();
    });

    it('should support redo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const groupId = group.id;

      await engine.undo();
      await engine.redo();

      expect(engine.getDiagram()?.getGroup(groupId)).toBeDefined();
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.addGroup({ name: 'Test' })).rejects.toThrow('No diagram loaded');
    });
  });

  describe('removeGroup', () => {
    it('should remove group via command', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });

      await engine.removeGroup(group.id);

      expect(engine.getDiagram()?.getGroup(group.id)).toBeUndefined();
    });

    it('should support undo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const groupId = group.id;

      await engine.removeGroup(groupId);
      await engine.undo();

      expect(engine.getDiagram()?.getGroup(groupId)).toBeDefined();
    });

    it('should throw error if group not found', async () => {
      await expect(engine.removeGroup('non-existent')).rejects.toThrow('Group non-existent not found');
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.removeGroup('group-1')).rejects.toThrow('No diagram loaded');
    });
  });

  describe('addToGroup', () => {
    it('should add entity to group via command', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      await engine.addToGroup(group.id, node.id);

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(true);
    });

    it('should support undo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      await engine.addToGroup(group.id, node.id);
      await engine.undo();

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(false);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.addToGroup('group-1', 'node-1')).rejects.toThrow('No diagram loaded');
    });
  });

  describe('removeFromGroup', () => {
    it('should remove entity from group via command', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      await engine.addToGroup(group.id, node.id);
      await engine.removeFromGroup(group.id, node.id);

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(false);
    });

    it('should support undo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      await engine.addToGroup(group.id, node.id);
      await engine.removeFromGroup(group.id, node.id);
      await engine.undo();

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(true);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.removeFromGroup('group-1', 'node-1')).rejects.toThrow('No diagram loaded');
    });
  });

  describe('expandGroup', () => {
    it('should expand group via command', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      // Collapse it first
      await engine.collapseGroup(group.id);

      await engine.expandGroup(group.id);

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(false);
    });

    it('should support undo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });
      await engine.collapseGroup(group.id);

      await engine.expandGroup(group.id);
      await engine.undo();

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(true);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.expandGroup('group-1')).rejects.toThrow('No diagram loaded');
    });
  });

  describe('collapseGroup', () => {
    it('should collapse group via command', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });

      await engine.collapseGroup(group.id);

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(true);
    });

    it('should support undo', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });

      await engine.collapseGroup(group.id);
      await engine.undo();

      const updatedGroup = engine.getDiagram()?.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(false);
    });

    it('should throw error if no diagram loaded', async () => {
      const engine2 = new DiagramEngine();

      await expect(engine2.collapseGroup('group-1')).rejects.toThrow('No diagram loaded');
    });
  });

  describe('getGroup', () => {
    it('should get group by ID', async () => {
      const group = await engine.addGroup({ name: 'Test Group' });

      const retrieved = engine.getGroup(group.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Group');
    });

    it('should return undefined for non-existent group', () => {
      const retrieved = engine.getGroup('non-existent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getGroups', () => {
    it('should get all groups', async () => {
      await engine.addGroup({ name: 'Group 1' });
      await engine.addGroup({ name: 'Group 2' });
      await engine.addGroup({ name: 'Group 3' });

      const groups = engine.getGroups();

      expect(groups).toHaveLength(3);
    });

    it('should return empty array when no groups', () => {
      const groups = engine.getGroups();

      expect(groups).toEqual([]);
    });
  });
});
