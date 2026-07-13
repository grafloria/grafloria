// The geometry layer is the foundation the whole canvas backend stands on: if a
// path is parsed wrong, the pixels AND the hit region are wrong together (they
// come from the same command list), so these tests are deliberately picky.

import {
  arcToCubics,
  circlePath,
  distanceToPath,
  ellipsePath,
  flattenPath,
  linePath,
  multiply,
  parsePath,
  parseTransform,
  pathBounds,
  pointInPath,
  polyPath,
  rectPath,
  rotation,
  scaling,
  transformCmds,
  translation,
  type PathCmd,
} from './path-geometry';

const near = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

describe('path-geometry — primitives', () => {
  it('builds a sharp rect as 4 lines + close', () => {
    const cmds = rectPath(10, 20, 100, 50);
    expect(cmds.map((c) => c.op)).toEqual(['M', 'L', 'L', 'L', 'Z']);
    expect(cmds[0]).toEqual({ op: 'M', x: 10, y: 20 });
    expect(cmds[2]).toEqual({ op: 'L', x: 110, y: 70 });
  });

  it('builds a rounded rect with cubic corners and clamps oversized radii', () => {
    const cmds = rectPath(0, 0, 20, 10, 100, 100);
    expect(cmds.filter((c) => c.op === 'C')).toHaveLength(4);
    const b = pathBounds(cmds)!;
    // radius clamps to half the smaller side, so the shape stays inside 20x10
    near(b.minX, 0);
    near(b.maxX, 20);
    near(b.maxY, 10);
  });

  it('normalises a negative-size rect', () => {
    const cmds = rectPath(100, 100, -40, -20);
    const b = pathBounds(cmds)!;
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([60, 80, 100, 100]);
  });

  it('approximates a circle to within a fraction of a pixel', () => {
    const cmds = circlePath(0, 0, 100);
    for (const sub of flattenPath(cmds, 32)) {
      for (const p of sub.points) {
        near(Math.hypot(p.x, p.y), 100, 0.05);
      }
    }
  });

  it('builds an ellipse with the right bounds', () => {
    const b = pathBounds(ellipsePath(50, 30, 50, 30))!;
    near(b.minX, 0);
    near(b.maxX, 100);
    near(b.minY, 0);
    near(b.maxY, 60);
  });

  it('parses polygon and polyline points', () => {
    expect(polyPath('0,0 10,0 10,10', true).map((c) => c.op)).toEqual(['M', 'L', 'L', 'Z']);
    expect(polyPath('0 0 10 0', false).map((c) => c.op)).toEqual(['M', 'L']);
  });

  it('builds a line', () => {
    expect(linePath(1, 2, 3, 4)).toEqual([
      { op: 'M', x: 1, y: 2 },
      { op: 'L', x: 3, y: 4 },
    ]);
  });
});

describe('path-geometry — SVG path parser', () => {
  it('parses absolute and relative move/line', () => {
    expect(parsePath('M 10 10 L 20 20 l 10 0 H 50 V 5 Z')).toEqual([
      { op: 'M', x: 10, y: 10 },
      { op: 'L', x: 20, y: 20 },
      { op: 'L', x: 30, y: 20 },
      { op: 'L', x: 50, y: 20 },
      { op: 'L', x: 50, y: 5 },
      { op: 'Z' },
    ]);
  });

  it('treats extra coordinate pairs after M as implicit linetos', () => {
    expect(parsePath('M 0 0 10 10 20 20')).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 10 },
      { op: 'L', x: 20, y: 20 },
    ]);
  });

  it('parses cubic curves and reflects S control points', () => {
    const cmds = parsePath('M 0 0 C 10 0 20 10 20 20 S 40 40 50 20');
    expect(cmds).toHaveLength(3);
    const s = cmds[2] as Extract<PathCmd, { op: 'C' }>;
    // reflection of (20,10) about the current point (20,20)
    expect([s.x1, s.y1]).toEqual([20, 30]);
    expect([s.x, s.y]).toEqual([50, 20]);
  });

  it('parses quadratics and reflects T control points', () => {
    const cmds = parsePath('M 0 0 Q 10 10 20 0 T 40 0');
    const t = cmds[2] as Extract<PathCmd, { op: 'Q' }>;
    expect([t.x1, t.y1]).toEqual([30, -10]); // reflection of (10,10) about (20,0)
  });

  it('parses negative and exponent numbers without separators', () => {
    expect(parsePath('M-10-10L1e1 5')).toEqual([
      { op: 'M', x: -10, y: -10 },
      { op: 'L', x: 10, y: 5 },
    ]);
  });

  it('converts an arc to cubics that land on the endpoint', () => {
    const cmds = parsePath('M 0 0 A 50 50 0 1 0 100 0');
    const last = cmds[cmds.length - 1] as Extract<PathCmd, { op: 'C' }>;
    near(last.x, 100);
    near(last.y, 0);
  });

  it('renders the actor head arc (a real shape-library path) as a circle', () => {
    // `a r,r 0 1 0 2r 0  a r,r 0 1 0 -2r 0` — a full circle from two arcs.
    const b = pathBounds(parsePath('M 40,10 a 10,10 0 1 0 20 0 a 10,10 0 1 0 -20 0'))!;
    near(b.minX, 40, 0.2);
    near(b.maxX, 60, 0.2);
    near(b.minY, 0, 0.2);
    near(b.maxY, 20, 0.2);
  });

  it('degenerate arcs (zero radius) fall back to a line', () => {
    expect(arcToCubics(0, 0, 0, 0, 0, false, false, 10, 10)).toEqual([{ op: 'L', x: 10, y: 10 }]);
  });

  it('returns [] for empty input rather than throwing', () => {
    expect(parsePath('')).toEqual([]);
    expect(parsePath(undefined)).toEqual([]);
  });
});

describe('path-geometry — transforms', () => {
  it('parses translate', () => {
    expect(parseTransform('translate(10, 20)')).toEqual(translation(10, 20));
  });

  it('composes translate + rotate left-to-right, like SVG', () => {
    const m = parseTransform('translate(100, 0) rotate(90)');
    near(m.a * 10 + m.c * 0 + m.e, 100);
    near(m.b * 10 + m.d * 0 + m.f, 10); // rotated first, then translated
  });

  it('parses rotate about a centre', () => {
    const m = parseTransform('rotate(180, 50, 50)');
    near(m.a * 50 + m.e, 50);
    near(m.b * 50 + m.f, 100);
  });

  it('parses matrix() and scale()', () => {
    expect(parseTransform('matrix(2,0,0,2,5,5)')).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 5, f: 5 });
    expect(parseTransform('scale(3)')).toEqual(scaling(3, 3));
  });

  it('ignores an unknown transform function instead of throwing', () => {
    expect(parseTransform('skewX(20) translate(5,5)')).toEqual(translation(5, 5));
  });

  it('multiply applies the right-hand matrix first', () => {
    const m = multiply(translation(10, 0), rotation(90));
    near(m.a * 1 + m.e, 10);
    near(m.b * 1 + m.f, 1);
  });

  it('transformCmds moves every control point', () => {
    expect(
      transformCmds([{ op: 'C', x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 3 }], translation(10, 20))
    ).toEqual([{ op: 'C', x1: 11, y1: 21, x2: 12, y2: 22, x: 13, y: 23 }]);
  });
});

describe('path-geometry — hit geometry', () => {
  const rect = rectPath(0, 0, 100, 50);

  it('point-in-path uses the non-zero winding rule', () => {
    expect(pointInPath(rect, { x: 50, y: 25 })).toBe(true);
    expect(pointInPath(rect, { x: 150, y: 25 })).toBe(false);
    expect(pointInPath(rect, { x: 50, y: -1 })).toBe(false);
  });

  it('treats an unclosed sub-path as closed when filling (as a 2D context does)', () => {
    const open: PathCmd[] = [
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 100, y: 0 },
      { op: 'L', x: 100, y: 100 },
      { op: 'L', x: 0, y: 100 },
    ];
    expect(pointInPath(open, { x: 50, y: 50 })).toBe(true);
  });

  it('point-in-path handles a diamond (the concave-corner case)', () => {
    const diamond = polyPath('50,0 100,25 50,50 0,25', true);
    expect(pointInPath(diamond, { x: 50, y: 25 })).toBe(true);
    expect(pointInPath(diamond, { x: 5, y: 5 })).toBe(false); // in the bbox, outside the shape
  });

  it('distance-to-path measures to the outline, not the interior', () => {
    const line = linePath(0, 0, 100, 0);
    near(distanceToPath(line, { x: 50, y: 4 }), 4);
    near(distanceToPath(line, { x: -3, y: 0 }), 3); // past the end → distance to the cap
  });

  it('bounds of an empty path are null', () => {
    expect(pathBounds([])).toBeNull();
  });
});
