// UpdateLinkStyleCommand — undoable edit of a link's style
//
// Wave 4 (Edges & links). `LinkModel.updateStyle()` mutates the model directly
// and is NOT undoable — which was fine while link style was set once at
// construction, but Wave 4 turns style into live, user-facing state (self-loop
// size, parallel spacing, custom markers, a link template). Any of those set
// from a gesture must land on the undo stack as ONE entry, so they go through
// this command.

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { LinkStyle } from '../../types';

export class UpdateLinkStyleCommand extends Command {
  /** The WHOLE style object as it was before execute() — restored verbatim on undo. */
  private previousStyle?: Partial<LinkStyle>;

  constructor(
    private readonly linkId: string,
    private readonly style: Partial<LinkStyle>
  ) {
    super('Update Link Style');
  }

  override execute(context: CommandContext): void {
    const link = context.diagram?.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }

    // Snapshot BEFORE merging. Captured on every execute (not just the first),
    // so an execute → undo → redo → undo round-trip restores the right state.
    this.previousStyle = { ...link.style };

    link.updateStyle(this.style);
  }

  override undo(context: CommandContext): void {
    const link = context.diagram?.getLink(this.linkId);
    if (!link || !this.previousStyle) {
      throw new Error('Cannot undo: missing link or previous style');
    }

    // Assign the snapshot wholesale rather than merging: `updateStyle` cannot
    // REMOVE a key, so merging would leave behind any property this command
    // introduced.
    //
    // Through `replaceStyle`, NOT the field. This undo used to be
    // `link.style = restored; link.markDirty('style')`, and a direct field write does
    // not pass `trackChange()` — the one funnel collab captures from. Execute emitted
    // an op, undo emitted none, so the author saw the style revert and every other peer
    // kept it applied forever, with no later edit able to correct it.
    link.replaceStyle({ ...this.previousStyle });
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getLink(this.linkId);
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram?.getLink(this.linkId) && !!this.previousStyle;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        style: this.style,
        previousStyle: this.previousStyle,
      },
    };
  }

  override getDescription(): string {
    return `Update style of link ${this.linkId}`;
  }
}
