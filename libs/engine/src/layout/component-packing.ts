// Wave 7 (Auto-layout) — Card 2: disconnected-component packing.
//
// ---------------------------------------------------------------------------
// THE BUG THIS CLOSES
// ---------------------------------------------------------------------------
//
// Hand dagre a FOREST — three org charts with no edge between them — and it
// ranks all three roots into rank 0 and interleaves their children. The trees
// land on top of each other. Every naive layout integration has this bug, and it
// is the single most visible way an auto-layout feature looks broken: the user
// presses "arrange" and gets a pile.
//
// The fix is not per-algorithm. It is a WRAPPER that sits in front of EVERY
// registered layout (Card 0's `fromAdapter` and Card 2's portfolio alike):
//
//   1. split the graph into connected components,
//   2. lay each one out INDEPENDENTLY (the algorithm never sees the others, so
//      it cannot interleave them),
//   3. normalise each component's coordinates to its own origin,
//   4. pack the component bounding boxes.
//
// ---------------------------------------------------------------------------
// WHY SHELF PACKING
// ---------------------------------------------------------------------------
//
// The candidates were guillotine/binary-tree packing (the classic
// texture-atlas algorithm), MAXRECTS, and shelf (a.k.a. strip) packing.
//
// Shelf, first-fit-decreasing-height, is what ships here:
//
//   • Density. Binary-tree packing wins on paper, but only for boxes with wildly
//     varying aspect ratios. Graph components are roughly convex blobs with
//     similar aspects, and FFDH is provably within ~1.7x of optimal strip height
//     for those — the gap to a jigsaw packer is small.
//   • READABILITY, which is the real reason. Shelf packing produces ROWS. A
//     forest of five org charts reads as five charts on two tidy rows. A
//     binary-tree packer produces a jigsaw: a tall tree wedged into the gap
//     beside a short one, with no visual logic a human can follow. Denser, and
//     worse. Layout is a communication medium, not a bin-packing benchmark.
//   • Determinism is trivial to guarantee (sort by height desc, tie-break on id).
//
// The shelf width targets an ASPECT RATIO rather than a fixed width, so the
// packed result is roughly screen-shaped instead of one endless row.
//
// ---------------------------------------------------------------------------
// THE NO-OP GUARANTEE
// ---------------------------------------------------------------------------
//
// A connected graph has exactly ONE component, and a single component's own
// layout IS its packing. So the wrapper detects that case and delegates straight
// through, byte-for-byte untouched. Packing can therefore never regress an
// existing layout — it only ever fires where the old behaviour was a pile.

import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { LayoutResult } from './layout-adapter.interface';
// Type-only: component-packing must not import a VALUE from layout-registry,
// which imports this module for real. Type imports are erased, so no cycle.
import type { UnifiedLayoutOptions } from './layout-registry';
import { inStableOrder } from './rng';
import { removeOverlaps } from './overlap-removal';

/** Dagre's fallbacks, reused so every layout agrees on what an unsized node is. */
export const DEFAULT_NODE_WIDTH = 150;
export const DEFAULT_NODE_HEIGHT = 50;

/** A node's box, with the same defaults every layout in the portfolio uses. */
export function nodeSize(node: NodeModel): { width: number; height: number } {
  return {
    width: node.size?.width || DEFAULT_NODE_WIDTH,
    height: node.size?.height || DEFAULT_NODE_HEIGHT,
  };
}

/** One connected component: its nodes, and the links that live entirely inside it. */
export interface GraphComponent {
  nodes: NodeModel[];
  links: LinkModel[];
}

/**
 * The contract a layout must satisfy to be packable: nodes + links in, positions
 * out. Deliberately array-based (not DiagramModel-based) — a component is a
 * SUBSET of a diagram, and there is no such thing as a sub-DiagramModel.
 */
export type GraphLayoutFn = (
  nodes: NodeModel[],
  links: LinkModel[],
  options: UnifiedLayoutOptions
) => Promise<LayoutResult> | LayoutResult;

/** A box to pack, plus the id used to break ties deterministically. */
export interface PackBox {
  id: string;
  width: number;
  height: number;
}

export interface PackingOptions {
  /** Gap between packed components. Defaults to the layout's `nodeSpacing`. */
  spacing?: number;
  /** Target width/height of the packed result. 1.6 ≈ a landscape screen. */
  aspectRatio?: number;
}

const DEFAULT_COMPONENT_SPACING = 60;
const DEFAULT_ASPECT_RATIO = 1.6;

/**
 * Split a graph into connected components.
 *
 * Connectivity is UNDIRECTED — an edge joins its endpoints regardless of which
 * way it points. (A tree whose edges all point away from the root is still one
 * component; treating edges as directed would shatter it into leaves.)
 *
 * Deterministic: nodes are visited in id order and each node's neighbours are
 * visited in id order, so the components — and the order they come back in —
 * depend only on the graph, never on insertion order.
 */
export function findConnectedComponents(
  nodes: readonly NodeModel[],
  links: readonly LinkModel[]
): GraphComponent[] {
  const ordered = inStableOrder(nodes);
  const nodeIds = new Set(ordered.map((n) => n.id));

  // Only links whose BOTH endpoints are present can join anything. A dangling
  // link (endpoint deleted, or an id that never existed) is dropped here — which
  // incidentally fixes a live bug in the dagre adapter: `g.setEdge(a, b)` with an
  // unknown `b` makes dagre INVENT a node `b`, and the phantom's coordinates then
  // pollute the reported bounds.
  const realLinks = inStableOrder(links).filter(
    (l) => l.sourceNodeId && l.targetNodeId && nodeIds.has(l.sourceNodeId) && nodeIds.has(l.targetNodeId)
  );

  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const link of realLinks) {
    adjacency.get(link.sourceNodeId!)!.push(link.targetNodeId!);
    adjacency.get(link.targetNodeId!)!.push(link.sourceNodeId!);
  }
  for (const neighbours of adjacency.values()) neighbours.sort();

  const componentOf = new Map<string, number>();
  const groups: string[][] = [];

  for (const node of ordered) {
    if (componentOf.has(node.id)) continue;

    const index = groups.length;
    const members: string[] = [];
    const queue = [node.id];
    componentOf.set(node.id, index);

    while (queue.length > 0) {
      const current = queue.shift()!;
      members.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!componentOf.has(neighbour)) {
          componentOf.set(neighbour, index);
          queue.push(neighbour);
        }
      }
    }

    members.sort();
    groups.push(members);
  }

  const byId = new Map(ordered.map((n) => [n.id, n]));
  const components: GraphComponent[] = groups.map((members) => ({
    nodes: members.map((id) => byId.get(id)!),
    links: [],
  }));

  for (const link of realLinks) {
    components[componentOf.get(link.sourceNodeId!)!].links.push(link);
  }

  return components;
}

/**
 * Shelf packing, first-fit-decreasing-height.
 *
 * Returns the top-left OFFSET for every box. Boxes are laid left-to-right into
 * a shelf; when the next box would overflow the target width a new shelf opens
 * below the tallest box on the current one.
 */
export function packBoxes(
  boxes: readonly PackBox[],
  options: PackingOptions = {}
): Map<string, { x: number; y: number }> {
  const spacing = options.spacing ?? DEFAULT_COMPONENT_SPACING;
  const aspectRatio = options.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const offsets = new Map<string, { x: number; y: number }>();

  if (boxes.length === 0) return offsets;

  // Target width from the total area, so the packed result is roughly the
  // requested aspect instead of one endless row. Never narrower than the widest
  // box, or that box could not be placed at all.
  const totalArea = boxes.reduce((sum, b) => sum + (b.width + spacing) * (b.height + spacing), 0);
  const widest = Math.max(...boxes.map((b) => b.width));
  const targetWidth = Math.max(widest, Math.sqrt(totalArea * aspectRatio));

  // Tallest first — that is what makes shelves tight. Ties break on id, so the
  // packing is a pure function of the graph.
  const sorted = [...boxes].sort((a, b) =>
    b.height - a.height || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  for (const box of sorted) {
    if (shelfX > 0 && shelfX + box.width > targetWidth) {
      shelfY += shelfHeight + spacing;
      shelfX = 0;
      shelfHeight = 0;
    }

    offsets.set(box.id, { x: shelfX, y: shelfY });

    shelfX += box.width + spacing;
    shelfHeight = Math.max(shelfHeight, box.height);
  }

  return offsets;
}

/** The bounding box of a set of positioned nodes (positions are top-left). */
function boundsOf(
  nodes: readonly NodeModel[],
  positions: Map<string, { x: number; y: number }>
): { minX: number; minY: number; width: number; height: number } {
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

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 0, height: 0 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Run a layout with component packing.
 *
 * The wrapper every registered layout goes through. See the header: for a
 * CONNECTED graph this is a straight delegation (packing a single component is
 * the identity), so it cannot regress anything; for a disconnected one it is the
 * difference between a tidy row of trees and a pile.
 */
export async function layoutWithComponentPacking(
  name: string,
  fn: GraphLayoutFn,
  nodes: readonly NodeModel[],
  links: readonly LinkModel[],
  options: UnifiedLayoutOptions = {}
): Promise<LayoutResult> {
  const started = Date.now();
  const components = findConnectedComponents(nodes, links);

  if (components.length === 0) {
    return {
      nodePositions: new Map(),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      metadata: { algorithm: name, executionTime: 0, components: 0 },
    };
  }

  /**
   * Lay one component out, then separate any nodes the algorithm left on top of
   * each other.
   *
   * The overlap pass is here, not in the five algorithms, for the same reason
   * packing is: force and community lay out DIMENSIONLESS POINTS and happily
   * return boxes that intersect (see overlap-removal.ts). For every layout that
   * does not overlap — dagre, ELK, tree, grid, circular, radial — it is a
   * no-op, so it costs them one comparison pass and nothing else.
   */
  const solve = async (component: GraphComponent): Promise<LayoutResult> => {
    const result = await fn(component.nodes, component.links, options);
    if (options.removeOverlaps === false) return result;
    removeOverlaps(component.nodes, result.nodePositions, {
      spacing: options.nodeSpacing ?? DEFAULT_COMPONENT_SPACING / 3,
    });
    return result;
  };

  // THE NO-OP GUARANTEE. One component ⇒ the layout's own output IS the packing.
  // Delegate untouched (note this passes the FILTERED link list, so a dangling
  // link can no longer conjure a phantom dagre node).
  if (components.length === 1) {
    const result = await solve(components[0]);
    return {
      ...result,
      metadata: { ...(result.metadata ?? { algorithm: name, executionTime: 0 }), components: 1 },
    };
  }

  const spacing = options.componentSpacing ?? options.nodeSpacing ?? DEFAULT_COMPONENT_SPACING;

  // 1. Lay each component out on its own, then normalise it to its own origin.
  const laidOut: Array<{ box: PackBox; positions: Map<string, { x: number; y: number }> }> = [];

  for (const component of components) {
    const result = await solve(component);

    // The component's extent is measured from the POSITIONS, not from
    // `result.bounds` — adapters disagree about bounds (force adds 50px of
    // padding, dagre does not), and packing against inconsistent boxes leaves
    // ragged gutters.
    const b = boundsOf(component.nodes, result.nodePositions);

    const normalised = new Map<string, { x: number; y: number }>();
    for (const node of component.nodes) {
      const p = result.nodePositions.get(node.id);
      if (p) normalised.set(node.id, { x: p.x - b.minX, y: p.y - b.minY });
    }

    laidOut.push({
      // The component's id is its lowest node id — stable, and it is what makes
      // the packing order reproducible when two components are the same height.
      box: { id: component.nodes[0].id, width: b.width, height: b.height },
      positions: normalised,
    });
  }

  // 2. Pack the boxes and apply the offsets.
  const offsets = packBoxes(
    laidOut.map((c) => c.box),
    { spacing, aspectRatio: options.aspectRatio }
  );

  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const { box, positions } of laidOut) {
    const offset = offsets.get(box.id)!;
    for (const [id, p] of positions) {
      nodePositions.set(id, { x: p.x + offset.x, y: p.y + offset.y });
    }
  }

  const all = boundsOf(nodes, nodePositions);

  return {
    nodePositions,
    bounds: { x: all.minX, y: all.minY, width: all.width, height: all.height },
    metadata: {
      algorithm: name,
      executionTime: Date.now() - started,
      components: components.length,
      packing: 'shelf',
    },
  };
}
