// SIDE ANCHORS — a point along one side of a node, named by a handle string:
//   'right@36'    36 px down the right side (px from the side's start: the top
//                 for left/right, the left end for top/bottom)
//   'bottom@138'  138 px along the bottom from its left end
//   'left@50%'    halfway down the left side
//
// The diagrams AI tools draw leave a tall box at several heights ("card number
// and CVV" at 36, "sends the payment link" at 210, the red "card typed as…" at
// 240); a bare side handle could only mean the middle of the side. One helper
// for every path that reads a handle — the render spec's edges, Mermaid's
// `%%grafloria:edge a b from:right@36` — so the two can never disagree.
import { PortModel } from '../models/PortModel';
import type { NodeModel } from '../models/NodeModel';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

/** `'right@36'` → `{ side: 'right', at: { px: 36 } }`; `'left@50%'` → `{ at: { pct: 50 } }`; anything else → null. */
export function parseSideAnchor(handle: string): { side: AnchorSide; at: { px?: number; pct?: number } } | null {
  const m = /^(top|right|bottom|left)@(-?\d+(?:\.\d+)?)(%|px)?$/.exec(handle.trim());
  if (!m) return null;
  const v = Number(m[2]);
  return { side: m[1] as AnchorSide, at: m[3] === '%' ? { pct: v } : { px: v } };
}

/** The id of the port a side-anchor handle names on `nodeId`. */
export function sideAnchorPortId(nodeId: string, handle: string): string {
  return `${nodeId}__${handle.trim()}`;
}

/** A port a side-anchor handle created (`<node>__right@36`). */
export function isSideAnchorPort(portId: string | undefined): boolean {
  return !!portId && /__(top|right|bottom|left)@-?\d/.test(portId);
}

/**
 * The hidden port a side-anchor handle names — created once per node and
 * handle, then re-used (a re-applied spec must not grow a second one). Placed
 * as a FRACTION of the node box, so it stays on its side when the node resizes.
 * Returns null when `handle` is not a side anchor.
 */
export function ensureSideAnchorPort(node: NodeModel, handle: string): string | null {
  const anchor = parseSideAnchor(handle);
  if (!anchor) return null;
  const id = sideAnchorPortId(node.id, handle);
  if (node.getPort(id)) return id;
  const { side, at } = anchor;
  const along = side === 'left' || side === 'right' ? node.size.height : node.size.width;
  const f = at.pct !== undefined ? at.pct / 100 : along > 0 ? (at.px ?? 0) / along : 0.5;
  const t = Math.max(0, Math.min(1, f));
  const xy = side === 'left' ? { x: 0, y: t } : side === 'right' ? { x: 1, y: t } : side === 'top' ? { x: t, y: 0 } : { x: t, y: 1 };
  node.addPort(new PortModel({ id, type: 'bi', side, index: 0, visible: false, layout: { strategy: 'absolute', args: { ...xy, units: 'fraction' } } as never }));
  return id;
}
