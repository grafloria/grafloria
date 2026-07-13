// SVG path geometry → PDF path operators.
//
// PDF's path model is a strict subset of SVG's: it has moveto (`m`), lineto (`l`), CUBIC
// bezier (`c`), and close (`h`). It has NO quadratic, NO arc, NO smooth-curve shorthand,
// and no relative coordinates. So everything else has to be converted:
//
//   Q/T  quadratic → cubic. Exact: a quadratic IS a cubic whose control points sit two
//        thirds of the way from each end toward the quadratic's single control point.
//   A    elliptical arc → a chain of cubics. NOT exact — no bezier can be a true ellipse
//        — but splitting the sweep into ≤90° pieces keeps the error around 1e-4 of the
//        radius, which is far below a printer's resolution.
//   S/T  the smooth shorthands, whose first control point is the REFLECTION of the
//        previous curve's last one. Getting this wrong (e.g. treating it as a fresh
//        curve) makes every rounded link corner visibly kink.
//   H/V  single-axis lines.
//   z/relative forms — folded into the absolute ones as we walk.
//
// The renderer emits M L C Q A S T H V and their relative forms, so all of it is load-
// bearing: link jump-points are arcs, and curved links use the smooth shorthand.

import { num } from './pdf-primitives';

export interface Point {
  x: number;
  y: number;
}

/** Emitted PDF path ops, ready to join into a content stream. */
export type PathOps = string[];

interface PenState {
  current: Point;
  start: Point;
  /** Last cubic control point — the reflection source for `S`. */
  lastCubicControl: Point | null;
  /** Last quadratic control point — the reflection source for `T`. */
  lastQuadControl: Point | null;
}

/**
 * Convert an SVG `d` to PDF path operators (in the SVG's own coordinate space — the
 * caller has already set the CTM that flips y and fits the page).
 */
export function svgPathToPdf(d: string): PathOps {
  const ops: PathOps = [];
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!commands) return ops;

  const pen: PenState = {
    current: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    lastCubicControl: null,
    lastQuadControl: null,
  };

  for (const command of commands) {
    const code = command[0];
    const upper = code.toUpperCase();
    const rel = code !== upper;
    const args = command
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    emitCommand(upper, rel, args, pen, ops);
  }

  return ops;
}

function emitCommand(code: string, rel: boolean, args: number[], pen: PenState, ops: PathOps): void {
  const rx = (v: number) => (rel ? pen.current.x + v : v);
  const ry = (v: number) => (rel ? pen.current.y + v : v);

  switch (code) {
    case 'M': {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const p = { x: rx(args[i]), y: ry(args[i + 1]) };
        // Only the FIRST pair of an M run is a moveto; the rest are implicit linetos.
        ops.push(`${num(p.x)} ${num(p.y)} ${i === 0 ? 'm' : 'l'}`);
        pen.current = p;
        if (i === 0) pen.start = p;
      }
      pen.lastCubicControl = null;
      pen.lastQuadControl = null;
      break;
    }

    case 'L': {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const p = { x: rx(args[i]), y: ry(args[i + 1]) };
        ops.push(`${num(p.x)} ${num(p.y)} l`);
        pen.current = p;
      }
      pen.lastCubicControl = null;
      pen.lastQuadControl = null;
      break;
    }

    case 'H': {
      for (const v of args) {
        const p = { x: rx(v), y: pen.current.y };
        ops.push(`${num(p.x)} ${num(p.y)} l`);
        pen.current = p;
      }
      pen.lastCubicControl = null;
      pen.lastQuadControl = null;
      break;
    }

    case 'V': {
      for (const v of args) {
        const p = { x: pen.current.x, y: ry(v) };
        ops.push(`${num(p.x)} ${num(p.y)} l`);
        pen.current = p;
      }
      pen.lastCubicControl = null;
      pen.lastQuadControl = null;
      break;
    }

    case 'C': {
      for (let i = 0; i + 5 < args.length; i += 6) {
        const c1 = { x: rx(args[i]), y: ry(args[i + 1]) };
        const c2 = { x: rx(args[i + 2]), y: ry(args[i + 3]) };
        const end = { x: rx(args[i + 4]), y: ry(args[i + 5]) };
        cubic(ops, c1, c2, end, pen);
      }
      break;
    }

    case 'S': {
      // The first control point is the REFLECTION of the previous curve's second one.
      for (let i = 0; i + 3 < args.length; i += 4) {
        const c1 = reflect(pen.lastCubicControl, pen.current);
        const c2 = { x: rx(args[i]), y: ry(args[i + 1]) };
        const end = { x: rx(args[i + 2]), y: ry(args[i + 3]) };
        cubic(ops, c1, c2, end, pen);
      }
      break;
    }

    case 'Q': {
      for (let i = 0; i + 3 < args.length; i += 4) {
        const q = { x: rx(args[i]), y: ry(args[i + 1]) };
        const end = { x: rx(args[i + 2]), y: ry(args[i + 3]) };
        quadratic(ops, q, end, pen);
      }
      break;
    }

    case 'T': {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const q = reflect(pen.lastQuadControl, pen.current);
        const end = { x: rx(args[i]), y: ry(args[i + 1]) };
        quadratic(ops, q, end, pen);
      }
      break;
    }

    case 'A': {
      for (let i = 0; i + 6 < args.length; i += 7) {
        const end = { x: rx(args[i + 5]), y: ry(args[i + 6]) };
        arcToCubics(
          pen.current,
          end,
          Math.abs(args[i]),
          Math.abs(args[i + 1]),
          args[i + 2],
          args[i + 3] !== 0,
          args[i + 4] !== 0
        ).forEach(([c1, c2, e]) => cubic(ops, c1, c2, e, pen));
      }
      break;
    }

    case 'Z': {
      ops.push('h');
      pen.current = { ...pen.start };
      pen.lastCubicControl = null;
      pen.lastQuadControl = null;
      break;
    }
  }
}

function cubic(ops: PathOps, c1: Point, c2: Point, end: Point, pen: PenState): void {
  ops.push(`${num(c1.x)} ${num(c1.y)} ${num(c2.x)} ${num(c2.y)} ${num(end.x)} ${num(end.y)} c`);
  pen.current = end;
  pen.lastCubicControl = c2;
  pen.lastQuadControl = null;
}

/**
 * A quadratic is EXACTLY a cubic: the two cubic controls sit 2/3 of the way from each
 * endpoint toward the quadratic's single control point. No approximation here.
 */
function quadratic(ops: PathOps, q: Point, end: Point, pen: PenState): void {
  const start = pen.current;
  const c1 = { x: start.x + (2 / 3) * (q.x - start.x), y: start.y + (2 / 3) * (q.y - start.y) };
  const c2 = { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) };

  ops.push(`${num(c1.x)} ${num(c1.y)} ${num(c2.x)} ${num(c2.y)} ${num(end.x)} ${num(end.y)} c`);
  pen.current = end;
  pen.lastCubicControl = c2;
  pen.lastQuadControl = q;
}

/** The smooth shorthands reflect the previous control point through the current point. */
function reflect(control: Point | null, current: Point): Point {
  if (!control) return { ...current }; // no previous curve: the control coincides with the point
  return { x: 2 * current.x - control.x, y: 2 * current.y - control.y };
}

/**
 * SVG elliptical arc → cubic beziers (the W3C implementation-notes algorithm, F.6).
 *
 * The arc is given by its ENDPOINTS plus radii and flags; PDF needs centre-parameterised
 * cubics. So: recover the centre, then split the sweep into ≤90° segments (a bezier
 * approximates a quarter-ellipse to ~1e-4 of the radius; a half turn in one segment is
 * visibly wrong).
 */
export function arcToCubics(
  start: Point,
  end: Point,
  rx: number,
  ry: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean
): Array<[Point, Point, Point]> {
  // Degenerate: zero radius is a straight line by the spec.
  if (rx === 0 || ry === 0) {
    return [[{ ...start }, { ...end }, { ...end }]];
  }

  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  // Step 1: the endpoint delta in the ellipse's own frame.
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  // Step 2: scale the radii up if they are too small to span the endpoints (spec §F.6.6).
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  // Step 3: the centre, in the ellipse frame.
  const sign = largeArc === sweep ? -1 : 1;
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1);
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);

  const cx1 = (coefficient * rx * y1) / ry;
  const cy1 = (-coefficient * ry * x1) / rx;

  // …and back in user space.
  const cx = cos * cx1 - sin * cy1 + (start.x + end.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (start.y + end.y) / 2;

  // Step 4: the start angle and the swept angle.
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);

  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  // Split into ≤90° segments.
  const segments = Math.max(1, Math.ceil(Math.abs(delta / (Math.PI / 2))));
  const step = delta / segments;
  // The magic constant that makes a cubic hug a circular arc of angle `step`.
  const k = (4 / 3) * Math.tan(step / 4);

  const out: Array<[Point, Point, Point]> = [];
  let angleAt = theta;

  for (let i = 0; i < segments; i++) {
    const next = angleAt + step;

    const from = onEllipse(cx, cy, rx, ry, cos, sin, angleAt);
    const to = onEllipse(cx, cy, rx, ry, cos, sin, next);
    const fromDeriv = ellipseDerivative(rx, ry, cos, sin, angleAt);
    const toDeriv = ellipseDerivative(rx, ry, cos, sin, next);

    out.push([
      { x: from.x + k * fromDeriv.x, y: from.y + k * fromDeriv.y },
      { x: to.x - k * toDeriv.x, y: to.y - k * toDeriv.y },
      to,
    ]);

    angleAt = next;
  }

  return out;
}

function onEllipse(cx: number, cy: number, rx: number, ry: number, cos: number, sin: number, t: number): Point {
  const x = rx * Math.cos(t);
  const y = ry * Math.sin(t);
  return { x: cx + cos * x - sin * y, y: cy + sin * x + cos * y };
}

function ellipseDerivative(rx: number, ry: number, cos: number, sin: number, t: number): Point {
  const dx = -rx * Math.sin(t);
  const dy = ry * Math.cos(t);
  return { x: cos * dx - sin * dy, y: sin * dx + cos * dy };
}

/** The signed angle between two vectors. */
function angle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  if (len === 0) return 0;
  let result = Math.acos(Math.max(-1, Math.min(1, dot / len)));
  if (ux * vy - uy * vx < 0) result = -result;
  return result;
}

// ---------------------------------------------------------------------------
// The primitive shapes, as paths
// ---------------------------------------------------------------------------

/** The circle/ellipse bezier constant: 4/3·tan(π/8). */
const KAPPA = 0.5522847498307936;

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathOps {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    `${num(cx - rx)} ${num(cy)} m`,
    `${num(cx - rx)} ${num(cy + oy)} ${num(cx - ox)} ${num(cy + ry)} ${num(cx)} ${num(cy + ry)} c`,
    `${num(cx + ox)} ${num(cy + ry)} ${num(cx + rx)} ${num(cy + oy)} ${num(cx + rx)} ${num(cy)} c`,
    `${num(cx + rx)} ${num(cy - oy)} ${num(cx + ox)} ${num(cy - ry)} ${num(cx)} ${num(cy - ry)} c`,
    `${num(cx - ox)} ${num(cy - ry)} ${num(cx - rx)} ${num(cy - oy)} ${num(cx - rx)} ${num(cy)} c`,
    'h',
  ];
}

/**
 * A rect, rounded or not. PDF's own `re` operator only does square corners, and every
 * node in this renderer has `rx` — so a rounded rect becomes an explicit bezier path.
 */
export function rectPath(x: number, y: number, width: number, height: number, rx = 0, ry = 0): PathOps {
  const r = Math.min(rx || ry, width / 2);
  const ry2 = Math.min(ry || rx, height / 2);

  if (r <= 0 || ry2 <= 0) {
    return [`${num(x)} ${num(y)} ${num(width)} ${num(height)} re`];
  }

  const ox = r * KAPPA;
  const oy = ry2 * KAPPA;
  const x2 = x + width;
  const y2 = y + height;

  return [
    `${num(x + r)} ${num(y)} m`,
    `${num(x2 - r)} ${num(y)} l`,
    `${num(x2 - r + ox)} ${num(y)} ${num(x2)} ${num(y + ry2 - oy)} ${num(x2)} ${num(y + ry2)} c`,
    `${num(x2)} ${num(y2 - ry2)} l`,
    `${num(x2)} ${num(y2 - ry2 + oy)} ${num(x2 - r + ox)} ${num(y2)} ${num(x2 - r)} ${num(y2)} c`,
    `${num(x + r)} ${num(y2)} l`,
    `${num(x + r - ox)} ${num(y2)} ${num(x)} ${num(y2 - ry2 + oy)} ${num(x)} ${num(y2 - ry2)} c`,
    `${num(x)} ${num(y + ry2)} l`,
    `${num(x)} ${num(y + ry2 - oy)} ${num(x + r - ox)} ${num(y)} ${num(x + r)} ${num(y)} c`,
    'h',
  ];
}

export function polygonPath(points: Array<[number, number]>, close: boolean): PathOps {
  if (points.length === 0) return [];
  const ops: PathOps = [`${num(points[0][0])} ${num(points[0][1])} m`];
  for (let i = 1; i < points.length; i++) {
    ops.push(`${num(points[i][0])} ${num(points[i][1])} l`);
  }
  if (close) ops.push('h');
  return ops;
}

export function linePath(x1: number, y1: number, x2: number, y2: number): PathOps {
  return [`${num(x1)} ${num(y1)} m`, `${num(x2)} ${num(y2)} l`];
}
