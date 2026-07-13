// Wave 7 (Auto-layout) — Card 2: the Tree layout (org chart / mind map).
//
// A tidy tree: parents centred over their children, siblings never overlapping,
// subtree extents reserved rather than guessed. What it adds over "run dagre and
// call it a tree" is PER-BRANCH DIRECTION — the thing that separates a diagram
// engine's tree layout from a hierarchical layout:
//
//   • org chart      — everything flows 'TB'.
//   • mind map       — root in the middle, half the branches flow 'LR' and half
//                      flow 'RL'. GoJS ships this as a separate DoubleTree
//                      extension; here it is `branchDirections`, one option.
//   • assistant node — one branch of an otherwise top-down chart hangs off to the
//                      side ('LR'), the classic "chief of staff" box.
//
// HOW MIXED DIRECTIONS STAY NON-OVERLAPPING
//
// Each node's children are grouped by their effective direction, each group is
// laid out as its own block, and the blocks are attached to the four sides of the
// parent. Two groups on OPPOSITE sides (the mind-map case: 'LR' right, 'RL' left)
// can never collide — they are in disjoint half-planes. Two groups on
// PERPENDICULAR sides (the assistant case: 'TB' below, 'LR' right) can collide in
// the shared quadrant, so after placement each group is pushed out along its own
// axis by exactly the overlap. Pushing a group along its own axis always
// separates it eventually (the other blocks are finite), so this terminates in one
// pass and the result provably has no overlapping subtrees.
//
// (`GridLayoutAlgorithm` and friends in ./algorithms are NOT this. They implement
// ILayoutAlgorithm — `calculatePlacement(node, viewport)`, "where does this ONE
// new node go?". A single-node placement strategy, not a graph layout. See the
// header of layout-registry.ts.)

import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { LayoutResult } from './layout-adapter.interface';
import type { UnifiedLayoutOptions } from './layout-registry';
import { nodeSize } from './component-packing';
import { inStableOrder } from './rng';

export type FlowDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface TreeLayoutOptions extends UnifiedLayoutOptions {
  /** Root of the tree. Defaults to a source node (in-degree 0), else the hub. */
  rootId?: string;
  /**
   * Per-branch direction: the subtree rooted at this node flows this way instead
   * of the tree's `direction`. A mind map is
   * `{ 'child-a': 'LR', 'child-b': 'RL' }`.
   */
  branchDirections?: Record<string, FlowDirection>;
}

/** A laid-out subtree in local coordinates, with its root's own box tracked. */
interface Block {
  positions: Map<string, { x: number; y: number }>;
  /** Top-left of the block's ROOT node — the point a parent attaches to. */
  rootX: number;
  rootY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULT_NODE_SPACING = 50;
const DEFAULT_RANK_SPACING = 70;

/** Is this direction's flow axis vertical? */
const isVertical = (d: FlowDirection): boolean => d === 'TB' || d === 'BT';

/**
 * Choose the node a tree hangs from — or a radial layout centres on.
 *
 * SOURCE FIRST (in-degree 0), hub second (highest degree). The order matters and
 * "highest degree" alone is a real bug, which Card 2's own radial test caught:
 * in the tree
 *
 *     hub → mid1 → leaf1, leaf2
 *     hub → mid2 → leaf3
 *
 * the CEO ('hub') has degree 2 and the middle manager ('mid1') has degree 3. A
 * pure highest-degree rule centres the picture on the middle manager and hangs
 * the CEO off the side — the org chart drawn upside down. Sources win; the
 * degree rule is the fallback for a graph that HAS no source (a cycle, an
 * undirected network), which is exactly where "the hub" is the right answer.
 *
 * Every tie breaks on the lowest id, so the root never depends on insertion order.
 */
export function pickRoot(
  ordered: readonly NodeModel[],
  inDegree: Map<string, number>,
  degree: Map<string, number>,
  rootId?: string
): string {
  if (rootId && ordered.some((n) => n.id === rootId)) return rootId;

  const sources = ordered.filter((n) => inDegree.get(n.id) === 0);
  if (sources.length > 0) return sources[0].id;

  return ordered.reduce((best, n) => (degree.get(n.id)! > degree.get(best.id)! ? n : best)).id;
}

/**
 * Build a spanning tree over one connected component.
 *
 * Edge direction is respected FIRST (an org chart's edges point at subordinates,
 * and a tree that ignored that would hang the CEO off an intern). Whatever the
 * directed walk cannot reach — a cycle, a node whose only edge points the wrong
 * way — is then attached by an undirected walk, because a connected component
 * must come out as ONE tree or the layout would silently drop nodes.
 */
function buildSpanningTree(
  nodes: readonly NodeModel[],
  links: readonly LinkModel[],
  rootId?: string
): { root: string; children: Map<string, string[]> } {
  const ordered = inStableOrder(nodes);
  const ids = new Set(ordered.map((n) => n.id));

  const out = new Map<string, string[]>();
  const undirected = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const id of ids) {
    out.set(id, []);
    undirected.set(id, []);
    inDegree.set(id, 0);
    degree.set(id, 0);
  }

  for (const link of inStableOrder(links)) {
    const s = link.sourceNodeId;
    const t = link.targetNodeId;
    if (!s || !t || !ids.has(s) || !ids.has(t) || s === t) continue;
    out.get(s)!.push(t);
    inDegree.set(t, inDegree.get(t)! + 1);
    degree.set(s, degree.get(s)! + 1);
    degree.set(t, degree.get(t)! + 1);
    undirected.get(s)!.push(t);
    undirected.get(t)!.push(s);
  }
  for (const list of out.values()) list.sort();
  for (const list of undirected.values()) list.sort();

  const root = pickRoot(ordered, inDegree, degree, rootId);

  const children = new Map<string, string[]>();
  for (const id of ids) children.set(id, []);
  const visited = new Set<string>([root]);

  const walk = (adjacency: Map<string, string[]>, frontier: string[]): void => {
    const queue = [...frontier];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        children.get(current)!.push(next);
        queue.push(next);
      }
    }
  };

  walk(out, [root]);
  // Anything the directed walk could not reach, attached undirectedly. Repeat
  // until the component is exhausted (an attached node may itself lead to more).
  while (visited.size < ids.size) {
    const before = visited.size;
    walk(undirected, [...visited].sort());
    if (visited.size === before) break; // unreachable ⇒ not one component; caller's problem
  }

  return { root, children };
}

/** Union of two boxes, where the second may be empty. */
function extend(block: Block, other: Block): void {
  block.minX = Math.min(block.minX, other.minX);
  block.minY = Math.min(block.minY, other.minY);
  block.maxX = Math.max(block.maxX, other.maxX);
  block.maxY = Math.max(block.maxY, other.maxY);
}

function translate(block: Block, dx: number, dy: number): void {
  for (const p of block.positions.values()) {
    p.x += dx;
    p.y += dy;
  }
  block.rootX += dx;
  block.rootY += dy;
  block.minX += dx;
  block.minY += dy;
  block.maxX += dx;
  block.maxY += dy;
}

const overlaps = (a: Block, b: Block): boolean =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

interface TreeContext {
  sizes: Map<string, { width: number; height: number }>;
  children: Map<string, string[]>;
  branchDirections: Record<string, FlowDirection>;
  nodeSpacing: number;
  rankSpacing: number;
}

/**
 * Lay the whole tree out, bottom-up, WITHOUT RECURSION.
 *
 * The natural expression of a tidy tree is recursive, and that is how this
 * shipped — and it threw `RangeError: Maximum call stack size exceeded` at a
 * depth of about 1,000. Not a theoretical limit: a long process chain laid out
 * with `direction: 'LR'` IS a 1,000-deep tree, and a crash is a much worse
 * failure than an ugly picture.
 *
 * So the traversal is an explicit stack. Two iterative passes:
 *
 *   1. PRE-ORDER, to resolve each node's effective direction (a node inherits its
 *      parent's unless `branchDirections` overrides it).
 *   2. POST-ORDER, to compose each node's block from its children's — which are
 *      guaranteed to be finished by the time the parent is visited.
 *
 * The per-node composition below is unchanged; only the plumbing that reaches it
 * is. Measured: a 5,000-deep chain now lays out instead of throwing.
 */
function layoutTree(root: string, rootDir: FlowDirection, ctx: TreeContext): Block {
  // --- pass 1: effective direction, pre-order ---
  const effectiveDir = new Map<string, FlowDirection>([[root, rootDir]]);
  const postOrder: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const id = stack.pop()!;
    postOrder.push(id);
    const dir = effectiveDir.get(id)!;
    for (const kid of ctx.children.get(id) ?? []) {
      effectiveDir.set(kid, ctx.branchDirections[kid] ?? dir);
      stack.push(kid);
    }
  }
  // A reversed pre-order visits every node after all of its descendants, which is
  // all the composition needs — it is not a true post-order, but the guarantee
  // ("children first") is identical and it costs one reverse instead of a
  // second traversal with a visited-flag.
  postOrder.reverse();

  // --- pass 2: compose blocks, children first ---
  const blockOf = new Map<string, Block>();
  for (const id of postOrder) {
    blockOf.set(id, composeBlock(id, effectiveDir.get(id)!, ctx, blockOf));
  }

  return blockOf.get(root)!;
}

/**
 * Build one node's block from its (already-composed) children's blocks, in local
 * coordinates with the node's top-left at (0, 0).
 */
function composeBlock(
  id: string,
  dir: FlowDirection,
  ctx: TreeContext,
  blockOf: Map<string, Block>
): Block {
  const size = ctx.sizes.get(id)!;
  const block: Block = {
    positions: new Map([[id, { x: 0, y: 0 }]]),
    rootX: 0,
    rootY: 0,
    minX: 0,
    minY: 0,
    maxX: size.width,
    maxY: size.height,
  };

  const kids = ctx.children.get(id) ?? [];
  if (kids.length === 0) return block;

  // Group children by the direction their own subtree flows in.
  const groupsByDir = new Map<FlowDirection, string[]>();
  for (const kid of kids) {
    const kidDir = ctx.branchDirections[kid] ?? dir;
    if (!groupsByDir.has(kidDir)) groupsByDir.set(kidDir, []);
    groupsByDir.get(kidDir)!.push(kid);
  }

  // A fixed side order, so a diagram with mixed branches lays out the same way
  // every time regardless of which child happened to be authored first.
  const sideOrder: FlowDirection[] = ['TB', 'BT', 'LR', 'RL'];

  // The parent's own box is a collision source — but as a SNAPSHOT, not an alias
  // of `block`. `block` grows to swallow each group as it is placed, so aliasing
  // it here would make the second group collide with the FIRST group's extent
  // through the parent, and get shoved miles away for no reason.
  const parentBox: Block = {
    positions: new Map(),
    rootX: 0,
    rootY: 0,
    minX: 0,
    minY: 0,
    maxX: size.width,
    maxY: size.height,
  };
  const placed: Block[] = [parentBox];

  for (const side of sideOrder) {
    const members = groupsByDir.get(side);
    if (!members || members.length === 0) continue;

    // --- pack this group's child blocks along the side's BREADTH axis ---
    // Already composed (post-order), so this is a lookup, not a descent.
    const childBlocks = members.map((kid) => blockOf.get(kid)!);
    const vertical = isVertical(side);

    const group: Block = {
      positions: new Map(),
      rootX: 0,
      rootY: 0,
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };

    let cursor = 0;
    for (const child of childBlocks) {
      if (vertical) {
        // Breadth is x. Align every child's ROOT to the same depth (the rank
        // line) — a child whose own subtree bulges upward (a 'BT' sub-branch)
        // must not drag its siblings' rank with it, which is why the alignment
        // is on rootY, not on minY.
        translate(child, cursor - child.minX, -child.rootY);
        cursor = child.maxX + ctx.nodeSpacing;
      } else {
        translate(child, -child.rootX, cursor - child.minY);
        cursor = child.maxY + ctx.nodeSpacing;
      }
      for (const [nodeId, p] of child.positions) group.positions.set(nodeId, p);
      extend(group, child);
    }

    // --- attach the group to the parent's side ---
    //
    // The parent is centred BETWEEN ITS FIRST AND LAST CHILD along the breadth
    // axis, and the group is pushed clear of the parent along the flow axis.
    //
    // "Between the first and last CHILD" — not "on the centre of the group's
    // bounding box", which is what this shipped with and which is subtly wrong:
    // the bounding box includes the GRANDchildren. Give a CEO one VP with four
    // reports and one VP with a single report, and the bbox centre drags the CEO
    // toward the bushy side, visibly off-centre between its own two VPs. It only
    // looks right when every subtree happens to be symmetric, which is exactly
    // when nobody would notice. This is the Reingold-Tilford rule.
    const first = childBlocks[0];
    const last = childBlocks[childBlocks.length - 1];
    const firstSize = ctx.sizes.get(members[0])!;
    const lastSize = ctx.sizes.get(members[members.length - 1])!;

    const parentCentreX = size.width / 2;
    const parentCentreY = size.height / 2;
    const childSpanCentreX =
      (first.rootX + firstSize.width / 2 + (last.rootX + lastSize.width / 2)) / 2;
    const childSpanCentreY =
      (first.rootY + firstSize.height / 2 + (last.rootY + lastSize.height / 2)) / 2;

    switch (side) {
      case 'TB':
        translate(group, parentCentreX - childSpanCentreX, size.height + ctx.rankSpacing - group.minY);
        break;
      case 'BT':
        translate(group, parentCentreX - childSpanCentreX, -ctx.rankSpacing - group.maxY);
        break;
      case 'LR':
        translate(group, size.width + ctx.rankSpacing - group.minX, parentCentreY - childSpanCentreY);
        break;
      case 'RL':
        translate(group, -ctx.rankSpacing - group.maxX, parentCentreY - childSpanCentreY);
        break;
    }

    // --- push out of anything already placed ---
    // Only perpendicular groups can collide (opposite sides are disjoint
    // half-planes). Pushing along the group's OWN axis always separates, because
    // every block already placed is finite — so one pass is enough.
    let push = 0;
    for (const other of placed) {
      if (!overlaps(group, other)) continue;
      switch (side) {
        case 'TB':
          push = Math.max(push, other.maxY + ctx.rankSpacing - group.minY);
          break;
        case 'BT':
          push = Math.max(push, group.maxY - (other.minY - ctx.rankSpacing));
          break;
        case 'LR':
          push = Math.max(push, other.maxX + ctx.rankSpacing - group.minX);
          break;
        case 'RL':
          push = Math.max(push, group.maxX - (other.minX - ctx.rankSpacing));
          break;
      }
    }
    if (push > 0) {
      if (side === 'TB') translate(group, 0, push);
      else if (side === 'BT') translate(group, 0, -push);
      else if (side === 'LR') translate(group, push, 0);
      else translate(group, -push, 0);
    }

    for (const [nodeId, p] of group.positions) block.positions.set(nodeId, p);
    extend(block, group);
    placed.push(group);
  }

  return block;
}

/**
 * Tree layout over one connected component.
 *
 * Component packing (see component-packing.ts) is what turns this into a FOREST
 * layout: each tree is laid out here, alone, and the boxes are packed afterwards.
 * That division is why a five-tree forest comes out as five tidy trees rather
 * than the pile dagre produces.
 */
export function treeLayout(
  nodes: NodeModel[],
  links: LinkModel[],
  options: TreeLayoutOptions = {}
): LayoutResult {
  const started = Date.now();

  if (nodes.length === 0) {
    return {
      nodePositions: new Map(),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      metadata: { algorithm: 'tree', executionTime: 0 },
    };
  }

  const direction: FlowDirection = options.direction ?? 'TB';
  const { root, children } = buildSpanningTree(nodes, links, options.rootId);

  const sizes = new Map(inStableOrder(nodes).map((n) => [n.id, nodeSize(n)]));

  const block = layoutTree(root, options.branchDirections?.[root] ?? direction, {
    sizes,
    children,
    branchDirections: options.branchDirections ?? {},
    nodeSpacing: options.nodeSpacing ?? DEFAULT_NODE_SPACING,
    rankSpacing: options.rankSpacing ?? DEFAULT_RANK_SPACING,
  });

  // Normalise to a (0, 0) origin. Packing re-normalises anyway, but a single-
  // component diagram takes the no-op fast path and would otherwise land in
  // negative space for any 'BT'/'RL' tree.
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const [id, p] of block.positions) {
    nodePositions.set(id, { x: p.x - block.minX, y: p.y - block.minY });
  }

  return {
    nodePositions,
    bounds: {
      x: 0,
      y: 0,
      width: block.maxX - block.minX,
      height: block.maxY - block.minY,
    },
    metadata: {
      algorithm: 'tree',
      executionTime: Date.now() - started,
      root,
      depth: depthOf(root, children),
    },
  };
}

function depthOf(root: string, children: Map<string, string[]>): number {
  let depth = 0;
  let frontier = [root];
  const seen = new Set(frontier);
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const kid of children.get(id) ?? []) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        next.push(kid);
      }
    }
    if (next.length > 0) depth++;
    frontier = next;
  }
  return depth;
}
