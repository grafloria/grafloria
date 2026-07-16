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
/**
 * shadcn's default LIGHT palette, as the raw HSL triplets its docs ship.
 * Every bridge value carries its token's canonical default as the var()
 * FALLBACK: on a host that never defined the variable, an unresolved var()
 * makes the declaration invalid at computed-value time and SVG's initial
 * fill — BLACK — wins (live report: the Tailwind bridge painted every node
 * solid black on a page without Tailwind variables). A design-token bridge
 * must fail soft to its framework's stock palette, never to a black diagram.
 */
const SHADCN_DEFAULTS: Record<string, { hsl: string; hex: string }> = {
  '--background': { hsl: '0 0% 100%', hex: '#ffffff' },
  '--foreground': { hsl: '222.2 84% 4.9%', hex: '#020817' },
  '--card': { hsl: '0 0% 100%', hex: '#ffffff' },
  '--card-foreground': { hsl: '222.2 84% 4.9%', hex: '#020817' },
  '--primary': { hsl: '222.2 47.4% 11.2%', hex: '#0f172a' },
  '--secondary': { hsl: '210 40% 96.1%', hex: '#f1f5f9' },
  '--muted': { hsl: '210 40% 96.1%', hex: '#f1f5f9' },
  '--muted-foreground': { hsl: '215.4 16.3% 46.9%', hex: '#64748b' },
  '--accent': { hsl: '210 40% 96.1%', hex: '#f1f5f9' },
  '--destructive': { hsl: '0 84.2% 60.2%', hex: '#ef4444' },
  '--border': { hsl: '214.3 31.8% 91.4%', hex: '#e2e8f0' },
  '--ring': { hsl: '222.2 84% 4.9%', hex: '#020817' },
};

export function shadcnBridge(options: { space?: 'hsl' | 'oklch' | 'raw' } = {}): TokenBridge {
  const space = options.space ?? 'hsl';
  const ref = (token: string): string => {
    const fallback = SHADCN_DEFAULTS[token];
    // oklch hosts opted in explicitly and define their own variables — an HSL
    // triplet fallback would be invalid inside oklch(), so none is emitted.
    if (space === 'oklch') return `oklch(var(${token}))`;
    if (space === 'raw') return fallback ? `var(${token}, ${fallback.hex})` : `var(${token})`;
    return fallback ? `hsl(var(${token}, ${fallback.hsl}))` : `hsl(var(${token}))`;
  };

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
    'label.fontFamily': 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',

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
  // Material's default LIGHT palette, as the var() fallbacks — see the note on
  // SHADCN_DEFAULTS: a host without CssVarsProvider must degrade to stock
  // Material, not to a black diagram.
  const MUI: Record<string, string> = {
    'palette-background-paper': '#ffffff',
    'palette-background-default': '#ffffff',
    'palette-divider': 'rgba(0, 0, 0, 0.12)',
    'palette-primary-main': '#1976d2',
    'palette-secondary-main': '#9c27b0',
    'palette-text-primary': 'rgba(0, 0, 0, 0.87)',
    'palette-text-secondary': 'rgba(0, 0, 0, 0.6)',
    'palette-action-selected': 'rgba(0, 0, 0, 0.08)',
    'palette-action-hover': 'rgba(0, 0, 0, 0.04)',
    'palette-action-disabledBackground': 'rgba(0, 0, 0, 0.12)',
    'palette-action-disabled': 'rgba(0, 0, 0, 0.26)',
    'palette-error-light': '#ef5350',
    'palette-error-main': '#d32f2f',
    'palette-warning-main': '#ed6c02',
    'palette-success-main': '#2e7d32',
    'palette-info-main': '#0288d1',
    'font-body1': 'Roboto, Helvetica, Arial, sans-serif',
  };
  const v = (token: string): string => `var(${prefix}-${token}, ${MUI[token]})`;

  return {
    'node.fill': v('palette-background-paper'),
    'node.stroke': v('palette-divider'),
    'node.selected.fill': v('palette-action-selected'),
    'node.selected.stroke': v('palette-primary-main'),
    'node.highlighted.fill': v('palette-action-hover'),
    'node.highlighted.stroke': v('palette-warning-main'),
    'node.hovered.fill': v('palette-action-hover'),
    'node.hovered.stroke': v('palette-text-secondary'),
    'node.disabled.fill': v('palette-action-disabledBackground'),
    'node.disabled.stroke': v('palette-action-disabled'),
    'node.error.fill': v('palette-error-light'),
    'node.error.stroke': v('palette-error-main'),

    'link.stroke': v('palette-divider'),
    'link.selected.stroke': v('palette-primary-main'),
    'link.highlighted.stroke': v('palette-warning-main'),
    'link.hovered.stroke': v('palette-text-secondary'),

    'label.color': v('palette-text-primary'),
    'label.fontFamily': v('font-body1'),

    'port.fill': v('palette-background-default'),
    'port.input': v('palette-success-main'),
    'port.output': v('palette-warning-main'),
    'port.bi': v('palette-info-main'),
  };
}

/**
 * Tailwind v4, whose theme IS a set of CSS variables (`--color-slate-200`, …).
 * `scale` picks the neutral ramp so a host can stay on its own greys.
 */
export function tailwindBridge(options: { scale?: string; accent?: string } = {}): TokenBridge {
  const n = options.scale ?? 'slate';
  const a = options.accent ?? 'blue';

  // Tailwind's stock palette, as the var() fallbacks — see SHADCN_DEFAULTS for
  // why: a host WITHOUT Tailwind v4's `--color-*` theme variables (v3 has none
  // at runtime at all) must degrade to the stock ramp, not to a black diagram.
  const TW: Record<string, string> = {
    'white': '#ffffff',
    'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1',
    'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-900': '#0f172a',
    'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb', 'gray-300': '#d1d5db',
    'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-900': '#111827',
    'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5', 'zinc-200': '#e4e4e7', 'zinc-300': '#d4d4d8',
    'zinc-400': '#a1a1aa', 'zinc-500': '#71717a', 'zinc-900': '#18181b',
    'neutral-50': '#fafafa', 'neutral-100': '#f5f5f5', 'neutral-200': '#e5e5e5', 'neutral-300': '#d4d4d4',
    'neutral-400': '#a3a3a3', 'neutral-500': '#737373', 'neutral-900': '#171717',
    'stone-50': '#fafaf9', 'stone-100': '#f5f5f4', 'stone-200': '#e7e5e4', 'stone-300': '#d6d3d1',
    'stone-400': '#a8a29e', 'stone-500': '#78716c', 'stone-900': '#1c1917',
    'blue-50': '#eff6ff', 'blue-600': '#2563eb',
    'indigo-50': '#eef2ff', 'indigo-600': '#4f46e5',
    'violet-50': '#f5f3ff', 'violet-500': '#8b5cf6', 'violet-600': '#7c3aed',
    'emerald-50': '#ecfdf5', 'emerald-500': '#10b981', 'emerald-600': '#059669',
    'rose-50': '#fff1f2', 'rose-600': '#e11d48',
    'amber-100': '#fef3c7', 'amber-500': '#f59e0b',
    'red-100': '#fee2e2', 'red-500': '#ef4444',
  };
  // A custom ramp we do not carry hexes for falls back to slate/blue at the
  // same step — a neutral approximation, never black.
  const tw = (name: string): string => {
    const fallback =
      TW[name] ?? TW[name.replace(/^[a-z]+-(?=\d)/, 'slate-')] ?? TW[name.replace(/^[a-z]+-(?=\d)/, 'blue-')];
    return fallback ? `var(--color-${name}, ${fallback})` : `var(--color-${name})`;
  };

  return {
    'node.fill': tw('white'),
    'node.stroke': tw(`${n}-300`),
    'node.selected.fill': tw(`${a}-50`),
    'node.selected.stroke': tw(`${a}-600`),
    'node.highlighted.fill': tw('amber-100'),
    'node.highlighted.stroke': tw('amber-500'),
    'node.hovered.fill': tw(`${n}-50`),
    'node.hovered.stroke': tw(`${n}-400`),
    'node.disabled.fill': tw(`${n}-100`),
    'node.disabled.stroke': tw(`${n}-200`),
    'node.error.fill': tw('red-100'),
    'node.error.stroke': tw('red-500'),

    'link.stroke': tw(`${n}-400`),
    'link.selected.stroke': tw(`${a}-600`),
    'link.highlighted.stroke': tw('amber-500'),
    'link.hovered.stroke': tw(`${n}-500`),

    'label.color': tw(`${n}-900`),
    'label.fontFamily': 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',

    'port.fill': tw('white'),
    'port.input': tw('emerald-500'),
    'port.output': tw('amber-500'),
    'port.bi': tw('violet-500'),
  };
}

/** Every token a bridge MAY set — the contract a custom bridge is checked against. */
export const BRIDGEABLE_TOKENS = Object.keys(THEME_VARS) as ThemeToken[];
