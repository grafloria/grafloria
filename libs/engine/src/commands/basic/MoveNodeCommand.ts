// MoveNodeCommand - Moves a node to a new position

import { Command, CommandContext, SerializedCommand } from '../Command';
import { Point } from '../../types';

export class MoveNodeCommand extends Command {
  private oldPosition?: Point;
  private newPosition: Point;

  constructor(
    private nodeId: string,
    newPosition: Point,
    oldPosition?: Point
  ) {
    super('Move Node');
    this.newPosition = { ...newPosition };
    if (oldPosition) {
      this.oldPosition = { ...oldPosition };
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

    // Save old position for undo
    if (!this.oldPosition) {
      this.oldPosition = { ...node.position };
    }

    // Move node
    node.setPosition(this.newPosition.x, this.newPosition.y, this.newPosition.z);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.oldPosition) {
      throw new Error('Cannot undo: missing diagram or old position');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    // Restore old position
    node.setPosition(this.oldPosition.x, this.oldPosition.y, this.oldPosition.z);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && !!this.oldPosition;
  }

  override canMergeWith(other: Command): boolean {
    if (!(other instanceof MoveNodeCommand)) {
      return false;
    }

    // Can merge if same node
    return this.nodeId === other.nodeId;
  }

  override mergeWith(other: Command): Command {
    if (!(other instanceof MoveNodeCommand)) {
      throw new Error('Cannot merge with different command type');
    }

    // Create new command with updated position
    return new MoveNodeCommand(
      this.nodeId,
      other.newPosition,
      this.oldPosition // Keep original start position
    );
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        oldPosition: this.oldPosition,
        newPosition: this.newPosition,
      },
    };
  }

  override getDescription(): string {
    return `Move node to (${Math.round(this.newPosition.x)}, ${Math.round(this.newPosition.y)})`;
  }
}
