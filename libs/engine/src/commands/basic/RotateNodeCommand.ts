// RotateNodeCommand - Rotates a node (wave4/interaction: the rotate handle's undo step)

import { Command, CommandContext, SerializedCommand } from '../Command';

export interface RotateNodeCommandOptions {
  /**
   * Whether CommandManager may MERGE this rotation into the previous one for the
   * same node (default: false).
   *
   * A rotate GESTURE mutates `node.rotation` live for smoothness and commits ONE
   * command at pointer-up, so merging must be OFF by default: two consecutive
   * rotations landing inside CommandManager's 500ms merge window would otherwise
   * collapse into a single undo step and one Ctrl+Z would rewind both. (This is
   * the same trap MoveNodeCommand documents — it just defaults the other way for
   * backward compatibility.)
   */
  mergeable?: boolean;
}

/**
 * Rotate a node to an absolute angle (degrees), undoable.
 *
 * Mirrors {@link ResizeNodeCommand}: `oldRotation` is captured on first execute
 * when the caller did not supply it, so a command built from a live gesture (the
 * model already sits at its final angle) still restores the pre-gesture angle.
 */
export class RotateNodeCommand extends Command {
  private oldRotation?: number;
  private newRotation: number;
  private readonly mergeable: boolean;

  constructor(
    private nodeId: string,
    newRotation: number,
    oldRotation?: number,
    options: RotateNodeCommandOptions = {}
  ) {
    super('Rotate Node');
    this.newRotation = newRotation;
    if (oldRotation !== undefined) {
      this.oldRotation = oldRotation;
    }
    this.mergeable = options.mergeable === true;
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

    if (this.oldRotation === undefined) {
      this.oldRotation = node.rotation;
    }

    node.setRotation(this.newRotation);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || this.oldRotation === undefined) {
      throw new Error('Cannot undo: missing diagram or old rotation');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    node.setRotation(this.oldRotation);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && this.oldRotation !== undefined;
  }

  override canMergeWith(other: Command): boolean {
    if (!(other instanceof RotateNodeCommand)) {
      return false;
    }
    if (!this.mergeable || !other.mergeable) {
      return false;
    }
    return this.nodeId === other.nodeId;
  }

  override mergeWith(other: Command): Command {
    if (!(other instanceof RotateNodeCommand)) {
      throw new Error('Cannot merge with different command type');
    }
    return new RotateNodeCommand(this.nodeId, other.newRotation, this.oldRotation, {
      mergeable: this.mergeable,
    });
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        oldRotation: this.oldRotation,
        newRotation: this.newRotation,
      },
    };
  }

  override getDescription(): string {
    return `Rotate node to ${Math.round(this.newRotation)}°`;
  }
}
