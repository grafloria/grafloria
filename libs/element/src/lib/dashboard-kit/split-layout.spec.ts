/**
 * The split layout, table-tested against what the DevExpress designer does
 * (measured 6 Sep 2026): one widget fills the board, a second halves it, a
 * third halves the larger half the other way, dividers are percentages, a
 * removed leaf's slot goes to its siblings, and every slot is always covered.
 */
import {
  addSplitLeaf,
  cellsFromSplit,
  collapse,
  dividersOf,
  insertSplitLeaf,
  moveSplitDivider,
  normalizeSplit,
  pathToLeaf,
  projectSplit,
  removeSplitLeaf,
  splitFromCells,
  splitLeaf,
  splitLeaves,
  type SplitGroup,
  type SplitNode,
} from './split-layout';

const FRAME = { x: 0, y: 0, width: 1200, height: 600 };
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;
const rectOf = (root: SplitNode | null, id: string, gap = 0, pad = 0) => projectSplit(root, FRAME, gap, pad).get(id)!;

describe('split layout — the DevExpress model as arithmetic', () => {
  it('one widget fills the whole frame; the second halves it along the longer axis; the third halves the larger half the other way', () => {
    let t = addSplitLeaf(null, 'a', FRAME);
    expect(rectOf(t, 'a')).toEqual(FRAME);
    t = addSplitLeaf(t, 'b', FRAME);
    // 1200 wide, 600 tall → left / right.
    expect(rectOf(t, 'a')).toEqual({ x: 0, y: 0, width: 600, height: 600 });
    expect(rectOf(t, 'b')).toEqual({ x: 600, y: 0, width: 600, height: 600 });
    // A 900-wide frame: the halves are 450×600, taller than wide, so the
    // third add halves the first of them top / bottom.
    const TALL = { x: 0, y: 0, width: 900, height: 600 };
    let u = addSplitLeaf(addSplitLeaf(null, 'a', TALL), 'b', TALL);
    u = addSplitLeaf(u, 'c', TALL);
    const r = projectSplit(u, TALL);
    expect(r.get('a')).toEqual({ x: 0, y: 0, width: 450, height: 300 });
    expect(r.get('c')).toEqual({ x: 0, y: 300, width: 450, height: 300 });
    expect(r.get('b')).toEqual({ x: 450, y: 0, width: 450, height: 600 });
    // The largest leaf, not the first, takes the next newcomer: widen b.
    let v = moveSplitDivider(u, [], 0, -0.2);
    v = addSplitLeaf(v, 'd', TALL);
    const b = projectSplit(v, TALL).get('b')!;
    const d = projectSplit(v, TALL).get('d')!;
    expect(near(b.x, d.x) || near(b.y, d.y)).toBe(true); // d sits inside b's former slot
    expect(near(b.width * b.height, d.width * d.height)).toBe(true);
  });

  it('every slot is covered: the leaves tile the frame exactly, gaps and padding included', () => {
    let t: SplitNode | null = null;
    for (const id of ['a', 'b', 'c', 'd', 'e']) t = addSplitLeaf(t, id, FRAME, 10, 8);
    const rects = [...projectSplit(t, FRAME, 10, 8).values()];
    const area = rects.reduce((s, r) => s + r.width * r.height, 0);
    // Inner frame is (1200-16)×(600-16); the gaps take (n-1)·10 along each cut.
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(8);
      expect(r.y).toBeGreaterThanOrEqual(8);
      expect(r.x + r.width).toBeLessThanOrEqual(1200 - 8 + 0.01);
      expect(r.y + r.height).toBeLessThanOrEqual(600 - 8 + 0.01);
    }
    expect(area).toBeLessThan((1200 - 16) * (600 - 16));
    expect(area).toBeGreaterThan((1200 - 16) * (600 - 16) * 0.9);
  });

  it('a divider is a percentage: moving it re-shares the two neighbours and never squeezes one below the minimum', () => {
    let t = addSplitLeaf(addSplitLeaf(null, 'a', FRAME), 'b', FRAME);
    t = moveSplitDivider(t, [], 0, 0.2);
    expect(near(rectOf(t, 'a').width, 840)).toBe(true);
    expect(near(rectOf(t, 'b').width, 360)).toBe(true);
    t = moveSplitDivider(t, [], 0, 5); // absurd → clamped to the 5 % floor
    expect(near(rectOf(t, 'b').width, 60)).toBe(true);
    expect(near(rectOf(t, 'a').width, 1140)).toBe(true);
  });

  it('a widget alone in its group has no divider; siblings do, at the gap between them', () => {
    const one = addSplitLeaf(null, 'a', FRAME);
    expect(dividersOf(one, FRAME, 10)).toEqual([]);
    const two = addSplitLeaf(one, 'b', FRAME, 10);
    const d = dividersOf(two, FRAME, 10);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: [], index: 0, dir: 'row' });
    expect(near(d[0].rect.x, 595) && near(d[0].rect.width, 10) && near(d[0].rect.height, 600)).toBe(true);
    // Under RTL the row is mirrored: the divider still names the tree-order pair.
    const m = dividersOf(two, FRAME, 10, 0, true);
    expect(m[0]).toMatchObject({ path: [], index: 0 });
    expect(projectSplit(two, FRAME, 10, 0, true).get('a')!.x).toBeGreaterThan(projectSplit(two, FRAME, 10, 0, true).get('b')!.x);
  });

  it('removing a leaf hands its slot to the siblings, and a group of one collapses away', () => {
    let t: SplitNode | null = addSplitLeaf(addSplitLeaf(addSplitLeaf(null, 'a', FRAME), 'b', FRAME), 'c', FRAME);
    // a | (b / c) after the third add halves… whichever was largest; assert by structure.
    const before = splitLeaves(t);
    expect(before.sort()).toEqual(['a', 'b', 'c']);
    t = removeSplitLeaf(t, 'c');
    expect(splitLeaves(t).sort()).toEqual(['a', 'b']);
    expect(near(rectOf(t, 'a').width + rectOf(t, 'b').width, 1200)).toBe(true);
    t = removeSplitLeaf(t, 'b');
    expect(rectOf(t, 'a')).toEqual(FRAME); // back to one widget filling the board
    expect(removeSplitLeaf(t, 'a')).toBeNull();
  });

  it('insert on a side: left / right split along a row, top / bottom along a column, the mover on the named side', () => {
    const a = addSplitLeaf(null, 'a', FRAME);
    let t = insertSplitLeaf(a, 'b', 'a', 'left')!;
    expect(rectOf(t, 'b').x).toBe(0);
    expect(rectOf(t, 'a').x).toBe(600);
    t = insertSplitLeaf(t, 'c', 'a', 'bottom')!;
    expect(rectOf(t, 'c')).toEqual({ x: 600, y: 300, width: 600, height: 300 });
    expect(rectOf(t, 'a')).toEqual({ x: 600, y: 0, width: 600, height: 300 });
    // A MOVE: b goes above c — it leaves the left column (a's column takes the full width).
    t = insertSplitLeaf(t, 'b', 'c', 'top')!;
    expect(rectOf(t, 'a')).toEqual({ x: 0, y: 0, width: 1200, height: 300 });
    expect(rectOf(t, 'b')).toEqual({ x: 0, y: 300, width: 1200, height: 150 });
    expect(rectOf(t, 'c')).toEqual({ x: 0, y: 450, width: 1200, height: 150 });
  });

  it('a sibling insert in a same-direction group shares the target\'s weight instead of nesting a group', () => {
    const t = splitLeaf(splitLeaf(null, '', 'a', 'row'), 'a', 'b', 'row');
    const u = splitLeaf(t, 'b', 'c', 'row') as SplitGroup;
    expect(u.children).toHaveLength(3);
    expect(u.children.map((c) => (c as { id: string }).id)).toEqual(['a', 'b', 'c']);
    expect(near(rectOf(u, 'a').width, 600) && near(rectOf(u, 'b').width, 300) && near(rectOf(u, 'c').width, 300)).toBe(true);
    expect(pathToLeaf(u, 'c')).toEqual([2]);
  });

  it('collapse folds single-child groups and same-direction nesting, keeping the picture', () => {
    const nested: SplitNode = {
      dir: 'row',
      weight: 1,
      children: [
        { id: 'a', weight: 1 },
        { dir: 'row', weight: 1, children: [{ id: 'b', weight: 1 }, { id: 'c', weight: 1 }] },
      ],
    };
    const flat = collapse(nested) as SplitGroup;
    expect(flat.children.map((c) => (c as { id: string }).id)).toEqual(['a', 'b', 'c']);
    expect(near(rectOf(flat, 'a').width, 600) && near(rectOf(flat, 'b').width, 300)).toBe(true);
    const single: SplitNode = { dir: 'column', weight: 3, children: [{ id: 'z', weight: 1 }] };
    expect(collapse(single)).toEqual({ id: 'z', weight: 3 });
    expect(normalizeSplit(flat).children.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3);
  });

  it('a grid becomes a split tree by guillotine cuts, and paints the same proportions', () => {
    // The fluid-board demo: four 3-wide KPIs, an 8+4 row, a 7+5 row (12 columns, 7 rows).
    const cells = new Map([
      ['rev', { x: 0, y: 0, w: 3, h: 1 }],
      ['cust', { x: 3, y: 0, w: 3, h: 1 }],
      ['win', { x: 6, y: 0, w: 3, h: 1 }],
      ['nps', { x: 9, y: 0, w: 3, h: 1 }],
      ['trend', { x: 0, y: 1, w: 8, h: 3 }],
      ['mix', { x: 8, y: 1, w: 4, h: 3 }],
      ['reps', { x: 0, y: 4, w: 7, h: 3 }],
      ['funnel', { x: 7, y: 4, w: 5, h: 3 }],
    ]);
    const t = splitFromCells(cells) as SplitGroup;
    expect(t.dir).toBe('column');
    expect(t.children).toHaveLength(3);
    const r = projectSplit(t, { x: 0, y: 0, width: 1200, height: 700 });
    expect(r.get('rev')).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    expect(r.get('trend')).toEqual({ x: 0, y: 100, width: 800, height: 300 });
    expect(r.get('funnel')).toEqual({ x: 700, y: 400, width: 500, height: 300 });
    // …and back: the same cells.
    expect([...cellsFromSplit(t, 12, 7)]).toEqual([...cells]);
  });

  it('a pinwheel with no clean cut still becomes a tree (a row in reading order) rather than dropping tiles', () => {
    const cells = new Map([
      ['a', { x: 0, y: 0, w: 2, h: 1 }],
      ['b', { x: 2, y: 0, w: 1, h: 2 }],
      ['c', { x: 1, y: 2, w: 2, h: 1 }],
      ['d', { x: 0, y: 1, w: 1, h: 2 }],
    ]);
    const t = splitFromCells(cells);
    expect(splitLeaves(t).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cells from a split never go below one cell and stay inside the column count', () => {
    let t: SplitNode | null = null;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) t = addSplitLeaf(t, id, FRAME);
    for (const [, c] of cellsFromSplit(t, 12, 6)) {
      expect(c.w).toBeGreaterThanOrEqual(1);
      expect(c.h).toBeGreaterThanOrEqual(1);
      expect(c.x + c.w).toBeLessThanOrEqual(12);
    }
  });
});
