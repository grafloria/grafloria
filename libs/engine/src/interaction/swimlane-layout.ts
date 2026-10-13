// SWIMLANE LAYOUT — a pool laid out as one unit.
//
// A swimlane flow reads along its lanes: each step's place along the lane is its
// order in the flow, and its lane is who does it. So the layout keeps every step
// in the lane it belongs to and only decides WHERE ALONG the lanes it goes:
//
//   1. rank the pool's steps by their links (longest path; a loop is cut where a
//      depth-first walk meets it, so it never hangs);
//   2. one column per rank, shared by every lane, as wide as its widest step;
//   3. steps that share a lane and a rank stack across the lane, and a lane that
//      is too narrow for its tallest stack grows (none shrinks);
//   4. the pool's length fits its columns, and its lanes stay tiled in order.
//
// Folded lanes keep their band and their hidden steps. Links to anything outside
// the pool do not rank its steps.

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel } from '../models/GroupModel';
import type { NodeModel } from '../models/NodeModel';
import { SwimlaneService, MIN_LANE_SIZE } from './SwimlaneService';
import { LANE_TITLE_SIZE, MIN_POOL_SPAN } from './lane-gestures';

export interface PoolLayoutOptions {
  /** Gap between rank columns, along the lanes. Default 60. */
  rankSpacing?: number;
  /** Gap between steps stacked in one lane at one rank. Default 16. */
  nodeSpacing?: number;
  /** Space around a lane's steps. Default 24. */
  padding?: number;
}

/** Lay `pool` out (see the module note). Returns each moved step's new top-left. */
export function layoutPool(
  diagram: DiagramModel,
  pool: GroupModel,
  options: PoolLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const rankGap = options.rankSpacing ?? 60;
  const stackGap = options.nodeSpacing ?? 16;
  const pad = options.padding ?? 24;
  const positions = new Map<string, { x: number; y: number }>();
  const cfg = pool.laneConfig;
  if (cfg?.role !== 'pool') return positions;
  const horizontal = cfg.orientation === 'horizontal';
  const lanes = (cfg.laneOrder ?? []).map((id) => diagram.getGroup(id)).filter((g): g is GroupModel => !!g);
  if (lanes.length === 0) return positions;

  const main = (n: NodeModel) => (horizontal ? n.size.width : n.size.height);
  const cross = (n: NodeModel) => (horizontal ? n.size.height : n.size.width);
  const crossAt = (n: NodeModel) => (horizontal ? n.position.y : n.position.x);
  const mainAt = (n: NodeModel) => (horizontal ? n.position.x : n.position.y);
  const laneCross = (l: GroupModel) => (horizontal ? l.getOuterBounds().height : l.getOuterBounds().width);
  const titleOf = (l: GroupModel) => (l.headerHeight > 0 ? l.headerHeight : LANE_TITLE_SIZE);

  // The steps: visible members of every unfolded lane, in a stable reading order.
  const laneOf = new Map<string, number>();
  const steps: NodeModel[] = [];
  lanes.forEach((lane, i) => {
    if (lane.isCollapsed) return;
    for (const id of lane.members) {
      const n = diagram.getNode(id);
      if (!n || n.state.visible === false) continue;
      laneOf.set(id, i);
      steps.push(n);
    }
  });
  if (steps.length === 0) return positions;
  steps.sort((a, b) => laneOf.get(a.id)! - laneOf.get(b.id)! || mainAt(a) - mainAt(b) || crossAt(a) - crossAt(b) || (a.id < b.id ? -1 : 1));

  // 1. Ranks: longest path over the links between steps, loops cut by a DFS.
  const ends = (portOrNode: string | undefined, nodeId: string | undefined) => nodeId ?? (portOrNode ? diagram.getNodeByPortId(portOrNode)?.id : undefined);
  const out = new Map<string, string[]>(steps.map((n) => [n.id, []]));
  for (const link of diagram.getLinks()) {
    const a = ends(link.sourcePortId, link.sourceNodeId);
    const b = ends(link.targetPortId, link.targetNodeId);
    if (a && b && a !== b && out.has(a) && out.has(b)) out.get(a)!.push(b);
  }
  const state = new Map<string, 1 | 2>(); // 1 = on the walk, 2 = done
  const forward = new Map<string, string[]>(steps.map((n) => [n.id, []]));
  const walk = (id: string) => {
    state.set(id, 1);
    for (const next of out.get(id)!) {
      if (state.get(next) === 1) continue; // a link back into the walk: the loop is cut here
      forward.get(id)!.push(next);
      if (!state.has(next)) walk(next);
    }
    state.set(id, 2);
  };
  for (const n of steps) if (!state.has(n.id)) walk(n.id);
  const rank = new Map<string, number>();
  const indegree = new Map<string, number>(steps.map((n) => [n.id, 0]));
  for (const targets of forward.values()) for (const t of targets) indegree.set(t, indegree.get(t)! + 1);
  const queue = steps.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (const id of queue) rank.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of forward.get(id)!) {
      rank.set(t, Math.max(rank.get(t) ?? 0, rank.get(id)! + 1));
      indegree.set(t, indegree.get(t)! - 1);
      if (indegree.get(t) === 0) queue.push(t);
    }
  }

  // 2–3. Columns and stacks.
  const ranks = Math.max(...steps.map((n) => rank.get(n.id) ?? 0)) + 1;
  const colSize = new Array<number>(ranks).fill(0);
  const cells = new Map<string, NodeModel[]>();
  for (const n of steps) {
    const r = rank.get(n.id) ?? 0;
    colSize[r] = Math.max(colSize[r]!, main(n));
    const key = `${laneOf.get(n.id)}:${r}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(n);
  }
  for (const stack of cells.values()) stack.sort((a, b) => crossAt(a) - crossAt(b) || (a.id < b.id ? -1 : 1));
  const stackSize = (stack: NodeModel[]) => stack.reduce((s, n) => s + cross(n), 0) + stackGap * (stack.length - 1);

  const svc = new SwimlaneService(diagram);
  const sizes = lanes.map((lane, i) => {
    if (lane.isCollapsed) return laneCross(lane);
    let tallest = 0;
    for (let r = 0; r < ranks; r++) {
      const stack = cells.get(`${i}:${r}`);
      if (stack) tallest = Math.max(tallest, stackSize(stack));
    }
    return Math.max(laneCross(lane), MIN_LANE_SIZE, tallest ? titleOf(lane) + 2 * pad + tallest : 0);
  });

  // 4. The pool: its length fits the columns; its lanes, pinned at their sizes, tile in order.
  const header = cfg.headerSize ?? 0;
  const length = Math.max(MIN_POOL_SPAN, pad + colSize.reduce((s, c) => s + c, 0) + rankGap * (ranks - 1) + pad) + header;
  lanes.forEach((lane, i) => { lane.laneConfig = { ...lane.laneConfig!, fixedSize: sizes[i] }; });
  const p = pool.getOuterBounds();
  const total = sizes.reduce((s, v) => s + v, 0);
  pool.setFrame(horizontal ? { ...p, width: length, height: total } : { ...p, width: total, height: length });
  svc.reflow(pool);

  const colStart: number[] = [];
  let at = (horizontal ? p.x : p.y) + header + pad;
  for (let r = 0; r < ranks; r++) {
    colStart.push(at);
    at += colSize[r]! + rankGap;
  }
  lanes.forEach((lane, i) => {
    if (lane.isCollapsed) return;
    const band = lane.getOuterBounds();
    const bandStart = (horizontal ? band.y : band.x) + titleOf(lane);
    const room = sizes[i]! - titleOf(lane);
    for (let r = 0; r < ranks; r++) {
      const stack = cells.get(`${i}:${r}`);
      if (!stack) continue;
      let c = bandStart + Math.max(pad, (room - stackSize(stack)) / 2);
      for (const n of stack) {
        const m = colStart[r]! + (colSize[r]! - main(n)) / 2;
        const xy = horizontal ? { x: Math.round(m), y: Math.round(c) } : { x: Math.round(c), y: Math.round(m) };
        n.setPosition(xy.x, xy.y);
        positions.set(n.id, xy);
        c += cross(n) + stackGap;
      }
    }
  });
  return positions;
}
