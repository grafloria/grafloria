// path-geometry.ts — the geometry half of the Canvas backend.
//
// Canvas 2D has no `<rect rx>`, no `<circle>`, no `d="M 0 0 A …"` and no
// `transform="translate(…) rotate(…)"`. Everything the VNode tree expresses
// geometrically has to be normalised into ONE representation before it can be
// drawn, hit-tested or bounded. That representation is {@link PathCmd}:
//
//     M x y | L x y | C c1x c1y c2x c2y x y | Q cx cy x y | Z
//
// i.e. exactly the four path primitives a 2D context can consume
// (`moveTo` / `lineTo` / `bezierCurveTo` / `quadraticCurveTo` / `closePath`).
//
// Everything downstream reuses this one form:
//   - the PAINTER issues the commands to the 2D context,
//   - the HIT INDEX flattens them to polygons for point-in-shape / distance,
//   - the DIRTY tracker takes their bounding box.
//
// So a shape cannot be drawn in one place and picked in another: the pixels and
// the hit region are generated from the same command list. That is the whole
// reason this module exists as a separate layer.
//
// ARCS: `A` path commands and `<circle>`/`<ellipse>` are converted to cubic
// béziers (the standard 4-segment kappa approximation, max radial error ≈ 2.7e-4
// of the radius — far below a device pixel at any sane zoom). Documented, not
// hidden: it is why canvas circles are *approximately*, not bit-identically, the
// SVG circle.

export type PathCmd =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'Z' };

/** A 2D affine transform, in the order a canvas `setTransform(a,b,c,d,e,f)` takes. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Circle → cubic magic number: 4/3 · tan(π/8). */
const KAPPA = 0.5522847498307936;

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// ---------------------------------------------------------------------------
// Matrix math
// ---------------------------------------------------------------------------

/** `m1 · m2` — apply m2 FIRST, then m1 (the SVG/canvas nesting convention). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function translation(dx: number, dy: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

export function scaling(sx: number, sy: number = sx): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotation(degrees: number, cx = 0, cy = 0): Matrix {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  if (cx === 0 && cy === 0) return rot;
  // rotate(a, cx, cy) === translate(cx,cy) rotate(a) translate(-cx,-cy)
  return multiply(multiply(translation(cx, cy), rot), translation(-cx, -cy));
}

/**
 * Parse an SVG `transform` attribute into a matrix.
 *
 * Supports the forms the renderer actually emits — translate / rotate / scale /
 * matrix — composed left-to-right, exactly as SVG composes them. An
 * unrecognised function is skipped rather than throwing: a transform we cannot
 * read must not take the whole frame down.
 */
export function parseTransform(transform: string | undefined | null): Matrix {
  if (!transform) return IDENTITY;

  let m: Matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(transform)) !== null) {
    const fn = match[1];
    const args = match[2]
      .split(/[\s,]+/)
      .map((v) => parseFloat(v))
      .filter((v) => !Number.isNaN(v));

    switch (fn) {
      case 'translate':
        m = multiply(m, translation(args[0] ?? 0, args[1] ?? 0));
        break;
      case 'scale':
        m = multiply(m, scaling(args[0] ?? 1, args[1] ?? args[0] ?? 1));
        break;
      case 'rotate':
        m = multiply(m, rotation(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0));
        break;
      case 'matrix':
        if (args.length >= 6) {
          m = multiply(m, {
            a: args[0],
            b: args[1],
            c: args[2],
            d: args[3],
            e: args[4],
            f: args[5],
          });
        }
        break;
      default:
        // skew / unknown: not emitted by the renderer today. Ignored on purpose.
        break;
    }
  }

  return m;
}

// ---------------------------------------------------------------------------
// Primitive → PathCmd[]
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle, with optional (possibly asymmetric) corner radii. */
export function rectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 0,
  ry = rx
): PathCmd[] {
  const w = Math.abs(width);
  const h = Math.abs(height);
  const x0 = width < 0 ? x + width : x;
  const y0 = height < 0 ? y + height : y;

  let a = Math.max(0, rx || 0);
  let b = Math.max(0, ry || rx || 0);
  a = Math.min(a, w / 2);
  b = Math.min(b, h / 2);

  if (a === 0 || b === 0) {
    return [
      { op: 'M', x: x0, y: y0 },
      { op: 'L', x: x0 + w, y: y0 },
      { op: 'L', x: x0 + w, y: y0 + h },
      { op: 'L', x: x0, y: y0 + h },
      { op: 'Z' },
    ];
  }

  const ka = a * KAPPA;
  const kb = b * KAPPA;

  return [
    { op: 'M', x: x0 + a, y: y0 },
    { op: 'L', x: x0 + w - a, y: y0 },
    { op: 'C', x1: x0 + w - a + ka, y1: y0, x2: x0 + w, y2: y0 + b - kb, x: x0 + w, y: y0 + b },
    { op: 'L', x: x0 + w, y: y0 + h - b },
    {
      op: 'C',
      x1: x0 + w,
      y1: y0 + h - b + kb,
      x2: x0 + w - a + ka,
      y2: y0 + h,
      x: x0 + w - a,
      y: y0 + h,
    },
    { op: 'L', x: x0 + a, y: y0 + h },
    { op: 'C', x1: x0 + a - ka, y1: y0 + h, x2: x0, y2: y0 + h - b + kb, x: x0, y: y0 + h - b },
    { op: 'L', x: x0, y: y0 + b },
    { op: 'C', x1: x0, y1: y0 + b - kb, x2: x0 + a - ka, y2: y0, x: x0 + a, y: y0 },
    { op: 'Z' },
  ];
}

/** Ellipse centred at (cx, cy) as four cubic segments. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCmd[] {
  const a = Math.abs(rx);
  const b = Math.abs(ry);
  const ka = a * KAPPA;
  const kb = b * KAPPA;

  return [
    { op: 'M', x: cx + a, y: cy },
    { op: 'C', x1: cx + a, y1: cy + kb, x2: cx + ka, y2: cy + b, x: cx, y: cy + b },
    { op: 'C', x1: cx - ka, y1: cy + b, x2: cx - a, y2: cy + kb, x: cx - a, y: cy },
    { op: 'C', x1: cx - a, y1: cy - kb, x2: cx - ka, y2: cy - b, x: cx, y: cy - b },
    { op: 'C', x1: cx + ka, y1: cy - b, x2: cx + a, y2: cy - kb, x: cx + a, y: cy },
    { op: 'Z' },
  ];
}

export function circlePath(cx: number, cy: number, r: number): PathCmd[] {
  return ellipsePath(cx, cy, r, r);
}

export function linePath(x1: number, y1: number, x2: number, y2: number): PathCmd[] {
  return [
    { op: 'M', x: x1, y: y1 },
    { op: 'L', x: x2, y: y2 },
  ];
}

/** `points="1,2 3,4"` (or `1 2 3 4`) → a polyline / polygon command list. */
export function polyPath(points: string | undefined, close: boolean): PathCmd[] {
  if (!points) return [];
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map((v) => parseFloat(v))
    .filter((v) => !Number.isNaN(v));

  const cmds: PathCmd[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    cmds.push(
      i === 0 ? { op: 'M', x: nums[i], y: nums[i + 1] } : { op: 'L', x: nums[i], y: nums[i + 1] }
    );
  }
  if (close && cmds.length > 0) cmds.push({ op: 'Z' });
  return cmds;
}

// ---------------------------------------------------------------------------
// SVG path `d` parser
// ---------------------------------------------------------------------------

/**
 * Parse an SVG path `d` string into {@link PathCmd}s.
 *
 * Full command coverage (M m L l H h V v C c S s Q q T t A a Z z) including
 * implicit repeated coordinate sets ("M 0 0 10 10" ⇒ moveto + lineto) and the
 * smooth-curve reflection rules. Arcs are converted to cubics.
 *
 * Written by hand rather than leaned on the DOM (`SVGPathElement`) so it works
 * headlessly — in Node, in a worker, in a test — which is exactly where the
 * canvas backend has to be provable.
 */
export function parsePath(d: string | undefined | null): PathCmd[] {
  if (!d) return [];

  const cmds: PathCmd[] = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return [];

  let i = 0;
  let cx = 0; // current point
  let cy = 0;
  let sx = 0; // sub-path start (for Z)
  let sy = 0;
  let prevCtrlX = 0; // last cubic control point (for S)
  let prevCtrlY = 0;
  let prevQCtrlX = 0; // last quadratic control point (for T)
  let prevQCtrlY = 0;
  let prevOp = '';
  let op = '';

  const num = (): number => {
    const v = parseFloat(tokens[i++]);
    return Number.isNaN(v) ? 0 : v;
  };
  const isCmd = (t: string | undefined): boolean => !!t && /[MmLlHhVvCcSsQqTtAaZz]/.test(t);

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      op = tokens[i++];
    } else if (op === 'M') {
      op = 'L'; // implicit lineto after a moveto
    } else if (op === 'm') {
      op = 'l';
    } else if (!op) {
      i++; // stray number before any command
      continue;
    }

    const rel = op === op.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;

    switch (op.toUpperCase()) {
      case 'M': {
        cx = num() + ox;
        cy = num() + oy;
        sx = cx;
        sy = cy;
        cmds.push({ op: 'M', x: cx, y: cy });
        break;
      }
      case 'L': {
        cx = num() + ox;
        cy = num() + oy;
        cmds.push({ op: 'L', x: cx, y: cy });
        break;
      }
      case 'H': {
        cx = num() + ox;
        cmds.push({ op: 'L', x: cx, y: cy });
        break;
      }
      case 'V': {
        cy = num() + oy;
        cmds.push({ op: 'L', x: cx, y: cy });
        break;
      }
      case 'C': {
        const x1 = num() + ox;
        const y1 = num() + oy;
        const x2 = num() + ox;
        const y2 = num() + oy;
        cx = num() + ox;
        cy = num() + oy;
        cmds.push({ op: 'C', x1, y1, x2, y2, x: cx, y: cy });
        prevCtrlX = x2;
        prevCtrlY = y2;
        break;
      }
      case 'S': {
        const smooth = /[CcSs]/.test(prevOp);
        const x1 = smooth ? 2 * cx - prevCtrlX : cx;
        const y1 = smooth ? 2 * cy - prevCtrlY : cy;
        const x2 = num() + ox;
        const y2 = num() + oy;
        cx = num() + ox;
        cy = num() + oy;
        cmds.push({ op: 'C', x1, y1, x2, y2, x: cx, y: cy });
        prevCtrlX = x2;
        prevCtrlY = y2;
        break;
      }
      case 'Q': {
        const x1 = num() + ox;
        const y1 = num() + oy;
        cx = num() + ox;
        cy = num() + oy;
        cmds.push({ op: 'Q', x1, y1, x: cx, y: cy });
        prevQCtrlX = x1;
        prevQCtrlY = y1;
        break;
      }
      case 'T': {
        const smooth = /[QqTt]/.test(prevOp);
        const x1 = smooth ? 2 * cx - prevQCtrlX : cx;
        const y1 = smooth ? 2 * cy - prevQCtrlY : cy;
        cx = num() + ox;
        cy = num() + oy;
        cmds.push({ op: 'Q', x1, y1, x: cx, y: cy });
        prevQCtrlX = x1;
        prevQCtrlY = y1;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const largeArc = num();
        const sweep = num();
        const ex = num() + ox;
        const ey = num() + oy;
        cmds.push(...arcToCubics(cx, cy, rx, ry, rot, largeArc !== 0, sweep !== 0, ex, ey));
        cx = ex;
        cy = ey;
        break;
      }
      case 'Z': {
        cmds.push({ op: 'Z' });
        cx = sx;
        cy = sy;
        break;
      }
      default:
        i++; // unknown token — do not spin
        break;
    }

    prevOp = op;
  }

  return cmds;
}

/**
 * SVG elliptical arc → cubic béziers (endpoint→centre parameterisation, SVG 1.1
 * appendix F.6). Used by `A` path commands — the actor shape's head, cylinder
 * caps, jump-point arcs.
 */
export function arcToCubics(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): PathCmd[] {
  if (rx === 0 || ry === 0) return [{ op: 'L', x: x2, y: y2 }];
  if (x1 === x2 && y1 === y2) return [];

  let arx = Math.abs(rx);
  let ary = Math.abs(ry);
  const phi = ((rotationDeg % 360) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Correct out-of-range radii (spec F.6.6)
  const lambda = (x1p * x1p) / (arx * arx) + (y1p * y1p) / (ary * ary);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    arx *= s;
    ary *= s;
  }

  const rxSq = arx * arx;
  const rySq = ary * ary;
  const numerator = rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p;
  const denominator = rxSq * y1p * y1p + rySq * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) coef = -coef;

  const cxp = (coef * (arx * y1p)) / ary;
  const cyp = (coef * -(ary * x1p)) / arx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.max(-1, Math.min(1, len === 0 ? 1 : dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const ux = (x1p - cxp) / arx;
  const uy = (y1p - cyp) / ary;
  const vx = (-x1p - cxp) / arx;
  const vy = (-y1p - cyp) / ary;

  const theta1 = angle(1, 0, ux, uy);
  let dTheta = angle(ux, uy, vx, vy);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Split into <= 90° segments and emit a cubic for each.
  const segments = Math.max(1, Math.ceil(Math.abs(dTheta / (Math.PI / 2))));
  const delta = dTheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);

  const out: PathCmd[] = [];
  let th = theta1;
  let px = x1;
  let py = y1;

  const e = (ct: number, st: number): Point => ({
    x: cx + cosPhi * arx * ct - sinPhi * ary * st,
    y: cy + sinPhi * arx * ct + cosPhi * ary * st,
  });
  const ePrime = (ct: number, st: number): Point => ({
    x: -cosPhi * arx * st - sinPhi * ary * ct,
    y: -sinPhi * arx * st + cosPhi * ary * ct,
  });

  for (let s = 0; s < segments; s++) {
    const th2 = th + delta;

    const cosTh = Math.cos(th);
    const sinTh = Math.sin(th);
    const cosTh2 = Math.cos(th2);
    const sinTh2 = Math.sin(th2);

    const p2 = e(cosTh2, sinTh2);
    const d1 = ePrime(cosTh, sinTh);
    const d2 = ePrime(cosTh2, sinTh2);

    out.push({
      op: 'C',
      x1: px + t * d1.x,
      y1: py + t * d1.y,
      x2: p2.x - t * d2.x,
      y2: p2.y - t * d2.y,
      x: p2.x,
      y: p2.y,
    });

    px = p2.x;
    py = p2.y;
    th = th2;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Flattening, bounds, hit geometry
// ---------------------------------------------------------------------------

/** One flattened sub-path: a polyline, plus whether it was explicitly closed. */
export interface SubPath {
  points: Point[];
  closed: boolean;
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function quadAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Flatten a command list into polylines. `steps` controls curve subdivision —
 * 16 segments per curve keeps the deviation well under a pixel for the curve
 * sizes a diagram draws, and hit-testing only ever needs "within tolerance".
 */
export function flattenPath(cmds: PathCmd[], steps = 16): SubPath[] {
  const subs: SubPath[] = [];
  let current: SubPath | null = null;
  let cursor: Point = { x: 0, y: 0 };

  const ensure = (): SubPath => {
    if (!current) {
      current = { points: [{ ...cursor }], closed: false };
      subs.push(current);
    }
    return current;
  };

  for (const cmd of cmds) {
    switch (cmd.op) {
      case 'M':
        cursor = { x: cmd.x, y: cmd.y };
        current = { points: [{ ...cursor }], closed: false };
        subs.push(current);
        break;
      case 'L':
        ensure().points.push({ x: cmd.x, y: cmd.y });
        cursor = { x: cmd.x, y: cmd.y };
        break;
      case 'C': {
        const sub = ensure();
        const p0 = cursor;
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x2, y: cmd.y2 };
        const p3 = { x: cmd.x, y: cmd.y };
        for (let s = 1; s <= steps; s++) sub.points.push(cubicAt(p0, p1, p2, p3, s / steps));
        cursor = p3;
        break;
      }
      case 'Q': {
        const sub = ensure();
        const p0 = cursor;
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x, y: cmd.y };
        for (let s = 1; s <= steps; s++) sub.points.push(quadAt(p0, p1, p2, s / steps));
        cursor = p2;
        break;
      }
      case 'Z': {
        if (current) {
          current.closed = true;
          cursor = { ...current.points[0] };
        }
        break;
      }
    }
  }

  return subs.filter((s) => s.points.length > 0);
}

export function transformCmds(cmds: PathCmd[], m: Matrix): PathCmd[] {
  if (m === IDENTITY) return cmds;
  return cmds.map((cmd) => {
    switch (cmd.op) {
      case 'M':
      case 'L': {
        const p = applyMatrix(m, cmd);
        return { op: cmd.op, x: p.x, y: p.y };
      }
      case 'C': {
        const c1 = applyMatrix(m, { x: cmd.x1, y: cmd.y1 });
        const c2 = applyMatrix(m, { x: cmd.x2, y: cmd.y2 });
        const p = applyMatrix(m, { x: cmd.x, y: cmd.y });
        return { op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
      }
      case 'Q': {
        const c1 = applyMatrix(m, { x: cmd.x1, y: cmd.y1 });
        const p = applyMatrix(m, { x: cmd.x, y: cmd.y });
        return { op: 'Q', x1: c1.x, y1: c1.y, x: p.x, y: p.y };
      }
      default:
        return cmd;
    }
  });
}

/** Bounding box of the flattened path. `null` for an empty path. */
export function pathBounds(cmds: PathCmd[]): Bounds | null {
  const subs = flattenPath(cmds, 8);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const sub of subs) {
    for (const p of sub.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Non-zero-winding point-in-path — the same fill rule a 2D context uses by
 * default, so "is this point inside the filled shape?" answers identically to
 * "did the fill put a pixel here?".
 */
export function pointInPath(cmds: PathCmd[], p: Point): boolean {
  const subs = flattenPath(cmds);
  let winding = 0;

  for (const sub of subs) {
    const pts = sub.points;
    if (pts.length < 2) continue;
    // A fill always treats a sub-path as closed, whether or not `Z` was issued.
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (a.y <= p.y) {
        if (b.y > p.y && cross(a, b, p) > 0) winding++;
      } else if (b.y <= p.y && cross(a, b, p) < 0) {
        winding--;
      }
    }
  }

  return winding !== 0;
}

function cross(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
}

/** Shortest distance from `p` to the path's outline (open OR closed). */
export function distanceToPath(cmds: PathCmd[], p: Point): number {
  const subs = flattenPath(cmds);
  let best = Infinity;

  for (const sub of subs) {
    const pts = sub.points;
    if (pts.length === 1) {
      best = Math.min(best, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
      continue;
    }
    const segCount = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      best = Math.min(best, distanceToSegment(p, a, b));
    }
  }

  return best;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function boundsUnion(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function padBounds(b: Bounds, pad: number): Bounds {
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}
