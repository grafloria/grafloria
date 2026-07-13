// SetLinkLabelsCommand — undoable replacement of a link's label array
//
// Wave 4 (Edges & links), Card 5. `addLabel` / `removeLabel` / `updateLabel`
// mutate `link.labels` in place and are NOT undoable. Card 5 makes labels rich
// (HTML in three slots, custom templates), so authoring them is a real gesture
// and needs an undo entry. One command sets the whole array: adding, editing,
// re-slotting and deleting labels are then all "one gesture = one undo entry",
// which a per-label command could not give you for a multi-label edit.

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { LinkLabel } from '../../types';

/** Deep-ish clone: LinkLabel is a flat record plus `offset` and `style`. */
function cloneLabels(labels: LinkLabel[]): LinkLabel[] {
  return labels.map(label => ({
    ...label,
    offset: { ...label.offset },
    ...(label.style ? { style: { ...label.style } } : {}),
  }));
}

export class SetLinkLabelsCommand extends Command {
  private previousLabels?: LinkLabel[];

  constructor(
    private readonly linkId: string,
    private readonly labels: LinkLabel[]
  ) {
    super('Set Link Labels');
  }

  override execute(context: CommandContext): void {
    const link = context.diagram?.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }

    this.previousLabels = cloneLabels(link.labels);
    link.labels = cloneLabels(this.labels);
    link.markDirty('labels');
    link.emitter.emit('link:labels-changed', { labels: link.labels });
  }

  override undo(context: CommandContext): void {
    const link = context.diagram?.getLink(this.linkId);
    if (!link || !this.previousLabels) {
      throw new Error('Cannot undo: missing link or previous labels');
    }

    link.labels = cloneLabels(this.previousLabels);
    link.markDirty('labels');
    link.emitter.emit('link:labels-changed', { labels: link.labels });
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getLink(this.linkId);
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram?.getLink(this.linkId) && !!this.previousLabels;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        labels: this.labels,
        previousLabels: this.previousLabels,
      },
    };
  }

  override getDescription(): string {
    return `Set ${this.labels.length} label(s) on link ${this.linkId}`;
  }
}
