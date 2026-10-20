// World bounds of what the canvas draws — the one definition `fitView()` (live)
// and `renderToStaticSVG({ fitView: true })` (server) both fit to. DOM-free.

import { linkLabelPosition, sampleBasis, type DiagramModel, type NodeModel } from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
import { groupFrameRects } from '../svg/group-frame-bounds';
import { LabelRenderer } from '../svg/LabelRenderer';
import type { Theme } from '../types/theme.types';

/** The point `t` of the way along a polyline, by length (as LabelRenderer places a label). */
function pointAlong(pts: ReadonlyArray<{ x: number; y: number }>, t: number): { x: number; y: number } | null {
  if (pts.length < 2) return null;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  let remaining = total * Math.max(0, Math.min(1, t));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0 && (remaining <= len || i === pts.length - 2)) {
      const u = Math.min(1, remaining / len);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    remaining -= len;
  }
  return { ...pts[pts.length - 1] };
}

/** Label boxes are the renderer's own (LabelRenderer.labelBox); it keeps no state. */
const LABELS = new LabelRenderer();

/**
 * World bounding box of what the canvas draws — every visible node, every routed
 * link waypoint and edge label, every group frame with its caption — or null
 * when there is nothing to fit.
 */
export function contentBounds(model: DiagramModel, theme?: Theme): Rectangle | null {
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

  // Edge LABELS. A label's chip hangs past the line it rides — beside the first
  // box of a rank it can reach past every box, and fitting to boxes and routes
  // alone sliced it at the viewport edge ("deliver all active orders" drew as
  // "ver all active orders"). Each chip where its line puts it.
  for (const link of model.getLinks()) {
    // A basis-curve line's labels ride the curve (as the renderer places them).
    const curve = link.style?.spline === 'basis' && (link.points?.length ?? 0) > 2 ? sampleBasis(link.points, 8) : null;
    for (const label of link.labels ?? []) {
      const at = curve ? pointAlong(curve, linkLabelPosition(label)) : link.getPointAtPosition?.(linkLabelPosition(label));
      if (!at) continue;
      const { width, height } = LABELS.labelBox(label, link, theme);
      const x = at.x + (label.offset?.x ?? 0);
      const y = at.y + (label.offset?.y ?? 0);
      left = Math.min(left, x - width / 2);
      top = Math.min(top, y - height / 2);
      right = Math.max(right, x + width / 2);
      bottom = Math.max(bottom, y + height / 2);
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
