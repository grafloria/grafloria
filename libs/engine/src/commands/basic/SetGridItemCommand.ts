// SetGridItemCommand - Sets grid item configuration on a node (Phase 1.7)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { GridItemConfig } from '../../types/layout.types';

export class SetGridItemCommand extends Command {
  private oldGridConfig?: GridItemConfig;

  constructor(
    private nodeId: string,
    private gridConfig: GridItemConfig
  ) {
    super('Set Grid Item');
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
    this.oldGridConfig = node.getGridItem();

    // Set new grid item config
    node.setGridItem(this.gridConfig);
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
    if (this.oldGridConfig === undefined) {
      node.clearGridItem();
    } else {
      node.setGridItem(this.oldGridConfig);
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
        gridConfig: this.gridConfig,
        oldGridConfig: this.oldGridConfig,
      },
    };
  }

  override getDescription(): string {
    return `Set grid item config on node ${this.nodeId}`;
  }
}
