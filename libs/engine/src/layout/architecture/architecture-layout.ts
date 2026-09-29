/**
 * THE ARCHITECTURE LAYOUT — a composition, not a ranking.
 *
 * Layered, ELK and dagre rank a graph and minimise crossings. The diagrams AI
 * tools hand-draw as SVG are not that: they are REGIONS on a grid (the actor on
 * the left, "their side" above "our side"), boxes ALIGNED in rows inside them,
 * lines STRAIGHT where boxes line up and bent in the GUTTERS between regions, a
 * note BESIDE the thing it warns about. Every container — the diagram itself or a
 * zone (a Mermaid subgraph) — is arranged the same way, recursively:
 *
 *   1. its children go into COLUMNS along the flow (LR: left to right), by rank
 *      over the lines between them; a cycle is broken in declaration order;
 *   2. children joined by a line that names a CROSS side (`from:top`, `to:bottom`
 *      in LR) STACK in one column, the upper one where the line says;
 *   3. boxes are sized to their words; boxes in a column share a width, boxes in
 *      a row share a height; stacked zones share one column grid, so the box over
 *      a box lines up;
 *   4. a gap is as wide as the widest label that has to fit in it;
 *   5. a box that talks to several boxes stacked beside it SPANS them, so every
 *      one of its lines can run straight;
 *   6. each zone keeps a band for its caption (top, or bottom for `bottom-*`).
 *
 * Then every line gets side anchors at a height (or x) both of its boxes cover —
 * straight — spread when several lines join the same two boxes; a line that
 * cannot run straight bends in the gutter between the regions it joins. A note
 * with `metadata.near` is placed beside its target.
 *
 * RL and BT run a container's flow backwards (its content is mirrored along its
 * own flow axis, captions stay put). Four or more boxes with no line to a sibling
 * wrap into a grid in reading order instead of a tower.
 *
 * Writes sizes, positions, zone frames, anchors and bends into the model.
 */
import type { DiagramModel } from '../../models/DiagramModel';
import type { NodeModel } from '../../models/NodeModel';
import type { GroupModel } from '../../models/GroupModel';
import type { LinkModel } from '../../models/LinkModel';
import { ensureSideAnchorPort, isSideAnchorPort, parseSideAnchor, type AnchorSide } from '../../ports/side-anchor';
import { estimateTextWidth, widestLine, type MeasureText, type TextFont } from './text-metrics';

export interface ArchitectureLayoutOptions {
  /** 'LR' (default: the diagram's own direction, else LR) or 'TB'. */
  direction?: string;
  /** Measures a line of text; the default estimates (the engine has no canvas). */
  measureText?: MeasureText;
  /** Space around the whole drawing. */
  margin?: number;
}

export interface ArchitectureLayoutResult {
  nodePositions: Map<string, { x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number };
}

/** The composition's spacing, px. */
const K = {
  // the renderer wraps a name inside ~20 px either side; 2 more absorb the estimate's error
  boxPadX: 22,
  boxPadY: 18,
  minBoxW: 120,
  minBoxH: 56,
  zonePadSide: 30,
  zonePadPlain: 26,
  zoneCaptionBand: 44,
  gapFlow: 64,
  labelPad: 24,
  gapCrossLeaf: 32,
  gapCrossZone: 40,
  labelLine: 1.35,
  nearGap: 16,
  minOverlap: 12,
};

const ROOT = '\u0000architecture-root';

type Axis = 'x' | 'y';
interface Sz { w: number; h: number }
interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }

interface LeafBlock {
  kind: 'node';
  id: string;
  node: NodeModel;
  decl: number;
  size: Sz;
}
interface ZoneBlock {
  kind: 'zone';
  id: string;
  group?: GroupModel;
  decl: number;
  axis: Axis;
  /** RL / BT: the flow runs backwards along `axis`. */
  reverse: boolean;
  children: Block[];
  size: Sz;
  pad: { l: number; r: number; t: number; b: number };
  plan?: Plan;
}
type Block = LeafBlock | ZoneBlock;

interface Plan {
  columns: Block[][];
  /** Lines between children, as child-index pairs: along the flow, and across it (upper, lower). */
  links: Array<{ a: number; b: number; link: LinkModel }>;
  colF: number[];
  gapF: number[];
  /** Position of each child block relative to the container's content origin. */
  rel: Map<string, Pt>;
  content: Sz;
  /** Set by a parent that lines this zone's columns up with a stacked sibling's. */
  sharedColF?: number[];
  sharedGapF?: number[];
}

const fOf = (s: Sz, a: Axis) => (a === 'x' ? s.w : s.h);
const cOf = (s: Sz, a: Axis) => (a === 'x' ? s.h : s.w);
const sz = (f: number, c: number, a: Axis): Sz => (a === 'x' ? { w: f, h: c } : { w: c, h: f });
const pt = (f: number, c: number, a: Axis): Pt => (a === 'x' ? { x: f, y: c } : { x: c, y: f });
const axisOf = (dir: string): Axis => (/^(TB|TD|BT)$/i.test(dir.trim()) ? 'y' : 'x');
const reversedOf = (dir: string): boolean => /^(RL|BT)$/i.test(dir.trim());
const opposite = (s: AnchorSide): AnchorSide => (s === 'left' ? 'right' : s === 'right' ? 'left' : s === 'top' ? 'bottom' : 'top');
const SHAPES_NEEDING_ROOM = new Set(['diamond', 'rhombus', 'circle', 'ellipse', 'hexagon', 'decision', 'doublecircle']);

/** Lay a diagram out as an architecture composition. Writes into the model. */
export function layoutArchitecture(diagram: DiagramModel, options: ArchitectureLayoutOptions = {}): ArchitectureLayoutResult {
  return new ArchitectureComposer(diagram, options).run();
}

class ArchitectureComposer {
  private readonly measure: MeasureText;
  private readonly margin: number;
  private readonly rootAxis: Axis;
  private readonly rootReverse: boolean;
  /** Every block's parent: a node's innermost zone, a zone's parent zone, else ROOT. */
  private readonly parentOf = new Map<string, string>();
  private readonly blocks = new Map<string, Block>();
  /** Absolute rect of every placed block (node box or zone frame). */
  private readonly abs = new Map<string, Rect>();
  private readonly notes: Array<{ node: NodeModel; target: string; side: string; gap: number }> = [];

  constructor(private readonly diagram: DiagramModel, options: ArchitectureLayoutOptions) {
    this.measure = options.measureText ?? estimateTextWidth;
    this.margin = options.margin ?? 20;
    const dir = options.direction ?? String(diagram.getMetadata('direction') ?? 'LR');
    this.rootAxis = axisOf(dir);
    this.rootReverse = reversedOf(dir);
  }

  run(): ArchitectureLayoutResult {
    const root = this.buildTree();
    this.structure(root);
    this.position(root);
    this.place(root, { x: this.margin, y: this.margin });
    this.placeNotes();
    this.commit();
    this.anchorLines();
    const nodePositions = new Map<string, Pt>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.diagram.getNodes()) {
      const r = this.abs.get(n.id);
      if (!r) continue;
      nodePositions.set(n.id, { x: r.x, y: r.y });
    }
    for (const r of this.abs.values()) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    }
    const bounds = Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : { x: 0, y: 0, width: 0, height: 0 };
    return { nodePositions, bounds };
  }

  // ---------------------------------------------------------------- the tree

  private buildTree(): ZoneBlock {
    const groups = this.diagram.getGroups();
    const nodes = this.diagram.getNodes();
    const depth = (g: GroupModel): number => {
      let d = 0;
      let cur: GroupModel | undefined = g;
      const seen = new Set<string>();
      while (cur?.parentGroupId && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = this.diagram.getGroup(cur.parentGroupId);
        d++;
      }
      return d;
    };
    for (const g of groups) this.parentOf.set(g.id, g.parentGroupId && this.diagram.getGroup(g.parentGroupId) ? g.parentGroupId : ROOT);
    for (const n of nodes) {
      let best: GroupModel | undefined;
      for (const g of groups) if (g.members.has(n.id) && (!best || depth(g) > depth(best))) best = g;
      this.parentOf.set(n.id, best ? best.id : ROOT);
    }

    const root: ZoneBlock = { kind: 'zone', id: ROOT, decl: 0, axis: this.rootAxis, reverse: this.rootReverse, children: [], size: { w: 0, h: 0 }, pad: { l: 0, r: 0, t: 0, b: 0 } };
    const zones = new Map<string, ZoneBlock>([[ROOT, root]]);
    const zoneOf = (id: string): ZoneBlock => {
      const existing = zones.get(id);
      if (existing) return existing;
      const g = this.diagram.getGroup(id)!;
      const parent = zoneOf(this.parentOf.get(id) ?? ROOT);
      const dir = g.getMetadata('direction');
      const frame = (g.getMetadata('frameStyle') ?? {}) as { labelPlacement?: string };
      const captionAtBottom = /^bottom/.test(String(frame.labelPlacement ?? ''));
      const hasCaption = !!(g.name && g.name.trim());
      const band = hasCaption ? K.zoneCaptionBand : K.zonePadPlain;
      const z: ZoneBlock = {
        kind: 'zone',
        id,
        group: g,
        decl: Number.MAX_SAFE_INTEGER,
        axis: typeof dir === 'string' && dir ? axisOf(dir) : parent.axis,
        reverse: typeof dir === 'string' && dir ? reversedOf(dir) : parent.reverse,
        children: [],
        size: { w: 0, h: 0 },
        pad: { l: K.zonePadSide, r: K.zonePadSide, t: captionAtBottom ? K.zonePadPlain : band, b: captionAtBottom ? band : K.zonePadPlain },
      };
      zones.set(id, z);
      parent.children.push(z);
      this.blocks.set(id, z);
      return z;
    };
    for (const g of groups) zoneOf(g.id);

    nodes.forEach((n, i) => {
      const near = n.getMetadata('near') as { target?: string; side?: string; gap?: number } | undefined;
      if (near?.target && (this.diagram.getNode(near.target) || this.diagram.getGroup(near.target))) {
        this.notes.push({ node: n, target: near.target, side: near.side ?? 'right', gap: near.gap ?? K.nearGap });
        return;
      }
      const leaf: LeafBlock = { kind: 'node', id: n.id, node: n, decl: i, size: this.leafSize(n) };
      this.blocks.set(n.id, leaf);
      zoneOf(this.parentOf.get(n.id) ?? ROOT).children.push(leaf);
    });

    // A zone is declared where its first box is.
    const settleDecl = (z: ZoneBlock): number => {
      let d = z.decl;
      for (const c of z.children) d = Math.min(d, c.kind === 'zone' ? settleDecl(c) : c.decl);
      z.decl = d;
      return d;
    };
    settleDecl(root);
    const sortTree = (z: ZoneBlock) => {
      z.children.sort((a, b) => a.decl - b.decl);
      for (const c of z.children) if (c.kind === 'zone') sortTree(c);
    };
    sortTree(root);
    return root;
  }

  /** A box sized to its words: a name (bold when a subtitle follows), a subtitle, padding. */
  private leafSize(n: NodeModel): Sz {
    const style = (n.style ?? {}) as { fontSize?: number | string; fontWeight?: string | number; fontFamily?: string };
    const fs = Number(style.fontSize) || 14;
    const label = String(n.getLabel() ?? n.id);
    const shape = (n.getMetadata('shape') as { type?: string } | undefined)?.type;
    const rawSub = n.getMetadata('sublabel') as string | { text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string } | undefined;
    const sub = typeof rawSub === 'string' ? { text: rawSub } : rawSub;
    const lines = label.split('\n');
    if (shape === 'text') {
      const w = widestLine(lines, { size: fs, weight: style.fontWeight, family: style.fontFamily }, this.measure);
      return { w: Math.ceil(w + 8), h: Math.ceil(Math.max(24, lines.length * fs * 1.4 + 6)) };
    }
    const titleFont: TextFont = { size: fs, weight: style.fontWeight ?? (sub?.text ? 600 : 400), family: style.fontFamily };
    let w = widestLine(lines, titleFont, this.measure);
    let h = lines.length * fs * 1.3;
    if (sub?.text) {
      const subFs = sub.fontSize ?? Math.round(fs * 0.85);
      const subLines = sub.text.split('\n');
      const family = sub.fontFamily === 'mono' ? 'monospace' : sub.fontFamily;
      w = Math.max(w, widestLine(subLines, { size: subFs, weight: sub.fontWeight, family }, this.measure));
      h += 4 + subLines.length * subFs * K.labelLine;
    }
    w += 2 * K.boxPadX;
    h += 2 * K.boxPadY;
    if (shape && SHAPES_NEEDING_ROOM.has(shape)) {
      w *= 1.4;
      h *= 1.4;
    }
    return { w: Math.ceil(Math.max(w, K.minBoxW)), h: Math.ceil(Math.max(h, K.minBoxH)) };
  }

  /** The child of container `z` that holds `id` (a node or zone), or undefined. */
  private childOf(z: ZoneBlock, id: string | undefined): Block | undefined {
    let cur = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const parent = this.parentOf.get(cur);
      if (parent === z.id) return this.blocks.get(cur);
      cur = parent;
    }
    return undefined;
  }

  /** The side a line names at one end: a plain-side hint, else a side anchor's side. */
  private sideHint(l: LinkModel, end: 'source' | 'target'): AnchorSide | undefined {
    const meta = l.getMetadata(end === 'source' ? 'sourceSide' : 'targetSide');
    if (meta === 'top' || meta === 'right' || meta === 'bottom' || meta === 'left') return meta;
    const port = end === 'source' ? l.sourcePortId : l.targetPortId;
    if (isSideAnchorPort(port)) return parseSideAnchor(port!.split('__')[1] ?? '')?.side;
    return undefined;
  }

  /** For a line in a container flowing along `a`: does it say its source is across-BEFORE or across-AFTER its target? */
  private crossRelation(l: LinkModel, a: Axis): 'before' | 'after' | null {
    const s = this.sideHint(l, 'source');
    const t = this.sideHint(l, 'target');
    const [lo, hi] = a === 'x' ? (['top', 'bottom'] as const) : (['left', 'right'] as const);
    // leaving from the source's `lo` side (its top) → the target is above → the source comes AFTER
    if (s === lo || t === hi) return 'after';
    if (s === hi || t === lo) return 'before';
    return null;
  }

  // ------------------------------------------------------------- structure

  /** Columns and stacks for every container, deepest first. */
  private structure(z: ZoneBlock): void {
    for (const c of z.children) if (c.kind === 'zone') this.structure(c);
    const kids = z.children;
    const index = new Map(kids.map((b, i) => [b.id, i] as const));
    const flow: Array<[number, number]> = [];
    const across: Array<[number, number]> = []; // [upper, lower]
    const links: Plan['links'] = [];
    for (const l of this.diagram.getLinks()) {
      const A = this.childOf(z, l.sourceNodeId);
      const B = this.childOf(z, l.targetNodeId);
      if (!A || !B || A === B) continue;
      const a = index.get(A.id)!, b = index.get(B.id)!;
      links.push({ a, b, link: l });
      const rel = this.crossRelation(l, z.axis);
      if (rel === 'after') across.push([b, a]);
      else if (rel === 'before') across.push([a, b]);
      else flow.push([a, b]);
    }

    // stacks: children joined across the flow
    const parent = kids.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (const [u, v] of across) parent[find(u)] = find(v);
    const stacks = new Map<number, number[]>();
    kids.forEach((_, i) => {
      const r = find(i);
      stacks.set(r, [...(stacks.get(r) ?? []), i]);
    });
    const ordered: number[][] = [];
    for (const members of stacks.values()) {
      // upper before lower; ties in declaration order
      const inDeg = new Map<number, number>(members.map((m) => [m, 0]));
      for (const [u, v] of across) if (inDeg.has(u) && inDeg.has(v)) inDeg.set(v, inDeg.get(v)! + 1);
      const out: number[] = [];
      const ready = members.filter((m) => inDeg.get(m) === 0);
      while (ready.length) {
        ready.sort((p, q) => kids[p]!.decl - kids[q]!.decl);
        const m = ready.shift()!;
        out.push(m);
        for (const [u, v] of across) if (u === m && inDeg.has(v)) {
          inDeg.set(v, inDeg.get(v)! - 1);
          if (inDeg.get(v) === 0) ready.push(v);
        }
      }
      for (const m of members) if (!out.includes(m)) out.push(m); // a cycle across: declaration order
      ordered.push(out);
    }
    ordered.sort((p, q) => kids[p[0]!]!.decl - kids[q[0]!]!.decl);
    const stackOf = new Map<number, number>();
    ordered.forEach((st, si) => st.forEach((m) => stackOf.set(m, si)));

    // ranks over stacks: DFS in declaration order drops the edges that close a cycle
    const edges = new Map<number, Set<number>>();
    for (const [u, v] of flow) {
      const su = stackOf.get(u)!, sv = stackOf.get(v)!;
      if (su === sv) continue;
      edges.set(su, (edges.get(su) ?? new Set()).add(sv));
    }
    const kept = new Map<number, number[]>();
    const state = new Map<number, 1 | 2>();
    const dfs = (s: number) => {
      state.set(s, 1);
      for (const t of [...(edges.get(s) ?? [])].sort((p, q) => p - q)) {
        if (state.get(t) === 1) continue; // closes a cycle: not a rank constraint
        kept.set(s, [...(kept.get(s) ?? []), t]);
        if (!state.has(t)) dfs(t);
      }
      state.set(s, 2);
    };
    ordered.forEach((_, s) => { if (!state.has(s)) dfs(s); });
    const rank = new Array<number>(ordered.length).fill(0);
    const topo: number[] = [];
    const seen = new Set<number>();
    const visit = (s: number) => {
      if (seen.has(s)) return;
      seen.add(s);
      for (const t of kept.get(s) ?? []) visit(t);
      topo.push(s);
    };
    ordered.forEach((_, s) => visit(s));
    for (const s of topo.reverse()) for (const t of kept.get(s) ?? []) rank[t] = Math.max(rank[t]!, rank[s]! + 1);

    const columns: Block[][] = [];
    ordered.forEach((st, si) => {
      const r = rank[si]!;
      while (columns.length <= r) columns.push([]);
      for (const m of st) columns[r]!.push(kids[m]!);
    });
    z.plan = { columns: columns.filter((c) => c.length > 0), links, colF: [], gapF: [], rel: new Map(), content: { w: 0, h: 0 } };
  }

  // -------------------------------------------------------------- position

  /** Sizes and relative positions, deepest first; stacked zones share a column grid. */
  private position(z: ZoneBlock): void {
    const plan = z.plan!;
    for (const c of z.children) if (c.kind === 'zone') this.position(c);
    this.wrapLoose(z);

    // stacked zones in one column line their columns up
    for (const col of plan.columns) {
      const zs = col.filter((b): b is ZoneBlock => b.kind === 'zone');
      if (zs.length < 2) continue;
      const n = zs[0]!.plan!.columns.length;
      if (zs.some((q) => q.plan!.columns.length !== n || q.axis !== zs[0]!.axis)) continue;
      const colF = Array.from({ length: n }, (_, j) => Math.max(...zs.map((q) => q.plan!.colF[j]!)));
      const gapF = Array.from({ length: n }, (_, j) => Math.max(...zs.map((q) => q.plan!.gapF[j] ?? 0)));
      for (const q of zs) {
        q.plan!.sharedColF = colF;
        q.plan!.sharedGapF = gapF;
        this.arrange(q);
      }
    }
    // zones stacked in one column share its width
    for (const col of plan.columns) {
      const zs = col.filter((b): b is ZoneBlock => b.kind === 'zone');
      if (zs.length < 2) continue;
      const f = Math.max(...zs.map((q) => fOf(q.size, z.axis)));
      for (const q of zs) q.size = sz(f, cOf(q.size, z.axis), z.axis);
    }
    this.arrange(z);
  }

  /**
   * Four or more children with no line to a sibling are a SET, not a sequence:
   * wrapped into a grid (about 16:9 across the page) in reading order, after
   * whatever the lines already arranged — never a tower down one column.
   */
  private wrapLoose(z: ZoneBlock): void {
    const plan = z.plan!;
    const linked = new Set<number>();
    for (const { a, b } of plan.links) {
      linked.add(a);
      linked.add(b);
    }
    const loose = z.children.filter((_, i) => !linked.has(i));
    if (loose.length < 4) return;
    const looseIds = new Set(loose.map((b) => b.id));
    const base = plan.columns.map((col) => col.filter((b) => !looseIds.has(b.id))).filter((col) => col.length > 0);
    const a = z.axis;
    const avgF = loose.reduce((t, b) => t + fOf(b.size, a), 0) / loose.length;
    const avgC = loose.reduce((t, b) => t + cOf(b.size, a), 0) / loose.length;
    const across = a === 'x' ? 16 / 9 : 9 / 16; // the page's width:height, seen along the flow
    const k = Math.max(base.length, 1, Math.round(Math.sqrt(loose.length * (avgC / Math.max(1, avgF)) * across)));
    const cols = base.map((c) => [...c]);
    while (cols.length < k) cols.push([]);
    loose.forEach((b, i) => cols[i % k]!.push(b));
    plan.columns = cols;
  }

  /** Arrange one container's children (their sizes known) and size the container. */
  private arrange(z: ZoneBlock): void {
    const plan = z.plan!;
    const a = z.axis;
    const cols = plan.columns;

    // boxes in a column share its width; boxes in a row share their height
    for (let r = 0; r < cols.length; r++) {
      const leaves = cols[r]!.filter((b): b is LeafBlock => b.kind === 'node');
      const shared = plan.sharedColF?.[r];
      const f = Math.max(shared ?? 0, ...leaves.map((b) => fOf(b.size, a)));
      if (leaves.length && (cols[r]!.every((b) => b.kind === 'node'))) for (const b of leaves) b.size = sz(f, cOf(b.size, a), a);
    }
    const rows = Math.max(0, ...cols.map((c) => c.length));
    for (let i = 0; i < rows; i++) {
      const leaves = cols.map((c) => c[i]).filter((b): b is LeafBlock => !!b && b.kind === 'node');
      if (leaves.length < 2) continue;
      const c = Math.max(...leaves.map((b) => cOf(b.size, a)));
      for (const b of leaves) b.size = sz(fOf(b.size, a), c, a);
    }

    // columns along the flow; each gap fits the widest label that crosses it
    const colIndex = new Map<string, number>();
    cols.forEach((c, r) => c.forEach((b) => colIndex.set(b.id, r)));
    plan.colF = cols.map((c, r) => Math.max(plan.sharedColF?.[r] ?? 0, ...c.map((b) => fOf(b.size, a))));
    plan.gapF = cols.map((_, r) => {
      if (r === 0) return 0;
      let need = K.gapFlow;
      for (const { a: i, b: j, link } of plan.links) {
        const ri = colIndex.get(z.children[i]!.id)!, rj = colIndex.get(z.children[j]!.id)!;
        if (Math.min(ri, rj) === r - 1 && Math.max(ri, rj) === r) need = Math.max(need, this.labelExtent(link, a) + 2 * K.labelPad);
      }
      return Math.max(need, plan.sharedGapF?.[r] ?? 0);
    });
    const fStart: number[] = [];
    cols.forEach((_, r) => fStart.push(r === 0 ? 0 : fStart[r - 1]! + plan.colF[r - 1]! + plan.gapF[r]!));

    // stacks across the flow
    const stackCol = (r: number, from = 0) => {
      const col = cols[r]!;
      let cursor = from === 0 ? 0 : cOf(col[from - 1]!.size, a) + plan.rel.get(col[from - 1]!.id)![a === 'x' ? 'y' : 'x'] + this.crossGap(z, col[from - 1]!, col[from]!);
      for (let i = from; i < col.length; i++) {
        const b = col[i]!;
        if (i > from) cursor += this.crossGap(z, col[i - 1]!, b);
        plan.rel.set(b.id, pt(fStart[r]! + (plan.colF[r]! - fOf(b.size, a)) / 2, cursor, a));
        cursor += cOf(b.size, a);
      }
    };
    cols.forEach((_, r) => stackCol(r));

    // a box that talks to several boxes stacked beside it spans them
    cols.forEach((col, r) => {
      col.forEach((b, i) => {
        if (b.kind !== 'node') return;
        const span = this.spanFor(z, b, colIndex, r);
        if (!span) return;
        const cKey = a === 'x' ? 'y' : 'x';
        const prevEnd = i === 0 ? -Infinity : plan.rel.get(col[i - 1]!.id)![cKey] + cOf(col[i - 1]!.size, a) + this.crossGap(z, col[i - 1]!, b);
        if (span.start < prevEnd || span.end - span.start < cOf(b.size, a)) return;
        b.size = sz(fOf(b.size, a), span.end - span.start, a);
        const p = plan.rel.get(b.id)!;
        plan.rel.set(b.id, a === 'x' ? { x: p.x, y: span.start } : { x: span.start, y: p.y });
        if (i + 1 < col.length) stackCol(r, i + 1);
      });
    });

    // the content box, then the zone around it
    let fMax = 0, cMax = 0;
    for (const col of cols) for (const b of col) {
      const p = plan.rel.get(b.id)!;
      fMax = Math.max(fMax, (a === 'x' ? p.x : p.y) + fOf(b.size, a));
      cMax = Math.max(cMax, (a === 'x' ? p.y : p.x) + cOf(b.size, a));
    }
    // RL / BT: the same arrangement, run backwards along the flow
    if (z.reverse) {
      for (const col of cols) for (const b of col) {
        const p = plan.rel.get(b.id)!;
        if (a === 'x') plan.rel.set(b.id, { x: fMax - p.x - b.size.w, y: p.y });
        else plan.rel.set(b.id, { x: p.x, y: fMax - p.y - b.size.h });
      }
    }
    plan.content = sz(fMax, cMax, a);
    if (z.id !== ROOT) {
      // a zone is never narrower than its own caption
      const caption = this.captionWidth(z);
      z.size = { w: Math.max(plan.content.w + z.pad.l + z.pad.r, caption + 2 * K.zonePadSide), h: plan.content.h + z.pad.t + z.pad.b };
    }
  }

  /** How wide a zone's caption draws, in its own typography (captions are often spaced capitals). */
  private captionWidth(z: ZoneBlock): number {
    const name = z.group?.name?.trim();
    if (!name) return 0;
    const f = (z.group!.getMetadata('frameStyle') ?? {}) as { fontSize?: number; fontWeight?: string | number; letterSpacing?: number; fontFamily?: string };
    return this.measure(name, { size: Number(f.fontSize) || 11, weight: f.fontWeight ?? 700, family: f.fontFamily, letterSpacing: Number(f.letterSpacing) || 0 });
  }

  /** The gap between two stacked children: more between zones, and room for a label bent in it. */
  private crossGap(z: ZoneBlock, upper: Block, lower: Block): number {
    let gap = upper.kind === 'zone' || lower.kind === 'zone' ? K.gapCrossZone : K.gapCrossLeaf;
    let label = 0;
    for (const { a, b, link } of z.plan!.links) {
      const ids = [z.children[a]!.id, z.children[b]!.id];
      if (ids.includes(upper.id) && ids.includes(lower.id)) label = Math.max(label, this.labelCross(link, z.axis));
    }
    if (label > 0) gap += label + 12;
    return gap;
  }

  /** A line's label: its size ALONG the flow (a width in LR) … */
  private labelExtent(l: LinkModel, a: Axis): number {
    const m = this.labelMetrics(l);
    return a === 'x' ? m.w : m.h;
  }

  /** … and ACROSS it (a height in LR). */
  private labelCross(l: LinkModel, a: Axis): number {
    const m = this.labelMetrics(l);
    return a === 'x' ? m.h : m.w;
  }

  private labelMetrics(l: LinkModel): Sz {
    const label = l.labels?.[0];
    const text = String(label?.text ?? l.getLabel() ?? '');
    if (!text) return { w: 0, h: 0 };
    const style = (label?.style ?? {}) as { fontSize?: number; fontWeight?: string | number; fontFamily?: string };
    const fs = Number(style.fontSize) || 12;
    const lines = text.split('\n');
    return { w: widestLine(lines, { size: fs, weight: style.fontWeight, family: style.fontFamily }, this.measure), h: lines.length * fs * K.labelLine };
  }

  /** The cross-axis span a box should cover: the boxes it talks to, when ≥ 2 sit in ONE column beside it. */
  private spanFor(z: ZoneBlock, b: LeafBlock, colIndex: Map<string, number>, r: number): { start: number; end: number } | null {
    const a = z.axis;
    const byCol = new Map<number, Array<{ start: number; end: number }>>();
    for (const l of this.diagram.getLinks()) {
      const other = l.sourceNodeId === b.id ? l.targetNodeId : l.targetNodeId === b.id ? l.sourceNodeId : undefined;
      if (!other || other === b.id) continue;
      const blk = this.childOf(z, other);
      if (!blk) continue;
      const rc = colIndex.get(blk.id);
      if (rc === undefined || Math.abs(rc - r) !== 1) continue;
      const rect = this.rectIn(z, other);
      if (!rect) continue;
      const s = a === 'x' ? rect.y : rect.x;
      const e = s + (a === 'x' ? rect.h : rect.w);
      byCol.set(rc, [...(byCol.get(rc) ?? []), { start: s, end: e }]);
    }
    let best: { start: number; end: number } | null = null;
    for (const spans of byCol.values()) {
      const distinct = new Set(spans.map((s) => `${Math.round(s.start)}:${Math.round(s.end)}`));
      if (distinct.size < 2) continue;
      const cand = { start: Math.min(...spans.map((s) => s.start)), end: Math.max(...spans.map((s) => s.end)) };
      if (!best || cand.end - cand.start > best.end - best.start) best = cand;
    }
    return best;
  }

  /** A node's rect in container `z`'s content coordinates (from the plans so far). */
  private rectIn(z: ZoneBlock, id: string): Rect | null {
    const chain: string[] = [];
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && cur !== z.id && !seen.has(cur)) {
      seen.add(cur);
      chain.push(cur);
      cur = this.parentOf.get(cur);
    }
    if (cur !== z.id) return null;
    let x = 0, y = 0;
    let container = z;
    for (let i = chain.length - 1; i >= 0; i--) {
      const bid = chain[i]!;
      const p = container.plan?.rel.get(bid);
      const blk = this.blocks.get(bid);
      if (!p || !blk) return null;
      x += p.x;
      y += p.y;
      if (i === 0) return { x, y, w: blk.size.w, h: blk.size.h };
      if (blk.kind !== 'zone') return null;
      x += blk.pad.l;
      y += blk.pad.t;
      container = blk;
    }
    return null;
  }

  // ------------------------------------------------------------ absolute

  private place(z: ZoneBlock, origin: Pt): void {
    for (const b of z.children) {
      const p = z.plan!.rel.get(b.id);
      if (!p) continue;
      const at = { x: origin.x + p.x, y: origin.y + p.y };
      this.abs.set(b.id, { x: at.x, y: at.y, w: b.size.w, h: b.size.h });
      if (b.kind === 'zone') this.place(b, { x: at.x + b.pad.l, y: at.y + b.pad.t });
    }
  }

  private placeNotes(): void {
    for (const note of this.notes) {
      const t = this.abs.get(note.target);
      if (!t) continue;
      const s = this.leafSize(note.node);
      const at = (): Pt =>
        note.side === 'left'
          ? { x: t.x - note.gap - s.w, y: t.y + t.h / 2 - s.h / 2 }
          : note.side === 'above'
            ? { x: t.x, y: t.y - note.gap - s.h }
            : note.side === 'below'
              ? { x: t.x, y: t.y + t.h + note.gap }
              : { x: t.x + t.w + note.gap, y: t.y + t.h / 2 - s.h / 2 };
      const p = at();
      // Beside its target, never on top of another box or zone: step away along
      // the side it hangs on until it is clear.
      const vertical = note.side === 'left' || note.side === 'right';
      const around = [...this.abs.entries()].filter(([id]) => id !== note.target && !this.contains(id, note.target));
      for (let i = 0; i < 20; i++) {
        const hit = around.find(([, r]) => p.x < r.x + r.w && r.x < p.x + s.w && p.y < r.y + r.h && r.y < p.y + s.h);
        if (!hit) break;
        const r = hit[1];
        if (vertical) p.y = r.y + r.h + 4;
        else p.x = r.x + r.w + 4;
      }
      this.abs.set(note.node.id, { x: p.x, y: p.y, w: s.w, h: s.h });
    }
  }

  /** Is `id` (a zone) an ancestor of `inner`? */
  private contains(id: string, inner: string): boolean {
    let cur = this.parentOf.get(inner);
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === id) return true;
      seen.add(cur);
      cur = this.parentOf.get(cur);
    }
    return false;
  }

  private commit(): void {
    for (const [id, r] of this.abs) {
      const n = this.diagram.getNode(id);
      if (n) {
        if (Math.abs(n.size.width - r.w) > 0.01 || Math.abs(n.size.height - r.h) > 0.01) n.setSize(r.w, r.h);
        n.setPosition(r.x, r.y);
        continue;
      }
      const g = this.diagram.getGroup(id);
      if (g) g.setFrame({ x: r.x, y: r.y, width: r.w, height: r.h });
    }
  }

  // --------------------------------------------------------------- lines

  private anchorLines(): void {
    type Job = { link: LinkModel; s: Rect; t: Rect; sSide: AnchorSide; tSide: AnchorSide };
    const bundles = new Map<string, Job[]>();
    for (const link of this.diagram.getLinks()) {
      const sId = link.sourceNodeId, tId = link.targetNodeId;
      if (!sId || !tId || sId === tId) continue;
      const sNode = this.diagram.getNode(sId), tNode = this.diagram.getNode(tId);
      const s = this.abs.get(sId), t = this.abs.get(tId);
      if (!sNode || !tNode || !s || !t) continue;
      // An anchor the author placed along a side (`right@36`) is theirs to keep;
      // one this layout placed last time is not a pin — it is re-placed.
      const pinned = (end: 'source' | 'target') =>
        link.getMetadata('layoutAnchored') !== true &&
        isSideAnchorPort(end === 'source' ? link.sourcePortId : link.targetPortId) &&
        !link.getMetadata(end === 'source' ? 'sourceSide' : 'targetSide');
      if (pinned('source') || pinned('target')) continue;
      let sSide = this.sideHint(link, 'source');
      let tSide = this.sideHint(link, 'target');
      if (!sSide && !tSide) {
        if (t.x >= s.x + s.w) [sSide, tSide] = ['right', 'left'];
        else if (t.x + t.w <= s.x) [sSide, tSide] = ['left', 'right'];
        else if (t.y >= s.y + s.h) [sSide, tSide] = ['bottom', 'top'];
        else [sSide, tSide] = ['top', 'bottom'];
      }
      sSide = sSide ?? opposite(tSide!);
      tSide = tSide ?? opposite(sSide);
      const level = sSide === 'left' || sSide === 'right';
      const key = `${[sId, tId].sort().join('\u0001')}|${level ? 'h' : 'v'}`;
      bundles.set(key, [...(bundles.get(key) ?? []), { link, s, t, sSide, tSide }]);
    }

    for (const jobs of bundles.values()) {
      jobs.forEach((job, k) => {
        const { link, s, t, sSide, tSide } = job;
        const level = sSide === 'left' || sSide === 'right';
        // the stretch of side both boxes cover
        const lo = level ? Math.max(s.y, t.y) : Math.max(s.x, t.x);
        const hi = level ? Math.min(s.y + s.h, t.y + t.h) : Math.min(s.x + s.w, t.x + t.w);
        const sNode = this.diagram.getNode(link.sourceNodeId!)!;
        const tNode = this.diagram.getNode(link.targetNodeId!)!;
        const setEnds = (sAt: number, tAt: number) => {
          const sp = ensureSideAnchorPort(sNode, `${sSide}@${Math.round(sAt)}`);
          const tp = ensureSideAnchorPort(tNode, `${tSide}@${Math.round(tAt)}`);
          if (sp) link.setSourcePort(sp, sNode.id);
          if (tp) link.setTargetPort(tp, tNode.id);
          // the layout chose these points (and any bends): an export writes the
          // author's relation (`from:bottom`), never these pixels
          link.setMetadata('layoutAnchored', true);
        };
        if (hi - lo >= K.minOverlap) {
          // straight: spread the bundle over the shared stretch
          const at = lo + ((k + 1) * (hi - lo)) / (jobs.length + 1);
          setEnds(level ? at - s.y : at - s.x, level ? at - t.y : at - t.x);
          return;
        }
        // no shared stretch: bend in the gutter between the regions the line joins
        const gutter = this.gutter(link.sourceNodeId!, link.targetNodeId!, level ? 'x' : 'y');
        const sAt = level ? s.h * (t.y + t.h / 2 > s.y + s.h / 2 ? 0.75 : 0.25) : s.w * (t.x + t.w / 2 > s.x + s.w / 2 ? 0.75 : 0.25);
        const tAt = level ? t.h / 2 : t.w / 2;
        setEnds(sAt, tAt);
        const sp: Pt = level ? { x: sSide === 'right' ? s.x + s.w : s.x, y: s.y + Math.round(sAt) } : { x: s.x + Math.round(sAt), y: sSide === 'bottom' ? s.y + s.h : s.y };
        const tp: Pt = level ? { x: tSide === 'right' ? t.x + t.w : t.x, y: t.y + Math.round(tAt) } : { x: t.x + Math.round(tAt), y: tSide === 'bottom' ? t.y + t.h : t.y };
        const bends: Pt[] = level ? [{ x: gutter, y: sp.y }, { x: gutter, y: tp.y }] : [{ x: sp.x, y: gutter }, { x: tp.x, y: gutter }];
        link.setPathType('orthogonal');
        link.setPoints([sp, ...bends, tp]);
        link.setMetadata('hasManualWaypoints', true);
      });
    }
  }

  /**
   * The middle of the gutter a line from `sId` to `tId` bends in, along `axis`:
   * between the two regions of their nearest common container that hold them
   * (their frames), else between the two boxes.
   */
  private gutter(sId: string, tId: string, axis: Axis): number {
    const chain = (id: string) => {
      const out: string[] = [];
      let cur: string | undefined = id;
      while (cur) {
        out.push(cur);
        cur = this.parentOf.get(cur);
      }
      return out;
    };
    const cs = chain(sId), ct = chain(tId);
    const common = cs.find((c) => ct.includes(c) && c !== sId && c !== tId) ?? ROOT;
    const below = (c: string[]) => c[c.indexOf(common) - 1];
    const A = this.abs.get(below(cs) ?? sId) ?? this.abs.get(sId)!;
    const B = this.abs.get(below(ct) ?? tId) ?? this.abs.get(tId)!;
    const [a0, a1, b0, b1] = axis === 'y' ? [A.y, A.y + A.h, B.y, B.y + B.h] : [A.x, A.x + A.w, B.x, B.x + B.w];
    if (a1 <= b0) return (a1 + b0) / 2;
    if (b1 <= a0) return (b1 + a0) / 2;
    const s = this.abs.get(sId)!, t = this.abs.get(tId)!;
    return axis === 'y' ? (Math.min(s.y + s.h, t.y + t.h) + Math.max(s.y, t.y)) / 2 : (Math.min(s.x + s.w, t.x + t.w) + Math.max(s.x, t.x)) / 2;
  }
}
