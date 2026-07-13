// Wave 8 — Card 5: what it is safe to LOSE by drawing on a canvas.
//
// ─────────────────────────────────────────────────────────────────────────────
// CARD 5 AS WRITTEN IS OBSOLETE, AND THE MEASUREMENT SAYS SO TWICE.
//
// The card asked for an automatic far-zoom canvas tier: step down to canvas at high
// element counts / low zoom, hand back to SVG for the near tier. It existed to rescue a
// zoom-out frame that cost 63 SECONDS at 10k nodes.
//
//   1. That cliff is gone. wave8/routing (obstacle index + route memo) and wave8/culling
//      (LOD gates that skip A* below zoom 0.5) took zoom-out at 10k from 63,234ms to
//      118ms — cheaper than a pan. There is no longer a frame for canvas to rescue.
//
//   2. Even if there were, canvas would not rescue it. `node libs/renderer/e2e/tier-run.mjs`
//      times the two CONSUMERS against the same VNode tree, with the router stripped out so
//      it cannot drown the signal:
//
//          vnodes    svg mount   svg repatch   canvas paint
//          23,730       44.5ms        13.7ms        121.8ms    <- SVG 8.9x FASTER
//
//      The patcher DIFFS: a steady frame costs a function of what CHANGED. The canvas
//      backend REPAINTS — the whole scene, every frame, and then a second time into the
//      colour-keyed hit canvas that buys its O(1) picking. Two full paints, always.
//
// So the automatic tier handoff was built, measured, and DELETED. What would have been the
// perf machinery (thresholds, hysteresis, a step-down loop) is gone; a mechanism that the
// numbers say should never fire is not a feature, it is a liability with a config option.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT SURVIVES, AND WHY IT IS NOT ABOUT PERFORMANCE
//
// The canvas backend still exists (wave 4) and `DiagramRenderBackend.setMode('canvas')`
// still works — a host may want canvas for reasons that have nothing to do with frame
// time: 1 canvas element instead of 40,000 DOM nodes is a real memory and GC argument.
//
// But that switch has shipped since wave 4 with NOTHING guarding it, and canvas is a
// strictly LESSER surface:
//
//   - It has NO accessibility story. The wave-6 a11y work — roles, accessible names, the
//     roving tabindex, the AT-navigable outline — is emitted as props on the VNode tree and
//     REALISED as SVG DOM. The canvas painter draws the same tree and throws every one of
//     those props away. A screen reader handed a <canvas> gets a blank graphic. Today,
//     setMode('canvas') will do that to a screen-reader user without a word.
//   - It cannot rasterise DOM (`supportsForeignObject: false`): an HTML node stops being
//     drawn at all.
//   - Swapping the element out drops `document.activeElement` to <body>, destroying a
//     keyboard user's position mid-navigation.
//
// That is a real bug in shipped code, and it is independent of whether anyone ever wanted
// an automatic tier. So THIS is what Card 5 leaves behind: not a perf switch, a safety
// check on the switch that was already there.

import type { BackendMode } from './render-backend';

/** Why canvas mode would take something away from this particular diagram, right now. */
export type CanvasHazard =
  /** An assistive-technology surface is live. Canvas has no semantics to give it. */
  | 'a11y-active'
  /** Focus is inside the diagram; swapping the element out would drop it to <body>. */
  | 'focus-inside'
  /** The scene has foreignObject/HTML nodes. Canvas cannot paint them — they vanish. */
  | 'foreign-object';

export interface CanvasSafety {
  /** True when nothing would be lost by drawing this diagram on a canvas. */
  safe: boolean;
  /** Everything that would be lost. Empty iff `safe`. */
  hazards: CanvasHazard[];
}

export interface CanvasSafetyInput {
  a11yActive: boolean;
  focusInside: boolean;
  hasForeignObject: boolean;
}

/**
 * What would canvas mode cost this diagram?
 *
 * Note the asymmetry, and that it is the whole design: this question is only ever asked
 * about stepping TO canvas. Going back to SVG can lose nothing — it only ever restores
 * focusable, labelled, HTML-capable DOM — so it is never guarded, never refused, and
 * always allowed.
 */
export function canvasSafety(input: CanvasSafetyInput): CanvasSafety {
  const hazards: CanvasHazard[] = [];
  if (input.a11yActive) hazards.push('a11y-active');
  if (input.focusInside) hazards.push('focus-inside');
  if (input.hasForeignObject) hazards.push('foreign-object');
  return { safe: hazards.length === 0, hazards };
}

/** A human-readable account of what a canvas switch would take away. */
export function explainHazards(hazards: readonly CanvasHazard[]): string {
  const reasons: Record<CanvasHazard, string> = {
    'a11y-active':
      'an assistive-technology surface is live for this diagram, and canvas mode has no ' +
      'accessible semantics at all (a screen reader would see a blank graphic)',
    'focus-inside':
      'focus is currently inside the diagram, and swapping the rendered element out would ' +
      'drop it to <body>, losing a keyboard user their place',
    'foreign-object':
      'the scene contains HTML/foreignObject nodes, which canvas cannot rasterise — they ' +
      'would silently stop being drawn',
  };
  return hazards.map((h) => reasons[h]).join('; ');
}

/** Modes it is always safe to be in. */
export const ALWAYS_SAFE_MODE: BackendMode = 'svg';
