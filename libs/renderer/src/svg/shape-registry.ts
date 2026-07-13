// Shape registry + geometry contract (Nodes & shapes foundation)
//
// Historically the five built-in node shapes (rect, circle, ellipse, diamond,
// hexagon) were hardcoded across FIVE parallel switch statements:
//   - SVGRenderer.renderNodeShape        (node body)
//   - SVGRenderer.renderSelectionHighlight
//   - SVGRenderer.renderShadow
//   - SVGRenderer.shapeEdgePoint         (smart-connection boundary)
//   - getPortPositionForShape            (port-positioning.ts)
// Adding a shape meant editing every switch in lock-step.
//
// This module introduces ONE `ShapeDefinition` geometry contract and a
// registry so every shape lives in a single place. The five render sites now
// consult the registry instead of switching on `shapeConfig.type`.
//
// GEOMETRY CONTRACT — each shape exposes just three geometry primitives:
//   1. outline(w, h, transform) — the shape's outline as an SVG element +
//      geometry props. A single `transform` (grow outward by `grow` px,
//      translate by dx/dy, optional corner radius) drives ALL THREE render
//      sites: the node body (identity transform), the selection highlight
//      (grow = padding) and the drop shadow (dx = dy = offset). This is why
//      "selection + shadow reuse outline".
//   2. boundaryPoint(rect, side, cross) — the point on the outline used by
//      smart connection points; returns null to fall back to the bbox edge.
//   3. portAnchor(w, h, side, rank, count) — the local-space port position.
//
// The exact rendered output of the five built-ins is preserved bit-for-bit;
// this is a structural refactor, not a visual change.

import type { VNode, VNodeType } from '../types';
import {
  fitCmdsToBox,
  translateCmds,
  serializePathCmds,
  sampleOutlinePoints,
  type PathViewBox,
} from './path-outline';
import { parsePath, type PathCmd } from '../canvas/path-geometry';

export type ShapeSide = 'left' | 'right' | 'top' | 'bottom';
export interface ShapePoint {
  x: number;
  y: number;
}
/** Node bounding box in WORLD coordinates (used by boundaryPoint). */
export interface ShapeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Transform applied to a shape outline. The same primitive drives every render
 * site: body = {}, selection = { grow: padding }, shadow = { dx, dy }.
 */
export interface OutlineTransform {
  /** Expand the outline outward by this many px (selection highlight padding). */
  grow?: number;
  /** Translate the outline (drop-shadow offset). */
  dx?: number;
  dy?: number;
  /** Corner radius for rect (rx). Emitted only when truthy unless `radiusAlways`. */
  radius?: number;
  /** Also emit ry (= radius). Selection/body want rx+ry; shadow wants rx only. */
  radiusY?: boolean;
  /** Emit rx even when `radius` is 0 (shadow keeps rx: borderRadius ?? 4). */
  radiusAlways?: boolean;
}

/** An SVG element type plus the geometry props for one outline instance. */
export interface OutlineSpec {
  el: VNodeType;
  geom: Record<string, number | string>;
  /** Polygon shapes expose their vertices so boundaryPoint can reuse them. */
  verts?: ShapePoint[];
}

/**
 * A shape's inner label box in LOCAL coordinates (0,0 = node top-left). The
 * node label engine wraps + clips text to this rect. Curved / slanted shapes
 * (diamond, ellipse, triangle, cylinder …) inset it so text stays inside the
 * visible silhouette. See {@link getInnerRect}.
 */
export interface InnerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The single geometry contract every node shape implements. Register once via
 * {@link registerShape} and the shape works across body, selection, shadow,
 * smart-connection boundary and port positioning — no switch edits required.
 */
export interface ShapeDefinition {
  type: string;

  /** Outline geometry under a transform (drives body + selection + shadow). */
  outline(width: number, height: number, transform?: OutlineTransform): OutlineSpec;

  /**
   * Point on the outline for a floating smart-connection attachment on `side`
   * at cross-axis coordinate `cross` (world coords). Return null to fall back
   * to the bounding-box edge (rect and unknown shapes do this).
   */
  boundaryPoint(rect: ShapeRect, side: ShapeSide, cross: number): ShapePoint | null;

  /** Local-space port anchor on `side` for port `rank` of `count` on that side. */
  portAnchor(
    width: number,
    height: number,
    side: ShapeSide,
    rank: number,
    count: number
  ): ShapePoint;

  /**
   * The label box in local coords (0,0 = top-left). Used by the node label
   * engine to wrap, clip and ellipsis-truncate text inside the silhouette.
   * Optional — omit to accept the padded-bbox default ({@link defaultInnerRect}).
   */
  innerRect?(width: number, height: number): InnerRect;

  /** How the node body applies node styles. Defaults to 'inline'. */
  styleMode?: 'inline' | 'spread';
  /** Style keys dropped from the body's pass-through props (circle: rx, ry). */
  bodyStripKeys?: string[];
  /**
   * Geometry keys emitted AFTER the pass-through props in the body, so an
   * explicit value overrides one arriving via the styles object. rect defers
   * rx/ry so an explicit cornerRadius wins over a themed borderRadius.
   */
  bodyDeferGeomKeys?: string[];
}

// ---------------------------------------------------------------------------
// Shared geometry helpers (extracted verbatim from the original switch sites)
// ---------------------------------------------------------------------------

function fmt(verts: ShapePoint[]): string {
  return verts.map((v) => `${v.x},${v.y}`).join(' ');
}

/** Even fraction along an edge: 1 port → 1/2; 2 ports → 1/3, 2/3; … */
function edgeFraction(rank: number, count: number): number {
  return (rank + 1) / (count + 1);
}

/** Base perimeter angle for each side (radians) — circle/ellipse anchors. */
const SIDE_ANGLES: Record<string, number> = {
  top: -Math.PI / 2,
  right: 0,
  bottom: Math.PI / 2,
  left: Math.PI,
};

/**
 * Symmetric angular fan around the side's base angle: a single port sits on
 * the base angle; additional ports spread ±15° steps, centered.
 */
function fanAngle(side: string, rank: number, count: number): number {
  const spacing = Math.PI / 12; // 15 degrees between adjacent ports
  return SIDE_ANGLES[side] + (rank - (count - 1) / 2) * spacing;
}

/**
 * Analytic projection onto an ellipse/circle outline for a smart attachment.
 * Mirrors the original shapeEdgePoint ellipse/circle branch exactly.
 */
function ellipseBoundaryPoint(
  rect: ShapeRect,
  side: ShapeSide,
  cross: number,
  rx: number,
  ry: number
): ShapePoint {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const vertical = side === 'top' || side === 'bottom';
  const clampv = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  if (vertical) {
    const x = clampv(cross, cx - rx * 0.9, cx + rx * 0.9);
    const dy = ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    return { x, y: side === 'top' ? cy - dy : cy + dy };
  }
  const y = clampv(cross, cy - ry * 0.9, cy + ry * 0.9);
  const dx = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  return { x: side === 'left' ? cx - dx : cx + dx, y };
}

/**
 * Intersect the outline polygon with the axis line at `cross`, keeping the
 * intersection that belongs to the requested side. Mirrors the original
 * shapeEdgePoint hexagon/diamond branch exactly (returns null at a degenerate
 * vertex tangent so the caller falls through to the box edge).
 */
function polygonBoundaryPoint(
  verts: ShapePoint[],
  side: ShapeSide,
  cross: number
): ShapePoint | null {
  const vertical = side === 'top' || side === 'bottom';
  let best: number | null = null;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (vertical) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (cross < lo || cross > hi || lo === hi) continue;
      const y = a.y + ((cross - a.x) / (b.x - a.x)) * (b.y - a.y);
      if (best === null || (side === 'top' ? y < best : y > best)) best = y;
    } else {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (cross < lo || cross > hi || lo === hi) continue;
      const x = a.x + ((cross - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (best === null || (side === 'left' ? x < best : x > best)) best = x;
    }
  }
  if (best !== null) {
    return vertical ? { x: cross, y: best } : { x: best, y: cross };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Built-in shape definitions (existing geometry — extracted, not invented)
// ---------------------------------------------------------------------------

const RectShape: ShapeDefinition = {
  type: 'rect',
  styleMode: 'inline',
  bodyDeferGeomKeys: ['rx', 'ry'],
  outline(width, height, t = {}) {
    const grow = t.grow ?? 0;
    const dx = t.dx ?? 0;
    const dy = t.dy ?? 0;
    const geom: Record<string, number> = {
      x: -grow + dx,
      y: -grow + dy,
      width: width + 2 * grow,
      height: height + 2 * grow,
    };
    if (t.radius !== undefined && (t.radiusAlways || t.radius)) {
      geom['rx'] = t.radius;
      if (t.radiusY) geom['ry'] = t.radius;
    }
    return { el: 'rect', geom };
  },
  boundaryPoint() {
    // Rects use the bounding-box edge — handled by the caller's fallback.
    return null;
  },
  portAnchor(width, height, side, rank, count) {
    const f = edgeFraction(rank, count);
    switch (side) {
      case 'left':
        return { x: 0, y: height * f };
      case 'right':
        return { x: width, y: height * f };
      case 'top':
        return { x: width * f, y: 0 };
      case 'bottom':
        return { x: width * f, y: height };
      default:
        return { x: 0, y: 0 };
    }
  },
};

const CircleShape: ShapeDefinition = {
  type: 'circle',
  styleMode: 'inline',
  // rx/ry are rect corner-radius styles — meaningless (and confusing) on a circle
  bodyStripKeys: ['rx', 'ry'],
  outline(width, height, t = {}) {
    const grow = t.grow ?? 0;
    const dx = t.dx ?? 0;
    const dy = t.dy ?? 0;
    const radius = Math.min(width, height) / 2 + grow;
    return {
      el: 'circle',
      geom: { cx: width / 2 + dx, cy: height / 2 + dy, r: radius },
    };
  },
  boundaryPoint(rect, side, cross) {
    const r = Math.min(rect.w, rect.h) / 2;
    return ellipseBoundaryPoint(rect, side, cross, r, r);
  },
  portAnchor(width, height, side, rank, count) {
    const radius = Math.min(width, height) / 2;
    const cx = width / 2;
    const cy = height / 2;
    const angle = fanAngle(side, rank, count);
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  },
  // A square inscribed in the circle: side = 2r/√2 ≈ 0.707·(2r). Use 0.6·min
  // as a conservative label box so text never bleeds past the curve.
  innerRect(width, height) {
    const d = Math.min(width, height);
    return { x: (width - 0.6 * d) / 2, y: (height - 0.6 * d) / 2, w: 0.6 * d, h: 0.6 * d };
  },
};

const EllipseShape: ShapeDefinition = {
  type: 'ellipse',
  // Ellipse spreads node styles directly; geometry is merged AFTER so a rect
  // corner-radius `rx` (borderRadius) in the styles never wins over rx = w/2.
  styleMode: 'spread',
  outline(width, height, t = {}) {
    const grow = t.grow ?? 0;
    const dx = t.dx ?? 0;
    const dy = t.dy ?? 0;
    return {
      el: 'ellipse',
      geom: {
        cx: width / 2 + dx,
        cy: height / 2 + dy,
        rx: width / 2 + grow,
        ry: height / 2 + grow,
      },
    };
  },
  boundaryPoint(rect, side, cross) {
    return ellipseBoundaryPoint(rect, side, cross, rect.w / 2, rect.h / 2);
  },
  portAnchor(width, height, side, rank, count) {
    const rx = width / 2;
    const ry = height / 2;
    const cx = width / 2;
    const cy = height / 2;
    const angle = fanAngle(side, rank, count);
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  },
  // ~0.6·w × ~0.6·h centered box (inscribed-rectangle approximation).
  innerRect(width, height) {
    return { x: 0.2 * width, y: 0.2 * height, w: 0.6 * width, h: 0.6 * height };
  },
};

function diamondVerts(width: number, height: number, t: OutlineTransform): ShapePoint[] {
  // Diamond of the reference box expanded by `grow` on every side, translated
  // by (dx, dy). Center is invariant under grow, so vertices push outward.
  const grow = t.grow ?? 0;
  const dx = t.dx ?? 0;
  const dy = t.dy ?? 0;
  const x0 = -grow + dx;
  const y0 = -grow + dy;
  const w = width + 2 * grow;
  const h = height + 2 * grow;
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  return [
    { x: cx, y: y0 }, // top
    { x: x0 + w, y: cy }, // right
    { x: cx, y: y0 + h }, // bottom
    { x: x0, y: cy }, // left
  ];
}

const DiamondShape: ShapeDefinition = {
  type: 'diamond',
  styleMode: 'inline',
  outline(width, height, t = {}) {
    const verts = diamondVerts(width, height, t);
    return { el: 'polygon', geom: { points: fmt(verts) }, verts };
  },
  boundaryPoint(rect, side, cross) {
    const local = diamondVerts(rect.w, rect.h, {});
    const world = local.map((v) => ({ x: v.x + rect.x, y: v.y + rect.y }));
    return polygonBoundaryPoint(world, side, cross);
  },
  portAnchor(width, height, side) {
    const cx = width / 2;
    const cy = height / 2;
    const vertices: Record<string, ShapePoint> = {
      top: { x: cx, y: 0 },
      right: { x: width, y: cy },
      bottom: { x: cx, y: height },
      left: { x: 0, y: cy },
    };
    return vertices[side];
  },
  // The largest axis-aligned rectangle inside a diamond is half its span; use
  // ~0.5 so text clears the sloped edges (documented approximation).
  innerRect(width, height) {
    return { x: 0.25 * width, y: 0.25 * height, w: 0.5 * width, h: 0.5 * height };
  },
};

function hexagonVerts(width: number, height: number, t: OutlineTransform): ShapePoint[] {
  // Flat-top hexagon. The horizontal 25% offset stays keyed to the ORIGINAL
  // width; `grow` pushes each vertex outward and (dx, dy) translates. This
  // matches the original renderHexagonShape / selection / shadow geometry.
  const grow = t.grow ?? 0;
  const dx = t.dx ?? 0;
  const dy = t.dy ?? 0;
  const ox = width * 0.25;
  const cy = height / 2;
  return [
    { x: ox - grow + dx, y: -grow + dy }, // top-left
    { x: width - ox + grow + dx, y: -grow + dy }, // top-right
    { x: width + grow + dx, y: cy + dy }, // right
    { x: width - ox + grow + dx, y: height + grow + dy }, // bottom-right
    { x: ox - grow + dx, y: height + grow + dy }, // bottom-left
    { x: -grow + dx, y: cy + dy }, // left
  ];
}

const HexagonShape: ShapeDefinition = {
  type: 'hexagon',
  // Hexagon spreads node styles directly (historical parity with ellipse).
  styleMode: 'spread',
  outline(width, height, t = {}) {
    const verts = hexagonVerts(width, height, t);
    return { el: 'polygon', geom: { points: fmt(verts) }, verts };
  },
  boundaryPoint(rect, side, cross) {
    const local = hexagonVerts(rect.w, rect.h, {});
    const world = local.map((v) => ({ x: v.x + rect.x, y: v.y + rect.y }));
    return polygonBoundaryPoint(world, side, cross);
  },
  portAnchor(width, height, side, rank, count) {
    const cy = height / 2;
    const edgeStart = width * 0.25;
    const edgeSpan = width * 0.5;
    switch (side) {
      case 'top':
        return { x: edgeStart + edgeSpan * edgeFraction(rank, count), y: 0 };
      case 'bottom':
        return { x: edgeStart + edgeSpan * edgeFraction(rank, count), y: height };
      case 'right':
        return { x: width, y: cy };
      case 'left':
      default:
        return { x: 0, y: cy };
    }
  },
};

// ===========================================================================
// EXTENDED FIGURE LIBRARY — flowchart / BPMN / UML / ERD shapes
// ---------------------------------------------------------------------------
// Every shape below is a first-class ShapeDefinition registered through the
// SAME registry as the five built-ins, so it works across body / selection /
// shadow / smart-connection boundary / port positioning with zero switch edits.
//
// Two families, two authoring helpers:
//   • polygonShape(...) — a straight-edged silhouette given by a vertex list
//     parameterized over the outline box (grow + dx/dy handled once). Ports and
//     boundary points ride the REAL edges via polygonBoundaryPoint, so slanted
//     sides (parallelogram, trapezoid, triangle …) attach correctly.
//   • pathShape(...) — a curved / compound silhouette emitted as a single
//     <path>. The registry contract only spoke rect/circle/ellipse/polygon; we
//     extend it minimally to allow `el: 'path'` with `geom.d` so cylinder,
//     document, cloud, actor … render as real geometry instead of rectangles.
//     Path shapes are ~rectangular in footprint, so ports/boundary use the box
//     edge (documented approximation).
// ===========================================================================

/** The outline reference box under a transform (grow expands, dx/dy translate). */
interface OutlineBox {
  x0: number;
  y0: number;
  w: number;
  h: number;
}
function boxOf(width: number, height: number, t: OutlineTransform): OutlineBox {
  const grow = t.grow ?? 0;
  return { x0: -grow + (t.dx ?? 0), y0: -grow + (t.dy ?? 0), w: width + 2 * grow, h: height + 2 * grow };
}

/** Round to 3dp so path/point strings stay compact and diff-stable. */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Clamp a scalar into [lo, hi]. */
function clampN(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Port anchor on a polygon's REAL edge: intersect the outline with the center
 * line at the even edge-fraction; fall back to the box edge at a vertex tangent.
 */
function polygonPortAnchor(
  verts: ShapePoint[],
  width: number,
  height: number,
  side: ShapeSide,
  rank: number,
  count: number
): ShapePoint {
  const f = edgeFraction(rank, count);
  const cross = side === 'top' || side === 'bottom' ? width * f : height * f;
  const p = polygonBoundaryPoint(verts, side, cross);
  if (p) return p;
  return side === 'left'
    ? { x: 0, y: cross }
    : side === 'right'
    ? { x: width, y: cross }
    : side === 'top'
    ? { x: cross, y: 0 }
    : { x: cross, y: height };
}

/** Rect-style box-edge port anchor (used by the ~rectangular path shapes). */
function boxPortAnchor(
  width: number,
  height: number,
  side: ShapeSide,
  rank: number,
  count: number
): ShapePoint {
  const f = edgeFraction(rank, count);
  switch (side) {
    case 'left':
      return { x: 0, y: height * f };
    case 'right':
      return { x: width, y: height * f };
    case 'top':
      return { x: width * f, y: 0 };
    default:
      return { x: width * f, y: height };
  }
}

/** Build a straight-edged (polygon) shape from a box-parameterized vertex list. */
function polygonShape(
  type: string,
  vertsFn: (box: OutlineBox) => ShapePoint[],
  opts: {
    portAnchor?: ShapeDefinition['portAnchor'];
    innerRect?: ShapeDefinition['innerRect'];
    styleMode?: ShapeDefinition['styleMode'];
  } = {}
): ShapeDefinition {
  return {
    type,
    styleMode: opts.styleMode ?? 'inline',
    outline(width, height, t = {}) {
      const verts = vertsFn(boxOf(width, height, t));
      return { el: 'polygon', geom: { points: fmt(verts) }, verts };
    },
    boundaryPoint(rect, side, cross) {
      const local = vertsFn({ x0: 0, y0: 0, w: rect.w, h: rect.h });
      const world = local.map((v) => ({ x: v.x + rect.x, y: v.y + rect.y }));
      return polygonBoundaryPoint(world, side, cross);
    },
    portAnchor(width, height, side, rank, count) {
      if (opts.portAnchor) return opts.portAnchor(width, height, side, rank, count);
      const verts = vertsFn({ x0: 0, y0: 0, w: width, h: height });
      return polygonPortAnchor(verts, width, height, side, rank, count);
    },
    innerRect: opts.innerRect,
  };
}

/** Build a curved / compound shape emitted as a single <path> (`d` from box). */
function pathShape(
  type: string,
  dFn: (box: OutlineBox) => string,
  opts: {
    portAnchor?: ShapeDefinition['portAnchor'];
    boundaryPoint?: ShapeDefinition['boundaryPoint'];
    innerRect?: ShapeDefinition['innerRect'];
  } = {}
): ShapeDefinition {
  return {
    type,
    styleMode: 'inline',
    outline(width, height, t = {}) {
      return { el: 'path', geom: { d: dFn(boxOf(width, height, t)) } };
    },
    // ~rectangular footprint → the bounding-box edge is a good attachment.
    boundaryPoint: opts.boundaryPoint ?? (() => null),
    portAnchor: opts.portAnchor ?? boxPortAnchor,
    innerRect: opts.innerRect,
  };
}

// ── Vertex builders (skew = horizontal shear used by parallelogram/trapezoid) ─
const SKEW = 0.25; // fraction of width sheared off — the classic flowchart lean

function parallelogramVerts(b: OutlineBox, lean: 1 | -1): ShapePoint[] {
  const s = b.w * SKEW;
  // lean = 1 → top edge shifted right (data / I-O); lean = -1 → shifted left.
  return lean === 1
    ? [
        { x: r3(b.x0 + s), y: b.y0 },
        { x: r3(b.x0 + b.w), y: b.y0 },
        { x: r3(b.x0 + b.w - s), y: r3(b.y0 + b.h) },
        { x: b.x0, y: r3(b.y0 + b.h) },
      ]
    : [
        { x: b.x0, y: b.y0 },
        { x: r3(b.x0 + b.w - s), y: b.y0 },
        { x: r3(b.x0 + b.w), y: r3(b.y0 + b.h) },
        { x: r3(b.x0 + s), y: r3(b.y0 + b.h) },
      ];
}

function trapezoidVerts(b: OutlineBox, narrow: 'top' | 'bottom'): ShapePoint[] {
  const s = b.w * SKEW;
  return narrow === 'top'
    ? [
        { x: r3(b.x0 + s), y: b.y0 },
        { x: r3(b.x0 + b.w - s), y: b.y0 },
        { x: r3(b.x0 + b.w), y: r3(b.y0 + b.h) },
        { x: b.x0, y: r3(b.y0 + b.h) },
      ]
    : [
        { x: b.x0, y: b.y0 },
        { x: r3(b.x0 + b.w), y: b.y0 },
        { x: r3(b.x0 + b.w - s), y: r3(b.y0 + b.h) },
        { x: r3(b.x0 + s), y: r3(b.y0 + b.h) },
      ];
}

function triangleVerts(b: OutlineBox, dir: 'up' | 'down'): ShapePoint[] {
  const cx = r3(b.x0 + b.w / 2);
  return dir === 'up'
    ? [
        { x: cx, y: b.y0 },
        { x: r3(b.x0 + b.w), y: r3(b.y0 + b.h) },
        { x: b.x0, y: r3(b.y0 + b.h) },
      ]
    : [
        { x: b.x0, y: b.y0 },
        { x: r3(b.x0 + b.w), y: b.y0 },
        { x: cx, y: r3(b.y0 + b.h) },
      ];
}

/** UML package (folder): a tab on the top-left plus the body — a 7-vertex poly. */
function packageVerts(b: OutlineBox): ShapePoint[] {
  const tabW = b.w * 0.4;
  const tabH = b.h * 0.2;
  return [
    { x: b.x0, y: r3(b.y0 + tabH) },
    { x: b.x0, y: b.y0 },
    { x: r3(b.x0 + tabW), y: b.y0 },
    { x: r3(b.x0 + tabW), y: r3(b.y0 + tabH) },
    { x: r3(b.x0 + b.w), y: r3(b.y0 + tabH) },
    { x: r3(b.x0 + b.w), y: r3(b.y0 + b.h) },
    { x: b.x0, y: r3(b.y0 + b.h) },
  ];
}

/** Isometric cube outer silhouette (a 6-vertex hexagon; edges drawn by cubePath). */
function cubeSilhouetteVerts(b: OutlineBox): ShapePoint[] {
  const d = Math.min(b.w, b.h) * 0.22;
  return [
    { x: b.x0, y: r3(b.y0 + d) },
    { x: r3(b.x0 + d), y: b.y0 },
    { x: r3(b.x0 + b.w), y: b.y0 },
    { x: r3(b.x0 + b.w), y: r3(b.y0 + b.h - d) },
    { x: r3(b.x0 + b.w - d), y: r3(b.y0 + b.h) },
    { x: b.x0, y: r3(b.y0 + b.h) },
  ];
}

/** Note silhouette (folded top-right corner) — a 6-vertex poly; fold by notePath. */
function noteVerts(b: OutlineBox): ShapePoint[] {
  const f = Math.min(b.w, b.h) * 0.25;
  return [
    { x: b.x0, y: b.y0 },
    { x: r3(b.x0 + b.w - f), y: b.y0 },
    { x: r3(b.x0 + b.w), y: r3(b.y0 + f) },
    { x: r3(b.x0 + b.w), y: r3(b.y0 + b.h) },
    { x: b.x0, y: r3(b.y0 + b.h) },
  ];
}

// ── Straight-edged shapes ──────────────────────────────────────────────────
const ParallelogramShape = polygonShape('parallelogram', (b) => parallelogramVerts(b, 1));
const ParallelogramTopShape = polygonShape('parallelogram-top', (b) => parallelogramVerts(b, -1));
const TrapezoidShape = polygonShape('trapezoid', (b) => trapezoidVerts(b, 'top'));
const TrapezoidBottomShape = polygonShape('trapezoid-bottom', (b) => trapezoidVerts(b, 'bottom'));
const TriangleShape = polygonShape('triangle', (b) => triangleVerts(b, 'up'), {
  // apex/base custom anchors read better than generic edge intersections
  portAnchor(width, height, side, rank, count) {
    if (side === 'top') return { x: width / 2, y: 0 };
    if (side === 'bottom') return { x: width * edgeFraction(rank, count), y: height };
    if (side === 'left') return { x: width * 0.25, y: height / 2 };
    return { x: width * 0.75, y: height / 2 };
  },
  innerRect: (w, h) => ({ x: 0.25 * w, y: 0.45 * h, w: 0.5 * w, h: 0.5 * h }),
});
const TriangleDownShape = polygonShape('triangle-down', (b) => triangleVerts(b, 'down'), {
  innerRect: (w, h) => ({ x: 0.25 * w, y: 0.05 * h, w: 0.5 * w, h: 0.5 * h }),
});
const PackageShape = polygonShape('package', packageVerts, {
  innerRect: (w, h) => ({ x: 0.08 * w, y: 0.28 * h, w: 0.84 * w, h: 0.64 * h }),
});
const CubeShape: ShapeDefinition = {
  ...polygonShape('cube', cubeSilhouetteVerts, {
    innerRect: (w, h) => ({ x: 0.06 * w, y: 0.32 * h, w: 0.62 * w, h: 0.6 * h }),
  }),
  // Override the outline to draw the two interior 3D edges as extra subpaths.
  outline(width, height, t = {}) {
    const b = boxOf(width, height, t);
    const d = Math.min(b.w, b.h) * 0.22;
    const { x0, y0 } = b;
    const w = b.w;
    const h = b.h;
    const front = `M ${r3(x0)},${r3(y0 + d)} L ${r3(x0)},${r3(y0 + h)} L ${r3(x0 + w - d)},${r3(
      y0 + h
    )} L ${r3(x0 + w - d)},${r3(y0 + d)} Z`;
    const top = `M ${r3(x0)},${r3(y0 + d)} L ${r3(x0 + d)},${r3(y0)} L ${r3(x0 + w)},${r3(y0)} L ${r3(
      x0 + w - d
    )},${r3(y0 + d)}`;
    const rightEdge = `M ${r3(x0 + w - d)},${r3(y0 + d)} L ${r3(x0 + w)},${r3(y0)} L ${r3(x0 + w)},${r3(
      y0 + h - d
    )} L ${r3(x0 + w - d)},${r3(y0 + h)}`;
    return { el: 'path', geom: { d: `${front} ${top} ${rightEdge}` } };
  },
};

// ── Curved / compound (path) shapes ────────────────────────────────────────
const DocumentShape = pathShape(
  'document',
  (b) => {
    const wave = b.h * 0.12;
    const { x0, y0, w, h } = b;
    // rect top + sides, then a double Q-curve wavy bottom
    return (
      `M ${r3(x0)},${r3(y0)} L ${r3(x0 + w)},${r3(y0)} L ${r3(x0 + w)},${r3(y0 + h - wave)} ` +
      `Q ${r3(x0 + 0.75 * w)},${r3(y0 + h - 2 * wave)} ${r3(x0 + 0.5 * w)},${r3(y0 + h - wave)} ` +
      `Q ${r3(x0 + 0.25 * w)},${r3(y0 + h)} ${r3(x0)},${r3(y0 + h - wave)} Z`
    );
  },
  { innerRect: (w, h) => ({ x: 0.08 * w, y: 0.08 * h, w: 0.84 * w, h: 0.72 * h }) }
);

/** Classic DB-cylinder rim radius (must match the outline generator exactly). */
function cylinderRy(w: number, h: number): number {
  return Math.min(h / 2, w / 2 / (2.5 + w / h));
}

const CylinderShape: ShapeDefinition = {
  ...pathShape(
    'cylinder',
    (b) => {
      const { x0, y0, w, h } = b;
      const rx = w / 2;
      const ry = cylinderRy(w, h); // classic DB rim curvature
      const body = h - 2 * ry;
      // full top ellipse (two arcs) + body sides + front bottom arc
      return (
        `M ${r3(x0)},${r3(y0 + ry)} ` +
        `a ${r3(rx)},${r3(ry)} 0 0 0 ${r3(w)} 0 ` +
        `a ${r3(rx)},${r3(ry)} 0 0 0 ${r3(-w)} 0 ` +
        `l 0 ${r3(body)} ` +
        `a ${r3(rx)},${r3(ry)} 0 0 0 ${r3(w)} 0 ` +
        `l 0 ${r3(-body)}`
      );
    },
    { innerRect: (w, h) => ({ x: 0.1 * w, y: 0.28 * h, w: 0.8 * w, h: 0.5 * h }) }
  ),
  // Card 7 — geometry-true anchors. Ports ride the cylinder's real geometry: the
  // top port sits on the FRONT RIM SEAM (the visible top edge of the body, at
  // y = 2·ry), the bottom on the front base arc, and the sides on the vertical
  // body seam — not the bounding box.
  portAnchor(width, height, side, rank, count) {
    const ry = cylinderRy(width, height);
    const rx = width / 2;
    const cx = width / 2;
    const f = edgeFraction(rank, count);
    if (side === 'left' || side === 'right') {
      return { x: side === 'left' ? 0 : width, y: ry + (height - 2 * ry) * f };
    }
    const x = Math.max(0, Math.min(width, cx + (f - 0.5) * rx * 1.6));
    const dx = rx > 0 ? (x - cx) / rx : 0;
    const off = ry * Math.sqrt(Math.max(0, 1 - dx * dx));
    // front rim seam (top) / front base arc (bottom)
    return side === 'top' ? { x, y: ry + off } : { x, y: height - ry + off };
  },
  // Smart-connection boundary: project onto the SILHOUETTE — the top/bottom rim
  // curves and the vertical sides — instead of the bounding box.
  boundaryPoint(rect, side, cross) {
    const ry = cylinderRy(rect.w, rect.h);
    const rx = rect.w / 2;
    const cx = rect.x + rect.w / 2;
    if (side === 'left') return { x: rect.x, y: clampN(cross, rect.y + ry, rect.y + rect.h - ry) };
    if (side === 'right')
      return { x: rect.x + rect.w, y: clampN(cross, rect.y + ry, rect.y + rect.h - ry) };
    const px = clampN(cross, rect.x, rect.x + rect.w);
    const dx = rx > 0 ? (px - cx) / rx : 0;
    const off = ry * Math.sqrt(Math.max(0, 1 - dx * dx));
    return side === 'top'
      ? { x: px, y: rect.y + ry - off } // upper half of the top rim
      : { x: px, y: rect.y + rect.h - ry + off }; // lower half of the base
  },
};

const CloudShape = pathShape(
  'cloud',
  (b) => {
    // Five bump arcs around the box — a recognizable cloud silhouette scaled
    // to (w, h). Bumps are cubic beziers so grow/dx-dy just move the box.
    const { x0, y0, w, h } = b;
    const X = (fx: number) => r3(x0 + fx * w);
    const Y = (fy: number) => r3(y0 + fy * h);
    return (
      `M ${X(0.25)},${Y(0.85)} ` +
      `C ${X(0.05)},${Y(0.85)} ${X(0.05)},${Y(0.55)} ${X(0.2)},${Y(0.5)} ` +
      `C ${X(0.15)},${Y(0.2)} ${X(0.45)},${Y(0.1)} ${X(0.55)},${Y(0.3)} ` +
      `C ${X(0.65)},${Y(0.08)} ${X(0.95)},${Y(0.15)} ${X(0.85)},${Y(0.45)} ` +
      `C ${X(1.02)},${Y(0.5)} ${X(0.98)},${Y(0.82)} ${X(0.78)},${Y(0.85)} ` +
      `Z`
    );
  },
  { innerRect: (w, h) => ({ x: 0.2 * w, y: 0.35 * h, w: 0.6 * w, h: 0.45 * h }) }
);

// Predefined process / subroutine: rect + a vertical bar inset on each side.
const PredefinedProcessShape = pathShape(
  'predefined-process',
  (b) => {
    const { x0, y0, w, h } = b;
    const bar = w * 0.1;
    const rect = `M ${r3(x0)},${r3(y0)} L ${r3(x0 + w)},${r3(y0)} L ${r3(x0 + w)},${r3(
      y0 + h
    )} L ${r3(x0)},${r3(y0 + h)} Z`;
    const left = `M ${r3(x0 + bar)},${r3(y0)} L ${r3(x0 + bar)},${r3(y0 + h)}`;
    const right = `M ${r3(x0 + w - bar)},${r3(y0)} L ${r3(x0 + w - bar)},${r3(y0 + h)}`;
    return `${rect} ${left} ${right}`;
  },
  { innerRect: (w, h) => ({ x: 0.12 * w, y: 0.12 * h, w: 0.76 * w, h: 0.76 * h }) }
);

// UML component: body rect + two small tabs protruding on the left edge.
const ComponentShape = pathShape(
  'component',
  (b) => {
    const { x0, y0, w, h } = b;
    const tw = w * 0.14;
    const th = h * 0.16;
    const bodyX = x0 + tw / 2;
    const bodyW = w - tw / 2;
    const y1 = y0 + h * 0.2;
    const y2 = y0 + h * 0.55;
    const body = `M ${r3(bodyX)},${r3(y0)} L ${r3(x0 + bodyW)},${r3(y0)} L ${r3(x0 + bodyW)},${r3(
      y0 + h
    )} L ${r3(bodyX)},${r3(y0 + h)} Z`;
    const tab = (ty: number) =>
      `M ${r3(x0)},${r3(ty)} L ${r3(x0 + tw)},${r3(ty)} L ${r3(x0 + tw)},${r3(ty + th)} L ${r3(
        x0
      )},${r3(ty + th)} Z`;
    return `${body} ${tab(y1)} ${tab(y2)}`;
  },
  { innerRect: (w, h) => ({ x: 0.16 * w, y: 0.1 * h, w: 0.76 * w, h: 0.8 * h }) }
);

// Note: folded top-right corner rect + the little fold triangle.
const NoteShape: ShapeDefinition = {
  ...pathShape('note', () => '', {
    innerRect: (w, h) => ({ x: 0.08 * w, y: 0.08 * h, w: 0.84 * w, h: 0.84 * h }),
  }),
  outline(width, height, t = {}) {
    const b = boxOf(width, height, t);
    const f = Math.min(b.w, b.h) * 0.25;
    const { x0, y0, w, h } = b;
    const body = `M ${r3(x0)},${r3(y0)} L ${r3(x0 + w - f)},${r3(y0)} L ${r3(x0 + w)},${r3(
      y0 + f
    )} L ${r3(x0 + w)},${r3(y0 + h)} L ${r3(x0)},${r3(y0 + h)} Z`;
    const fold = `M ${r3(x0 + w - f)},${r3(y0)} L ${r3(x0 + w - f)},${r3(y0 + f)} L ${r3(x0 + w)},${r3(
      y0 + f
    )}`;
    return { el: 'path', geom: { d: `${body} ${fold}` } };
  },
  boundaryPoint(rect, side, cross) {
    const local = noteVerts({ x0: 0, y0: 0, w: rect.w, h: rect.h });
    const world = local.map((v) => ({ x: v.x + rect.x, y: v.y + rect.y }));
    return polygonBoundaryPoint(world, side, cross);
  },
};

// Terminal / stadium / pill: a fully rounded rectangle (rx = ry = height/2).
const TerminalShape: ShapeDefinition = {
  type: 'terminal',
  styleMode: 'inline',
  bodyStripKeys: ['rx', 'ry'], // never let a themed borderRadius fight rx = h/2
  outline(width, height, t = {}) {
    const b = boxOf(width, height, t);
    const rad = b.h / 2;
    return { el: 'rect', geom: { x: r3(b.x0), y: r3(b.y0), width: r3(b.w), height: r3(b.h), rx: r3(rad), ry: r3(rad) } };
  },
  boundaryPoint() {
    return null; // straight top/bottom + semicircle ends → bbox edge is fine
  },
  portAnchor: boxPortAnchor,
  innerRect: (w, h) => ({ x: h * 0.5, y: 0.15 * h, w: Math.max(0, w - h), h: 0.7 * h }),
};

// Actor (UML use-case): stick figure — head circle + torso/arms/legs strokes.
const ActorShape: ShapeDefinition = {
  type: 'actor',
  styleMode: 'inline',
  outline(width, height, t = {}) {
    const b = boxOf(width, height, t);
    const { x0, y0, w, h } = b;
    const cx = x0 + w / 2;
    const rHead = Math.min(w * 0.22, h * 0.16);
    const headCy = y0 + rHead;
    const neck = headCy + rHead;
    const hip = y0 + h * 0.62;
    const arms = y0 + h * 0.4;
    // head as two arcs (full circle), then torso, arms, and two legs
    const head = `M ${r3(cx - rHead)},${r3(headCy)} a ${r3(rHead)},${r3(rHead)} 0 1 0 ${r3(
      2 * rHead
    )} 0 a ${r3(rHead)},${r3(rHead)} 0 1 0 ${r3(-2 * rHead)} 0`;
    const torso = `M ${r3(cx)},${r3(neck)} L ${r3(cx)},${r3(hip)}`;
    const armLine = `M ${r3(x0 + w * 0.18)},${r3(arms)} L ${r3(x0 + w * 0.82)},${r3(arms)}`;
    const legs = `M ${r3(x0 + w * 0.2)},${r3(y0 + h)} L ${r3(cx)},${r3(hip)} L ${r3(
      x0 + w * 0.8
    )},${r3(y0 + h)}`;
    return { el: 'path', geom: { d: `${head} ${torso} ${armLine} ${legs}` } };
  },
  boundaryPoint() {
    return null;
  },
  // Card 7 — geometry-true anchors: the side ports attach to the actor's HANDS
  // (the ends of the arm line at 40% height), the top to the head crown, and the
  // bottom between the feet. Multiple ports on a side fan slightly so they don't
  // stack on the same hand.
  portAnchor(width, height, side, rank, count) {
    const armY = height * 0.4;
    const spread = (rank - (count - 1) / 2) * height * 0.12;
    switch (side) {
      case 'left':
        return { x: width * 0.18, y: clampN(armY + spread, 0, height) };
      case 'right':
        return { x: width * 0.82, y: clampN(armY + spread, 0, height) };
      case 'top':
        return { x: width / 2, y: 0 };
      case 'bottom':
      default:
        return { x: width * (0.2 + 0.6 * edgeFraction(rank, count)), y: height };
    }
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ShapeDefinition>();

/**
 * Register (or replace) a shape definition. This is the payoff: a new shape is
 * added in ONE place and immediately works across body/selection/shadow,
 * smart-connection boundaries and port positioning — no switch edits.
 */
export function registerShape(type: string, def: Omit<ShapeDefinition, 'type'> & { type?: string }): void {
  registry.set(type, { ...def, type });
}

/**
 * A static SVG path string, or a parametric generator that returns the path `d`
 * for a specific `width × height` box (0,0 at top-left). The generator form is
 * preferred for shapes whose detail should NOT scale uniformly (rounded corners,
 * fixed-radius notches); the static form is the quickest way to drop in a figure
 * authored in a design tool.
 */
export type PathGeometry = string | ((width: number, height: number) => string);

/**
 * Options for {@link registerPathShape}.
 *
 * By default the boundary point (smart-connection attachment) and the port
 * anchors are DERIVED from the path outline by sampling — so a custom silhouette
 * attaches links to its real edge, not its bounding box. Supply `portAnchor` /
 * `boundaryPoint` to override the sampled geometry with exact analytic anchors
 * (the same override seam the built-in triangle uses for its apex/base points).
 */
export interface PathShapeOptions {
  /** Reference box for a STATIC path string (default `0 0 1 1` — unit box). */
  viewBox?: PathViewBox;
  /** Exact port anchors, bypassing outline sampling. */
  portAnchor?: ShapeDefinition['portAnchor'];
  /** Exact smart-connection boundary, bypassing outline sampling. */
  boundaryPoint?: ShapeDefinition['boundaryPoint'];
  /** Label box; defaults to the padded bounding box. */
  innerRect?: ShapeDefinition['innerRect'];
  /** Curve subdivision when sampling the outline (default 24). */
  sampleSteps?: number;
}

/**
 * Register an arbitrary SVG-path shape (Card 2). This is the payoff of the
 * geometry contract: a userland caller adds a brand-new silhouette in ONE call
 * and it works everywhere the built-ins do — node body, selection highlight,
 * drop shadow, smart-connection boundary and geometry-true port anchors — with
 * NO core-team switch edits.
 *
 * ```ts
 * // Parametric — a 5-point star that fills any box.
 * registerPathShape('star', (w, h) => starPath(w, h));
 * // Static — a chevron authored in a 24×24 art box.
 * registerPathShape('chevron', 'M2,4 L14,4 L22,12 L14,20 L2,20 L10,12 Z',
 *   { viewBox: { x: 0, y: 0, w: 24, h: 24 } });
 * ```
 */
export function registerPathShape(
  type: string,
  path: PathGeometry,
  opts: PathShapeOptions = {}
): void {
  const steps = opts.sampleSteps ?? 24;
  const viewBox = opts.viewBox ?? { x: 0, y: 0, w: 1, h: 1 };

  // Commands for a natural (origin-anchored) `width × height` box. Static strings
  // are parsed ONCE and rescaled per size; generators re-parse their output.
  const staticCmds = typeof path === 'string' ? parsePath(path) : null;
  const cmdsForSize = (width: number, height: number): PathCmd[] =>
    staticCmds
      ? fitCmdsToBox(staticCmds, viewBox, width, height)
      : parsePath((path as (w: number, h: number) => string)(width, height));

  // One-slot memo for the sampled outline — port positions are recomputed every
  // frame per port, so re-flattening the path each call would be wasteful.
  let sampleKey = '';
  let sampleCache: ShapePoint[] = [];
  const outlinePoints = (width: number, height: number): ShapePoint[] => {
    const key = `${width}x${height}`;
    if (key !== sampleKey) {
      sampleKey = key;
      sampleCache = sampleOutlinePoints(cmdsForSize(width, height), steps);
    }
    return sampleCache;
  };

  registry.set(type, {
    type,
    styleMode: 'inline',
    outline(width, height, t = {}) {
      const box = boxOf(width, height, t);
      // Draw at the (grown) box size, then translate to the box origin so grow
      // (selection padding) and dx/dy (shadow offset) compose exactly as they do
      // for every other shape.
      const cmds = translateCmds(cmdsForSize(box.w, box.h), box.x0, box.y0);
      return { el: 'path', geom: { d: serializePathCmds(cmds) } };
    },
    boundaryPoint(rect, side, cross) {
      if (opts.boundaryPoint) return opts.boundaryPoint(rect, side, cross);
      const local = outlinePoints(rect.w, rect.h);
      if (local.length < 3) return null; // degenerate → caller uses bbox edge
      const world = local.map((v) => ({ x: v.x + rect.x, y: v.y + rect.y }));
      return polygonBoundaryPoint(world, side, cross);
    },
    portAnchor(width, height, side, rank, count) {
      if (opts.portAnchor) return opts.portAnchor(width, height, side, rank, count);
      const verts = outlinePoints(width, height);
      if (verts.length < 3) return boxPortAnchor(width, height, side, rank, count);
      return polygonPortAnchor(verts, width, height, side, rank, count);
    },
    innerRect: opts.innerRect,
  });
}

/** The rect shape is the default fallback for unknown / unset shape types. */
export function getShape(type: string | undefined): ShapeDefinition {
  return (type ? registry.get(type) : undefined) ?? RectShape;
}

/** Whether a shape type is registered (excludes the implicit rect fallback). */
export function hasShape(type: string): boolean {
  return registry.has(type);
}

/** All registered shape type names (built-ins + extended library + aliases). */
export function listShapes(): string[] {
  return [...registry.keys()];
}

/**
 * The label box for a shape in local coords. Falls back to a padded bounding
 * box when the shape doesn't override `innerRect`.
 */
export function getInnerRect(def: ShapeDefinition, width: number, height: number): InnerRect {
  return def.innerRect ? def.innerRect(width, height) : defaultInnerRect(width, height);
}

/** Padded-bbox label box: inset by up to 8px, clamped so it never inverts. */
export function defaultInnerRect(width: number, height: number): InnerRect {
  const pad = Math.max(0, Math.min(8, width / 2 - 1, height / 2 - 1));
  return { x: pad, y: pad, w: width - 2 * pad, h: height - 2 * pad };
}

// Register the five built-ins.
for (const def of [RectShape, CircleShape, EllipseShape, DiamondShape, HexagonShape]) {
  registry.set(def.type, def);
}

// Register the extended flowchart / BPMN / UML / ERD figure library. Each is a
// full ShapeDefinition, so it works everywhere the built-ins do — no switch
// edits at any of the five render sites.
for (const def of [
  ParallelogramShape,
  ParallelogramTopShape,
  TrapezoidShape,
  TrapezoidBottomShape,
  TriangleShape,
  TriangleDownShape,
  PackageShape,
  CubeShape,
  DocumentShape,
  CylinderShape,
  CloudShape,
  PredefinedProcessShape,
  ComponentShape,
  NoteShape,
  TerminalShape,
  ActorShape,
]) {
  registry.set(def.type, def);
}

// Common aliases (draw.io / mermaid / BPMN vocabulary) → the same definitions.
const SHAPE_ALIASES: Record<string, ShapeDefinition> = {
  data: ParallelogramShape, // flowchart I/O
  'input-output': ParallelogramShape,
  database: CylinderShape,
  cylinder3d: CylinderShape,
  subroutine: PredefinedProcessShape,
  'predefined-process-alt': PredefinedProcessShape,
  stadium: TerminalShape,
  pill: TerminalShape,
  terminator: TerminalShape,
  'manual-operation': TrapezoidShape, // narrow-bottom in some dialects; near enough
  folder: PackageShape,
  comment: NoteShape,
  'use-case-actor': ActorShape,
};
for (const [alias, def] of Object.entries(SHAPE_ALIASES)) {
  registry.set(alias, def);
}

// ---------------------------------------------------------------------------
// VNode builders — turn a ShapeDefinition + styles into the exact VNodes the
// three render sites used to build inline. Kept here so all shape geometry and
// its style-composition rules live together.
// ---------------------------------------------------------------------------

/**
 * Node body VNode. Reproduces the historical per-shape style composition:
 *  - 'inline' shapes (rect/circle/diamond) hoist fill/stroke/strokeWidth into
 *    an inline `style` string (highest CSS specificity) and pass the rest
 *    through; circle strips the meaningless rect rx/ry.
 *  - 'spread' shapes (ellipse/hexagon) spread node styles as presentation
 *    attributes with geometry merged last.
 */
/** CSS property name for each paint key that may carry a `var()` reference. */
const CSS_PAINT_PROPS: Record<string, string> = {
  fill: 'fill',
  stroke: 'stroke',
  strokeWidth: 'stroke-width',
};

/**
 * Pull any paint whose value is a `var(--…)` reference out of the attribute bag
 * and into an inline CSS style string (where variables are legal).
 *
 * `hoisted` is `''` when nothing needed moving — the overwhelmingly common case,
 * and the caller then emits the original props untouched.
 */
function hoistCssVarPaints(styles: any): { hoisted: string; rest: Record<string, any> } {
  const rest: Record<string, any> = { ...styles };
  const decls: string[] = [];

  for (const [key, cssProp] of Object.entries(CSS_PAINT_PROPS)) {
    const value = rest[key];
    if (typeof value === 'string' && value.includes('var(')) {
      decls.push(`${cssProp}: ${value}`);
      delete rest[key];
    }
  }

  if (decls.length === 0) return { hoisted: '', rest };

  // Preserve an existing style string, with the hoisted paints appended so they
  // still win over anything the caller had already put there.
  const existing = typeof rest['style'] === 'string' ? rest['style'] : '';
  delete rest['style'];

  return { hoisted: [existing, decls.join('; ')].filter(Boolean).join('; '), rest };
}

export function buildShapeBody(
  def: ShapeDefinition,
  width: number,
  height: number,
  cornerRadius: number | undefined,
  // `any` (not Record<string, any>) so the inline `style` string below is
  // accepted — matches the original render helpers' loosely-typed styles arg.
  styles: any
): VNode {
  const spec = def.outline(width, height, { radius: cornerRadius, radiusY: true });

  if (def.styleMode === 'spread') {
    // TWO bugs met on this line, found independently by the export and the theming
    // work. Both are the same root cause — a 'spread' shape paints through
    // PRESENTATION ATTRIBUTES — and the fix for one subsumes the other:
    //
    //   1. A presentation attribute LOSES to any author stylesheet rule. So
    //      `[data-grafloria-instance] .diagram-node { fill: var(--grafloria-node-fill) }`
    //      beat `fill="#e8f5e9"`, and in CSS mode an ellipse/hexagon (and every
    //      'spread' figure) silently rendered the THEME fill instead of its own.
    //      'inline' shapes never had this, because they hoist the same values into
    //      an inline `style`, which DOES beat the stylesheet — the two style modes
    //      simply disagreed about the cascade.
    //   2. An attribute cannot hold a CSS variable: `fill="var(--grafloria-…)"` is
    //      invalid, the attribute is dropped, and the shape paints BLACK. Wave 4
    //      made that reachable, because a theme-bound property (`themeRef(...)`)
    //      emits exactly such a var() reference.
    //
    // Hoisting EVERY paint into the inline style fixes both: inline style outranks
    // the stylesheet (1) and is the one place var() is legal (2). The presentation
    // attributes are KEPT, because Canvas/programmatic consumers and existing tests
    // read props.fill — and where the value is a var(), the inline style is what
    // actually paints.
    const inlineStyle = composeInlineStyle(styles);
    // Literal paints KEEP their presentation attribute (Canvas + programmatic
    // consumers and the existing tests read props.fill). A var() paint DROPS it:
    // the attribute is invalid, so it is not merely outranked — it is garbage that
    // every downstream consumer would have to special-case (the headless exporter
    // would write `fill="var(--…)"` into a standalone file, where nothing resolves
    // it and the shape paints BLACK).
    const { rest } = hoistCssVarPaints(styles);
    return {
      type: spec.el,
      props: {
        ...rest,
        ...(inlineStyle ? { style: mergeInlineStyle(styles.style, inlineStyle) } : {}),
        ...spec.geom,
      },
    };
  }

  // Split geometry into pre/post so deferred keys (rect rx/ry) win over any
  // same-named key arriving via the pass-through styles.
  const deferKeys = def.bodyDeferGeomKeys ?? [];
  const pre: Record<string, any> = {};
  const post: Record<string, any> = {};
  for (const [k, v] of Object.entries(spec.geom)) {
    (deferKeys.includes(k) ? post : pre)[k] = v;
  }

  const { fill, stroke, strokeWidth, className, ...rest } = styles;
  for (const k of def.bodyStripKeys ?? []) delete rest[k];

  const inlineStyle = composeInlineStyle({ fill, stroke, strokeWidth });

  return {
    type: spec.el,
    props: {
      ...pre,
      ...(className ? { className } : {}),
      ...(inlineStyle ? { style: inlineStyle } : {}),
      ...rest,
      ...post,
    },
  };
}

/**
 * The paint values a node body must carry as an INLINE style, so they beat the
 * themed `.diagram-node` stylesheet rule (a presentation attribute would not).
 * Returns '' when no layer above the theme set anything — which is what lets an
 * untouched node still fall back to the theme.
 */
function composeInlineStyle(styles: {
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: unknown;
}): string {
  return [
    styles.fill ? `fill: ${styles.fill}` : '',
    styles.stroke ? `stroke: ${styles.stroke}` : '',
    styles.strokeWidth !== undefined ? `stroke-width: ${styles.strokeWidth}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** Append the hoisted paint to a style the caller already had (string or object form). */
function mergeInlineStyle(existing: unknown, hoisted: string): string {
  if (existing === null || existing === undefined || existing === '') return hoisted;
  if (typeof existing === 'string') return `${existing}; ${hoisted}`;
  const parts = Object.entries(existing as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}: ${v}`);
  return [...parts, hoisted].join('; ');
}

/** Selection-highlight VNode: the outline grown by `padding`, plus baseProps. */
export function buildShapeSelection(
  def: ShapeDefinition,
  width: number,
  height: number,
  padding: number,
  baseProps: Record<string, any>
): VNode {
  const spec = def.outline(width, height, { grow: padding, radius: 6, radiusY: true });
  return { type: spec.el, props: { ...spec.geom, ...baseProps } };
}

/** Drop-shadow VNode: the outline offset by (offset, offset), plus baseProps. */
export function buildShapeShadow(
  def: ShapeDefinition,
  width: number,
  height: number,
  offset: number,
  borderRadius: number,
  baseProps: Record<string, any>
): VNode {
  const spec = def.outline(width, height, {
    dx: offset,
    dy: offset,
    radius: borderRadius,
    radiusAlways: true,
    radiusY: false,
  });
  return { type: spec.el, props: { ...spec.geom, ...baseProps } };
}
