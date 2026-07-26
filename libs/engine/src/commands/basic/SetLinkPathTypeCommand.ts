// SetLinkPathTypeCommand — undoable edit of a link's ROUTE (visio-panel: the
// properties panel's "Route: smooth | orthogonal" selector).
//
// `link.setPathType()` is a raw model write outside undo — the same hole
// SetNodeStyleCommand closed for node style and UpdateLinkStyleCommand closed
// for link style. A route change from the panel must be ONE undo entry.
//
// setPathType() also CLEARS the cached polyline and drops the manual-waypoints
// flag (the old route belongs to the old algorithm), so a plain "set it back"
// undo would silently throw away waypoints the user placed by hand. The
// snapshot therefore carries the points and the flag, and undo restores them
// when — and only when — they were manual (an auto-routed polyline is
// recomputed on the next paint anyway, so restoring it would just pin a stale
// route).

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { Point } from '../../types';

export type LinkPathType = 'direct' | 'orthogonal' | 'smooth' | 'bezier';

interface PathTypeSnapshot {
  pathType: LinkPathType;
  points: Point[];
  hasManualWaypoints: boolean;
}

export class SetLinkPathTypeCommand extends Command {
  private previous?: PathTypeSnapshot;

  constructor(
    private readonly linkId: string,
    private readonly pathType: LinkPathType
  ) {
    super('Set Link Route');
  }

  override execute(context: CommandContext): void {
    const link = context.diagram?.getLink(this.linkId);
    if (!link) throw new Error(`Link ${this.linkId} not found`);

    // Snapshot on EVERY execute (not just the first): an execute → undo →
    // redo → undo round-trip must restore the state each undo actually followed.
    this.previous = {
      pathType: link.pathType,
      points: link.points.map((p: Point) => ({ ...p })),
      hasManualWaypoints: link.getMetadata('hasManualWaypoints') === true,
    };

    link.setPathType(this.pathType);
  }

  override undo(context: CommandContext): void {
    const link = context.diagram?.getLink(this.linkId);
    if (!link || !this.previous) {
      throw new Error('Cannot undo: missing link or previous path type');
    }

    link.setPathType(this.previous.pathType);
    // setPathType wiped the cache; put back the hand-placed geometry it owned.
    if (this.previous.hasManualWaypoints && this.previous.points.length > 0) {
      link.setPoints(this.previous.points.map((p) => ({ ...p })));
      link.setMetadata('hasManualWaypoints', true);
    }
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getLink(this.linkId);
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram?.getLink(this.linkId) && !!this.previous;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        pathType: this.pathType,
        previous: this.previous,
      },
    };
  }

  override getDescription(): string {
    return `Set route of link ${this.linkId} to ${this.pathType}`;
  }
}
