// Wave 8 — Card 5: WHEN to hand off between the SVG and Canvas tiers.
//
// The Canvas backend has existed since wave 4: it paints the same VNode tree, picks in
// O(1) off a colour-keyed hit canvas, and its hit-testing is proven against the SVG
// oracle over 10,826 probe points. What it never had was anything that SWITCHED it. A
// backend you have to reach in and toggle by hand is a demo, not a tier.
//
// This is the policy. Pure, so it can be argued with in a test rather than in a browser.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ASYMMETRY THAT MAKES THIS SAFE
//
// Stepping UP to SVG is always allowed. Stepping DOWN to canvas is what needs guards —
// because canvas mode is not merely a different way of drawing the same diagram, it is a
// STRICTLY LESSER surface:
//
//   - It has no accessibility story at all. The wave-6 a11y work (roles, accessible
//     names, the roving tabindex, the AT-navigable outline) is emitted as props on the
//     VNode tree and REALISED as SVG DOM. The canvas painter draws the same tree and
//     throws every one of those props away. A screen reader handed a <canvas> gets a
//     blank graphic. Auto-switching an assistive-technology user to canvas to save them
//     40ms of DOM patching is not an optimisation, it is taking their diagram away.
//
//   - It cannot rasterise DOM (`supportsForeignObject: false`). An HTML node silently
//     stops being drawn.
//
//   - Swapping the element out drops `document.activeElement` to <body>, destroying a
//     keyboard user's position mid-navigation.
//
// So: canvas is opt-in-able, guarded, and always yields to any of those three signals.
// Slow and correct beats fast and inaccessible, and the guards below are not advisory.

import type { BackendMode } from './render-backend';

export interface TierPolicy {
  /** Step DOWN to canvas at or above this many visible elements. */
  canvasAboveElements: number;
  /** Step back UP to SVG at or below this many. Strictly less than the above: hysteresis. */
  svgBelowElements: number;
  /** Step DOWN to canvas at or below this zoom (the far/low-LOD tier). */
  canvasBelowZoom: number;
  /** Step back UP to SVG at or above this zoom (the near/interactive tier). */
  svgAboveZoom: number;
  /** Never hand an assistive-technology user a canvas. Default true, and it means it. */
  respectAccessibility: boolean;
}

export const DEFAULT_TIER_POLICY: TierPolicy = {
  // A DOM patch of ~2k elements is where SVG starts to cost more than a canvas repaint
  // on the machines we measured. The gap between the two element thresholds is the
  // hysteresis band: without it, a diagram parked exactly on the boundary rebuilds its
  // entire backend every frame, which is far worse than either tier.
  canvasAboveElements: 2000,
  svgBelowElements: 1500,
  canvasBelowZoom: 0.35,
  svgAboveZoom: 0.5,
  respectAccessibility: true,
};

export type TierReason =
  /** Held on SVG: an assistive-technology surface is live. Outranks every perf signal. */
  | 'a11y-pinned'
  /** Held on SVG: focus is inside the diagram; swapping the element would drop it. */
  | 'focus-inside'
  /** Held on SVG: the scene has foreignObject/HTML nodes, which canvas cannot paint. */
  | 'foreign-object'
  /** Held wherever the host pinned it. */
  | 'pinned'
  /** Stepped down: too many elements for the DOM. */
  | 'element-count'
  /** Stepped down: zoomed out past the interactive tier. */
  | 'zoom'
  /** Stepped up: back inside the near/interactive tier. */
  | 'interactive'
  /** Nothing to do. */
  | 'unchanged';

export interface TierInput {
  current: BackendMode;
  /** Visible elements (nodes + links) — the thing the CONSUMER's cost scales with. */
  elements: number;
  zoom: number;
  /** An outline/live-region/AT surface is mounted for this diagram. */
  a11yEngaged: boolean;
  /** DOM focus is inside the diagram right now. */
  focusInside: boolean;
  /** The visible scene contains nodes canvas cannot paint (foreignObject/HTML). */
  hasForeignObject: boolean;
  /** A hard host override. */
  pinned: BackendMode | null;
  policy: TierPolicy;
}

export interface TierDecision {
  mode: BackendMode;
  reason: TierReason;
  /** True when `mode` differs from `current`. */
  changed: boolean;
}

/**
 * The tier this frame should be drawn in.
 *
 * Guards first, thresholds second — and every guard can only ever push TOWARDS svg.
 */
export function decideTier(input: TierInput): TierDecision {
  const { current, policy } = input;
  const settle = (mode: BackendMode, reason: TierReason): TierDecision => ({
    mode,
    reason: mode === current ? (reason === 'unchanged' ? 'unchanged' : reason) : reason,
    changed: mode !== current,
  });

  // A host that pinned the tier means it. Nothing below overrules it — including the
  // a11y guard: a host that explicitly pins canvas has taken that decision knowingly,
  // and silently ignoring it would be its own kind of lie.
  if (input.pinned) return settle(input.pinned, 'pinned');

  // ---- the guards. Each one can only hold us on (or return us to) SVG. --------

  // An AT user must never be silently moved onto a surface with no semantics.
  if (policy.respectAccessibility && input.a11yEngaged) return settle('svg', 'a11y-pinned');

  // Swapping the rendered element out from under a focused keyboard user drops
  // document.activeElement to <body>. Never do that mid-navigation. (Returning UP to
  // SVG is still allowed — that direction only ever restores focusable DOM.)
  if (input.focusInside && current === 'svg') return settle('svg', 'focus-inside');

  // Canvas cannot rasterise DOM. Stepping down would make HTML nodes vanish.
  if (input.hasForeignObject) return settle('svg', 'foreign-object');

  // ---- thresholds, with a hysteresis band so the boundary cannot thrash --------

  if (current === 'svg') {
    if (input.elements >= policy.canvasAboveElements) return settle('canvas', 'element-count');
    if (input.zoom <= policy.canvasBelowZoom) return settle('canvas', 'zoom');
    return settle('svg', 'unchanged');
  }

  // current === 'canvas': come back up only once BOTH signals are comfortably inside the
  // interactive tier. Either one alone would let a diagram oscillate.
  if (input.elements <= policy.svgBelowElements && input.zoom >= policy.svgAboveZoom) {
    return settle('svg', 'interactive');
  }
  return settle('canvas', 'unchanged');
}

/** Fill in whatever the host left out. */
export function resolveTierPolicy(partial?: Partial<TierPolicy>): TierPolicy {
  const policy = { ...DEFAULT_TIER_POLICY, ...partial };

  // A hysteresis band that is inverted (or zero-width) is not hysteresis — it is a
  // config that thrashes. Refuse it loudly rather than oscillate quietly.
  if (policy.svgBelowElements >= policy.canvasAboveElements) {
    throw new Error(
      `[grafloria] tier policy: svgBelowElements (${policy.svgBelowElements}) must be < ` +
        `canvasAboveElements (${policy.canvasAboveElements}) — otherwise the boundary thrashes.`
    );
  }
  if (policy.svgAboveZoom <= policy.canvasBelowZoom) {
    throw new Error(
      `[grafloria] tier policy: svgAboveZoom (${policy.svgAboveZoom}) must be > ` +
        `canvasBelowZoom (${policy.canvasBelowZoom}) — otherwise the boundary thrashes.`
    );
  }
  return policy;
}
