import type { VNode } from '../types/vnode.types';
import { clampOutputSize, DEFAULT_MAX_OUTPUT_SIZE, padRect, scopeKeysFor, vnodeBounds } from './bounds';

const g = (key: string | undefined, props: Record<string, unknown>, children: VNode[] = []): VNode =>
  ({ type: 'g', key, props, children }) as VNode;

const el = (type: string, props: Record<string, unknown>): VNode => ({ type, props } as VNode);

describe('vnodeBounds', () => {
  it('is null for a tree that paints nothing', () => {
    expect(vnodeBounds(g('root', {}, []))).toBeNull();
  });

  it("an ARC's boolean flags never enter the box (a naive pairwise scan of `d` reads them as a point)", () => {
    // `A rx ry rot large sweep x y` — the `1 0` in the middle are FLAGS. Reading them as
    // the point (1, 0) drags the box to the origin. The shared parsePath makes that
    // impossible; this pins the outcome at the bounds layer.
    const root = g('root', {}, [el('path', { d: 'M 100 100 A 20 20 0 1 0 140 100' })]);
    const box = vnodeBounds(root)!;
    expect(box.x).toBeGreaterThan(50); // nowhere near the origin
  });

  it('boxes a CURVE by its real ink, not by its control points', () => {
    // The control points sit at y=50, but a cubic never reaches them — it peaks at y≈37.5.
    // pathBounds flattens the curve, so the box is the true one.
    const root = g('root', {}, [el('path', { d: 'M 0 0 C 10 50 20 50 30 0' })]);
    const box = vnodeBounds(root)!;
    expect(box.height).toBeLessThan(50);
    expect(box.height).toBeGreaterThan(30);
  });

  it('boxes a rect', () => {
    const root = g('root', {}, [el('rect', { x: 10, y: 20, width: 30, height: 40 })]);
    expect(vnodeBounds(root)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('boxes a circle from its centre and radius', () => {
    const root = g('root', {}, [el('circle', { cx: 50, cy: 50, r: 10 })]);
    expect(vnodeBounds(root)).toEqual({ x: 40, y: 40, width: 20, height: 20 });
  });

  it('boxes an ellipse', () => {
    const root = g('root', {}, [el('ellipse', { cx: 50, cy: 50, rx: 20, ry: 10 })]);
    expect(vnodeBounds(root)).toEqual({ x: 30, y: 40, width: 40, height: 20 });
  });

  it('includes HALF the stroke, which straddles the geometry', () => {
    const root = g('root', {}, [
      el('rect', { x: 0, y: 0, width: 10, height: 10, stroke: '#000', strokeWidth: 4 }),
    ]);
    // 2px of the 4px stroke lies outside each edge.
    expect(vnodeBounds(root)).toEqual({ x: -2, y: -2, width: 14, height: 14 });
  });

  it('expands for a BLUR — the node shadow paints outside its rect, and a tight crop used to shave it', () => {
    const root = g('root', {}, [
      el('rect', { x: 3, y: 3, width: 100, height: 50, filter: 'blur(4px)', className: 'node-shadow' }),
    ]);
    // The shadow rect runs to (103, 53); its 4px blur tails out to (107, 57).
    expect(vnodeBounds(root)).toEqual({ x: -1, y: -1, width: 108, height: 58 });
  });

  it('ignores stroke-width when there is no stroke', () => {
    const root = g('root', {}, [
      el('rect', { x: 0, y: 0, width: 10, height: 10, stroke: 'none', strokeWidth: 4 }),
    ]);
    expect(vnodeBounds(root)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('applies ancestor transforms', () => {
    const root = g('root', {}, [
      g('node-a', { transform: 'translate(100, 200)' }, [el('rect', { x: 0, y: 0, width: 10, height: 10 })]),
    ]);
    expect(vnodeBounds(root)).toEqual({ x: 100, y: 200, width: 10, height: 10 });
  });

  it('boxes a ROTATED rect by its moved corners, not its original ones', () => {
    const root = g('root', {}, [
      g('node-a', { transform: 'rotate(45)' }, [el('rect', { x: -10, y: -10, width: 20, height: 20 })]),
    ]);
    const box = vnodeBounds(root)!;
    // A 20×20 square spun 45° has a diagonal of 20√2 ≈ 28.28.
    expect(box.width).toBeCloseTo(28.28, 1);
    expect(box.height).toBeCloseTo(28.28, 1);
  });

  it('EXCLUDES a display:none element — a culled node must not widen the export', () => {
    const root = g('root', {}, [
      el('rect', { x: 0, y: 0, width: 10, height: 10 }),
      el('rect', { x: 5000, y: 5000, width: 10, height: 10, display: 'none' }),
    ]);
    expect(vnodeBounds(root)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('EXCLUDES <defs> — its children are referenced, never drawn in place', () => {
    const root = g('root', {}, [
      el('rect', { x: 0, y: 0, width: 10, height: 10 }),
      { type: 'defs', props: {}, children: [el('rect', { x: 9000, y: 9000, width: 10, height: 10 })] } as VNode,
    ]);
    expect(vnodeBounds(root)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  describe('text — the reason a model-derived bbox clips labels', () => {
    it('boxes a start-anchored label around its baseline', () => {
      const root = g('root', {}, [el('text', { x: 0, y: 100, fontSize: 10, textContent: 'abcde' })]);
      const box = vnodeBounds(root)!;
      // 5 chars × 10px × 0.6 = 30 wide; baseline at y=100, ascent 0.8em above.
      expect(box.width).toBeCloseTo(30);
      expect(box.y).toBeCloseTo(92);
    });

    it('honours text-anchor: middle', () => {
      const root = g('root', {}, [
        el('text', { x: 100, y: 0, fontSize: 10, textAnchor: 'middle', textContent: 'abcde' }),
      ]);
      const box = vnodeBounds(root)!;
      expect(box.x).toBeCloseTo(85); // centred: 100 - 30/2
    });

    it('a link label OUTSIDE every node still lands in the box (the card\'s whole point)', () => {
      const root = g('root', {}, [
        g('node-a', {}, [el('rect', { x: 0, y: 0, width: 50, height: 50 })]),
        g('link-1', {}, [el('text', { x: 200, y: 300, fontSize: 12, textContent: 'label' })]),
      ]);
      const box = vnodeBounds(root)!;
      expect(box.x + box.width).toBeGreaterThan(200);
      expect(box.y + box.height).toBeGreaterThan(295);
    });
  });

  describe('selection scope', () => {
    const tree = g('root', {}, [
      g('node-a', {}, [el('rect', { x: 0, y: 0, width: 10, height: 10 })]),
      g('node-b', {}, [el('rect', { x: 500, y: 500, width: 10, height: 10 })]),
      g('link-1', {}, [el('path', { d: 'M 10 10 L 500 500' })]),
    ]);

    it('with no filter, everything is in the box', () => {
      expect(vnodeBounds(tree)).toEqual({ x: 0, y: 0, width: 510, height: 510 });
    });

    it('scopes tight around ONE selected node', () => {
      expect(vnodeBounds(tree, { includeIds: new Set(['a']) })).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    });

    it('scopes around a selected link', () => {
      expect(vnodeBounds(tree, { includeIds: new Set(['1']) })).toEqual({ x: 10, y: 10, width: 490, height: 490 });
    });

    it('a selected node pulls in its whole subtree (label + ports carry no id of their own)', () => {
      const withLabel = g('root', {}, [
        g('node-a', {}, [
          el('rect', { x: 0, y: 0, width: 10, height: 10 }),
          el('text', { x: 0, y: 40, fontSize: 10, textContent: 'x' }),
        ]),
      ]);
      const box = vnodeBounds(withLabel, { includeIds: new Set(['a']) })!;
      expect(box.height).toBeGreaterThan(10); // the label extended it
    });

    it('an id that matches nothing yields null, not a silently-empty box at the origin', () => {
      expect(vnodeBounds(tree, { includeIds: new Set(['does-not-exist']) })).toBeNull();
    });
  });

  it('scopeKeysFor builds every key shape the renderer can mint (incl. the html-layer variant)', () => {
    expect(scopeKeysFor(['a'])).toEqual(new Set(['node-a', 'node-a-html-layer', 'link-a']));
  });
});

describe('clampOutputSize', () => {
  it('leaves a size under the cap alone', () => {
    expect(clampOutputSize(100, 50, 2)).toEqual({ scale: 2, width: 200, height: 100 });
  });

  it('reduces the SCALE to fit the cap rather than cropping the picture', () => {
    // 3000 × 1000 at 3x = 9000 × 3000; the long side must come back to 4000.
    const result = clampOutputSize(3000, 1000, 3);
    expect(Math.max(result.width, result.height)).toBeCloseTo(DEFAULT_MAX_OUTPUT_SIZE);
    expect(result.scale).toBeLessThan(3);
    // aspect ratio preserved
    expect(result.width / result.height).toBeCloseTo(3);
  });

  it('warns when it had to reduce, and says how to override', () => {
    const result = clampOutputSize(5000, 5000, 2);
    expect(result.warning).toContain('exceeds the 4000px cap');
    expect(result.warning).toContain('maxSize');
  });

  it('does not warn when nothing was clamped', () => {
    expect(clampOutputSize(10, 10, 1).warning).toBeUndefined();
  });

  it('honours a custom cap', () => {
    const result = clampOutputSize(1000, 1000, 1, 500);
    expect(result.width).toBeCloseTo(500);
  });

  it('floors a sliver up to minSize, keeping the aspect ratio', () => {
    const result = clampOutputSize(10, 5, 1, 4000, 100);
    expect(Math.max(result.width, result.height)).toBeCloseTo(100);
    expect(result.width / result.height).toBeCloseTo(2);
  });
});

describe('padRect', () => {
  it('grows on every side', () => {
    expect(padRect({ x: 10, y: 10, width: 5, height: 5 }, 2)).toEqual({ x: 8, y: 8, width: 9, height: 9 });
  });
});
