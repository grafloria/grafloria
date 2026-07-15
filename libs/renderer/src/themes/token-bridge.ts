// Design-token bridge — point Grafloria's variables at the HOST's design system.
//
// Styling & theming, Card "design-token bridge + accessibility-aware theming".
//
// React Flow's differentiator is "your design system just applies" — but only
// because its nodes are React components you style with Tailwind/shadcn classes.
// Our nodes are SVG produced by a framework-agnostic engine, so we cannot inherit
// that trick. What we CAN do is better: because every value the renderer paints
// now resolves through `var(--grafloria-*)`, re-pointing those variables at the
// host's tokens re-skins the ENTIRE engine — in vanilla, in Angular, in any
// wrapper, without touching a node template.
//
//     renderer.setTokenBridge(shadcnBridge());
//     renderer.setTokenBridge({ 'node.fill': 'var(--my-card-bg)' });   // or by hand
//
// The bridge is emitted as a second variable block, scoped to the SAME instance
// and placed AFTER the theme's block, so it wins by source order at equal
// specificity. That ordering is the whole mechanism, and it is why the bridge and
// the accessibility media queries below share one `<style>` element: their
// relative order has to be guaranteed, not hoped for.
//
// CASCADE INSIDE THE VARIABLE BLOCK (later wins):
//   1. theme variables            (the active Theme)
//   2. token bridge               (the host's design system)
//   3. @media (prefers-contrast)  (the user wants more)
//   4. @media (forced-colors)     (the OS — always the last word)

import { THEME_VARS, type ThemeToken } from './theme-vars';
import { themeRefVar } from './theme-ref';
import { instanceScopeSelector } from './theme-css';

/**
 * A mapping from a Grafloria token to a CSS value in the HOST's vocabulary.
 *
 * The key is a theme token (`'node.fill'`, `'category.critical'`) — the same
 * grammar `themeRef()` uses, so there is one token namespace to learn. A raw
 * `--grafloria-*` custom property name is accepted too, for the odd variable a caller
 * wants to set directly.
 *
 * The value is CSS, verbatim: `var(--card)`, `hsl(var(--primary))`,
 * `oklch(var(--accent))`, or a plain `#hex`. It is NOT resolved by us — the
 * browser does it, which is exactly why a host token that changes (a theme
 * toggle in the host app!) also changes the diagram, live and for free.
 */
export type TokenBridge = Partial<Record<ThemeToken, string>> & Record<string, string>;

/** Token (or raw custom property) → the custom property it sets. */
function bridgeVarName(key: string): string {
  if (key.startsWith('--')) return key;
  return THEME_VARS[key as ThemeToken]?.cssVar ?? themeRefVar(key);
}

/** The bridge's CSS block for one instance, or `''` when there is nothing to map. */
export function generateTokenBridgeBlock(bridge: TokenBridge | undefined, instanceId: string): string {
  const entries = Object.entries(bridge ?? {}).filter(
    ([, value]) => typeof value === 'string' && value !== ''
  );
  if (entries.length === 0) return '';

  const decls = entries.map(([key, value]) => `  ${bridgeVarName(key)}: ${value};`).join('\n');
  return `/* Grafloria Renderer — design-token bridge (instance ${instanceId}) */\n${instanceScopeSelector(
    instanceId
  )} {\n${decls}\n}`;
}

// ---------------------------------------------------------------------------
// forced-colors — the OS gets the last word
// ---------------------------------------------------------------------------

/**
 * Under Windows High Contrast (and any `forced-colors: active` mode) the user has
 * declared that THEIR palette wins. The browser force-overrides most CSS colours
 * — but not the ones we paint through custom properties inside inline styles and
 * presentation attributes, which is most of the diagram. Left alone, a forced-
 * colors user gets our theme with the OS's background behind it: unreadable.
 *
 * So we rebind the variables themselves to CSS SYSTEM COLOURS. Because ALL chrome
 * resolves through these variables, one media block re-themes the whole engine —
 * the single clearest payoff of the CSS-variable architecture.
 *
 * `Canvas` / `CanvasText` / `Highlight` / `GrayText` / `LinkText` are the
 * system-colour keywords the OS maps to the user's chosen palette.
 */
const FORCED_COLOR_VARS: Partial<Record<ThemeToken, string>> = {
  'node.fill': 'Canvas',
  'node.stroke': 'CanvasText',
  'node.selected.fill': 'Canvas',
  'node.selected.stroke': 'Highlight',
  'node.highlighted.fill': 'Canvas',
  'node.highlighted.stroke': 'LinkText',
  'node.hovered.fill': 'Canvas',
  'node.hovered.stroke': 'Highlight',
  'node.disabled.fill': 'Canvas',
  'node.disabled.stroke': 'GrayText',
  // The OS palette carries no "error" colour; CanvasText keeps the shape legible
  // and the ERROR CLASS is still on the element for a host that wants more.
  'node.error.fill': 'Canvas',
  'node.error.stroke': 'CanvasText',

  'link.stroke': 'CanvasText',
  'link.selected.stroke': 'Highlight',
  'link.highlighted.stroke': 'LinkText',
  'link.hovered.stroke': 'Highlight',

  'label.color': 'CanvasText',

  'port.fill': 'Canvas',
  'port.input': 'CanvasText',
  'port.output': 'CanvasText',
  'port.bi': 'CanvasText',
};

/**
 * The `@media (forced-colors: active)` variable override for one instance.
 *
 * Emitted for every renderer, unconditionally: it costs one inert media block and
 * it is the FLOOR — it protects hosts that never supplied a high-contrast theme
 * and never touched `colorMode`. (The ColorModeController's high-contrast upgrade
 * is the ceiling: a better-looking, fully-checked theme when one exists.)
 *
 * `forced-color-adjust: none` is deliberately NOT set: we are opting IN to the
 * user's colours, not out of them.
 */
export function generateForcedColorsBlock(instanceId: string): string {
  const decls = Object.entries(FORCED_COLOR_VARS)
    .map(([token, value]) => `    ${THEME_VARS[token as ThemeToken].cssVar}: ${value};`)
    .join('\n');

  return [
    `/* Grafloria Renderer — forced-colors (the OS palette wins) */`,
    `@media (forced-colors: active) {`,
    `  ${instanceScopeSelector(instanceId)} {`,
    decls,
    `  }`,
    `}`,
  ].join('\n');
}

/**
 * `prefers-contrast: more`, in CSS.
 *
 * The ColorModeController swaps in a whole high-contrast THEME when the host gave
 * it one. This block is what a host that did NOT still gets: thicker strokes.
 * Weight is the half of contrast that colour cannot supply — a 1px hairline is
 * not an accessible border however dark it is — and it is the one thing we can
 * safely strengthen without knowing anything about the host's palette.
 */
export function generateContrastPreferenceBlock(instanceId: string): string {
  return [
    `/* Grafloria Renderer — prefers-contrast: more (weight, not colour) */`,
    `@media (prefers-contrast: more) {`,
    `  ${instanceScopeSelector(instanceId)} {`,
    `    ${THEME_VARS['node.strokeWidth'].cssVar}: 2px;`,
    `    ${THEME_VARS['node.selected.strokeWidth'].cssVar}: 4px;`,
    `    ${THEME_VARS['node.highlighted.strokeWidth'].cssVar}: 4px;`,
    `    ${THEME_VARS['link.strokeWidth'].cssVar}: 3px;`,
    `    ${THEME_VARS['link.selected.strokeWidth'].cssVar}: 5px;`,
    `    ${THEME_VARS['link.highlighted.strokeWidth'].cssVar}: 5px;`,
    `    ${THEME_VARS['port.strokeWidth'].cssVar}: 3px;`,
    `  }`,
    `}`,
  ].join('\n');
}

/**
 * Everything that must sit AFTER the theme's variable block, in cascade order.
 * One string, one `<style>` element, one guaranteed ordering.
 */
export function generateInstanceOverrideCSS(
  bridge: TokenBridge | undefined,
  instanceId: string
): string {
  return [
    generateTokenBridgeBlock(bridge, instanceId),
    generateContrastPreferenceBlock(instanceId),
    generateForcedColorsBlock(instanceId),
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Presets — the "one-line adapter" the card asks for
// ---------------------------------------------------------------------------

/**
 * shadcn/ui (and any Tailwind app following its convention).
 *
 * shadcn publishes semantic tokens as bare colour COMPONENTS, to be wrapped at
 * the use site: `hsl(var(--primary))` in the classic setup, `oklch(var(--primary))`
 * in the v4 palettes, and a bare `var(--primary)` when the host has switched to
 * full colour values. `space` picks which — that one flag is the whole difference
 * between the generations, so a host never has to hand-write the map.
 */
export function shadcnBridge(options: { space?: 'hsl' | 'oklch' | 'raw' } = {}): TokenBridge {
  const space = options.space ?? 'hsl';
  const ref = (token: string): string => (space === 'raw' ? `var(${token})` : `${space}(var(${token}))`);

  return {
    'node.fill': ref('--card'),
    'node.stroke': ref('--border'),
    'node.selected.fill': ref('--accent'),
    'node.selected.stroke': ref('--ring'),
    'node.highlighted.fill': ref('--accent'),
    'node.highlighted.stroke': ref('--primary'),
    'node.hovered.fill': ref('--muted'),
    'node.hovered.stroke': ref('--border'),
    'node.disabled.fill': ref('--muted'),
    'node.disabled.stroke': ref('--border'),
    'node.error.fill': ref('--card'),
    'node.error.stroke': ref('--destructive'),

    // Edges are CONTENT strokes, not card hairlines: shadcn's --border sits at
    // ~91% lightness and edges painted with it vanish on white (the certify
    // pass read the themed graph as broken contrast). --muted-foreground is
    // shadcn's own "readable but muted line" token.
    'link.stroke': ref('--muted-foreground'),
    'link.selected.stroke': ref('--ring'),
    'link.highlighted.stroke': ref('--primary'),
    'link.hovered.stroke': ref('--foreground'),

    'label.color': ref('--card-foreground'),
    'label.fontFamily': 'var(--font-sans)',

    'port.fill': ref('--background'),
    'port.input': ref('--primary'),
    'port.output': ref('--secondary'),
    'port.bi': ref('--accent'),
  };
}

/**
 * MUI (Material UI) with CSS-variable theming enabled
 * (`extendTheme` / `CssVarsProvider`, which publishes `--mui-palette-*`).
 */
export function muiBridge(prefix = '--mui'): TokenBridge {
  return {
    'node.fill': `var(${prefix}-palette-background-paper)`,
    'node.stroke': `var(${prefix}-palette-divider)`,
    'node.selected.fill': `var(${prefix}-palette-action-selected)`,
    'node.selected.stroke': `var(${prefix}-palette-primary-main)`,
    'node.highlighted.fill': `var(${prefix}-palette-action-hover)`,
    'node.highlighted.stroke': `var(${prefix}-palette-warning-main)`,
    'node.hovered.fill': `var(${prefix}-palette-action-hover)`,
    'node.hovered.stroke': `var(${prefix}-palette-text-secondary)`,
    'node.disabled.fill': `var(${prefix}-palette-action-disabledBackground)`,
    'node.disabled.stroke': `var(${prefix}-palette-action-disabled)`,
    'node.error.fill': `var(${prefix}-palette-error-light)`,
    'node.error.stroke': `var(${prefix}-palette-error-main)`,

    'link.stroke': `var(${prefix}-palette-divider)`,
    'link.selected.stroke': `var(${prefix}-palette-primary-main)`,
    'link.highlighted.stroke': `var(${prefix}-palette-warning-main)`,
    'link.hovered.stroke': `var(${prefix}-palette-text-secondary)`,

    'label.color': `var(${prefix}-palette-text-primary)`,
    'label.fontFamily': `var(${prefix}-font-body1)`,

    'port.fill': `var(${prefix}-palette-background-default)`,
    'port.input': `var(${prefix}-palette-success-main)`,
    'port.output': `var(${prefix}-palette-warning-main)`,
    'port.bi': `var(${prefix}-palette-info-main)`,
  };
}

/**
 * Tailwind v4, whose theme IS a set of CSS variables (`--color-slate-200`, …).
 * `scale` picks the neutral ramp so a host can stay on its own greys.
 */
export function tailwindBridge(options: { scale?: string; accent?: string } = {}): TokenBridge {
  const n = options.scale ?? 'slate';
  const a = options.accent ?? 'blue';
  return {
    'node.fill': 'var(--color-white)',
    'node.stroke': `var(--color-${n}-300)`,
    'node.selected.fill': `var(--color-${a}-50)`,
    'node.selected.stroke': `var(--color-${a}-600)`,
    'node.highlighted.fill': 'var(--color-amber-100)',
    'node.highlighted.stroke': 'var(--color-amber-500)',
    'node.hovered.fill': `var(--color-${n}-50)`,
    'node.hovered.stroke': `var(--color-${n}-400)`,
    'node.disabled.fill': `var(--color-${n}-100)`,
    'node.disabled.stroke': `var(--color-${n}-200)`,
    'node.error.fill': 'var(--color-red-100)',
    'node.error.stroke': 'var(--color-red-500)',

    'link.stroke': `var(--color-${n}-400)`,
    'link.selected.stroke': `var(--color-${a}-600)`,
    'link.highlighted.stroke': 'var(--color-amber-500)',
    'link.hovered.stroke': `var(--color-${n}-500)`,

    'label.color': `var(--color-${n}-900)`,
    'label.fontFamily': 'var(--font-sans)',

    'port.fill': 'var(--color-white)',
    'port.input': 'var(--color-emerald-500)',
    'port.output': 'var(--color-amber-500)',
    'port.bi': 'var(--color-violet-500)',
  };
}

/** Every token a bridge MAY set — the contract a custom bridge is checked against. */
export const BRIDGEABLE_TOKENS = Object.keys(THEME_VARS) as ThemeToken[];
