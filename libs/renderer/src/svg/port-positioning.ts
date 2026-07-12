// Shape-Aware Port Positioning Utility (Phase 3.2)

import type { NodeModel, PortModel } from '@grafloria/engine';

// Nodes & shapes foundation: shape-specific anchor geometry lives in the shape
// registry (getShape(type).portAnchor). This module keeps only the port-ranking
// logic (how many ports share a side, and this port's rank among them).
import { getShape } from './shape-registry';

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

  // The shape registry owns the anchor geometry; unknown types fall back to
  // rectangle positioning (getShape returns the rect definition).
  const position = getShape(shapeConfig.type).portAnchor(width, height, side, rank, count);

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
