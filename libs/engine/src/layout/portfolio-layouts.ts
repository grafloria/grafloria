// Wave 7 (Auto-layout) — Card 2: the first-class layout portfolio.
//
// Grid, Circular, Radial, Tree and Force, as NAMED layouts in the Card-0 registry
// with one shared options vocabulary:
//
//   engine.layout('radial', { rankSpacing: 120 })
//   engine.layout('tree',   { direction: 'LR' })
//   engine.layout('grid',   { columns: 4 })
//
// GoJS ships five built-ins plus a dozen extensions; JointJS+ ships
// directed/tree/stack/grid. An engine with only "dagre" and "force" cannot draw
// half the diagrams people actually draw.
//
// Two things every one of these gets for free, and neither is optional:
//
//   • COMPONENT PACKING (component-packing.ts). Each connected component is laid
//     out alone and the boxes are packed afterwards. It is the difference between
//     a forest of five org charts and a pile of five org charts.
//   • DETERMINISM (rng.ts). Node order is canonicalised by id and the only source
//     of randomness — force's initial jitter — is seeded. Same graph + same seed
//     ⇒ byte-identical coordinates.
//
// NOT to be confused with ./algorithms/GridLayoutAlgorithm and friends. Those
// implement ILayoutAlgorithm — `calculatePlacement(node, viewport)`, "where does
// this ONE new node go?" — a single-node placement strategy. Same words, a
// different question. (The wave-7 audit tripped over exactly this; see the header
// of layout-registry.ts.)

import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { LayoutResult } from './layout-adapter.interface';
import type { UnifiedLayoutOptions } from './layout-registry';
import { nodeSize } from './component-packing';
import { inStableOrder } from './rng';
import { ForceLayoutAdapter } from './force-layout-adapter';

const DEFAULT_NODE_SPACING = 50;
const DEFAULT_RANK_SPACING = 70;

export interface GridLayoutPortfolioOptions extends UnifiedLayoutOptions {
  /** Columns in the grid. Defaults to ceil(sqrt(n)) — a roughly square block. */
  columns?: number;
}

export interface CircularLayoutOptions extends UnifiedLayoutOptions {
  /** Force a radius. By default it is derived so nodes never overlap. */
  radius?: number;
}

export interface RadialLayoutOptions extends UnifiedLayoutOptions {
  /** Centre of the rings. Defaults to the hub (highest degree, lowest id). */
  rootId?: string;
}

/** A node's footprint on a circle: the diameter it needs, plus breathing room. */
const slotOf = (node: NodeModel, spacing: number): number => {
  const { width, height } = nodeSize(node);
  return Math.max(width, height) + spacing;
};

const emptyResult = (algorithm: string): LayoutResult => ({
  nodePositions: new Map(),
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  metadata: { algorithm, executionTime: 0 },
});

/** Bounds of a positioned node set (positions are top-left). */
function boundsOf(
  nodes: readonly NodeModel[],
  positions: Map<string, { x: number; y: number }>
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p) continue;
    const { width, height } = nodeSize(node);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + width);
    maxY = Math.max(maxY, p.y + height);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Deterministic adjacency, neighbours in id order.
 *
 * Every traversal in this file starts from the lowest id and takes neighbours in
 * id order, so nothing here can depend on insertion order — the trap Card 0
 * documents (a seeded PRNG does not save you if the graph is CONSUMED in a
 * different order on reload).
 */
function adjacencyOf(
  nodes: readonly NodeModel[],
  links: readonly LinkModel[]
): Map<string, string[]> {
  const ids = new Set(nodes.map((n) => n.id));
  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const link of inStableOrder(links)) {
    const s = link.sourceNodeId;
    const t = link.targetNodeId;
    if (!s || !t || !ids.has(s) || !ids.has(t) || s === t) continue;
    adjacency.get(s)!.push(t);
    adjacency.get(t)!.push(s);
  }
  for (const list of adjacency.values()) list.sort();
  return adjacency;
}

// ---------------------------------------------------------------------------
// GRID
// ---------------------------------------------------------------------------

/**
 * Row-major grid. Ignores links entirely — that is the point: a grid is what you
 * reach for when the edges are NOT the story (a palette of components, a set of
 * unconnected cards).
 *
 * `direction` chooses the FILL ORDER of the same grid, not a different grid:
 * 'TB' fills left-to-right then down, 'LR' fills top-to-bottom then across,
 * 'BT'/'RL' mirror those.
 */
export function gridLayout(
  nodes: NodeModel[],
  _links: LinkModel[],
  options: GridLayoutPortfolioOptions = {}
): LayoutResult {
  const ordered = inStableOrder(nodes);
  if (ordered.length === 0) return emptyResult('grid');

  const nodeSpacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING;
  const rankSpacing = options.rankSpacing ?? DEFAULT_NODE_SPACING;

  const columns = Math.max(1, Math.floor(options.columns ?? Math.ceil(Math.sqrt(ordered.length))));
  const rows = Math.ceil(ordered.length / columns);

  // Uniform cells, so the grid reads as a grid even when the nodes differ in
  // size; each node is centred in its cell.
  const cellWidth = Math.max(...ordered.map((n) => nodeSize(n).width));
  const cellHeight = Math.max(...ordered.map((n) => nodeSize(n).height));

  const direction = options.direction ?? 'TB';
  const nodePositions = new Map<string, { x: number; y: number }>();

  ordered.forEach((node, i) => {
    let row: number;
    let column: number;

    if (direction === 'LR' || direction === 'RL') {
      // Column-major fill: down each column, then across.
      column = Math.floor(i / rows);
      row = i % rows;
    } else {
      column = i % columns;
      row = Math.floor(i / columns);
    }

    if (direction === 'RL') column = columns - 1 - column;
    if (direction === 'BT') row = rows - 1 - row;

    const size = nodeSize(node);
    nodePositions.set(node.id, {
      x: column * (cellWidth + nodeSpacing) + (cellWidth - size.width) / 2,
      y: row * (cellHeight + rankSpacing) + (cellHeight - size.height) / 2,
    });
  });

  return {
    nodePositions,
    bounds: boundsOf(ordered, nodePositions),
    metadata: { algorithm: 'grid', executionTime: 0, columns, rows },
  };
}

// ---------------------------------------------------------------------------
// CIRCULAR
// ---------------------------------------------------------------------------

/**
 * Every node on one ring.
 *
 * Nodes are ordered by a BFS from the lowest-id node rather than by id, because
 * a circle's readability is entirely about edge crossings and BFS order puts
 * neighbours next to each other. (Ordering by id would be equally deterministic
 * and much uglier — an arbitrary permutation guarantees chords across the whole
 * circle.)
 *
 * The radius is derived from the nodes' own footprints, so a circular layout of
 * 40 nodes does not stack them on top of each other the way a fixed radius does.
 */
export function circularLayout(
  nodes: NodeModel[],
  links: LinkModel[],
  options: CircularLayoutOptions = {}
): LayoutResult {
  const ordered = inStableOrder(nodes);
  if (ordered.length === 0) return emptyResult('circular');

  const spacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING;

  if (ordered.length === 1) {
    return {
      nodePositions: new Map([[ordered[0].id, { x: 0, y: 0 }]]),
      bounds: { x: 0, y: 0, ...nodeSize(ordered[0]) },
      metadata: { algorithm: 'circular', executionTime: 0, radius: 0 },
    };
  }

  // BFS ring order.
  const adjacency = adjacencyOf(ordered, links);
  const byId = new Map(ordered.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const ring: NodeModel[] = [];
  for (const start of ordered) {
    if (seen.has(start.id)) continue;
    seen.add(start.id);
    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      ring.push(byId.get(current)!);
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }

  // Each node claims arc proportional to its own size, so a big node does not
  // collide with the small ones beside it.
  const slots = ring.map((n) => slotOf(n, spacing));
  const circumference = slots.reduce((a, b) => a + b, 0);
  const radius = options.radius ?? Math.max(Math.max(...slots) / 2, circumference / (2 * Math.PI));

  const nodePositions = new Map<string, { x: number; y: number }>();
  let travelled = 0;
  ring.forEach((node, i) => {
    // Start at the top (-π/2) and go clockwise; the centre of the node's own arc.
    const angle = -Math.PI / 2 + (2 * Math.PI * (travelled + slots[i] / 2)) / circumference;
    travelled += slots[i];

    const size = nodeSize(node);
    nodePositions.set(node.id, {
      x: radius + radius * Math.cos(angle) - size.width / 2,
      y: radius + radius * Math.sin(angle) - size.height / 2,
    });
  });

  return {
    nodePositions,
    bounds: boundsOf(ring, nodePositions),
    metadata: { algorithm: 'circular', executionTime: 0, radius },
  };
}

// ---------------------------------------------------------------------------
// RADIAL
// ---------------------------------------------------------------------------

/**
 * Concentric rings by BFS depth from a hub.
 *
 * The wedge allocation is what makes it readable: each subtree gets an angular
 * slice PROPORTIONAL TO ITS LEAF COUNT, so a bushy branch is not crammed into the
 * same wedge as a single leaf. That is the classic radial-tree construction, and
 * it is crossing-free for trees.
 *
 * Ring radii are grown to fit — a ring is pushed outward if the nodes on it would
 * not otherwise fit around its circumference, which is the failure mode of every
 * "radius = depth * constant" radial layout at depth 3 and beyond.
 */
export function radialLayout(
  nodes: NodeModel[],
  links: LinkModel[],
  options: RadialLayoutOptions = {}
): LayoutResult {
  const ordered = inStableOrder(nodes);
  if (ordered.length === 0) return emptyResult('radial');
  if (ordered.length === 1) {
    return {
      nodePositions: new Map([[ordered[0].id, { x: 0, y: 0 }]]),
      bounds: { x: 0, y: 0, ...nodeSize(ordered[0]) },
      metadata: { algorithm: 'radial', executionTime: 0, rings: 0 },
    };
  }

  const nodeSpacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING;
  const rankSpacing = options.rankSpacing ?? DEFAULT_RANK_SPACING;

  const adjacency = adjacencyOf(ordered, links);
  const byId = new Map(ordered.map((n) => [n.id, n]));

  // Hub: the caller's node, else the highest-degree one (ties on lowest id).
  // Degree, not in-degree — a radial layout is for hub-and-spoke graphs, where
  // "the middle" means "the most connected", not "the source".
  const root =
    options.rootId && byId.has(options.rootId)
      ? options.rootId
      : ordered.reduce((best, n) =>
          (adjacency.get(n.id)?.length ?? 0) > (adjacency.get(best.id)?.length ?? 0) ? n : best
        ).id;

  // BFS tree.
  const depth = new Map<string, number>([[root, 0]]);
  const children = new Map<string, string[]>();
  for (const n of ordered) children.set(n.id, []);
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(current)! + 1);
      children.get(current)!.push(next);
      queue.push(next);
    }
  }

  // Leaf counts drive the wedge widths.
  const leaves = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const kids = children.get(id) ?? [];
    const total = kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + countLeaves(kid), 0);
    leaves.set(id, total);
    return total;
  };
  countLeaves(root);

  // Ring radii: monotone in depth, and wide enough for what sits on them.
  const perDepth = new Map<number, NodeModel[]>();
  for (const node of ordered) {
    const d = depth.get(node.id);
    if (d === undefined || d === 0) continue;
    if (!perDepth.has(d)) perDepth.set(d, []);
    perDepth.get(d)!.push(node);
  }
  const maxDepth = perDepth.size === 0 ? 0 : Math.max(...perDepth.keys());

  const rootSize = nodeSize(byId.get(root)!);
  const radii = new Map<number, number>([[0, 0]]);
  let previous = Math.max(rootSize.width, rootSize.height) / 2;
  for (let d = 1; d <= maxDepth; d++) {
    const onRing = perDepth.get(d) ?? [];
    const needed = onRing.reduce((sum, n) => sum + slotOf(n, nodeSpacing), 0) / (2 * Math.PI);
    const tallest = Math.max(0, ...onRing.map((n) => Math.max(nodeSize(n).width, nodeSize(n).height)));
    const radius = Math.max(previous + rankSpacing + tallest / 2, needed);
    radii.set(d, radius);
    previous = radius + tallest / 2;
  }

  // Wedge allocation: a node's children split its slice by leaf count.
  const angles = new Map<string, number>([[root, 0]]);
  const assign = (id: string, start: number, end: number): void => {
    angles.set(id, (start + end) / 2);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) return;
    const total = kids.reduce((sum, kid) => sum + (leaves.get(kid) ?? 1), 0);
    let cursor = start;
    for (const kid of kids) {
      const share = ((leaves.get(kid) ?? 1) / total) * (end - start);
      assign(kid, cursor, cursor + share);
      cursor += share;
    }
  };
  assign(root, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);

  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const node of ordered) {
    const d = depth.get(node.id);
    // Unreachable nodes cannot happen inside a component (that is what "connected"
    // means) — but a caller may hand this function a raw graph, so be safe rather
    // than silently dropping a node.
    const r = radii.get(d ?? 0) ?? 0;
    const angle = angles.get(node.id) ?? 0;
    const size = nodeSize(node);
    nodePositions.set(node.id, {
      x: r * Math.cos(angle) - size.width / 2,
      y: r * Math.sin(angle) - size.height / 2,
    });
  }

  return {
    nodePositions,
    bounds: boundsOf(ordered, nodePositions),
    metadata: { algorithm: 'radial', executionTime: 0, root, rings: maxDepth },
  };
}

// ---------------------------------------------------------------------------
// FORCE
// ---------------------------------------------------------------------------

/**
 * Force-directed, promoted from a raw adapter passthrough to a first-class named
 * layout.
 *
 * The physics is NOT reimplemented — `ForceLayoutAdapter` already has a
 * Fruchterman-Reingold simulation with a Barnes-Hut quadtree, and Card 0 seeded
 * it. What this adds is what makes it first-class:
 *
 *   • COMPONENT PACKING. Force's own answer to a disconnected graph is to blow
 *     the components apart with repulsion until the picture is mostly whitespace
 *     — gravity only pulls toward a single global centre. Per-component layout
 *     plus packing fixes that properly.
 *   • THE SHARED VOCABULARY. `nodeSpacing`/`rankSpacing` instead of
 *     `repulsion`/`linkDistance`.
 */
const forceAdapter = new ForceLayoutAdapter();

export function forceLayout(
  nodes: NodeModel[],
  links: LinkModel[],
  options: UnifiedLayoutOptions = {}
): Promise<LayoutResult> {
  const translated: Record<string, unknown> = { ...options };

  // Only override the adapter's defaults if the caller actually said something —
  // otherwise `engine.layout('force')` would silently change behaviour depending
  // on which spacing default happened to be in scope.
  if (options.nodeSpacing !== undefined) translated['repulsion'] = options.nodeSpacing;
  if (options.rankSpacing !== undefined) translated['linkDistance'] = options.rankSpacing;

  return forceAdapter.apply(nodes, links, translated);
}
