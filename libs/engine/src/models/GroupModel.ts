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
  padding?: GroupPadding;
  headerHeight = 0;
  zIndex = 0;
  fitMode: GroupFitMode = 'exact';
  constrainChildren = false;

  // Wave-5 Card 4: reversible collapse snapshot (see CollapsedState). Set while
  // collapsed, cleared on expand. Serialized so a collapsed diagram survives
  // save/load and can still be expanded.
  collapsedState?: CollapsedState;

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

    // Per-group membership predicate.
    if (this.memberValidation && !this.memberValidation(candidateId, this)) {
      return false;
    }

    return true;
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

    // Auto-apply layout if enabled
    if (this.getMetadata('autoLayout') === true) {
      this.applyLayout();
    }
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

  /** Resolve {@link padding} to a full four-sided rectangle (defaults to 0). */
  getPadding(): { top: number; right: number; bottom: number; left: number } {
    const p = this.padding;
    if (p === undefined) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
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

  /**
   * Apply layout to member nodes (Phase 1.7+)
   * Positions child nodes based on flex or grid layout configuration
   */
  applyLayout(diagram?: DiagramModel): void {
    if (!this.hasLayout()) {
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

    // Apply layout based on type
    if (this.layoutType === 'flexbox') {
      this.applyFlexboxLayout(entities);
    } else if (this.layoutType === 'grid') {
      this.applyGridLayout(entities);
    }
  }

  /**
   * Apply flexbox layout to entities (nodes or groups)
   */
  private applyFlexboxLayout(entities: Array<NodeModel | GroupModel>): void {
    const config = this.getFlexboxLayout();

    // Get padding values
    const padding = this.normalizePadding(config.padding);

    // Calculate starting position
    let currentX = this.position.x + padding.left;
    let currentY = this.position.y + padding.top;

    // Get gap value
    const gap = typeof config.gap === 'number' ? config.gap : config.gap.row;

    if (config.direction === 'column' || config.direction === 'column-reverse') {
      // Vertical stacking
      const orderedEntities = config.direction === 'column-reverse' ? entities.slice().reverse() : entities;

      for (const entity of orderedEntities) {
        if ('setPosition' in entity && typeof entity.setPosition === 'function') {
          entity.setPosition(currentX, currentY);
        } else {
          // GroupModel
          entity.position = { x: currentX, y: currentY };
        }
        const entityHeight = entity.size?.height || 50;
        currentY += entityHeight + gap;
      }
    } else {
      // Horizontal stacking (row or row-reverse)
      const orderedEntities = config.direction === 'row-reverse' ? entities.slice().reverse() : entities;

      // Check if using column-based layout (like Bootstrap grid)
      const useColumnLayout = config.columns !== undefined && config.columns > 0 && this.size;

      if (useColumnLayout && this.size) {
        // Column-based layout (e.g., 12-column grid)
        this.applyColumnBasedLayout(orderedEntities, config, padding, currentX, currentY);
      } else {
        // Standard flexbox layout
        // Handle justifyContent for horizontal centering
        if (config.justifyContent === 'center' && this.size) {
          const totalWidth = this.calculateTotalWidth(orderedEntities, gap);
          currentX = this.position.x + (this.size.width - totalWidth) / 2;
        }

        for (const entity of orderedEntities) {
          // Handle alignItems for vertical centering
          let entityY = currentY;
          if (config.alignItems === 'center' && this.size) {
            const entityHeight = entity.size?.height || 50;
            entityY = this.position.y + (this.size.height - entityHeight) / 2;
          }

          if ('setPosition' in entity && typeof entity.setPosition === 'function') {
            entity.setPosition(currentX, entityY);
          } else {
            // GroupModel
            entity.position = { x: currentX, y: entityY };
          }
          const entityWidth = entity.size?.width || 100;
          currentX += entityWidth + gap;
        }
      }
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

      // Update entity size to match column width
      if (entity.size) {
        entity.size.width = entityWidth;
      }

      // Position entity
      if ('setPosition' in entity && typeof entity.setPosition === 'function') {
        entity.setPosition(currentX, currentY);
      } else {
        // GroupModel
        entity.position = { x: currentX, y: currentY };
      }

      // Track row height (max height in this row)
      const entityHeight = entity.size?.height || 100;
      currentRowHeight = Math.max(currentRowHeight, entityHeight);
      rowEntities.push(entity);

      // Move to next column position
      currentX += entityWidth + gap;
      currentColumn += clampedSpan;
    }
  }

  /**
   * Apply grid layout to entities (nodes or groups)
   */
  private applyGridLayout(entities: Array<NodeModel | GroupModel>): void {
    const config = this.getGridLayout();

    // Parse template columns to get column count
    const columns = this.parseGridColumns(config.templateColumns);

    // Get gaps
    const columnGap = config.columnGap || 0;
    const rowGap = config.rowGap || 0;

    // Get padding
    const padding = this.normalizePadding(config.padding);

    // Starting position
    const startX = this.position.x + padding.left;
    const startY = this.position.y + padding.top;

    // Position entities in grid
    entities.forEach((entity, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;

      const entityWidth = entity.size?.width || 100;
      const entityHeight = entity.size?.height || 100;

      const x = startX + col * (entityWidth + columnGap);
      const y = startY + row * (entityHeight + rowGap);

      if ('setPosition' in entity && typeof entity.setPosition === 'function') {
        entity.setPosition(x, y);
      } else {
        // GroupModel
        entity.position = { x, y };
      }
    });
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
   * Calculate total width of entities for centering
   */
  private calculateTotalWidth(entities: Array<NodeModel | GroupModel>, gap: number): number {
    let total = 0;
    for (let i = 0; i < entities.length; i++) {
      total += entities[i].size?.width || 100;
      if (i < entities.length - 1) {
        total += gap;
      }
    }
    return total;
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
      // Wave-5 Card 3: only emit non-default subflow geometry so groups that
      // never touch it round-trip byte-for-byte identical to before.
      padding: this.padding,
      headerHeight: this.headerHeight !== 0 ? this.headerHeight : undefined,
      zIndex: this.zIndex !== 0 ? this.zIndex : undefined,
      fitMode: this.fitMode !== 'exact' ? this.fitMode : undefined,
      constrainChildren: this.constrainChildren ? true : undefined,
      // Wave-5 Card 4: present only while collapsed.
      collapsedState: this.collapsedState,
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

    // Wave-5 Card 3: restore subflow geometry (defaults preserved when absent).
    if (data.padding !== undefined) {
      group.padding = data.padding;
    }
    if (typeof data.headerHeight === 'number') {
      group.headerHeight = data.headerHeight;
    }
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

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      group.metadata.set(key, value);
    }

    // Last: restore persisted identity (uuid) and mutation counter (version).
    group.restoreIdentity(data);

    return group;
  }
}
