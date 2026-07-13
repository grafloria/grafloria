// Wave 7 (Auto-layout) — Card 7b: the quality metrics that make auto-selection
// worth having.
//
// `layout-quality-metrics.ts` already scores the classics — crossings, overlap,
// edge length, distribution, symmetry, aspect ratio — and they are REAL (the code
// computes them; nothing consumed them, but they work). What it cannot see is the
// two things this card is about:
//
//   • PORT RESPECT   — an edge leaving a node's RIGHT port and travelling LEFT is
//                      a bad layout, and no generic metric notices. This one does.
//   • LABEL CLEARANCE— a label box sitting on top of a node is a bad layout, and
//                      again no generic metric notices.
//
// Those two are exactly requirements 1 and 2 of this card, restated as SCORES —
// which is what lets the auto-selector prefer a port-aware engine on a graph that
// has ports, instead of us hard-coding "use ELK if ports exist".
//
// Plus the two structural measures the card names that the old module lacked:
// BENDS (from the routing hints the adapters no longer discard) and AREA.

import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { LayoutResult } from './layout-adapter.interface';
import type { PortInfo, PortSide } from './port-aware-layout.interface';
import { derivePortInfos, linkLabelBox } from './port-label-bridge';

/**
 * The point half-way along a polyline, by ARC LENGTH.
 *
 * Not `points[floor(n/2)]` — that is an array index, not a midpoint, and on a
 * two-point (straight) route it returns the END point.
 */
function midpointAlongPath(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segments.push(length);
    total += length;
  }

  // A degenerate zero-length path has no meaningful midpoint but a real position.
  if (total === 0) return points[0];

  let travelled = 0;
  const half = total / 2;
  for (let i = 0; i < segments.length; i++) {
    if (travelled + segments[i] >= half) {
      const along = segments[i] === 0 ? 0 : (half - travelled) / segments[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * along,
        y: points[i].y + (points[i + 1].y - points[i].y) * along,
      };
    }
    travelled += segments[i];
  }

  return points[points.length - 1];
}

/** The centre of a node — the honest anchor for any direction question. */
function centre(node: NodeModel): { x: number; y: number } {
  return {
    x: node.position.x + (node.size.width || 150) / 2,
    y: node.position.y + (node.size.height || 50) / 2,
  };
}

/**
 * The direction a port's side FACES, as a unit vector. A `right` port faces +x.
 * Screen coordinates: +y is down, so `top` faces -y.
 */
const SIDE_VECTOR: Record<PortSide, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export interface PortRespectResult {
  /** Links whose endpoint travels AGAINST the side its port faces. */
  violations: number;
  /** Links that could be judged (both ends resolvable, both nodes placed). */
  judged: number;
  /** 100 = every port-constrained edge leaves in the direction its port faces. */
  score: number;
  /** Which links violated, for the report. */
  violatingLinks: string[];
}

/**
 * Does each edge actually leave (and enter) in the direction its port faces?
 *
 * This is requirement 1 of the card as a measurement: "an edge leaving a `right`
 * port should not require the layout to place the target to the left". We check
 * the sign of the displacement along the port's facing axis. A right port whose
 * target sits to the left scores a violation.
 *
 * Only AUTHOR-DECLARED ports are judged — the four auto-created default ports
 * carry no authorial intent, so an edge through them can go anywhere (see
 * port-label-bridge.ts). A graph with no declared ports is vacuously perfect,
 * which is the correct answer: there is nothing to respect.
 */
export function assessPortRespect(
  nodes: NodeModel[],
  links: LinkModel[],
  portInfos?: PortInfo[]
): PortRespectResult {
  const ports = portInfos ?? derivePortInfos(nodes);
  const portById = new Map(ports.map((p) => [p.id, p]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let violations = 0;
  let judged = 0;
  const violatingLinks: string[] = [];

  for (const link of links) {
    const source = nodeById.get(link.sourceNodeId ?? '');
    const target = nodeById.get(link.targetNodeId ?? '');
    if (!source || !target || source === target) continue;

    const sc = centre(source);
    const tc = centre(target);

    // Judge each END against its own port: the source port faces the target, and
    // the target port faces back at the source.
    const ends: Array<[PortInfo | undefined, { x: number; y: number }]> = [
      [portById.get(link.sourcePortId ?? ''), { x: tc.x - sc.x, y: tc.y - sc.y }],
      [portById.get(link.targetPortId ?? ''), { x: sc.x - tc.x, y: sc.y - tc.y }],
    ];

    let violated = false;
    for (const [port, toOther] of ends) {
      if (!port?.preferredSide) continue;
      judged++;

      const facing = SIDE_VECTOR[port.preferredSide];
      // Projection of "where the other end is" onto "where this port points".
      // Negative => the edge has to double back around the node.
      if (facing.x * toOther.x + facing.y * toOther.y < 0) {
        violations++;
        violated = true;
      }
    }

    if (violated) violatingLinks.push(link.id);
  }

  return {
    violations,
    judged,
    score: judged === 0 ? 100 : Math.round(((judged - violations) / judged) * 100),
    violatingLinks,
  };
}

export interface LabelClearanceResult {
  /** Label boxes that land on top of a node. */
  overlaps: number;
  /** Labelled links that could be judged. */
  judged: number;
  /** 100 = no label box collides with any node. */
  score: number;
  /** Which links' labels collided, for the report. */
  collidingLinks: string[];
}

/**
 * Would this layout's edge labels sit on top of a node?
 *
 * Requirement 2 as a measurement. We are NOT placing labels here — the renderer's
 * edge optimizer does collision-aware placement at render time, and duplicating it
 * would be the exact mistake the card warns against. We ask the cheaper question a
 * LAYOUT can answer: if the label sat at its natural home (the midpoint of the
 * route the engine computed), would it land on a node? If yes, layout has not left
 * the optimizer enough room, and this layout is worse than one that did.
 *
 * A layout with no labels is vacuously perfect.
 */
export function assessLabelClearance(
  nodes: NodeModel[],
  links: LinkModel[],
  result: LayoutResult
): LabelClearanceResult {
  let overlaps = 0;
  let judged = 0;
  const collidingLinks: string[] = [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const link of links) {
    const box = linkLabelBox(link);
    if (!box) continue;

    // Where would the label naturally sit? Mid-route if the engine gave us a
    // route, else the midpoint between the two node centres.
    const route = result.routing?.edgeRoutes.get(link.id);
    let mid: { x: number; y: number } | undefined;

    if (route) {
      // The label's natural home is the point HALFWAY ALONG THE PATH — measured by
      // arc length, not by array index.
      //
      // Picking `pts[floor(n/2)]` (as this did) is wrong in the exact way that
      // matters: a straight route has two points, so floor(2/2) = 1 selects the
      // route's END — a point sitting on the target node's border. A label centred
      // there ALWAYS overlaps that node, so every clean, bend-free edge was scored
      // as a label collision. That systematically punished the engines that route
      // best — ELK above all — and so biased auto-selection AGAINST the port-aware
      // engine this card exists to favour. Found by driving a real graph through
      // engine.layout(), not by any unit test.
      mid = midpointAlongPath([route.start, ...route.bends, route.end]);
    } else {
      const s = nodeById.get(link.sourceNodeId ?? '');
      const t = nodeById.get(link.targetNodeId ?? '');
      if (s && t) {
        const sc = centre(s);
        const tc = centre(t);
        mid = { x: (sc.x + tc.x) / 2, y: (sc.y + tc.y) / 2 };
      }
    }

    if (!mid) continue;
    judged++;

    const labelRect = {
      left: mid.x - box.width / 2,
      right: mid.x + box.width / 2,
      top: mid.y - box.height / 2,
      bottom: mid.y + box.height / 2,
    };

    for (const node of nodes) {
      const nodeRect = {
        left: node.position.x,
        right: node.position.x + (node.size.width || 150),
        top: node.position.y,
        bottom: node.position.y + (node.size.height || 50),
      };

      const hit =
        labelRect.left < nodeRect.right &&
        labelRect.right > nodeRect.left &&
        labelRect.top < nodeRect.bottom &&
        labelRect.bottom > nodeRect.top;

      if (hit) {
        overlaps++;
        collidingLinks.push(link.id);
        break; // one collision per label is enough to condemn it
      }
    }
  }

  return {
    overlaps,
    judged,
    score: judged === 0 ? 100 : Math.round(((judged - overlaps) / judged) * 100),
    collidingLinks,
  };
}

/**
 * Total bend count across the routes the layout engine computed.
 *
 * Bends are one of the four measures the card names, and they only became
 * measurable once the adapters stopped discarding their routing output. A layout
 * whose edges need fewer corners is easier to follow.
 *
 * Returns undefined when the engine reported no routes — an ABSENT measurement,
 * not a zero. Scoring "0 bends" for an engine that simply never told us would
 * hand it a perfect score for saying nothing, which is how a metric quietly
 * becomes a lie.
 */
export function countBends(result: LayoutResult): number | undefined {
  const routes = result.routing?.edgeRoutes;
  if (!routes || routes.size === 0) return undefined;

  let bends = 0;
  for (const route of routes.values()) bends += route.bends.length;
  return bends;
}

/** The area of the layout's bounding box, in px². Smaller is tighter. */
export function layoutArea(result: LayoutResult): number {
  const { width, height } = result.bounds;
  return Math.max(0, width) * Math.max(0, height);
}
