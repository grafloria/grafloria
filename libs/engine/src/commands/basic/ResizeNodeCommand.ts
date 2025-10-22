// ResizeNodeCommand - Resizes a node

import { Command, CommandContext, SerializedCommand } from '../Command';
import { Size } from '../../types';

export class ResizeNodeCommand extends Command {
  private oldSize?: Size;
  private newSize: Size;

  constructor(
    private nodeId: string,
    newSize: Size,
    oldSize?: Size
  ) {
    super('Resize Node');
    this.newSize = { ...newSize };
    if (oldSize) {
      this.oldSize = { ...oldSize };
    }
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

    // Save old size for undo
    if (!this.oldSize) {
      this.oldSize = { ...node.size };
    }

    // Resize node
    node.setSize(this.newSize.width, this.newSize.height, this.newSize.depth);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.oldSize) {
      throw new Error('Cannot undo: missing diagram or old size');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    // Restore old size
    node.setSize(this.oldSize.width, this.oldSize.height, this.oldSize.depth);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && !!this.oldSize;
  }

  override canMergeWith(other: Command): boolean {
    if (!(other instanceof ResizeNodeCommand)) {
      return false;
    }

    // Can merge if same node
    return this.nodeId === other.nodeId;
  }

  override mergeWith(other: Command): Command {
    if (!(other instanceof ResizeNodeCommand)) {
      throw new Error('Cannot merge with different command type');
    }

    // Create new command with updated size
    return new ResizeNodeCommand(
      this.nodeId,
      other.newSize,
      this.oldSize // Keep original size
    );
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        oldSize: this.oldSize,
        newSize: this.newSize,
      },
    };
  }

  override getDescription(): string {
    return `Resize node to ${Math.round(this.newSize.width)}x${Math.round(this.newSize.height)}`;
  }
}
