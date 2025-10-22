// SetLayoutCommand - Sets layout configuration on a group (Phase 1.7)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { LayoutType, LayoutConfig } from '../../types/layout.types';

export class SetLayoutCommand extends Command {
  private oldLayoutType: LayoutType;
  private oldLayoutConfig?: LayoutConfig;

  constructor(
    private groupId: string,
    private layoutType: 'flexbox' | 'grid',
    private layoutConfig: LayoutConfig
  ) {
    super('Set Layout');
    // Will be set during execute
    this.oldLayoutType = 'none';
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

    // Save old layout for undo
    this.oldLayoutType = group.layoutType;
    this.oldLayoutConfig = group.layoutConfig;

    // Set new layout
    group.setLayout(this.layoutType, this.layoutConfig);
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

    // Restore old layout
    if (this.oldLayoutType === 'none') {
      group.clearLayout();
    } else {
      group.setLayout(this.oldLayoutType as 'flexbox' | 'grid', this.oldLayoutConfig!);
    }
  }

  override canExecute(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    const group = diagram.getGroup(this.groupId);
    return group !== undefined;
  }

  override canUndo(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    const group = diagram.getGroup(this.groupId);
    return group !== undefined;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        groupId: this.groupId,
        layoutType: this.layoutType,
        layoutConfig: this.layoutConfig,
        oldLayoutType: this.oldLayoutType,
        oldLayoutConfig: this.oldLayoutConfig,
      },
    };
  }

  override getDescription(): string {
    return `Set ${this.layoutType} layout on group ${this.groupId}`;
  }
}
