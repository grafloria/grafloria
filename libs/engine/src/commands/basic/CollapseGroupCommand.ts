// CollapseGroupCommand - Collapses an expanded group (Phase 1.6c)
//
// Wave-5 Card 4: this now performs a REAL collapse (hide members, save layout,
// re-home boundary edges to aggregated proxy links, shrink to a placeholder)
// via GroupCollapseService — all inside one command so it is a single undo step.

import { Command, CommandContext, SerializedCommand } from '../Command';
import { GroupCollapseService, CollapseOptions } from '../../interaction/GroupCollapseService';

export class CollapseGroupCommand extends Command {
  private wasExpanded?: boolean;

  constructor(
    private groupId: string,
    private options?: CollapseOptions
  ) {
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

    new GroupCollapseService(diagram).collapse(group, this.options);
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

    // Restore previous state — expand reverses the collapse exactly.
    if (this.wasExpanded) {
      new GroupCollapseService(diagram).expand(group);
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
