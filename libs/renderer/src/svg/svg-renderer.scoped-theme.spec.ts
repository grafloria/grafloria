// SVGRenderer — instance-scoped theming via CSS custom properties
//
// Styling & theming, Card "Scoped theme via CSS custom properties".
//
// THE BUG THIS PINS: generateThemeCSS() used to inline hex literals into GLOBAL
// rules (`.diagram-node { fill: #ffffff }`) inside a <style> keyed by THEME NAME.
// Two diagrams with different themes on one page therefore collided — whichever
// stylesheet was injected last repainted BOTH — and disposing either renderer
// could remove the other's stylesheet.
//
// NOW: one SHARED, theme-independent stylesheet written in var(--grafloria-*), plus a
// tiny per-instance variable block scoped by `[data-grafloria-instance="grafloria-N"]`.
//
// jsdom does not implement CSS custom properties or var() substitution, so the
// helpers below do what a browser would: match the shared rules against an
// element's classes (fewer classes first, source order within a tier), then
// substitute that INSTANCE's variables. Everything is read out of the real
// injected <style> elements, not out of the generators.

import { SVGRenderer, GRAFLORIA_BASE_STYLE_ID, GRAFLORIA_INSTANCE_STYLE_PREFIX } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import {
  GRAFLORIA_INSTANCE_ATTR,
  BASE_STYLE_RULES,
  LIGHT_THEME,
  DARK_THEME,
  THEME_VARS,
  cssVarName,
} from '../themes';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

type Decls = Record<string, string>;

/** Parse the shared stylesheet's scoped rules, in source order. */
function sharedRules(): Array<{ classes: string[]; decls: Decls }> {
  const css = document.getElementById(GRAFLORIA_BASE_STYLE_ID)?.textContent ?? '';
  const rules: Array<{ classes: string[]; decls: Decls }> = [];
  const ruleRe = new RegExp(`\\[${GRAFLORIA_INSTANCE_ATTR}\\]\\s+([^{]+)\\{([^}]*)\\}`, 'g');

  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css)) !== null) {
    rules.push({
      classes: match[1].trim().split('.').slice(1).map(c => c.trim()),
      decls: parseDecls(match[2]),
    });
  }
  return rules;
}

function parseDecls(body: string): Decls {
  const decls: Decls = {};
  for (const decl of body.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    decls[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
  }
  return decls;
}

/** The `--grafloria-*` variables ONE instance declares (read from its own <style>). */
function instanceVars(instanceId: string): Record<string, string> {
  const css = document.getElementById(`${GRAFLORIA_INSTANCE_STYLE_PREFIX}${instanceId}`)?.textContent ?? '';
  const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
  const vars: Record<string, string> = {};
  for (const [prop, value] of Object.entries(parseDecls(body))) {
    if (prop.startsWith('--')) vars[prop] = value;
  }
  return vars;
}

/**
 * What a browser would actually paint for an element with `classList` inside the
 * diagram whose root carries `instanceId`: cascade the shared rules, then resolve
 * var() against THAT instance's variables.
 */
function effectiveStyle(instanceId: string, classList: string[]): Decls {
  const vars = instanceVars(instanceId);
  const matched = sharedRules()
    .filter(rule => rule.classes.every(c => classList.includes(c)))
    .sort((a, b) => a.classes.length - b.classes.length); // stable → source order within a tier

  const out: Decls = {};
  for (const rule of matched) {
    for (const [prop, value] of Object.entries(rule.decls)) {
      out[prop] = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => vars[name] ?? '');
    }
  }
  return out;
}

/** One resolved declaration — index access keeps TS happy about the Decls index signature. */
function paint(instanceId: string, classList: string[], prop: string): string | undefined {
  return effectiveStyle(instanceId, classList)[prop];
}

function makeRenderer(theme = LIGHT_THEME, config = {}): { renderer: SVGRenderer; engine: DiagramEngine; diagram: DiagramModel } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('Test')!;
  const renderer = new SVGRenderer(engine, config, theme);
  return { renderer, engine, diagram };
}

describe('SVGRenderer - instance-scoped theme (CSS custom properties)', () => {
  const disposeAll: Array<() => void> = [];

  afterEach(() => {
    while (disposeAll.length) disposeAll.pop()!();
    // Nothing of ours may survive a full teardown.
    document.querySelectorAll(`style[id^="${GRAFLORIA_INSTANCE_STYLE_PREFIX}"]`).forEach(el => el.remove());
    document.getElementById(GRAFLORIA_BASE_STYLE_ID)?.remove();
  });

  function track(engine: DiagramEngine, renderer: SVGRenderer): SVGRenderer {
    disposeAll.push(() => {
      renderer.dispose();
      engine.destroy();
    });
    return renderer;
  }

  // =========================================================================
  // THE regression: two diagrams, two themes, one document
  // =========================================================================
  describe('two renderers on one document', () => {
    it('each diagram keeps ITS OWN theme colours (the collision this card fixes)', () => {
      const a = makeRenderer(LIGHT_THEME);
      const b = makeRenderer(DARK_THEME);
      track(a.engine, a.renderer);
      track(b.engine, b.renderer);

      a.diagram.addNode(new NodeModel({ type: 'basic', position: { x: 10, y: 10 }, size: { width: 80, height: 40 } }));
      b.diagram.addNode(new NodeModel({ type: 'basic', position: { x: 10, y: 10 }, size: { width: 80, height: 40 } }));
      a.renderer.render(VIEWPORT, 1);
      b.renderer.render(VIEWPORT, 1);

      const lightId = a.renderer.getInstanceId();
      const darkId = b.renderer.getInstanceId();
      expect(lightId).not.toBe(darkId);

      // Nodes: light theme vs dark theme, resolved through the SAME shared rules.
      expect(paint(lightId, ['diagram-node'], 'fill')).toBe(LIGHT_THEME.colors.node.default.fill);
      expect(paint(darkId, ['diagram-node'], 'fill')).toBe(DARK_THEME.colors.node.default.fill);
      expect(paint(lightId, ['diagram-node'], 'fill')).not.toBe(
        paint(darkId, ['diagram-node'], 'fill')
      );

      // Links too.
      expect(paint(lightId, ['diagram-link'], 'stroke')).toBe(LIGHT_THEME.colors.link.default);
      expect(paint(darkId, ['diagram-link'], 'stroke')).toBe(DARK_THEME.colors.link.default);

      // …and the state rules, which are the ones a stale global sheet used to
      // repaint most visibly.
      expect(paint(lightId, ['diagram-node', 'selected'], 'stroke')).toBe(
        LIGHT_THEME.colors.node.selected.stroke
      );
      expect(paint(darkId, ['diagram-node', 'selected'], 'stroke')).toBe(
        DARK_THEME.colors.node.selected.stroke
      );
    });

    it('injects the shared rules ONCE, no matter how many renderers exist', () => {
      const a = makeRenderer(LIGHT_THEME);
      const b = makeRenderer(DARK_THEME);
      const c = makeRenderer(LIGHT_THEME);
      track(a.engine, a.renderer);
      track(b.engine, b.renderer);
      track(c.engine, c.renderer);

      expect(document.querySelectorAll(`style#${GRAFLORIA_BASE_STYLE_ID}`)).toHaveLength(1);
      // …and one variable block per instance.
      expect(document.querySelectorAll(`style[id^="${GRAFLORIA_INSTANCE_STYLE_PREFIX}"]`)).toHaveLength(3);
    });

    it('two renderers with the SAME theme name still get separate stylesheets', () => {
      // The old id was `grafloria-renderer-theme-<themeName>`: same name → same id →
      // constructing the second renderer deleted the first one's stylesheet.
      const a = makeRenderer(LIGHT_THEME);
      const b = makeRenderer({ ...LIGHT_THEME, colors: { ...LIGHT_THEME.colors, node: { ...LIGHT_THEME.colors.node, default: { fill: '#123456', stroke: '#654321' } } } });
      track(a.engine, a.renderer);
      track(b.engine, b.renderer);

      expect(document.getElementById(a.renderer.getStyleElementId())).toBeTruthy();
      expect(document.getElementById(b.renderer.getStyleElementId())).toBeTruthy();
      expect(paint(a.renderer.getInstanceId(), ['diagram-node'], 'fill')).toBe('#ffffff');
      expect(paint(b.renderer.getInstanceId(), ['diagram-node'], 'fill')).toBe('#123456');
    });

    it('disposing one renderer leaves the other one styled', () => {
      const a = makeRenderer(LIGHT_THEME);
      const b = makeRenderer(DARK_THEME);
      track(b.engine, b.renderer);

      const survivingId = b.renderer.getInstanceId();
      a.renderer.dispose();
      a.engine.destroy();

      expect(document.getElementById(b.renderer.getStyleElementId())).toBeTruthy();
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBeTruthy(); // still needed by B
      expect(paint(survivingId, ['diagram-node'], 'fill')).toBe(DARK_THEME.colors.node.default.fill);
    });

    it('drops the shared rules once the LAST renderer is disposed', () => {
      const a = makeRenderer(LIGHT_THEME);
      const b = makeRenderer(DARK_THEME);

      a.renderer.dispose();
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBeTruthy();

      b.renderer.dispose();
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBeNull();
      expect(document.querySelectorAll(`style[id^="${GRAFLORIA_INSTANCE_STYLE_PREFIX}"]`)).toHaveLength(0);

      a.engine.destroy();
      b.engine.destroy();
    });

    it('setTheme rewrites only the calling instance\'s variables', () => {
      const a = makeRenderer(LIGHT_THEME);
      const b = makeRenderer(LIGHT_THEME);
      track(a.engine, a.renderer);
      track(b.engine, b.renderer);

      a.renderer.setTheme(DARK_THEME);

      expect(paint(a.renderer.getInstanceId(), ['diagram-node'], 'fill')).toBe(DARK_THEME.colors.node.default.fill);
      expect(paint(b.renderer.getInstanceId(), ['diagram-node'], 'fill')).toBe(LIGHT_THEME.colors.node.default.fill);
      // Still exactly one shared sheet, still one block each.
      expect(document.querySelectorAll(`style#${GRAFLORIA_BASE_STYLE_ID}`)).toHaveLength(1);
      expect(document.querySelectorAll(`style[id^="${GRAFLORIA_INSTANCE_STYLE_PREFIX}"]`)).toHaveLength(2);
    });
  });

  // =========================================================================
  // The scope attribute has to be ON the roots, or none of this applies
  // =========================================================================
  describe('instance scope attribute', () => {
    it('stamps data-grafloria-instance on the REAL render root', () => {
      const { renderer, engine, diagram } = makeRenderer();
      track(engine, renderer);
      diagram.addNode(new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 50, height: 20 } }));

      const root = renderer.render(VIEWPORT, 1) as VNode;
      expect(root.props[GRAFLORIA_INSTANCE_ATTR]).toBe(renderer.getInstanceId());
    });

    it('stamps it on the EMPTY diagram root too (no diagram yet)', () => {
      const engine = new DiagramEngine(); // no createDiagram()
      const renderer = new SVGRenderer(engine, {});
      track(engine, renderer);

      const root = renderer.render(VIEWPORT, 1) as VNode;
      expect(root.props[GRAFLORIA_INSTANCE_ATTR]).toBe(renderer.getInstanceId());
    });

    it('applyInstanceScope() scopes an HTML host, so nodes OUTSIDE the SVG resolve the vars', () => {
      // foreignObject content inherits from the root <svg>; HTML-LAYER nodes are
      // siblings of it and would resolve nothing without this.
      const { renderer, engine } = makeRenderer(DARK_THEME);
      track(engine, renderer);

      const host = document.createElement('div');
      renderer.applyInstanceScope(host);

      expect(host.getAttribute(GRAFLORIA_INSTANCE_ATTR)).toBe(renderer.getInstanceId());
      // An HTML node inside that host now matches the scoped rules AND inherits
      // the instance's variables.
      expect(paint(host.getAttribute(GRAFLORIA_INSTANCE_ATTR)!, ['diagram-node'], 'fill')).toBe(
        DARK_THEME.colors.node.default.fill
      );
    });

    it('programmatic mode injects nothing and takes no scope (it needs no stylesheet)', () => {
      const { renderer, engine, diagram } = makeRenderer(LIGHT_THEME, { useCSSMode: false });
      track(engine, renderer);
      diagram.addNode(new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 50, height: 20 } }));

      const root = renderer.render(VIEWPORT, 1) as VNode;
      expect(root.props[GRAFLORIA_INSTANCE_ATTR]).toBeUndefined();
      expect(document.getElementById(renderer.getStyleElementId())).toBeNull();
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBeNull();
    });
  });

  // =========================================================================
  // The mechanism: no theme literal may survive in a shared rule
  // =========================================================================
  describe('every built-in rule resolves through a variable', () => {
    const THEMED_PROPS = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'color'];
    const KNOWN_VARS = new Set(Object.values(THEME_VARS).map(binding => binding.cssVar));

    it('BASE_STYLE_RULES paints every themed property with var(--grafloria-*)', () => {
      const offenders: string[] = [];

      for (const rule of BASE_STYLE_RULES) {
        for (const [prop, value] of Object.entries(rule.decls)) {
          if (!THEMED_PROPS.includes(prop)) continue;
          if (value === 'none') continue; // `.diagram-link { fill: none }` is structural

          const match = /^var\((--[\w-]+)\)$/.exec(value);
          if (!match) {
            offenders.push(`${rule.selector} { ${prop}: ${value} }`);
            continue;
          }
          if (!KNOWN_VARS.has(match[1])) {
            offenders.push(`${rule.selector} { ${prop}: ${value} } → ${match[1]} is not in THEME_VARS`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });

    it('the injected shared stylesheet contains no colour literal at all', () => {
      const { renderer, engine } = makeRenderer(LIGHT_THEME);
      track(engine, renderer);

      const css = document.getElementById(GRAFLORIA_BASE_STYLE_ID)!.textContent!;
      // Only the scoped rule block matters (the animation CSS below it is static
      // and has always carried its own literals).
      const scoped = css.slice(0, css.indexOf('/* Link Path'));
      expect(scoped).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(scoped).toContain('var(--grafloria-node-fill)');
    });

    it('every variable the rules reference is declared by each instance', () => {
      const { renderer, engine } = makeRenderer(DARK_THEME);
      track(engine, renderer);

      const declared = instanceVars(renderer.getInstanceId());
      const referenced = new Set<string>();
      for (const rule of sharedRules()) {
        for (const value of Object.values(rule.decls)) {
          const match = /var\((--[\w-]+)\)/.exec(value);
          if (match) referenced.add(match[1]);
        }
      }

      expect(referenced.size).toBeGreaterThan(0);
      for (const name of referenced) {
        expect(declared[name]).toBeDefined();
      }
    });

    it('the variable block carries the theme values (and only this instance is scoped)', () => {
      const { renderer, engine } = makeRenderer(DARK_THEME);
      track(engine, renderer);

      const css = document.getElementById(renderer.getStyleElementId())!.textContent!;
      expect(css).toContain(`[${GRAFLORIA_INSTANCE_ATTR}="${renderer.getInstanceId()}"]`);
      expect(css).toContain(`${cssVarName('node.fill')}: ${DARK_THEME.colors.node.default.fill}`);
      expect(css).toContain(`${cssVarName('node.highlighted.fill')}: ${DARK_THEME.colors.node.highlighted.fill}`);
      expect(css).toContain(`${cssVarName('link.stroke')}: ${DARK_THEME.colors.link.default}`);
      // Numeric tokens keep their unit.
      expect(css).toContain(`${cssVarName('node.strokeWidth')}: ${DARK_THEME.nodes.default.strokeWidth}px`);
    });
  });
});
