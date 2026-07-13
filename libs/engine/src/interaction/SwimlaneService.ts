// SwimlaneService — Wave-5 Card 6: first-class swimlanes & pools.
//
// A POOL is an ordinary GroupModel that tiles its child LANE groups into bands
// along one axis; each LANE is an ordinary group. Keeping them ordinary groups
// means drop-to-assign, membership, nesting and drag-constraints all REUSE the
// existing machinery (GroupMembershipService hit-tests the innermost group — a
// lane — and re-parents the node into it; lanes set constrainChildren=true so
// Card 3 clamping pins members to the band).
//
// The data model is generic (bands + orientation), not BPMN-specific: a "pool"
// is just a banded container and a "lane" a band. BPMN pools/lanes, Kanban
// columns and matrix rows are all the same shape.

import type { DiagramModel } from '../models/DiagramModel';
import { GroupModel, type LaneConfig, type GroupRect } from '../models/GroupModel';

export type LaneOrientation = 'horizontal' | 'vertical';

export interface LaneSpec {
  /** Optional explicit id (else generated). */
  id?: string;
  name: string;
  /** Relative cross-axis size (default 1). */
  weight?: number;
  /** Absolute cross-axis size (pins the band, overrides weight). */
  fixedSize?: number;
}

export interface CreatePoolOptions {
  id?: string;
  name: string;
  orientation: LaneOrientation;
  /** Pool frame in world coords. */
  bounds: GroupRect;
  lanes: LaneSpec[];
  /** Title-band thickness along the main-axis start (left for horizontal). */
  headerSize?: number;
  /** Reserve a header band inside each lane (Card 3 headerHeight). Default 0. */
  laneHeaderSize?: number;
}

export interface Pool {
  pool: GroupModel;
  lanes: GroupModel[];
}

export class SwimlaneService {
  constructor(private readonly diagram: DiagramModel) {}

  /** Create a pool group with N lane bands and tile them. */
  createPool(options: CreatePoolOptions): Pool {
    const pool = new GroupModel({ id: options.id, name: options.name });
    pool.laneConfig = {
      role: 'pool',
      orientation: options.orientation,
      laneOrder: [],
      headerSize: options.headerSize ?? 0,
    };
    pool.setFrame(options.bounds);
    this.diagram.addGroup(pool);

    const lanes: GroupModel[] = [];
    for (const spec of options.lanes) {
      const lane = this.buildLane(pool, spec, options.laneHeaderSize ?? 0);
      lanes.push(lane);
    }
    pool.laneConfig.laneOrder = lanes.map((l) => l.id);

    this.reflow(pool);
    return { pool, lanes };
  }

  /** Add a lane to a pool (optionally at an index) and re-tile. */
  addLane(pool: GroupModel, spec: LaneSpec, atIndex?: number): GroupModel {
    this.assertPool(pool);
    const lane = this.buildLane(pool, spec, this.firstLaneHeader(pool));
    const order = pool.laneConfig!.laneOrder ?? [];
    if (atIndex === undefined || atIndex >= order.length) {
      order.push(lane.id);
    } else {
      order.splice(Math.max(0, atIndex), 0, lane.id);
    }
    pool.laneConfig!.laneOrder = order;
    this.touch(pool);
    this.reflow(pool);
    return lane;
  }

  /** Remove a lane from a pool and re-tile the survivors. */
  removeLane(pool: GroupModel, laneId: string): void {
    this.assertPool(pool);
    const order = (pool.laneConfig!.laneOrder ?? []).filter((id) => id !== laneId);
    pool.laneConfig!.laneOrder = order;
    pool.removeMember(laneId, this.diagram);
    this.diagram.removeGroup(laneId);
    this.touch(pool);
    this.reflow(pool);
  }

  /**
   * Resize a lane along the cross axis by pinning its band (fixedSize) and
   * re-laying out the pool so siblings absorb the remaining space.
   */
  resizeLane(pool: GroupModel, laneId: string, crossSize: number): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    if (!lane || !lane.laneConfig) return;
    lane.laneConfig = { ...lane.laneConfig, fixedSize: Math.max(0, crossSize) };
    this.touch(lane);
    this.reflow(pool);
  }

  /** Resize the whole pool and re-tile its lanes to the new frame. */
  resizePool(pool: GroupModel, bounds: GroupRect): void {
    this.assertPool(pool);
    pool.setFrame(bounds);
    this.reflow(pool);
  }

  /** Lanes of a pool in band order. */
  getLanes(pool: GroupModel): GroupModel[] {
    this.assertPool(pool);
    return (pool.laneConfig!.laneOrder ?? [])
      .map((id) => this.diagram.getGroup(id))
      .filter((g): g is GroupModel => !!g);
  }

  /** Is this group a pool? */
  isPool(group: GroupModel): boolean {
    return group.laneConfig?.role === 'pool';
  }

  /** Is this group a lane? */
  isLane(group: GroupModel): boolean {
    return group.laneConfig?.role === 'lane';
  }

  /**
   * Re-tile a pool's lanes into bands. fixedSize lanes take their pixel size;
   * the rest split the remaining cross-axis space by weight. Each lane frame is
   * set (drop-in hit-testing + drag constraints follow automatically).
   */
  reflow(pool: GroupModel): void {
    this.assertPool(pool);
    const cfg = pool.laneConfig!;
    const lanes = this.getLanes(pool);
    if (lanes.length === 0) return;

    const rect = pool.getOuterBounds();
    const header = cfg.headerSize ?? 0;
    const horizontal = cfg.orientation === 'horizontal';

    // Cross axis = the axis lanes are stacked along; main axis = the span each
    // lane fills. Horizontal lanes (rows) stack along Y and span X; vertical
    // lanes (columns) stack along X and span Y. The pool header is a band at
    // the main-axis start (left for horizontal, top for vertical).
    const crossTotal = horizontal ? rect.height : rect.width;
    const mainStart = horizontal ? rect.x + header : rect.y + header;
    const mainSpan = (horizontal ? rect.width : rect.height) - header;

    const fixed = lanes.reduce((s, l) => s + (l.laneConfig?.fixedSize ?? 0), 0);
    const flexible = lanes.filter((l) => l.laneConfig?.fixedSize === undefined);
    const totalWeight = flexible.reduce((s, l) => s + (l.laneConfig?.weight ?? 1), 0) || 1;
    const flexSpace = Math.max(0, crossTotal - fixed);

    let cross = horizontal ? rect.y : rect.x;
    for (const lane of lanes) {
      const lc = lane.laneConfig!;
      const size =
        lc.fixedSize !== undefined ? lc.fixedSize : (flexSpace * (lc.weight ?? 1)) / totalWeight;

      const frame: GroupRect = horizontal
        ? { x: mainStart, y: cross, width: mainSpan, height: size }
        : { x: cross, y: mainStart, width: size, height: mainSpan };
      lane.setFrame(frame);
      // Lanes constrain their members to the band (Card 3 clamping).
      lane.constrainChildren = true;
      // Keep each lane's orientation in sync for downstream consumers.
      lane.laneConfig = { ...lc, orientation: cfg.orientation };
      cross += size;
    }
  }

  private buildLane(pool: GroupModel, spec: LaneSpec, laneHeader: number): GroupModel {
    const lane = new GroupModel({ id: spec.id, name: spec.name });
    lane.laneConfig = {
      role: 'lane',
      orientation: pool.laneConfig!.orientation,
      weight: spec.weight,
      fixedSize: spec.fixedSize,
    };
    lane.headerHeight = laneHeader;
    lane.constrainChildren = true;
    this.diagram.addGroup(lane);
    pool.addMember(lane.id, this.diagram); // sets parentGroupId = pool.id
    return lane;
  }

  private firstLaneHeader(pool: GroupModel): number {
    const first = this.getLanes(pool)[0];
    return first?.headerHeight ?? 0;
  }

  private assertPool(group: GroupModel): void {
    if (group.laneConfig?.role !== 'pool') {
      throw new Error(`Group ${group.id} is not a pool`);
    }
  }

  /** Mark a group changed so the diff-capture serializes laneConfig edits. */
  private touch(group: GroupModel): void {
    group.setMetadata('__laneRev', (group.getMetadata('__laneRev') ?? 0) + 1);
  }
}
