import type { VNode } from '../types/vnode.types';
import {
  applyMatrix,
  clampOutputSize,
  DEFAULT_MAX_OUTPUT_SIZE,
  IDENTITY,
  padRect,
  parseTransform,
  pathPoints,
  scopeKeysFor,
  vnodeBounds,
} from './bounds';

const g = (key: string | undefined, props: Record<string, unknown>, children: VNode[] = []): VNode =>
  ({ type: 'g', key, props, children }) as VNode;

const el = (type: string, props: Record<string, unknown>): VNode => ({ type, props } as VNode);

describe('parseTransform', () => {
  it('parses translate', () => {
    expect(parseTransform('translate(10, 20)')).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
  });

  it('treats scale(2) as UNIFORM — the y factor defaults to x, not to 1', () => {
    const m = parseTransform('scale(2)');
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
  });

  it('parses a non-uniform scale', () => {
    const m = parseTransform('scale(2, 3)');
    expect(m.a).toBe(2);
    expect(m.d).toBe(3);
  });

  it('rotates about a point (the 3-arg form) — the centre stays put', () => {
    const m = parseTransform('rotate(90, 100, 100)');
    const centre = applyMatrix(m, 100, 100);
    expect(centre.x).toBeCloseTo(100);
    expect(centre.y).toBeCloseTo(100);
  });

  it('composes a chain left-to-right, like SVG does', () => {
    // translate then rotate: the rotation happens in the translated space.
    const m = parseTransform('translate(100, 200) rotate(90)');
    const p = applyMatrix(m, 10, 0);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(210);
  });

  it('parses a raw matrix', () => {
    expect(parseTransform('matrix(1 2 3 4 5 6)')).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
  });

  it('ignores an unknown function rather than throwing', () => {
    expect(parseTransform('wobble(3) translate(5, 5)').e).toBe(5);
  });

  it('is identity for undefined/empty', () => {
    expect(parseTransform(undefined)).toEqual(IDENTITY);
    expect(parseTransform('')).toEqual(IDENTITY);
  });
});

describe('pathPoints', () => {
  it('reads absolute move/line points', () => {
    expect(pathPoints('M 10 20 L 30 40')).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });

  it('accumulates relative commands from the pen position', () => {
    expect(pathPoints('M 10 10 l 5 5')).toEqual([
      [10, 10],
      [15, 15],
    ]);
  });

  it('handles H and V, which carry ONE coordinate each', () => {
    expect(pathPoints('M 0 0 H 50 V 25')).toEqual([
      [0, 0],
      [50, 0],
      [50, 25],
    ]);
  });

  it('does NOT read an arc\'s boolean flags as a coordinate pair', () => {
    // A rx ry rot large-arc sweep x y — the `1 0` in the middle are FLAGS. A naive
    // pair-wise scan reads them as the point (1, 0) and drags the bbox to the origin.
    const points = pathPoints('M 100 100 A 20 20 0 1 0 140 100');
    expect(points).toEqual([
      [100, 100],
      [140, 100],
    ]);
    expect(points).not.toContainEqual([1, 0]);
  });

  it('includes Bezier control points (a deliberate over-approximation)', () => {
    const points = pathPoints('M 0 0 C 10 50 20 50 30 0');
    expect(points).toContainEqual([10, 50]);
    expect(points).toContainEqual([30, 0]);
  });

  it('is empty for a non-string', () => {
    expect(pathPoints(undefined)).toEqual([]);
  });
});

describe('vnodeBounds', () => {
  it('is null for a tree that paints nothing', () => {
    expect(vnodeBounds(g('root', {}, []))).toBeNull();
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

  it('scopeKeysFor builds the renderer\'s real key shapes', () => {
    expect(scopeKeysFor(['a'])).toEqual(new Set(['node-a', 'link-a']));
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
