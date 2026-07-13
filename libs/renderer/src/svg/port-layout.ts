// port-layout.ts — Wave 6 (Ports & connections), Card 4.
//
// The pluggable port-layout engine: NAMED strategies, attachable to a port group,
// each with its own args. A strategy answers one question — "where, in node-local
// coordinates, does the port whose rank is `rank` of `count` sit?" — and knows
// nothing about glyphs, links or validation.
//
// The DEFAULT strategy is `shape`, which defers to the shape registry's
// `portAnchor`. That is the pre-wave-6 behaviour and it is not going anywhere:
// the registry is where the geometry-true anchors live (the cylinder's rim seam,
// the actor's hands, the hexagon's flats), and a generic "spread along the
// bounding box" would throw all of that away. Shape-awareness and pluggable
// layout are not alternatives — `shape` is one of the plugins.
//
// PURE GEOMETRY: numbers in, numbers out. No VNodes, no models beyond the two
// read-only inputs, no DOM.

import type { NodeModel, PortModel, PortLayoutArgs, PortLayoutSpec } from '@grafloria/engine';
import { getShape } from './shape-registry';

export interface PortLayoutInput {
  /** Node-local box the ports live in. */
  width: number;
  height: number;
  /** The port's side (after group inheritance). */
  side: 'left' | 'right' | 'top' | 'bottom';
  /** This port's rank among the ports sharing its LAYOUT SCOPE, and the scope size. */
  rank: number;
  count: number;
  /** The node's shape type — the `shape` strategy needs it. */
  shapeType: string;
  /** The node's rotation in degrees (for `compensateRotation`). */
  rotation?: number;
}

export type PortLayoutStrategy = (input: PortLayoutInput, args: PortLayoutArgs) => { x: number; y: number };

const DEG = Math.PI / 180;

/** The two node-local endpoints of an edge, corner to corner. */
function edgeSpan(
  side: PortLayoutInput['side'],
  width: number,
  height: number,
  padding: number
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  switch (side) {
    case 'left':
      return { from: { x: 0, y: padding }, to: { x: 0, y: height - padding } };
    case 'right':
      return { from: { x: width, y: padding }, to: { x: width, y: height - padding } };
    case 'top':
      return { from: { x: padding, y: 0 }, to: { x: width - padding, y: 0 } };
    case 'bottom':
      return { from: { x: padding, y: height }, to: { x: width - padding, y: height } };
  }
}

/**
 * Spread `count` items along a span. Matches the shape registry's own
 * convention: `(rank + 1) / (count + 1)`, so ONE port sits at the midpoint —
 * not at the start — and N ports are evenly inset from both corners.
 */
function spreadFraction(rank: number, count: number): number {
  return (rank + 1) / (count + 1);
}

// ===========================================================================
// The strategies
// ===========================================================================

/**
 * `shape` — defer to the shape registry's true silhouette anchor. THE DEFAULT.
 */
const shapeStrategy: PortLayoutStrategy = (input) => {
  return getShape(input.shapeType).portAnchor(
    input.width,
    input.height,
    input.side,
    input.rank,
    input.count
  );
};

/**
 * `absolute` — one fixed point. Fractions of the node box by default (so the
 * port tracks a resize), or raw px with `units: 'px'`.
 */
const absoluteStrategy: PortLayoutStrategy = (input, args) => {
  const px = args.units === 'px';
  return {
    x: px ? (args.x ?? 0) : (args.x ?? 0.5) * input.width,
    y: px ? (args.y ?? 0) : (args.y ?? 0.5) * input.height,
  };
};

/**
 * `line` — march the group's ports along the segment `start`→`end` (node-local
 * px). With `step`, they advance at a fixed pitch from `start` (a fixed-pitch
 * pin header); without it, they divide the segment evenly.
 */
const lineStrategy: PortLayoutStrategy = (input, args) => {
  const start = args.start ?? { x: 0, y: 0 };
  const end = args.end ?? { x: input.width, y: 0 };

  if (typeof args.step === 'number' && args.step !== 0) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const distance = args.step * input.rank;
    return { x: start.x + (dx / length) * distance, y: start.y + (dy / length) * distance };
  }

  const t = spreadFraction(input.rank, input.count);
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
};

/**
 * `sideLinear` — spread along the node's own EDGE (the bounding box's, not the
 * silhouette's), inset by `padding`. The workhorse for rectangular node editors:
 * a column of inputs down the left, a column of outputs down the right.
 *
 * With `step`, ports march at a fixed pitch from the edge's start corner instead
 * of dividing it — the layout an n8n / Node-RED node uses so that adding a
 * fifth input doesn't shuffle the other four.
 */
const sideLinearStrategy: PortLayoutStrategy = (input, args) => {
  const padding = args.padding ?? 0;
  const { from, to } = edgeSpan(input.side, input.width, input.height, padding);

  if (typeof args.step === 'number' && args.step !== 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const distance = args.step * input.rank;
    return { x: from.x + (dx / length) * distance, y: from.y + (dy / length) * distance };
  }

  const t = spreadFraction(input.rank, input.count);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

/** Shared ellipse maths for the two ring strategies. */
function onEllipse(input: PortLayoutInput, args: PortLayoutArgs, degrees: number): { x: number; y: number } {
  const cx = input.width / 2;
  const cy = input.height / 2;
  const rx = args.radiusX ?? input.width / 2;
  const ry = args.radiusY ?? input.height / 2;
  const radians = degrees * DEG;
  return { x: cx + rx * Math.cos(radians), y: cy + ry * Math.sin(radians) };
}

/**
 * `ellipse` — every port at ONE angle on the node's inscribed ellipse. Combined
 * with a per-port `angle` override this is the "hand-place each pin on the dial"
 * layout.
 */
const ellipseStrategy: PortLayoutStrategy = (input, args) => {
  return onEllipse(input, args, args.angle ?? 0);
};

/**
 * `ellipseSpread` — fan the group's ports around the ellipse: `count` of them
 * spread across `sweep` degrees starting at `angle`.
 *
 * A FULL ring (sweep 360°) divides by `count` so the first and last ports don't
 * land on the same point; a partial arc divides by `count - 1` so the ports sit
 * ON both ends of the arc, which is what "from 30° to 150°" is asking for.
 */
const ellipseSpreadStrategy: PortLayoutStrategy = (input, args) => {
  const startAngle = args.angle ?? 0;
  const sweep = args.sweep ?? 360;
  const full = Math.abs(sweep) >= 360;
  const divisor = full ? input.count : Math.max(1, input.count - 1);
  const stepAngle = sweep / divisor;
  return onEllipse(input, args, startAngle + stepAngle * input.rank);
};

// ===========================================================================
// Registry
// ===========================================================================

const STRATEGIES = new Map<string, PortLayoutStrategy>([
  ['shape', shapeStrategy],
  ['absolute', absoluteStrategy],
  ['line', lineStrategy],
  ['sideLinear', sideLinearStrategy],
  ['ellipse', ellipseStrategy],
  ['ellipseSpread', ellipseSpreadStrategy],
]);

/** Register a custom strategy. Hosts can add their own; the built-ins are just entries. */
export function registerPortLayout(name: string, strategy: PortLayoutStrategy): void {
  STRATEGIES.set(name, strategy);
}

export function getPortLayout(name: string | undefined): PortLayoutStrategy {
  return (name && STRATEGIES.get(name)) || shapeStrategy;
}

export function hasPortLayout(name: string): boolean {
  return STRATEGIES.has(name);
}

/** For tests / tooling. */
export function portLayoutNames(): string[] {
  return Array.from(STRATEGIES.keys());
}

/**
 * Rotate `point` about the node's centre by `-degrees`, so a port on a rotated
 * node keeps its WORLD-space arrangement (a `compensateRotation` group on a node
 * spun 90° still shows its inputs on the left of the screen).
 *
 * Node-local in, node-local out: the node's own transform then rotates it BACK,
 * and the two cancel.
 */
export function compensateForRotation(
  point: { x: number; y: number },
  width: number,
  height: number,
  degrees: number
): { x: number; y: number } {
  if (!degrees) return point;
  const cx = width / 2;
  const cy = height / 2;
  const radians = -degrees * DEG;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/**
 * Run a port's layout: pick the strategy, apply it, then the shared `dx`/`dy`
 * nudge and optional rotation compensation.
 */
export function runPortLayout(spec: PortLayoutSpec | undefined, input: PortLayoutInput): { x: number; y: number } {
  const args = spec?.args ?? {};
  const strategy = getPortLayout(spec?.strategy);

  let point = strategy(input, args);

  if (args.dx || args.dy) {
    point = { x: point.x + (args.dx ?? 0), y: point.y + (args.dy ?? 0) };
  }

  if (args.compensateRotation && input.rotation) {
    point = compensateForRotation(point, input.width, input.height, input.rotation);
  }

  return point;
}

/** Re-exported so `port-positioning` and the tests agree on the type. */
export type { PortLayoutSpec, PortLayoutArgs, NodeModel, PortModel };
