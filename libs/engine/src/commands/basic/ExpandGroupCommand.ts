// ExpandGroupCommand - Expands a collapsed group (Phase 1.6c)

import { Command, CommandContext, SerializedCommand } from '../Command';

export class ExpandGroupCommand extends Command {
  private wasCollapsed?: boolean;

  constructor(private groupId: string) {
    super('Expand Group');
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

    // Store previous state for undo
    this.wasCollapsed = group.isCollapsed;

    group.expand();
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

    // Restore previous state
    if (this.wasCollapsed) {
      group.collapse();
    }
  }

  override canExecute(context: CommandContext): boolean {
    if (!context.diagram) {
      return false;
    }

    const group = context.diagram.getGroup(this.groupId);
    return !!group;
  }

  override canUndo(context: CommandContext): boolean {
    return this.canExecute(context) && this.wasCollapsed !== undefined;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        wasCollapsed: this.wasCollapsed,
      },
    };
  }

  override getDescription(): string {
    return `Expand group ${this.groupId}`;
  }
}
