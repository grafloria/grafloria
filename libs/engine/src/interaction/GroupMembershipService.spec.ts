// GroupMembershipService.spec.ts - Wave-2 interactive drag-in / drag-out
//
// Covers: drag-in dispatches AddToGroupCommand (undoable), drag-out dispatches
// RemoveFromGroupCommand, memberValidation vetoes a drop, hover highlight, and
// innermost-group hit-testing for nested groups.

import { DiagramModel } from '../models/DiagramModel';
import { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { EventBus } from '../events/EventBus';
import { CommandManager } from '../commands/CommandManager';
import { AddToGroupCommand } from '../commands/basic/AddToGroupCommand';
import { RemoveFromGroupCommand } from '../commands/basic/RemoveFromGroupCommand';
import { GroupMembershipService } from './GroupMembershipService';

function makeNode(id: string, x: number, y: number): NodeModel {
  return new NodeModel({ id, type: 'default', position: { x, y }, size: { width: 40, height: 40 } });
}

function makeGroup(
  id: string,
  rect: { x: number; y: number; width: number; height: number }
): GroupModel {
  const g = new GroupModel({ id, name: id });
  g.bounds = { ...rect };
  return g;
}

describe('GroupMembershipService (Wave-2)', () => {
  let diagram: DiagramModel;
  let eventBus: EventBus;
  let commandManager: CommandManager;
  let service: GroupMembershipService;

  beforeEach(() => {
    diagram = new DiagramModel();
    eventBus = new EventBus();
    commandManager = new CommandManager({ diagram, eventBus }, eventBus);
    service = new GroupMembershipService({ diagram, dispatcher: commandManager });
  });

  describe('drag-in', () => {
    it('dispatches an AddToGroupCommand and adds the node, undoably', async () => {
      const node = makeNode('n1', 300, 300);
      diagram.addNode(node);
      const group = makeGroup('g1', { x: 0, y: 0, width: 200, height: 200 });
      diagram.addGroup(group);

      const result = await service.handleNodeDragEnd('n1', { x: 100, y: 100 });

      expect(result.changed).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.toGroupId).toBe('g1');
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toBeInstanceOf(AddToGroupCommand);
      expect(group.members.has('n1')).toBe(true);

      // Undoable via the shared command stack.
      expect(commandManager.canUndo()).toBe(true);
      await commandManager.undo();
      expect(group.members.has('n1')).toBe(false);
    });

    it('is a no-op when dropped outside every group while ungrouped', async () => {
      const node = makeNode('n1', 300, 300);
      diagram.addNode(node);
      diagram.addGroup(makeGroup('g1', { x: 0, y: 0, width: 100, height: 100 }));

      const result = await service.handleNodeDragEnd('n1', { x: 500, y: 500 });

      expect(result.changed).toBe(false);
      expect(result.commands).toHaveLength(0);
      expect(commandManager.canUndo()).toBe(false);
    });
  });

  describe('drag-out', () => {
    it('dispatches a RemoveFromGroupCommand when dragged outside its group', async () => {
      const node = makeNode('n1', 50, 50);
      diagram.addNode(node);
      const group = makeGroup('g1', { x: 0, y: 0, width: 200, height: 200 });
      diagram.addGroup(group);
      group.addMember('n1', diagram);

      const result = await service.handleNodeDragEnd('n1', { x: 500, y: 500 });

      expect(result.changed).toBe(true);
      expect(result.fromGroupId).toBe('g1');
      expect(result.toGroupId).toBeUndefined();
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toBeInstanceOf(RemoveFromGroupCommand);
      expect(group.members.has('n1')).toBe(false);

      await commandManager.undo();
      expect(group.members.has('n1')).toBe(true);
    });
  });

  describe('reparent between groups', () => {
    it('removes from the old group and adds to the new one', async () => {
      const node = makeNode('n1', 20, 20);
      diagram.addNode(node);
      const groupA = makeGroup('A', { x: 0, y: 0, width: 100, height: 100 });
      const groupB = makeGroup('B', { x: 200, y: 0, width: 100, height: 100 });
      diagram.addGroup(groupA);
      diagram.addGroup(groupB);
      groupA.addMember('n1', diagram);

      const result = await service.handleNodeDragEnd('n1', { x: 250, y: 50 });

      expect(result.changed).toBe(true);
      expect(result.fromGroupId).toBe('A');
      expect(result.toGroupId).toBe('B');
      expect(result.commands).toHaveLength(2);
      expect(result.commands[0]).toBeInstanceOf(RemoveFromGroupCommand);
      expect(result.commands[1]).toBeInstanceOf(AddToGroupCommand);
      expect(groupA.members.has('n1')).toBe(false);
      expect(groupB.members.has('n1')).toBe(true);

      // Two undo steps fully revert the reparent.
      await commandManager.undo();
      await commandManager.undo();
      expect(groupB.members.has('n1')).toBe(false);
      expect(groupA.members.has('n1')).toBe(true);
    });
  });

  describe('member validation on drop', () => {
    it('rejects the drop and makes no membership change', async () => {
      const node = makeNode('n1', 300, 300);
      diagram.addNode(node);
      const group = makeGroup('g1', { x: 0, y: 0, width: 200, height: 200 });
      group.memberValidation = () => false;
      diagram.addGroup(group);

      const result = await service.handleNodeDragEnd('n1', { x: 100, y: 100 });

      expect(result.rejected).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.commands).toHaveLength(0);
      expect(group.members.has('n1')).toBe(false);
      expect(commandManager.canUndo()).toBe(false);
    });
  });

  describe('hover highlight', () => {
    it('highlights the group under the cursor and clears it when leaving', () => {
      const group = makeGroup('g1', { x: 0, y: 0, width: 200, height: 200 });
      diagram.addGroup(group);
      const events: boolean[] = [];
      group.on('hover:changed', (v: boolean) => events.push(v));

      service.updateHover({ x: 100, y: 100 });
      expect(group.isHovered).toBe(true);

      service.updateHover({ x: 500, y: 500 });
      expect(group.isHovered).toBe(false);

      expect(events).toEqual([true, false]);
    });
  });

  describe('innermost-group hit-testing', () => {
    it('returns the deepest nested group containing the point', () => {
      const outer = makeGroup('outer', { x: 0, y: 0, width: 300, height: 300 });
      const inner = makeGroup('inner', { x: 50, y: 50, width: 100, height: 100 });
      diagram.addGroup(outer);
      diagram.addGroup(inner);
      outer.addMember('inner', diagram); // nest inner under outer

      const hit = service.hitTestGroup({ x: 100, y: 100 });
      expect(hit?.id).toBe('inner');

      // A point inside outer but outside inner resolves to outer.
      const outerHit = service.hitTestGroup({ x: 10, y: 10 });
      expect(outerHit?.id).toBe('outer');
    });
  });
});
