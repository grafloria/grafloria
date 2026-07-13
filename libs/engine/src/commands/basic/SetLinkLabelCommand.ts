// SetLinkLabelCommand - Edits a link label's text (wave4/interaction: in-place text editing)

import { Command, CommandContext, SerializedCommand } from '../Command';

/**
 * Set the text of one of a link's labels, undoable.
 *
 * The wave-2 inline label editor wrote straight to `link.updateLabel(...)`, so
 * editing an edge label could not be undone — the only direct-manipulation edit
 * left outside the command layer. This is that seam.
 */
export class SetLinkLabelCommand extends Command {
  private oldText?: string;
  private readonly newText: string;

  constructor(
    private linkId: string,
    private labelIndex: number,
    newText: string,
    oldText?: string
  ) {
    super('Edit Link Label');
    this.newText = newText;
    if (oldText !== undefined) {
      this.oldText = oldText;
    }
  }

  override execute(context: CommandContext): void {
    const link = this.resolve(context);
    if (this.oldText === undefined) {
      this.oldText = link.labels?.[this.labelIndex]?.text ?? '';
    }
    link.updateLabel(this.labelIndex, { text: this.newText });
    link.markDirty('label-edited');
  }

  override undo(context: CommandContext): void {
    if (this.oldText === undefined) {
      throw new Error('Cannot undo: missing old label text');
    }
    const link = this.resolve(context);
    link.updateLabel(this.labelIndex, { text: this.oldText });
    link.markDirty('label-edited');
  }

  override canExecute(context: CommandContext): boolean {
    const link = context.diagram?.getLink?.(this.linkId);
    return !!link && !!link.labels && this.labelIndex >= 0 && this.labelIndex < link.labels.length;
  }

  override canUndo(context: CommandContext): boolean {
    return this.canExecute(context) && this.oldText !== undefined;
  }

  /** One editor session = one undo step. */
  override canMergeWith(): boolean {
    return false;
  }

  private resolve(context: CommandContext) {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }
    const link = diagram.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }
    return link;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        labelIndex: this.labelIndex,
        oldText: this.oldText,
        newText: this.newText,
      },
    };
  }

  override getDescription(): string {
    return `Set link label to "${this.newText}"`;
  }
}
