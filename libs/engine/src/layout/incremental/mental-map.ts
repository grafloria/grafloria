// Wave 7 (Auto-layout) — Card 6: mental-map-preserving incremental layout.
//
// THE DIFFERENTIATOR. Mermaid re-renders the whole diagram from scratch on every
// edit, so adding one node can rearrange everything and destroy the user's spatial
// memory of their own diagram. Nobody does this well. Doing it well is defensible.
//
// ---------------------------------------------------------------------------
// WHY THE EXISTING SCAFFOLDING COULD NOT WORK
// ---------------------------------------------------------------------------
//
// `IncrementalLayoutManager.generateConstraints()` ships four named strategies —
// pin-existing, fix-anchors, proximity-aware, minimal-shift. All four do the same
// thing: they emit `NodeConstraint[]` for the OLD constraint system, which applied
// them by taking an already-computed position and clamping it (see Card 5). So
// `pin-existing` — "pin every existing node, lay out only the new ones" — actually:
//
//     1. pinned nothing during the layout,
//     2. let the layout place NEW nodes wherever it liked, including on top of
//        existing ones, because it had no idea they were there,
//     3. then snapped the existing nodes back on top of the new ones.
//
// It was scaffolding on a foundation that could not hold it. Card 5 replaced the
// foundation: anchors are now honoured DURING coordinate assignment, and everything
// else is laid out AROUND them. This module is what that makes possible.
//
// ---------------------------------------------------------------------------
// THE THREE IDEAS
// ---------------------------------------------------------------------------
//
// 1. REGION-LIMITED RELAYOUT. An edit touches a few nodes. Re-laying-out the whole
//    graph to accommodate them is what destroys the mental map. So: take the
//    changed nodes, grow a k-hop neighbourhood around them, and let ONLY that
//    region move. Everything outside is a Card-5 anchor — an immovable obstacle the
//    layout must work around, not a position to be corrected afterwards.
//
// 2. OPTIMAL RE-ALIGNMENT — the cheapest large win, and the one most implementations
//    miss. A layered layout is only defined up to a translation: dagre will happily
//    hand you back the same picture shifted 300px right because one new node widened
//    rank 0. Every node then "moves" even though the DRAWING is identical. The fix
//    is exact and costs nothing: translate the new layout so the CENTROIDS of the
//    nodes present in both layouts coincide. That is provably the translation that
//    minimises total squared displacement, and it recovers most of the mental map
//    before a single constraint is applied.
//
// 3. MEASURED, NOT ASSERTED. The card says "real and measured". Movement is reported
//    against an explicit budget (total / average / max), and the caller can see
//    exactly what moved and by how much. A mental-map feature that cannot show its
//    own numbers is a claim, not a capability.

import type { DiagramModel } from '../../models/DiagramModel';
import type { SemanticConstraints } from '../sugiyama/sugiyama';

export type IncrementalStrategy =
  /** Only the changed region may move; everything else is an anchor. */
  | 'region'
  /** Nothing existing moves at all; new nodes are placed in the gaps. */
  | 'pin-existing'
  /** Everything may move, but the result is re-aligned and movement is capped. */
  | 'minimal-shift';

export interface MovementBudget {
  /** No single node may move further than this. */
  maxPerNode?: number;
  /** The mean movement across all nodes that existed before. */
  averagePerNode?: number;
}

export interface IncrementalOptions {
  strategy?: IncrementalStrategy;
  /** Node ids the user just added/edited. Everything else is "existing". */
  changed?: string[];
  /** How far the disturbance is allowed to spread, in graph hops. Default 1. */
  radius?: number;
  budget?: MovementBudget;
}

export interface MovementReport {
  /** Sum of the distances every pre-existing node travelled. */
  total: number;
  average: number;
  max: number;
  /** How many pre-existing nodes moved at all (beyond a 0.5px epsilon). */
  moved: number;
  /** Of the pre-existing nodes, how many stayed exactly put. */
  unmoved: number;
  /** Did we stay inside the caller's budget? */
  withinBudget: boolean;
  /** How much of the movement the centroid re-alignment removed. */
  savedByAlignment: number;
}

export type Positions = Map<string, { x: number; y: number }>;

/**
 * The translation that minimises total squared displacement between two layouts.
 *
 * For a pure translation the optimum is exactly the difference of the centroids of
 * the shared nodes — no search, no iteration. This is the single highest-value
 * function in the file: a layered layout is defined only up to translation, so a
 * new node widening rank 0 can shift the ENTIRE drawing sideways. Every node then
 * "moves" although the picture is unchanged, the movement budget blows, and a
 * naive implementation starts fighting its own layout with constraints. Align
 * first; constrain only what is left.
 */
export function alignToPrevious(next: Positions, previous: Positions): { positions: Positions; shift: { x: number; y: number } } {
  const shared = [...next.keys()].filter((id) => previous.has(id));
  if (shared.length === 0) return { positions: next, shift: { x: 0, y: 0 } };

  let dx = 0;
  let dy = 0;
  for (const id of shared) {
    dx += previous.get(id)!.x - next.get(id)!.x;
    dy += previous.get(id)!.y - next.get(id)!.y;
  }
  dx /= shared.length;
  dy /= shared.length;

  const positions: Positions = new Map();
  for (const [id, p] of next) positions.set(id, { x: p.x + dx, y: p.y + dy });
  return { positions, shift: { x: dx, y: dy } };
}

/** Straight-line distance between two positions. */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Measure how much the mental map was disturbed.
 *
 * Only nodes that existed BEFORE count: a new node cannot "move", and including it
 * would flatter the numbers exactly when the layout is at its most disruptive.
 */
export function measureMovement(
  before: Positions,
  after: Positions,
  budget: MovementBudget | undefined,
  savedByAlignment = 0
): MovementReport {
  const existing = [...before.keys()].filter((id) => after.has(id));
  const distances = existing.map((id) => dist(before.get(id)!, after.get(id)!));

  const total = distances.reduce((s, d) => s + d, 0);
  const average = distances.length ? total / distances.length : 0;
  const max = distances.length ? Math.max(...distances) : 0;
  const moved = distances.filter((d) => d > 0.5).length;

  const withinBudget =
    (budget?.maxPerNode === undefined || max <= budget.maxPerNode) &&
    (budget?.averagePerNode === undefined || average <= budget.averagePerNode);

  return {
    total,
    average,
    max,
    moved,
    unmoved: distances.length - moved,
    withinBudget,
    savedByAlignment,
  };
}

/**
 * The nodes allowed to move: the changed set grown by `radius` hops.
 *
 * Everything outside becomes a Card-5 anchor. This is what "re-run layout only in
 * the affected region" means concretely — and it is only possible because anchors
 * are now real: the layout works AROUND the frozen nodes instead of laying out over
 * them and being corrected afterwards.
 */
export function affectedRegion(
  diagram: DiagramModel,
  changed: string[],
  radius: number
): Set<string> {
  const region = new Set(changed);
  if (radius <= 0) return region;

  // adjacency over the whole graph
  const adj = new Map<string, string[]>();
  for (const link of diagram.getLinks()) {
    const s = link.sourceNodeId ?? diagram.getNodeByPortId?.(link.sourcePortId)?.id;
    const t = link.targetNodeId ?? diagram.getNodeByPortId?.(link.targetPortId)?.id;
    if (!s || !t) continue;
    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    adj.get(s)!.push(t);
    adj.get(t)!.push(s);
  }

  let frontier = [...changed];
  for (let hop = 0; hop < radius; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!region.has(n)) {
          region.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return region;
}

/**
 * Turn a strategy into Card-5 semantic constraints.
 *
 * Note what this does NOT do: it does not emit positions to be clamped afterwards.
 * It emits ANCHORS, which the layered engine honours during coordinate assignment —
 * the whole reason the four scaffolded strategies never worked.
 */
export function constraintsForStrategy(
  diagram: DiagramModel,
  before: Positions,
  options: IncrementalOptions
): SemanticConstraints {
  const strategy = options.strategy ?? 'region';
  const changed = options.changed ?? [];

  const anchors: Record<string, { x?: number; y?: number }> = {};

  if (strategy === 'minimal-shift') {
    // Nothing is anchored: the layout is free, and the mental map is preserved by
    // re-alignment plus the movement budget instead. (Anchoring everything and
    // ALSO asking for a good layout is how you get a bad layout that also moved.)
    return { anchors };
  }

  const mayMove =
    strategy === 'pin-existing'
      ? new Set(changed) // only the new/changed nodes may move
      : affectedRegion(diagram, changed, options.radius ?? 1);

  for (const node of diagram.getNodes()) {
    if (mayMove.has(node.id)) continue;
    const p = before.get(node.id);
    if (!p) continue; // a node with no previous position is new by definition
    // anchor at the node's CENTRE — sugiyama's anchors are centres, positions are
    // top-left (the model's convention). Getting this wrong shifts every frozen
    // node by half its size, which looks like "the anchors don't work".
    anchors[node.id] = { x: p.x + node.size.width / 2, y: p.y + node.size.height / 2 };
  }

  return { anchors };
}

/**
 * A tween plan: pure data, so the engine stays free of rAF/DOM/time.
 *
 * The card asks for "an animated tweened transition from old to new positions
 * instead of snapping". The engine's job is to say WHERE things go at time t; the
 * host's job is to drive t. Keeping it that way is what lets the same code run in
 * a worker, in SSR, and in a test.
 */
export interface TweenPlan {
  /** Positions at normalised time t ∈ [0, 1]. Eased. */
  at(t: number): Positions;
  /** Nodes that actually move — a host can skip the rest entirely. */
  movingIds: string[];
}

/** ease-in-out cubic: slow, fast, slow — the standard "this moved on purpose" curve. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function planTween(before: Positions, after: Positions): TweenPlan {
  const movingIds = [...after.keys()].filter((id) => {
    const b = before.get(id);
    return b !== undefined && dist(b, after.get(id)!) > 0.5;
  });

  return {
    movingIds,
    at(t: number): Positions {
      const clamped = Math.max(0, Math.min(1, t));
      const e = easeInOutCubic(clamped);
      const out: Positions = new Map();
      for (const [id, target] of after) {
        const start = before.get(id);
        if (!start) {
          // A NEW node does not slide in from a position it never had. It appears
          // where it belongs; the host can fade it in. Interpolating from (0,0)
          // would fly it across the diagram, which is precisely the disorientation
          // this card exists to prevent.
          out.set(id, { ...target });
          continue;
        }
        out.set(id, {
          x: start.x + (target.x - start.x) * e,
          y: start.y + (target.y - start.y) * e,
        });
      }
      return out;
    },
  };
}
