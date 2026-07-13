// PathCmd[] → PDF path operators.
//
// THE GEOMETRY IS NOT REDECLARED HERE. `canvas/path-geometry.ts` already owns the SVG
// geometry model for this codebase — `parsePath` (every command, relative forms, the S/T
// smooth-shorthand reflection, and A → cubics via the W3C F.6 algorithm), the primitive
// builders, the matrix math. The canvas renderer draws through it and it has its own suite.
//
// A second copy of arc→bezier would be a maintenance landmine: two implementations of the
// same fiddly maths, drifting, with only one of them tested. So this file is a THIN
// EMITTER — it maps the shared `PathCmd` model onto PDF's operators and does nothing else.
//
// PDF's path model is a strict subset of the PathCmd model:
//   M → `m`,  L → `l`,  C → `c`,  Z → `h`
//   Q → PDF HAS NO QUADRATIC, so it is promoted to the exactly-equivalent cubic (the two
//       cubic controls sit 2/3 of the way from each endpoint toward the quadratic's single
//       control point — this is an identity, not an approximation).
// Arcs never reach here: `parsePath` has already turned them into cubics.

import {
  circlePath as circleCmds,
  ellipsePath as ellipseCmds,
  linePath as lineCmds,
  parsePath,
  polyPath,
  rectPath as rectCmds,
  type PathCmd,
} from '../../canvas/path-geometry';
import { num } from './pdf-primitives';

/** Emitted PDF path ops, ready to join into a content stream. */
export type PathOps = string[];

/**
 * PathCmd[] → PDF operators.
 *
 * Tracks the current point only for the quadratic promotion, which needs the segment's
 * start (a `Q` gives its control point and endpoint, not where it began).
 */
export function cmdsToPdf(cmds: PathCmd[]): PathOps {
  const ops: PathOps = [];
  let cx = 0;
  let cy = 0;

  for (const cmd of cmds) {
    switch (cmd.op) {
      case 'M':
        ops.push(`${num(cmd.x)} ${num(cmd.y)} m`);
        cx = cmd.x;
        cy = cmd.y;
        break;

      case 'L':
        ops.push(`${num(cmd.x)} ${num(cmd.y)} l`);
        cx = cmd.x;
        cy = cmd.y;
        break;

      case 'C':
        ops.push(
          `${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x2)} ${num(cmd.y2)} ${num(cmd.x)} ${num(cmd.y)} c`
        );
        cx = cmd.x;
        cy = cmd.y;
        break;

      case 'Q': {
        // A quadratic IS a cubic: controls at 2/3 from each end toward the single control.
        const c1x = cx + (2 / 3) * (cmd.x1 - cx);
        const c1y = cy + (2 / 3) * (cmd.y1 - cy);
        const c2x = cmd.x + (2 / 3) * (cmd.x1 - cmd.x);
        const c2y = cmd.y + (2 / 3) * (cmd.y1 - cmd.y);
        ops.push(`${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(cmd.x)} ${num(cmd.y)} c`);
        cx = cmd.x;
        cy = cmd.y;
        break;
      }

      case 'Z':
        ops.push('h');
        break;
    }
  }

  return ops;
}

/** An SVG `d` → PDF operators. */
export function svgPathToPdf(d: string): PathOps {
  return cmdsToPdf(parsePath(d));
}

// The primitives, in PDF form. Each one defers to the shared builder and then emits.
export const pdfRect = (x: number, y: number, w: number, h: number, rx = 0, ry = rx): PathOps =>
  cmdsToPdf(rectCmds(x, y, w, h, rx, ry));

export const pdfEllipse = (cx: number, cy: number, rx: number, ry: number): PathOps =>
  cmdsToPdf(ellipseCmds(cx, cy, rx, ry));

export const pdfCircle = (cx: number, cy: number, r: number): PathOps => cmdsToPdf(circleCmds(cx, cy, r));

export const pdfLine = (x1: number, y1: number, x2: number, y2: number): PathOps =>
  cmdsToPdf(lineCmds(x1, y1, x2, y2));

export const pdfPoly = (points: string | undefined, close: boolean): PathOps =>
  cmdsToPdf(polyPath(points, close));
