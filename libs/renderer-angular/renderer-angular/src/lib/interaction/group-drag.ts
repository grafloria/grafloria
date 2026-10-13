import {
  MoveGroupCommand,
  poolOfLane,
  groupDragContents,
  PROXY_NODE_GROUP_KEY,
  LaneGesture,
  laneHandleAt,
  laneHandleCursor,
  type Command,
  type NodeModel,
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

  /** A hand on a pool's lane border, far edge or lane title (engine LaneGesture). */
  private lane: { gesture: LaneGesture; startClientX: number; startClientY: number; committed: boolean } | null = null;

  isActive(): boolean {
    return this.drag !== null || this.lane !== null;
  }

  /** The cursor a pool's lane handle under the point shows, or null (the hover cursor). */
  cursorAt(diagram: DiagramModel, worldX: number, worldY: number, tolerance: number): string | null {
    const handle = laneHandleAt(diagram, worldX, worldY, tolerance);
    return handle ? laneHandleCursor(handle) : null;
  }

  /** The cursor while a gesture is held. */
  activeCursor(): string {
    if (!this.lane) return 'move';
    return this.lane.gesture.handle.kind === 'title' ? 'grabbing' : laneHandleCursor(this.lane.gesture.handle);
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
  press(diagram: DiagramModel, worldX: number, worldY: number, clientX: number, clientY: number, tolerance = 5): boolean {
    // A pool's own handles first: a lane border sizes that lane, the far edge
    // lengthens every lane, a lane's title band carries the lane to another slot.
    const handle = laneHandleAt(diagram, worldX, worldY, tolerance);
    if (handle) {
      this.lane = { gesture: new LaneGesture(diagram, handle, worldX, worldY), startClientX: clientX, startClientY: clientY, committed: false };
      return true;
    }
    const hit = this.findGroupAtPoint(diagram, worldX, worldY);
    if (!hit) return false;
    return this.arm(diagram, poolOfLane(diagram, hit) ?? hit, worldX, worldY, clientX, clientY);
  }

  /**
   * A press on a FOLDED group's placeholder: the placeholder stands for the group,
   * so the group moves (a folded lane's band moves its whole pool), never the
   * placeholder alone. False when the node is not a placeholder.
   */
  pressFolded(diagram: DiagramModel, node: NodeModel, worldX: number, worldY: number, clientX: number, clientY: number): boolean {
    if (!diagram.isProxyNode(node)) return false;
    const folded = diagram.getGroup(String(node.getMetadata(PROXY_NODE_GROUP_KEY)));
    if (!folded) return false;
    return this.arm(diagram, poolOfLane(diagram, folded) ?? folded, worldX, worldY, clientX, clientY);
  }

  private arm(diagram: DiagramModel, group: GroupModel, worldX: number, worldY: number, clientX: number, clientY: number): boolean {
    const { nodeIds, groupIds } = groupDragContents(diagram, group);
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
    const lane = this.lane;
    if (lane) {
      if (!lane.committed) {
        if (Math.hypot(clientX - lane.startClientX, clientY - lane.startClientY) < threshold) return false;
        lane.committed = true;
      }
      return lane.gesture.move(worldX, worldY);
    }
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
  end(diagram: DiagramModel | null | undefined): Command | null {
    const lane = this.lane;
    if (lane) {
      this.lane = null;
      return lane.committed ? lane.gesture.end() : null;
    }
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

  /** Abandon the gesture. A lane gesture puts the pool back; a frame drag stays where it is (as the JS canvas). */
  cancel(): void {
    this.lane?.gesture.cancel();
    this.lane = null;
    this.drag = null;
  }
}

function snapshotFrame(group: GroupModel): GroupFrameSnapshot {
  return {
    position: { x: group.position.x, y: group.position.y },
    size: group.size ? { ...group.size } : undefined,
    bounds: group.bounds ? { ...group.bounds } : undefined,
  };
}
