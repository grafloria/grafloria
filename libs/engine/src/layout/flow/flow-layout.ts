/**
 * FLOW LAYOUT — the tidy layout a step-by-step flow (a workflow, a chatbot, an
 * automation) wants, and which a general layered layout does not give it.
 *
 * Two things a layered layout gets wrong for a flow:
 *
 *  - It reads node→node edges and ignores PORTS, so a step's `true` branch can
 *    land below its `false` branch and a Switch's outputs come out in any order.
 *    Here every edge carries `order` — its source port's rank down that step's
 *    side (the caller measures it) — and children are laid out in that order.
 *  - It re-lays the whole graph. `placeFlowNodes` places only the NEW nodes,
 *    beside their parent in their port's slot, and leaves everything else where
 *    the user put it.
 *
 * Pure geometry: boxes in, positions out. Nothing here touches a model.
 *
 * `flowLayout` (a whole-flow tidy) is a tidy tree over the flow's spanning tree
 * (each node under the first step that reaches it, children in port order),
 * with the main axis set by the longest path — so a merge sits to the right of
 * every branch that feeds it — and the cross axis by the tree: every child keeps
 * its own band, so nothing overlaps. Cycles are fine (back edges are ignored for
 * placement). Fixed boxes (notes, groups, anything the caller pins) are kept
 * clear: a flow block that would run over one moves past it.
 */

export interface FlowBox {
  id: string;
  width: number;
  height: number;
  /** Current position (top-left), when it has one. */
  x?: number;
  y?: number;
}

export interface FlowEdge {
  source: string;
  target: string;
  /** The source port's rank down its side (smaller = earlier: top for LR, left for TB). */
  order?: number;
}

export interface FlowLayoutOptions {
  /** Main axis. `'LR'` (default): left to right; `'TB'`: top to bottom. */
  direction?: 'LR' | 'TB';
  /** Gap between consecutive steps along the flow. Default 80. */
  rankGap?: number;
  /** Gap between siblings across the flow. Default 40. */
  nodeGap?: number;
  /** Top-left of the laid-out flow. Default: the top-left of the boxes' current positions. */
  origin?: { x: number; y: number };
  /** Boxes to keep clear of (notes, groups, pinned nodes). */
  obstacles?: Array<{ x: number; y: number; width: number; height: number }>;
}

type Pos = { x: number; y: number };

interface Graph {
  ids: string[];
  box: Map<string, FlowBox>;
  out: Map<string, string[]>;
  inc: Map<string, string[]>;
}

function buildGraph(nodes: FlowBox[], edges: FlowEdge[]): Graph {
  const box = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Array<{ t: string; o: number; i: number }>>();
  const inc = new Map<string, string[]>();
  for (const n of nodes) {
    out.set(n.id, []);
    inc.set(n.id, []);
  }
  edges.forEach((e, i) => {
    if (!box.has(e.source) || !box.has(e.target) || e.source === e.target) return;
    out.get(e.source)!.push({ t: e.target, o: e.order ?? 0, i });
    inc.get(e.target)!.push(e.source);
  });
  const sorted = new Map<string, string[]>();
  for (const [id, list] of out) sorted.set(id, list.sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.t));
  return { ids: nodes.map((n) => n.id), box, out: sorted, inc };
}

const crossSize = (b: FlowBox, lr: boolean) => (lr ? b.height : b.width);
const mainSize = (b: FlowBox, lr: boolean) => (lr ? b.width : b.height);

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, pad: number): boolean {
  return a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
}

/** Lay the whole flow out. Answers a position (top-left) for every box. */
export function flowLayout(nodes: FlowBox[], edges: FlowEdge[], options: FlowLayoutOptions = {}): Map<string, Pos> {
  const lr = (options.direction ?? 'LR') === 'LR';
  const rankGap = options.rankGap ?? 80;
  const nodeGap = options.nodeGap ?? 40;
  const g = buildGraph(nodes, edges);
  const result = new Map<string, Pos>();
  if (g.ids.length === 0) return result;

  // -- the spanning tree, in port order (DFS preorder), and the back edges ----
  const parent = new Map<string, string | null>();
  const children = new Map<string, string[]>(g.ids.map((id) => [id, []]));
  const state = new Map<string, 0 | 1 | 2>(); // 0 new, 1 on the stack, 2 done
  const back = new Set<string>(); // "u\u0000v"
  const order: string[] = [];
  const roots: string[] = [];
  const visit = (root: string) => {
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    state.set(root, 1);
    order.push(root);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const kids = g.out.get(top.id)!;
      if (top.next >= kids.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const v = kids[top.next++]!;
      const s = state.get(v) ?? 0;
      if (s === 1) back.add(`${top.id}\u0000${v}`);
      if (s !== 0) continue;
      state.set(v, 1);
      parent.set(v, top.id);
      children.get(top.id)!.push(v);
      order.push(v);
      stack.push({ id: v, next: 0 });
    }
  };
  // Real sources first (in the caller's order), then whatever a cycle hides.
  for (const id of g.ids) if (g.inc.get(id)!.length === 0 && !state.get(id)) (roots.push(id), parent.set(id, null), visit(id));
  for (const id of g.ids) if (!state.get(id)) (roots.push(id), parent.set(id, null), visit(id));

  // -- ranks: the longest path over the forward edges --------------------------
  const rank = new Map<string, number>(g.ids.map((id) => [id, 0]));
  const indeg = new Map<string, number>(g.ids.map((id) => [id, 0]));
  for (const u of g.ids) for (const v of g.out.get(u)!) if (!back.has(`${u}\u0000${v}`)) indeg.set(v, indeg.get(v)! + 1);
  const queue = g.ids.filter((id) => indeg.get(id) === 0);
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i]!;
    for (const v of g.out.get(u)!) {
      if (back.has(`${u}\u0000${v}`)) continue;
      rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }

  // -- main-axis columns ----------------------------------------------------------
  const maxRank = Math.max(...rank.values());
  const colSize = new Array<number>(maxRank + 1).fill(0);
  for (const id of g.ids) colSize[rank.get(id)!] = Math.max(colSize[rank.get(id)!]!, mainSize(g.box.get(id)!, lr));
  const colStart: number[] = [];
  let acc = 0;
  for (let r = 0; r <= maxRank; r++) {
    colStart.push(acc);
    acc += colSize[r]! + rankGap;
  }

  // -- cross-axis bands (tidy tree) -----------------------------------------------
  const block = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const kids = children.get(id)!;
    const span = kids.reduce((s, k) => s + block.get(k)!, 0) + Math.max(0, kids.length - 1) * nodeGap;
    block.set(id, Math.max(crossSize(g.box.get(id)!, lr), span));
  }
  const cross = new Map<string, number>();
  const place = (id: string, top: number) => {
    const size = crossSize(g.box.get(id)!, lr);
    const b = block.get(id)!;
    cross.set(id, top + (b - size) / 2);
    const kids = children.get(id)!;
    const span = kids.reduce((s, k) => s + block.get(k)!, 0) + Math.max(0, kids.length - 1) * nodeGap;
    let t = top + (b - span) / 2;
    for (const k of kids) {
      place(k, t);
      t += block.get(k)! + nodeGap;
    }
  };

  // Origin: where the boxes are now, so a tidy does not throw the flow away.
  const placed = nodes.filter((n) => n.x !== undefined && n.y !== undefined);
  const origin = options.origin ?? (placed.length ? { x: Math.min(...placed.map((n) => n.x!)), y: Math.min(...placed.map((n) => n.y!)) } : { x: 0, y: 0 });
  const obstacles = options.obstacles ?? [];

  const positionsOf = (ids: string[], crossTop: number): Map<string, Pos> => {
    const m = new Map<string, Pos>();
    for (const id of ids) {
      const b = g.box.get(id)!;
      const r = rank.get(id)!;
      const main = colStart[r]! + (colSize[r]! - mainSize(b, lr)) / 2;
      const c = cross.get(id)! + crossTop;
      m.set(id, lr ? { x: origin.x + main, y: origin.y + c } : { x: origin.x + c, y: origin.y + main });
    }
    return m;
  };
  const subtree = (root: string): string[] => {
    const out: string[] = [];
    const walk = (id: string) => {
      out.push(id);
      for (const k of children.get(id)!) walk(k);
    };
    walk(root);
    return out;
  };

  let cursor = 0;
  for (const root of roots) {
    place(root, 0);
    const ids = subtree(root);
    // Keep the block clear of every obstacle: step it along the cross axis past one it hits.
    let top = cursor;
    for (let guard = 0; guard < 200; guard++) {
      const pos = positionsOf(ids, top);
      const hit = obstacles.find((o) => ids.some((id) => overlaps({ ...pos.get(id)!, width: g.box.get(id)!.width, height: g.box.get(id)!.height }, o, nodeGap / 2)));
      if (!hit) break;
      top = (lr ? hit.y + hit.height - origin.y : hit.x + hit.width - origin.x) + nodeGap;
    }
    for (const [id, p] of positionsOf(ids, top)) result.set(id, p);
    cursor = top + block.get(root)! + nodeGap * 2;
  }
  return result;
}

export interface PlaceFlowOptions extends Omit<FlowLayoutOptions, 'origin'> {
  /** Place every new node after this one (else: after the first step that links into it). */
  after?: string;
}

/**
 * Place NEW boxes only; every other box stays where it is (pinned).
 *
 * Each new box goes one step along the flow from its parent, in the slot its
 * port order gives it among the parent's children — the tidy arrangement of
 * those children around the parent — and is then nudged across the flow (away
 * from the parent's middle) until it overlaps nothing. A new box with no parent
 * keeps its position.
 */
export function placeFlowNodes(newIds: string[], nodes: FlowBox[], edges: FlowEdge[], options: PlaceFlowOptions = {}): Map<string, Pos> {
  const lr = (options.direction ?? 'LR') === 'LR';
  const rankGap = options.rankGap ?? 80;
  const nodeGap = options.nodeGap ?? 40;
  const g = buildGraph(nodes, edges);
  const fresh = new Set(newIds);
  const at = new Map<string, Pos>();
  for (const n of nodes) if (!fresh.has(n.id) && n.x !== undefined && n.y !== undefined) at.set(n.id, { x: n.x, y: n.y });
  const result = new Map<string, Pos>();
  const obstacles = options.obstacles ?? [];

  for (const id of newIds) {
    const b = g.box.get(id);
    if (!b) continue;
    const parentId = options.after ?? g.inc.get(id)!.find((p) => at.has(p));
    const pb = parentId ? g.box.get(parentId) : undefined;
    const pp = parentId ? at.get(parentId) : undefined;
    if (!pb || !pp) {
      if (b.x !== undefined && b.y !== undefined) {
        at.set(id, { x: b.x, y: b.y });
        result.set(id, { x: b.x, y: b.y });
      }
      continue;
    }
    const kids = g.out.get(parentId!)!;
    const k = Math.max(0, kids.indexOf(id));
    const n = Math.max(1, kids.length);
    const size = crossSize(b, lr);
    const pCenter = (lr ? pp.y + pb.height / 2 : pp.x + pb.width / 2);
    const ideal = pCenter + (k - (n - 1) / 2) * (size + nodeGap) - size / 2;
    const main = lr ? pp.x + pb.width + rankGap : pp.y + pb.height + rankGap;
    const dir = k >= (n - 1) / 2 ? 1 : -1;
    const boxAt = (c: number) => (lr ? { x: main, y: c, width: b.width, height: b.height } : { x: c, y: main, width: b.width, height: b.height });
    const blocked = (c: number) => {
      const me = boxAt(c);
      for (const [other, p] of at) {
        if (other === id) continue;
        const ob = g.box.get(other)!;
        if (overlaps(me, { ...p, width: ob.width, height: ob.height }, nodeGap / 2)) return true;
      }
      return obstacles.some((o) => overlaps(me, o, nodeGap / 2));
    };
    let c = ideal;
    for (let guard = 0; guard < 400 && blocked(c); guard++) c += dir * (nodeGap / 2);
    const p = lr ? { x: main, y: c } : { x: c, y: main };
    at.set(id, p);
    result.set(id, p);
  }
  return result;
}
