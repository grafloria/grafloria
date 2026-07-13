// Standalone-SVG style flattening: RESOLVE the CSS-variable cascade instead of
// referencing it.
//
// THE PROBLEM
// -----------
// The live renderer paints the THEME layer from a stylesheet written entirely in
// custom properties:
//
//   [data-grafloria-instance] .diagram-node { fill: var(--grafloria-node-fill); … }
//   [data-grafloria-instance="grafloria-3"]     { --grafloria-node-fill: #ffffff; … }
//
// A node VNode in CSS mode therefore carries NO fill at all — just
// `class="diagram-node"`. That is exactly right on a live page and useless in a
// file: an SVG opened in Inkscape, embedded in an email, or handed to a
// rasterizer (resvg / librsvg / cairosvg — none of which implement CSS custom
// properties) has neither our stylesheet nor our variables. It would render with
// UA defaults: black fill, no stroke, 16px serif labels.
//
// THE DECISION — flatten, don't ship a <style> block
// --------------------------------------------------
// We resolve the cascade to CONCRETE presentation attributes and emit ZERO
// `var(--…)` and zero `<style>` rules. The alternative (inline the shared rules
// plus a materialised variable block into a `<style>` inside the SVG) is
// self-contained in the "no network fetch" sense, but it still requires the
// consumer to implement CSS selectors AND custom properties. Most non-browser
// SVG consumers implement neither. Flattening is the only form that renders
// identically everywhere, so it is what `export` produces — and the export tests
// assert the output contains no `var(--`.
//
// HOW THE CASCADE IS REPRODUCED
// -----------------------------
// This is a mini CSS engine over exactly ONE stylesheet — our own
// {@link BASE_STYLE_RULES} — whose selectors are all simple compound class
// selectors (`.diagram-node`, `.diagram-node.selected`, `.port-input.port-highlighted`).
// So the whole cascade is: match by class set, order by (specificity = number of
// classes, then source order). BASE_STYLE_RULES is authored in ascending
// precedence, so source order already encodes `selected > highlighted > hovered`
// at equal specificity — the same tie-break the browser applies.
//
// The one subtlety that MATTERS is CSS priority order:
//
//     presentation attribute  <  author stylesheet rule  <  inline style
//
// A presentation attribute (`fill="#e8f5e9"`) LOSES to any author rule. So the
// flattened rule values must OVERWRITE prop-derived presentation attributes, and
// an element's inline `style` string must beat both — which it does for free,
// because it stays an inline `style` attribute in the output. Reproducing that
// order here is what keeps the exported picture identical to the live one.

import type { Theme } from '../types/theme.types';
import { BASE_STYLE_RULES } from '../themes/theme-css';
import { resolveThemeVars } from '../themes/theme-vars';

/**
 * CSS properties the flattener is allowed to materialise onto an element.
 *
 * Everything in BASE_STYLE_RULES is a paint value except `cursor`, which has no
 * meaning in a static picture. Anything outside this set is dropped rather than
 * emitted as a bogus attribute.
 */
const PAINTABLE_PROPS = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'color',
]);

/** A BASE_STYLE_RULE pre-parsed into a matchable form. */
interface CompiledRule {
  /** Classes every matching element must carry. */
  classes: string[];
  /** CSS specificity — for compound class selectors this is just the class count. */
  specificity: number;
  /** Index in BASE_STYLE_RULES: the tie-break at equal specificity (source order). */
  order: number;
  /** Declarations with every `var(--grafloria-*)` already resolved to a literal. */
  decls: Record<string, string>;
}

/** `.diagram-node.selected` → ['diagram-node', 'selected'] */
function selectorClasses(selector: string): string[] {
  return selector
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);
}

const VAR_REF = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/g;

/**
 * Replace every `var(--grafloria-*)` in a declaration with its literal theme value.
 * Returns `undefined` when a referenced variable has no value and no fallback —
 * the declaration is then DROPPED rather than emitted as an unresolvable
 * reference, and the caller records a warning.
 */
export function resolveCssVars(
  value: string,
  vars: Record<string, string>
): string | undefined {
  let unresolved = false;
  const out = value.replace(VAR_REF, (_all, name: string, fallback?: string) => {
    const resolved = vars[name];
    if (resolved !== undefined) return resolved;
    if (fallback !== undefined && fallback.trim() !== '') return fallback.trim();
    unresolved = true;
    return '';
  });
  return unresolved ? undefined : out.trim();
}

/**
 * Resolves an element's class list to the concrete presentation attributes the
 * renderer's stylesheet would have painted, for THIS theme.
 */
export type ClassStyleResolver = (classList: string[]) => Record<string, string>;

/**
 * Build the resolver for a theme. Compiles BASE_STYLE_RULES once (var refs
 * resolved against the theme's variable values), then matches class lists
 * against it.
 *
 * @param theme the theme whose `--grafloria-*` values get baked in
 * @param warnings collector — a declaration whose variable cannot be resolved is
 *        dropped and reported here rather than silently emitting `var(--…)`.
 */
export function createClassStyleResolver(theme: Theme, warnings: string[] = []): ClassStyleResolver {
  const vars = resolveThemeVars(theme);

  const compiled: CompiledRule[] = BASE_STYLE_RULES.map((rule, order) => {
    const decls: Record<string, string> = {};
    for (const [prop, raw] of Object.entries(rule.decls)) {
      if (!PAINTABLE_PROPS.has(prop)) continue; // cursor & friends: not a picture
      const resolved = resolveCssVars(raw, vars);
      if (resolved === undefined) {
        warnings.push(`unresolved CSS variable in "${rule.selector} { ${prop}: ${raw} }" — declaration dropped`);
        continue;
      }
      decls[prop] = resolved;
    }
    const classes = selectorClasses(rule.selector);
    return { classes, specificity: classes.length, order, decls };
  });

  // Stable cascade order: lower specificity first, then source order. Applying in
  // this order into a map means the LAST write wins — i.e. the browser's winner.
  compiled.sort((a, b) => a.specificity - b.specificity || a.order - b.order);

  return (classList: string[]): Record<string, string> => {
    if (classList.length === 0) return {};
    const have = new Set(classList);
    const out: Record<string, string> = {};
    for (const rule of compiled) {
      if (!rule.classes.every(c => have.has(c))) continue;
      Object.assign(out, rule.decls);
    }
    return out;
  };
}
