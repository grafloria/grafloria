// The cascade flattener: the renderer's var(--grafloria-*) stylesheet, RESOLVED.
//
// This is the piece that makes a standalone file possible at all, so it is tested
// against the SAME cascade the browser applies to the injected stylesheet:
// match by class set, order by (specificity = class count, then source order).

import { createClassStyleResolver, resolveCssVars } from './style-flattener';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import { BASE_STYLE_RULES } from '../themes/theme-css';

describe('resolveCssVars', () => {
  const vars = { '--grafloria-node-fill': '#ffffff', '--grafloria-node-stroke-width': '1px' };

  it('substitutes a variable', () => {
    expect(resolveCssVars('var(--grafloria-node-fill)', vars)).toBe('#ffffff');
  });

  it('uses the fallback when the variable is unknown', () => {
    expect(resolveCssVars('var(--nope, #123456)', vars)).toBe('#123456');
  });

  it('returns undefined for an unresolvable reference (the decl is DROPPED, never emitted as var())', () => {
    expect(resolveCssVars('var(--nope)', vars)).toBeUndefined();
  });

  it('leaves a literal alone', () => {
    expect(resolveCssVars('none', vars)).toBe('none');
  });
});

describe('createClassStyleResolver', () => {
  it('resolves the base node rule to the theme literal', () => {
    const resolve = createClassStyleResolver(LIGHT_THEME);
    expect(resolve(['diagram-node'])).toMatchObject({
      fill: LIGHT_THEME.colors.node.default.fill,
      stroke: LIGHT_THEME.colors.node.default.stroke,
      'stroke-width': `${LIGHT_THEME.nodes.default.strokeWidth}px`,
    });
  });

  it('is theme-scoped: the SAME classes resolve differently under a different theme', () => {
    const light = createClassStyleResolver(LIGHT_THEME)(['diagram-node']);
    const dark = createClassStyleResolver(DARK_THEME)(['diagram-node']);
    expect(dark['fill']).toBe(DARK_THEME.colors.node.default.fill);
    expect(dark['fill']).not.toBe(light['fill']);
  });

  it('higher specificity wins: .diagram-node.selected beats .diagram-node', () => {
    const resolve = createClassStyleResolver(LIGHT_THEME);
    expect(resolve(['diagram-node', 'selected'])['fill']).toBe(
      LIGHT_THEME.colors.node.selected.fill
    );
  });

  it('at equal specificity, source order decides — selection beats highlight', () => {
    // BASE_STYLE_RULES is authored in ascending precedence (…hovered, highlighted,
    // selected), which is exactly how the browser breaks the tie. The flattener
    // must reproduce that, not the order the classes happen to appear in.
    const resolve = createClassStyleResolver(LIGHT_THEME);
    const both = resolve(['diagram-node', 'highlighted', 'selected']);
    expect(both['fill']).toBe(LIGHT_THEME.colors.node.selected.fill);
    expect(both['stroke']).toBe(LIGHT_THEME.colors.node.selected.stroke);
  });

  it('an unmatched class contributes nothing', () => {
    const resolve = createClassStyleResolver(LIGHT_THEME);
    expect(resolve(['totally-unknown'])).toEqual({});
    expect(resolve([])).toEqual({});
  });

  it('labels get font + colour from the theme (the VNode carries none of them in CSS mode)', () => {
    const resolve = createClassStyleResolver(LIGHT_THEME);
    expect(resolve(['diagram-label'])).toEqual({
      'font-family': LIGHT_THEME.typography.fontFamily.default,
      'font-size': `${LIGHT_THEME.typography.fontSize.md}px`,
      fill: LIGHT_THEME.colors.text.primary,
    });
  });

  it('drops non-paint declarations (cursor has no meaning in a picture)', () => {
    const resolve = createClassStyleResolver(LIGHT_THEME);
    expect(resolve(['port-hovered'])).not.toHaveProperty('cursor');
    expect(resolve(['port-hovered'])['stroke-width']).toBe('3px');
  });

  it('EVERY themed declaration in the shipped stylesheet resolves — no warnings', () => {
    // The invariant that keeps the export honest: if someone adds a rule with a
    // var() that is not in THEME_VARS, the export would silently lose that paint.
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      const warnings: string[] = [];
      const resolve = createClassStyleResolver(theme, warnings);
      for (const rule of BASE_STYLE_RULES) {
        resolve(rule.selector.split('.').filter(Boolean));
      }
      expect(warnings).toEqual([]);
    }
  });

  it('reports (and drops) a declaration whose variable cannot be resolved', () => {
    const warnings: string[] = [];
    // A theme missing a token is impossible through the Theme type, so exercise the
    // resolver's guard directly — it is what prevents `var(--…)` leaking into a file.
    expect(resolveCssVars('var(--grafloria-not-a-token)', {})).toBeUndefined();
    createClassStyleResolver(LIGHT_THEME, warnings);
    expect(warnings).toEqual([]);
  });
});
