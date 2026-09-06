/**
 * SPLIT LAYOUT — the DevExpress dashboard model, as pure arithmetic.
 *
 * A board is a tree: groups split their slot into children along one axis
 * ('row' = left→right, 'column' = top→bottom), each child taking a WEIGHT of
 * the group's length; leaves are the widgets. Every slot is covered exactly,
 * so there is never an empty space — one widget fills the whole board, a
 * second halves it, a third halves the larger half the other way. Measured
 * on the DevExpress Web Dashboard designer (6 Sep 2026): one item 1481×823;
 * two → 409/409; a third → the larger halved 738+738; a divider drag moved
 * 409/409 to 286/532 (a percentage, not a pixel size); the item alone in its
 * group has no divider of its own — its size IS the group's.
 *
 * Nothing in here touches the DOM or the model: the binder projects the tree
 * onto a frame with `projectSplit`, hit-tests `dividersOf`, and persists the
 * tree as plain JSON (`dashboardTree` on the board's group). One tree write
 * per gesture is the whole undo story.
 */

import type { CellRect, WorldRect } from './grid-mapping';

export type SplitDir = 'row' | 'column';
export interface SplitLeaf {
  id: string;
  weight: number;
}
export interface SplitGroup {
  dir: SplitDir;
  weight: number;
  children: SplitNode[];
}
export type SplitNode = SplitLeaf | SplitGroup;
export type SplitSide = 'left' | 'right' | 'top' | 'bottom';

export const isSplitGroup = (n: SplitNode | null | undefined): n is SplitGroup =>
  !!n && typeof n === 'object' && Array.isArray((n as SplitGroup).children);

/** Every widget id in the tree, depth-first, in reading order. */
export function splitLeaves(root: SplitNode | null): string[] {
  if (!root) return [];
  return isSplitGroup(root) ? root.children.flatMap(splitLeaves) : [root.id];
}

/** A deep copy — commands keep the before/after trees, so they must not share. */
export function cloneSplit<T extends SplitNode | null>(root: T): T {
  if (!root) return root;
  if (isSplitGroup(root)) {
    return { dir: root.dir, weight: root.weight, children: root.children.map((c) => cloneSplit(c)) } as T;
  }
  return { id: (root as SplitLeaf).id, weight: root.weight } as T;
}

/** Index path from the root to the leaf with `id` (empty for the root itself), or null. */
export function pathToLeaf(root: SplitNode | null, id: string, path: number[] = []): number[] | null {
  if (!root) return null;
  if (!isSplitGroup(root)) return root.id === id ? path : null;
  for (let i = 0; i < root.children.length; i++) {
    const p = pathToLeaf(root.children[i], id, [...path, i]);
    if (p) return p;
  }
  return null;
}

export function nodeAt(root: SplitNode | null, path: readonly number[]): SplitNode | null {
  let n: SplitNode | null = root;
  for (const i of path) {
    if (!isSplitGroup(n)) return null;
    n = n.children[i] ?? null;
  }
  return n;
}

const sum = (children: readonly SplitNode[]): number => children.reduce((s, c) => s + Math.max(0, c.weight), 0) || 1;

/**
 * Project the tree onto `frame`: every leaf's world rect, `gap` px between
 * siblings, `padding` px inside the frame. A group's children share its
 * length in proportion to their weights.
 */
export function projectSplit(
  root: SplitNode | null,
  frame: WorldRect,
  gap = 0,
  padding = 0,
  rtl = false
): Map<string, WorldRect> {
  const out = new Map<string, WorldRect>();
  if (!root) return out;
  const inner: WorldRect = {
    x: frame.x + padding,
    y: frame.y + padding,
    width: Math.max(0, frame.width - 2 * padding),
    height: Math.max(0, frame.height - 2 * padding),
  };
  const walk = (node: SplitNode, r: WorldRect): void => {
    if (!isSplitGroup(node)) {
      out.set(node.id, { ...r });
      return;
    }
    const n = node.children.length;
    if (!n) return;
    const total = sum(node.children);
    const along = node.dir === 'row' ? r.width : r.height;
    const free = Math.max(0, along - gap * (n - 1));
    let cursor = 0;
    const order = node.dir === 'row' && rtl ? [...node.children].reverse() : node.children;
    for (const child of order) {
      const size = (free * Math.max(0, child.weight)) / total;
      const cr: WorldRect =
        node.dir === 'row'
          ? { x: r.x + cursor, y: r.y, width: size, height: r.height }
          : { x: r.x, y: r.y + cursor, width: r.width, height: size };
      walk(child, cr);
      cursor += size + gap;
    }
  };
  walk(root, inner);
  return out;
}

/** Every GROUP's projected rect, keyed by its index path — drop targets for "under all of these". */
export interface SplitGroupRect {
  path: number[];
  dir: SplitDir;
  rect: WorldRect;
}
export function groupRectsOf(root: SplitNode | null, frame: WorldRect, gap = 0, padding = 0, rtl = false): SplitGroupRect[] {
  const out: SplitGroupRect[] = [];
  if (!root) return out;
  const inner: WorldRect = {
    x: frame.x + padding,
    y: frame.y + padding,
    width: Math.max(0, frame.width - 2 * padding),
    height: Math.max(0, frame.height - 2 * padding),
  };
  const walk = (node: SplitNode, r: WorldRect, path: number[]): void => {
    if (!isSplitGroup(node)) return;
    out.push({ path, dir: node.dir, rect: { ...r } });
    const n = node.children.length;
    if (!n) return;
    const total = sum(node.children);
    const along = node.dir === 'row' ? r.width : r.height;
    const free = Math.max(0, along - gap * (n - 1));
    let cursor = 0;
    const mirrored = node.dir === 'row' && rtl;
    for (let i = 0; i < n; i++) {
      const idx = mirrored ? n - 1 - i : i;
      const c = node.children[idx];
      const size = (free * Math.max(0, c.weight)) / total;
      const cr: WorldRect =
        node.dir === 'row'
          ? { x: r.x + cursor, y: r.y, width: size, height: r.height }
          : { x: r.x, y: r.y + cursor, width: r.width, height: size };
      walk(c, cr, [...path, idx]);
      cursor += size + gap;
    }
  };
  walk(root, inner, []);
  return out;
}

/** One draggable divider: the gap between two siblings of a group. */
export interface SplitDivider {
  /** Index path to the GROUP that owns the divider. */
  path: number[];
  /** The divider sits after child `index` (between `index` and `index + 1`). */
  index: number;
  dir: SplitDir;
  /** The gap's world rect — the hit zone the binder widens. */
  rect: WorldRect;
  /** The group's free length along its axis, so a px delta becomes a fraction. */
  length: number;
}

export function dividersOf(
  root: SplitNode | null,
  frame: WorldRect,
  gap = 0,
  padding = 0,
  rtl = false
): SplitDivider[] {
  const out: SplitDivider[] = [];
  if (!root) return out;
  const inner: WorldRect = {
    x: frame.x + padding,
    y: frame.y + padding,
    width: Math.max(0, frame.width - 2 * padding),
    height: Math.max(0, frame.height - 2 * padding),
  };
  const walk = (node: SplitNode, r: WorldRect, path: number[]): void => {
    if (!isSplitGroup(node)) return;
    const n = node.children.length;
    if (!n) return;
    const total = sum(node.children);
    const along = node.dir === 'row' ? r.width : r.height;
    const free = Math.max(0, along - gap * (n - 1));
    let cursor = 0;
    const mirrored = node.dir === 'row' && rtl;
    node.children.forEach((child, i) => {
      const idx = mirrored ? n - 1 - i : i;
      const c = node.children[idx];
      const size = (free * Math.max(0, c.weight)) / total;
      const cr: WorldRect =
        node.dir === 'row'
          ? { x: r.x + cursor, y: r.y, width: size, height: r.height }
          : { x: r.x, y: r.y + cursor, width: r.width, height: size };
      walk(c, cr, [...path, idx]);
      if (i < n - 1) {
        const gapRect: WorldRect =
          node.dir === 'row'
            ? { x: r.x + cursor + size, y: r.y, width: gap, height: r.height }
            : { x: r.x, y: r.y + cursor + size, width: r.width, height: gap };
        // The divider belongs between the two children in TREE order.
        const after = mirrored ? idx - 1 : idx;
        out.push({ path, index: after, dir: node.dir, rect: gapRect, length: free });
      }
      cursor += size + gap;
      void child;
    });
  };
  walk(root, inner, []);
  return out;
}

/**
 * Split the leaf `targetId`'s slot to make room for `newId`: along `dir`,
 * the newcomer `before` or after the target. If the target's parent already
 * runs along `dir` the newcomer becomes a sibling and the two share the
 * target's former weight; otherwise the target's slot becomes a new group of
 * the two, equal halves. Returns the new root (never mutates the input).
 */
export function splitLeaf(
  root: SplitNode | null,
  targetId: string,
  newId: string,
  dir: SplitDir,
  before = false
): SplitNode {
  if (!root) return { id: newId, weight: 1 };
  const path = pathToLeaf(root, targetId);
  return path ? splitAt(root, path, newId, dir, before) : cloneSplit(root);
}

/**
 * Split the slot of the node at `path` — a leaf OR a whole group — to make
 * room for `newId` beside it: the DevExpress drop on a group's outer edge
 * ("under all of these columns", not under one of them). Same weight rule as
 * `splitLeaf`; a group target keeps its inner structure intact.
 */
export function splitAt(root: SplitNode | null, path: readonly number[], newId: string, dir: SplitDir, before = false): SplitNode {
  const leaf: SplitLeaf = { id: newId, weight: 1 };
  if (!root) return leaf;
  const tree = cloneSplit(root);
  const target = nodeAt(tree, path);
  if (!target) return tree;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const parent = path.length ? (nodeAt(tree, parentPath) as SplitGroup) : null;
  if (parent && parent.dir === dir) {
    const half = target.weight / 2;
    target.weight = half;
    leaf.weight = half;
    parent.children.splice(before ? idx : idx + 1, 0, leaf);
    return tree;
  }
  const group: SplitGroup = {
    dir,
    weight: target.weight,
    children: before ? [leaf, { ...target, weight: 1 }] : [{ ...target, weight: 1 }, leaf],
  };
  if (!parent) return group;
  parent.children[idx] = group;
  return tree;
}

/**
 * ADD, the DevExpress way: the newcomer halves the LARGEST leaf, along that
 * leaf's longer axis — so a wide board's first add gives left / right, and
 * the halves, now taller than wide, split top / bottom under the next add.
 */
export function addSplitLeaf(root: SplitNode | null, newId: string, frame: WorldRect, gap = 0, padding = 0): SplitNode {
  if (!root) return { id: newId, weight: 1 };
  if (pathToLeaf(root, newId)) return cloneSplit(root);
  const rects = projectSplit(root, frame, gap, padding);
  let bestId: string | null = null;
  let best: WorldRect | null = null;
  for (const [id, r] of rects) {
    if (!best || r.width * r.height > best.width * best.height + 0.5) {
      best = r;
      bestId = id;
    }
  }
  if (!bestId || !best) return cloneSplit(root);
  return splitLeaf(root, bestId, newId, best.width >= best.height ? 'row' : 'column', false);
}

/**
 * Remove a leaf. Its slot goes to the NEIGHBOUR it was split from — the
 * sibling before it, else the one after (DevExpress: deleting an item hands
 * its space to the adjacent item, and an add followed by a remove gives the
 * board back exactly). A group left with one child collapses into its
 * parent, and a collapsed child running the same way as its new parent is
 * spliced in so the tree never carries a redundant level.
 */
export function removeSplitLeaf(root: SplitNode | null, id: string): SplitNode | null {
  if (!root) return null;
  if (!isSplitGroup(root)) return root.id === id ? null : cloneSplit(root);
  const tree = cloneSplit(root) as SplitGroup;
  const path = pathToLeaf(tree, id);
  if (!path) return tree;
  const parent = nodeAt(tree, path.slice(0, -1)) as SplitGroup;
  const i = path[path.length - 1];
  const [gone] = parent.children.splice(i, 1);
  const heir = parent.children[i - 1] ?? parent.children[i];
  if (heir) heir.weight += Math.max(0, gone.weight);
  return collapse(tree);
}

/** Fold single-child groups and same-direction nesting away. */
export function collapse(node: SplitNode | null): SplitNode | null {
  if (!node || !isSplitGroup(node)) return node;
  const kids = node.children.map((c) => collapse(c)).filter((c): c is SplitNode => !!c);
  if (kids.length === 0) return null;
  if (kids.length === 1) return { ...(kids[0] as SplitNode), weight: node.weight } as SplitNode;
  const flat: SplitNode[] = [];
  const total = sum(kids);
  for (const k of kids) {
    if (isSplitGroup(k) && k.dir === node.dir) {
      const inner = sum(k.children);
      for (const g of k.children) flat.push({ ...g, weight: (k.weight / total) * (g.weight / inner) * total });
    } else flat.push(k);
  }
  return { dir: node.dir, weight: node.weight, children: flat };
}

/**
 * Drop `id` on `side` of `targetId` (a move when `id` is already in the tree).
 * left / right split the target's slot along a row, top / bottom along a
 * column; the mover lands on the named side.
 */
export function insertSplitLeaf(
  root: SplitNode | null,
  id: string,
  target: string | { path: readonly number[] },
  side: SplitSide
): SplitNode | null {
  if (typeof target === 'string' && id === target) return cloneSplit(root);
  const without = pathToLeaf(root, id) ? removeSplitLeaf(root, id) : cloneSplit(root);
  if (!without) return { id, weight: 1 };
  const dir: SplitDir = side === 'left' || side === 'right' ? 'row' : 'column';
  const before = side === 'left' || side === 'top';
  if (typeof target === 'string') {
    if (!pathToLeaf(without, target)) return without;
    return splitLeaf(without, target, id, dir, before);
  }
  // A GROUP target: its path was read from the tree WITHOUT the mover (the
  // painted one), so it addresses the same node here.
  if (!nodeAt(without, target.path)) return without;
  return splitAt(without, target.path, id, dir, before);
}

/**
 * Move the divider after child `index` of the group at `path` by `fraction`
 * of the group's free length (positive = towards the end). Neither neighbour
 * may shrink below `min` of the group. Returns the new root.
 */
export function moveSplitDivider(
  root: SplitNode,
  path: readonly number[],
  index: number,
  fraction: number,
  min = 0.05
): SplitNode {
  const tree = cloneSplit(root);
  const group = nodeAt(tree, path);
  if (!isSplitGroup(group) || index < 0 || index >= group.children.length - 1) return tree;
  const total = sum(group.children);
  const a = group.children[index];
  const b = group.children[index + 1];
  const fa = a.weight / total;
  const fb = b.weight / total;
  const next = Math.min(Math.max(fa + fraction, min), fa + fb - min);
  if (!Number.isFinite(next)) return tree;
  a.weight = next * total;
  b.weight = (fa + fb - next) * total;
  return tree;
}

/** Weights as fractions summing to 1 in every group — tidy JSON, same picture. */
export function normalizeSplit<T extends SplitNode | null>(root: T): T {
  if (!root || !isSplitGroup(root)) return root;
  const total = sum(root.children);
  return {
    dir: root.dir,
    weight: root.weight,
    children: root.children.map((c) => ({ ...normalizeSplit(c), weight: +(Math.max(0, c.weight) / total).toFixed(4) })),
  } as T;
}

// ---- conversions ------------------------------------------------------------

/**
 * A GRID layout (cells) as a split tree — guillotine cuts: every horizontal
 * line no tile straddles becomes a row boundary (a column group), inside each
 * band every vertical line no tile straddles becomes a column boundary (a row
 * group), and so on. Weights are the bands' cell extents, so the tree paints
 * the grid's proportions. Tiles that interleave with no clean cut (a pinwheel)
 * fall back to a row in reading order.
 */
export function splitFromCells(cells: ReadonlyMap<string, CellRect>): SplitNode | null {
  const items = [...cells].map(([id, c]) => ({ id, ...c }));
  if (!items.length) return null;
  type Item = (typeof items)[number];
  const cutsAlong = (list: Item[], axis: 'y' | 'x'): number[] => {
    const lo = Math.min(...list.map((i) => (axis === 'y' ? i.y : i.x)));
    const hi = Math.max(...list.map((i) => (axis === 'y' ? i.y + i.h : i.x + i.w)));
    const lines = new Set<number>();
    for (const i of list) {
      const a = axis === 'y' ? i.y : i.x;
      const b = axis === 'y' ? i.y + i.h : i.x + i.w;
      if (a > lo) lines.add(a);
      if (b < hi) lines.add(b);
    }
    return [...lines]
      .filter((line) => list.every((i) => (axis === 'y' ? i.y >= line || i.y + i.h <= line : i.x >= line || i.x + i.w <= line)))
      .sort((p, q) => p - q);
  };
  const build = (list: Item[], prefer: 'y' | 'x'): SplitNode => {
    if (list.length === 1) return { id: list[0].id, weight: 1 };
    for (const axis of [prefer, prefer === 'y' ? 'x' : 'y'] as const) {
      const cuts = cutsAlong(list, axis);
      if (!cuts.length) continue;
      const lo = Math.min(...list.map((i) => (axis === 'y' ? i.y : i.x)));
      const hi = Math.max(...list.map((i) => (axis === 'y' ? i.y + i.h : i.x + i.w)));
      const edges = [lo, ...cuts, hi];
      const children: SplitNode[] = [];
      for (let k = 0; k < edges.length - 1; k++) {
        const band = list.filter((i) => (axis === 'y' ? i.y >= edges[k] && i.y + i.h <= edges[k + 1] : i.x >= edges[k] && i.x + i.w <= edges[k + 1]));
        if (!band.length) continue;
        const child = build(band, axis === 'y' ? 'x' : 'y');
        children.push({ ...child, weight: edges[k + 1] - edges[k] });
      }
      return children.length === 1 ? children[0] : { dir: axis === 'y' ? 'column' : 'row', weight: 1, children };
    }
    const sorted = [...list].sort((p, q) => p.x - q.x || p.y - q.y);
    return { dir: 'row', weight: 1, children: sorted.map((i) => ({ id: i.id, weight: i.w })) };
  };
  return collapse(build(items, 'y'));
}

/**
 * A split tree as GRID cells: project onto a `columns` × `rows` unit frame and
 * snap every edge to the nearest line (never below one cell). What a designer
 * gets when switching a split board back to the grid.
 */
export function cellsFromSplit(root: SplitNode | null, columns: number, rows: number): Map<string, CellRect> {
  const out = new Map<string, CellRect>();
  const rects = projectSplit(root, { x: 0, y: 0, width: columns, height: rows });
  for (const [id, r] of rects) {
    const x = Math.max(0, Math.min(columns - 1, Math.round(r.x)));
    const y = Math.max(0, Math.round(r.y));
    const x2 = Math.max(x + 1, Math.min(columns, Math.round(r.x + r.width)));
    const y2 = Math.max(y + 1, Math.round(r.y + r.height));
    out.set(id, { x, y, w: x2 - x, h: y2 - y });
  }
  return out;
}
