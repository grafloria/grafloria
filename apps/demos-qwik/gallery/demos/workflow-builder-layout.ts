// Workflow automation builder — the automatic left-to-right arrangement.
// (A TypeScript copy of demos/interaction/workflow-builder-layout.js; the same
// file sits next to the demo in the React, Vue, Angular and Qwik apps.)
//
// A tidy layered tree, framework-free and deterministic:
//   • COLUMNS by longest path from the trigger, so every line runs left → right;
//     each column is as wide as its widest step (labels and output names
//     included), and the tiles of a column share one centre line.
//   • ROWS by subtree bands: every leaf gets its own band, a parent sits centred
//     on its first and last child, and two subtrees never share a band, so no
//     two steps can overlap whatever the user builds.
//   • NOTES (sticky notes that hold a sub-flow): when a run of siblings enters
//     a note, the band above them is reserved for the note's header, and the
//     note's frame is the box around its members plus that header — so the
//     frame never covers a step that is not in it.
//
// Input positions only anchor the result (the first trigger stays put); the
// shape of the graph decides everything else.

export interface LayoutOptions { hGap: number; vGap: number; rootGap: number; padX: number; padBottom: number; minNoteWidth: number }
/** A step's tile box and how far its drawing spills past it. */
export interface LayoutNode { id: string; x: number; y: number; w: number; h: number; left: number; right: number; top: number; bottom: number; first?: boolean }
export interface LayoutLink { from: string; to: string; order: number }
export interface LayoutNote { id: string; members: string[]; header: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Frame { x: number; y: number; width: number; height: number }

export const LAYOUT: LayoutOptions = { hGap: 30, vGap: 22, rootGap: 44, padX: 22, padBottom: 16, minNoteWidth: 360 };

/**
 * A step's drawn extent. `n` has the tile box (x, y, w, h) and how far the
 * drawing spills past it: `left`/`right` beyond the tile's sides, `top` above
 * it (a status badge), `bottom` measured from the tile's top edge.
 */
export const visualBox = (n: Omit<LayoutNode, 'id'> & { id?: string }, x = n.x, y = n.y): Box => ({ x0: x - n.left, y0: y - n.top, x1: x + n.w + n.right, y1: y + n.bottom });

/** A note's frame around its members' drawn boxes, `header` px reserved on top. */
export function noteFrame(boxes: Box[], header: number, o: LayoutOptions = LAYOUT): Frame | null {
  if (!boxes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  return { x: x0 - o.padX, y: y0 - header, width: Math.max(x1 - x0 + 2 * o.padX, o.minNoteWidth), height: y1 - y0 + header + o.padBottom };
}

/**
 * @param {{ nodes: Array<{id,x,y,w,h,left,right,top,bottom,first?:boolean}>,
 *           links: Array<{from,to,order}>,
 *           notes: Array<{id, members: string[], header: number}> }} g
 * @returns {{ pos: Map<string,{x,y}>, frames: Map<string,{x,y,width,height}>, rank: Map<string,number> }}
 */
export function layoutFlow(g: { nodes: LayoutNode[]; links: LayoutLink[]; notes: LayoutNote[] }, o: LayoutOptions = LAYOUT):
  { pos: Map<string, { x: number; y: number }>; frames: Map<string, Frame>; rank: Map<string, number> } {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map<string, LayoutLink[]>(g.nodes.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  for (const l of g.links) {
    if (l.from === l.to || !byId.has(l.from) || !byId.has(l.to)) continue;
    out.get(l.from)!.push(l);
    indeg.set(l.to, indeg.get(l.to)! + 1);
  }
  for (const list of out.values()) list.sort((a, b) => a.order - b.order);

  // ---- roots, then a DFS spanning tree (back edges noted, never followed) ----
  const byPlace = (a: LayoutNode, b: LayoutNode): number => (b.first ? 1 : 0) - (a.first ? 1 : 0) || a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1);
  const roots = g.nodes.filter((n) => indeg.get(n.id) === 0).sort(byPlace).map((n) => n.id);
  const kids = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]));
  const seen = new Set<string>(), onStack = new Set<string>(), back = new Set<LayoutLink>(), top: string[] = [];
  const dfs = (id: string): void => {
    seen.add(id); onStack.add(id);
    for (const l of out.get(id)!) {
      if (!seen.has(l.to)) { kids.get(id)!.push(l.to); dfs(l.to); }
      else if (onStack.has(l.to)) back.add(l);
    }
    onStack.delete(id);
  };
  for (const r of roots) if (!seen.has(r)) { top.push(r); dfs(r); }
  // A cycle with no way in: start it at its top-left step.
  for (const n of [...g.nodes].sort(byPlace)) if (!seen.has(n.id)) { top.push(n.id); dfs(n.id); }

  // ---- columns: longest path over the forward edges ------------------------
  const rank = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  const fwd = g.links.filter((l) => !back.has(l) && l.from !== l.to && byId.has(l.from) && byId.has(l.to));
  const deg = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  for (const l of fwd) deg.set(l.to, deg.get(l.to)! + 1);
  const queue = g.nodes.filter((n) => deg.get(n.id) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of fwd) {
      if (l.from !== id) continue;
      rank.set(l.to, Math.max(rank.get(l.to)!, rank.get(id)! + 1));
      deg.set(l.to, deg.get(l.to)! - 1);
      if (deg.get(l.to) === 0) queue.push(l.to);
    }
  }
  const maxRank = Math.max(0, ...rank.values());
  const L = new Array(maxRank + 1).fill(0), R = new Array(maxRank + 1).fill(0);
  for (const n of g.nodes) {
    const r = rank.get(n.id)!;
    L[r] = Math.max(L[r], n.w / 2 + n.left);
    R[r] = Math.max(R[r], n.w / 2 + n.right);
  }
  const cx = [0];
  for (let r = 1; r <= maxRank; r++) cx[r] = cx[r - 1] + R[r - 1] + o.hGap + L[r];

  // ---- rows: bands, with note headers reserved above a run of members ------
  const noteOf = new Map<string, string>();
  const noteById = new Map(g.notes.map((nt) => [nt.id, nt]));
  for (const nt of g.notes) for (const m of nt.members) if (!noteOf.has(m)) noteOf.set(m, nt.id);
  // Consecutive siblings that ENTER the same note (the parent is not in it).
  type Run = { note: string | null; ids: string[] };
  const runsOf = (parent: string | null, list: string[]): Run[] => {
    const runs: Run[] = [];
    for (const id of list) {
      const nt = noteOf.get(id);
      const enters = nt && (parent === null ? undefined : noteOf.get(parent)) !== nt ? nt : null;
      const last = runs[runs.length - 1];
      if (enters && last && last.note === enters) last.ids.push(id);
      else runs.push({ note: enters, ids: [id] });
    }
    return runs;
  };
  const band = new Map<string, number>(), kidsBand = new Map<string, number>();
  const runSize = (r: Run, gap: number): number => r.ids.reduce((s, id) => s + band.get(id)!, 0) + (r.note ? noteById.get(r.note)!.header + o.padBottom : 0) + gap;
  const measure = (id: string): void => {
    const n = byId.get(id)!;
    for (const k of kids.get(id)!) measure(k);
    const total = runsOf(id, kids.get(id)!).reduce((s, r) => s + runSize(r, 0), 0);
    kidsBand.set(id, total);
    band.set(id, Math.max(n.top + n.bottom + o.vGap, total));
  };
  const center = new Map<string, number>();
  const place = (id: string, y0: number): void => {
    const n = byId.get(id)!, list = kids.get(id)!;
    let y = y0 + (band.get(id)! - kidsBand.get(id)!) / 2;
    for (const r of runsOf(id, list)) {
      if (r.note) y += noteById.get(r.note)!.header;
      for (const k of r.ids) { place(k, y); y += band.get(k)!; }
      if (r.note) y += o.padBottom;
    }
    const lo = y0 + n.top + n.h / 2, hi = y0 + band.get(id)! - o.vGap - n.bottom + n.h / 2;
    const want = list.length ? (center.get(list[0])! + center.get(list[list.length - 1])!) / 2 : lo;
    center.set(id, Math.max(lo, Math.min(hi, want)));
  };
  for (const r of top) measure(r);
  let y = 0;
  for (const r of runsOf(null, top)) {
    if (r.note) y += noteById.get(r.note)!.header;
    for (const id of r.ids) { place(id, y); y += band.get(id)! + o.rootGap; }
    if (r.note) y += o.padBottom;
  }

  // ---- positions, anchored on the first root's current tile ----------------
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of g.nodes) pos.set(n.id, { x: cx[rank.get(n.id)!] - n.w / 2, y: center.get(n.id)! - n.h / 2 });
  const anchor = top.length ? byId.get(top[0]) : null;
  if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
    const p = pos.get(anchor.id)!, dx = anchor.x - p.x, dy = anchor.y - p.y;
    for (const v of pos.values()) { v.x = Math.round(v.x + dx); v.y = Math.round(v.y + dy); }
  }

  const frames = new Map<string, Frame>();
  for (const nt of g.notes) {
    const boxes = nt.members.filter((m) => byId.has(m)).map((m) => visualBox(byId.get(m)!, pos.get(m)!.x, pos.get(m)!.y));
    const f = noteFrame(boxes, nt.header, o);
    if (f) frames.set(nt.id, f);
  }
  return { pos, frames, rank };
}
