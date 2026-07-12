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

/** The rect shape is the default fallback for unknown / unset shape types. */
export function getShape(type: string | undefined): ShapeDefinition {
  return (type ? registry.get(type) : undefined) ?? RectShape;
}

/** Whether a shape type is registered (excludes the implicit rect fallback). */
export function hasShape(type: string): boolean {
  return registry.has(type);
}

// Register the five built-ins.
for (const def of [RectShape, CircleShape, EllipseShape, DiamondShape, HexagonShape]) {
  registry.set(def.type, def);
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
    return { type: spec.el, props: { ...styles, ...spec.geom } };
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

  const inlineStyle = [
    fill ? `fill: ${fill}` : '',
    stroke ? `stroke: ${stroke}` : '',
    strokeWidth !== undefined ? `stroke-width: ${strokeWidth}` : '',
  ]
    .filter(Boolean)
    .join('; ');

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
