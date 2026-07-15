// MoveGroupCommand — move a group (subflow container) AND its contents as ONE
// undoable step (wave12/connect-ergonomics, gap 1: "move parent → children follow").
//
// The engine stores ABSOLUTE coordinates (the Wave-2 containment decision), so a
// group's member nodes do NOT track the group frame automatically — moving the
// container has to translate every member's world position explicitly. This
// command carries the whole subflow: the group frame(s) and every member node
// (recursively through nested groups), captured as an absolute FROM→TO snapshot.
//
// Why a snapshot and not a delta: the live drag translates everything for visual
// feedback BEFORE the gesture ends, so a delta-based execute() would double-apply
// on commit. Storing absolute from/to makes execute() idempotent — it sets the
// already-current `to`, records one history entry, and undo restores `from`.

import { Command, CommandContext, SerializedCommand } from '../Command';
import { Point } from '../../types';

/** A group frame's restorable geometry (matches GroupModel.restoreGeometry). */
export interface GroupFrameSnapshot {
  position: { x: number; y: number };
  size?: { width: number; height: number; depth: number };
  bounds?: { x: number; y: number; width: number; height: number };
}

/** One member node's absolute move. */
export interface GroupNodeMove {
  nodeId: string;
  from: Point;
  to: Point;
}

/** One (nested) group frame's move. */
export interface GroupFrameMove {
  groupId: string;
  from: GroupFrameSnapshot;
  to: GroupFrameSnapshot;
}

export class MoveGroupCommand extends Command {
  constructor(
    private readonly nodeMoves: GroupNodeMove[],
    private readonly frameMoves: GroupFrameMove[]
  ) {
    super('Move Group');
  }

  override execute(context: CommandContext): void {
    this.apply(context, 'to');
  }

  override undo(context: CommandContext): void {
    this.apply(context, 'from');
  }

  private apply(context: CommandContext, key: 'from' | 'to'): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    for (const move of this.nodeMoves) {
      const node = diagram.getNode(move.nodeId);
      if (!node) continue;
      const p = move[key];
      node.setPosition(p.x, p.y, p.z);
    }

    for (const move of this.frameMoves) {
      const group = diagram.getGroup(move.groupId);
      if (!group) continue;
      const snap = move[key];
      group.restoreGeometry({
        position: { ...snap.position },
        size: snap.size ? { ...snap.size } : undefined,
        bounds: snap.bounds ? { ...snap.bounds } : undefined,
      });
    }
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram;
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram;
  }

  /** True when the gesture actually moved something (drop == press is a no-op). */
  isNoop(): boolean {
    return this.nodeMoves.length === 0 && this.frameMoves.length === 0;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeMoves: this.nodeMoves, frameMoves: this.frameMoves },
    };
  }

  override getDescription(): string {
    return `Move group (${this.nodeMoves.length} nodes, ${this.frameMoves.length} frames)`;
  }
}
