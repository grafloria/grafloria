// ExpandGroupCommand - Expands a collapsed group (Phase 1.6c)
//
// Wave-5 Card 4: expands a REAL collapse (restores members, positions, removed
// links, and boundary-edge endpoints) via GroupCollapseService. Reverses a
// collapse that was performed either by the service or by the bare flag.

import { Command, CommandContext, SerializedCommand } from '../Command';
import { GroupCollapseService } from '../../interaction/GroupCollapseService';

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

    new GroupCollapseService(diagram).expand(group);
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

    // Restore previous state — re-collapse if it had been collapsed.
    if (this.wasCollapsed) {
      new GroupCollapseService(diagram).collapse(group);
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
