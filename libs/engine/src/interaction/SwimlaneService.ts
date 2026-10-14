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
import { poolOfLane, hasSubLanes, bandsOf, lanesOfPool } from './confinement';
import { phaseBands, phaseHeaderSizeOf, MIN_PHASE_SIZE, type PhaseBand } from './pool-phases';
import type { PoolPhase } from '../models/GroupModel';
import { generateId } from '../utils/id';

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
  /** PHASES across every lane, in order (see pool-phases.ts). */
  phases?: PhaseSpec[];
  /** The phase header band's thickness (default 28). */
  phaseHeaderSize?: number;
}

export interface PhaseSpec {
  /** Optional explicit id (else generated). */
  id?: string;
  name: string;
  /** Its size along the lanes, in pixels (pins it). */
  size?: number;
  /** Its share of what pinned phases leave (default 1). */
  weight?: number;
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
    const lanes = this.allLanes(pool);
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

  /**
   * Run `edit` on `pool` — any change to the pool, its lanes or their steps (a
   * host's own edit, `layoutPool`) — and, with a dispatcher, record it as ONE
   * undo step named `name`.
   */
  editPool<T>(pool: GroupModel, name: string, edit: () => T): T {
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
      ...(options.phases?.length ? { phases: options.phases.map((p) => this.phase(p)) } : {}),
      ...(options.phaseHeaderSize !== undefined ? { phaseHeaderSize: options.phaseHeaderSize } : {}),
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
    return this.editPool(pool, 'Add lane', () => this.addLaneNow(pool, spec, atIndex));
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
    this.makeRoom(pool, lane, spec);
    return lane;
  }

  /**
   * Remove a lane and re-tile the survivors. Its steps are not deleted with it:
   * they move to the lane before it (the next one, for the first lane; into its
   * first leaf when that one is split). Removing the only sub-lane of a split
   * lane makes that lane whole again, holding the steps. A folded lane is
   * unfolded first. A pool keeps at least one lane.
   */
  removeLane(pool: GroupModel, laneId: string): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    const container = lane ? this.containerOf(lane) : undefined;
    if (!lane || !container || poolOfLane(this.diagram, lane) !== pool) return;
    const order = container.laneConfig!.laneOrder ?? [];
    const at = order.indexOf(laneId);
    if (at < 0 || (container === pool && order.length <= 1)) return;
    this.editPool(pool, 'Remove lane', () => {
      const fold = new GroupCollapseService(this.diagram);
      for (const g of [lane, ...this.allLanesUnder(lane)]) if (g.isCollapsed) fold.expand(g);
      const steps = this.stepsUnder(lane);
      const whole = order.length === 1; // the last sub-lane: its lane is whole again
      let heir: GroupModel = whole ? container : this.diagram.getGroup(order[at > 0 ? at - 1 : at + 1]!)!;
      if (!whole) while (hasSubLanes(heir)) heir = bandsOf(this.diagram, heir)[0]!;
      for (const { id, from } of steps) {
        from.removeMember(id, this.diagram);
        heir.addMember(id, this.diagram);
      }
      for (const g of [...this.allLanesUnder(lane)].reverse()) {
        this.containerOf(g)?.removeMember(g.id, this.diagram);
        this.diagram.removeGroup(g.id);
      }
      container.removeMember(laneId, this.diagram);
      this.diagram.removeGroup(laneId);
      if (whole) {
        const { laneOrder: _gone, headerSize: _strip, ...rest } = container.laneConfig!;
        container.laneConfig = rest;
      } else {
        container.laneConfig = { ...container.laneConfig!, laneOrder: order.filter((id) => id !== laneId) };
      }
      this.touch(container);
      this.reflow(pool);
      for (const { id } of steps) heir.clampChildToExtent(id, this.diagram);
    });
  }

  /** Move a lane to `toIndex` among its siblings (a pool's lanes, or a split lane's sub-lanes); every lane takes its steps along. */
  moveLane(pool: GroupModel, laneId: string, toIndex: number): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    const container = lane ? this.containerOf(lane) : undefined;
    if (!container || poolOfLane(this.diagram, lane!) !== pool) return;
    const order = [...(container.laneConfig!.laneOrder ?? [])];
    const from = order.indexOf(laneId);
    const to = Math.max(0, Math.min(order.length - 1, Math.round(toIndex)));
    if (from < 0 || from === to) return;
    this.editPool(pool, 'Move lane', () => {
      order.splice(from, 1);
      order.splice(to, 0, laneId);
      container.laneConfig = { ...container.laneConfig!, laneOrder: order };
      this.touch(container);
      this.reflow(pool);
    });
  }

  /**
   * Split a lane into SUB-LANES: it keeps a title strip of `headerSize` at its
   * start and tiles the sub-lanes in the rest, stacked the way the pool stacks
   * its lanes. Each of its steps joins the sub-lane it now falls in. Returns the
   * sub-lanes (none for a lane that is folded or already split).
   */
  splitLane(pool: GroupModel, laneId: string, specs: LaneSpec[], headerSize = 30): GroupModel[] {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    if (!lane || poolOfLane(this.diagram, lane) !== pool || hasSubLanes(lane) || lane.isCollapsed || specs.length === 0) return [];
    return this.editPool(pool, 'Split lane', () => {
      const steps = [...lane.members].filter((id) => this.diagram.getNode(id));
      for (const id of steps) lane.removeMember(id, this.diagram);
      const subs = specs.map((spec) => this.buildLane(lane, spec, 0));
      lane.laneConfig = { ...lane.laneConfig!, laneOrder: subs.map((g) => g.id), headerSize };
      this.touch(lane);
      this.reflow(pool);
      for (const id of steps) {
        const n = this.diagram.getNode(id)!;
        const c = { x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 };
        const home = subs.find((g) => { const r = g.getOuterBounds(); return c.x >= r.x && c.x <= r.x + r.width && c.y >= r.y && c.y <= r.y + r.height; }) ?? subs[0]!;
        home.addMember(id, this.diagram);
        home.clampChildToExtent(id, this.diagram);
      }
      return subs;
    });
  }

  /** Add a sub-lane to a lane that is already split (optionally at an index). */
  addSubLane(pool: GroupModel, parentLaneId: string, spec: LaneSpec, atIndex?: number): GroupModel | undefined {
    this.assertPool(pool);
    const parent = this.diagram.getGroup(parentLaneId);
    if (!parent || !hasSubLanes(parent) || poolOfLane(this.diagram, parent) !== pool) return undefined;
    return this.editPool(pool, 'Add lane', () => {
      const lane = this.buildLane(parent, spec, 0);
      const order = [...(parent.laneConfig!.laneOrder ?? [])];
      order.splice(atIndex === undefined ? order.length : Math.max(0, Math.min(order.length, atIndex)), 0, lane.id);
      parent.laneConfig = { ...parent.laneConfig!, laneOrder: order };
      this.touch(parent);
      this.reflow(pool);
      this.makeRoom(pool, lane, spec);
      return lane;
    });
  }

  /**
   * Size one lane the way a hand drags its border: the lane takes `size`, the
   * pool (and any lane it is a sub-lane of) grows or shrinks by the difference,
   * and every other lane keeps its size — each is pinned where it is. A split
   * lane passes the change to its last sub-lane. Never below {@link MIN_LANE_SIZE}.
   */
  setLaneSize(pool: GroupModel, laneId: string, size: number): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    if (!lane?.laneConfig || poolOfLane(this.diagram, lane) !== pool) return;
    this.editPool(pool, 'Resize lane', () => this.sizeLaneNow(pool, lane, size));
  }

  /** {@link setLaneSize}'s work, without a history step of its own (for edits that make one). */
  private sizeLaneNow(pool: GroupModel, lane: GroupModel, size: number): void {
    const horizontal = pool.laneConfig!.orientation === 'horizontal';
    const cross = (g: GroupModel) => (horizontal ? g.getOuterBounds().height : g.getOuterBounds().width);
    for (const l of this.allLanes(pool)) {
      l.laneConfig = { ...l.laneConfig!, fixedSize: cross(l) };
      this.touch(l);
    }
    let leaf = lane;
    while (hasSubLanes(leaf) && !leaf.isCollapsed) leaf = bandsOf(this.diagram, leaf).slice(-1)[0]!;
    const delta = Math.max(MIN_LANE_SIZE, cross(leaf) + Math.max(MIN_LANE_SIZE, size) - cross(lane)) - cross(leaf);
    for (let g: GroupModel | undefined = leaf; g && g !== pool; g = this.containerOf(g)) {
      g.laneConfig = { ...g.laneConfig!, fixedSize: cross(g) + delta };
    }
    const b = pool.getOuterBounds();
    pool.setFrame(horizontal ? { ...b, height: b.height + delta } : { ...b, width: b.width + delta });
    this.reflow(pool);
  }

  /**
   * A lane just added where its siblings, all pinned, leave no room (after a
   * layout or a hand resize) came out 0px wide — invisible until the next
   * layout (live report). It takes its declared size, else the average of its
   * siblings, and the pool (and any lane it is a sub-lane of) grows by it.
   */
  private makeRoom(pool: GroupModel, lane: GroupModel, spec: LaneSpec): void {
    const horizontal = pool.laneConfig!.orientation === 'horizontal';
    const cross = (g: GroupModel) => (horizontal ? g.getOuterBounds().height : g.getOuterBounds().width);
    if (cross(lane) >= MIN_LANE_SIZE) return;
    const container = this.containerOf(lane);
    const siblings = container ? bandsOf(this.diagram, container).filter((l) => l !== lane && !l.isCollapsed) : [];
    const typical = siblings.length ? Math.round(siblings.reduce((sum, l) => sum + cross(l), 0) / siblings.length) : 160;
    this.sizeLaneNow(pool, lane, spec.fixedSize ?? typical);
  }

  /**
   * Resize a lane along the cross axis by pinning its band (fixedSize) and
   * re-laying out the pool so siblings absorb the remaining space.
   */
  resizeLane(pool: GroupModel, laneId: string, crossSize: number): void {
    this.assertPool(pool);
    const lane = this.diagram.getGroup(laneId);
    if (!lane || !lane.laneConfig) return;
    this.editPool(pool, 'Resize lane', () => {
      lane.laneConfig = { ...lane.laneConfig!, fixedSize: Math.max(0, crossSize) };
      this.touch(lane);
      this.reflow(pool);
    });
  }

  /** Resize the whole pool and re-tile its lanes to the new frame. */
  resizePool(pool: GroupModel, bounds: GroupRect): void {
    this.assertPool(pool);
    this.editPool(pool, 'Resize pool', () => {
      pool.setFrame(bounds);
      this.reflow(pool);
    });
  }

  // ---- phases ---------------------------------------------------------------

  /** A pool's phases where they lie along its lanes (none for a pool without phases). */
  getPhases(pool: GroupModel): PhaseBand[] {
    this.assertPool(pool);
    return phaseBands(pool);
  }

  /** Give a pool these phases (replacing any it had); its steps stay where they are. Pass none to drop them. */
  setPhases(pool: GroupModel, specs: PhaseSpec[]): void {
    this.assertPool(pool);
    this.editPool(pool, 'Set phases', () => {
      const { phases: _old, ...rest } = pool.laneConfig!;
      pool.laneConfig = specs.length ? { ...rest, phases: specs.map((p) => this.phase(p)) } : rest;
      this.touch(pool);
      this.reflow(pool);
    });
  }

  /**
   * Add a phase (at an index, else last). The pool grows by its size (default
   * 240) along the lanes; every other phase keeps its size and the steps after
   * it move along with their phases.
   */
  addPhase(pool: GroupModel, spec: PhaseSpec, atIndex?: number): string {
    this.assertPool(pool);
    return this.editPool(pool, 'Add phase', () =>
      this.withStepsInPhases(pool, (phases) => {
        const phase = this.phase({ ...spec, size: Math.max(MIN_PHASE_SIZE, spec.size ?? 240) });
        const at = atIndex === undefined ? phases.length : Math.max(0, Math.min(phases.length, atIndex));
        phases.splice(at, 0, phase);
        return { phases, grow: phase.fixedSize!, result: phase.id };
      })
    );
  }

  /**
   * Remove a phase. Its steps stay where they are and now belong to the phase
   * before it (the next one, for the first), which takes its room; the pool
   * keeps its length. Removing the last phase leaves the pool without phases.
   */
  removePhase(pool: GroupModel, phaseId: string): void {
    this.assertPool(pool);
    const phases = pool.laneConfig?.phases ?? [];
    const at = phases.findIndex((p) => p.id === phaseId);
    if (at < 0) return;
    if (phases.length === 1) return this.setPhases(pool, []);
    this.editPool(pool, 'Remove phase', () => {
      const bands = phaseBands(pool);
      const pinned = phases.map((p, i) => ({ ...p, fixedSize: bands[i]!.end - bands[i]!.start }));
      const heir = pinned[at > 0 ? at - 1 : at + 1]!;
      heir.fixedSize! += pinned[at]!.fixedSize!;
      pinned.splice(at, 1);
      pool.laneConfig = { ...pool.laneConfig!, phases: pinned };
      this.touch(pool);
      this.reflow(pool);
    });
  }

  /**
   * Size one phase the way a hand drags its border: the pool grows or shrinks
   * along its lanes by the difference, every other phase keeps its size, and the
   * steps in later phases move with them. Never below {@link MIN_PHASE_SIZE}.
   */
  setPhaseSize(pool: GroupModel, phaseId: string, size: number): void {
    this.assertPool(pool);
    if (!(pool.laneConfig?.phases ?? []).some((p) => p.id === phaseId)) return;
    this.editPool(pool, 'Resize phase', () =>
      this.withStepsInPhases(pool, (phases, sizes) => {
        const i = phases.findIndex((p) => p.id === phaseId);
        const next = Math.max(MIN_PHASE_SIZE, Math.round(size));
        const grow = next - sizes[i]!;
        phases[i] = { ...phases[i]!, fixedSize: next };
        return { phases, grow, result: undefined };
      })
    );
  }

  /** Move a phase to `toIndex`; its steps go with it, keeping their place inside it. */
  movePhase(pool: GroupModel, phaseId: string, toIndex: number): void {
    this.assertPool(pool);
    const phases = pool.laneConfig?.phases ?? [];
    const from = phases.findIndex((p) => p.id === phaseId);
    const to = Math.max(0, Math.min(phases.length - 1, Math.round(toIndex)));
    if (from < 0 || from === to) return;
    this.editPool(pool, 'Move phase', () =>
      this.withStepsInPhases(pool, (list) => {
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved!);
        return { phases: list, grow: 0, result: undefined };
      })
    );
  }

  /**
   * Change a pool's phases with every step riding along in its phase: each step
   * keeps its offset from its phase's start. `change` gets the phases pinned at
   * their current sizes (and those sizes) and says how much the pool grows.
   */
  private withStepsInPhases<T>(
    pool: GroupModel,
    change: (phases: PoolPhase[], sizes: number[]) => { phases: PoolPhase[]; grow: number; result: T }
  ): T {
    const horizontal = pool.laneConfig!.orientation === 'horizontal';
    const before = phaseBands(pool);
    const along = (n: { position: { x: number; y: number } }) => (horizontal ? n.position.x : n.position.y);
    const steps = this.getLeafLanes(pool).flatMap((lane) =>
      [...lane.members].map((id) => this.diagram.getNode(id)).filter((n): n is NonNullable<typeof n> => !!n)
    );
    const placed = steps.map((n) => {
      const middle = along(n) + (horizontal ? n.size.width : n.size.height) / 2;
      const band = before.find((b) => middle >= b.start && middle < b.end) ?? before[before.length - 1];
      return { n, id: band?.id, offset: band ? along(n) - band.start : 0 };
    });
    const sizes = before.map((b) => b.end - b.start);
    const pinned = (pool.laneConfig!.phases ?? []).map((p, i) => ({ ...p, fixedSize: sizes[i] }));
    const { phases, grow, result } = change(pinned, sizes);
    pool.laneConfig = { ...pool.laneConfig!, phases };
    const b = pool.getOuterBounds();
    pool.setFrame(horizontal ? { ...b, width: b.width + grow } : { ...b, height: b.height + grow });
    this.touch(pool);
    this.reflow(pool);
    const after = new Map(phaseBands(pool).map((band) => [band.id, band]));
    for (const { n, id, offset } of placed) {
      const band = id ? after.get(id) : undefined;
      if (!band) continue;
      const size = horizontal ? n.size.width : n.size.height;
      const at = Math.max(band.start, Math.min(band.end - size, band.start + offset));
      if (horizontal) n.setPosition(at, n.position.y);
      else n.setPosition(n.position.x, at);
      const lane = this.getLeafLanes(pool).find((l) => l.members.has(n.id));
      lane?.clampChildToExtent(n.id, this.diagram);
    }
    return result;
  }

  private phase(spec: PhaseSpec): PoolPhase {
    return {
      id: spec.id ?? generateId(),
      name: spec.name,
      ...(spec.size !== undefined ? { fixedSize: spec.size } : {}),
      ...(spec.weight !== undefined ? { weight: spec.weight } : {}),
    };
  }

  /** Lanes of a pool in band order. */
  getLanes(pool: GroupModel): GroupModel[] {
    this.assertPool(pool);
    return (pool.laneConfig!.laneOrder ?? [])
      .map((id) => this.diagram.getGroup(id))
      .filter((g): g is GroupModel => !!g);
  }

  /** A pool's LEAF lanes — the ones that hold steps — in band order, through any sub-lanes (a folded lane counts as one). */
  getLeafLanes(pool: GroupModel): GroupModel[] {
    this.assertPool(pool);
    return lanesOfPool(this.diagram, pool);
  }

  /** The group a lane tiles inside: its pool, or the lane it is a sub-lane of. */
  containerOf(lane: GroupModel): GroupModel | undefined {
    const parent = lane.parentGroupId ? this.diagram.getGroup(lane.parentGroupId) : undefined;
    return parent?.laneConfig ? parent : undefined;
  }

  /** Every lane of a pool at any depth, each before its sub-lanes. */
  private allLanes(pool: GroupModel): GroupModel[] {
    return bandsOf(this.diagram, pool).flatMap((l) => [l, ...this.allLanesUnder(l)]);
  }

  private allLanesUnder(lane: GroupModel, depth = 0): GroupModel[] {
    if (depth > 32) return [];
    return bandsOf(this.diagram, lane).flatMap((l) => [l, ...this.allLanesUnder(l, depth + 1)]);
  }

  /** The steps anywhere under a lane, with the lane each one is in. */
  private stepsUnder(lane: GroupModel): Array<{ id: string; from: GroupModel }> {
    return [lane, ...this.allLanesUnder(lane)].flatMap((g) =>
      [...g.members].filter((id) => this.diagram.getNode(id)).map((id) => ({ id, from: g }))
    );
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
   * Re-tile a pool's lanes into bands — and every split lane's sub-lanes inside
   * its band, after its title strip. fixedSize lanes take their pixel size; the
   * rest split the remaining cross-axis space by weight. Each lane frame is set
   * (drop-in hit-testing + drag constraints follow automatically).
   */
  reflow(pool: GroupModel): void {
    this.assertPool(pool);
    this.tile(pool, pool.laneConfig!.orientation, 0);
  }

  private tile(container: GroupModel, orientation: LaneOrientation, depth: number): void {
    const cfg = container.laneConfig!;
    const lanes = bandsOf(this.diagram, container);
    if (lanes.length === 0 || depth > 32) return;

    const outer = container.getOuterBounds();
    const header = cfg.headerSize ?? 0;
    const horizontal = orientation === 'horizontal';
    // A pool's phase header band runs across the start of the cross axis (along
    // the top of a horizontal pool, down the left of a vertical one): its lanes
    // tile what is left.
    const band = cfg.role === 'pool' ? phaseHeaderSizeOf(container) : 0;
    const rect = horizontal
      ? { ...outer, y: outer.y + band, height: outer.height - band }
      : { ...outer, x: outer.x + band, width: outer.width - band };

    // Cross axis = the axis lanes are stacked along; main axis = the span each
    // lane fills. Horizontal lanes (rows) stack along Y and span X; vertical
    // lanes (columns) stack along X and span Y. The header (a pool's, or a split
    // lane's title strip) is a band at the main-axis start (left for horizontal,
    // top for vertical).
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
      lane.laneConfig = { ...lc, orientation };
      // A split lane tiles its sub-lanes inside the band it was just given.
      if (hasSubLanes(lane) && !lane.isCollapsed) this.tile(lane, orientation, depth + 1);
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

  private buildLane(container: GroupModel, spec: LaneSpec, laneHeader: number): GroupModel {
    const lane = new GroupModel({ id: spec.id, name: spec.name });
    lane.laneConfig = {
      role: 'lane',
      orientation: container.laneConfig!.orientation,
      weight: spec.weight,
      fixedSize: spec.fixedSize,
    };
    lane.headerHeight = laneHeader;
    lane.constrainChildren = true;
    this.diagram.addGroup(lane);
    container.addMember(lane.id, this.diagram); // sets parentGroupId = the pool (or the split lane)
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
