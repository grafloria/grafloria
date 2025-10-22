// CollapseGroupCommand - Collapses an expanded group (Phase 1.6c)

import { Command, CommandContext, SerializedCommand } from '../Command';

export class CollapseGroupCommand extends Command {
  private wasExpanded?: boolean;

  constructor(private groupId: string) {
    super('Collapse Group');
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
    this.wasExpanded = !group.isCollapsed;

    group.collapse();
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
    if (this.wasExpanded) {
      group.expand();
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
    return this.canExecute(context) && this.wasExpanded !== undefined;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        wasExpanded: this.wasExpanded,
      },
    };
  }

  override getDescription(): string {
    return `Collapse group ${this.groupId}`;
  }
}
