// SetNodeLabelCommand - Edits a node's label (wave4/interaction: in-place text editing)

import { Command, CommandContext, SerializedCommand } from '../Command';

/**
 * Set a node's label text, undoable.
 *
 * A node's label lives in metadata under `label` (that is what
 * `SVGRenderer.renderNodeLabel` reads), so this command is the metadata write
 * plus the dirty flag the renderer needs to repaint. It exists because in-place
 * text editing must be ONE undo step like every other direct manipulation —
 * before this, nothing in the command layer could touch a label.
 */
export class SetNodeLabelCommand extends Command {
  private oldLabel?: string;
  private readonly newLabel: string;

  constructor(
    private nodeId: string,
    newLabel: string,
    oldLabel?: string
  ) {
    super('Edit Node Label');
    this.newLabel = newLabel;
    if (oldLabel !== undefined) {
      this.oldLabel = oldLabel;
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

    if (this.oldLabel === undefined) {
      this.oldLabel = node.getMetadata('label') ?? '';
    }

    node.setLabel(this.newLabel);
    node.markDirty('label-edited');
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || this.oldLabel === undefined) {
      throw new Error('Cannot undo: missing diagram or old label');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    node.setLabel(this.oldLabel);
    node.markDirty('label-edited');
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && this.oldLabel !== undefined;
  }

  /**
   * Never merge: each committed edit (one editor session) is one undo step.
   */
  override canMergeWith(): boolean {
    return false;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        oldLabel: this.oldLabel,
        newLabel: this.newLabel,
      },
    };
  }

  override getDescription(): string {
    return `Set node label to "${this.newLabel}"`;
  }
}
