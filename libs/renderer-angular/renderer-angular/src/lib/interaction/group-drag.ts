import {
  MoveGroupCommand,
  poolOfLane,
  type DiagramModel,
  type GroupFrameMove,
  type GroupFrameSnapshot,
  type GroupModel,
  type GroupNodeMove,
} from '@grafloria/engine';

/**
 * The canvas's GROUP drag — the JS canvas's (`DomEventBinder`, `enableGroupDrag`),
 * step for step: a press on the EMPTY part of a group frame arms it, past the drag
 * threshold every member node (recursively through nested groups) and every frame
 * moves by the pointer delta, and the release commits the whole gesture as ONE
 * undoable `MoveGroupCommand`. A lane is a band of its pool: grabbing it moves the
 * whole pool.
 */
export class GroupDragController {
  private drag: {
    nodeIds: string[];
    groupIds: string[];
    startClientX: number;
    startClientY: number;
    lastWorldX: number;
    lastWorldY: number;
    committed: boolean;
    nodeFrom: Map<string, { x: number; y: number; z?: number }>;
    frameFrom: Map<string, GroupFrameSnapshot>;
  } | null = null;

  isActive(): boolean {
    return this.drag !== null;
  }

  /** The innermost group whose outer frame contains the point (deepest, then smallest). */
  findGroupAtPoint(diagram: DiagramModel, worldX: number, worldY: number): GroupModel | undefined {
    let best: GroupModel | undefined;
    let bestDepth = -Infinity;
    let bestArea = Infinity;
    for (const group of diagram.getGroups()) {
      if (group.isCollapsed) continue;
      const r = group.getOuterBounds();
      if (r.width <= 0 || r.height <= 0) continue;
      if (worldX < r.x || worldX > r.x + r.width || worldY < r.y || worldY > r.y + r.height) continue;
      const depth = diagram.getDepth(group.id);
      const area = r.width * r.height;
      if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
        best = group;
        bestDepth = depth;
        bestArea = area;
      }
    }
    return best;
  }

  /** Arm a drag of the group under the point (a lane arms its pool). False when there is none. */
  press(diagram: DiagramModel, worldX: number, worldY: number, clientX: number, clientY: number): boolean {
    const hit = this.findGroupAtPoint(diagram, worldX, worldY);
    if (!hit) return false;
    const group = poolOfLane(diagram, hit) ?? hit;
    const { nodeIds, groupIds } = collectGroupContents(diagram, group);
    const nodeFrom = new Map<string, { x: number; y: number; z?: number }>();
    for (const id of nodeIds) {
      const node = diagram.getNode(id);
      if (node && !node.state.locked) nodeFrom.set(id, { ...node.position });
    }
    const frameFrom = new Map<string, GroupFrameSnapshot>();
    for (const id of groupIds) {
      const g = diagram.getGroup(id);
      if (g) frameFrom.set(id, snapshotFrame(g));
    }
    this.drag = {
      nodeIds: [...nodeFrom.keys()],
      groupIds: [...frameFrom.keys()],
      startClientX: clientX,
      startClientY: clientY,
      lastWorldX: worldX,
      lastWorldY: worldY,
      committed: false,
      nodeFrom,
      frameFrom,
    };
    return true;
  }

  /** Translate the whole container live. Returns true when something moved. */
  move(diagram: DiagramModel, worldX: number, worldY: number, clientX: number, clientY: number, threshold: number): boolean {
    const drag = this.drag;
    if (!drag) return false;
    if (!drag.committed) {
      if (Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) < threshold) return false;
      drag.committed = true;
    }
    const dx = worldX - drag.lastWorldX;
    const dy = worldY - drag.lastWorldY;
    drag.lastWorldX = worldX;
    drag.lastWorldY = worldY;
    if (!dx && !dy) return false;
    for (const id of drag.nodeIds) {
      const node = diagram.getNode(id);
      if (!node || node.state.locked) continue;
      node.setPosition(node.position.x + dx, node.position.y + dy);
    }
    for (const id of drag.groupIds) {
      const g = diagram.getGroup(id);
      if (!g) continue;
      const r = g.getOuterBounds();
      g.setFrame({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
    }
    return true;
  }

  /**
   * End the gesture: the ONE undo step it makes (start snapshot → now), or null
   * when nothing moved. The state is already at `to`, so executing it only
   * records the history entry.
   */
  end(diagram: DiagramModel | null | undefined): MoveGroupCommand | null {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !drag.committed || !diagram) return null;
    const nodeMoves: GroupNodeMove[] = [];
    for (const [id, from] of drag.nodeFrom) {
      const node = diagram.getNode(id);
      if (node) nodeMoves.push({ nodeId: id, from, to: { ...node.position } });
    }
    const frameMoves: GroupFrameMove[] = [];
    for (const [id, from] of drag.frameFrom) {
      const g = diagram.getGroup(id);
      if (g) frameMoves.push({ groupId: id, from, to: snapshotFrame(g) });
    }
    const command = new MoveGroupCommand(nodeMoves, frameMoves);
    return command.isNoop() ? null : command;
  }

  cancel(): void {
    this.drag = null;
  }
}

function collectGroupContents(diagram: DiagramModel, group: GroupModel): { nodeIds: string[]; groupIds: string[] } {
  const nodeIds = new Set<string>();
  const groupIds = new Set<string>();
  const stack: GroupModel[] = [group];
  while (stack.length) {
    const g = stack.pop()!;
    if (groupIds.has(g.id)) continue;
    groupIds.add(g.id);
    for (const memberId of g.members) {
      if (diagram.getNode(memberId)) {
        nodeIds.add(memberId);
        continue;
      }
      const child = diagram.getGroup(memberId);
      if (child && !groupIds.has(child.id)) stack.push(child);
    }
  }
  return { nodeIds: [...nodeIds], groupIds: [...groupIds] };
}

function snapshotFrame(group: GroupModel): GroupFrameSnapshot {
  return {
    position: { x: group.position.x, y: group.position.y },
    size: group.size ? { ...group.size } : undefined,
    bounds: group.bounds ? { ...group.bounds } : undefined,
  };
}
