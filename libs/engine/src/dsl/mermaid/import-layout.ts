/**
 * IMPORTED MERMAID, LAID OUT THE WAY MERMAID LAYS IT OUT.
 *
 * Mermaid places a flowchart or a state diagram with dagre, and dagre treats
 * every edge LABEL as a node of its own (a dummy in the rank between the two
 * ends). That one idea is what keeps Mermaid's pictures readable: the gap
 * between two ranks is as wide as the widest label in it, the labels of sibling
 * edges sit on their own branches, two edges between the same pair of nodes get
 * two paths, and an edge leaves its box on the side that faces the next rank.
 *
 * The rank placement this replaces (layout.ts) knew none of it: a fixed 75 px
 * between ranks ("Convert To Order" drew as "nvert To Ord", clipped by the
 * boxes it ran under), sibling labels stacked at the trunk, both directions of
 * a pair on one track, and boxes a fixed 120×80 that cut a label after three
 * lines. So the import now sizes every box to its label first (the renderer's
 * own text metrics, below), lays the graph out with dagre — already the
 * engine's hierarchical layout dependency — and hands the renderer each edge's
 * route: the ports where it meets its boxes, the waypoints between, and where
 * its label sits on it.
 *
 * SYNCHRONOUS and DETERMINISTIC, like the placement it replaces: an import is a
 * parse, and the same text must draw the same picture every time.
 */
import * as dagreNs from '@dagrejs/dagre';
import type { DiagramModel } from '../../models/DiagramModel';
import type { NodeModel } from '../../models/NodeModel';
import type { LinkModel } from '../../models/LinkModel';
import { ensureSideAnchorPort } from '../../ports/side-anchor';

// CJS interop, as in HierarchicalLayoutAlgorithm: Node's ESM loader exposes
// dagre's API only on `.default`.
const dagre: typeof dagreNs = (dagreNs as unknown as { default?: typeof dagreNs }).default ?? dagreNs;

// ── The renderer's text metrics ──────────────────────────────────────────────
// A box sized here must hold its label THERE, so these are the renderer's own
// numbers (libs/renderer/src/svg/text-block.ts and LabelRenderer.ts): node
// labels at the theme's md size, 1.2 line height, an average glyph of 0.6 em;
// edge labels at 12 px with 4 px of padding. A renderer spec
// (mermaid-import-fit.spec.ts) fails if the two ever disagree.

/** Node label font size (the default theme's `typography.fontSize.md`). */
export const IMPORT_NODE_FONT = 14;
/** Node label line height, as a multiple of the font size. */
export const IMPORT_LINE_HEIGHT = 1.2;
/** Edge label font size and padding (LabelRenderer's defaults). */
export const IMPORT_EDGE_FONT = 12;
export const IMPORT_EDGE_PAD = 4;
/** Mermaid's wrapping width: a label wider than this wraps, then the box grows taller. */
export const IMPORT_WRAP_WIDTH = 200;

/** The renderer's width estimate: an average glyph is ~0.6 em. */
export function estimateLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

/**
 * The renderer's word wrap, line for line (text-block.ts `wrapText`): hard
 * breaks first, then greedy words; a word wider than the line breaks at its
 * hyphens, and one with none stays whole.
 */
export function wrapLabelLines(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .flatMap((w) => breakAtHyphens(w, maxWidth, fontSize));
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (estimateLabelWidth(test, fontSize) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [text];
}

function breakAtHyphens(word: string, maxWidth: number, fontSize: number): string[] {
  if (estimateLabelWidth(word, fontSize) <= maxWidth || !word.includes('-')) return [word];
  const pieces: string[] = [];
  let current = '';
  for (const seg of word.split(/(?<=-)/)) {
    const test = current + seg;
    if (current && estimateLabelWidth(test, fontSize) > maxWidth) {
      pieces.push(current);
      current = seg;
    } else {
      current = test;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

type Box = { w: number; h: number };

/**
 * The label box inside a shape of outer size w×h — the renderer's `innerRect`
 * for the shapes a Mermaid import draws. Anything not listed gets the
 * renderer's default: the box inset by 8 px.
 */
export function importInnerBox(shape: string, w: number, h: number): Box {
  switch (shape) {
    case 'circle': {
      const d = Math.min(w, h);
      return { w: 0.6 * d, h: 0.6 * d };
    }
    case 'ellipse':
      return { w: 0.6 * w, h: 0.6 * h };
    case 'diamond':
      return { w: 0.5 * w, h: 0.5 * h };
    case 'stadium':
      return { w: Math.max(0, w - h), h: 0.7 * h };
    default: {
      const pad = Math.max(0, Math.min(8, w / 2 - 1, h / 2 - 1));
      return { w: w - 2 * pad, h: h - 2 * pad };
    }
  }
}

/** The smallest outer size whose label box holds `content` (the inversion of importInnerBox). */
function outerForContent(shape: string, content: Box): Box {
  switch (shape) {
    case 'circle': {
      const d = Math.max(content.w, content.h) / 0.6;
      return { w: d, h: d };
    }
    case 'ellipse':
      return { w: content.w / 0.6, h: content.h / 0.6 };
    case 'diamond':
      return { w: content.w / 0.5, h: content.h / 0.5 };
    case 'stadium': {
      const h = content.h / 0.7;
      return { w: content.w + h, h };
    }
    default:
      return { w: content.w + 16, h: content.h + 16 };
  }
}

/**
 * Grow a node so the renderer draws ALL of its label: Mermaid's rule — wrap at
 * 200 px, then grow taller — and never narrower than the longest word, so a
 * long single-word name widens its box instead of shrinking to a few pixels.
 * A box only grows: the shape's own default size stays the floor.
 */
export function fitNodeToLabel(node: NodeModel): void {
  const label = String(node.getLabel?.() ?? '');
  if (!label.trim()) return;
  const shape = String((node.getMetadata('shape') as { type?: string } | undefined)?.type ?? 'rect');
  const fontSize =
    (node.style as { fontSize?: number } | undefined)?.fontSize ?? IMPORT_NODE_FONT;
  const lineHeight = fontSize * IMPORT_LINE_HEIGHT;
  const { width, height } = node.size;
  const inner = importInnerBox(shape, width, height);

  const paragraphs = label.split('\n');
  const oneLine = Math.max(...paragraphs.map((p) => estimateLabelWidth(p, fontSize)));
  const longestWord = Math.max(
    0,
    ...label.split(/[\s-]+/).map((word) => estimateLabelWidth(word, fontSize))
  );
  let textWidth = inner.w;
  if (oneLine > inner.w) textWidth = Math.max(inner.w, Math.min(oneLine, IMPORT_WRAP_WIDTH));
  textWidth = Math.max(textWidth, longestWord);
  const lines = wrapLabelLines(label, textWidth, fontSize).length;
  // +1: the renderer counts the lines that FIT as floor(inner height / line height).
  const textHeight = Math.max(inner.h, lines * lineHeight + 1);
  if (textWidth <= inner.w && textHeight <= inner.h) return;

  const outer = outerForContent(shape, { w: textWidth, h: textHeight });
  const w = Math.ceil(Math.max(width, outer.w));
  const h = Math.ceil(Math.max(height, outer.h));
  if (w !== width || h !== height) node.setSize(w, h, node.size.depth ?? 0);
}

/** The box the renderer draws for a link's label (LabelRenderer.labelBox), or undefined for none. */
export function importEdgeLabelBox(link: LinkModel): Box | undefined {
  const label = link.labels?.[0];
  const text = label?.text ?? (link.getMetadata('label') as string | undefined);
  if (!text) return undefined;
  const style = (label?.style ?? {}) as { fontSize?: number; padding?: number };
  const fontSize = style.fontSize ?? IMPORT_EDGE_FONT;
  const padding = style.padding ?? IMPORT_EDGE_PAD;
  return { w: estimateLabelWidth(text, fontSize) + 2 * padding, h: fontSize + 2 * padding };
}

// ── dagre ────────────────────────────────────────────────────────────────────

export interface ImportLayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface ImportLayoutEdge {
  /** Unique per edge (a link id): two edges between one pair are two edges. */
  key: string;
  from: string;
  to: string;
  /** The label's box, when the edge has one. */
  label?: Box;
}

export interface ImportRoute {
  /** The polyline, from the source box's edge to the target box's edge. */
  points: Array<{ x: number; y: number }>;
  /** Where the label's centre sits, when the edge has one. */
  label?: { x: number; y: number };
}

export interface ImportLayout {
  /** Top-left per node, the block starting at (0, 0). */
  positions: Map<string, { x: number; y: number }>;
  /** dagre's rank per node (labels take ranks too, so only the ORDER means anything). */
  ranks: Map<string, number>;
  /** The route per edge key, in the same coordinates. */
  routes: Map<string, ImportRoute>;
  width: number;
  height: number;
}

export interface ImportLayoutOptions {
  /** TD / TB / BT / LR / RL. Default TB. */
  direction?: string;
  /** Gap between boxes in a rank (Mermaid's nodeSpacing, 50). */
  nodeSpacing?: number;
  /** Gap between ranks (Mermaid's rankSpacing, 50) — labels widen it. */
  rankSpacing?: number;
  /**
   * Containment: node or cluster id → the cluster (a subgraph) it sits in.
   * dagre keeps a cluster's members together, so its frame encloses them and
   * nothing else.
   */
  parents?: ReadonlyMap<string, string>;
}

/**
 * Lay out boxes and edges with dagre. Labels are dagre edge labels (`labelpos:
 * 'c'`): dagre makes room for them in the rank between the two ends and keeps
 * sibling labels apart. Self-loops are dagre's too.
 */
export function layoutForImport(
  nodes: readonly ImportLayoutNode[],
  edges: readonly ImportLayoutEdge[],
  options: ImportLayoutOptions = {}
): ImportLayout {
  const positions = new Map<string, { x: number; y: number }>();
  const ranks = new Map<string, number>();
  const routes = new Map<string, ImportRoute>();
  if (nodes.length === 0) return { positions, ranks, routes, width: 0, height: 0 };

  const parents = options.parents ?? new Map<string, string>();
  const g = new dagre.graphlib.Graph({ multigraph: true, directed: true, compound: parents.size > 0 });
  g.setGraph({
    rankdir: dagreRankdir(options.direction),
    nodesep: options.nodeSpacing ?? 50,
    ranksep: options.rankSpacing ?? 50,
    edgesep: 20,
    marginx: 0,
    marginy: 0,
  });
  const ids = new Set<string>();
  for (const node of nodes) {
    ids.add(node.id);
    g.setNode(node.id, { width: node.width, height: node.height });
  }
  // Clusters: every ancestor of a laid-out node, as a sizeless compound node.
  for (const id of [...ids]) {
    let child = id;
    for (let parent = parents.get(child); parent !== undefined; parent = parents.get(child)) {
      if (!g.hasNode(parent)) g.setNode(parent, {});
      g.setParent(child, parent);
      child = parent;
    }
  }
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    g.setEdge(
      edge.from,
      edge.to,
      edge.label
        ? { width: edge.label.w, height: edge.label.h, labelpos: 'c' }
        : { width: 0, height: 0 },
      edge.key
    );
  }
  dagre.layout(g);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const node of nodes) {
    const n = g.node(node.id) as { x: number; y: number; width: number; height: number };
    grow(n.x - n.width / 2, n.y - n.height / 2);
    grow(n.x + n.width / 2, n.y + n.height / 2);
  }
  for (const e of g.edges()) {
    const edge = g.edge(e) as { points?: Array<{ x: number; y: number }>; x?: number; y?: number; width?: number; height?: number };
    for (const p of edge.points ?? []) grow(p.x, p.y);
    if (edge.x !== undefined && edge.y !== undefined && edge.width) {
      grow(edge.x - edge.width / 2, edge.y - (edge.height ?? 0) / 2);
      grow(edge.x + edge.width / 2, edge.y + (edge.height ?? 0) / 2);
    }
  }
  const dx = -minX;
  const dy = -minY;
  for (const node of nodes) {
    const n = g.node(node.id) as { x: number; y: number; width: number; height: number; rank?: number };
    positions.set(node.id, { x: n.x - n.width / 2 + dx, y: n.y - n.height / 2 + dy });
    ranks.set(node.id, n.rank ?? 0);
  }
  for (const e of g.edges()) {
    const edge = g.edge(e) as { points?: Array<{ x: number; y: number }>; x?: number; y?: number; width?: number };
    if (!e.name) continue;
    routes.set(e.name, {
      points: (edge.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
      ...(edge.width && edge.x !== undefined && edge.y !== undefined
        ? { label: { x: edge.x + dx, y: edge.y + dy } }
        : {}),
    });
  }
  return { positions, ranks, routes, width: maxX - minX, height: maxY - minY };
}

function dagreRankdir(direction: string | undefined): 'TB' | 'BT' | 'LR' | 'RL' {
  switch (String(direction ?? 'TB').toUpperCase()) {
    case 'BT':
      return 'BT';
    case 'LR':
      return 'LR';
    case 'RL':
      return 'RL';
    default:
      return 'TB';
  }
}

// ── Handing a route to the renderer ─────────────────────────────────────────

/**
 * Take back the route an import gave `link` (its bends, its waypoint flag,
 * its layout anchoring): the author pinned a side or drew their own bends, or
 * another layout is about to place the boxes. The link is routed like any
 * other from then on.
 */
export function clearImportRoute(link: LinkModel, diagram: DiagramModel): void {
  if (link.getMetadata('importRoute') !== true) return;
  link.setMetadata('importRoute', false);
  link.setMetadata('hasManualWaypoints', false);
  link.setMetadata('layoutAnchored', false);
  link.setPoints([]);
  // The link's own ports come back: the side anchors were the route's, and
  // left behind they read as sides an author pinned.
  const own = link.getMetadata('importPorts') as { source?: string; target?: string } | undefined;
  const source = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : undefined;
  const target = link.targetNodeId ? diagram.getNode(link.targetNodeId) : undefined;
  if (own?.source && source?.getPort(own.source)) repointLinkEnd(diagram, link, 'source', source, own.source);
  if (own?.target && target?.getPort(own.target)) repointLinkEnd(diagram, link, 'target', target, own.target);
}

/**
 * Move one end of `link` to `portId` on `node`, keeping both ports' books: the
 * old port lets the link go, the new one holds it. `setSourcePort` alone only
 * re-points the link, which left the new port reporting no connections (and
 * the old one still holding a link that had left it).
 */
export function repointLinkEnd(
  diagram: DiagramModel,
  link: LinkModel,
  end: 'source' | 'target',
  node: NodeModel,
  portId: string
): void {
  const current = end === 'source' ? link.sourcePortId : link.targetPortId;
  if (current === portId) return;
  if (current) diagram.getPortById(current)?.removeConnection(link.id);
  if (end === 'source') link.setSourcePort(portId, node.id);
  else link.setTargetPort(portId, node.id);
  node.getPort(portId)?.addConnection(link.id, end);
}

type Side = 'left' | 'right' | 'top' | 'bottom';

/** Shapes whose silhouette is not their bounding box: ports go to the side's middle. */
const CURVED = new Set(['circle', 'ellipse', 'diamond', 'stadium', 'hexagon']);

/**
 * The side of `node` a route meets at `p`, and where along it (0–100 %).
 * dagre's ends lie on the bounding box; a curved silhouette meets its box only
 * at a side's middle, so its port goes there.
 */
function sideAnchor(node: NodeModel, p: { x: number; y: number }): { side: Side; pct: number } {
  const { x, y } = node.position;
  const { width: w, height: h } = node.size;
  const distances: Array<[Side, number]> = [
    ['left', Math.abs(p.x - x)],
    ['right', Math.abs(p.x - (x + w))],
    ['top', Math.abs(p.y - y)],
    ['bottom', Math.abs(p.y - (y + h))],
  ];
  const side = distances.reduce((best, d) => (d[1] < best[1] ? d : best))[0];
  const shape = String((node.getMetadata('shape') as { type?: string } | undefined)?.type ?? 'rect');
  if (CURVED.has(shape)) return { side, pct: 50 };
  const along = side === 'left' || side === 'right' ? (p.y - y) / h : (p.x - x) / w;
  // Clear of the corners (a rounded box's radius), on a 1 % grid so ports are reused.
  return { side, pct: Math.round(Math.max(0.15, Math.min(0.85, along)) * 100) };
}

const NORMAL: Record<Side, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** The side a forward edge leaves and the side it enters, per direction. */
function flowSides(direction: string | undefined): { out: Side; in: Side } | undefined {
  switch (String(direction ?? 'TB').toUpperCase()) {
    case 'LR':
      return { out: 'right', in: 'left' };
    case 'RL':
      return { out: 'left', in: 'right' };
    case 'BT':
      return { out: 'top', in: 'bottom' };
    case 'TB':
    case 'TD':
      return { out: 'bottom', in: 'top' };
    default:
      return undefined;
  }
}

/**
 * Where on `side` of `node` the ray from its centre towards `toward` crosses
 * it, as a percentage along the side (clear of the corners). The middle when
 * the point is not beyond that side.
 */
function aimedPct(node: NodeModel, side: Side, toward: { x: number; y: number }): number {
  const { x, y } = node.position;
  const { width: w, height: h } = node.size;
  const shape = String((node.getMetadata('shape') as { type?: string } | undefined)?.type ?? 'rect');
  if (CURVED.has(shape)) return 50;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  let along: number;
  if (side === 'left' || side === 'right') {
    const reach = side === 'right' ? w / 2 : -w / 2;
    if (dx === 0 || Math.sign(dx) !== Math.sign(reach)) return 50;
    along = (cy + (dy * reach) / dx - y) / h;
  } else {
    const reach = side === 'bottom' ? h / 2 : -h / 2;
    if (dy === 0 || Math.sign(dy) !== Math.sign(reach)) return 50;
    along = (cx + (dx * reach) / dy - x) / w;
  }
  return Math.round(Math.max(0.15, Math.min(0.85, along)) * 100);
}

/** Does `outer`'s box contain `inner`'s centre (a composite state, around its children)? */
function encloses(outer: NodeModel, inner: NodeModel): boolean {
  const cx = inner.position.x + inner.size.width / 2;
  const cy = inner.position.y + inner.size.height / 2;
  return (
    cx > outer.position.x &&
    cx < outer.position.x + outer.size.width &&
    cy > outer.position.y &&
    cy < outer.position.y + outer.size.height
  );
}

/**
 * Does the segment a→b come within 8 px of any of the boxes? The line drawn
 * through a route is a curve, which swings a little wide of its legs: a leg
 * that only grazes a box is drawn across its corner.
 */
function cutsAny(a: { x: number; y: number }, b: { x: number; y: number }, boxes: readonly NodeModel[]): boolean {
  const CLEAR = 8;
  for (const n of boxes) {
    const x0 = n.position.x - CLEAR;
    const y0 = n.position.y - CLEAR;
    const x1 = n.position.x + n.size.width + CLEAR;
    const y1 = n.position.y + n.size.height + CLEAR;
    for (let i = 0; i <= 24; i++) {
      const x = a.x + ((b.x - a.x) * i) / 24;
      const y = a.y + ((b.y - a.y) * i) / 24;
      if (x > x0 && x < x1 && y > y0 && y < y1) return true;
    }
  }
  return false;
}

/** The end of a route on `node`, heading to `toward`: the first candidate whose leg clears every other box. */
function pickAnchor(
  node: NodeModel,
  toward: { x: number; y: number },
  flowSide: Side | undefined,
  dagreSide: Side,
  obstacles: readonly NodeModel[]
): { side: Side; pct: number } {
  const sides: Side[] = [];
  for (const side of [flowSide, dagreSide, 'right', 'bottom', 'left', 'top'] as Array<Side | undefined>) {
    if (side && !sides.includes(side)) sides.push(side);
  }
  const candidates: Array<{ side: Side; pct: number }> = [];
  for (const side of sides) {
    candidates.push({ side, pct: aimedPct(node, side, toward) });
    if (side === flowSide || side === dagreSide) for (const pct of [50, 15, 85]) candidates.push({ side, pct });
  }
  for (const c of candidates) {
    const p = anchorPoint(node, c.side, c.pct);
    const n = NORMAL[c.side];
    // Leaving through the box itself is never an option (a side facing away from where the line goes).
    if ((toward.x - p.x) * n.x + (toward.y - p.y) * n.y < 0) continue;
    if (!cutsAny(p, toward, obstacles)) return c;
  }
  return candidates[0];
}

/** Does `target` lie wholly past `source` along the flow (so the edge is a forward one)? */
function goesWithFlow(source: NodeModel, target: NodeModel, out: Side): boolean {
  const s = source.position;
  const t = target.position;
  switch (out) {
    case 'right':
      return t.x >= s.x + source.size.width;
    case 'left':
      return t.x + target.size.width <= s.x;
    case 'bottom':
      return t.y >= s.y + source.size.height;
    default:
      return t.y + target.size.height <= s.y;
  }
}

function anchorPoint(node: NodeModel, side: Side, pct: number): { x: number; y: number } {
  const { x, y } = node.position;
  const { width: w, height: h } = node.size;
  const t = pct / 100;
  switch (side) {
    case 'left':
      return { x, y: y + t * h };
    case 'right':
      return { x: x + w, y: y + t * h };
    case 'top':
      return { x: x + t * w, y };
    default:
      return { x: x + t * w, y: y + h };
  }
}

/** Arc-length fraction of the point on `points` nearest to `p`. */
function fractionAlong(points: ReadonlyArray<{ x: number; y: number }>, p: { x: number; y: number }): number {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(len);
    total += len;
  }
  if (total <= 0) return 0.5;
  let best = { d: Infinity, at: total / 2 };
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = lengths[i];
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) best = { d, at: walked + t * len };
    walked += len;
  }
  return best.at / total;
}

/**
 * Give `link` the route the import's layout computed (world coordinates):
 *
 *  - its ports go where the route meets its two boxes (so it leaves the side
 *    that faces the next rank, and two edges into one box arrive apart);
 *  - the route's bends become its waypoints, flagged as a LAYOUT's route
 *    (`importRoute`, `layoutAnchored`), so the exporter writes no `via:` for
 *    them and the model drops them the moment either box moves (see
 *    DiagramModel's node-move handling);
 *  - its label sits where the layout made room for it.
 */
export function applyImportRoute(
  link: LinkModel,
  diagram: DiagramModel,
  route: ImportRoute,
  direction?: string
): void {
  const source = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : undefined;
  const target = link.targetNodeId ? diagram.getNode(link.targetNodeId) : undefined;
  if (!source || !target || route.points.length < 2) return;
  let points = route.points.map((p) => ({ ...p }));

  // WHERE EACH END LEAVES ITS BOX. dagre's middle legs run in the gaps between
  // ranks, so only the two end legs can cut across another box. Each end tries,
  // in order: the side facing the next rank, aimed where the line goes next
  // (an edge with the flow leaves right in LR, left in RL, down in TB — and
  // sibling edges leave apart instead of all from the middle); the side dagre
  // chose, aimed; that side's ends and middle; then the other sides — and
  // takes the first whose leg clears every other box.
  const flow = flowSides(direction);
  const forward = !!flow && source !== target && goesWithFlow(source, target, flow.out);
  const next = points.length > 2 ? points[1] : points[points.length - 1];
  const prev = points.length > 2 ? points[points.length - 2] : points[0];
  const obstacles = diagram
    .getNodes()
    .filter((n) => n !== source && n !== target && !encloses(n, source) && !encloses(n, target));
  const from = pickAnchor(source, next, forward ? flow!.out : undefined, sideAnchor(source, points[0]).side, obstacles);
  const to = pickAnchor(target, prev, forward ? flow!.in : undefined, sideAnchor(target, points[points.length - 1]).side, obstacles);
  const sourcePort = ensureSideAnchorPort(source, `${from.side}@${from.pct}%`);
  const targetPort = ensureSideAnchorPort(target, `${to.side}@${to.pct}%`);
  if (!sourcePort || !targetPort) return;
  // Remember the link's own ports, so taking the route back restores them.
  if (!link.getMetadata('importPorts')) {
    link.setMetadata('importPorts', { source: link.sourcePortId, target: link.targetPortId });
  }
  repointLinkEnd(diagram, link, 'source', source, sourcePort);
  repointLinkEnd(diagram, link, 'target', target, targetPort);
  const start = anchorPoint(source, from.side, from.pct);
  const end = anchorPoint(target, to.side, to.pct);
  // A straight LEAD at each end, out of the box along its side's normal, so the
  // curve leaves and arrives square to the box (the look of Mermaid's basis
  // curve) instead of swinging back across the box it left. Usually short; as
  // long as it takes when the leg beyond it would cut a box of the same rank
  // (dagre bends an edge only between ranks: a box beside its source can sit
  // right across its first leg).
  const interior = points.slice(1, -1);
  const lead = (p: { x: number; y: number }, side: Side, next: { x: number; y: number }) => {
    const n = NORMAL[side];
    const room = Math.abs((next.x - p.x) * n.x + (next.y - p.y) * n.y);
    const short = Math.min(10, room / 4);
    if (short < 4) return [];
    for (let d = short; d <= room * 0.8; d += 8) {
      const q = { x: p.x + n.x * d, y: p.y + n.y * d };
      if (!cutsAny(q, next, obstacles) && !cutsAny(p, q, obstacles)) return [q];
    }
    return [{ x: p.x + n.x * short, y: p.y + n.y * short }];
  };
  points = [
    start,
    ...lead(start, from.side, interior[0] ?? end),
    ...interior,
    ...lead(end, to.side, interior[interior.length - 1] ?? start).reverse(),
    end,
  ];

  link.setPoints(points);
  link.setMetadata('hasManualWaypoints', true);
  link.setMetadata('layoutAnchored', true);
  link.setMetadata('importRoute', true);

  if (route.label) {
    const position = fractionAlong(points, route.label);
    const text = link.labels?.[0]?.text ?? (link.getMetadata('label') as string | undefined);
    if (link.labels?.length) {
      // A named slot wins over a position (linkLabelPosition), so the slot goes.
      const [first, ...rest] = link.labels;
      const { slot: _slot, ...placed } = first;
      link.setLabels([{ ...placed, position }, ...rest]);
    } else if (text) {
      // A label kept only as metadata (the state builder's) is drawn by the
      // renderer's legacy path at the middle, nudged 10 px up — not where the
      // layout made room. A real label, placed, takes over (the legacy one
      // steps aside when `labels` is not empty).
      link.addLabel({ text, position });
    }
  }
}
