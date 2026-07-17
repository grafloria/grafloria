/**
 * Stroke lifecycle as COMMANDS — add (draw) and remove (erase).
 *
 * The whiteboard's edit tool always committed through the stack
 * (SetStrokePointsCommand), but DRAW and ERASE wrote straight into the model:
 * a visitor draws ink, presses ⌘Z as the demo instructs, and nothing happens
 * (live audit: `engine.canUndo() === false` after a real draw; an eraser sweep
 * could not be undone either). One gesture = one command = one undo step, the
 * same contract every other gesture keeps.
 */

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { StrokeModel } from '../../models/StrokeModel';

export class AddStrokeCommand extends Command {
  private added = false;

  constructor(private readonly stroke: StrokeModel) {
    super('Draw Stroke');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');
    diagram.addStroke(this.stroke);
    this.added = true;
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.added) throw new Error('Cannot undo: stroke was not added');
    diagram.removeStroke(this.stroke.id);
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram && this.stroke.pointCount > 0;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { strokeId: this.stroke.id },
    };
  }
}

/** One eraser SWEEP — however many strokes it crossed — is ONE undo step. */
export class RemoveStrokesCommand extends Command {
  private removed: StrokeModel[] = [];

  constructor(private readonly strokeIds: readonly string[]) {
    super('Erase Strokes');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');
    this.removed = [];
    for (const id of this.strokeIds) {
      const stroke = diagram.getStroke(id);
      if (stroke) {
        this.removed.push(stroke);
        diagram.removeStroke(id);
      }
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');
    for (const stroke of this.removed) {
      diagram.addStroke(stroke);
    }
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram && this.strokeIds.length > 0;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { strokeIds: [...this.strokeIds] },
    };
  }
}
