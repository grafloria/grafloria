// Confinement — where a dragged member node may go.
//
// `GroupModel.constrainChildren` is documented as "clamp member drags to the
// inner extent", but nothing in the drag path ever asked: a member could be
// dragged straight out of a confining group (on the swimlanes demo, out of its
// lane and out of the pool) while it stayed a member. Hosts ask here, once:
//
//   - a member of a LANE is confined to its POOL's lane area — the union of the
//     sibling lanes — so it can still move from one lane to the next;
//   - a member of any other confining group is confined to that group's inner
//     extent;
//   - anything else is free (null).

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel, GroupRect } from '../models/GroupModel';

/** The group that directly holds `nodeId` as a member, if any. */
export function containingGroup(diagram: DiagramModel, nodeId: string): GroupModel | undefined {
  for (const group of diagram.getGroups()) {
    if (group.members.has(nodeId)) return group;
  }
  return undefined;
}

/** The pool a lane belongs to — through any lanes it is a sub-lane of. */
export function poolOfLane(diagram: DiagramModel, lane: GroupModel): GroupModel | undefined {
  if (lane.laneConfig?.role !== 'lane') return undefined;
  const seen = new Set<string>();
  for (let cur: GroupModel = lane; cur.parentGroupId && !seen.has(cur.id); ) {
    seen.add(cur.id);
    const parent = diagram.getGroup(cur.parentGroupId);
    if (parent?.laneConfig?.role === 'pool') return parent;
    if (parent?.laneConfig?.role !== 'lane') return undefined;
    cur = parent;
  }
  return undefined;
}

/** A lane split into SUB-LANES: it tiles lanes of its own (after its title strip) and holds no steps. */
export function hasSubLanes(lane: GroupModel): boolean {
  return lane.laneConfig?.role === 'lane' && (lane.laneConfig.laneOrder?.length ?? 0) > 0;
}

/** The bands a pool or a split lane tiles, in order. */
export function bandsOf(diagram: DiagramModel, container: GroupModel): GroupModel[] {
  return (container.laneConfig?.laneOrder ?? [])
    .map((id) => diagram.getGroup(id))
    .filter((g): g is GroupModel => !!g);
}

/**
 * A pool's LEAF lanes — the ones that hold steps — in band order, through any
 * sub-lanes. A folded lane is one band, whatever it holds.
 */
export function lanesOfPool(diagram: DiagramModel, pool: GroupModel): GroupModel[] {
  const out: GroupModel[] = [];
  const walk = (g: GroupModel, depth: number) => {
    for (const lane of bandsOf(diagram, g)) {
      if (hasSubLanes(lane) && !lane.isCollapsed && depth < 32) walk(lane, depth + 1);
      else out.push(lane);
    }
  };
  walk(pool, 0);
  return out;
}

/** The lane whose band contains `point`, or undefined outside every lane. */
export function laneAtPoint(
  diagram: DiagramModel,
  pool: GroupModel,
  point: { x: number; y: number }
): GroupModel | undefined {
  for (const lane of lanesOfPool(diagram, pool)) {
    const r = lane.getOuterBounds();
    if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) {
      return lane;
    }
  }
  return undefined;
}

/** True when `from` and `to` are two lanes of the same pool. */
export function areSiblingLanes(diagram: DiagramModel, from: GroupModel, to: GroupModel | undefined): boolean {
  if (!to || from === to) return false;
  const pool = poolOfLane(diagram, from);
  return !!pool && poolOfLane(diagram, to) === pool;
}

/**
 * The rectangle a dragged member must stay inside, or null when nothing
 * confines it. See the module note for the rule.
 */
export function memberConfinement(diagram: DiagramModel, nodeId: string): GroupRect | null {
  const group = containingGroup(diagram, nodeId);
  if (!group || group.constrainChildren !== true) return null;

  const pool = poolOfLane(diagram, group);
  if (pool) {
    const lanes = lanesOfPool(diagram, pool);
    if (lanes.length > 0) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const lane of lanes) {
        const r = lane.getInnerBounds();
        left = Math.min(left, r.x);
        top = Math.min(top, r.y);
        right = Math.max(right, r.x + r.width);
        bottom = Math.max(bottom, r.y + r.height);
      }
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
  }
  return group.getInnerBounds();
}

/**
 * The top-left that keeps a `width`×`height` box inside `rect` while moving it
 * as little as possible. A box larger than the rect pins to its top-left.
 */
export function clampBoxInto(
  rect: GroupRect,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const maxX = Math.max(rect.x, rect.x + rect.width - width);
  const maxY = Math.max(rect.y, rect.y + rect.height - height);
  return {
    x: Math.min(Math.max(x, rect.x), maxX),
    y: Math.min(Math.max(y, rect.y), maxY),
  };
}

/** One node let go at the end of a drag, and where the drag found it. */
export interface LaneDrop {
  id: string;
  from: { x: number; y: number };
}

/**
 * Where each dropped LANE member settles. It belongs to the lane under its
 * centre, so it moves fully inside that band. A lane that refuses it (full, or
 * its own validation says no) sends it back where the drag found it: it was
 * once left drawn inside the full lane while it still belonged to the old one.
 * Members dropped together count against a lane's room in order. Anything that
 * is not a lane member is left alone. Renderers call this BEFORE recording the
 * move, so undo replays the position the user saw.
 */
export function settleLaneDrop(diagram: DiagramModel, drops: LaneDrop[]): void {
  const joining = new Map<string, number>();
  for (const { id, from } of drops) {
    const node = diagram.getNode(id);
    if (!node || node.state?.locked) continue;
    const group = containingGroup(diagram, id);
    const pool = group ? poolOfLane(diagram, group) : undefined;
    if (!group || !pool) continue;
    const lane = laneAtPoint(diagram, pool, {
      x: node.position.x + node.size.width / 2,
      y: node.position.y + node.size.height / 2,
    });
    if (!lane) continue;
    if (lane !== group) {
      if (lane.isCollapsed) {
        node.setPosition(from.x, from.y); // a folded lane is a title band: it takes no drops
        continue;
      }
      const already = joining.get(lane.id) ?? 0;
      const full = lane.capacity !== undefined && lane.members.size + already >= lane.capacity;
      if (full || !lane.canAddMember(id, diagram)) {
        node.setPosition(from.x, from.y);
        continue;
      }
      joining.set(lane.id, already + 1);
    }
    const p = clampBoxInto(lane.getInnerBounds(), node.position.x, node.position.y, node.size.width, node.size.height);
    if (p.x !== node.position.x || p.y !== node.position.y) node.setPosition(p.x, p.y);
  }
}

/**
 * Everything a drag of `group` carries: every member NODE (recursively through
 * nested groups), every group FRAME (it and its descendants), and the
 * placeholder of every folded group among them — a folded lane's band, or a
 * collapsed group's box, used to stay behind when its container moved.
 * Cycle-guarded so a corrupt membership loop can never spin.
 */
export function groupDragContents(diagram: DiagramModel, group: GroupModel): { nodeIds: string[]; groupIds: string[] } {
  const nodeIds = new Set<string>();
  const groupIds = new Set<string>();
  const stack: GroupModel[] = [group];
  while (stack.length) {
    const g = stack.pop()!;
    if (groupIds.has(g.id)) continue;
    groupIds.add(g.id);
    const proxyId = g.collapsedState?.proxyNodeId;
    if (proxyId && diagram.getNode(proxyId)) nodeIds.add(proxyId);
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
