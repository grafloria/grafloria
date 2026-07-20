// SetNodeStyleCommand — undoable edit of one or many nodes' style.
//
// The gap analysis recorded this as the hole it was: "of 35 commands the only style one
// is UpdateLinkStyleCommand; NO node style command — setStyle() is a raw write outside
// undo." Changing a node's fill is the most ordinary edit a diagram editor has, and it
// was the one edit Ctrl+Z could not take back.
//
// It takes MANY nodes on purpose. Restyling is almost always done to a selection, and a
// selection restyle has to be ONE undo entry — pressing Ctrl+Z five times to undo one
// gesture is a bug the user feels immediately. A batch of single-node commands would
// also work, but each node still needs its OWN snapshot, which is the part that is easy
// to get wrong (see the test that gives two nodes different prior styles).

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { NodeStyle } from '../../types';

export class SetNodeStyleCommand extends Command {
  private readonly nodeIds: string[];
  /** Per-node snapshot of the WHOLE style before execute(), keyed by node id. */
  private previousStyles?: Map<string, Partial<NodeStyle>>;

  constructor(
    nodeId: string | readonly string[],
    private readonly style: Partial<NodeStyle>
  ) {
    super('Set Node Style');
    this.nodeIds = typeof nodeId === 'string' ? [nodeId] : [...nodeId];
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');

    // Resolve EVERY target before mutating anything. A partial application is worse
    // than a refusal: the caller sees a thrown error but half the selection has already
    // changed, and the undo entry the manager discards would have been the only way
    // back. Resolve-then-write makes the failure atomic.
    const nodes = this.nodeIds.map((id) => {
      const n = diagram.getNode(id);
      if (!n) throw new Error(`Node ${id} not found`);
      return n;
    });

    // Snapshot on EVERY execute, not just the first: an execute → undo → redo → undo
    // round-trip must restore the state each undo actually followed.
    this.previousStyles = new Map(nodes.map((n) => [n.id, { ...n.style }]));

    for (const n of nodes) n.setStyle(this.style);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.previousStyles) {
      throw new Error('Cannot undo: missing diagram or previous style');
    }

    for (const [id, previous] of this.previousStyles) {
      const node = diagram.getNode(id);
      if (!node) continue; // deleted since; its removal owns its own undo entry
      // `replaceStyle`, never `setStyle` and never the field. setStyle MERGES, so it
      // cannot remove a key this command introduced; the field write skips
      // `trackChange()` and so never reaches a collab peer.
      node.replaceStyle(previous);
    }
  }

  override canExecute(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;
    return this.nodeIds.length > 0 && this.nodeIds.every((id) => !!diagram.getNode(id));
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram && !!this.previousStyles;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeIds: [...this.nodeIds],
        style: this.style,
        previousStyles: this.previousStyles
          ? Object.fromEntries(this.previousStyles)
          : undefined,
      },
    };
  }

  override getDescription(): string {
    return this.nodeIds.length === 1
      ? `Set style of node ${this.nodeIds[0]}`
      : `Set style of ${this.nodeIds.length} nodes`;
  }
}
