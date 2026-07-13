// MoveNodeCommand - Moves a node to a new position

import { Command, CommandContext, SerializedCommand } from '../Command';
import { Point } from '../../types';

export interface MoveNodeCommandOptions {
  /**
   * Whether CommandManager may MERGE this move into the previous one for the
   * same node (default: true, preserving the historic behaviour).
   *
   * Merging exists for callers that stream many small moves (e.g. one command
   * per pointer-move). A caller that already commits ONE command per completed
   * gesture must opt OUT: otherwise two separate drags of the same node landing
   * inside CommandManager's merge window (500ms) collapse into a single undo
   * step, and one Ctrl+Z would rewind BOTH gestures.
   */
  mergeable?: boolean;
}

export class MoveNodeCommand extends Command {
  private oldPosition?: Point;
  private newPosition: Point;
  private readonly mergeable: boolean;

  constructor(
    private nodeId: string,
    newPosition: Point,
    oldPosition?: Point,
    options: MoveNodeCommandOptions = {}
  ) {
    super('Move Node');
    this.newPosition = { ...newPosition };
    if (oldPosition) {
      this.oldPosition = { ...oldPosition };
    }
    this.mergeable = options.mergeable !== false;
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

    // A gesture-committed move opts out of merging (see MoveNodeCommandOptions):
    // one gesture must stay one undo step.
    if (!this.mergeable || !other.mergeable) {
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
      this.oldPosition, // Keep original start position
      { mergeable: this.mergeable }
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
