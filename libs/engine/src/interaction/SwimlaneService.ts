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
import { GroupModel, type LaneConfig, type GroupRect, type SerializedGroup } from '../models/GroupModel';
import type { SerializedNode } from '../models/NodeModel';
import type { SerializedLink } from '../models/LinkModel';
import { Command, type CommandContext, type SerializedCommand } from '../commands/Command';
import { INCREMENTAL_FORMAT } from '../serialization/Incremental';
import { DIAGRAM_SCHEMA_VERSION } from '../serialization/DiagramMigrations';
import { GroupCollapseService } from './GroupCollapseService';

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
  /** Reserve a header band inside each lane (its `headerHeight`). Default 0. */
  laneHeaderSize?: number;
}

export interface Pool {
  pool: GroupModel;
  lanes: GroupModel[];
}

/** Smallest band a lane can be sized to by hand (a step still fits). */
export const MIN_LANE_SIZE = 40;

/** Something that runs commands onto the undo stack (a CommandManager). */
export interface PoolEditDispatcher {
  execute(command: Command): Promise<void> | void;
}

export interface SwimlaneServiceOptions {
  /**
   * Record every lane edit (add, remove, move, size, pool resize) as ONE undo
   * step on this dispatcher — typically `engine.commandManager`. Without one the
   * edits are plain model calls, as before (building a pool in code, a gesture's
   * live preview).
   */
  dispatcher?: PoolEditDispatcher;
}

/**
 * Everything a pool edit can touch, serialized: the pool, its lanes, their
 * member nodes (a folded lane's placeholder included) and the links on those
 * nodes. Restoring one puts the pool back exactly, in place.
 */
export interface PoolSnapshot {
  poolId: string;
  groups: SerializedGroup[];
  nodes: SerializedNode[];
  links: SerializedLink[];
}

/**
 * One undoable pool edit, as BEFORE and AFTER snapshots. Execute restores the
 * after state — a no-op when the edit has already happened, which is how both
 * the service and a renderer's gesture record it — and undo the before state.
 * Entities are updated in place, so a host holding the pool or a lane keeps a
 * live object.
 */
export class PoolEditCommand extends Command {
  constructor(name: string, private readonly before: PoolSnapshot, private readonly after: PoolSnapshot) {
    super(name);
  }

  override execute(context: CommandContext): void {
    restorePoolSnapshot(context.diagram as DiagramModel, this.after, this.before);
  }

  override undo(context: CommandContext): void {
    restorePoolSnapshot(context.diagram as DiagramModel, this.before, this.after);
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram;
  }

  override canUndo(context: CommandContext): boolean {
    return !!context.diagram;
  }

  override serialize(): SerializedCommand {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { before: this.before, after: this.after } };
  }

  override getDescription(): string {
    return this.name;
  }
}

/** Put the diagram's pool back to `target`; `other` names what else the edit touched (removed if absent from `target`). */
function restorePoolSnapshot(diagram: DiagramModel, target: PoolSnapshot, other: PoolSnapshot): void {
  const gone = <T extends { id: string }>(a: T[], b: T[]) => {
    const keep = new Set(a.map((e) => e.id));
    return b.map((e) => e.id).filter((id) => !keep.has(id));
  };
  diagram.applyIncremental({
    format: INCREMENTAL_FORMAT,
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    baseVersion: diagram.version,
    targetVersion: undefined as unknown as number, // keep this diagram's own counter
    added: { nodes: [], links: [], groups: [] },
    removed: { nodes: gone(target.nodes, other.nodes), links: gone(target.links, other.links), groups: gone(target.groups, other.groups) },
    modified: { nodes: target.nodes, links: target.links, groups: target.groups },
  });
}

export class SwimlaneService {
  private readonly dispatcher?: PoolEditDispatcher;

  constructor(private readonly diagram: DiagramModel, options: SwimlaneServiceOptions = {}) {
    this.dispatcher = options.dispatcher;
  }

  /** Serialize everything an edit of `pool` can touch (see {@link PoolSnapshot}). */
  snapshot(pool: GroupModel): PoolSnapshot {
    const lanes = [...pool.members].map((id) => this.diagram.getGroup(id)).filter((g): g is GroupModel => !!g);
    const nodeIds = new Set<string>();
    for (const lane of lanes) {
      for (const id of lane.members) if (this.diagram.getNode(id)) nodeIds.add(id);
      const proxy = lane.collapsedState?.proxyNodeId;
      if (proxy && this.diagram.getNode(proxy)) nodeIds.add(proxy);
    }
    const links = new Map<string, SerializedLink>();
    for (const id of nodeIds) for (const link of this.diagram.getLinksForNode(id)) links.set(link.id, link.serialize());
    // A deep copy: serialize() shares nested config (a pool's laneConfig) with the
    // live model, so a later edit would quietly rewrite the "before" state.
    return JSON.parse(JSON.stringify({
      poolId: pool.id,
      groups: [pool, ...lanes].map((g) => g.serialize()),
      nodes: [...nodeIds].map((id) => this.diagram.getNode(id)!.serialize()),
      links: [...links.values()],
    }));
  }

  /** Run `edit` on `pool`; with a dispatcher, record it as one undo step. */
  private edit<T>(pool: GroupModel, name: string, edit: () => T): T {
    if (!this.dispatcher) return edit();
    const before = this.snapshot(pool);
    const result = edit();
    void this.dispatcher.execute(new PoolEditCommand(name, before, this.snapshot(pool)));
    return result;
  }

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
    return this.edit(pool, 'Add lane', () => this.addLaneNow(pool, spec, atIndex));
  }

  private addLaneNow(pool: GroupModel, spec: LaneSpec, atIndex?: number): GroupModel {
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

  /**
   * Remove a lane and re-tile the survivors. Its steps are not deleted with it:
   * they move to the lane before it (the next one, for the first lane). A folded
   * lane is unfolded first. A pool keeps at least one lane.
   */
  removeLane(pool: GroupModel, laneId: string): void {
    this.assertPool(pool);
    const order = pool.laneConfig!.laneOrder ?? [];
    const at = order.indexOf(laneId);
    const lane = this.diagram.getGroup(laneId);
    if (at < 0 || !lane || order.length <= 1) return;
    this.edit(pool, 'Remove lane', () => {
      if (lane.isCollapsed) new GroupCollapseService(this.diagram).expand(lane);
      const heir = this.diagram.getGroup(order[at > 0 ? at - 1 : at + 1]!)!;
      const steps = [...lane.members].filter((id) => this.diagram.getNode(id));
      for (const id of steps) {
        lane.removeMember(id, this.diagram);
        heir.addMember(id, this.diagram);
      }
      pool.laneConfig!.laneOrder = order.filter((id) => id !== laneId);
      pool.removeMember(laneId, this.diagram);
      this.diagram.removeGroup(laneId);
      this.touch(pool);
      this.reflow(pool);
      for (const id of steps) heir.clampChildToExtent(id, this.diagram);
    });
  }

  /** Move a lane to `toIndex` in its pool's band order; every lane takes its steps along. */
  moveLane(pool: GroupModel, laneId: string, toIndex: number): void {
    this.assertPool(pool);
    const order = [...(pool.laneConfig!.laneOrder ?? [])];
    const from = order.indexOf(laneId);
    const to = Math.max(0, Math.min(order.length - 1, Math.round(toIndex)));
    if (from < 0 || from === to) return;
    this.edit(pool, 'Move lane', () => {
      order.splice(from, 1);
      order.splice(to, 0, laneId);
      pool.laneConfig!.laneOrder = order;
      this.touch(pool);
      this.reflow(pool);
    });
  }

  /**
   * Size one lane the way a hand drags its border: the lane takes `size`, the
   * pool grows or shrinks by the difference, and every other lane keeps its
   * size (each is pinned where it is). Never below {@link MIN_LANE_SIZE}.
   */
  setLaneSize(pool: GroupModel, laneId: string, size: number): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    if (!lane?.laneConfig || !this.getLanes(pool).includes(lane)) return;
    this.edit(pool, 'Resize lane', () => {
      const horizontal = pool.laneConfig!.orientation === 'horizontal';
      const cross = (g: GroupModel) => (horizontal ? g.getOuterBounds().height : g.getOuterBounds().width);
      const next = Math.max(MIN_LANE_SIZE, size);
      const delta = next - cross(lane);
      for (const l of this.getLanes(pool)) {
        l.laneConfig = { ...l.laneConfig!, fixedSize: l === lane ? next : cross(l) };
        this.touch(l);
      }
      const b = pool.getOuterBounds();
      pool.setFrame(horizontal ? { ...b, height: b.height + delta } : { ...b, width: b.width + delta });
      this.reflow(pool);
    });
  }

  /**
   * Resize a lane along the cross axis by pinning its band (fixedSize) and
   * re-laying out the pool so siblings absorb the remaining space.
   */
  resizeLane(pool: GroupModel, laneId: string, crossSize: number): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    if (!lane || !lane.laneConfig) return;
    this.edit(pool, 'Resize lane', () => {
      lane.laneConfig = { ...lane.laneConfig!, fixedSize: Math.max(0, crossSize) };
      this.touch(lane);
      this.reflow(pool);
    });
  }

  /** Resize the whole pool and re-tile its lanes to the new frame. */
  resizePool(pool: GroupModel, bounds: GroupRect): void {
    this.assertPool(pool);
    this.edit(pool, 'Resize pool', () => {
      pool.setFrame(bounds);
      this.reflow(pool);
    });
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
    // Every lane pinned: the LAST one that is not folded takes what the pool has
    // over or under (a resized pool used to leave a gap or overflow its frame).
    const absorber = flexible.length === 0 ? [...lanes].reverse().find((l) => !l.isCollapsed) : undefined;
    const spare = crossTotal - fixed;
    const totalWeight = flexible.reduce((s, l) => s + (l.laneConfig?.weight ?? 1), 0) || 1;
    const flexSpace = Math.max(0, crossTotal - fixed);

    let cross = horizontal ? rect.y : rect.x;
    for (const lane of lanes) {
      const lc = lane.laneConfig!;
      const size =
        lane === absorber
          ? Math.max(MIN_LANE_SIZE, lc.fixedSize! + spare)
          : lc.fixedSize !== undefined ? lc.fixedSize : (flexSpace * (lc.weight ?? 1)) / totalWeight;

      const frame: GroupRect = horizontal
        ? { x: mainStart, y: cross, width: mainSpan, height: size }
        : { x: cross, y: mainStart, width: size, height: mainSpan };
      const previous = lane.getOuterBounds();
      lane.setFrame(frame);
      // Lanes constrain their members to the band (Card 3 clamping).
      lane.constrainChildren = true;
      // C6: the members ride with their band. Re-tiling used to move only the lane
      // FRAMES, so a ticket stayed where it was and ended up drawn in a NEIGHBOUR's
      // band. Carry each member by the band's offset, then clamp it into the band
      // (it may have shrunk).
      this.carryMembers(lane, previous, frame);
      // A folded lane's placeholder IS its band: it follows every re-tile.
      const proxyId = lane.collapsedState?.proxyNodeId;
      const proxy = proxyId ? this.diagram.getNode(proxyId) : undefined;
      if (proxy) {
        proxy.setPosition(frame.x, frame.y);
        proxy.setSize(frame.width, frame.height);
      }
      // Keep each lane's orientation in sync for downstream consumers.
      lane.laneConfig = { ...lc, orientation: cfg.orientation };
      cross += size;
    }
  }

  /** Move a lane's member nodes from its previous band to `next`, then clamp them in. */
  private carryMembers(lane: GroupModel, previous: GroupRect, next: GroupRect): void {
    // A lane that had no band yet (just built) has nothing to carry.
    const hadBand = previous.width > 0 && previous.height > 0;
    const dx = hadBand ? next.x - previous.x : 0;
    const dy = hadBand ? next.y - previous.y : 0;
    for (const id of lane.members) {
      const node = this.diagram.getNode(id);
      if (!node) continue;
      if (dx !== 0 || dy !== 0) node.setPosition(node.position.x + dx, node.position.y + dy);
      lane.clampChildToExtent(id, this.diagram);
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
