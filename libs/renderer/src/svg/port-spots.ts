// port-spots.ts — Wave 6 (Ports & connections), Card 5.
//
// Where on a port's glyph does a link actually attach, and which way does it
// leave? And when N links all land on ONE port, how do they share it?
//
// Two problems, one module:
//
//   1. ATTACHMENT SPOT. Every link used to attach to the port's centre point and
//      leave along the port's side. `fromSpot`/`toSpot` let a port say otherwise
//      — attach at the glyph's top-left corner, leave downward, stand off 4px.
//
//   2. MULTI-LINK SPREAD. Every link landing on a port landed on the SAME point,
//      so five links into one input arrived as a single overdrawn stroke. The
//      spread fans them along the port's edge — the tangent, not the normal, so
//      they still arrive travelling the right way.
//
// This module does NOT route. It computes ENDPOINTS and hands them to the routing
// engine, which is exactly the seam the routers already consume (`getLinkEndpoints`
// → `{start, end, sourceDirection, targetDirection}`). No router is touched.
//
// PURE GEOMETRY.

import type { PortSpot, PortSpreadSpec } from '@grafloria/engine';
import { DEFAULT_PORT_SPREAD_SPACING } from '@grafloria/engine';
// Wave 4 already worked out the unit outward normal of a side for the self-loop
// router. There is exactly one right answer, so there is exactly one function.
import { sideNormal, type FanoutSide } from './link-fanout';

export type Side = FanoutSide;

export interface SpotInput {
  /** World position of the port's anchor (its glyph centre). */
  x: number;
  y: number;
  /** Glyph half-extents — a spot names a corner/edge of THIS box. */
  hw: number;
  hh: number;
  /** The port's side: the default direction, and the default spot. */
  side: Side;
}

/** Unit tangent of a side — the axis links spread along. */
export function sideTangent(side: Side): { x: number; y: number } {
  const normal = sideNormal(side);
  return { x: -normal.y, y: normal.x };
}

/**
 * Resolve `spot` to a world point on the glyph box, plus the direction the link
 * travels there.
 *
 * `default` (and an absent spec) resolves to the glyph CENTRE and the port's
 * own side — byte-for-byte the pre-wave-6 endpoint. Nothing moves unless the
 * author asks it to.
 */
export function resolveSpot(
  spot: PortSpot | undefined,
  input: SpotInput
): { point: { x: number; y: number }; direction: Side } {
  const { x, y, hw, hh, side } = input;
  const name = spot?.spot ?? 'default';
  const direction = spot?.direction ?? side;

  let px = x;
  let py = y;

  switch (name) {
    case 'top':
      py = y - hh;
      break;
    case 'bottom':
      py = y + hh;
      break;
    case 'left':
      px = x - hw;
      break;
    case 'right':
      px = x + hw;
      break;
    case 'topLeft':
      px = x - hw;
      py = y - hh;
      break;
    case 'topRight':
      px = x + hw;
      py = y - hh;
      break;
    case 'bottomLeft':
      px = x - hw;
      py = y + hh;
      break;
    case 'bottomRight':
      px = x + hw;
      py = y + hh;
      break;
    case 'center':
    case 'default':
    default:
      // The glyph centre — the historical attachment point.
      break;
  }

  // Stand-off: push the attachment further out along the travel direction, so a
  // link can start clear of a big glyph (or of its own arrowhead).
  const distance = spot?.distance ?? 0;
  if (distance) {
    const normal = sideNormal(direction);
    px += normal.x * distance;
    py += normal.y * distance;
  }

  return { point: { x: px, y: py }, direction };
}

/**
 * The signed lane offsets for `count` links sharing one port, spaced `spacing`
 * apart and CENTRED on the port's own attachment point.
 *
 *   count 1 → [0]                 ← a lone link NEVER moves. This is the whole
 *                                   byte-stability guarantee: a port with one
 *                                   link renders exactly where it always did.
 *   count 2 → [-s/2, +s/2]
 *   count 3 → [-s, 0, +s]
 */
export function spreadOffsets(count: number, spacing: number, max = 0): number[] {
  if (count <= 1) return [0];

  // A cap folds the outer lanes back onto the outermost allowed one, so a port
  // with 50 links doesn't grow a 500px fan.
  const lanes = max > 0 ? Math.min(count, max) : count;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const lane = Math.min(i, lanes - 1);
    offsets.push((lane - (lanes - 1) / 2) * spacing);
  }
  return offsets;
}

/**
 * Slide an attachment point along the port's EDGE (its tangent) by one lane.
 *
 * Along the tangent, deliberately — sliding along the NORMAL would push the
 * endpoint off the node and leave a visible gap between the link and the port
 * it is supposed to be touching.
 */
export function applySpread(
  point: { x: number; y: number },
  side: Side,
  laneOffset: number
): { x: number; y: number } {
  if (!laneOffset) return point;
  const tangent = sideTangent(side);
  return { x: point.x + tangent.x * laneOffset, y: point.y + tangent.y * laneOffset };
}

/**
 * The lane assignment for every link on one port: `linkId → offset`.
 *
 * Lanes are ordered by a STABLE key (the id of the link's other endpoint, then
 * the link's own id) rather than by insertion order, so the fan doesn't reshuffle
 * itself every time an unrelated link is added or the diagram is reloaded.
 */
export function assignSpreadLanes(
  entries: Array<{ linkId: string; sortKey: string }>,
  spec: PortSpreadSpec | undefined
): Map<string, number> {
  const lanes = new Map<string, number>();
  if (!spec?.enabled || entries.length <= 1) {
    for (const entry of entries) lanes.set(entry.linkId, 0);
    return lanes;
  }

  const sorted = [...entries].sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.linkId.localeCompare(b.linkId)
  );
  const offsets = spreadOffsets(
    sorted.length,
    spec.spacing ?? DEFAULT_PORT_SPREAD_SPACING,
    spec.max ?? 0
  );

  sorted.forEach((entry, i) => lanes.set(entry.linkId, offsets[i] ?? 0));
  return lanes;
}
