// RemoveGroupCommand - Removes a group from the diagram (Phase 1.6c)

import { Command, CommandContext, SerializedCommand } from '../Command';
import { GroupModel, SerializedGroup } from '../../models/GroupModel';

export class RemoveGroupCommand extends Command {
  private groupData?: SerializedGroup;

  constructor(private groupId: string) {
    super('Remove Group');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Store group data for undo
    const group = diagram.getGroup(this.groupId);
    if (group) {
      this.groupData = group.serialize();
    }

    diagram.removeGroup(this.groupId);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.groupData) {
      throw new Error('Cannot undo: diagram or group data not found');
    }

    // Restore group from stored data
    const group = GroupModel.fromJSON(this.groupData);
    diagram.addGroup(group);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.groups.has(this.groupId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && !context.diagram.groups.has(this.groupId) && !!this.groupData;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        groupData: this.groupData,
      },
    };
  }

  override getDescription(): string {
    return `Remove group "${this.groupData?.name || this.groupId}"`;
  }
}
