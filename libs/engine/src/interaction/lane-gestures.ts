// LANE GESTURES — what a hand can do to a pool's lanes, for every renderer.
//
// A press on a pool used to have one meaning: drag the whole pool. A lane could
// not be resized, reordered or the pool widened except from code. Three handles
// now sit on a pool, found by geometry alone so the DOM canvas and the Angular
// canvas agree:
//
//   'border'     the line after a lane (the next lane's top, or the pool's far
//                edge after the last lane): drag it to size that lane — the pool
//                grows with it and the other lanes keep their size;
//   'pool-edge'  the pool's far end along its lanes (right for horizontal pools,
//                bottom for vertical): drag it to make every lane longer;
//   'title'      a lane's title band: drag the lane to another place in the pool.
//
// A gesture edits live, without history, and hands back ONE PoolEditCommand
// when it ends (null when nothing changed), recorded from the snapshot taken
// when it began. Anywhere else on a pool still drags the whole pool.

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel } from '../models/GroupModel';
import { SwimlaneService, PoolEditCommand, MIN_LANE_SIZE, type PoolSnapshot } from './SwimlaneService';
import { lanesOfPool, bandsOf, hasSubLanes } from './confinement';

/** A lane's title band thickness when it declares no header (matches the renderer's label band). */
export const LANE_TITLE_SIZE = 24;
/** The shortest a pool's lanes can be made by hand. */
export const MIN_POOL_SPAN = 160;

export type LaneHandle =
  | { kind: 'border'; pool: GroupModel; lane: GroupModel; horizontal: boolean }
  | { kind: 'pool-edge'; pool: GroupModel; horizontal: boolean }
  | { kind: 'title'; pool: GroupModel; lane: GroupModel; horizontal: boolean };

/** Every split lane of a pool, at any depth (their title strips carry them). */
const splitLanesOf = (diagram: DiagramModel, g: GroupModel, depth = 0): GroupModel[] =>
  depth > 32 ? [] : bandsOf(diagram, g).filter((l) => hasSubLanes(l) && !l.isCollapsed).flatMap((l) => [l, ...splitLanesOf(diagram, l, depth + 1)]);

/**
 * The lane handle under (`x`, `y`) — world coordinates — or null. `tolerance` is
 * how far from a line still counts as on it, in world units (a renderer passes a
 * few screen pixels divided by its zoom). Borders win over title bands: the
 * band after a border starts on it.
 */
export function laneHandleAt(diagram: DiagramModel, x: number, y: number, tolerance: number): LaneHandle | null {
  for (const pool of diagram.getGroups()) {
    if (pool.laneConfig?.role !== 'pool' || pool.isCollapsed) continue;
    const horizontal = pool.laneConfig.orientation === 'horizontal';
    const pb = pool.getOuterBounds();
    const inPool = x >= pb.x - tolerance && x <= pb.x + pb.width + tolerance && y >= pb.y - tolerance && y <= pb.y + pb.height + tolerance;
    if (!inPool) continue;
    const lanes = lanesOfPool(diagram, pool); // the leaves: a split lane's border is its last sub-lane's
    const cross = horizontal ? y : x;
    const main = horizontal ? x : y;
    for (const lane of lanes) {
      if (lane.isCollapsed) continue; // a folded lane keeps its band size
      const b = lane.getOuterBounds();
      const [m0, m1] = horizontal ? [b.x, b.x + b.width] : [b.y, b.y + b.height];
      const end = horizontal ? b.y + b.height : b.x + b.width;
      if (main >= m0 && main <= m1 && Math.abs(cross - end) <= tolerance) return { kind: 'border', pool, lane, horizontal };
    }
    const far = horizontal ? pb.x + pb.width : pb.y + pb.height;
    const [c0, c1] = horizontal ? [pb.y, pb.y + pb.height] : [pb.x, pb.x + pb.width];
    if (Math.abs(main - far) <= tolerance && cross >= c0 && cross <= c1) return { kind: 'pool-edge', pool, horizontal };
    for (const lane of lanes) {
      if (lane.isCollapsed) continue;
      const b = lane.getOuterBounds();
      const band = lane.headerHeight > 0 ? lane.headerHeight : LANE_TITLE_SIZE;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + Math.min(band, b.height)) return { kind: 'title', pool, lane, horizontal };
    }
    // A split lane's title strip (at its start, before its sub-lanes) carries the whole lane.
    for (const lane of splitLanesOf(diagram, pool)) {
      const b = lane.getOuterBounds();
      const strip = lane.laneConfig?.headerSize ?? 0;
      const inStrip = horizontal
        ? x >= b.x && x <= b.x + strip && y >= b.y && y <= b.y + b.height
        : y >= b.y && y <= b.y + strip && x >= b.x && x <= b.x + b.width;
      if (strip > 0 && inStrip) return { kind: 'title', pool, lane, horizontal };
    }
  }
  return null;
}

/** The cursor a handle shows on hover. */
export function laneHandleCursor(handle: LaneHandle): string {
  if (handle.kind === 'title') return 'grab';
  const alongCross = handle.kind === 'border';
  return handle.horizontal === alongCross ? 'row-resize' : 'col-resize';
}

/** One lane gesture, from press to release. */
export class LaneGesture {
  readonly name: string;
  private readonly svc: SwimlaneService;
  private readonly before: PoolSnapshot;
  private readonly start: { x: number; y: number };
  private readonly startSize: number;
  private readonly startPool: { x: number; y: number; width: number; height: number };
  /** For a reorder: where in the dragged lane the hand took hold, and the other lanes' sizes in order. */
  private readonly grab: number;
  private readonly others: Array<{ id: string; size: number }>;
  private readonly laneSize: number;
  private container: GroupModel | undefined;
  private moved = false;

  constructor(private readonly diagram: DiagramModel, readonly handle: LaneHandle, x: number, y: number) {
    this.svc = new SwimlaneService(diagram); // live edits: no history until end()
    this.before = this.svc.snapshot(handle.pool);
    this.start = { x, y };
    this.startPool = handle.pool.getOuterBounds();
    const h = handle.horizontal;
    const crossOf = (g: GroupModel) => (h ? g.getOuterBounds().height : g.getOuterBounds().width);
    this.startSize = handle.kind === 'pool-edge' ? (h ? this.startPool.width : this.startPool.height) : crossOf(handle.lane);
    this.name = handle.kind === 'border' ? 'Resize lane' : handle.kind === 'pool-edge' ? 'Resize pool' : 'Move lane';
    if (handle.kind === 'title') {
      const b = handle.lane.getOuterBounds();
      this.grab = (h ? y - b.y : x - b.x);
      this.laneSize = crossOf(handle.lane);
      // A lane moves among its SIBLINGS: the pool's lanes, or its split lane's sub-lanes.
      this.container = diagram.getGroup(handle.lane.parentGroupId ?? '') ?? handle.pool;
      this.others = bandsOf(diagram, this.container).filter((l) => l !== handle.lane).map((l) => ({ id: l.id, size: crossOf(l) }));
    } else {
      this.grab = 0;
      this.laneSize = 0;
      this.others = [];
    }
  }

  /** Follow the hand to (`x`, `y`). True when the pool changed. */
  move(x: number, y: number): boolean {
    const { handle } = this;
    const h = handle.horizontal;
    if (handle.kind === 'border') {
      const delta = h ? y - this.start.y : x - this.start.x;
      const size = Math.max(MIN_LANE_SIZE, Math.round(this.startSize + delta));
      const now = h ? handle.lane.getOuterBounds().height : handle.lane.getOuterBounds().width;
      if (size === now) return false;
      this.svc.setLaneSize(handle.pool, handle.lane.id, size);
      return (this.moved = true);
    }
    if (handle.kind === 'pool-edge') {
      const delta = h ? x - this.start.x : y - this.start.y;
      const header = handle.pool.laneConfig?.headerSize ?? 0;
      const span = Math.max(MIN_POOL_SPAN + header, Math.round(this.startSize + delta));
      const b = handle.pool.getOuterBounds();
      if ((h ? b.width : b.height) === span) return false;
      this.svc.resizePool(handle.pool, h ? { ...b, width: span } : { ...b, height: span });
      return (this.moved = true);
    }
    // 'title': the slot the carried lane's middle is over, among the OTHER lanes
    // as they were when the gesture began — never the live layout, which the
    // move itself changes (a lane of a different size would flip back and forth).
    const c = (this.container ?? handle.pool).getOuterBounds();
    const origin = h ? c.y : c.x;
    const middle = (h ? y : x) - this.grab + this.laneSize / 2;
    let at = origin;
    let index = 0;
    for (const o of this.others) {
      if (middle > at + o.size / 2) index++;
      at += o.size;
    }
    const order = (this.container ?? handle.pool).laneConfig?.laneOrder ?? [];
    if (order.indexOf(handle.lane.id) === index) return false;
    this.svc.moveLane(handle.pool, handle.lane.id, index);
    return (this.moved = true);
  }

  /** The gesture's one undo step, or null when the pool ends as it began. */
  end(): PoolEditCommand | null {
    if (!this.moved) return null;
    const after = this.svc.snapshot(this.handle.pool);
    if (JSON.stringify(after) === JSON.stringify(this.before)) return null;
    return new PoolEditCommand(this.name, this.before, after);
  }

  /** Abandon the gesture: the pool goes back to how it began. */
  cancel(): void {
    if (this.moved) new PoolEditCommand(this.name, this.before, this.svc.snapshot(this.handle.pool)).undo({ diagram: this.diagram } as never);
    this.moved = false;
  }
}
