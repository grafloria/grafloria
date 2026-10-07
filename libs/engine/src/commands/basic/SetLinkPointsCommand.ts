import { Command, CommandContext, SerializedCommand } from '../Command';
import { Point } from '../../types';

/**
 * Replace a link's `points` (its routed polyline, including any user waypoints),
 * undoable. Each bend gesture on the canvas (insert, move, remove) commits one
 * of these when the pointer is released.
 *
 * The `hasManualWaypoints` metadata flag is part of the state being changed:
 * the renderer keeps a link's interior points only while that flag is set, so
 * execute sets it when the new path has bends and undo restores the value it
 * had before. Without the old value, undoing a bend drag would clear the flag
 * and the next re-route would drop the bend itself.
 *
 * @param linkId - The link to edit.
 * @param newPoints - The path to apply.
 * @param oldPoints - The path to restore on undo. Pass it when the link has
 *   already been changed live (during a drag); omitted, the link's points at
 *   the first execute are used.
 * @param oldManual - The `hasManualWaypoints` flag to restore on undo. Pass it
 *   with `oldPoints` when the flag has also been changed live; omitted, the
 *   link's flag at the first execute is used.
 */
export class SetLinkPointsCommand extends Command {
  private readonly newPoints: Point[];
  private oldPoints?: Point[];
  private oldManual?: boolean;

  constructor(
    private linkId: string,
    newPoints: Point[],
    oldPoints?: Point[],
    oldManual?: boolean
  ) {
    super('Edit Link Path');
    this.newPoints = newPoints.map((p) => ({ ...p }));
    if (oldPoints) {
      this.oldPoints = oldPoints.map((p) => ({ ...p }));
    }
    this.oldManual = oldManual;
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const link = diagram.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }

    if (!this.oldPoints) {
      this.oldPoints = link.points.map((p: Point) => ({ ...p }));
    }
    if (this.oldManual === undefined) {
      this.oldManual = link.getMetadata('hasManualWaypoints') === true;
    }

    link.setPoints(this.newPoints.map((p) => ({ ...p })));
    link.setMetadata('hasManualWaypoints', this.newPoints.length > 2);
    link.markDirty('link-points-changed');
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.oldPoints) {
      throw new Error('Cannot undo: missing diagram or old points');
    }

    const link = diagram.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }

    link.setPoints(this.oldPoints.map((p) => ({ ...p })));
    link.setMetadata('hasManualWaypoints', this.oldManual === true);
    link.markDirty('link-points-changed');
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.links.has(this.linkId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && !!this.oldPoints;
  }

  /** One vertex gesture = one undo step; never merge two of them. */
  override canMergeWith(): boolean {
    return false;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        oldPoints: this.oldPoints,
        newPoints: this.newPoints,
      },
    };
  }

  override getDescription(): string {
    return `Edit link path (${this.newPoints.length} points)`;
  }
}
