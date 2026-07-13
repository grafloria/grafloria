// CutCommand - Copy the selection to the clipboard, then delete it (wave3/interaction)

import { CommandContext } from '../Command';
import { MacroCommand } from '../composite/MacroCommand';
import { CopyCommand } from './CopyCommand';
import { DeleteSelectionCommand } from './DeleteSelectionCommand';
import type { ClipboardManager } from '../../clipboard/ClipboardManager';

export interface CutCommandOptions {
  /** Include groups containing selected nodes in the clipboard payload (default: false) */
  includeGroups?: boolean;
  /** Include links between copied nodes in the clipboard payload (default: true) */
  includeLinks?: boolean;
  /** Delete child nodes recursively (default: true) */
  deleteChildren?: boolean;
  /** Delete links connected to the deleted nodes (default: true) */
  deleteLinks?: boolean;
}

/**
 * CutCommand = {@link CopyCommand} + {@link DeleteSelectionCommand}, executed as
 * ONE undoable step (a {@link MacroCommand}): the selection lands on the
 * clipboard and is removed from the diagram, and a single undo brings it back.
 *
 * Two inherited behaviours had to be overridden — both are load-bearing:
 *
 *  1. `canUndo`. {@link MacroCommand.canUndo} is the AND of its steps, and
 *     {@link CopyCommand.canUndo} returns FALSE by design (a copy mutates
 *     nothing, so it has nothing to undo). The inherited implementation would
 *     therefore report a Cut as un-undoable and `CommandManager.undo()` would
 *     throw `Cannot undo command: Cut`. A cut is undoable exactly when its
 *     delete half is.
 *
 *  2. `redo`. The default redo re-runs `execute()`, which re-runs the COPY step
 *     — and copy reads the CURRENT selection. `undo()` restores the entities but
 *     NOT the selection, so that copy would throw `No nodes selected`. The
 *     clipboard already holds this cut's payload, so a redo is precisely
 *     "delete those same entities again", which the delete half can replay from
 *     its own recorded data.
 */
export class CutCommand extends MacroCommand {
  private readonly copyCommand: CopyCommand;
  private readonly deleteCommand: DeleteSelectionCommand;

  constructor(clipboard: ClipboardManager, options: CutCommandOptions = {}) {
    super('Cut');

    this.copyCommand = new CopyCommand(clipboard, {
      includeGroups: options.includeGroups,
      includeLinks: options.includeLinks,
    });
    this.deleteCommand = new DeleteSelectionCommand({
      deleteChildren: options.deleteChildren,
      deleteLinks: options.deleteLinks,
    });

    // Order matters: copy the payload BEFORE the delete tears the entities out
    // of the diagram (CopyCommand serializes live models, not ids).
    this.addStep(this.copyCommand);
    this.addStep(this.deleteCommand);
  }

  /**
   * A cut needs something to copy: CopyCommand has no link-only payload, so a
   * selection of links alone cannot be cut (it can still be deleted).
   */
  override canExecute(context: CommandContext): boolean {
    return super.canExecute(context);
  }

  /** See class docs (1): copy is non-undoable by design; the delete half decides. */
  override canUndo(context: CommandContext): boolean {
    return this.deleteCommand.canUndo(context);
  }

  /** See class docs (2): replay the delete from its recorded data, never the copy. */
  override async redo(context: CommandContext): Promise<void> {
    await this.deleteCommand.redo(context);
  }

  override getDescription(): string {
    return this.deleteCommand.getDescription().replace(/^Delete/, 'Cut');
  }
}
