// Theme-bound properties — `fill: themeRef('category.critical')`.
//
// Styling & theming, Card "Theme-bound properties" (GoJS ThemeManager's signature
// capability).
//
// THE PROBLEM. A theme swap used to repaint only CHROME — the renderer's own
// defaults, states and ports, i.e. the 33 tokens in `theme-vars.ts`. Every colour
// the CALLER assigned meaning to (`fill: '#ef4444'` because that node is
// critical) was a literal frozen into the model, so switching to the dark theme
// left a wall of light-theme reds sitting on a dark canvas. The theme could not
// reach them because it had never been told they meant anything.
//
// THE FIX. Any node/link/label property may hold a REFERENCE to a theme token
// instead of a literal:
//
//     node.setStyle({ fill: themeRef('category.critical') });
//     link.updateStyle({ strokeWidth: themeRef('numbers.emphasis') });
//     defineStyle('critical', { stroke: themeRef('category.critical') });
//
// The reference resolves against the ACTIVE theme wherever the value is emitted,
// so the very same model paints red-on-white under the light theme and the dark
// theme's (different, contrast-checked) critical red under the dark one.
//
// TWO RESOLUTIONS, one token:
//   - CSS mode, and a property whose value lands in an inline CSS `style` string
//     → emitted as `var(--grafloria-…, <literal>)`. Rebinding the variable is then
//     enough to recolour it: no VNode is rebuilt. This is what makes the
//     colorMode hot-swap (Card "colorMode") free for bound elements.
//   - everywhere else (programmatic/Canvas mode; properties emitted as SVG
//     PRESENTATION ATTRIBUTES, which cannot hold `var()`)
//     → resolved to the LITERAL, and the entity is recorded as theme-dependent
//     so a theme swap re-resolves it on the next frame.
//
// TOKEN GRAMMAR — a dotted path, resolved in this order:
//   1. one of the 33 chrome tokens in THEME_VARS  (`node.selected.fill`)
//   2. `category.<name>`                          → theme.categories[name]
//   3. `numbers.<name>`                           → theme.numbers[name]
//   4. any other path into the Theme object       (`colors.primary`,
//      `effects.borderRadius.lg`, `typography.fontSize.lg`, `spacing.md`)
//
// Every one of those has a CSS custom property, derived MECHANICALLY from the
// token (`node.selected.fill` → `--grafloria-node-selected-fill`) — the same rule
// that reproduces the whole THEME_VARS table, which `theme-ref.spec.ts` pins.

import type { NumberScale, SemanticPalette, Theme } from '../types/theme.types';
import { GRAFLORIA_VAR_PREFIX, THEME_VARS, type ThemeToken } from './theme-vars';

/** Brand key. Deliberately ugly — it must never collide with a real style prop. */
const THEME_REF_MARKER = '__grafloriaThemeRef';

/**
 * A reference to a theme token, usable anywhere a literal style value is.
 * Opaque on purpose: build it with {@link themeRef}, read it with
 * {@link resolveThemeRef}.
 */
export interface ThemeRef {
  readonly [THEME_REF_MARKER]: string;
}

/**
 * Bind a property to a theme token.
 *
 *   node.setStyle({ fill: themeRef('category.critical') })
 *
 * The `any` return is what lets a ThemeRef sit in a `fill?: string | Gradient | …`
 * slot: the engine's style types are the PUBLIC model contract and stay free of
 * any renderer type, so the renderer — the only thing that ever resolves a ref —
 * owns the marker and detects it structurally with {@link isThemeRef}.
 */
export function themeRef(token: ThemeToken | string): any {
  return { [THEME_REF_MARKER]: token };
}

/** True when a style value is a theme reference rather than a literal. */
export function isThemeRef(value: unknown): value is ThemeRef {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)[THEME_REF_MARKER] === 'string'
  );
}

/** The token a reference points at. */
export function themeRefToken(ref: ThemeRef): string {
  return ref[THEME_REF_MARKER];
}

// ---------------------------------------------------------------------------
// token → CSS custom property
// ---------------------------------------------------------------------------

/** `fontFamily` → `font-family`. */
function kebab(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * `node.selected.fill` → `--grafloria-node-selected-fill`.
 *
 * Mechanical, not a lookup: the same rule reproduces every entry of THEME_VARS
 * (pinned by a test), so chrome tokens and caller tokens share ONE naming law
 * and nothing has to be registered ahead of time.
 */
export function themeRefVar(token: string): string {
  return GRAFLORIA_VAR_PREFIX + token.split('.').map(kebab).join('-');
}

// ---------------------------------------------------------------------------
// token → value
// ---------------------------------------------------------------------------

/** Walk a dotted path into a plain object; undefined if any hop is missing. */
function readPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * Resolve a token against a theme. `undefined` when the theme does not define it
 * — callers must treat that as "this property was never set" (the cascade layer
 * below it, or the stylesheet, then wins) rather than painting `undefined`.
 */
export function resolveThemeRef(token: string, theme: Theme): string | number | undefined {
  // 1. chrome tokens (the 33 the built-in stylesheet paints)
  const chrome = THEME_VARS[token as ThemeToken];
  if (chrome) return chrome.read(theme);

  // 2/3. the caller's own palettes. `category.x` reads `theme.categories.x` —
  // singular token, plural field, because `themeRef('category.critical')` is how
  // it reads at the call site.
  const dot = token.indexOf('.');
  const head = dot < 0 ? token : token.slice(0, dot);
  const tail = dot < 0 ? '' : token.slice(dot + 1);

  if (head === 'category') {
    return (theme.categories as SemanticPalette | undefined)?.[tail];
  }
  if (head === 'numbers') {
    return (theme.numbers as NumberScale | undefined)?.[tail];
  }

  // 4. anything else addressable on the Theme itself.
  const value = readPath(theme, token);
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

/**
 * How a bound property is emitted in CSS mode when the target property accepts
 * `var()` (i.e. it is written into an inline CSS `style` string):
 * `var(--grafloria-category-critical, #b91c1c)`.
 *
 * The literal FALLBACK matters: a theme that simply does not define the token
 * would otherwise make the declaration invalid at computed-value time and the
 * element would lose the property entirely (an SVG shape with no `fill` paints
 * black). With the fallback it degrades to the value the token had when the
 * VNode was built, which is the closest thing to "unchanged" available.
 */
export function themeRefCssValue(token: string, theme: Theme): string | undefined {
  const literal = resolveThemeRef(token, theme);
  if (literal === undefined) return undefined;
  return `var(${themeRefVar(token)}, ${literal})`;
}

// ---------------------------------------------------------------------------
// The bindable variable block
// ---------------------------------------------------------------------------

/**
 * Sub-trees of the Theme published as `--grafloria-*` variables so that EVERY token
 * `resolveThemeRef` can answer is also live-rebindable in CSS.
 *
 * `nodes` / `links` are excluded on purpose: they are keyed by NODE TYPE, an
 * open-ended, per-diagram namespace whose values the cascade resolves inline
 * anyway (see style-cascade.ts) — publishing them would be a var per node type
 * that nothing reads.
 */
const BINDABLE_ROOTS = ['colors', 'typography', 'spacing', 'effects'] as const;

/** Flatten `{a: {b: 1}}` under prefix `x` into `{ 'x.a.b': 1 }`. */
function flatten(value: unknown, path: string, out: Record<string, string | number>): void {
  if (typeof value === 'string' || typeof value === 'number') {
    out[path] = value;
    return;
  }
  if (value == null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, path ? `${path}.${key}` : key, out);
  }
}

/**
 * Every BINDABLE token of a theme, as `{ '--grafloria-colors-primary': '#2563eb', … }`.
 *
 * This is the second half of the instance variable block (the first being the 33
 * chrome vars). Together they are the complete set of values a `themeRef` can
 * point at — which is exactly what makes a theme swap expressible as "rewrite
 * this instance's variables" instead of "rebuild every VNode".
 */
export function resolveBindableVars(theme: Theme): Record<string, string> {
  const flat: Record<string, string | number> = {};

  for (const root of BINDABLE_ROOTS) {
    flatten(theme[root], root, flat);
  }
  for (const [key, value] of Object.entries(theme.categories ?? {})) {
    if (value !== undefined) flat[`category.${key}`] = value;
  }
  for (const [key, value] of Object.entries(theme.numbers ?? {})) {
    if (value !== undefined) flat[`numbers.${key}`] = value;
  }

  const out: Record<string, string> = {};
  for (const [token, value] of Object.entries(flat)) {
    out[themeRefVar(token)] = String(value);
  }
  return out;
}
