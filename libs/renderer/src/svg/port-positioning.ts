// Shape-Aware Port Positioning Utility (Phase 3.2)
//
// Wave 6 (Ports & connections), Card 4: this is now the front door to the
// PLUGGABLE port-layout engine (see `port-layout.ts`), not just to the shape
// registry.
//
//   port/group declares no layout → strategy `shape` → the shape registry's
//                                   `portAnchor`, exactly as before. The
//                                   geometry-true anchors (cylinder rim seam,
//                                   actor hands, hexagon flats) still win and the
//                                   emitted geometry is byte-identical.
//   port/group declares a layout   → that named strategy runs instead.
//
// It is also THE port-position function. It has a rival:
// `PortModel.getAbsolutePosition()` walks the BOUNDING BOX (edge midpoints,
// blind to the silhouette and to how many ports share a side) and that is what
// the port hit-test and the magnet were snapping to, while THIS is what actually
// gets drawn. On any non-rect shape, or any side with more than one port, you
// were clicking several pixels away from the circle you could see. See
// `portWorldPosition` — the one true answer, which those call sites now use.

import type { BoundingBox, NodeModel, PortModel } from '@grafloria/engine';
import { resolvePortConfig } from '@grafloria/engine';

// Nodes & shapes foundation: shape-specific anchor geometry lives in the shape
// registry (getShape(type).portAnchor). This module keeps the port-RANKING logic
// (how many ports share a layout scope, and this port's rank among them) and
// hands the geometry to the layout engine.
import { runPortLayout } from './port-layout';

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

  const config = resolvePortConfig(port, node);
  const side = config.side;
  const { rank, count } = getLayoutRank(port, node, side, config.groupId);

  const position = runPortLayout(config.layout, {
    width,
    height,
    side,
    rank,
    count,
    shapeType: shapeConfig.type,
    rotation: (node as unknown as { rotation?: number }).rotation,
  });

  // Apply port offset
  return {
    x: position.x + port.offset.x,
    y: position.y + port.offset.y,
  };
}

/**
 * The port's WORLD position — for hit-testing, magnets and link endpoints alike.
 * Everything that needs "where is this port on screen" comes through here, so
 * what you click is always what you see.
 */
export function portWorldPosition(port: PortModel, node: NodeModel): { x: number; y: number } {
  const local = getPortPositionForShape(port, node);
  const world = node.getWorldPosition();
  return { x: world.x + local.x, y: world.y + local.y };
}

/** Same answer, for callers that already hold the node's bounding box. */
export function portPositionInBounds(
  port: PortModel,
  node: NodeModel,
  bounds: BoundingBox
): { x: number; y: number } {
  const local = getPortPositionForShape(port, node);
  return { x: bounds.left + local.x, y: bounds.top + local.y };
}

/**
 * Rank of this port among the ports sharing its LAYOUT SCOPE, plus the size of
 * that scope. Stable order: by `index`, ties by declaration order.
 *
 * The scope is the port's GROUP when it has one (Card 3 — a group is precisely
 * "the set of ports laid out together", so five inputs in group `in` spread
 * across five slots even if an ungrouped port also sits on the left edge), and
 * otherwise its SIDE, which is the pre-wave-6 scope and is what keeps every
 * existing diagram's port geometry identical.
 */
function getLayoutRank(
  port: PortModel,
  node: NodeModel,
  side: 'left' | 'right' | 'top' | 'bottom',
  groupId: string | undefined
): { rank: number; count: number } {
  const inScope = node
    .getPorts()
    .filter((p) =>
      groupId ? p.group === groupId : !p.group && p.alignment?.side === side
    )
    .map((p, declarationOrder) => ({ p, declarationOrder }))
    .sort((a, b) => (a.p.index || 0) - (b.p.index || 0) || a.declarationOrder - b.declarationOrder);

  const rank = inScope.findIndex((entry) => entry.p.id === port.id);
  return { rank: rank < 0 ? 0 : rank, count: Math.max(1, inScope.length) };
}
