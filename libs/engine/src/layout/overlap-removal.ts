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
// post-pass — and it has a property that matters more here: for a layout that
// does NOT overlap (dagre, ELK, tree, grid, circular, radial) it is a provable
// NO-OP, so it can sit in front of every layout in the engine without moving a
// single well-behaved pixel.

import type { NodeModel } from '../models/NodeModel';
import { nodeSize } from './component-packing';

export interface OverlapRemovalOptions {
  /** Gap to open up between two boxes that were overlapping. */
  spacing?: number;
  /** Safety valve. Each pass strictly reduces overlap; 20 is plenty in practice. */
  maxIterations?: number;
}

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Push overlapping nodes apart, in place, and return the corrected positions.
 *
 * Deterministic: boxes are swept in (x, id) order and each overlapping pair is
 * separated along its MINIMUM translation axis, so the result depends only on the
 * input positions — never on iteration order of a map.
 *
 * Returns the same Map instance for convenience.
 */
export function removeOverlaps(
  nodes: readonly NodeModel[],
  positions: Map<string, { x: number; y: number }>,
  options: OverlapRemovalOptions = {}
): Map<string, { x: number; y: number }> {
  const spacing = options.spacing ?? 20;
  const maxIterations = options.maxIterations ?? 20;

  const boxes: Box[] = [];
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p) continue;
    const size = nodeSize(node);
    boxes.push({ id: node.id, x: p.x, y: p.y, width: size.width, height: size.height });
  }
  if (boxes.length < 2) return positions;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Sweep line: sort by left edge, and only compare a box against the ones whose
    // left edge is still inside its right edge. Turns the O(n²) all-pairs scan into
    // something near-linear for the sparse case, which is every real diagram.
    boxes.sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    let moved = false;

    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        if (b.x >= a.x + a.width) break; // sorted by x ⇒ nothing further can overlap a

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;

        // Separate along the cheaper axis — the minimum translation vector. Moving
        // along the deeper axis instead is what makes naive overlap removal explode
        // a layout across the canvas.
        if (overlapX < overlapY) {
          const push = (overlapX + spacing) / 2;
          // Ties (identical x) break on id, so the pair never oscillates.
          const aFirst = a.x < b.x || (a.x === b.x && a.id < b.id);
          a.x += aFirst ? -push : push;
          b.x += aFirst ? push : -push;
        } else {
          const push = (overlapY + spacing) / 2;
          const aFirst = a.y < b.y || (a.y === b.y && a.id < b.id);
          a.y += aFirst ? -push : push;
          b.y += aFirst ? push : -push;
        }
      }
    }

    if (!moved) break; // THE NO-OP: a non-overlapping layout exits on pass 1 untouched
  }

  for (const box of boxes) {
    positions.set(box.id, { x: box.x, y: box.y });
  }

  return positions;
}
