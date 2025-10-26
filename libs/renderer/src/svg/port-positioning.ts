// Shape-Aware Port Positioning Utility (Phase 3.2)

import type { NodeModel, PortModel } from '@grafloria/engine';

/**
 * Calculate port position based on node shape
 * Returns position relative to node's local coordinate system (0,0 = top-left)
 *
 * Phase 3.2: Shape-aware port positioning
 * - Rectangle: ports on edges (midpoint or with index offset)
 * - Circle: ports on circumference at angles
 * - Diamond: ports at vertices
 * - Ellipse: ports on ellipse perimeter
 * - Hexagon: ports at edge centers
 */
export function getPortPositionForShape(
  port: PortModel,
  node: NodeModel
): { x: number; y: number } {
  const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
  const { width, height } = node.size;
  const side = port.alignment.side;
  const index = port.index || 0;

  let position: { x: number; y: number };

  switch (shapeConfig.type) {
    case 'circle':
      position = getCirclePortPosition(width, height, side, index);
      break;

    case 'ellipse':
      position = getEllipsePortPosition(width, height, side, index);
      break;

    case 'diamond':
      position = getDiamondPortPosition(width, height, side, index);
      break;

    case 'hexagon':
      position = getHexagonPortPosition(width, height, side, index);
      break;

    case 'rect':
    default:
      position = getRectanglePortPosition(width, height, side, index);
      break;
  }

  // Apply port offset
  return {
    x: position.x + port.offset.x,
    y: position.y + port.offset.y,
  };
}

/**
 * Rectangle port positioning (existing behavior)
 */
function getRectanglePortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  index: number
): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: 0, y: height * 0.5 };

    case 'right':
      return { x: width, y: height * 0.5 };

    case 'top':
      return { x: width * 0.5, y: 0 };

    case 'bottom':
      return { x: width * 0.5, y: height };

    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Circle port positioning - on circumference at angles
 */
function getCirclePortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  index: number
): { x: number; y: number } {
  const radius = Math.min(width, height) / 2;
  const cx = width / 2;
  const cy = height / 2;

  // Base angles for each side (in radians)
  const angles: Record<string, number> = {
    top: -Math.PI / 2,    // -90 degrees
    right: 0,             // 0 degrees
    bottom: Math.PI / 2,  // 90 degrees
    left: Math.PI,        // 180 degrees
  };

  // Get base angle for the side
  let angle = angles[side];

  // If index > 0, spread ports around the quadrant
  if (index > 0) {
    // Spread ±30 degrees around the base angle
    const spreadAngle = (Math.PI / 6); // 30 degrees
    const offset = (index - 1) * (spreadAngle / 2) - spreadAngle;
    angle += offset;
  }

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/**
 * Ellipse port positioning - on ellipse perimeter
 */
function getEllipsePortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  index: number
): { x: number; y: number } {
  const rx = width / 2;
  const ry = height / 2;
  const cx = width / 2;
  const cy = height / 2;

  // Base angles for each side
  const angles: Record<string, number> = {
    top: -Math.PI / 2,
    right: 0,
    bottom: Math.PI / 2,
    left: Math.PI,
  };

  let angle = angles[side];

  // Multi-port spread
  if (index > 0) {
    const spreadAngle = Math.PI / 6;
    const offset = (index - 1) * (spreadAngle / 2) - spreadAngle;
    angle += offset;
  }

  // Point on ellipse perimeter
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
  side: 'left' | 'right' | 'top' | 'bottom',
  index: number
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
 * Hexagon port positioning - at edge centers or vertices
 */
function getHexagonPortPosition(
  width: number,
  height: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  index: number
): { x: number; y: number } {
  const cx = width / 2;
  const cy = height / 2;

  // Flat-top hexagon centers of edges
  const positions: Record<string, { x: number; y: number }> = {
    top: { x: cx, y: 0 },
    right: { x: width, y: cy },
    bottom: { x: cx, y: height },
    left: { x: 0, y: cy },
  };

  return positions[side];
}
