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

/** The pool a lane belongs to (its parent group with the pool role). */
export function poolOfLane(diagram: DiagramModel, lane: GroupModel): GroupModel | undefined {
  if (lane.laneConfig?.role !== 'lane' || !lane.parentGroupId) return undefined;
  const pool = diagram.getGroup(lane.parentGroupId);
  return pool?.laneConfig?.role === 'pool' ? pool : undefined;
}

/** A pool's lanes in band order. */
export function lanesOfPool(diagram: DiagramModel, pool: GroupModel): GroupModel[] {
  return (pool.laneConfig?.laneOrder ?? [])
    .map((id) => diagram.getGroup(id))
    .filter((g): g is GroupModel => !!g);
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
