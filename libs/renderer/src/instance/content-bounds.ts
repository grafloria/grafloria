// World bounds of what the canvas draws — the one definition `fitView()` (live)
// and `renderToStaticSVG({ fitView: true })` (server) both fit to. DOM-free.

import type { DiagramModel, NodeModel } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import { groupFrameRects } from '../svg/group-frame-bounds';

/**
 * World bounding box of what the canvas draws — every visible node, every routed
 * link waypoint, every group frame with its caption — or null when there is
 * nothing to fit.
 */
export function contentBounds(model: DiagramModel): Rectangle | null {
  const nodes = model.getNodes().filter((n: NodeModel) => n.state?.visible !== false);
  if (nodes.length === 0 && groupFrameRects(model).length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const node of nodes) {
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + (node.size?.width ?? 0));
    bottom = Math.max(bottom, node.position.y + (node.size?.height ?? 0));
  }

  // Routed edges arc OUTSIDE the node bbox (a detour around an obstacle, a
  // self-loop, a floating attachment's curve). Fitting to nodes alone left
  // those arcs sliced off at the viewport edge — nodes "contained", picture
  // clipped. Union in every routed waypoint the links carry.
  for (const link of model.getLinks()) {
    for (const p of link.points ?? []) {
      left = Math.min(left, p.x);
      top = Math.min(top, p.y);
      right = Math.max(right, p.x);
      bottom = Math.max(bottom, p.y);
    }
  }

  // Group and lane FRAMES, captions included. A frame reaches past its members
  // (padding, an authored size, a pool's empty bands and title strip); fitting to
  // nodes and links alone clipped a lane pool at the viewport edge.
  for (const frame of groupFrameRects(model)) {
    left = Math.min(left, frame.x);
    top = Math.min(top, frame.y);
    right = Math.max(right, frame.x + frame.width);
    bottom = Math.max(bottom, frame.y + frame.height);
  }

  if (!isFinite(left) || !isFinite(top)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
