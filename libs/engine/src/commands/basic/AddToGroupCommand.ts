// AddToGroupCommand - Adds an entity to a group (Phase 1.6c)

import { Command, CommandContext, SerializedCommand } from '../Command';

export class AddToGroupCommand extends Command {
  constructor(
    private groupId: string,
    private entityId: string
  ) {
    super('Add To Group');
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

    group.addMember(this.entityId);
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

    group.removeMember(this.entityId);
  }

  override canExecute(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    // Check group exists
    const group = context.diagram.getGroup(this.groupId);
    if (!group) {
      return false;
    }

    // Check entity exists (node, link, or nested group). Groups may be members
    // of groups for compound-graph nesting (Wave-2).
    const entityExists =
      context.diagram.nodes.has(this.entityId) ||
      context.diagram.links.has(this.entityId) ||
      context.diagram.groups.has(this.entityId);

    return entityExists;
  }

  override canUndo(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    const group = context.diagram.getGroup(this.groupId);
    return !!group && group.members.has(this.entityId);
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
    return `Add entity ${this.entityId} to group ${this.groupId}`;
  }
}
