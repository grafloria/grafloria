// SetFlexItemCommand - Sets flex item configuration on a node (Phase 1.7)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { FlexItemConfig } from '../../types/layout.types';

export class SetFlexItemCommand extends Command {
  private oldFlexConfig?: FlexItemConfig;

  constructor(
    private nodeId: string,
    private flexConfig: FlexItemConfig
  ) {
    super('Set Flex Item');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    // Save old config for undo
    this.oldFlexConfig = node.getFlexItem();

    // Set new flex item config
    node.setFlexItem(this.flexConfig);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    // Restore old config
    if (this.oldFlexConfig === undefined) {
      node.clearFlexItem();
    } else {
      node.setFlexItem(this.oldFlexConfig);
    }
  }

  override canExecute(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    const node = diagram.getNode(this.nodeId);
    return node !== undefined;
  }

  override canUndo(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    const node = diagram.getNode(this.nodeId);
    return node !== undefined;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        flexConfig: this.flexConfig,
        oldFlexConfig: this.oldFlexConfig,
      },
    };
  }

  override getDescription(): string {
    return `Set flex item config on node ${this.nodeId}`;
  }
}
