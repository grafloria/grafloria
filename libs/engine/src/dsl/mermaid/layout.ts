/**
 * Type-aware placement for Mermaid imports — shared rank machinery.
 *
 * Closes the gap-analysis §3a item "no type-aware layout (ER tables by FK
 * dependency, class by inheritance depth, state by flow)". Each Mermaid type
 * chooses WHICH edges rank its graph (flowchart: every edge; ER: FK
 * dependency; class: inheritance/realization only; state: transitions from the
 * start pseudo-states) and hands them here. This module answers the two
 * questions the types share:
 *
 *   1. `assignRanks` — a rank per node by LONGEST PATH over the chosen edge
 *      subset. Cycles are broken at the back-edge (deterministic DFS in the
 *      caller's node order), so `Check -->|no| Start` ranks as a back-edge
 *      instead of dragging Start below Check.
 *   2. `placeByRank` — ranks become bands along the direction's flow axis
 *      (TD/TB/BT ⇒ y, LR/RL ⇒ x), size-aware; siblings spread on the cross
 *      axis, centered per band.
 *
 * SYNCHRONOUS and DETERMINISTIC on purpose: this runs at parse time inside the
 * builders/transformer (TextFormat constructs DSL with `autoLayout:false` and
 * must stay sync), so it cannot be the async ELK path and it must produce the
 * same picture for the same text, every time. No new dependencies.
 */

export interface RankEdge {
  from: string;
  to: string;
}

/**
 * Longest-path ranks over the edge subset, back-edges dropped.
 *
 * Deterministic: DFS roots and neighbour order follow `ids` / `edges` order,
 * so the same text always breaks a cycle at the same edge. Nodes with no
 * ranking edges sit at rank 0.
 */
export function assignRanks(
  ids: readonly string[],
  edges: readonly RankEdge[]
): Map<string, number> {
  const idSet = new Set(ids);
  const out = new Map<string, RankEdge[]>();
  for (const id of ids) out.set(id, []);
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    if (edge.from === edge.to) continue; // self-loop: never a ranking edge
    out.get(edge.from)!.push(edge);
  }

  // Back-edge detection: iterative DFS, colouring nodes white→grey→black. An
  // edge into a GREY node closes a cycle and is dropped from ranking.
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const forward = new Map<string, RankEdge[]>();
  for (const id of ids) forward.set(id, []);
  for (const root of ids) {
    if (colour.has(root)) continue;
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    colour.set(root, GREY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const outgoing = out.get(frame.id)!;
      if (frame.next < outgoing.length) {
        const edge = outgoing[frame.next++];
        const state = colour.get(edge.to);
        if (state === GREY) continue; // back-edge — drop
        forward.get(frame.id)!.push(edge);
        if (state === undefined) {
          colour.set(edge.to, GREY);
          stack.push({ id: edge.to, next: 0 });
        }
      } else {
        colour.set(frame.id, BLACK);
        stack.pop();
      }
    }
  }

  // Longest-path over the acyclic subset (Kahn order, then relax).
  const incoming = new Map<string, number>();
  for (const id of ids) incoming.set(id, 0);
  for (const bucket of forward.values()) {
    for (const edge of bucket) incoming.set(edge.to, incoming.get(edge.to)! + 1);
  }
  const ranks = new Map<string, number>();
  const queue: string[] = ids.filter((id) => incoming.get(id) === 0);
  for (const id of queue) ranks.set(id, 0);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const rank = ranks.get(id)!;
    for (const edge of forward.get(id)!) {
      const proposed = rank + 1;
      if ((ranks.get(edge.to) ?? -1) < proposed) ranks.set(edge.to, proposed);
      const remaining = incoming.get(edge.to)! - 1;
      incoming.set(edge.to, remaining);
      if (remaining === 0) queue.push(edge.to);
    }
  }
  for (const id of ids) if (!ranks.has(id)) ranks.set(id, 0);
  return ranks;
}

export interface PlaceByRankOptions {
  /** TD / TB / BT rank down (or up) the page; LR / RL rank across it. Default TB. */
  direction?: string;
  /** Top-left corner of the laid-out block. */
  start?: { x: number; y: number };
  /** Gap between consecutive rank bands, along the flow axis. */
  rankGap?: number;
  /** Gap between siblings inside a band, across the flow axis. */
  crossGap?: number;
}

export interface Placeable {
  id: string;
  size: { width: number; height: number };
}

/**
 * Rank-band placement. Bands are size-aware (a band is as deep as its deepest
 * node; each node centres within its band), siblings pack across the flow axis
 * and every band centres on the widest band — so a fork reads as a fork.
 * BT / RL simply reverse the band order, keeping coordinates positive.
 */
export function placeByRank(
  nodes: readonly Placeable[],
  ranks: ReadonlyMap<string, number>,
  options: PlaceByRankOptions = {}
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map();
  const direction = (options.direction ?? 'TB').toUpperCase();
  const vertical = direction !== 'LR' && direction !== 'RL';
  const reversed = direction === 'BT' || direction === 'RL';
  const start = options.start ?? { x: 100, y: 100 };
  const rankGap = options.rankGap ?? 70;
  const crossGap = options.crossGap ?? 50;

  const along = (n: Placeable): number => (vertical ? n.size.height : n.size.width);
  const across = (n: Placeable): number => (vertical ? n.size.width : n.size.height);

  // Bands in rank order, preserving the caller's node order inside a band.
  const bands = new Map<number, Placeable[]>();
  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const band = bands.get(rank) ?? [];
    band.push(node);
    bands.set(rank, band);
  }
  let order = [...bands.keys()].sort((a, b) => a - b);
  if (reversed) order = order.reverse();

  const crossTotal = (band: Placeable[]): number =>
    band.reduce((sum, n) => sum + across(n), 0) + (band.length - 1) * crossGap;
  const widest = Math.max(...order.map((r) => crossTotal(bands.get(r)!)));

  const positions = new Map<string, { x: number; y: number }>();
  let alongCursor = vertical ? start.y : start.x;
  for (const rank of order) {
    const band = bands.get(rank)!;
    const bandDepth = Math.max(...band.map(along));
    let crossCursor =
      (vertical ? start.x : start.y) + (widest - crossTotal(band)) / 2;
    for (const node of band) {
      const alongPos = alongCursor + (bandDepth - along(node)) / 2;
      positions.set(
        node.id,
        vertical ? { x: crossCursor, y: alongPos } : { x: alongPos, y: crossCursor }
      );
      crossCursor += across(node) + crossGap;
    }
    alongCursor += bandDepth + rankGap;
  }
  return positions;
}

/** The two steps together — the common case for the type builders. */
export function rankLayout(
  nodes: readonly Placeable[],
  edges: readonly RankEdge[],
  options: PlaceByRankOptions = {}
): Map<string, { x: number; y: number }> {
  return placeByRank(
    nodes,
    assignRanks(nodes.map((n) => n.id), edges),
    options
  );
}
