// CompoundLayoutService — Wave-5 Card 5, rebuilt for Wave-7 Card 4 (nested
// container / subgraph layout).
//
// ---------------------------------------------------------------------------
// WHAT WAVE 5 SHIPPED, AND WHAT IT DID NOT (the audit)
// ---------------------------------------------------------------------------
//
// Wave 5 built the bottom-up skeleton and it was sound: deepest-first, each
// group's direct nodes + child-group unit boxes arranged by its own algorithm,
// child groups translated as whole subtrees, parents fitted around them. It was
// also verified against the real dagre adapter. All of that survives.
//
// But it was NEVER CALLED. Not by the engine, not by a command, not by the
// renderer — only by its own spec (`grep -rn CompoundLayoutService libs apps`
// returned the file, the spec, and an `export *`). So the nested-layout stack
// was dead for the SECOND time: wave 5 found `SubgraphLayoutManager` dead
// because nothing built `GroupInfo.memberNodeIds`, built this service as the
// bridge — and then nothing called the bridge either. Card 4 wires it to
// `engine.layout()`, which is now the only entry point that exists.
//
// Four things were genuinely missing, and each is a visible bug:
//
//   1. CROSS-CONTAINER EDGES WERE INVISIBLE AT THE ROOT. `layoutTopLevel()`
//      called `adapter.apply(units, [], {})` — an empty link array. Containers
//      at the top level were therefore arranged with ZERO knowledge of the
//      edges between them: A→B and A↛B produced the same picture, and the
//      cross edge flapped across the diagram. This is precisely the sub-flow
//      failure React Flow is known for. Per-group levels DID induce edges
//      (`buildUnitLinks`), so the machinery existed — the root just never used
//      it. Both levels now go through ONE `arrangeLevel()`; see INDUCED EDGES.
//
//   2. A COLLAPSED GROUP WAS TREATED AS A CONTAINER. Collapse hides members but
//      leaves them in `group.members`, so layout re-arranged the hidden nodes
//      and `fitToContents` then re-inflated the placeholder frame back to full
//      size — one layout pass silently un-collapsed every collapsed group. A
//      collapsed group is a LEAF (the routing track already treats it as one
//      solid obstacle); it is now placed, never entered.
//
//   3. THE COLLAPSE PROXY NODE WAS ORPHANED. On collapse, wave 5 re-homes every
//      boundary-crossing edge onto a proxy placeholder node. `buildUnitLinks`
//      could not resolve that proxy to any unit, so a collapsed container
//      contributed NO edges at all — and `translateSubtree` did not move the
//      proxy either, so placing a collapsed container left its only visible box
//      behind at the old coordinates. One fix closes both: a group's subtree now
//      includes the proxy nodes of the collapsed groups within it.
//
//   4. `fixed` GROUPS COULD BE OVERLAPPED. Wave 5's honest scope-down: a fixed
//      group was excluded from the unit set entirely, so the parent arranged the
//      other units straight through it. Fixed groups are now real units in the
//      layout input (their edges count) and are pinned afterwards, with a
//      guaranteed-terminating separation pass. See FIXED CONTAINERS.
//
// And one that would have poisoned everything: the level's unit order came from
// `group.members` (a Set — insertion order) and `diagram.getLinks()` (unsorted),
// so the same graph built in a different order laid out differently. Card 0
// established canonical input ordering for exactly this reason; the compound
// path now obeys it at every depth.
//
// ---------------------------------------------------------------------------
// INDUCED EDGES — the crux of the card
// ---------------------------------------------------------------------------
//
// An edge from a node inside container A to a node inside container B must be
// seen by the layout that positions A and B — i.e. at their LOWEST COMMON
// ANCESTOR, and nowhere else. So at every level we project each real edge onto
// the units of THAT level:
//
//   resolveUnit(level, nodeId) =
//     nodeId                        if it is a direct node member of the level
//     the child container of the level whose SUBTREE contains it   (any depth)
//     undefined                     if it is outside the level entirely
//
// An edge is induced onto the level iff both ends resolve to units and the units
// DIFFER. Consequences, all of them the behaviour we want:
//
//   • a→b inside one container       → both ends resolve to that container, so it
//                                      is dropped at the parent (su === tu) and
//                                      handled INSIDE the container. Right.
//   • deep-A → deep-B, siblings      → induced A→B at the parent. The containers
//                                      land next to each other. Right.
//   • deep-A → loose root node       → drops out of A's own level (the far end is
//                                      not a unit of A) and reappears at the root,
//                                      where A is a unit and the loose node is a
//                                      unit. Induced exactly once, at the LCA.
//   • depth is irrelevant            → `subtreeNodeIds` recurses, so an edge from
//                                      depth 4 induces onto the depth-1 container.
//
// Parallel edges between the same unit pair collapse to one induced edge (dagre
// would rank the pair identically anyway); direction is preserved, so A→B and
// B→A stay distinct and the flow direction survives.

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import type { LayoutAdapter, LayoutResult } from './layout-adapter.interface';
import type { GroupInfo } from './subgraph-layout.interface';
import type { UnifiedLayoutOptions } from './layout-registry';
import { translateOptions } from './layout-registry';

/**
 * Any registered layout name, or the built-in grid. Wave 5 hard-coded
 * `'dagre' | 'elk'`; nested layout now resolves whatever the registry knows
 * (force, spectral, community, or an extension-registered engine).
 */
export type CompoundAlgorithm = 'grid' | 'dagre' | 'elk' | (string & {});

export interface CompoundLayoutOptions {
  /** Default algorithm for groups without an explicit / 'inherit' choice. */
  defaultAlgorithm?: CompoundAlgorithm;
  /** Injected adapters used as black boxes, keyed by name. Unknown → grid. */
  adapters?: Record<string, LayoutAdapter | undefined>;
  /** Fallback padding for groups without their own (Card 3) padding. */
  defaultPadding?: number;
  /** Gap between units in the built-in grid. */
  gridGap?: number;
  /** Also arrange the top level (root groups + ungrouped nodes). Default false. */
  layoutTopLevel?: boolean;
  /**
   * Base options in the ONE unified vocabulary (direction / nodeSpacing /
   * rankSpacing / seed), translated per level into whatever that level's engine
   * calls them. Per-group `layoutOptions` are merged OVER these.
   */
  layoutOptions?: UnifiedLayoutOptions;
  /**
   * Per-group overrides keyed by group id — honors the GroupInfo contract for
   * callers that don't want to store config on the GroupModel. Merged over the
   * group's own `subgraphLayout`.
   */
  groupOverrides?: Record<string, Partial<GroupInfo>>;
}

export interface CompoundLayoutResult {
  /** Groups laid out, in the order processed (deepest first). */
  laidOut: string[];
  /** Groups skipped: fixed, collapsed, or inside a collapsed container. */
  skipped: string[];
  /** Groups skipped specifically because they are collapsed (a leaf, not a container). */
  collapsed: string[];
  /** group id → final outer bounds. */
  groupBounds: Map<string, Rect>;
  /** Final node positions — the LayoutResult contract, so the registry can commit. */
  nodePositions: Map<string, { x: number; y: number }>;
  /** Bounding box of everything laid out. */
  bounds: Rect;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One level of the hierarchy: a container's interior, or the root. */
interface Level {
  /** The container whose interior this is; null = the top level. */
  readonly group: GroupModel | null;
  /** Direct node members (real nodes placed at this level). */
  readonly memberNodes: NodeModel[];
  /** Child containers that this level places. */
  readonly movableChildren: GroupModel[];
  /** Child containers pinned in place — placed by nobody, avoided by everybody. */
  readonly fixedChildren: GroupModel[];
}

/** Ids sort ascending — canonical input order, at every depth (Card 0). */
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export class CompoundLayoutService {
  constructor(
    private readonly diagram: DiagramModel,
    private readonly options: CompoundLayoutOptions = {}
  ) {}

  /** Run the compound layout over the whole diagram. */
  async layout(): Promise<CompoundLayoutResult> {
    const result: CompoundLayoutResult = {
      laidOut: [],
      skipped: [],
      collapsed: [],
      groupBounds: new Map(),
      nodePositions: new Map(),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    };

    // Deepest-first: a parent is laid out only after its children are fitted.
    // Sorted by id FIRST so that ties in depth resolve identically no matter
    // what order the groups were added in (Array.prototype.sort is stable).
    const groups = this.diagram
      .getGroups()
      .slice()
      .sort(byId)
      .sort((a, b) => this.diagram.getDepth(b.id) - this.diagram.getDepth(a.id));

    for (const group of groups) {
      // Inside a collapsed container: everything here is hidden and its geometry
      // is owned by the collapse snapshot, which expand() restores verbatim.
      // Laying it out would be work nobody can see, on coordinates that get
      // overwritten. Don't enter a collapsed container.
      if (this.hasCollapsedAncestor(group)) {
        result.skipped.push(group.id);
        result.groupBounds.set(group.id, group.getOuterBounds());
        continue;
      }

      // A collapsed group is a LEAF. It gets PLACED by its parent (its unit box
      // is the placeholder), but never entered and never re-fitted — fitting it
      // would inflate the placeholder back around the hidden members and undo
      // the collapse.
      if (group.isCollapsed) {
        result.collapsed.push(group.id);
        result.skipped.push(group.id);
        result.groupBounds.set(group.id, group.getOuterBounds());
        continue;
      }

      if (this.isFixed(group)) {
        result.skipped.push(group.id);
        // A fixed group is still fitted so parents see a correct box, unless it
        // already has an explicit frame.
        if (!group.size) {
          this.applyDefaultPadding(group);
          group.fitToContents(this.diagram);
        }
        result.groupBounds.set(group.id, group.getOuterBounds());
        continue;
      }

      await this.arrangeLevel(this.buildLevel(group));
      this.applyDefaultPadding(group);
      group.fitToContents(this.diagram);
      result.laidOut.push(group.id);
      result.groupBounds.set(group.id, group.getOuterBounds());
    }

    if (this.options.layoutTopLevel) {
      await this.arrangeLevel(this.buildLevel(null));
      // Root containers moved, so refresh the bounds we report for them.
      for (const group of groups) {
        result.groupBounds.set(group.id, group.getOuterBounds());
      }
    }

    this.collectResult(result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // One level — used for a container's interior AND for the root. Wave 5 had two
  // near-copies of this, and the root copy is the one that forgot the edges.
  // ---------------------------------------------------------------------------

  /** Gather the units of a level, in canonical order. */
  private buildLevel(group: GroupModel | null): Level {
    const memberNodes: NodeModel[] = [];
    const childGroups: GroupModel[] = [];

    if (group) {
      for (const id of group.members) {
        const node = this.diagram.getNode(id);
        if (node) {
          memberNodes.push(node);
          continue;
        }
        const child = this.diagram.getGroup(id);
        if (child) childGroups.push(child);
      }
    } else {
      // Top level: root containers + nodes that belong to no container at all.
      // Proxy placeholders are excluded — a proxy is not a loose node, it IS its
      // collapsed container, and the container is already a unit here.
      const grouped = new Set<string>();
      for (const g of this.diagram.getGroups()) {
        for (const nid of this.subtreeNodeIds(g)) grouped.add(nid);
      }
      for (const node of this.diagram.getNodes()) {
        if (!grouped.has(node.id) && !this.diagram.isProxyNode(node)) memberNodes.push(node);
      }
      for (const g of this.diagram.getGroups()) {
        if (!g.parentGroupId) childGroups.push(g);
      }
    }

    memberNodes.sort(byId);
    childGroups.sort(byId);

    return {
      group,
      memberNodes,
      movableChildren: childGroups.filter((g) => !this.isFixed(g)),
      fixedChildren: childGroups.filter((g) => this.isFixed(g)),
    };
  }

  /** Arrange one level's units and commit their positions. */
  private async arrangeLevel(level: Level): Promise<void> {
    if (level.memberNodes.length + level.movableChildren.length === 0) {
      return;
    }

    const positions = await this.arrangeUnits(level);
    this.pinFixedUnits(level, positions);
    this.applyUnitPositions(level, positions);
  }

  /**
   * Arrange the units of a level and return TOP-LEFT positions by unit id. The
   * adapter is a black box: feed it nodes + induced links, read back the map.
   */
  private async arrangeUnits(level: Level): Promise<Map<string, { x: number; y: number }>> {
    const algo = this.resolveAlgorithm(level.group);

    // Fixed containers ARE units in the layout input — their edges have to count
    // (that is how the movable units learn to sit near what they connect to).
    // They are pinned back to their true positions afterwards.
    const containers = [...level.movableChildren, ...level.fixedChildren].sort(byId);
    const unitNodes: NodeModel[] = [...level.memberNodes, ...containers.map((c) => standIn(c))];

    const adapter = algo === 'grid' ? undefined : this.options.adapters?.[algo];
    if (!adapter) {
      // Built-in grid (also the fallback when a requested adapter isn't wired).
      return this.gridArrange(unitNodes);
    }

    const unitLinks = this.buildUnitLinks(level);
    const res: LayoutResult = await adapter.apply(
      unitNodes,
      unitLinks,
      translateOptions(algo, this.resolveLayoutOptions(level.group))
    );

    // Trust only the returned map (black box) — never the adapter's own writes.
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of res.nodePositions) {
      out.set(id, { x: pos.x, y: pos.y });
    }
    // Any unit the adapter didn't place keeps its current top-left.
    for (const n of unitNodes) {
      if (!out.has(n.id)) out.set(n.id, { x: n.position.x, y: n.position.y });
    }
    return out;
  }

  /**
   * INDUCED EDGES. Project every real link onto this level's units, keeping only
   * the ones whose ends land on two DIFFERENT units. See the header — this is
   * the whole point of the card, and the root level used to skip it entirely.
   */
  private buildUnitLinks(level: Level): LinkModel[] {
    const directNodeIds = new Set(level.memberNodes.map((n) => n.id));

    // node id → the unit (container) of THIS level that contains it, at any
    // depth. Fixed containers are included: an edge to a pinned container still
    // tells the layout where the other end wants to be.
    const nodeToUnit = new Map<string, string>();
    for (const container of [...level.movableChildren, ...level.fixedChildren]) {
      for (const nid of this.subtreeNodeIds(container)) {
        nodeToUnit.set(nid, container.id);
      }
    }

    const resolveUnit = (nodeId?: string): string | undefined => {
      if (!nodeId) return undefined;
      if (directNodeIds.has(nodeId)) return nodeId;
      return nodeToUnit.get(nodeId);
    };

    const endpointNodeId = (nodeId: string | undefined, portId: string | undefined) =>
      nodeId ?? (portId ? this.diagram.getNodeByPortId(portId)?.id : undefined);

    const seen = new Set<string>();
    const out: LinkModel[] = [];
    // Canonical link order — the adapter's output depends on input order.
    for (const link of [...this.diagram.getLinks()].sort(byId)) {
      const su = resolveUnit(endpointNodeId(link.sourceNodeId, link.sourcePortId));
      const tu = resolveUnit(endpointNodeId(link.targetNodeId, link.targetPortId));
      if (!su || !tu || su === tu) continue;
      const key = `${su}->${tu}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const l = new LinkModel('', '');
      l.sourceNodeId = su;
      l.targetNodeId = tu;
      out.push(l);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // FIXED CONTAINERS
  //
  // Wave 5's scope-down: "fixed groups are pinned but the parent arranges only
  // non-fixed units around them, so overlap with a fixed group is possible."
  // Closed, in two steps:
  //
  //   1. The fixed container is a real unit in the layout input, so the engine
  //      sizes a hole for it and routes the other units around it. We then snap
  //      it back to its true position and translate the whole arrangement by the
  //      same delta — with ONE fixed container that lands the arrangement exactly
  //      around it, overlap-free by construction, because the engine already
  //      separated its nodes.
  //
  //   2. With SEVERAL fixed containers the engine's relative placement of them
  //      cannot match reality (they are pinned at arbitrary spots), so overlap is
  //      still possible. A separation pass then translates the whole movable
  //      arrangement — never individual units, which would shred the engine's
  //      work — by the smallest displacement that clears the collision, and
  //      repeats. It terminates: the loop is bounded, and the fallback (park the
  //      arrangement clear below every fixed box) is unconditionally overlap-free.
  //
  // WHAT `fixed` MEANS, precisely: pinned WITHIN ITS PARENT'S ARRANGEMENT. The
  // parent never rearranges it and never lays out its interior — but the parent
  // does still CARRY it, rigidly, when the parent itself moves. It has to: a
  // child that refused to follow its parent would end up outside the parent's
  // frame, which is not something a container can mean. So a fixed ROOT container
  // is pinned in world coordinates (nothing above it to carry it), and a fixed
  // CHILD keeps its offset inside its parent. Both are covered by the spec.
  // ---------------------------------------------------------------------------

  private pinFixedUnits(level: Level, positions: Map<string, { x: number; y: number }>): void {
    if (level.fixedChildren.length === 0) return;

    const fixedBoxes = level.fixedChildren
      .slice()
      .sort(byId)
      .map((g) => ({ id: g.id, ...g.getOuterBounds() }));

    // Step 1 — anchor the arrangement on the first fixed container: shift
    // everything so that container lands on its real, pinned position.
    const anchor = fixedBoxes[0];
    const placed = positions.get(anchor.id);
    if (placed) {
      const dx = anchor.x - placed.x;
      const dy = anchor.y - placed.y;
      if (dx !== 0 || dy !== 0) {
        for (const [id, p] of positions) {
          positions.set(id, { x: p.x + dx, y: p.y + dy });
        }
      }
    }
    // Fixed units are never placed by the layout — restore their true corners.
    for (const box of fixedBoxes) {
      positions.set(box.id, { x: box.x, y: box.y });
    }

    // Step 2 — separate. Only the movable units may move.
    const movable = [
      ...level.memberNodes.map((n) => ({ id: n.id, w: n.size.width, h: n.size.height })),
      ...level.movableChildren.map((g) => {
        const b = g.getOuterBounds();
        return { id: g.id, w: Math.max(1, b.width), h: Math.max(1, b.height) };
      }),
    ].sort((a, b) => (a.id < b.id ? -1 : 1));

    const boxOf = (u: { id: string; w: number; h: number }): Rect => {
      const p = positions.get(u.id) ?? { x: 0, y: 0 };
      return { x: p.x, y: p.y, width: u.w, height: u.h };
    };

    const shift = (dx: number, dy: number) => {
      for (const u of movable) {
        const p = positions.get(u.id);
        if (p) positions.set(u.id, { x: p.x + dx, y: p.y + dy });
      }
    };

    const MAX_PASSES = 16;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      // Smallest escape among all (movable unit × fixed box) collisions.
      let best: { dx: number; dy: number; mag: number } | undefined;
      for (const u of movable) {
        const ub = boxOf(u);
        for (const fb of fixedBoxes) {
          const mtv = minimumTranslation(ub, fb);
          if (!mtv) continue;
          const mag = Math.abs(mtv.dx) + Math.abs(mtv.dy);
          if (!best || mag < best.mag) best = { ...mtv, mag };
        }
      }
      if (!best) return; // clear
      shift(best.dx, best.dy);
    }

    // Fallback: still colliding after the bounded search (pathological pinning).
    // Park the whole arrangement below every fixed box — ugly, but the invariant
    // "no unit overlaps a fixed container" holds unconditionally.
    let stillColliding = false;
    for (const u of movable) {
      const ub = boxOf(u);
      if (fixedBoxes.some((fb) => minimumTranslation(ub, fb))) {
        stillColliding = true;
        break;
      }
    }
    if (!stillColliding) return;

    const fixedBottom = Math.max(...fixedBoxes.map((fb) => fb.y + fb.height));
    const movableTop = Math.min(...movable.map((u) => boxOf(u).y));
    shift(0, fixedBottom + (this.options.gridGap ?? 40) - movableTop);
  }

  /** Apply arranged unit positions: move nodes; translate child subtrees. */
  private applyUnitPositions(
    level: Level,
    positions: Map<string, { x: number; y: number }>
  ): void {
    for (const node of level.memberNodes) {
      const p = positions.get(node.id);
      // setPosition (not a raw write) so the spatial index and the routing
      // obstacle map see the move.
      if (p) node.setPosition(p.x, p.y);
    }
    for (const child of level.movableChildren) {
      const p = positions.get(child.id);
      if (!p) continue;
      const cur = child.getOuterBounds();
      const dx = p.x - cur.x;
      const dy = p.y - cur.y;
      if (dx !== 0 || dy !== 0) {
        this.translateSubtree(child, dx, dy);
      }
    }
  }

  /** Shift a group and everything inside it (nodes + nested groups) by (dx,dy). */
  private translateSubtree(group: GroupModel, dx: number, dy: number): void {
    // subtreeNodeIds includes the proxy placeholder of any collapsed group in
    // the subtree — without it, placing a collapsed container moved the frame
    // and the hidden members but left the only VISIBLE box behind.
    for (const nid of this.subtreeNodeIds(group)) {
      const node = this.diagram.getNode(nid);
      if (node) node.setPosition(node.position.x + dx, node.position.y + dy);
    }
    // Move the group frame(s) too (self + descendant groups).
    const groupsToMove = [group, ...this.diagram.getDescendants(group.id)];
    for (const g of groupsToMove) {
      const b = g.getOuterBounds();
      g.setFrame({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
    }
  }

  /**
   * All node ids inside a group's subtree (direct + nested), PLUS the collapse
   * placeholder of every collapsed group within it.
   *
   * The proxy is not a member of the group it stands for — collapse just adds it
   * to the diagram — but it is geometrically and semantically INSIDE it: it is
   * the container's visible box, and every edge that crossed the container's
   * boundary now terminates on it. So for both purposes this set serves —
   * translating a subtree, and resolving an edge endpoint to a unit — the proxy
   * belongs to its group.
   */
  private subtreeNodeIds(group: GroupModel): Set<string> {
    const out = new Set<string>();
    const walk = (g: GroupModel) => {
      const proxyId = g.collapsedState?.proxyNodeId;
      if (proxyId) out.add(proxyId);
      for (const id of g.members) {
        if (this.diagram.getNode(id)) out.add(id);
        else {
          const child = this.diagram.getGroup(id);
          if (child) walk(child);
        }
      }
    };
    walk(group);
    return out;
  }

  /** Deterministic grid over units by their size; returns TOP-LEFT positions. */
  private gridArrange(units: NodeModel[]): Map<string, { x: number; y: number }> {
    const gap = this.options.gridGap ?? 40;
    const cols = Math.max(1, Math.ceil(Math.sqrt(units.length)));
    // Uniform cell = max unit size, so boxes never overlap regardless of order.
    const cellW = Math.max(1, ...units.map((u) => u.size.width));
    const cellH = Math.max(1, ...units.map((u) => u.size.height));
    const out = new Map<string, { x: number; y: number }>();
    units.forEach((u, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      out.set(u.id, { x: col * (cellW + gap), y: row * (cellH + gap) });
    });
    return out;
  }

  /** Final positions + overall bounds, for the LayoutResult contract. */
  private collectResult(result: CompoundLayoutResult): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of [...this.diagram.getNodes()].sort(byId)) {
      result.nodePositions.set(node.id, { x: node.position.x, y: node.position.y });
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    }
    for (const b of result.groupBounds.values()) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    result.bounds = Number.isFinite(minX)
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : { x: 0, y: 0, width: 0, height: 0 };
  }

  // --- per-group config resolution (GroupInfo contract) ----------------------

  private override(group: GroupModel): Partial<GroupInfo> | undefined {
    return this.options.groupOverrides?.[group.id];
  }

  private isFixed(group: GroupModel): boolean {
    return this.override(group)?.fixed ?? group.subgraphLayout?.fixed ?? false;
  }

  /**
   * Fallback inner padding for a container that carries none of its own.
   *
   * `defaultPadding` was DECLARED AND NEVER READ — wave 5 shipped the option and
   * no consumption site, so it was the same "declared but never consumed" shape
   * as `GroupInfo.padding` before it. Padding is Card 3's (`GroupModel.padding`,
   * which `fitToContents` reads), so the fallback has to be established ON the
   * group before the fit, not smuggled into a parallel padding path.
   */
  private applyDefaultPadding(group: GroupModel): void {
    const fallback = this.options.defaultPadding;
    if (fallback === undefined || group.padding !== undefined) return;
    group.padding = fallback;
  }

  /** Is this group inside a container that is currently collapsed? */
  private hasCollapsedAncestor(group: GroupModel): boolean {
    return this.diagram.getAncestors(group.id).some((a) => a.isCollapsed);
  }

  /** null = the top level, which uses the default algorithm. */
  private resolveAlgorithm(group: GroupModel | null): CompoundAlgorithm {
    const fallback = this.options.defaultAlgorithm ?? 'grid';
    if (!group) return fallback;

    const raw =
      (this.override(group)?.layoutAlgorithm as CompoundAlgorithm | 'inherit' | undefined) ??
      group.subgraphLayout?.algorithm ??
      'inherit';
    if (raw === 'inherit' || raw === undefined) {
      return this.inheritedAlgorithm(group) ?? fallback;
    }
    return raw;
  }

  /** Walk up the containment tree for the nearest ancestor's explicit algorithm. */
  private inheritedAlgorithm(group: GroupModel): CompoundAlgorithm | undefined {
    for (const ancestor of this.diagram.getAncestors(group.id)) {
      const a =
        (this.override(ancestor)?.layoutAlgorithm as CompoundAlgorithm | 'inherit' | undefined) ??
        ancestor.subgraphLayout?.algorithm;
      if (a && a !== 'inherit') return a;
    }
    return undefined;
  }

  /** Base (unified) options, with this group's own options merged over them. */
  private resolveLayoutOptions(group: GroupModel | null): UnifiedLayoutOptions {
    if (!group) return { ...(this.options.layoutOptions ?? {}) };
    return {
      ...(this.options.layoutOptions ?? {}),
      ...(group.subgraphLayout?.layoutOptions ?? {}),
      ...((this.override(group)?.layoutOptions as Record<string, unknown>) ?? {}),
    } as UnifiedLayoutOptions;
  }
}

/** A child container, as a single opaque box the parent's engine can place. */
function standIn(group: GroupModel): NodeModel {
  const b = group.getOuterBounds();
  return new NodeModel({
    id: group.id,
    type: 'group-unit',
    position: { x: b.x, y: b.y },
    size: { width: Math.max(1, b.width), height: Math.max(1, b.height) },
  });
}

/**
 * The smallest translation that moves `a` out of `b`, or undefined when they do
 * not overlap. Ties break +x before -x before +y before -y, so the result is a
 * pure function of the geometry — no iteration order can leak in.
 */
function minimumTranslation(a: Rect, b: Rect): { dx: number; dy: number } | undefined {
  const right = b.x + b.width - a.x; // push a right, clear of b
  const left = a.x + a.width - b.x; // push a left
  const down = b.y + b.height - a.y; // push a down
  const up = a.y + a.height - b.y; // push a up
  if (right <= 0 || left <= 0 || down <= 0 || up <= 0) {
    return undefined; // separated on at least one axis
  }
  const best = Math.min(right, left, down, up);
  if (best === right) return { dx: right, dy: 0 };
  if (best === left) return { dx: -left, dy: 0 };
  if (best === down) return { dx: 0, dy: down };
  return { dx: 0, dy: -up };
}
