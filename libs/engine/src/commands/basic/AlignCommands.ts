// Align & Distribute — Visio/Figma-style multi-node arrangement, as ONE undoable
// step each. Pure bounding-box geometry (the engine is the lower layer and can't
// reach the renderer's live-drag SnapController — and it shouldn't: this is a
// discrete operation, not a per-frame snap).

import { Command, CommandContext, SerializedCommand } from '../Command';
import { NodeModel } from '../../models/NodeModel';

export type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y';
export type DistributeAxis = 'horizontal' | 'vertical';

interface XY { x: number; y: number; }

/** Shared machinery: snapshot every node's start position, move to computed
 *  targets on execute, restore the snapshot on undo. */
abstract class MultiNodeArrangeCommand extends Command {
  private readonly before = new Map<string, XY>();

  protected constructor(name: string, protected readonly nodeIds: string[]) {
    super(name);
  }

  /** Return the target position for each node that should move (id → {x,y}). */
  protected abstract targets(nodes: NodeModel[]): Map<string, XY>;

  /** Minimum node count for the op to mean anything (align: 2, distribute: 3). */
  protected minNodes(): number { return 2; }

  private liveNodes(context: CommandContext): NodeModel[] {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');
    return this.nodeIds
      .map((id) => diagram.getNode(id))
      .filter((n): n is NodeModel => !!n && !n.state.locked);
  }

  override execute(context: CommandContext): void {
    const nodes = this.liveNodes(context);
    if (this.before.size === 0) {
      for (const n of nodes) this.before.set(n.id, { x: n.position.x, y: n.position.y });
    }
    const targets = this.targets(nodes);
    for (const n of nodes) {
      const t = targets.get(n.id);
      if (t) n.setPosition(t.x, t.y);
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');
    for (const [id, p] of this.before) {
      const n = diagram.getNode(id);
      if (n) n.setPosition(p.x, p.y);
    }
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram && this.nodeIds.length >= this.minNodes();
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram && this.before.size > 0;
  }

  override serialize(): SerializedCommand {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { nodeIds: this.nodeIds } };
  }
}

/** Align the selected nodes to a shared edge or centre line. */
export class AlignCommand extends MultiNodeArrangeCommand {
  constructor(nodeIds: string[], private readonly edge: AlignEdge) {
    super(`Align ${edge}`, nodeIds);
  }

  protected override targets(nodes: NodeModel[]): Map<string, XY> {
    const map = new Map<string, XY>();
    if (nodes.length < 2) return map;
    const b = nodes.map((n) => ({
      id: n.id, x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height,
    }));
    const minL = Math.min(...b.map((n) => n.x));
    const maxR = Math.max(...b.map((n) => n.x + n.w));
    const minT = Math.min(...b.map((n) => n.y));
    const maxB = Math.max(...b.map((n) => n.y + n.h));

    for (const n of b) {
      switch (this.edge) {
        case 'left':     map.set(n.id, { x: minL, y: n.y }); break;
        case 'right':    map.set(n.id, { x: maxR - n.w, y: n.y }); break;
        case 'top':      map.set(n.id, { x: n.x, y: minT }); break;
        case 'bottom':   map.set(n.id, { x: n.x, y: maxB - n.h }); break;
        case 'center-x': map.set(n.id, { x: (minL + maxR) / 2 - n.w / 2, y: n.y }); break;
        case 'center-y': map.set(n.id, { x: n.x, y: (minT + maxB) / 2 - n.h / 2 }); break;
      }
    }
    return map;
  }

  override getDescription(): string { return `Align ${this.edge} (${this.nodeIds.length} nodes)`; }
}

/** Space the selected nodes with EQUAL GAPS along an axis; the two extreme
 *  nodes stay put and the interior ones are redistributed between them. */
export class DistributeCommand extends MultiNodeArrangeCommand {
  constructor(nodeIds: string[], private readonly axis: DistributeAxis) {
    super(`Distribute ${axis}`, nodeIds);
  }

  protected override minNodes(): number { return 3; }

  protected override targets(nodes: NodeModel[]): Map<string, XY> {
    const map = new Map<string, XY>();
    if (nodes.length < 3) return map;
    const horiz = this.axis === 'horizontal';
    const b = nodes.map((n) => ({
      id: n.id, x: n.position.x, y: n.position.y,
      pos: horiz ? n.position.x : n.position.y,
      size: horiz ? n.size.width : n.size.height,
    })).sort((p, q) => p.pos - q.pos);

    const first = b[0];
    const last = b[b.length - 1];
    const span = (last.pos + last.size) - first.pos;           // outer edge to outer edge
    const totalSize = b.reduce((s, n) => s + n.size, 0);
    const gap = (span - totalSize) / (b.length - 1);           // equal gap between neighbours

    let cursor = first.pos + first.size + gap;                 // first & last are anchors
    for (let i = 1; i < b.length - 1; i++) {
      const n = b[i];
      map.set(n.id, horiz ? { x: cursor, y: n.y } : { x: n.x, y: cursor });
      cursor += n.size + gap;
    }
    return map;
  }

  override getDescription(): string { return `Distribute ${this.axis} (${this.nodeIds.length} nodes)`; }
}
