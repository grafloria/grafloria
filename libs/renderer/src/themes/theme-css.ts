// The renderer's stylesheet, split into the two things it actually is:
//
//   1. SHARED RULES  — theme-INDEPENDENT, written entirely in `var(--grafloria-*)`.
//      Injected ONCE per document, no matter how many diagrams are on the page.
//      Every selector is scoped under `[data-grafloria-instance]`, so the rules only
//      ever reach elements inside a Grafloria diagram.
//
//   2. INSTANCE VARIABLE BLOCK — one tiny `[data-grafloria-instance="grafloria-3"] { … }`
//      per renderer, carrying THAT renderer's theme values.
//
// This is what makes two diagrams with different themes coexist: the rules are
// identical for both, and the values are inherited from each diagram's own root.
// (Before: `.diagram-node { fill: #fff }` was emitted GLOBALLY, keyed by theme
// name, so the last stylesheet injected repainted every diagram on the page.)
//
// Specificity is preserved from the pre-scoping stylesheet because EVERY rule
// gains exactly the same `[data-grafloria-instance]` prefix:
//   `[…] .diagram-node`          (0,2,0)
//   `[…] .diagram-node.selected` (0,3,0)  → state still beats base, as before.
// The state rules are authored in ASCENDING precedence order (error → disabled →
// hovered → highlighted → selected) so that, at equal specificity, source order
// reproduces exactly the precedence `style-cascade.ts` resolves programmatically.

import type { Theme } from '../types/theme.types';
import { GRAFLORIA_INSTANCE_ATTR, THEME_TOKENS, THEME_VARS, themeVar, themeVarValue } from './theme-vars';
import { resolveBindableVars } from './theme-ref';

/** A single CSS rule in the shared stylesheet. */
export interface StyleRule {
  /** Selector WITHOUT the instance scope (added by {@link generateBaseStyleSheet}). */
  selector: string;
  /** Declarations, in CSS property form (`stroke-width`, not `strokeWidth`). */
  decls: Record<string, string>;
}

/**
 * Every themed rule the renderer ships, in cascade order.
 *
 * INVARIANT (pinned by svg-renderer.scoped-theme.spec): no rule here may carry a
 * theme literal — every painted value resolves through `var(--grafloria-*)`, and
 * every referenced variable is declared in {@link THEME_VARS}. `fill: none` on
 * links is structural (a link is a stroke, never a fill), not a theme value.
 */
export const BASE_STYLE_RULES: readonly StyleRule[] = [
  // ---- Nodes: base, then states in ASCENDING precedence ------------------
  {
    selector: '.diagram-node',
    decls: {
      fill: themeVar('node.fill'),
      stroke: themeVar('node.stroke'),
      'stroke-width': themeVar('node.strokeWidth'),
    },
  },
  {
    selector: '.diagram-node.error',
    decls: { fill: themeVar('node.error.fill'), stroke: themeVar('node.error.stroke') },
  },
  {
    selector: '.diagram-node.disabled',
    decls: {
      fill: themeVar('node.disabled.fill'),
      stroke: themeVar('node.disabled.stroke'),
      opacity: themeVar('node.disabled.opacity'),
    },
  },
  {
    selector: '.diagram-node.hovered',
    decls: { fill: themeVar('node.hovered.fill'), stroke: themeVar('node.hovered.stroke') },
  },
  // Authored BEFORE `.selected` so that, at equal specificity, selection wins
  // when a node is both highlighted and selected.
  {
    selector: '.diagram-node.highlighted',
    decls: {
      fill: themeVar('node.highlighted.fill'),
      stroke: themeVar('node.highlighted.stroke'),
      'stroke-width': themeVar('node.highlighted.strokeWidth'),
    },
  },
  {
    selector: '.diagram-node.selected',
    decls: {
      fill: themeVar('node.selected.fill'),
      stroke: themeVar('node.selected.stroke'),
      'stroke-width': themeVar('node.selected.strokeWidth'),
    },
  },

  // ---- Links -------------------------------------------------------------
  {
    selector: '.diagram-link',
    decls: {
      stroke: themeVar('link.stroke'),
      'stroke-width': themeVar('link.strokeWidth'),
      fill: 'none',
    },
  },
  {
    selector: '.diagram-link.hovered',
    decls: { stroke: themeVar('link.hovered.stroke') },
  },
  {
    selector: '.diagram-link.highlighted',
    decls: {
      stroke: themeVar('link.highlighted.stroke'),
      'stroke-width': themeVar('link.highlighted.strokeWidth'),
    },
  },
  {
    selector: '.diagram-link.selected',
    decls: {
      stroke: themeVar('link.selected.stroke'),
      'stroke-width': themeVar('link.selected.strokeWidth'),
    },
  },

  // ---- Labels ------------------------------------------------------------
  {
    selector: '.diagram-label',
    decls: {
      'font-family': themeVar('label.fontFamily'),
      'font-size': themeVar('label.fontSize'),
      fill: themeVar('label.color'),
    },
  },

  // ---- Ports -------------------------------------------------------------
  {
    selector: '.port-input',
    decls: {
      fill: themeVar('port.fill'),
      stroke: themeVar('port.input'),
      'stroke-width': themeVar('port.strokeWidth'),
    },
  },
  {
    selector: '.port-output',
    decls: {
      fill: themeVar('port.fill'),
      stroke: themeVar('port.output'),
      'stroke-width': themeVar('port.strokeWidth'),
    },
  },
  {
    selector: '.port-bi',
    decls: {
      fill: themeVar('port.fill'),
      stroke: themeVar('port.bi'),
      'stroke-width': themeVar('port.strokeWidth'),
    },
  },
  {
    selector: '.port-hovered',
    decls: { 'stroke-width': themeVar('port.emphasis.strokeWidth'), cursor: 'pointer' },
  },
  {
    selector: '.port-highlighted',
    decls: {
      'stroke-width': themeVar('port.emphasis.strokeWidth'),
      opacity: themeVar('port.emphasis.opacity'),
    },
  },
  { selector: '.port-input.port-highlighted', decls: { fill: themeVar('port.input') } },
  { selector: '.port-output.port-highlighted', decls: { fill: themeVar('port.output') } },
  { selector: '.port-bi.port-highlighted', decls: { fill: themeVar('port.bi') } },
];

/**
 * Structural rules: cursors, transitions, hit-target sizes. No theme values, so
 * they are emitted verbatim (and unscoped, exactly as before) — `@keyframes`
 * cannot be scoped anyway.
 */
const STATIC_CSS = `
/* The diagram root is keyboard-focusable (tabindex=0, the a11y entry point),
   and every node/link group carries tabindex=-1 for programmatic keyboard
   navigation — which ALSO makes them mouse-focusable, so a click on a link's
   hit area drew the UA focus ring as "a rectangle around the line" (two live
   reports: the canvas-wide one, then the per-link one). Keep the ring for
   keyboard focus (:focus-visible — the a11y harness asserts it); suppress it
   for pointer focus only, on the root and on every focusable part inside. */
svg.grafloria-diagram:focus:not(:focus-visible),
svg.grafloria-diagram :focus:not(:focus-visible) {
  outline: none;
}

/* Link Path - Disable transitions for performance and visual correctness */
.link-group path {
  transition: none !important;
}

/* Diagram text is a LABEL, not copy: without this, any drag that sweeps
   across a node leaves its <text> browser-selected and painted with the blue
   selection highlight (live audit: "a…", "Ingest" left highlighted after
   pans). Selection stays possible in in-place editors, which are real
   inputs, not SVG text. */
svg.grafloria-diagram text {
  user-select: none;
  -webkit-user-select: none;
}

/* Phase 2: Port Styles
   NEVER \`transition: all\` on anything whose geometry tracks the pointer —
   \`all\` sweeps up cx/cy/transform and the element eases 200ms behind the
   cursor (the wave15d node-drag lag; then the SAME bug on waypoint handles:
   "the point is running after the line", live report). Paint-only lists. */
.port {
  transition: fill 0.2s ease, stroke 0.2s ease, opacity 0.2s ease, r 0.15s ease;
  cursor: crosshair;
}

/* Phase 2: Connection Preview Styles */
.connection-preview-line {
  pointer-events: none;
  transition: stroke 0.2s ease;
}

@keyframes dash {
  to {
    stroke-dashoffset: -10;
  }
}

/* Phase 2: Connection Target Highlight — geometry re-anchors between nodes
   while dragging a connection; easing it smears the highlight across the gap. */
.connection-target-highlight {
  transition: opacity 0.2s ease, stroke 0.2s ease, fill 0.2s ease;
  pointer-events: none;
}

/* Phase 2: Link Endpoint Handles — dragged directly (reconnect). */
.link-endpoint-handle {
  cursor: move;
  transition: fill 0.2s ease, stroke 0.2s ease, stroke-width 0.15s ease, r 0.15s ease;
}

.link-endpoint-handle:hover {
  r: 8;
  stroke-width: 3px;
}

/* Phase 2.3a: Waypoint Handles — dragged directly; cx/cy must NEVER ease
   (the VNode side already knew: "No transition - causes flickering during
   drag" — but this stylesheet rule was easing the handle anyway). */
.waypoint-handle {
  cursor: move;
  transition: fill 0.2s ease, stroke 0.2s ease, stroke-width 0.15s ease, r 0.15s ease;
  pointer-events: all;
}

.waypoint-handle:hover {
  r: 7;
  stroke-width: 3px;
}

/* Phase 2.3b: Control Point Handles — dragged directly, same rule. */
.control-point-handle {
  cursor: move;
  transition: fill 0.2s ease, stroke 0.2s ease, stroke-width 0.15s ease, r 0.15s ease;
  pointer-events: all;
}

.control-point-handle:hover {
  r: 8;
  stroke-width: 3px;
}

.control-line {
  pointer-events: none;
  transition: opacity 0.2s ease;
}
`.trim();

/** `[data-grafloria-instance="grafloria-3"]` — selects one diagram's root (and scoped hosts). */
export function instanceScopeSelector(instanceId: string): string {
  return `[${GRAFLORIA_INSTANCE_ATTR}="${instanceId}"]`;
}

/** Serialize one rule with the given scope prefix. */
function renderRule(rule: StyleRule, scope: string): string {
  const body = Object.entries(rule.decls)
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n');
  return `${scope} ${rule.selector} {\n${body}\n}`;
}

/**
 * The shared, theme-INDEPENDENT stylesheet. Identical for every renderer on the
 * page, so it is injected once and deduped by element id.
 */
export function generateBaseStyleSheet(): string {
  const scope = `[${GRAFLORIA_INSTANCE_ATTR}]`;
  const rules = BASE_STYLE_RULES.map(rule => renderRule(rule, scope)).join('\n\n');
  return `/* Grafloria Renderer — shared rules (values come from each instance's --grafloria-* variables) */\n\n${rules}\n\n${STATIC_CSS}`;
}

/**
 * One renderer's variable block: the ONLY place a theme's values are written.
 * Scoped to that renderer's root, so a second diagram with a different theme
 * cannot be repainted by it.
 */
export function generateInstanceVarBlock(theme: Theme, instanceId: string): string {
  // TWO groups of variables, one block:
  //
  //   CHROME    the 33 tokens the shared stylesheet above paints (`--grafloria-node-fill`).
  //   BINDABLE  every other value in the theme, flattened by path
  //             (`--grafloria-colors-primary`, `--grafloria-category-critical`,
  //             `--grafloria-numbers-emphasis`) — see theme-ref.ts.
  //
  // The bindable half is what makes a theme-bound property (`themeRef(...)`)
  // live-rebindable: because the value it points at is a variable on this root,
  // rewriting this block re-colours every bound element WITHOUT rebuilding a
  // single VNode. That is the mechanism behind the colorMode hot-swap.
  const chrome = THEME_TOKENS.map(
    token => `  ${THEME_VARS[token].cssVar}: ${themeVarValue(token, theme)};`
  );
  const bindable = Object.entries(resolveBindableVars(theme)).map(
    ([cssVar, value]) => `  ${cssVar}: ${value};`
  );

  return `/* Grafloria Renderer Theme: ${theme.name} (instance ${instanceId}) */\n${instanceScopeSelector(
    instanceId
  )} {\n${[...chrome, ...bindable].join('\n')}\n}`;
}
