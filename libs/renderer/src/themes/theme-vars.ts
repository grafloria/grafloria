// Theme token → CSS custom property: THE mapping table.
//
// Styling & theming — Card "Scoped theme via CSS custom properties".
//
// Every themed value the renderer paints lives here ONCE, as a binding of
//   token name  →  CSS custom property  →  how to read it out of a Theme.
//
// Everything downstream reuses this table instead of re-deriving names:
//   - theme-css.ts        emits the per-instance variable block (`--grafloria-…: #fff`)
//                         and the shared var-based rules (`fill: var(--grafloria-…)`)
//   - style-cascade.ts    resolves the same tokens programmatically (Canvas mode)
//   - later cards         (colorMode, theme-bound props, design-token export)
//                         enumerate THEME_VARS rather than hardcoding names.
//
// WHY custom properties at all: the theme stylesheet used to inline hex literals
// into GLOBAL rules (`.diagram-node { fill: #fff }`) keyed by theme NAME. Two
// diagrams with different themes on one page clobbered each other — whichever
// stylesheet was injected last painted BOTH diagrams. With this table the rules
// become theme-independent (`fill: var(--grafloria-node-fill)`) and only a tiny
// per-instance variable block carries the values, scoped to that diagram's root.

import type { Theme } from '../types/theme.types';

/**
 * Attribute stamped on a diagram's root `<svg>` (and, via
 * `SVGRenderer.applyInstanceScope()`, on any HTML host that wraps nodes rendered
 * outside the SVG) carrying the renderer's instance id. Both the variable block
 * and every rule in the shared stylesheet are scoped through it.
 */
export const GRAFLORIA_INSTANCE_ATTR = 'data-grafloria-instance';

/** Prefix of every custom property this renderer defines. */
export const GRAFLORIA_VAR_PREFIX = '--grafloria-';

/**
 * Every themed value the built-in stylesheet paints.
 *
 * Naming: `<entity>[.<state>].<property>` — mirrors the CSS var it maps to, so
 * `node.selected.fill` ⇄ `--grafloria-node-selected-fill`.
 */
export type ThemeToken =
  // Nodes
  | 'node.fill'
  | 'node.stroke'
  | 'node.strokeWidth'
  | 'node.selected.fill'
  | 'node.selected.stroke'
  | 'node.selected.strokeWidth'
  | 'node.highlighted.fill'
  | 'node.highlighted.stroke'
  | 'node.highlighted.strokeWidth'
  | 'node.hovered.fill'
  | 'node.hovered.stroke'
  | 'node.disabled.fill'
  | 'node.disabled.stroke'
  | 'node.disabled.opacity'
  | 'node.error.fill'
  | 'node.error.stroke'
  // Links
  | 'link.stroke'
  | 'link.strokeWidth'
  | 'link.selected.stroke'
  | 'link.selected.strokeWidth'
  | 'link.highlighted.stroke'
  | 'link.highlighted.strokeWidth'
  | 'link.hovered.stroke'
  // Labels
  | 'label.fontFamily'
  | 'label.fontSize'
  | 'label.color'
  // Ports
  | 'port.fill'
  | 'port.strokeWidth'
  | 'port.input'
  | 'port.output'
  | 'port.bi'
  | 'port.emphasis.strokeWidth'
  | 'port.emphasis.opacity';

/** One token's binding: the custom property + how to read its value from a Theme. */
export interface ThemeVarBinding {
  /** CSS custom property name, e.g. `--grafloria-node-fill`. */
  cssVar: string;
  /** Pull the raw value out of a Theme. */
  read: (theme: Theme) => string | number;
  /** Appended when serializing a numeric value into CSS. */
  unit?: 'px';
}

/**
 * THE table. One entry per token; nothing else in the renderer may invent a
 * `--grafloria-*` name.
 *
 * A handful of bindings are CONSTANTS today (`() => 2`): the emphasis
 * stroke-widths the stylesheet has always hardcoded. Routing them through the
 * table means a later card can bind them to a real theme token (or let users
 * override the custom property directly) without touching the stylesheet.
 */
export const THEME_VARS: Record<ThemeToken, ThemeVarBinding> = {
  // ---- Nodes ------------------------------------------------------------
  'node.fill': { cssVar: '--grafloria-node-fill', read: t => t.colors.node.default.fill },
  'node.stroke': { cssVar: '--grafloria-node-stroke', read: t => t.colors.node.default.stroke },
  'node.strokeWidth': { cssVar: '--grafloria-node-stroke-width', read: t => t.nodes.default.strokeWidth, unit: 'px' },

  'node.selected.fill': { cssVar: '--grafloria-node-selected-fill', read: t => t.colors.node.selected.fill },
  'node.selected.stroke': { cssVar: '--grafloria-node-selected-stroke', read: t => t.colors.node.selected.stroke },
  'node.selected.strokeWidth': { cssVar: '--grafloria-node-selected-stroke-width', read: () => 2, unit: 'px' },

  'node.highlighted.fill': { cssVar: '--grafloria-node-highlighted-fill', read: t => t.colors.node.highlighted.fill },
  'node.highlighted.stroke': { cssVar: '--grafloria-node-highlighted-stroke', read: t => t.colors.node.highlighted.stroke },
  'node.highlighted.strokeWidth': { cssVar: '--grafloria-node-highlighted-stroke-width', read: () => 2, unit: 'px' },

  'node.hovered.fill': { cssVar: '--grafloria-node-hovered-fill', read: t => t.colors.node.hovered.fill },
  'node.hovered.stroke': { cssVar: '--grafloria-node-hovered-stroke', read: t => t.colors.node.hovered.stroke },

  'node.disabled.fill': { cssVar: '--grafloria-node-disabled-fill', read: t => t.colors.node.disabled.fill },
  'node.disabled.stroke': { cssVar: '--grafloria-node-disabled-stroke', read: t => t.colors.node.disabled.stroke },
  'node.disabled.opacity': { cssVar: '--grafloria-node-disabled-opacity', read: t => t.effects.opacity.disabled },

  'node.error.fill': { cssVar: '--grafloria-node-error-fill', read: t => t.colors.node.error.fill },
  'node.error.stroke': { cssVar: '--grafloria-node-error-stroke', read: t => t.colors.node.error.stroke },

  // ---- Links ------------------------------------------------------------
  'link.stroke': { cssVar: '--grafloria-link-stroke', read: t => t.colors.link.default },
  'link.strokeWidth': { cssVar: '--grafloria-link-stroke-width', read: t => t.links.default.strokeWidth, unit: 'px' },

  'link.selected.stroke': { cssVar: '--grafloria-link-selected-stroke', read: t => t.colors.link.selected },
  'link.selected.strokeWidth': { cssVar: '--grafloria-link-selected-stroke-width', read: () => 3, unit: 'px' },

  'link.highlighted.stroke': { cssVar: '--grafloria-link-highlighted-stroke', read: t => t.colors.link.highlighted },
  'link.highlighted.strokeWidth': { cssVar: '--grafloria-link-highlighted-stroke-width', read: () => 3, unit: 'px' },

  'link.hovered.stroke': { cssVar: '--grafloria-link-hovered-stroke', read: t => t.colors.link.hovered },

  // ---- Labels -----------------------------------------------------------
  'label.fontFamily': { cssVar: '--grafloria-label-font-family', read: t => t.typography.fontFamily.default },
  'label.fontSize': { cssVar: '--grafloria-label-font-size', read: t => t.typography.fontSize.md, unit: 'px' },
  'label.color': { cssVar: '--grafloria-label-color', read: t => t.colors.text.primary },

  // ---- Ports ------------------------------------------------------------
  'port.fill': { cssVar: '--grafloria-port-fill', read: t => t.colors.background.surface },
  'port.strokeWidth': { cssVar: '--grafloria-port-stroke-width', read: t => t.ports.strokeWidth, unit: 'px' },
  'port.input': { cssVar: '--grafloria-port-input', read: t => t.colors.port.input },
  'port.output': { cssVar: '--grafloria-port-output', read: t => t.colors.port.output },
  'port.bi': { cssVar: '--grafloria-port-bi', read: t => t.colors.port.bi },
  'port.emphasis.strokeWidth': { cssVar: '--grafloria-port-emphasis-stroke-width', read: () => 3, unit: 'px' },
  'port.emphasis.opacity': { cssVar: '--grafloria-port-emphasis-opacity', read: () => 1 },
};

/** All tokens, in table order. */
export const THEME_TOKENS = Object.keys(THEME_VARS) as ThemeToken[];

/** `--grafloria-node-fill` — the custom property a token maps to. */
export function cssVarName(token: ThemeToken): string {
  return THEME_VARS[token].cssVar;
}

/** `var(--grafloria-node-fill)` — the reference the shared stylesheet is written in. */
export function themeVar(token: ThemeToken): string {
  return `var(${THEME_VARS[token].cssVar})`;
}

/** Serialize one token's value for CSS (adds the unit for numeric bindings). */
export function themeVarValue(token: ThemeToken, theme: Theme): string {
  const binding = THEME_VARS[token];
  const raw = binding.read(theme);
  return binding.unit && typeof raw === 'number' ? `${raw}${binding.unit}` : String(raw);
}

/**
 * The whole theme as `{ '--grafloria-node-fill': '#ffffff', … }`.
 * Also the natural shape for design-token export / Canvas-side lookups.
 */
export function resolveThemeVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    out[THEME_VARS[token].cssVar] = themeVarValue(token, theme);
  }
  return out;
}
