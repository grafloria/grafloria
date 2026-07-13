// Card "Theme-bound properties" — the token → value / token → variable contract.
//
// The renderer-side half (does a bound property actually reach the rendered
// output?) is pinned by svg-renderer.theme-bound.spec.ts. This file pins the
// primitive: what a token resolves to, and what variable it maps to.

import {
  isThemeRef,
  resolveBindableVars,
  resolveThemeRef,
  themeRef,
  themeRefCssValue,
  themeRefToken,
  themeRefVar,
} from './theme-ref';
import { THEME_TOKENS, THEME_VARS } from './theme-vars';
import { LIGHT_THEME } from './default-light-theme';
import { DARK_THEME } from './default-dark-theme';
import type { Theme } from '../types/theme.types';

describe('themeRef — theme-bound properties', () => {
  describe('the marker', () => {
    it('is detectable, and carries its token', () => {
      const ref = themeRef('category.critical');
      expect(isThemeRef(ref)).toBe(true);
      expect(themeRefToken(ref)).toBe('category.critical');
    });

    it('is not confused with the literals or spec objects that share its slot', () => {
      // `fill` accepts string | LinearGradient | Pattern | ThemeRef — every one of
      // these travels through the same code path, so telling them apart matters.
      expect(isThemeRef('#ff0000')).toBe(false);
      expect(isThemeRef(3)).toBe(false);
      expect(isThemeRef(undefined)).toBe(false);
      expect(isThemeRef(null)).toBe(false);
      expect(isThemeRef({ type: 'linearGradient', stops: [] })).toBe(false);
      expect(isThemeRef({ blur: 4, offsetX: 1, offsetY: 1, color: '#000' })).toBe(false);
    });
  });

  // =========================================================================
  // The naming law: one mechanical rule reproduces the whole chrome table.
  // =========================================================================
  describe('token → CSS custom property', () => {
    it('derives EVERY entry of THEME_VARS mechanically', () => {
      // If this ever fails, the table and the derivation have drifted, and a
      // themeRef to a chrome token would point at a variable nobody declares.
      for (const token of THEME_TOKENS) {
        expect(themeRefVar(token)).toBe(THEME_VARS[token].cssVar);
      }
    });

    it('kebab-cases camelCase segments', () => {
      expect(themeRefVar('label.fontFamily')).toBe('--grafloria-label-font-family');
      expect(themeRefVar('port.emphasis.strokeWidth')).toBe('--grafloria-port-emphasis-stroke-width');
    });

    it('names the caller-facing palettes', () => {
      expect(themeRefVar('category.critical')).toBe('--grafloria-category-critical');
      expect(themeRefVar('numbers.emphasis')).toBe('--grafloria-numbers-emphasis');
      expect(themeRefVar('colors.primary')).toBe('--grafloria-colors-primary');
    });
  });

  // =========================================================================
  // The grammar
  // =========================================================================
  describe('token → value, against the ACTIVE theme', () => {
    it('resolves a chrome token', () => {
      expect(resolveThemeRef('node.selected.fill', LIGHT_THEME)).toBe(LIGHT_THEME.colors.node.selected.fill);
      expect(resolveThemeRef('node.selected.fill', DARK_THEME)).toBe(DARK_THEME.colors.node.selected.fill);
    });

    it('resolves the semantic category palette', () => {
      expect(resolveThemeRef('category.critical', LIGHT_THEME)).toBe(LIGHT_THEME.categories!.critical);
      expect(resolveThemeRef('category.critical', DARK_THEME)).toBe(DARK_THEME.categories!.critical);
    });

    it('THE POINT: the same token gives a different colour per theme', () => {
      const light = resolveThemeRef('category.critical', LIGHT_THEME);
      const dark = resolveThemeRef('category.critical', DARK_THEME);
      expect(light).toBeDefined();
      expect(dark).toBeDefined();
      expect(light).not.toBe(dark);
    });

    it('resolves the numeric scale (numbers are values too)', () => {
      expect(resolveThemeRef('numbers.emphasis', LIGHT_THEME)).toBe(3);
      expect(typeof resolveThemeRef('numbers.emphasis', LIGHT_THEME)).toBe('number');
    });

    it('resolves an arbitrary path into the Theme', () => {
      expect(resolveThemeRef('colors.primary', LIGHT_THEME)).toBe(LIGHT_THEME.colors.primary);
      expect(resolveThemeRef('effects.borderRadius.lg', LIGHT_THEME)).toBe(8);
      expect(resolveThemeRef('typography.fontSize.xl', LIGHT_THEME)).toBe(20);
      expect(resolveThemeRef('spacing.md', LIGHT_THEME)).toBe(12);
    });

    it('is undefined for a token the theme does not define — never a bogus value', () => {
      expect(resolveThemeRef('category.nope', LIGHT_THEME)).toBeUndefined();
      expect(resolveThemeRef('numbers.nope', LIGHT_THEME)).toBeUndefined();
      expect(resolveThemeRef('total.nonsense', LIGHT_THEME)).toBeUndefined();
      // A path that lands on an OBJECT is not a value either.
      expect(resolveThemeRef('colors.node', LIGHT_THEME)).toBeUndefined();
    });

    it('a theme with no category palette at all resolves to undefined, not a crash', () => {
      const bare: Theme = { ...LIGHT_THEME, categories: undefined, numbers: undefined };
      expect(resolveThemeRef('category.critical', bare)).toBeUndefined();
      expect(resolveThemeRef('numbers.emphasis', bare)).toBeUndefined();
    });
  });

  // =========================================================================
  // CSS emission
  // =========================================================================
  describe('token → CSS value', () => {
    it('emits var(…) WITH the current literal as fallback', () => {
      // The fallback is what stops an undefined variable from invalidating the
      // whole declaration (an SVG shape with no fill paints black).
      expect(themeRefCssValue('category.critical', LIGHT_THEME)).toBe(
        `var(--grafloria-category-critical, ${LIGHT_THEME.categories!.critical})`
      );
    });

    it('is undefined for an unresolvable token, so the caller can drop the property', () => {
      expect(themeRefCssValue('category.nope', LIGHT_THEME)).toBeUndefined();
    });
  });

  // =========================================================================
  // The bindable variable block — the reason a theme swap can be a var rebind
  // =========================================================================
  describe('resolveBindableVars', () => {
    it('publishes EVERY token a themeRef can point at', () => {
      const vars = resolveBindableVars(LIGHT_THEME);

      // If a token resolves but has no variable, a CSS-mode binding to it would
      // emit `var(--undeclared, literal)` and quietly stop hot-swapping.
      const bindable = [
        'category.critical',
        'category.accent',
        'numbers.emphasis',
        'colors.primary',
        'colors.node.selected.fill',
        'effects.borderRadius.lg',
        'typography.fontSize.md',
        'spacing.md',
      ];
      for (const token of bindable) {
        expect(resolveThemeRef(token, LIGHT_THEME)).toBeDefined();
        expect(vars[themeRefVar(token)]).toBeDefined();
      }
    });

    it('carries the active theme values, as strings', () => {
      const vars = resolveBindableVars(DARK_THEME);
      expect(vars['--grafloria-category-critical']).toBe(DARK_THEME.categories!.critical);
      expect(vars['--grafloria-numbers-emphasis']).toBe('3');
      expect(vars['--grafloria-colors-primary']).toBe(DARK_THEME.colors.primary);
    });

    it('leaves the per-NODE-TYPE maps out (open-ended, and resolved inline anyway)', () => {
      const typed: Theme = { ...LIGHT_THEME, nodes: { ...LIGHT_THEME.nodes, decision: { fill: '#123456' } } };
      const vars = resolveBindableVars(typed);
      expect(Object.keys(vars).some(name => name.includes('decision'))).toBe(false);
    });

    it('skips a missing palette without inventing variables', () => {
      const bare: Theme = { ...LIGHT_THEME, categories: undefined, numbers: undefined };
      const vars = resolveBindableVars(bare);
      expect(Object.keys(vars).some(name => name.startsWith('--grafloria-category-'))).toBe(false);
      expect(Object.keys(vars).some(name => name.startsWith('--grafloria-numbers-'))).toBe(false);
      // …but the rest of the theme is still published.
      expect(vars['--grafloria-colors-primary']).toBe(LIGHT_THEME.colors.primary);
    });
  });

  // =========================================================================
  // Every built-in theme must answer the same category names, or a theme swap
  // silently drops a bound colour.
  // =========================================================================
  it('light and dark define the SAME category names (a swap must not lose one)', () => {
    expect(Object.keys(DARK_THEME.categories ?? {}).sort()).toEqual(
      Object.keys(LIGHT_THEME.categories ?? {}).sort()
    );
  });
});
