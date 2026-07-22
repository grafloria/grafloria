// Shared layout assertions for the layout gallery. Imported by the layout demos.
//
// The point of factoring these out is that "no two nodes overlap", "the graph is
// LAYERED", "two runs are byte-identical" are the same three teeth every layout
// demo needs, and writing them once means a regression in any of them lights up
// every page at once.

/** Every node's world box, keyed by id. */
export const boxes = (model) =>
  model.getNodes().map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    w: n.size.width,
    h: n.size.height,
  }));

/** Canonical position string. Two runs of the same layout must produce the SAME one. */
export const signature = (model) =>
  boxes(model)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((b) => `${b.id}:${b.x.toFixed(4)},${b.y.toFixed(4)}`)
    .join('|');

/** Pairs of nodes whose boxes intersect. A layout that returns any is broken. */
export function overlaps(model) {
  const bs = boxes(model);
  const hits = [];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        hits.push(`${a.id}×${b.id}`);
      }
    }
  }
  return hits;
}

/** Center point of a node. */
export const center = (n) => ({ x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 });

/** Stack every node back at (0,0) — the control before a layout run. */
export const restack = (model) => model.getNodes().forEach((n) => n.setPosition(0, 0));

/**
 * For a TB / LR layered layout: how many of `edges` point "forward" along the
 * layout axis (target strictly beyond source). A hierarchical layout puts every
 * DAG edge on the same side of every rank boundary; a no-op or a force blob does
 * not. Returns { forward, total, backward:[...] }.
 */
export function layering(model, edges, axis /* 'y' | 'x' */, minGap = 1) {
  let forward = 0;
  const backward = [];
  for (const e of edges) {
    const s = model.getNode(e.source);
    const t = model.getNode(e.target);
    if (!s || !t) continue;
    const cs = center(s)[axis];
    const ct = center(t)[axis];
    if (ct > cs + minGap) forward++;
    else backward.push(`${e.source}->${e.target}`);
  }
  return { forward, total: edges.length, backward };
}

/** Mean pairwise center distance across a set of nodes. */
export function meanPairDistance(model, ids) {
  const ns = ids.map((id) => model.getNode(id)).filter(Boolean);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const a = center(ns[i]);
      const b = center(ns[j]);
      sum += Math.hypot(a.x - b.x, a.y - b.y);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** Mean center distance across an explicit list of [sourceId,targetId] pairs. */
export function meanEdgeDistance(model, pairs) {
  let sum = 0;
  let count = 0;
  for (const [s, t] of pairs) {
    const a = model.getNode(s);
    const b = model.getNode(t);
    if (!a || !b) continue;
    const ca = center(a);
    const cb = center(b);
    sum += Math.hypot(ca.x - cb.x, ca.y - cb.y);
    count++;
  }
  return count ? sum / count : 0;
}

/** Axis-aligned bounding box of a set of node ids. */
export function bbox(model, ids) {
  const ns = ids.map((id) => model.getNode(id)).filter(Boolean);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of ns) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + n.size.width);
    maxY = Math.max(maxY, n.position.y + n.size.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const boxesIntersect = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
