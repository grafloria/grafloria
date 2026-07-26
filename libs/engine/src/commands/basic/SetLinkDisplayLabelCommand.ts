// SetLinkDisplayLabelCommand - Edits a link's DISPLAY label (visio-depth: edge label editing)

import { Command, CommandContext, SerializedCommand } from '../Command';

/**
 * Set a link's display label — the `metadata.label` dialect — undoable.
 *
 * Links carry TWO label dialects: the POSITIONED `labels[]` collection
 * ({@link SetLinkLabelCommand} edits those) and the canonical display label
 * every spec input writes (`edges: [{ label: 'in stock' }]` →
 * `link.setLabel()` → `metadata.label`, painted at the path's midpoint by the
 * SVG renderer). The second dialect had no command at all, so the label a
 * demo/e2e/user actually SEES on an edge could not be edited undoably — the
 * in-place editor only knew `labels[]`, which that edge does not have.
 * The exact twin of {@link SetNodeLabelCommand}, for the same reason.
 */
export class SetLinkDisplayLabelCommand extends Command {
  private oldLabel?: string;
  private readonly newLabel: string;

  constructor(
    private linkId: string,
    newLabel: string,
    oldLabel?: string
  ) {
    super('Edit Link Label');
    this.newLabel = newLabel;
    if (oldLabel !== undefined) {
      this.oldLabel = oldLabel;
    }
  }

  override execute(context: CommandContext): void {
    const link = this.resolve(context);
    if (this.oldLabel === undefined) {
      this.oldLabel = String(link.getLabel() ?? '');
    }
    link.setLabel(this.newLabel);
    link.markDirty('label-edited');
  }

  override undo(context: CommandContext): void {
    if (this.oldLabel === undefined) {
      throw new Error('Cannot undo: missing old label text');
    }
    const link = this.resolve(context);
    link.setLabel(this.oldLabel);
    link.markDirty('label-edited');
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getLink?.(this.linkId);
  }

  override canUndo(context: CommandContext): boolean {
    return this.canExecute(context) && this.oldLabel !== undefined;
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
        oldLabel: this.oldLabel,
        newLabel: this.newLabel,
      },
    };
  }

  override getDescription(): string {
    return `Set link label to "${this.newLabel}"`;
  }
}
