// AddGroupCommand - Adds a group to the diagram (Phase 1.6c)

import { Command, CommandContext, SerializedCommand } from '../Command';
import { GroupModel, SerializedGroup } from '../../models/GroupModel';

export class AddGroupCommand extends Command {
  private groupData: SerializedGroup;

  constructor(private group: GroupModel) {
    super('Add Group');
    this.groupData = group.serialize();
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Restore group from serialized data
    const group = GroupModel.fromJSON(this.groupData);
    diagram.addGroup(group);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    diagram.removeGroup(this.groupData.id);
  }

  override canExecute(context: CommandContext): boolean {
    return !!(context.diagram && !context.diagram.groups.has(this.groupData.id));
  }

  override canUndo(context: CommandContext): boolean {
    return !!(context.diagram && context.diagram.groups.has(this.groupData.id));
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        group: this.groupData,
      },
    };
  }

  override getDescription(): string {
    return `Add group "${this.groupData.name}"`;
  }
}
