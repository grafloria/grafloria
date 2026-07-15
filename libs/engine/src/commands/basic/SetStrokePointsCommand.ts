// SetStrokePointsCommand - Replaces a stroke's geometry (wave13/stroke-edit)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { StrokePoint } from '../../models/StrokeModel';

/**
 * Replace an ink stroke's point list, undoable. The stroke-edit tool's commit:
 * a drag that translates a stroke ends in exactly ONE of these at pointer-up.
 *
 * Mirrors {@link SetLinkPointsCommand}, minus the `hasManualWaypoints` bookkeeping
 * — a stroke's points are ALWAYS authored content (nothing re-routes them), so
 * there is no derived/manual flag to keep in step.
 *
 * COLLAB: execute()/undo() each call `setPoints` exactly ONCE, and `points` on a
 * stroke is a per-property register (wave11 scoped the capture's DERIVED set per
 * target precisely so stroke geometry reaches peers). One gesture therefore puts
 * ONE op on the wire — never per-pointermove spam, never a class instance.
 *
 * The FROM snapshot is taken from the model on first execute() when the caller
 * did not supply one — but the stroke-edit tool DOES supply it (the gesture-start
 * geometry), because by commit time a live-feedback path may already have the
 * model sitting at TO, and a FROM read then would make undo a no-op.
 */
export class SetStrokePointsCommand extends Command {
  private readonly newPoints: StrokePoint[];
  private oldPoints?: StrokePoint[];

  constructor(
    private strokeId: string,
    newPoints: readonly StrokePoint[],
    oldPoints?: readonly StrokePoint[]
  ) {
    super('Edit Stroke');
    this.newPoints = newPoints.map((p) => ({ ...p }));
    if (oldPoints) {
      this.oldPoints = oldPoints.map((p) => ({ ...p }));
    }
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const stroke = diagram.getStroke(this.strokeId);
    if (!stroke) {
      throw new Error(`Stroke ${this.strokeId} not found`);
    }

    if (!this.oldPoints) {
      this.oldPoints = stroke.getPoints().map((p: StrokePoint) => ({ ...p }));
    }

    // ONE setPoints — one change event, one epoch bump, one op for capture.
    stroke.setPoints(this.newPoints.map((p) => ({ ...p })));
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.oldPoints) {
      throw new Error('Cannot undo: missing diagram or old points');
    }

    const stroke = diagram.getStroke(this.strokeId);
    if (!stroke) {
      throw new Error(`Stroke ${this.strokeId} not found`);
    }

    stroke.setPoints(this.oldPoints.map((p) => ({ ...p })));
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram && context.diagram.getStroke(this.strokeId) !== undefined;
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram && !!this.oldPoints;
  }

  /** One edit gesture = one undo step; never merge two of them. */
  override canMergeWith(): boolean {
    return false;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        strokeId: this.strokeId,
        oldPoints: this.oldPoints,
        newPoints: this.newPoints,
      },
    };
  }

  override getDescription(): string {
    return `Edit stroke (${this.newPoints.length} points)`;
  }
}
