// RemoveFromGroupCommand - Removes an entity from a group (Phase 1.6c)

import { Command, CommandContext, SerializedCommand } from '../Command';

export class RemoveFromGroupCommand extends Command {
  constructor(
    private groupId: string,
    private entityId: string
  ) {
    super('Remove From Group');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const group = diagram.getGroup(this.groupId);
    if (!group) {
      throw new Error(`Group ${this.groupId} not found`);
    }

    group.removeMember(this.entityId);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const group = diagram.getGroup(this.groupId);
    if (!group) {
      throw new Error(`Group ${this.groupId} not found`);
    }

    group.addMember(this.entityId);
  }

  override canExecute(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    const group = context.diagram.getGroup(this.groupId);
    return !!group && group.members.has(this.entityId);
  }

  override canUndo(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    const group = context.diagram.getGroup(this.groupId);
    return !!group && !group.members.has(this.entityId);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        entityId: this.entityId,
      },
    };
  }

  override getDescription(): string {
    return `Remove entity ${this.entityId} from group ${this.groupId}`;
  }
}
