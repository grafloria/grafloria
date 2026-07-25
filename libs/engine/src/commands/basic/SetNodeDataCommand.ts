// SetNodeDataCommand — undoable edit of a node's SHAPE DATA (`node.data`).
//
// T9/visio. Shape data is the field a Visio user actually edits: a master ships a
// `dataSchema` (all 80 generated masters do), a property sheet renders it, and the
// values live on `node.data`. But `setData()` is a raw per-key write outside undo —
// the same hole `SetNodeStyleCommand` closed for style. Typing in a property sheet
// and being unable to Ctrl+Z it is the bug a user hits within a minute.
//
// Per-KEY, not wholesale: `node.data` syncs as per-key LWW registers over collab, so
// writing only the keys that changed keeps two people editing DIFFERENT fields of the
// same shape from clobbering each other. Undo restores exactly the keys this command
// touched (including deleting keys that did not exist before).

import { Command, CommandContext, SerializedCommand } from '../Command';

/** The sentinel for "this key did not exist before" — distinct from a stored undefined. */
const ABSENT = Symbol('absent');

export class SetNodeDataCommand extends Command {
  private readonly nodeIds: string[];
  /** Per-node snapshot of ONLY the touched keys, keyed by node id. */
  private previous?: Map<string, Map<string, unknown | typeof ABSENT>>;

  constructor(
    nodeId: string | readonly string[],
    private readonly data: Readonly<Record<string, unknown>>
  ) {
    super('Set Shape Data');
    this.nodeIds = typeof nodeId === 'string' ? [nodeId] : [...nodeId];
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');

    // Resolve every target before mutating: a partial application would leave the
    // selection half-edited with no undo entry to come back through.
    const nodes = this.nodeIds.map((id) => {
      const n = diagram.getNode(id);
      if (!n) throw new Error(`Node ${id} not found`);
      return n;
    });

    // Snapshot on EVERY execute so execute → undo → redo → undo restores the state
    // each undo actually followed.
    this.previous = new Map(
      nodes.map((n) => {
        const before = new Map<string, unknown | typeof ABSENT>();
        for (const key of Object.keys(this.data)) {
          const has = n.data && Object.prototype.hasOwnProperty.call(n.data, key);
          before.set(key, has ? n.getData(key) : ABSENT);
        }
        return [n.id, before] as const;
      })
    );

    for (const n of nodes) {
      for (const [key, value] of Object.entries(this.data)) n.setData(key, value);
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.previous) throw new Error('Cannot undo: missing diagram or snapshot');

    for (const [id, before] of this.previous) {
      const node = diagram.getNode(id);
      if (!node) continue; // deleted since; its removal owns its own undo entry
      for (const [key, value] of before) {
        if (value === ABSENT) {
          // The key did not exist before this command invented it — remove it rather
          // than leaving an `undefined` that serializes and syncs as a real value.
          if (node.data) delete (node.data as Record<string, unknown>)[key];
        } else {
          node.setData(key, value);
        }
      }
    }
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram && this.nodeIds.length > 0 && Object.keys(this.data).length > 0;
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram && !!this.previous;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeIds: this.nodeIds, data: this.data },
    };
  }

  override getDescription(): string {
    const keys = Object.keys(this.data);
    return `Set ${keys.length === 1 ? keys[0] : `${keys.length} fields`} on ${this.nodeIds.length} node(s)`;
  }
}
