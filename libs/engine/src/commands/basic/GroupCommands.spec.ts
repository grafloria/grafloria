// GroupCommands.spec.ts - Tests for Group Commands (Phase 1.6c Part 3)

import { DiagramModel } from '../../models/DiagramModel';
import { GroupModel } from '../../models/GroupModel';
import { NodeModel } from '../../models/NodeModel';
import { AddGroupCommand } from './AddGroupCommand';
import { RemoveGroupCommand } from './RemoveGroupCommand';
import { AddToGroupCommand } from './AddToGroupCommand';
import { RemoveFromGroupCommand } from './RemoveFromGroupCommand';
import { ExpandGroupCommand } from './ExpandGroupCommand';
import { CollapseGroupCommand } from './CollapseGroupCommand';

describe('Group Commands (Phase 1.6c Part 3)', () => {
  let diagram: DiagramModel;
  let context: any;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = {
      diagram,
      eventBus: { emit: jest.fn() }
    };
  });

  describe('AddGroupCommand', () => {
    it('should add group to diagram', () => {
      const group = new GroupModel({ name: 'Test Group' });
      const command = new AddGroupCommand(group);

      command.execute(context);

      expect(diagram.getGroup(group.id)).toBeDefined();
      expect(diagram.getGroups()).toHaveLength(1);
    });

    it('should preserve group data through serialization', () => {
      const group = new GroupModel({ name: 'Test Group' });
      group.addMember('node-1');
      group.collapse();

      const command = new AddGroupCommand(group);
      command.execute(context);

      const addedGroup = diagram.getGroup(group.id);
      expect(addedGroup?.name).toBe('Test Group');
      expect(addedGroup?.members.has('node-1')).toBe(true);
      expect(addedGroup?.isCollapsed).toBe(true);
    });

    it('should undo group addition', () => {
      const group = new GroupModel({ name: 'Test Group' });
      const command = new AddGroupCommand(group);

      command.execute(context);
      command.undo(context);

      expect(diagram.getGroup(group.id)).toBeUndefined();
      expect(diagram.getGroups()).toHaveLength(0);
    });

    it('should be redoable', () => {
      const group = new GroupModel({ name: 'Test Group' });
      const command = new AddGroupCommand(group);

      command.execute(context);
      command.undo(context);
      command.execute(context);

      expect(diagram.getGroup(group.id)).toBeDefined();
    });

    it('should not execute if group already exists', () => {
      const group = new GroupModel({ name: 'Test Group' });
      diagram.addGroup(group);

      const command = new AddGroupCommand(group);

      expect(command.canExecute(context)).toBe(false);
    });
  });

  describe('RemoveGroupCommand', () => {
    it('should remove group from diagram', () => {
      const group = new GroupModel({ name: 'Test Group' });
      diagram.addGroup(group);

      const command = new RemoveGroupCommand(group.id);
      command.execute(context);

      expect(diagram.getGroup(group.id)).toBeUndefined();
      expect(diagram.getGroups()).toHaveLength(0);
    });

    it('should preserve group data for undo', () => {
      const group = new GroupModel({ name: 'Test Group' });
      group.addMember('node-1');
      group.collapse();
      diagram.addGroup(group);

      const command = new RemoveGroupCommand(group.id);
      command.execute(context);
      command.undo(context);

      const restoredGroup = diagram.getGroup(group.id);
      expect(restoredGroup?.name).toBe('Test Group');
      expect(restoredGroup?.members.has('node-1')).toBe(true);
      expect(restoredGroup?.isCollapsed).toBe(true);
    });

    it('should undo group removal', () => {
      const group = new GroupModel({ name: 'Test Group' });
      diagram.addGroup(group);

      const command = new RemoveGroupCommand(group.id);
      command.execute(context);
      command.undo(context);

      expect(diagram.getGroup(group.id)).toBeDefined();
    });

    it('should not execute if group does not exist', () => {
      const command = new RemoveGroupCommand('non-existent');

      expect(command.canExecute(context)).toBe(false);
    });
  });

  describe('AddToGroupCommand', () => {
    let group: GroupModel;
    let node: NodeModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Test Group' });
      diagram.addGroup(group);

      node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);
    });

    it('should add node to group', () => {
      const command = new AddToGroupCommand(group.id, node.id);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(true);
    });

    it('should undo adding node to group', () => {
      const command = new AddToGroupCommand(group.id, node.id);

      command.execute(context);
      command.undo(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(false);
    });

    it('should be redoable', () => {
      const command = new AddToGroupCommand(group.id, node.id);

      command.execute(context);
      command.undo(context);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(true);
    });

    it('should not execute if group does not exist', () => {
      const command = new AddToGroupCommand('non-existent', node.id);

      expect(command.canExecute(context)).toBe(false);
    });

    it('should not execute if entity does not exist', () => {
      const command = new AddToGroupCommand(group.id, 'non-existent');

      expect(command.canExecute(context)).toBe(false);
    });

    it('should not add entity if already in group', () => {
      group.addMember(node.id);

      const command = new AddToGroupCommand(group.id, node.id);
      command.execute(context);

      // Should still be in group with no duplicate
      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.size).toBe(1);
    });
  });

  describe('RemoveFromGroupCommand', () => {
    let group: GroupModel;
    let node: NodeModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Test Group' });
      node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });

      group.addMember(node.id);
      diagram.addGroup(group);
      diagram.addNode(node);
    });

    it('should remove entity from group', () => {
      const command = new RemoveFromGroupCommand(group.id, node.id);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(false);
    });

    it('should undo removing entity from group', () => {
      const command = new RemoveFromGroupCommand(group.id, node.id);

      command.execute(context);
      command.undo(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(true);
    });

    it('should be redoable', () => {
      const command = new RemoveFromGroupCommand(group.id, node.id);

      command.execute(context);
      command.undo(context);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.members.has(node.id)).toBe(false);
    });

    it('should not execute if group does not exist', () => {
      const command = new RemoveFromGroupCommand('non-existent', node.id);

      expect(command.canExecute(context)).toBe(false);
    });
  });

  describe('ExpandGroupCommand', () => {
    let group: GroupModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Test Group' });
      group.collapse();
      diagram.addGroup(group);
    });

    it('should expand collapsed group', () => {
      const command = new ExpandGroupCommand(group.id);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(false);
    });

    it('should undo group expansion', () => {
      const command = new ExpandGroupCommand(group.id);

      command.execute(context);
      command.undo(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(true);
    });

    it('should be redoable', () => {
      const command = new ExpandGroupCommand(group.id);

      command.execute(context);
      command.undo(context);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(false);
    });

    it('should not execute if group does not exist', () => {
      const command = new ExpandGroupCommand('non-existent');

      expect(command.canExecute(context)).toBe(false);
    });

    it('should handle expanding already expanded group', () => {
      group.expand();

      const command = new ExpandGroupCommand(group.id);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(false);
    });
  });

  describe('CollapseGroupCommand', () => {
    let group: GroupModel;

    beforeEach(() => {
      group = new GroupModel({ name: 'Test Group' });
      diagram.addGroup(group);
    });

    it('should collapse expanded group', () => {
      const command = new CollapseGroupCommand(group.id);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(true);
    });

    it('should undo group collapse', () => {
      const command = new CollapseGroupCommand(group.id);

      command.execute(context);
      command.undo(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(false);
    });

    it('should be redoable', () => {
      const command = new CollapseGroupCommand(group.id);

      command.execute(context);
      command.undo(context);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(true);
    });

    it('should not execute if group does not exist', () => {
      const command = new CollapseGroupCommand('non-existent');

      expect(command.canExecute(context)).toBe(false);
    });

    it('should handle collapsing already collapsed group', () => {
      group.collapse();

      const command = new CollapseGroupCommand(group.id);
      command.execute(context);

      const updatedGroup = diagram.getGroup(group.id);
      expect(updatedGroup?.isCollapsed).toBe(true);
    });
  });

  describe('Command Serialization', () => {
    it('should serialize AddGroupCommand', () => {
      const group = new GroupModel({ name: 'Test Group' });
      const command = new AddGroupCommand(group);

      const serialized = command.serialize();

      expect(serialized.name).toBe('Add Group');
      expect(serialized.data.group).toBeDefined();
    });

    it('should serialize RemoveGroupCommand', () => {
      const command = new RemoveGroupCommand('group-1');

      const serialized = command.serialize();

      expect(serialized.name).toBe('Remove Group');
      expect(serialized.data.groupId).toBe('group-1');
    });
  });
});
