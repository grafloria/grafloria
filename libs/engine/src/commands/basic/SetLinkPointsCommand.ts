// SetLinkPointsCommand - Replaces a link's routed points (wave4/interaction: vertex tools)

import { Command, CommandContext, SerializedCommand } from '../Command';
import { Point } from '../../types';

/**
 * Replace a link's `points` (its routed polyline, including any user waypoints),
 * undoable.
 *
 * Waypoint editing — add / move / remove a vertex — used to mutate
 * `link.points` directly through {@link WaypointEditor}, which meant NONE of it
 * was undoable: Ctrl+Z after dragging a vertex did nothing (or, worse, rewound
 * some unrelated earlier command). Every vertex gesture now commits exactly one
 * of these at pointer-up.
 *
 * `hasManualWaypoints` is part of the state being changed: the renderer only
 * preserves interior points when that metadata flag is set, so undoing back to a
 * 2-point route must also clear it or the old vertices would be resurrected on
 * the next re-route.
 */
export class SetLinkPointsCommand extends Command {
  private readonly newPoints: Point[];
  private oldPoints?: Point[];
  private oldManual?: boolean;

  constructor(
    private linkId: string,
    newPoints: Point[],
    oldPoints?: Point[]
  ) {
    super('Edit Link Path');
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

    const link = diagram.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }

    if (!this.oldPoints) {
      this.oldPoints = link.points.map((p: Point) => ({ ...p }));
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
