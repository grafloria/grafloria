// Path-outline sampling (Wave 5 / Nodes & shapes — Card 2)
//
// Card 2 makes arbitrary SVG-path geometry a FIRST-CLASS, userland shape: a
// caller registers a `'path'`/`'custom'` shape with either a static `d` string
// or a parametric generator `(w, h) => d`, and the registry derives everything
// else — the smart-connection boundary (`edgeIntersect`) and the per-side port
// anchors — by SAMPLING the path's real outline instead of falling back to the
// bounding box. That is what lets a hand-authored star / gauge / chevron attach
// links to its true silhouette the same way the built-in diamond/hexagon do.
//
// This module owns the pure geometry that makes that possible. It leans on the
// canvas backend's path parser/flattener (`../canvas/path-geometry`), which is a
// dependency-FREE leaf module (parses `d`, converts arcs → cubics, flattens
// curves to polylines). Reusing it means Card 2's sampler and the Canvas hit
// tester cannot disagree about what a path's outline is.

import {
  parsePath,
  flattenPath,
  type PathCmd,
  type Point,
} from '../canvas/path-geometry';

export type { Point };

/** Round to 3dp so serialized path strings stay compact and diff-stable. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Map every coordinate in a command list through `fn` (structure preserved). */
export function mapPathCmds(cmds: PathCmd[], fn: (x: number, y: number) => Point): PathCmd[] {
  return cmds.map((cmd) => {
    switch (cmd.op) {
      case 'M':
      case 'L': {
        const p = fn(cmd.x, cmd.y);
        return { op: cmd.op, x: p.x, y: p.y };
      }
      case 'C': {
        const c1 = fn(cmd.x1, cmd.y1);
        const c2 = fn(cmd.x2, cmd.y2);
        const p = fn(cmd.x, cmd.y);
        return { op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
      }
      case 'Q': {
        const c1 = fn(cmd.x1, cmd.y1);
        const p = fn(cmd.x, cmd.y);
        return { op: 'Q', x1: c1.x, y1: c1.y, x: p.x, y: p.y };
      }
      case 'Z':
        return cmd;
    }
  });
}

/** Serialize a command list back into a compact `d` string. */
export function serializePathCmds(cmds: PathCmd[]): string {
  const parts: string[] = [];
  for (const cmd of cmds) {
    switch (cmd.op) {
      case 'M':
        parts.push(`M ${round3(cmd.x)},${round3(cmd.y)}`);
        break;
      case 'L':
        parts.push(`L ${round3(cmd.x)},${round3(cmd.y)}`);
        break;
      case 'C':
        parts.push(
          `C ${round3(cmd.x1)},${round3(cmd.y1)} ${round3(cmd.x2)},${round3(cmd.y2)} ${round3(
            cmd.x
          )},${round3(cmd.y)}`
        );
        break;
      case 'Q':
        parts.push(`Q ${round3(cmd.x1)},${round3(cmd.y1)} ${round3(cmd.x)},${round3(cmd.y)}`);
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
}

/** The author's declared reference box for a STATIC path string. */
export interface PathViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rescale a parsed static path from its `viewBox` reference frame into a
 * `width × height` box anchored at the origin. Degenerate viewBox dimensions
 * fall back to 1 so a zero-width authoring box can't divide by zero.
 */
export function fitCmdsToBox(
  cmds: PathCmd[],
  viewBox: PathViewBox,
  width: number,
  height: number
): PathCmd[] {
  const sx = viewBox.w !== 0 ? width / viewBox.w : 1;
  const sy = viewBox.h !== 0 ? height / viewBox.h : 1;
  return mapPathCmds(cmds, (x, y) => ({
    x: (x - viewBox.x) * sx,
    y: (y - viewBox.y) * sy,
  }));
}

/** Offset every coordinate by (dx, dy) — used for grow/shadow transforms. */
export function translateCmds(cmds: PathCmd[], dx: number, dy: number): PathCmd[] {
  if (dx === 0 && dy === 0) return cmds;
  return mapPathCmds(cmds, (x, y) => ({ x: x + dx, y: y + dy }));
}

/**
 * Sample a path's OUTLINE as a dense polygon of points.
 *
 * The path is flattened (curves → line segments) and the single richest subpath
 * — the shape's main silhouette — is returned as a vertex ring. Interior detail
 * subpaths (a UML component's tabs, a cube's inner edges) are intentionally
 * dropped: the boundary/anchor scanline treats its input as ONE closed ring, and
 * stitching several subpaths into one ring would invent phantom edges.
 *
 * Returns an empty array for an unparseable / empty `d` so callers fall back to
 * the bounding box.
 */
export function sampleOutlinePoints(cmds: PathCmd[], steps = 24): Point[] {
  const subs = flattenPath(cmds, steps);
  if (subs.length === 0) return [];

  // Richest subpath = the main silhouette.
  let best = subs[0];
  for (const sub of subs) {
    if (sub.points.length > best.points.length) best = sub;
  }

  // Drop a duplicated closing vertex (flattenPath echoes the start point on Z).
  const pts = best.points;
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      return pts.slice(0, -1);
    }
  }
  return pts;
}

/** Parse + sample a `d` string in one call. */
export function sampleOutlineFromData(d: string, steps = 24): Point[] {
  return sampleOutlinePoints(parsePath(d), steps);
}
