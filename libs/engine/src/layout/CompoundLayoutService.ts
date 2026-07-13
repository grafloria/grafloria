// CompoundLayoutService — Wave-5 Card 5: per-group recursive (compound) layout.
//
// ORCHESTRATION ONLY. This wires the diagram's GroupModel containment tree to
// the existing layout adapters (dagre/elk) — used strictly as BLACK BOXES
// (feed nodes+links, read back a nodePositions map) — plus a built-in
// deterministic grid. It does NOT touch adapter internals or the two parallel
// layout stacks (that consolidation is capability #14).
//
// Algorithm (bottom-up, deepest first):
//   1. For each group, gather its DIRECT node members plus each DIRECT child
//      group as a single "unit" box (the child was already laid out + fitted).
//   2. Arrange the units with the group's own algorithm (dagre/elk/grid or
//      'inherit'), honoring `fixed` groups (neither laid out nor moved).
//   3. Apply unit positions: move real nodes; translate a child group's whole
//      subtree by the delta.
//   4. Fit the group to its contents (Card 3 fitToContents → padding + header).
// Then, optionally, the top level (root groups + ungrouped nodes) is arranged.

import type { DiagramModel } from '../models/DiagramModel';
import type { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import type { LayoutAdapter, LayoutResult } from './layout-adapter.interface';
import type { GroupInfo } from './subgraph-layout.interface';

export type CompoundAlgorithm = 'dagre' | 'elk' | 'grid';

export interface CompoundLayoutOptions {
  /** Default algorithm for groups without an explicit / 'inherit' choice. */
  defaultAlgorithm?: CompoundAlgorithm;
  /** Injected adapters used as black boxes. Missing ones fall back to grid. */
  adapters?: Partial<Record<'dagre' | 'elk', LayoutAdapter>>;
  /** Fallback padding for groups without their own (Card 3) padding. */
  defaultPadding?: number;
  /** Gap between units in the built-in grid. */
  gridGap?: number;
  /** Also arrange the top level (root groups + ungrouped nodes). Default false. */
  layoutTopLevel?: boolean;
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
  /** Groups skipped because they are fixed. */
  skipped: string[];
  /** group id → final outer bounds. */
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
      groupBounds: new Map(),
    };

    // Deepest-first: a parent is laid out only after its children are fitted.
    const groups = this.diagram
      .getGroups()
      .slice()
      .sort((a, b) => this.diagram.getDepth(b.id) - this.diagram.getDepth(a.id));

    for (const group of groups) {
      if (this.isFixed(group)) {
        result.skipped.push(group.id);
        // A fixed group is still fitted so parents see a correct box, unless it
        // already has an explicit frame.
        if (!group.size) {
          group.fitToContents(this.diagram);
        }
        result.groupBounds.set(group.id, group.getOuterBounds());
        continue;
      }

      await this.layoutGroupContents(group);
      group.fitToContents(this.diagram);
      result.laidOut.push(group.id);
      result.groupBounds.set(group.id, group.getOuterBounds());
    }

    if (this.options.layoutTopLevel) {
      await this.layoutTopLevel();
    }

    return result;
  }

  /** Arrange one group's direct units with its chosen algorithm. */
  private async layoutGroupContents(group: GroupModel): Promise<void> {
    const memberNodes: NodeModel[] = [];
    const childGroups: GroupModel[] = [];
    for (const id of group.members) {
      const node = this.diagram.getNode(id);
      if (node) {
        memberNodes.push(node);
        continue;
      }
      const child = this.diagram.getGroup(id);
      if (child) childGroups.push(child);
    }

    // Non-fixed units only; a fixed child stays put and is not rearranged.
    const movableChildren = childGroups.filter((g) => !this.isFixed(g));
    if (memberNodes.length + movableChildren.length === 0) {
      return;
    }

    const positions = await this.arrangeUnits(group, memberNodes, movableChildren);
    this.applyUnitPositions(group, memberNodes, movableChildren, positions);
  }

  /**
   * Arrange units (member nodes + child-group boxes) and return TOP-LEFT
   * positions keyed by unit id. Uses the adapter as a black box for dagre/elk;
   * otherwise a deterministic grid.
   */
  private async arrangeUnits(
    group: GroupModel,
    memberNodes: NodeModel[],
    childGroups: GroupModel[]
  ): Promise<Map<string, { x: number; y: number }>> {
    const algo = this.resolveAlgorithm(group);
    const layoutOptions = this.resolveLayoutOptions(group);

    // Build unit node list: real member nodes + a stand-in NodeModel per child.
    const unitNodes: NodeModel[] = [...memberNodes];
    const childById = new Map<string, GroupModel>();
    for (const child of childGroups) {
      childById.set(child.id, child);
      const b = child.getOuterBounds();
      const stand = new NodeModel({
        id: child.id,
        type: 'group-unit',
        position: { x: b.x, y: b.y },
        size: { width: Math.max(1, b.width), height: Math.max(1, b.height) },
      });
      unitNodes.push(stand);
    }

    const adapter = algo === 'grid' ? undefined : this.options.adapters?.[algo];
    if (!adapter) {
      // Built-in grid (also the fallback when a requested adapter isn't wired).
      return this.gridArrange(unitNodes);
    }

    const unitLinks = this.buildUnitLinks(group, memberNodes, childById);
    const res: LayoutResult = await adapter.apply(unitNodes, unitLinks, layoutOptions);
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
   * Synthesize the internal edges between units at this level: map each real
   * link's endpoints to the unit (direct member node, or the direct child group
   * whose subtree contains the endpoint) and keep links whose two ends land on
   * DIFFERENT units of this group. Ports are irrelevant — the adapters read
   * node ids — so these are lightweight, un-installed LinkModels.
   */
  private buildUnitLinks(
    group: GroupModel,
    memberNodes: NodeModel[],
    childById: Map<string, GroupModel>
  ): LinkModel[] {
    const directNodeIds = new Set(memberNodes.map((n) => n.id));
    // node id -> child group id (for every node inside a direct child subtree).
    const nodeToChild = new Map<string, string>();
    for (const child of childById.values()) {
      for (const nid of this.subtreeNodeIds(child)) {
        nodeToChild.set(nid, child.id);
      }
    }

    const resolveUnit = (nodeId?: string): string | undefined => {
      if (!nodeId) return undefined;
      if (directNodeIds.has(nodeId)) return nodeId;
      return nodeToChild.get(nodeId);
    };

    const seen = new Set<string>();
    const out: LinkModel[] = [];
    for (const link of this.diagram.getLinks()) {
      const su = resolveUnit(link.sourceNodeId ?? this.diagram.getNodeByPortId(link.sourcePortId)?.id);
      const tu = resolveUnit(link.targetNodeId ?? this.diagram.getNodeByPortId(link.targetPortId)?.id);
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

  /** Apply arranged unit positions: move nodes; translate child subtrees. */
  private applyUnitPositions(
    group: GroupModel,
    memberNodes: NodeModel[],
    childGroups: GroupModel[],
    positions: Map<string, { x: number; y: number }>
  ): void {
    for (const node of memberNodes) {
      const p = positions.get(node.id);
      if (p) node.setPosition(p.x, p.y);
    }
    for (const child of childGroups) {
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

  /** All node ids inside a group's subtree (direct + nested). */
  private subtreeNodeIds(group: GroupModel): Set<string> {
    const out = new Set<string>();
    const walk = (g: GroupModel) => {
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

  /** Top-level: arrange root groups + ungrouped nodes as units. */
  private async layoutTopLevel(): Promise<void> {
    const rootGroups = this.diagram
      .getGroups()
      .filter((g) => !g.parentGroupId && !this.isFixed(g));
    const groupedNodeIds = new Set<string>();
    for (const g of this.diagram.getGroups()) {
      for (const nid of this.subtreeNodeIds(g)) groupedNodeIds.add(nid);
    }
    const looseNodes = this.diagram
      .getNodes()
      .filter((n) => !groupedNodeIds.has(n.id) && !this.diagram.isProxyNode(n));

    if (rootGroups.length + looseNodes.length === 0) return;

    // Synthetic "root" group so we reuse the same arrange/apply machinery.
    const units: NodeModel[] = [...looseNodes];
    const childById = new Map<string, GroupModel>();
    for (const g of rootGroups) {
      childById.set(g.id, g);
      const b = g.getOuterBounds();
      units.push(
        new NodeModel({
          id: g.id,
          type: 'group-unit',
          position: { x: b.x, y: b.y },
          size: { width: Math.max(1, b.width), height: Math.max(1, b.height) },
        })
      );
    }

    const algo = this.options.defaultAlgorithm ?? 'grid';
    const adapter = algo === 'grid' ? undefined : this.options.adapters?.[algo];
    const positions = adapter
      ? this.fromResult(await adapter.apply(units, [], {}), units)
      : this.gridArrange(units);

    for (const n of looseNodes) {
      const p = positions.get(n.id);
      if (p) n.setPosition(p.x, p.y);
    }
    for (const g of rootGroups) {
      const p = positions.get(g.id);
      if (!p) continue;
      const cur = g.getOuterBounds();
      this.translateSubtree(g, p.x - cur.x, p.y - cur.y);
    }
  }

  private fromResult(res: LayoutResult, units: NodeModel[]): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of res.nodePositions) out.set(id, { x: pos.x, y: pos.y });
    for (const n of units) if (!out.has(n.id)) out.set(n.id, { x: n.position.x, y: n.position.y });
    return out;
  }

  // --- per-group config resolution (GroupInfo contract) ----------------------

  private override(group: GroupModel): Partial<GroupInfo> | undefined {
    return this.options.groupOverrides?.[group.id];
  }

  private isFixed(group: GroupModel): boolean {
    return this.override(group)?.fixed ?? group.subgraphLayout?.fixed ?? false;
  }

  private resolveAlgorithm(group: GroupModel): CompoundAlgorithm {
    const fallback = this.options.defaultAlgorithm ?? 'grid';
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

  private resolveLayoutOptions(group: GroupModel): Record<string, unknown> {
    return {
      ...(group.subgraphLayout?.layoutOptions ?? {}),
      ...((this.override(group)?.layoutOptions as Record<string, unknown>) ?? {}),
    };
  }
}
