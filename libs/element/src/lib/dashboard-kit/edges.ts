/** Which edges of a tile a press takes, and the cursor that says so (tile first, step 4b-i: out of the binder). */

/** A press this close (CSS px) to a tile's border takes that edge for a resize. */
export const EDGE_GRIP = 7;

export interface ResizeEdges {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}
export const NO_EDGES: ResizeEdges = { n: false, e: false, s: false, w: false };

/** Which of a host's edges a client point is within EDGE_GRIP of (none when outside). */
export function edgesNear(host: Element, cx: number, cy: number): ResizeEdges {
  const r = host.getBoundingClientRect();
  if (cx < r.left - 2 || cx > r.right + 2 || cy < r.top - 2 || cy > r.bottom + 2) return NO_EDGES;
  return {
    n: cy - r.top <= EDGE_GRIP,
    s: r.bottom - cy <= EDGE_GRIP,
    w: cx - r.left <= EDGE_GRIP,
    e: r.right - cx <= EDGE_GRIP,
  };
}

/**
 * {@link edgesNear} in WORLD units, for a card that has no HTML host to measure
 * (a plain SVG-painted node): `grip` is EDGE_GRIP converted to world units.
 */
export function edgesNearRect(
  r: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
  grip: number,
  slack = grip * (2 / EDGE_GRIP)
): ResizeEdges {
  if (x < r.x - slack || x > r.x + r.width + slack || y < r.y - slack || y > r.y + r.height + slack) return NO_EDGES;
  return {
    n: y - r.y <= grip,
    s: r.y + r.height - y <= grip,
    w: x - r.x <= grip,
    e: r.x + r.width - x <= grip,
  };
}

export const anyEdge = (E: ResizeEdges): boolean => E.n || E.e || E.s || E.w;

/** The resize cursor for a set of edges ('' when none). */
export function cursorFor(E: ResizeEdges): string {
  const v = E.n || E.s;
  const h = E.e || E.w;
  if (v && h) return (E.n && E.w) || (E.s && E.e) ? 'nwse-resize' : 'nesw-resize';
  if (v) return 'ns-resize';
  if (h) return 'ew-resize';
  return '';
}
