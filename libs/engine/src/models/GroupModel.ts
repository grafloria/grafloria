// GroupModel - Entity for organizing nodes into groups (Phase 1.6c)
// Layout configuration storage added in Phase 1.7

import { DiagramEntity } from './DiagramEntity';
import type { DiagramModel } from './DiagramModel';
import type { NodeModel } from './NodeModel';
import type { SerializedEntity } from '../types';
import type {
  LayoutType,
  LayoutConfig,
  FlexboxLayoutConfig,
  GridLayoutConfig,
  FlexItemConfig,
  GridItemConfig,
} from '../types/layout.types';

export interface SerializedGroup extends SerializedEntity {
  name: string;
  members: string[];
  isCollapsed: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  layoutType?: LayoutType; // Phase 1.7
  layoutConfig?: LayoutConfig; // Phase 1.7
  position?: { x: number; y: number }; // group geometry
  size?: { width: number; height: number; depth: number }; // group geometry
  parentGroupId?: string; // Wave-2: compound-graph containment (nesting)

  // Wave-5 Card 3: subflow geometry — auto-fit padding, title band, z-order,
  // fit mode and child-extent constraint. All optional so groups that never
  // touch these serialize byte-for-byte as before (round-trip invariant).
  padding?: GroupPadding;
  headerHeight?: number;
  zIndex?: number;
  fitMode?: GroupFitMode;
  constrainChildren?: boolean;

  // Wave-5 Card 4: everything needed to expand a collapsed group back to
  // exactly its prior state. Present iff the group is currently collapsed.
  collapsedState?: CollapsedState;

  // Wave-5 Card 5: per-group compound-layout intent (the GroupInfo bits that
  // belong to the group itself and should persist).
  subgraphLayout?: SubgraphGroupConfig;

  // Wave-5 Card 6: swimlane/pool band config (present only on pools & lanes).
  laneConfig?: LaneConfig;

  // Wave-5 Card 7: serialized declarative membership rule (auto-membership).
  membershipRule?: MembershipRule;
  // Wave-5 Card 7: capacity / WIP limit (0+; present only when set).
  capacity?: number;
}

/**
 * Wave-5 Card 7: a SERIALIZABLE declarative membership predicate over a node's
 * `data` (never eval'd code). Leaves match one field with an operator; branches
 * compose with all/any/not. Kept intentionally small and closed so it round-
 * trips and can be reasoned about / edited as data.
 */
export type MembershipRule =
  | MembershipLeaf
  | { all: MembershipRule[] }
  | { any: MembershipRule[] }
  | { not: MembershipRule };

export interface MembershipLeaf {
  /** Dot-free key looked up on the node's `data` map. */
  field: string;
  op: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'matches';
  /** Comparison operand (array for in/nin; regex source string for matches). */
  value?: unknown;
}

/**
 * Wave-5 Card 5: a group's own compound-layout configuration — the subset of
 * the GroupInfo layout contract that is intrinsic to the group and round-trips.
 * Padding/header come from Card 3 (padding/headerHeight); size clamps come from
 * fitToContents.
 */
export interface SubgraphGroupConfig {
  /**
   * Algorithm for THIS group's contents. 'inherit' uses the parent/default.
   *
   * Wave 7 Card 4: any name in the layout registry works here (force, spectral,
   * community, or an extension-registered engine), not just the dagre|elk pair
   * wave 5 hard-coded — nested layout resolves the name against the registry.
   * An unknown name falls back to the built-in grid rather than throwing.
   */
  algorithm?: 'dagre' | 'elk' | 'grid' | 'inherit' | (string & {});
  /** Pinned: neither laid out internally nor moved by the parent layout. */
  fixed?: boolean;
  /** Opaque options forwarded to the chosen layout adapter. */
  layoutOptions?: Record<string, unknown>;
}

/**
 * Wave-5 Card 6: swimlanes & pools as a GENERIC banded group (not BPMN-named).
 * A `pool` group tiles its child `lane` groups into bands along one axis; each
 * `lane` is an ordinary group (so drop-to-assign, membership, constraints all
 * reuse the existing machinery). This is intrinsic band config that round-trips.
 */
export interface LaneConfig {
  /** 'pool' owns the band grid; 'lane' is one band inside a pool. */
  role: 'pool' | 'lane';
  /**
   * Band axis. 'horizontal' → lanes are rows stacked along Y (each spans the
   * pool width). 'vertical' → lanes are columns along X (each spans the height).
   * Set on the pool; lanes carry a copy for convenience.
   */
  orientation: 'horizontal' | 'vertical';
  /** Pool only: ordered child lane group ids (band order). */
  laneOrder?: string[];
  /**
   * Pool only: title-band thickness reserved along the main axis start (left for
   * horizontal pools, top for vertical pools).
   */
  headerSize?: number;
  /** Lane only: relative cross-axis size when not fixed (default 1). */
  weight?: number;
  /** Lane only: absolute cross-axis size (pins the band, overrides weight). */
  fixedSize?: number;
}

/**
 * Wave-5 Card 4: the reversible snapshot captured when a group collapses.
 * Stored (serialized) on the group so a collapsed diagram round-trips and can
 * be expanded losslessly after a save/load — not just within one session.
 */
export interface CollapsedState {
  /** The hidden placeholder node that presents the group as a node endpoint. */
  proxyNodeId: string;
  /** The group's exact geometry before it shrank (restored verbatim on expand). */
  savedGeometry?: {
    position: { x: number; y: number };
    size?: { width: number; height: number; depth: number };
    bounds?: GroupRect;
  };
  /** Member (node) world positions at collapse time (restored on expand). */
  savedPositions: Record<string, { x: number; y: number }>;
  /** Members whose visibility we toggled, with their prior `visible` value. */
  hiddenNodes: Array<{ nodeId: string; prevVisible: boolean }>;
  /**
   * Serialized links removed at collapse time (internal links + the parallel
   * boundary links that were aggregated away). Re-created verbatim on expand.
   */
  removedLinks: any[];
  /**
   * Boundary links that SURVIVED as proxy links: one per (external endpoint)
   * bundle, re-pointed to the placeholder node. Records the original endpoint
   * so expand can restore it, plus how many raw edges it now represents.
   */
  proxyLinks: Array<{
    linkId: string;
    end: 'source' | 'target';
    originalPortId: string;
    originalNodeId?: string;
    aggregatedCount: number;
  }>;
}

/** Wave-5 Card 3: per-side padding (a scalar expands to all four sides). */
export type GroupPadding =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

/**
 * Defaults for groups AUTHORED in code (constructor path). A fitted frame needs
 * breathing room and a title band or its label lands under the first member.
 * Loaded documents are exempt: restore assigns the stored values (padding
 * verbatim — possibly undefined, which getPadding() resolves to 0 — and
 * headerHeight number-or-0), so legacy geometry is byte-stable.
 */
export const DEFAULT_GROUP_PADDING = 16;
export const DEFAULT_GROUP_HEADER_HEIGHT = 24;

/**
 * Wave-5 Card 3: how {@link GroupModel.fitToContents} reconciles the freshly
 * computed content rectangle with the group's current rectangle.
 * - `exact`      — snap to the content rectangle (default).
 * - `grow-only`  — never shrink below the current rectangle (union).
 * - `shrink-only`— never grow beyond the current rectangle (intersection-ish).
 */
export type GroupFitMode = 'exact' | 'grow-only' | 'shrink-only';

/** A resolved rectangle (all four sides present). */
export interface GroupRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for {@link GroupModel.fitToContents}. */
export interface FitToContentsOptions {
  /** Override the group's stored {@link GroupModel.fitMode} for this call. */
  mode?: GroupFitMode;
  /**
   * Deep-recursive fit: fit every descendant group first (deepest first) so a
   * parent fits around already-fitted children. Requires a diagram.
   */
  deepRecursive?: boolean;
}

/**
 * Predicate used to gate group membership (Wave-2).
 * Return false to reject a candidate entity from joining the group.
 * @param candidateId - id of the node/group being added
 * @param group - the group the candidate would join
 */
export type MemberValidation = (candidateId: string, group: GroupModel) => boolean;

export class GroupModel extends DiagramEntity {
  name: string;
  members: Set<string> = new Set();
  isCollapsed: boolean = false;
  bounds?: { x: number; y: number; width: number; height: number };

  // Phase 1.7: Layout configuration storage
  layoutType: LayoutType = 'none';
  layoutConfig?: LayoutConfig;

  // Position and size for layout calculations
  position: { x: number; y: number } = { x: 0, y: 0 };
  size?: { width: number; height: number; depth: number };

  // Wave-2: compound-graph containment. `parentGroupId` is the single source of
  // truth for the nesting tree; it is kept in sync with the containing group's
  // `members` set by addMember/removeMember/setParent. Undefined => top-level.
  parentGroupId?: string;

  // Wave-2: optional per-group predicate gating who may join this group.
  // Not serialized (functions can't round-trip). Checked in addMember and by
  // the drag-drop membership service before it commits.
  memberValidation?: MemberValidation;

  // Wave-2: transient drag-hover highlight state (not serialized).
  isHovered: boolean = false;

  // Wave-5 Card 3: subflow geometry.
  // `padding` — inner gap between the member bounding box and the group frame,
  // consumed by fitToContents/getInnerBounds (the GroupInfo.padding that used to
  // be dead outside the never-wired SubgraphLayoutManager). `headerHeight` — a
  // title band reserved at the TOP inside the frame (children live below it).
  // `zIndex` — deterministic stacking (lower = further back); the model-level
  // fix for "stacking == Map insertion order". `fitMode` — default fit policy.
  // `constrainChildren` — clamp member drags to the inner extent when true.
  // `padding` is TRI-STATE on purpose:
  //   undefined      — the author never said; getPadding() resolves it to
  //                    DEFAULT_GROUP_PADDING, and layout-level fallbacks
  //                    (CompoundLayoutService.applyDefaultPadding) may claim it.
  //   explicit value — pinned, including 0. Loaders pin absent keys to 0 so a
  //                    legacy document keeps the geometry it was saved with.
  // The default is non-zero because the renderer unconditionally draws a title
  // band and a border: a group fitted flush hides its own label behind the
  // first member — the screenshot audit caught exactly that, and no unit test
  // ever could.
  padding?: GroupPadding;
  headerHeight = DEFAULT_GROUP_HEADER_HEIGHT;
  zIndex = 0;
  fitMode: GroupFitMode = 'exact';
  constrainChildren = false;

  // Wave-5 Card 4: reversible collapse snapshot (see CollapsedState). Set while
  // collapsed, cleared on expand. Serialized so a collapsed diagram survives
  // save/load and can still be expanded.
  collapsedState?: CollapsedState;

  // Wave-5 Card 5: per-group compound-layout intent (serialized when set).
  subgraphLayout?: SubgraphGroupConfig;

  // Wave-5 Card 6: swimlane/pool band config (serialized when set).
  laneConfig?: LaneConfig;

  // Wave-5 Card 7: declarative auto-membership rule + capacity/WIP limit.
  membershipRule?: MembershipRule;
  capacity?: number;

  constructor(config: { id?: string; name: string }) {
    super(config.id);
    this.name = config.name;
  }

  /**
   * Resolve the owning diagram, preferring an explicit argument and falling
   * back to the reference stashed in metadata by DiagramModel.addGroup.
   */
  private resolveDiagram(diagram?: DiagramModel): DiagramModel | undefined {
    return diagram ?? (this.metadata.get('diagram') as DiagramModel | undefined);
  }

  /**
   * Whether `candidateId` may legally join this group (Wave-2).
   * Rejects self-membership, ancestor cycles (adding an ancestor group as a
   * member would create a containment loop), and candidates failing the
   * per-group `memberValidation` predicate. Node candidates only run the
   * predicate check (nodes can't form group cycles).
   */
  canAddMember(candidateId: string, diagram?: DiagramModel): boolean {
    if (candidateId === this.id) {
      return false;
    }

    const dm = this.resolveDiagram(diagram);
    const candidateGroup = dm?.getGroup(candidateId);

    // Cycle prevention: reject if the candidate is an ancestor of this group.
    if (candidateGroup && dm) {
      const ancestors = dm.getAncestors(this.id);
      if (ancestors.some((g) => g.id === candidateId)) {
        return false;
      }
    }

    // Wave-5 Card 7: capacity / WIP limit — reject an add that would push the
    // group past its limit. Already-present candidates never count (re-adds are
    // no-ops), so this only gates genuinely new members (incl. drops, which flow
    // through GroupMembershipService → canAddMember).
    if (
      this.capacity !== undefined &&
      !this.members.has(candidateId) &&
      this.members.size >= this.capacity
    ) {
      return false;
    }

    // Per-group membership predicate.
    if (this.memberValidation && !this.memberValidation(candidateId, this)) {
      return false;
    }

    return true;
  }

  /**
   * Wave-5 Card 7: WIP state for the capacity limit. 'under' = room to spare,
   * 'full' = exactly at the limit (the visual warning threshold), 'over' = past
   * it (only reachable by lowering capacity below the current count). Returns
   * 'unlimited' when no capacity is set.
   */
  getWipState(): { count: number; capacity?: number; state: 'unlimited' | 'under' | 'full' | 'over' } {
    const count = this.members.size;
    if (this.capacity === undefined) {
      return { count, state: 'unlimited' };
    }
    const state = count > this.capacity ? 'over' : count >= this.capacity ? 'full' : 'under';
    return { count, capacity: this.capacity, state };
  }

  /** Wave-5 Card 7: true when at or beyond the capacity limit (warning state). */
  isOverCapacity(): boolean {
    const s = this.getWipState().state;
    return s === 'full' || s === 'over';
  }

  /** Set (or clear) the capacity / WIP limit, tracked for undo/diff. */
  setCapacity(capacity: number | undefined): void {
    if (this.capacity === capacity) {
      return;
    }
    const old = this.capacity;
    this.capacity = capacity;
    this.trackChange('capacity', old, capacity);
    this.emitter.emit('capacity:changed', this.getWipState());
  }

  /**
   * Add member to group.
   *
   * When the member is itself a group, this establishes containment by setting
   * the child's `parentGroupId` (detaching it from any previous parent), which
   * keeps the nesting tree consistent for getAncestors/getDescendants. Members
   * that would create a cycle or fail `memberValidation` are rejected (no-op).
   */
  addMember(entityId: string, diagram?: DiagramModel): void {
    if (this.members.has(entityId)) {
      return;
    }

    const dm = this.resolveDiagram(diagram);

    // Guard cycles + validation (no-op on rejection to preserve void contract).
    if (!this.canAddMember(entityId, dm)) {
      return;
    }

    this.members.add(entityId);

    // Group member => maintain the containment back-pointer.
    const childGroup = dm?.getGroup(entityId);
    if (childGroup) {
      this.linkChildGroup(childGroup, dm!);
    }

    this.trackChange('members', null, entityId);
    this.emitter.emit('member:added', entityId);

    // PUSH (A): a container that declares a layout reflows when its membership
    // changes. This used to require an explicit `autoLayout` metadata flag, which
    // meant the default behaviour of a layout container was "do nothing".
    this.requestLayout(dm);
  }

  /**
   * Remove member from group. When the member is a group whose parent is this
   * group, its `parentGroupId` back-pointer is cleared so the nesting tree
   * stays consistent.
   */
  removeMember(entityId: string, diagram?: DiagramModel): boolean {
    if (this.members.has(entityId)) {
      this.members.delete(entityId);

      const dm = this.resolveDiagram(diagram);
      const childGroup = dm?.getGroup(entityId);
      if (childGroup && childGroup.parentGroupId === this.id) {
        childGroup.clearParentGroupId();
      }

      this.trackChange('members', entityId, null);
      this.emitter.emit('member:removed', entityId);

      // PUSH (A): the survivors close the gap. Deleting a dashboard widget and
      // leaving a hole is the single most obvious symptom of a pull-only layout.
      this.requestLayout(dm);
      return true;
    }
    return false;
  }

  /**
   * Make `child` a nested group of this group: detach from previous parent's
   * members and point `parentGroupId` here. Uses protected access allowed
   * between GroupModel instances.
   */
  private linkChildGroup(child: GroupModel, diagram: DiagramModel): void {
    if (child.parentGroupId === this.id) {
      return;
    }
    // Detach from a previous parent so its members set stays consistent.
    if (child.parentGroupId) {
      const oldParent = diagram.getGroup(child.parentGroupId);
      oldParent?.members.delete(child.id);
    }
    const old = child.parentGroupId;
    child.parentGroupId = this.id;
    child.trackChange('parentGroupId', old, this.id);
    child.emitter.emit('parent:changed', { oldParentId: old, newParentId: this.id });
  }

  /**
   * Clear this group's parent back-pointer (used when detached from a parent).
   */
  private clearParentGroupId(): void {
    if (this.parentGroupId === undefined) {
      return;
    }
    const old = this.parentGroupId;
    this.parentGroupId = undefined;
    this.trackChange('parentGroupId', old, undefined);
    this.emitter.emit('parent:changed', { oldParentId: old, newParentId: undefined });
  }

  /**
   * Reparent this group under `newParentId` (or detach when undefined),
   * keeping both the `parentGroupId` pointer and the parents' `members` sets
   * consistent. Rejects cycles (a group cannot be nested under one of its own
   * descendants) and returns false without mutating anything.
   */
  setParent(newParentId: string | undefined, diagram?: DiagramModel): boolean {
    const dm = this.resolveDiagram(diagram);

    if (newParentId !== undefined) {
      if (newParentId === this.id) {
        return false;
      }
      // Cycle prevention: the new parent must not live inside this subtree.
      if (dm && dm.getDescendants(this.id).some((g) => g.id === newParentId)) {
        return false;
      }
      // Honour the target group's own membership predicate.
      const newParent = dm?.getGroup(newParentId);
      if (newParent && !newParent.canAddMember(this.id, dm)) {
        return false;
      }
    }

    const oldParentId = this.parentGroupId;
    if (oldParentId === newParentId) {
      return true;
    }

    // Detach from old parent's members.
    if (dm && oldParentId) {
      dm.getGroup(oldParentId)?.members.delete(this.id);
    }

    this.parentGroupId = newParentId;
    this.trackChange('parentGroupId', oldParentId, newParentId);
    this.emitter.emit('parent:changed', { oldParentId, newParentId });

    // Attach to new parent's members (kept in sync with parentGroupId).
    if (dm && newParentId) {
      dm.getGroup(newParentId)?.members.add(this.id);
    }

    return true;
  }

  /**
   * Set transient drag-hover highlight state and notify listeners (Wave-2).
   * Renderers/canvas can subscribe to 'hover:changed' to outline a drop target.
   */
  setHovered(hovered: boolean): void {
    if (this.isHovered !== hovered) {
      this.isHovered = hovered;
      this.emitter.emit('hover:changed', hovered);
    }
  }

  /**
   * Expand the group
   */
  expand(): void {
    if (this.isCollapsed) {
      this.isCollapsed = false;
      this.trackChange('isCollapsed', true, false);
      this.emitter.emit('expanded');
    }
  }

  /**
   * Collapse the group
   */
  collapse(): void {
    if (!this.isCollapsed) {
      this.isCollapsed = true;
      this.trackChange('isCollapsed', false, true);
      this.emitter.emit('collapsed');
    }
  }

  /**
   * Wave-5 Card 4: set (or clear) the reversible collapse snapshot. Tracked as a
   * change so the incremental diff-capture serializes it and undo/redo see it.
   */
  setCollapsedState(state: CollapsedState | undefined): void {
    const old = this.collapsedState;
    this.collapsedState = state;
    this.trackChange('collapsedState', old, state);
  }

  /**
   * Set layout configuration (Phase 1.7)
   * @param type - Layout type ('flexbox' or 'grid')
   * @param config - Layout configuration object
   */
  setLayout(type: 'flexbox', config: FlexboxLayoutConfig): void;
  setLayout(type: 'grid', config: GridLayoutConfig): void;
  setLayout(type: 'flexbox' | 'grid', config: LayoutConfig): void {
    const oldType = this.layoutType;
    const oldConfig = this.layoutConfig;

    this.layoutType = type;
    this.layoutConfig = config;
    this.version++;

    this.trackChange('layoutType', oldType, type);
    this.trackChange('layoutConfig', oldConfig, config);
    this.emitter.emit('layout:changed', { type, config });
  }

  /**
   * Clear layout configuration (Phase 1.7)
   */
  clearLayout(): void {
    const oldType = this.layoutType;
    const oldConfig = this.layoutConfig;

    this.layoutType = 'none';
    this.layoutConfig = undefined;
    this.version++;

    this.trackChange('layoutType', oldType, 'none');
    this.trackChange('layoutConfig', oldConfig, undefined);
    this.emitter.emit('layout:cleared');
  }

  /**
   * Get layout configuration (Phase 1.7)
   */
  getLayout(): { type: LayoutType; config?: LayoutConfig } {
    return {
      type: this.layoutType,
      config: this.layoutConfig,
    };
  }

  /**
   * Check if group has layout configured (Phase 1.7)
   */
  hasLayout(): boolean {
    return this.layoutType !== 'none' && this.layoutConfig !== undefined;
  }

  /**
   * Get layout as flexbox config (Phase 1.7)
   * @throws Error if layout is not flexbox
   */
  getFlexboxLayout(): FlexboxLayoutConfig {
    if (this.layoutType !== 'flexbox') {
      throw new Error(`Group ${this.id} does not have flexbox layout`);
    }
    return this.layoutConfig as FlexboxLayoutConfig;
  }

  /**
   * Get layout as grid config (Phase 1.7)
   * @throws Error if layout is not grid
   */
  getGridLayout(): GridLayoutConfig {
    if (this.layoutType !== 'grid') {
      throw new Error(`Group ${this.id} does not have grid layout`);
    }
    return this.layoutConfig as GridLayoutConfig;
  }

  /**
   * Calculate bounds from member nodes using global bounds
   */
  calculateBounds(diagram: DiagramModel): void {
    const nodes = Array.from(this.members)
      .map(id => diagram.getNode(id))
      .filter(n => n !== undefined) as NodeModel[];

    if (nodes.length === 0) {
      this.bounds = undefined;
      return;
    }

    // Use global bounds (accounts for transforms)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const bounds = node.getGlobalBounds();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    }

    this.bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  // ---------------------------------------------------------------------------
  // Wave-5 Card 3 — Subflow geometry: auto-fit, extent clamping & z-order
  // ---------------------------------------------------------------------------

  /**
   * Resolve {@link padding} to a full four-sided rectangle. `undefined` (the
   * author never said) resolves to {@link DEFAULT_GROUP_PADDING}; an explicit
   * value — including the 0 that loaders pin for legacy documents — is taken
   * as written.
   */
  getPadding(): { top: number; right: number; bottom: number; left: number } {
    const p = this.padding;
    if (p === undefined) {
      return {
        top: DEFAULT_GROUP_PADDING,
        right: DEFAULT_GROUP_PADDING,
        bottom: DEFAULT_GROUP_PADDING,
        left: DEFAULT_GROUP_PADDING,
      };
    }
    if (typeof p === 'number') {
      return { top: p, right: p, bottom: p, left: p };
    }
    return {
      top: p.top ?? 0,
      right: p.right ?? 0,
      bottom: p.bottom ?? 0,
      left: p.left ?? 0,
    };
  }

  /**
   * The group's outer frame rectangle in world coordinates. Prefers explicit
   * geometry (position + size) and falls back to the derived member `bounds`,
   * matching how GroupMembershipService hit-tests a group.
   */
  getOuterBounds(): GroupRect {
    if (this.size) {
      return {
        x: this.position.x,
        y: this.position.y,
        width: this.size.width,
        height: this.size.height,
      };
    }
    if (this.bounds) {
      return { ...this.bounds };
    }
    return { x: this.position.x, y: this.position.y, width: 0, height: 0 };
  }

  /**
   * The rectangle members must stay inside: the outer frame minus padding and
   * minus the header band (which is reserved at the top). Never returns a
   * negative width/height.
   */
  getInnerBounds(): GroupRect {
    const outer = this.getOuterBounds();
    const pad = this.getPadding();
    const x = outer.x + pad.left;
    const y = outer.y + pad.top + this.headerHeight;
    const width = Math.max(0, outer.width - pad.left - pad.right);
    const height = Math.max(0, outer.height - pad.top - pad.bottom - this.headerHeight);
    return { x, y, width, height };
  }

  /**
   * Auto-fit the group frame to its members' bounding box plus padding and the
   * header band. This is the real consumer of `padding`/`headerHeight` that
   * `calculateBounds` (a tight, padding-free box) never was.
   *
   * Member groups contribute their own OUTER frame (so a parent fits around a
   * nested group's full extent, not just its raw member points). With
   * `deepRecursive`, descendant groups are fitted first (deepest first) so the
   * parent fits around already-fitted children.
   *
   * The computed content rectangle is reconciled with the current frame per the
   * effective fit mode (grow-only / shrink-only / exact) and written to both
   * `position`/`size` (authoritative geometry) and `bounds` (hit-test rect).
   * No-op with no positioned members (nothing to fit around).
   */
  fitToContents(diagram?: DiagramModel, options?: FitToContentsOptions): void {
    const dm = this.resolveDiagram(diagram);
    if (!dm) {
      return;
    }

    if (options?.deepRecursive) {
      // Deepest-first so each parent fits around already-fitted children.
      const descendants = dm
        .getDescendants(this.id)
        .sort((a, b) => dm.getDepth(b.id) - dm.getDepth(a.id));
      for (const child of descendants) {
        child.fitToContents(dm, { mode: options.mode });
      }
    }

    const content = this.computeMemberExtent(dm);
    if (!content) {
      return;
    }

    const pad = this.getPadding();
    const fitted: GroupRect = {
      x: content.x - pad.left,
      y: content.y - pad.top - this.headerHeight,
      width: content.width + pad.left + pad.right,
      height: content.height + pad.top + pad.bottom + this.headerHeight,
    };

    const mode = options?.mode ?? this.fitMode;
    const target = this.reconcileFit(fitted, mode);

    this.setFrame(target);
  }

  /**
   * Bounding box (world coords) of this group's members. Nodes contribute their
   * global bounds; member groups contribute their outer frame. Returns
   * undefined when nothing is positioned.
   */
  private computeMemberExtent(diagram: DiagramModel): GroupRect | undefined {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;

    for (const id of this.members) {
      const node = diagram.getNode(id);
      if (node) {
        const b = node.getGlobalBounds();
        minX = Math.min(minX, b.left);
        minY = Math.min(minY, b.top);
        maxX = Math.max(maxX, b.right);
        maxY = Math.max(maxY, b.bottom);
        count++;
        continue;
      }
      const child = diagram.getGroup(id);
      if (child) {
        const r = child.getOuterBounds();
        if (r.width > 0 || r.height > 0) {
          minX = Math.min(minX, r.x);
          minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + r.width);
          maxY = Math.max(maxY, r.y + r.height);
          count++;
        }
      }
    }

    if (count === 0) {
      return undefined;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** Apply a fit mode to reconcile a freshly computed rect with the current frame. */
  private reconcileFit(fitted: GroupRect, mode: GroupFitMode): GroupRect {
    if (mode === 'exact' || !this.size) {
      return fitted;
    }
    const current = this.getOuterBounds();
    if (mode === 'grow-only') {
      // Union: expand to contain content, never shrink.
      const x = Math.min(current.x, fitted.x);
      const y = Math.min(current.y, fitted.y);
      const right = Math.max(current.x + current.width, fitted.x + fitted.width);
      const bottom = Math.max(current.y + current.height, fitted.y + fitted.height);
      return { x, y, width: right - x, height: bottom - y };
    }
    // shrink-only: never grow beyond the current frame — clamp the fitted rect
    // inside it (but still snap smaller when content is smaller).
    const x = Math.max(current.x, fitted.x);
    const y = Math.max(current.y, fitted.y);
    const right = Math.min(current.x + current.width, fitted.x + fitted.width);
    const bottom = Math.min(current.y + current.height, fitted.y + fitted.height);
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  }

  /**
   * Write a world rectangle into the group's authoritative geometry
   * (position + size) and the derived hit-test `bounds`, keeping the existing
   * `depth` when present. Tracks a single 'bounds' change for undo/diff.
   */
  setFrame(rect: GroupRect): void {
    const oldBounds = this.bounds;
    this.position = { x: rect.x, y: rect.y };
    this.size = {
      width: rect.width,
      height: rect.height,
      depth: this.size?.depth ?? 0,
    };
    this.bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    this.trackChange('bounds', oldBounds, this.bounds);
    this.emitter.emit('bounds:changed', this.bounds);

    // PUSH (A): the frame IS the layout's coordinate system and available width.
    // Resizing or moving a container without reflowing its children is how you
    // get a 12-column dashboard whose columns stop matching its own edges.
    this.requestLayout();
  }

  /**
   * Clamp a member node so it stays fully inside the group's inner extent.
   * No-op unless `constrainChildren` is set and the node is a direct member.
   * Returns true when the node was actually moved. Absolute-coordinate model:
   * this adjusts the node's world position directly.
   */
  clampChildToExtent(nodeId: string, diagram?: DiagramModel): boolean {
    if (!this.constrainChildren || !this.members.has(nodeId)) {
      return false;
    }
    const dm = this.resolveDiagram(diagram);
    const node = dm?.getNode(nodeId);
    if (!node) {
      return false;
    }
    const inner = this.getInnerBounds();
    if (inner.width <= 0 || inner.height <= 0) {
      return false;
    }

    const b = node.getGlobalBounds();
    const w = b.right - b.left;
    const h = b.bottom - b.top;
    // Largest top-left that still fits; clamp within [inner.x, inner.right - w].
    const maxX = Math.max(inner.x, inner.x + inner.width - w);
    const maxY = Math.max(inner.y, inner.y + inner.height - h);
    const clampedLeft = Math.min(Math.max(b.left, inner.x), maxX);
    const clampedTop = Math.min(Math.max(b.top, inner.y), maxY);

    const dx = clampedLeft - b.left;
    const dy = clampedTop - b.top;
    if (dx === 0 && dy === 0) {
      return false;
    }
    node.setPosition(node.position.x + dx, node.position.y + dy);
    return true;
  }

  /**
   * Wave-5 Card 4: restore raw geometry (position + optional size + bounds)
   * captured before a collapse. Unlike setFrame this permits size === undefined
   * so a group that had no explicit frame is restored to exactly that.
   */
  restoreGeometry(geo: {
    position: { x: number; y: number };
    size?: { width: number; height: number; depth: number };
    bounds?: GroupRect;
  }): void {
    const oldBounds = this.bounds;
    this.position = { x: geo.position.x, y: geo.position.y };
    this.size = geo.size ? { ...geo.size } : undefined;
    this.bounds = geo.bounds ? { ...geo.bounds } : undefined;
    this.trackChange('bounds', oldBounds, this.bounds);
    this.emitter.emit('bounds:changed', this.bounds);
  }

  /** Set the group's stacking index (lower renders further back). */
  setZIndex(z: number): void {
    if (this.zIndex === z) {
      return;
    }
    const old = this.zIndex;
    this.zIndex = z;
    this.trackChange('zIndex', old, z);
    this.emitter.emit('zindex:changed', z);
  }

  /**
   * Bring this group in front of every other group (highest zIndex + 1).
   * Minimal z-order API — the renderer honors zIndex ordering.
   */
  bringToFront(diagram?: DiagramModel): void {
    const dm = this.resolveDiagram(diagram);
    if (!dm) {
      this.setZIndex(this.zIndex + 1);
      return;
    }
    const max = Math.max(0, ...dm.getGroups().map((g) => g.zIndex));
    this.setZIndex(max + 1);
  }

  /** Send this group behind every other group (lowest zIndex - 1). */
  sendToBack(diagram?: DiagramModel): void {
    const dm = this.resolveDiagram(diagram);
    if (!dm) {
      this.setZIndex(this.zIndex - 1);
      return;
    }
    const min = Math.min(0, ...dm.getGroups().map((g) => g.zIndex));
    this.setZIndex(min - 1);
  }

  // ---------------------------------------------------------------------------
  // A — PUSH-DRIVEN LAYOUT
  //
  // `applyLayout` has always been a real layout engine. It was just never CALLED:
  // it was pulled by hand, plus a one-shot on `addMember` behind an opt-IN metadata
  // flag. Resize a container, delete a widget, or grow a child, and nothing
  // reflowed. Everything below turns those three events into pushes, following the
  // precedent already set by `NodeModel.setPosition` (which propagates) and
  // `SwimlaneService.reflow` (the one place that already did this correctly).
  // ---------------------------------------------------------------------------

  /**
   * Re-entrancy guard. The cycle this closes is real and one hop long: layout
   * writes a child's size → the child notifies its containers → the container lays
   * out again → it writes the child's size… Held for the duration of one pass;
   * every push that arrives DURING a pass is dropped, because that pass is already
   * producing the answer the push would ask for.
   */
  private layoutInFlight = false;

  /**
   * Is push-driven reflow active for this container?
   *
   * DEFAULT ON for any group that declares a layout — a container that says
   * "I am a 12-column grid" and then lets its children drift is not a layout
   * container. `metadata('autoLayout')` survives as the explicit override:
   * set it to `false` to freeze the children (useful while dragging, or for a
   * container whose positions are authored by hand). Setting it to `true`
   * remains valid and is now simply the default.
   */
  isAutoLayoutEnabled(): boolean {
    if (this.getMetadata('autoLayout') === false) {
      return false;
    }
    return this.hasLayout();
  }

  /**
   * THE push entry point: "something changed, reflow if you are supposed to."
   * Distinct from {@link applyLayout}, which is the unconditional PULL — an
   * explicit `applyLayout()` still works on an opted-out container.
   */
  requestLayout(diagram?: DiagramModel): void {
    if (!this.isAutoLayoutEnabled()) {
      return;
    }
    this.applyLayout(diagram);
  }

  /**
   * Apply layout to member nodes (Phase 1.7+)
   * Positions child nodes based on flex or grid layout configuration
   */
  applyLayout(diagram?: DiagramModel): void {
    if (!this.hasLayout() || this.layoutInFlight) {
      return;
    }

    // Get diagram from metadata if not provided
    const diagramToUse = diagram || (this.metadata.get('diagram') as DiagramModel);
    if (!diagramToUse) {
      console.warn(`Cannot apply layout to group ${this.id}: diagram not available`);
      return;
    }

    // Get member entities (nodes and groups)
    const entities: Array<NodeModel | GroupModel> = [];
    for (const id of this.members) {
      const node = diagramToUse.getNode(id);
      if (node) {
        entities.push(node);
      } else {
        const group = diagramToUse.getGroup(id);
        if (group) {
          entities.push(group);
        }
      }
    }

    if (entities.length === 0) {
      return;
    }

    this.layoutInFlight = true;
    try {
      if (this.layoutType === 'flexbox') {
        this.applyFlexboxLayout(entities);
      } else if (this.layoutType === 'grid') {
        this.applyGridLayout(entities);
      }
    } finally {
      this.layoutInFlight = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Entity writers — the ONLY places a layout pass touches a child's geometry
  // ---------------------------------------------------------------------------

  /**
   * D — auto-layout SKIPS LOCKED MEMBERS.
   *
   * A locked member keeps both its position and its size, but still consumes its
   * slot in the flow (callers advance the cursor by the child's CURRENT size), so
   * the container never stacks another widget on top of a pinned one. This is the
   * precedent `LayoutManager` already set for graph layouts — it restores locked
   * node positions after every run — and it is what "pin this tile" means to
   * someone building a dashboard.
   */
  private isPinned(entity: NodeModel | GroupModel): boolean {
    return (entity as NodeModel).state?.locked === true;
  }

  /**
   * Move a member. Nodes go through `setPosition` (tracked + propagating);
   * member GROUPS go through `setFrame` when they have a frame, which is what
   * cascades the reflow down into a nested container's own children.
   */
  private placeEntity(entity: NodeModel | GroupModel, x: number, y: number): void {
    if (this.isPinned(entity)) {
      return;
    }
    if ('setPosition' in entity && typeof entity.setPosition === 'function') {
      entity.setPosition(x, y);
      return;
    }
    const group = entity as GroupModel;
    if (group.size) {
      group.setFrame({ x, y, width: group.size.width, height: group.size.height });
      return;
    }
    group.position = { x, y };
    group.requestLayout();
  }

  /**
   * Resize a member along one or both axes. `undefined` leaves that axis alone.
   * Nodes go through `setSize` so the write is tracked and honours the per-node
   * lock; member groups go through `setFrame` so their own children follow.
   */
  private resizeEntity(entity: NodeModel | GroupModel, width?: number, height?: number): void {
    if (this.isPinned(entity) || !entity.size) {
      return;
    }
    const w = width ?? entity.size.width;
    const h = height ?? entity.size.height;
    if (w === entity.size.width && h === entity.size.height) {
      return;
    }
    if ('setSize' in entity && typeof entity.setSize === 'function') {
      (entity as NodeModel).setSize(w, h, entity.size.depth);
      return;
    }
    const group = entity as GroupModel;
    group.setFrame({ x: group.position.x, y: group.position.y, width: w, height: h });
  }

  /**
   * B — the per-item flex config, finally read. `order` is a stable sort key
   * (equal orders keep membership order), exactly like CSS.
   */
  private orderFlexEntities(
    entities: Array<NodeModel | GroupModel>
  ): Array<NodeModel | GroupModel> {
    const anyOrdered = entities.some((e) => this.flexItemOf(e)?.order !== undefined);
    if (!anyOrdered) {
      return entities;
    }
    return entities
      .map((entity, i) => ({ entity, i }))
      .sort((a, b) => {
        const oa = this.flexItemOf(a.entity)?.order ?? 0;
        const ob = this.flexItemOf(b.entity)?.order ?? 0;
        return oa !== ob ? oa - ob : a.i - b.i;
      })
      .map((e) => e.entity);
  }

  /** FlexItemConfig of a member, if it is a node that carries one. */
  private flexItemOf(entity: NodeModel | GroupModel): FlexItemConfig | undefined {
    const node = entity as NodeModel;
    return typeof node.getFlexItem === 'function' ? node.getFlexItem() : undefined;
  }

  /** GridItemConfig of a member, if it is a node that carries one. */
  private gridItemOf(entity: NodeModel | GroupModel): GridItemConfig | undefined {
    const node = entity as NodeModel;
    return typeof node.getGridItem === 'function' ? node.getGridItem() : undefined;
  }

  /**
   * Apply flexbox layout to entities (nodes or groups).
   *
   * B — a real single-pass flex algorithm, written axis-agnostically so `row` and
   * `column` share one code path: line breaking (`wrap`), `flexGrow` distribution,
   * `justifyContent` on the main axis, and `alignItems`/`alignSelf` (including
   * `stretch`) on the cross axis. Previously only `justifyContent: 'center'` and
   * `alignItems: 'center'` existed and `wrap` was unread.
   *
   * The Bootstrap-style `columns` path is untouched and still takes priority for
   * row containers — see {@link applyColumnBasedLayout}.
   */
  private applyFlexboxLayout(entities: Array<NodeModel | GroupModel>): void {
    const config = this.getFlexboxLayout();
    const padding = this.normalizePadding(config.padding);

    const isColumn = config.direction === 'column' || config.direction === 'column-reverse';
    const isReverse = config.direction.endsWith('-reverse');

    // PRESERVED QUIRK: the main-axis gap reads `gap.row` for BOTH directions when
    // gap is an object. Every asserted pixel in the existing specs was produced by
    // that reading; the cross-axis (line) gap is new and picks the correct member.
    const mainGap = typeof config.gap === 'number' ? config.gap : config.gap.row;
    const crossGap =
      typeof config.gap === 'number' ? config.gap : isColumn ? config.gap.column : config.gap.row;

    const ordered = this.orderFlexEntities(entities);
    const directed = isReverse ? ordered.slice().reverse() : ordered;

    const startX = this.position.x + padding.left;
    const startY = this.position.y + padding.top;

    // Bootstrap 12-column path (rows only), unchanged.
    if (!isColumn && config.columns !== undefined && config.columns > 0 && this.size) {
      this.applyColumnBasedLayout(directed, config, padding, startX, startY);
      return;
    }

    const contentWidth = this.size ? this.size.width - padding.left - padding.right : undefined;
    const contentHeight = this.size ? this.size.height - padding.top - padding.bottom : undefined;
    const mainAvail = isColumn ? contentHeight : contentWidth;
    const crossAvail = isColumn ? contentWidth : contentHeight;

    const mainOf = (e: NodeModel | GroupModel): number =>
      (isColumn ? e.size?.height : e.size?.width) ?? (isColumn ? 50 : 100);
    const crossOf = (e: NodeModel | GroupModel): number =>
      (isColumn ? e.size?.width : e.size?.height) ?? (isColumn ? 100 : 50);

    // ---- 1. Line breaking (`wrap`) -----------------------------------------
    // Without a container extent there is no overflow to detect, so an unsized
    // container is always single-line regardless of `wrap` — which is exactly the
    // behaviour every pre-existing spec was written against.
    const wraps = config.wrap !== 'nowrap' && mainAvail !== undefined;
    const lines: Array<Array<NodeModel | GroupModel>> = [];
    if (!wraps) {
      lines.push(directed);
    } else {
      let line: Array<NodeModel | GroupModel> = [];
      let used = 0;
      for (const entity of directed) {
        const size = mainOf(entity);
        const next = line.length === 0 ? size : used + mainGap + size;
        if (line.length > 0 && next > mainAvail!) {
          lines.push(line);
          line = [entity];
          used = size;
        } else {
          line.push(entity);
          used = next;
        }
      }
      if (line.length > 0) {
        lines.push(line);
      }
    }
    if (config.wrap === 'wrap-reverse') {
      lines.reverse();
    }

    // ---- 2. Per-line: grow, justify, align ----------------------------------
    let crossCursor = isColumn ? startX : startY;

    for (const line of lines) {
      // flexGrow — distribute leftover main-axis space by factor.
      if (mainAvail !== undefined) {
        const totalGrow = line.reduce((s, e) => s + (this.flexItemOf(e)?.flexGrow ?? 0), 0);
        if (totalGrow > 0) {
          const used =
            line.reduce((s, e) => s + mainOf(e), 0) + mainGap * Math.max(0, line.length - 1);
          const free = mainAvail - used;
          if (free > 0) {
            for (const entity of line) {
              const grow = this.flexItemOf(entity)?.flexGrow ?? 0;
              if (grow <= 0) continue;
              const target = mainOf(entity) + (free * grow) / totalGrow;
              this.resizeEntity(
                entity,
                isColumn ? undefined : target,
                isColumn ? target : undefined
              );
            }
          }
        }
      }

      // The line's cross extent. A SINGLE line in a sized container fills the
      // container's content box (that is what makes `center`/`end`/`stretch`
      // measure against the container, as the legacy centering code did); wrapped
      // lines measure against their own tallest item, as CSS does.
      const lineCross =
        lines.length === 1 && crossAvail !== undefined
          ? crossAvail
          : line.reduce((m, e) => Math.max(m, crossOf(e)), 0);

      // justifyContent — main-axis offset + inter-item spacing.
      const usedMain =
        line.reduce((s, e) => s + mainOf(e), 0) + mainGap * Math.max(0, line.length - 1);
      const free = mainAvail !== undefined ? mainAvail - usedMain : 0;
      const { offset, spacing } = this.resolveJustify(
        config.justifyContent,
        mainAvail !== undefined ? free : 0,
        line.length
      );

      let mainCursor = (isColumn ? startY : startX) + offset;

      for (const entity of line) {
        const align = this.flexItemOf(entity)?.alignSelf;
        const effectiveAlign =
          align === undefined || align === 'auto' ? config.alignItems : align;

        if (effectiveAlign === 'stretch') {
          this.resizeEntity(
            entity,
            isColumn ? lineCross : undefined,
            isColumn ? undefined : lineCross
          );
        }

        const crossOffset = this.resolveAlign(effectiveAlign, lineCross, crossOf(entity));
        const cross = crossCursor + crossOffset;

        this.placeEntity(
          entity,
          isColumn ? cross : mainCursor,
          isColumn ? mainCursor : cross
        );

        mainCursor += mainOf(entity) + mainGap + spacing;
      }

      crossCursor += lineCross + crossGap;
    }
  }

  /**
   * Main-axis distribution for one flex line: how far the first item is pushed in,
   * and how much EXTRA space goes between consecutive items (on top of `gap`).
   * `start` (and anything unrecognised) is the identity, so a container with no
   * size — where `free` is passed as 0 — always lays out from the content origin.
   */
  private resolveJustify(
    justify: FlexboxLayoutConfig['justifyContent'],
    free: number,
    count: number
  ): { offset: number; spacing: number } {
    if (free <= 0 || count === 0) {
      return { offset: 0, spacing: 0 };
    }
    switch (justify) {
      case 'center':
        return { offset: free / 2, spacing: 0 };
      case 'end':
        return { offset: free, spacing: 0 };
      case 'space-between':
        return count === 1
          ? { offset: 0, spacing: 0 }
          : { offset: 0, spacing: free / (count - 1) };
      case 'space-around': {
        const unit = free / count;
        return { offset: unit / 2, spacing: unit };
      }
      case 'space-evenly': {
        const unit = free / (count + 1);
        return { offset: unit, spacing: unit };
      }
      default:
        return { offset: 0, spacing: 0 };
    }
  }

  /**
   * Cross-axis offset of one item inside its line. `stretch` has already resized
   * the item by the time this runs, so it lands at the line start like `start`.
   * `baseline` degrades to `start`: this model has no text baselines to align to,
   * and quietly inventing one would be worse than saying so.
   */
  private resolveAlign(
    align: FlexboxLayoutConfig['alignItems'] | 'auto',
    lineCross: number,
    itemCross: number
  ): number {
    switch (align) {
      case 'center':
        return (lineCross - itemCross) / 2;
      case 'end':
        return lineCross - itemCross;
      default:
        return 0;
    }
  }

  /**
   * Apply column-based layout (like Bootstrap 12-column grid)
   */
  private applyColumnBasedLayout(
    entities: Array<NodeModel | GroupModel>,
    config: FlexboxLayoutConfig,
    padding: { top: number; right: number; bottom: number; left: number },
    startX: number,
    startY: number
  ): void {
    if (!this.size || !config.columns) return;

    const totalColumns = config.columns;
    const gap = typeof config.gap === 'number' ? config.gap : config.gap.column || 0;

    // Available width for content (excluding padding)
    const availableWidth = this.size.width - padding.left - padding.right;

    // Calculate column width (including gaps)
    const totalGaps = (totalColumns - 1) * gap;
    const columnWidth = (availableWidth - totalGaps) / totalColumns;

    let currentX = startX;
    let currentY = startY;
    let currentColumn = 0;
    let currentRowHeight = 0; // Track max height in current row
    const rowEntities: Array<NodeModel | GroupModel> = []; // Track entities in current row

    for (const entity of entities) {
      // Get column span from metadata (default = 1)
      const columnSpan = entity.getMetadata('columnSpan') as number || 1;
      const clampedSpan = Math.min(columnSpan, totalColumns);

      // Check if entity fits in current row
      if (currentColumn + clampedSpan > totalColumns) {
        // Move to next row
        currentColumn = 0;
        currentX = startX;
        currentY += currentRowHeight + gap;
        currentRowHeight = 0;
        rowEntities.length = 0; // Clear row entities
      }

      // Calculate entity width based on column span
      const entityWidth = columnWidth * clampedSpan + gap * (clampedSpan - 1);

      // Update entity size to match column width. Routed through resizeEntity /
      // placeEntity so the write is tracked, honours the per-node lock (D), and
      // cascades into a member group's own children (A).
      this.resizeEntity(entity, entityWidth);
      this.placeEntity(entity, currentX, currentY);

      // Track row height (max height in this row). A PINNED member keeps its own
      // size, so the cursor advances by what it actually occupies.
      const occupiedWidth = this.isPinned(entity) ? entity.size?.width ?? entityWidth : entityWidth;
      const entityHeight = entity.size?.height || 100;
      currentRowHeight = Math.max(currentRowHeight, entityHeight);
      rowEntities.push(entity);

      // Move to next column position
      currentX += occupiedWidth + gap;
      currentColumn += clampedSpan;
    }
  }

  /**
   * Apply grid layout to entities (nodes or groups).
   *
   * B — placement now comes from each item's {@link GridItemConfig} (explicit
   * `columnStart`/`rowStart` lines and `columnEnd`/`rowEnd` spans), not from the
   * member's ARRAY INDEX. Items with no explicit placement auto-flow into the
   * first cell no explicit item has claimed, in `autoFlow` order. Tracks are
   * uniform: derived from the container's content box when it has one, and from
   * the widest/tallest member otherwise (which is what the old per-entity
   * arithmetic already produced for the equal-sized children it was written for).
   */
  private applyGridLayout(entities: Array<NodeModel | GroupModel>): void {
    const config = this.getGridLayout();

    const columns = Math.max(1, this.parseGridColumns(config.templateColumns));
    const columnGap = config.columnGap || 0;
    const rowGap = config.rowGap || 0;
    const padding = this.normalizePadding(config.padding);

    const startX = this.position.x + padding.left;
    const startY = this.position.y + padding.top;

    // `templateRows` bounds a column-flow grid's row axis (CSS: column flow grows
    // COLUMNS, so the rows have to be finite). With none declared, fall back to
    // "as many rows as there are members", which can never force a wrap.
    const templateRowCount = config.templateRows ? this.parseGridColumns(config.templateRows) : 0;
    const rowLimit = templateRowCount > 0 ? templateRowCount : Math.max(1, entities.length);

    const placements = this.resolveGridPlacements(entities, columns, config.autoFlow, rowLimit);

    // Track sizes.
    const rowCount = placements.reduce((m, p) => Math.max(m, p.row + p.rowSpan), 1);
    const contentWidth = this.size ? this.size.width - padding.left - padding.right : undefined;
    const contentHeight = this.size ? this.size.height - padding.top - padding.bottom : undefined;

    const rowTracks = Math.max(rowCount, templateRowCount || 0, 1);

    const columnWidth =
      contentWidth !== undefined
        ? (contentWidth - columnGap * (columns - 1)) / columns
        : entities.reduce((m, e) => Math.max(m, e.size?.width ?? 0), 0) || 100;
    const rowHeight =
      contentHeight !== undefined
        ? (contentHeight - rowGap * (rowTracks - 1)) / rowTracks
        : entities.reduce((m, e) => Math.max(m, e.size?.height ?? 0), 0) || 100;

    for (const { entity, row, column, rowSpan, columnSpan } of placements) {
      const x = startX + column * (columnWidth + columnGap);
      const y = startY + row * (rowHeight + rowGap);

      // Cell-filling is OPT-IN. CSS defaults `justify-items`/`align-items` to
      // stretch, but this engine's grid never resized anything, and silently
      // starting to would re-geometry every existing grid container. Ask for it.
      const item = this.gridItemOf(entity);
      const justify = item?.justifySelf ?? config.justifyItems;
      const alignSelf = item?.alignSelf ?? config.alignItems;
      const stretchW = justify === 'stretch';
      const stretchH = alignSelf === 'stretch';
      if (stretchW || stretchH) {
        this.resizeEntity(
          entity,
          stretchW ? columnWidth * columnSpan + columnGap * (columnSpan - 1) : undefined,
          stretchH ? rowHeight * rowSpan + rowGap * (rowSpan - 1) : undefined
        );
      }

      this.placeEntity(entity, x, y);
    }
  }

  /**
   * Resolve every member to a 0-based grid cell + span.
   *
   * Two passes, because explicit placement must WIN: pass 1 reserves the cells
   * claimed by items with a `GridItemConfig` line (or a `gridColumn`/`gridRow`
   * metadata fallback); pass 2 flows the rest into the first cell still free.
   * Without the reservation an auto item would happily land under a pinned one —
   * which is precisely the bug "placement by array index" always had.
   */
  private resolveGridPlacements(
    entities: Array<NodeModel | GroupModel>,
    columns: number,
    autoFlow: GridLayoutConfig['autoFlow'],
    rowLimit: number
  ): Array<{
    entity: NodeModel | GroupModel;
    row: number;
    column: number;
    rowSpan: number;
    columnSpan: number;
  }> {
    type Placement = {
      entity: NodeModel | GroupModel;
      row: number;
      column: number;
      rowSpan: number;
      columnSpan: number;
    };

    const occupied = new Set<string>();
    const key = (r: number, c: number): string => `${r}:${c}`;
    const occupy = (p: Placement): void => {
      for (let r = p.row; r < p.row + p.rowSpan; r++) {
        for (let c = p.column; c < p.column + p.columnSpan; c++) {
          occupied.add(key(r, c));
        }
      }
    };
    const fits = (row: number, column: number, rowSpan: number, columnSpan: number): boolean => {
      if (column + columnSpan > columns) return false;
      for (let r = row; r < row + rowSpan; r++) {
        for (let c = column; c < column + columnSpan; c++) {
          if (occupied.has(key(r, c))) return false;
        }
      }
      return true;
    };

    const line = (v: number | 'auto' | undefined): number | undefined =>
      typeof v === 'number' && v >= 1 ? v - 1 : undefined; // CSS lines are 1-based

    const specs = entities.map((entity) => {
      const item = this.gridItemOf(entity);
      const column = line(item?.columnStart) ?? line(entity.getMetadata('gridColumn') as number);
      const row = line(item?.rowStart) ?? line(entity.getMetadata('gridRow') as number);

      // Span: the CSS end-line form first, then the `columnSpan`/`rowSpan`
      // metadata the Bootstrap path already uses (kept working on purpose).
      const endCol = line(item?.columnEnd);
      const endRow = line(item?.rowEnd);
      const columnSpan = Math.max(
        1,
        Math.min(
          columns,
          endCol !== undefined && column !== undefined
            ? endCol - column
            : (entity.getMetadata('columnSpan') as number) || 1
        )
      );
      const rowSpan = Math.max(
        1,
        endRow !== undefined && row !== undefined
          ? endRow - row
          : (entity.getMetadata('rowSpan') as number) || 1
      );
      return { entity, row, column, rowSpan, columnSpan };
    });

    const placements: Placement[] = [];

    // Pass 1 — explicit placements reserve their cells.
    for (const spec of specs) {
      if (spec.row === undefined || spec.column === undefined) continue;
      const p: Placement = {
        entity: spec.entity,
        row: spec.row,
        column: Math.min(spec.column, Math.max(0, columns - spec.columnSpan)),
        rowSpan: spec.rowSpan,
        columnSpan: spec.columnSpan,
      };
      occupy(p);
      placements.push(p);
    }

    // Pass 2 — auto-flow the rest into the first cell pass 1 left free.
    //
    // `row` flow scans row-major (across, then down); `column` flow scans
    // column-major (down `rowLimit` rows, then across). The row axis is
    // unbounded in row flow, so the scan is capped rather than trusted.
    const columnFirst = autoFlow === 'column';
    const maxScan = (entities.length + 2) * (columns + 2);

    for (const spec of specs) {
      if (spec.row !== undefined && spec.column !== undefined) continue;

      let row = spec.row ?? 0;
      let column = spec.column ?? 0;

      if (spec.column !== undefined) {
        // Column pinned by the author: walk DOWN that column for a free row.
        while (!fits(row, column, spec.rowSpan, spec.columnSpan) && row < maxScan) row++;
      } else if (spec.row !== undefined) {
        // Row pinned: walk ACROSS that row.
        while (!fits(row, column, spec.rowSpan, spec.columnSpan) && column < columns) column++;
        if (column >= columns) column = 0;
      } else if (columnFirst) {
        let scanned = 0;
        while (!fits(row, column, spec.rowSpan, spec.columnSpan) && scanned++ < maxScan) {
          row++;
          if (row + spec.rowSpan > rowLimit) {
            row = 0;
            column++;
          }
        }
      } else {
        let scanned = 0;
        while (!fits(row, column, spec.rowSpan, spec.columnSpan) && scanned++ < maxScan) {
          column++;
          if (column + spec.columnSpan > columns) {
            column = 0;
            row++;
          }
        }
      }

      const p: Placement = {
        entity: spec.entity,
        row,
        column: Math.min(column, Math.max(0, columns - spec.columnSpan)),
        rowSpan: spec.rowSpan,
        columnSpan: spec.columnSpan,
      };
      occupy(p);
      placements.push(p);
    }

    return placements;
  }

  /**
   * Normalize padding to all four sides
   */
  private normalizePadding(
    padding: number | { top: number; right: number; bottom: number; left: number } | undefined
  ): { top: number; right: number; bottom: number; left: number } {
    if (padding === undefined) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    if (typeof padding === 'number') {
      return { top: padding, right: padding, bottom: padding, left: padding };
    }
    return padding;
  }

  /**
   * Parse grid template columns to get column count
   */
  private parseGridColumns(templateColumns: string): number {
    // Simple parser - count space-separated values
    // Example: "1fr 1fr 1fr" = 3 columns, "repeat(3, 1fr)" = 3 columns
    const repeatMatch = templateColumns.match(/repeat\((\d+),/);
    if (repeatMatch) {
      return parseInt(repeatMatch[1], 10);
    }
    return templateColumns.split(' ').length;
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedGroup {
    // The 'diagram' metadata key is RUNTIME wiring (a live DiagramModel
    // back-reference stashed by DiagramModel.addGroup/installGroup). It must
    // never reach the payload: serializing it embeds the entire live model
    // into the JSON (circular reference — JSON.stringify throws). The install
    // path re-stashes it on load.
    const metadata = Object.fromEntries(
      Array.from(this.metadata).filter(([key]) => key !== 'diagram')
    );
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'group',
      version: this.version,
      metadata,
      name: this.name,
      members: Array.from(this.members),
      isCollapsed: this.isCollapsed,
      bounds: this.bounds,
      layoutType: this.layoutType, // Phase 1.7
      layoutConfig: this.layoutConfig, // Phase 1.7
      // Group geometry: round-trip position (always present) and size (optional)
      // so layout/placement survives save/load.
      position: { x: this.position.x, y: this.position.y },
      size: this.size
        ? { width: this.size.width, height: this.size.height, depth: this.size.depth }
        : undefined,
      // Wave-2: containment tree pointer (undefined for top-level groups).
      parentGroupId: this.parentGroupId,
      // Wave-5 Card 3: padding is RESOLVED at save time — a document must mean
      // what it meant, so an authored group pins today's default into the file
      // (a future default change can never re-geometry it). headerHeight 0 is
      // still omitted: loaders pin the absent key back to 0, which keeps legacy
      // documents byte-stable through load→save.
      padding: this.padding ?? DEFAULT_GROUP_PADDING,
      headerHeight: this.headerHeight !== 0 ? this.headerHeight : undefined,
      zIndex: this.zIndex !== 0 ? this.zIndex : undefined,
      fitMode: this.fitMode !== 'exact' ? this.fitMode : undefined,
      constrainChildren: this.constrainChildren ? true : undefined,
      // Wave-5 Card 4: present only while collapsed.
      collapsedState: this.collapsedState,
      // Wave-5 Card 5: per-group compound-layout intent (present only when set).
      subgraphLayout: this.subgraphLayout,
      // Wave-5 Card 6: swimlane/pool band config (present only on pools & lanes).
      laneConfig: this.laneConfig,
      // Wave-5 Card 7: declarative auto-membership rule + capacity/WIP limit.
      membershipRule: this.membershipRule,
      capacity: this.capacity,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedGroup): GroupModel {
    const group = new GroupModel({ id: data.id, name: data.name });
    group.members = new Set(data.members);
    group.isCollapsed = data.isCollapsed;
    group.bounds = data.bounds;

    // Wave-2: restore containment tree pointer.
    if (data.parentGroupId !== undefined) {
      group.parentGroupId = data.parentGroupId;
    }

    // Restore group geometry (position/size). Position defaults to origin when
    // absent so older serialized payloads keep working.
    if (data.position) {
      group.position = { x: data.position.x, y: data.position.y };
    }
    if (data.size) {
      group.size = {
        width: data.size.width,
        height: data.size.height,
        depth: data.size.depth,
      };
    }

    // Phase 1.7: Restore layout configuration
    if (data.layoutType) {
      group.layoutType = data.layoutType;
    }
    if (data.layoutConfig) {
      group.layoutConfig = data.layoutConfig;
    }

    // Wave-5 Card 3: restore subflow geometry. Absent keys PIN TO 0 — they were
    // written by an engine whose values were 0, and a loaded document must mean
    // what it meant when saved. Leaving padding `undefined` here would let
    // getPadding() resolve it to the authored default and silently re-geometry
    // every legacy fit.
    group.padding = data.padding ?? 0;
    group.headerHeight = typeof data.headerHeight === 'number' ? data.headerHeight : 0;
    if (typeof data.zIndex === 'number') {
      group.zIndex = data.zIndex;
    }
    if (data.fitMode) {
      group.fitMode = data.fitMode;
    }
    if (data.constrainChildren !== undefined) {
      group.constrainChildren = data.constrainChildren;
    }

    // Wave-5 Card 4: restore collapse snapshot (only present while collapsed).
    if (data.collapsedState) {
      group.collapsedState = data.collapsedState;
    }

    // Wave-5 Card 5: restore per-group compound-layout intent.
    if (data.subgraphLayout) {
      group.subgraphLayout = data.subgraphLayout;
    }

    // Wave-5 Card 6: restore swimlane/pool band config.
    if (data.laneConfig) {
      group.laneConfig = data.laneConfig;
    }

    // Wave-5 Card 7: restore declarative membership rule + capacity/WIP limit.
    if (data.membershipRule) {
      group.membershipRule = data.membershipRule;
    }
    if (typeof data.capacity === 'number') {
      group.capacity = data.capacity;
    }

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      group.metadata.set(key, value);
    }

    // Last: restore persisted identity (uuid) and mutation counter (version).
    group.restoreIdentity(data);

    return group;
  }
}
