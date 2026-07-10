// Shape-Aware Port Positioning Utility (Phase 3.2)

import type { NodeModel, PortModel } from '@grafloria/engine';

/**
 * Calculate port position based on node shape
 * Returns position relative to node's local coordinate system (0,0 = top-left)
 *
 * Phase 3.2: Shape-aware port positioning
 * - Rectangle: ports spread evenly along the edge (single port = midpoint)
 * - Circle/Ellipse: ports on the perimeter, fanned symmetrically per side
 * - Diamond: ports at vertices
 * - Hexagon: ports spread along the flat edges
 *
 * Multiple ports on the same side are distributed by their rank among that
 * side's ports (ordered by `index`, then declaration order) so they never
 * stack on the same point.
 */
export function getPortPositionForShape(
  port: PortModel,
  node: NodeModel
): { x: number; y: number } {
  const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
  const { width, height } = node.size;
  const side = port.alignment.side;
  const { rank, count } = getSideRank(port, node, side);

  let position: { x: number; y: number };

  switch (shapeConfig.type) {
    case 'circle':
      position = getCirclePortPosition(width, height, side, rank, count);
      break;

    case 'ellipse':
      position = getEllipsePortPosition(width, height, side, rank, count);
      break;

    case 'diamond':
      position = getDiamondPortPosition(width, height, side);
      break;

    case 'hexagon':
      position = getHexagonPortPosition(width, height, side, rank, count);
      break;

    case 'rect':
    default:
      position = getRectanglePortPosition(width, height, side, rank, count);
      break;
  }

  // Apply port offset
  return {
    x: position.x + port.offset.x,
    y: position.y + port.offset.y,
  };
}

/**
 * Rank of this port among the ports sharing its side (stable order: by
 * `index`, ties by declaration order), plus how many ports share the side.
 */
function getSideRank(
  port: PortModel,
  node: NodeModel,
  side: 'left' | 'right' | 'top' | 'bottom'
): { rank: number; count: number } {
  const sameSide = node
    .getPorts()
    .filter((p) => p.alignment?.side === side)
    .map((p, declarationOrder) => ({ p, declarationOrder }))
    .sort((a, b) => (a.p.index || 0) - (b.p.index || 0) || a.declarationOrder - b.declarationOrder);

  const rank = sameSide.findIndex((entry) => entry.p.id === port.id);
  return { rank: rank < 0 ? 0 : rank, count: Math.max(1, sameSide.length) };
}

/** Even fraction along an edge: 1 port → 1/2; 2 ports → 1/3, 2/3; … */
function edgeFraction(rank: number, count: number): number {
  return (rank + 1) / (count + 1);
}

/**
 * Rectangle port positioning — spread evenly along the side's edge
 */
function getRectanglePortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  rank: number,
  count: number
): { x: number; y: number } {
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
}

/** Base perimeter angle for each side (radians) */
const SIDE_ANGLES: Record<string, number> = {
  top: -Math.PI / 2,
  right: 0,
  bottom: Math.PI / 2,
  left: Math.PI,
};

/**
 * Symmetric angular fan around the side's base angle: single port sits on the
 * base angle; additional ports spread ±15° steps, centered — no rank ever
 * collides with another.
 */
function fanAngle(side: string, rank: number, count: number): number {
  const spacing = Math.PI / 12; // 15 degrees between adjacent ports
  return SIDE_ANGLES[side] + (rank - (count - 1) / 2) * spacing;
}

/**
 * Circle port positioning — on circumference, fanned per side
 */
function getCirclePortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  rank: number,
  count: number
): { x: number; y: number } {
  const radius = Math.min(width, height) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const angle = fanAngle(side, rank, count);

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/**
 * Ellipse port positioning — on ellipse perimeter, fanned per side
 */
function getEllipsePortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  rank: number,
  count: number
): { x: number; y: number } {
  const rx = width / 2;
  const ry = height / 2;
  const cx = width / 2;
  const cy = height / 2;
  const angle = fanAngle(side, rank, count);

  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
  };
}

/**
 * Diamond port positioning - at vertices
 */
function getDiamondPortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom'
): { x: number; y: number } {
  const cx = width / 2;
  const cy = height / 2;

  // Diamond vertices
  const vertices: Record<string, { x: number; y: number }> = {
    top: { x: cx, y: 0 },
    right: { x: width, y: cy },
    bottom: { x: cx, y: height },
    left: { x: 0, y: cy },
  };

  return vertices[side];
}

/**
 * Hexagon port positioning — spread along the flat top/bottom edges
 * (the flat-top hexagon's horizontal edges run from 25% to 75% of the width);
 * left/right sides are single vertices.
 */
function getHexagonPortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  rank: number,
  count: number
): { x: number; y: number } {
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
}
