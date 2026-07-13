/**
 * MOTION-PREFERENCE styles — and, more to the point, the code that actually
 * INJECTS them.
 *
 * ## The dead-config bug this file exists to kill
 *
 * `libs/renderer/src/themes/reduced-motion.css` shipped 314 lines of careful
 * accessibility CSS — reduced-motion fallbacks, epilepsy-safety iteration
 * caps, performance/battery modes, a `.sr-only` recipe — and **nothing ever
 * imported it**. Not the renderer, not the Angular host, not a bundler entry.
 * It had never had any effect in production.
 *
 * Worse, it was load-bearing for a switch that DID run: `AnimationService`
 * toggles `body.reduced-motion` whenever reduced motion is on
 * (`animation.service.ts` → `updateAllAnimations`), and the ONLY rules for that
 * class lived in the orphaned file. So the JS-driven path — a host turning
 * reduced motion on from a settings toggle rather than the OS — suppressed
 * nothing at all. The `@media (prefers-reduced-motion: reduce)` blocks
 * elsewhere in the renderer only fire on the OS preference, so the product
 * appeared to honour the setting while ignoring the app's own control.
 *
 * The CSS now lives here as a string, and `ensureMotionPreferenceStyles()` is
 * called from `AnimationService.injectCSS()` — the same place the class is
 * toggled. Config and consumption are finally in the same file.
 *
 * Wave 6 (a11y card 7).
 */

import { getDocument } from '../platform/platform';

/** Id of the injected `<style>` element. Idempotent by construction. */
export const MOTION_PREFERENCE_STYLE_ID = 'grafloria-motion-preferences';

/**
 * Reduced motion, high contrast, performance/battery modes, epilepsy safety,
 * and the screen-reader-only recipe.
 *
 * Two routes to the same behaviour, deliberately:
 *   - `@media (prefers-reduced-motion: reduce)` — the OS preference;
 *   - `.reduced-motion` on `<body>` — the APP's own toggle, which is what
 *     `AnimationService` sets. Both must work; only the first used to.
 */
export const MOTION_PREFERENCE_CSS = `
/* ==========================================================================
   REDUCED MOTION — OS preference
   ========================================================================== */
@media (prefers-reduced-motion: reduce) {
  .link-animated-marching-ants,
  .link-animated-flow,
  .link-animated-pulse {
    animation: none !important;
    stroke-dasharray: none !important;
  }

  .node-border-gradient,
  .node-border-gradient::before,
  .node-border-pulse,
  .node-border-pulse-svg,
  .node-border-breathe,
  .node-border-shimmer,
  .node-border-shimmer::after {
    animation: none !important;
  }

  /* Status animations stop, but the STATIC indicator stays — a reduced-motion
     user must not lose the information the animation was carrying. */
  .node-status-running { animation: none !important; border-color: #3498db; box-shadow: 0 0 5px rgba(52, 152, 219, 0.5); }
  .node-status-running-svg { animation: none !important; stroke: #3498db; filter: drop-shadow(0 0 5px rgba(52, 152, 219, 0.5)); }
  .node-status-error { animation: none !important; border-color: #e74c3c; box-shadow: 0 0 5px rgba(231, 76, 60, 0.5); }
  .node-status-error-svg { animation: none !important; stroke: #e74c3c; filter: drop-shadow(0 0 5px rgba(231, 76, 60, 0.5)); }
  .node-status-completed { animation: none !important; border-color: #27ae60; opacity: 0.8; }
  .node-status-completed-svg { animation: none !important; stroke: #27ae60; opacity: 0.8; }
  .node-status-warning { animation: none !important; border-color: #f39c12; background-color: rgba(243, 156, 18, 0.1); }
  .node-status-warning-svg { animation: none !important; stroke: #f39c12; fill-opacity: 0.1; }
  .node-status-pending { animation: none !important; opacity: 0.85; }
  .node-status-pending-svg { animation: none !important; opacity: 0.85; }

  /* Interactive feedback stays, but effectively instant. */
  .diagram-node,
  .diagram-link {
    transition: opacity 0.05s ease, transform 0.05s ease;
  }

  .node-border-gradient::before { background-position: 0% center; }

  * { will-change: auto !important; }
}

/* ==========================================================================
   REDUCED MOTION — the APP's own toggle (AnimationService sets this class).
   These rules had no stylesheet at all before wave 6.
   ========================================================================== */
body.reduced-motion .diagram-node,
body.reduced-motion .diagram-link,
body.reduced-motion .link-animated-marching-ants,
body.reduced-motion .link-animated-flow,
body.reduced-motion .link-animated-pulse,
body.reduced-motion .node-border-gradient,
body.reduced-motion .node-border-gradient::before,
body.reduced-motion .node-border-pulse,
body.reduced-motion .node-border-pulse-svg,
body.reduced-motion .node-border-breathe,
body.reduced-motion .node-border-shimmer,
body.reduced-motion .node-border-shimmer::after,
body.reduced-motion .node-status-running,
body.reduced-motion .node-status-running-svg,
body.reduced-motion .node-status-error,
body.reduced-motion .node-status-error-svg,
body.reduced-motion .node-status-completed,
body.reduced-motion .node-status-completed-svg,
body.reduced-motion .node-status-warning,
body.reduced-motion .node-status-warning-svg,
body.reduced-motion .node-status-pending,
body.reduced-motion .node-status-pending-svg {
  animation: none !important;
  transition: opacity 0.05s ease, transform 0.05s ease !important;
}

body.reduced-motion .link-animated-marching-ants,
body.reduced-motion .link-animated-flow,
body.reduced-motion .link-animated-pulse {
  stroke-dasharray: none !important;
}

body.reduced-motion .node-border-gradient::before {
  background-position: 0% center;
}

/* ==========================================================================
   HIGH CONTRAST
   ========================================================================== */
@media (prefers-contrast: high) {
  .node-border-gradient,
  .node-border-shimmer { animation: none !important; }

  .link-animated-marching-ants,
  .link-animated-flow { animation-duration: 2s !important; }

  .node-status-running,
  .node-status-error,
  .node-status-warning { border-width: 3px; }
}

/* ==========================================================================
   PERFORMANCE / BATTERY MODES (also AnimationService body classes)
   ========================================================================== */
body.performance-mode .link-animated-marching-ants,
body.performance-mode .link-animated-flow { animation-duration: 2s !important; }

body.performance-mode .node-border-gradient,
body.performance-mode .node-border-shimmer,
body.performance-mode .node-border-pulse-svg { animation: none !important; }

body.performance-mode .node-border-breathe { animation-duration: 5s !important; }

body.battery-saving .link-animated-marching-ants,
body.battery-saving .link-animated-flow,
body.battery-saving .link-animated-pulse,
body.battery-saving .node-border-gradient,
body.battery-saving .node-border-shimmer,
body.battery-saving .node-border-pulse,
body.battery-saving .node-border-breathe { animation: none !important; }

body.battery-saving .node-status-running,
body.battery-saving .node-status-error { animation-duration: 3s !important; }

/* ==========================================================================
   EPILEPSY SAFETY — WCAG 2.3.1 (Three Flashes or Below Threshold)
   ========================================================================== */
.node-status-error { animation-iteration-count: 1; }
.node-status-warning { animation-iteration-count: 3; }

.link-animated-pulse,
.node-status-running,
.node-status-pending { animation-duration: 1.5s; }

body.animations-paused * { animation-play-state: paused !important; }

/* ==========================================================================
   SCREEN-READER-ONLY
   ========================================================================== */
.grafloria-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
}
`;

/**
 * Inject the motion-preference stylesheet once per document.
 *
 * Idempotent and SSR-safe: no document → no-op, and a second call finds the
 * existing element by id and returns it.
 */
export function ensureMotionPreferenceStyles(doc?: Document): HTMLStyleElement | undefined {
  const target = doc ?? getDocument();
  if (!target) return undefined;

  const existing = target.getElementById(MOTION_PREFERENCE_STYLE_ID);
  if (existing) return existing as HTMLStyleElement;

  const style = target.createElement('style');
  style.id = MOTION_PREFERENCE_STYLE_ID;
  style.textContent = MOTION_PREFERENCE_CSS;
  (target.head ?? target.documentElement).appendChild(style);
  return style;
}

/** Remove the injected stylesheet (teardown / tests). */
export function removeMotionPreferenceStyles(doc?: Document): void {
  const target = doc ?? getDocument();
  target?.getElementById(MOTION_PREFERENCE_STYLE_ID)?.remove();
}
