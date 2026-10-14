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
import { lanesOfPool, bandsOf, hasSubLanes } from './confinement';
import { phaseBands, phaseHeaderSizeOf, MIN_PHASE_SIZE } from './pool-phases';
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
  // The LEAF lanes, in band order: steps live in them (a split lane holds sub-lanes; a folded lane is one band).
  const lanes = lanesOfPool(diagram, pool);
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

  // 2–3. Columns and stacks. A pool with PHASES keeps every step in the phase it
  //      sits in: each phase gets the columns of the ranks its steps use, in
  //      order, and is as long as they need. Without phases there is one.
  const before = phaseBands(pool);
  const phaseCount = Math.max(1, before.length);
  const phaseOf = (n: NodeModel): number => {
    if (!before.length) return 0;
    const mid = mainAt(n) + main(n) / 2;
    const i = before.findIndex((b) => mid >= b.start && mid < b.end);
    return i >= 0 ? i : mid < before[0]!.start ? 0 : before.length - 1;
  };
  const ranksIn = Array.from({ length: phaseCount }, () => new Set<number>());
  for (const n of steps) ranksIn[phaseOf(n)]!.add(rank.get(n.id) ?? 0);
  const slotsIn = ranksIn.map((set) => [...set].sort((a, b) => a - b));
  const slotOf = (n: NodeModel) => {
    const p = phaseOf(n);
    return `${p}:${slotsIn[p]!.indexOf(rank.get(n.id) ?? 0)}`;
  };
  const colSize = new Map<string, number>();
  const cells = new Map<string, NodeModel[]>();
  for (const n of steps) {
    const slot = slotOf(n);
    colSize.set(slot, Math.max(colSize.get(slot) ?? 0, main(n)));
    const key = `${laneOf.get(n.id)}@${slot}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(n);
  }
  for (const stack of cells.values()) stack.sort((a, b) => crossAt(a) - crossAt(b) || (a.id < b.id ? -1 : 1));
  const stackSize = (stack: NodeModel[]) => stack.reduce((s, n) => s + cross(n), 0) + stackGap * (stack.length - 1);

  const svc = new SwimlaneService(diagram);
  const sizes = lanes.map((lane, i) => {
    if (lane.isCollapsed) return laneCross(lane);
    let tallest = 0;
    for (const [key, stack] of cells) if (key.startsWith(`${i}@`)) tallest = Math.max(tallest, stackSize(stack));
    return Math.max(laneCross(lane), MIN_LANE_SIZE, tallest ? titleOf(lane) + 2 * pad + tallest : 0);
  });

  // 4. The pool: its length fits its phases' columns past the deepest title strip;
  //    every lane, pinned at its size (a split lane: the sum of its sub-lanes),
  //    tiles in order under the phase header.
  const header = cfg.headerSize ?? 0;
  const stripsBefore = (lane: GroupModel): number => {
    let sum = 0;
    for (let g = lane.parentGroupId ? diagram.getGroup(lane.parentGroupId) : undefined; g && g !== pool; g = g.parentGroupId ? diagram.getGroup(g.parentGroupId) : undefined) {
      sum += g.laneConfig?.headerSize ?? 0;
    }
    return sum;
  };
  const indent = Math.max(...lanes.map(stripsBefore));
  const content = (p: number) => slotsIn[p]!.reduce((sum, _r, k) => sum + (colSize.get(`${p}:${k}`) ?? 0), 0) + rankGap * Math.max(0, slotsIn[p]!.length - 1);
  const widths = Array.from({ length: phaseCount }, (_, p) => {
    const lead = p === 0 ? indent : 0;
    if (!slotsIn[p]!.length) return before.length ? Math.max(lead + MIN_PHASE_SIZE, before[p]!.end - before[p]!.start) : lead + MIN_POOL_SPAN;
    return lead + Math.max(before.length ? MIN_PHASE_SIZE : MIN_POOL_SPAN, pad + content(p) + pad);
  });
  const length = header + widths.reduce((sum, w) => sum + w, 0);
  if (before.length) {
    pool.laneConfig = { ...pool.laneConfig!, phases: (cfg.phases ?? []).map((ph, i) => ({ ...ph, fixedSize: widths[i]! })) };
  }
  const leafSize = new Map(lanes.map((lane, i) => [lane.id, sizes[i]!]));
  const sizeOf = (lane: GroupModel, depth = 0): number =>
    leafSize.get(lane.id) ?? (depth > 32 ? 0 : bandsOf(diagram, lane).reduce((sum, l) => sum + sizeOf(l, depth + 1), 0));
  const pin = (g: GroupModel, depth = 0) => {
    for (const lane of bandsOf(diagram, g)) {
      lane.laneConfig = { ...lane.laneConfig!, fixedSize: sizeOf(lane) };
      if (hasSubLanes(lane) && !lane.isCollapsed && depth < 32) pin(lane, depth + 1);
    }
  };
  pin(pool);
  const p = pool.getOuterBounds();
  const total = phaseHeaderSizeOf(pool) + bandsOf(diagram, pool).reduce((sum, l) => sum + sizeOf(l), 0);
  pool.setFrame(horizontal ? { ...p, width: length, height: total } : { ...p, width: total, height: length });
  svc.reflow(pool);

  const colStart = new Map<string, number>();
  let phaseStart = (horizontal ? p.x : p.y) + header;
  for (let ph = 0; ph < phaseCount; ph++) {
    let at = phaseStart + (ph === 0 ? indent : 0) + pad;
    slotsIn[ph]!.forEach((_r, k) => {
      colStart.set(`${ph}:${k}`, at);
      at += (colSize.get(`${ph}:${k}`) ?? 0) + rankGap;
    });
    phaseStart += widths[ph]!;
  }
  lanes.forEach((lane, i) => {
    if (lane.isCollapsed) return;
    const band = lane.getOuterBounds();
    const bandStart = (horizontal ? band.y : band.x) + titleOf(lane);
    const room = sizes[i]! - titleOf(lane);
    for (const [key, stack] of cells) {
      if (!key.startsWith(`${i}@`)) continue;
      const slot = key.slice(key.indexOf('@') + 1);
      let c = bandStart + Math.max(pad, (room - stackSize(stack)) / 2);
      for (const n of stack) {
        const m = colStart.get(slot)! + (colSize.get(slot)! - main(n)) / 2;
        const xy = horizontal ? { x: Math.round(m), y: Math.round(c) } : { x: Math.round(c), y: Math.round(m) };
        n.setPosition(xy.x, xy.y);
        positions.set(n.id, xy);
        c += cross(n) + stackGap;
      }
    }
  });
  return positions;
}
