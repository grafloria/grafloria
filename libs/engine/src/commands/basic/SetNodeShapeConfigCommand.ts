// SetNodeShapeConfigCommand — undoable edit of `metadata.shape` keys.
//
// visio-panel. A node's paints live in TWO dialects: the typed `node.style`
// (SetNodeStyleCommand's territory, wins the cascade) and the legacy
// `metadata.shape` config a stamped master carries. For paints the style wins,
// so the panel writes style and is done — but `cornerRadius` is NOT a paint:
// the renderer emits it as rect GEOMETRY (rx/ry), and a geometry rx DEFERS over
// the style-borne `borderRadius` (shape-registry `bodyDeferGeomKeys`). On the
// 12 masters that ship `shape.cornerRadius` (the BPMN task family), a
// style-only write would change nothing on screen — the panel must edit the
// key that actually paints, undoably. This is that command.
//
// The whole `shape` object is ONE metadata key (one LWW register over collab),
// so the snapshot is the whole object — per-key undo would be finer than the
// sync granularity and could resurrect keys a peer deleted.

import { Command, CommandContext, SerializedCommand } from '../Command';

export class SetNodeShapeConfigCommand extends Command {
  /** The whole `metadata.shape` object before execute() — undefined = key absent. */
  private previous?: { shape: Record<string, unknown> | undefined };

  constructor(
    private readonly nodeId: string,
    private readonly patch: Readonly<Record<string, unknown>>
  ) {
    super('Set Node Shape Config');
  }

  override execute(context: CommandContext): void {
    const node = context.diagram?.getNode(this.nodeId);
    if (!node) throw new Error(`Node ${this.nodeId} not found`);

    // Snapshot on EVERY execute — execute → undo → redo → undo must restore the
    // state each undo actually followed.
    const current = node.getMetadata('shape') as Record<string, unknown> | undefined;
    this.previous = { shape: current ? { ...current } : undefined };

    node.setMetadata('shape', { ...(current ?? {}), ...this.patch });
  }

  override undo(context: CommandContext): void {
    const node = context.diagram?.getNode(this.nodeId);
    if (!node || !this.previous) {
      throw new Error('Cannot undo: missing node or previous shape config');
    }
    // Restore verbatim through setMetadata — the one funnel trackChange (and so
    // collab) captures. A shape that did not exist goes back to undefined, which
    // the renderer treats as the plain-rect default it always had.
    node.setMetadata('shape', this.previous.shape ? { ...this.previous.shape } : undefined);
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getNode(this.nodeId) && Object.keys(this.patch).length > 0;
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram?.getNode(this.nodeId) && !!this.previous;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, patch: this.patch, previous: this.previous },
    };
  }

  override getDescription(): string {
    return `Set shape config of node ${this.nodeId}`;
  }
}
