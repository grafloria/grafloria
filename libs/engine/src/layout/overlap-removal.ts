// Wave 7 (Auto-layout) — Card 2: overlap removal.
//
// ---------------------------------------------------------------------------
// THE BUG THIS CLOSES (found by Card 2's own packing test)
// ---------------------------------------------------------------------------
//
// The force and community adapters lay out nodes as DIMENSIONLESS POINTS. Every
// force in `force-layout-adapter.ts` — repulsion, attraction, gravity — is
// computed from centre-to-centre distance with `mass: 1`, and nothing anywhere
// consults `node.size`. So a four-node star with the default `linkDistance: 100`
// puts four 150x50 boxes 100px apart centre-to-centre and they SIT ON TOP OF EACH
// OTHER. The layout is "correct" as physics and useless as a diagram.
//
// It is the same class of failure as the forest-becomes-a-pile bug that packing
// fixes, one level down: packing stops COMPONENTS colliding, this stops NODES
// colliding. Neither is optional, and neither belongs in five separate algorithms.
//
// The proper fix inside the simulation is size-aware repulsion (repel by box
// distance, not centre distance). That would change force's coordinates for every
// existing caller and is a card of its own. This is the standard alternative — a
// post-pass — and it has the property that matters here: for a layout that does
// NOT overlap (dagre, ELK, tree, grid, circular, radial) it is a provable NO-OP,
// so it can sit in front of every layout in the engine without moving a single
// well-behaved pixel.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SWEEP, AND NOT THE OBVIOUS PAIRWISE RELAXATION
// ---------------------------------------------------------------------------
//
// The obvious implementation — and the one this shipped with for an hour — is:
// repeat N times { for every overlapping pair, push both apart along the minimum
// translation vector }. It passes a four-node unit test beautifully and it DOES
// NOT WORK.
//
// Measured, on 200 nodes:
//
//     200-node pile,   20 iterations -> 2352 overlaps remaining
//     200-node pile,  100 iterations -> 1012 overlaps remaining
//     200-node pile, 2000 iterations ->  161 overlaps remaining  (16.6 SECONDS)
//     realistic 200-node soup, default -> 140 overlaps remaining
//
// It does not converge. Every push into free space shoves a node into a
// neighbour, and the whole field diffuses instead of separating. Worse, it is
// O(n² · iterations), so the "just raise the cap" reflex buys 16 seconds of CPU
// and still leaves overlaps. A guarantee that silently fails on the second-
// simplest input is worse than no guarantee at all.
//
// What ships instead is an EXACT one-pass horizontal separation, and it rests on
// one observation: two boxes overlap only if they overlap on BOTH axes. So it is
// enough to make every y-overlapping pair disjoint in x — then nothing overlaps,
// by definition, and no second pass is needed.
//
// Sweep the boxes left to right; push each one right until it clears everything
// already placed. Each push moves a box strictly past some already-placed box's
// right edge, so it terminates; and a box that overlaps nothing never moves, so a
// well-behaved layout (dagre, ELK, tree, grid, circular, radial) is untouched.

import type { NodeModel } from '../models/NodeModel';
import { nodeSize } from './component-packing';

export interface OverlapRemovalOptions {
  /** Gap to open up between two boxes that were overlapping. */
  spacing?: number;
}

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True overlap — not "within spacing of". Keeps the pass a no-op for tidy layouts. */
const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Separate overlapping nodes, in place, and return the corrected positions.
 *
 * Deterministic: boxes are swept in (x, id) order, so the result is a pure
 * function of the input positions — never of a map's iteration order.
 *
 * Returns the same Map instance for convenience.
 */
export function removeOverlaps(
  nodes: readonly NodeModel[],
  positions: Map<string, { x: number; y: number }>,
  options: OverlapRemovalOptions = {}
): Map<string, { x: number; y: number }> {
  const spacing = options.spacing ?? 20;

  const boxes: Box[] = [];
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p) continue;
    const size = nodeSize(node);
    boxes.push({ id: node.id, x: p.x, y: p.y, width: size.width, height: size.height });
  }
  if (boxes.length < 2) return positions;

  boxes.sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // `active` holds the boxes a future box could still run into. Without it this is
  // O(n²) even when NOTHING overlaps — every box would scan every earlier box —
  // and a 60,000-node diagram would spend billions of comparisons proving there
  // was nothing to do.
  const active: Box[] = [];

  for (const box of boxes) {
    // The frontier is the box's ORIGINAL left edge, which is monotonic in sort
    // order. Pruning against the box's PUSHED position would be wrong: the next
    // box may sit further left than this one ended up, and would then be compared
    // against an active list that had already discarded its real neighbours.
    const frontier = box.x;
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].x + active[i].width + spacing <= frontier) {
        active.splice(i, 1);
      }
    }

    // Push right until it clears everything still active. Each push clears at
    // least one box's right edge and x only ever increases, so this terminates in
    // at most `active.length` steps.
    for (let guard = 0; guard <= active.length; guard++) {
      const hit = active.find((other) => intersects(box, other));
      if (!hit) break; // THE NO-OP: a box that overlaps nothing never moves
      box.x = hit.x + hit.width + spacing;
    }

    active.push(box);
  }

  for (const box of boxes) {
    positions.set(box.id, { x: box.x, y: box.y });
  }

  return positions;
}
