// Card "colorMode with system auto-detection and live hot-swap" — the renderer half.
//
// The resolution RULE is unit-tested in themes/color-mode.spec.ts. This file pins
// what the renderer actually does with it:
//   - the right theme is live at construction,
//   - an OS flip re-themes the DOM,
//   - and it does so by REWRITING THE VARIABLES, not by rebuilding the diagram —
//     which is the card's actual claim, so it is asserted, not asserted-to.

import { SVGRenderer, GRAFLORIA_BASE_STYLE_ID } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import {
  DARK_THEME,
  HIGH_CONTRAST_DARK_THEME,
  HIGH_CONTRAST_LIGHT_THEME,
  LIGHT_THEME,
  MEDIA_FORCED_COLORS,
  MEDIA_PREFERS_CONTRAST,
  MEDIA_PREFERS_DARK,
  themeRef,
  type ThemeSet,
} from '../themes';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

const THEMES: ThemeSet = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  highContrastLight: HIGH_CONTRAST_LIGHT_THEME,
  highContrastDark: HIGH_CONTRAST_DARK_THEME,
};

// --- a controllable OS -----------------------------------------------------

class FakeMedia {
  private readonly queries = new Map<string, { matches: boolean; listeners: Array<() => void> }>();

  constructor(initial: Record<string, boolean> = {}) {
    for (const media of [MEDIA_PREFERS_DARK, MEDIA_PREFERS_CONTRAST, MEDIA_FORCED_COLORS]) {
      this.queries.set(media, { matches: initial[media] ?? false, listeners: [] });
    }
    (window as any).matchMedia = (media: string) => {
      const entry = this.queries.get(media);
      if (!entry) return undefined;
      return {
        media,
        get matches() {
          return entry.matches;
        },
        addEventListener: (_t: string, listener: () => void) => entry.listeners.push(listener),
        removeEventListener: (_t: string, listener: () => void) => {
          const index = entry.listeners.indexOf(listener);
          if (index >= 0) entry.listeners.splice(index, 1);
        },
      };
    };
  }

  set(media: string, matches: boolean): void {
    const entry = this.queries.get(media)!;
    entry.matches = matches;
    entry.listeners.forEach(listener => listener());
  }
}

/** The `--grafloria-*` variables one instance currently declares, read from the DOM. */
function instanceVars(renderer: SVGRenderer): Record<string, string> {
  const css = document.getElementById(renderer.getStyleElementId())?.textContent ?? '';
  const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
  const vars: Record<string, string> = {};
  for (const decl of body.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim();
    if (prop.startsWith('--')) vars[prop] = decl.slice(colon + 1).trim();
  }
  return vars;
}

describe('SVGRenderer — colorMode', () => {
  const originalMatchMedia = window.matchMedia;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
    (window as any).matchMedia = originalMatchMedia;
    document.head.querySelectorAll('style[id^="grafloria-renderer-"]').forEach(el => el.remove());
  });

  function addNode(style: Record<string, unknown> = {}): NodeModel {
    const node = new NodeModel({ type: 'basic', position: { x: 50, y: 50 }, size: { width: 100, height: 50 } });
    node.setStyle(style as any);
    diagram.addNode(node);
    return node;
  }

  // =========================================================================
  // Construction
  // =========================================================================
  describe('the mode picks the theme', () => {
    it("'system' + a dark OS starts DARK, with no theme argument at all", () => {
      new FakeMedia({ [MEDIA_PREFERS_DARK]: true });
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      expect(renderer.getTheme()).toBe(DARK_THEME);
      expect(instanceVars(renderer)['--grafloria-node-fill']).toBe(DARK_THEME.colors.node.default.fill);
    });

    it("'system' + a light OS starts LIGHT", () => {
      new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });
      expect(renderer.getTheme()).toBe(LIGHT_THEME);
    });

    it("'dark' pins dark, whatever the OS says", () => {
      new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'dark', themes: THEMES });
      expect(renderer.getTheme()).toBe(DARK_THEME);
    });

    it('an OS contrast preference upgrades to the high-contrast theme', () => {
      new FakeMedia({ [MEDIA_PREFERS_DARK]: true, [MEDIA_PREFERS_CONTRAST]: true });
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });
      expect(renderer.getTheme()).toBe(HIGH_CONTRAST_DARK_THEME);
    });

    it('NO colorMode = the pre-Wave-4 behaviour: the theme argument, and nothing watched', () => {
      new FakeMedia({ [MEDIA_PREFERS_DARK]: true });
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);

      expect(renderer.getTheme()).toBe(LIGHT_THEME); // the dark OS is ignored
      expect(renderer.getColorMode()).toBeUndefined();
    });
  });

  // =========================================================================
  // THE CARD: a live OS flip re-themes the diagram
  // =========================================================================
  describe('live hot-swap on an OS change', () => {
    it('re-themes when the OS flips to dark', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });
      addNode();
      renderer.render(VIEWPORT, 1);

      expect(instanceVars(renderer)['--grafloria-node-fill']).toBe(LIGHT_THEME.colors.node.default.fill);

      media.set(MEDIA_PREFERS_DARK, true);

      expect(renderer.getTheme()).toBe(DARK_THEME);
      expect(instanceVars(renderer)['--grafloria-node-fill']).toBe(DARK_THEME.colors.node.default.fill);
      expect(instanceVars(renderer)['--grafloria-link-stroke']).toBe(DARK_THEME.colors.link.default);
    });

    it('re-themes when the user turns ON high contrast, mid-session', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'light', themes: THEMES });

      media.set(MEDIA_PREFERS_CONTRAST, true);

      expect(renderer.getTheme()).toBe(HIGH_CONTRAST_LIGHT_THEME);
      expect(instanceVars(renderer)['--grafloria-node-stroke']).toBe(
        HIGH_CONTRAST_LIGHT_THEME.colors.node.default.stroke
      );
    });

    it('emits renderer:theme-changed so a host can re-render', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      const seen: unknown[] = [];
      engine.eventBus.on('renderer:theme-changed', (theme: unknown) => seen.push(theme));

      media.set(MEDIA_PREFERS_DARK, true);
      expect(seen).toEqual([DARK_THEME]);
    });

    it('setColorMode() switches at runtime', () => {
      new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'light', themes: THEMES });

      renderer.setColorMode('dark');

      expect(renderer.getColorMode()).toBe('dark');
      expect(renderer.getTheme()).toBe(DARK_THEME);
      expect(instanceVars(renderer)['--grafloria-node-fill']).toBe(DARK_THEME.colors.node.default.fill);
    });

    it('setColorMode() can be opted into AFTER construction', () => {
      const media = new FakeMedia({ [MEDIA_PREFERS_DARK]: true });
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME); // no colorMode
      expect(renderer.getTheme()).toBe(LIGHT_THEME);

      renderer.setColorMode('system', THEMES);
      expect(renderer.getTheme()).toBe(DARK_THEME);

      media.set(MEDIA_PREFERS_DARK, false);
      expect(renderer.getTheme()).toBe(LIGHT_THEME);
    });

    it('stops following the OS once disposed', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });
      renderer.dispose();

      expect(() => media.set(MEDIA_PREFERS_DARK, true)).not.toThrow();
      expect(renderer.getTheme()).toBe(LIGHT_THEME); // unchanged
    });
  });

  // =========================================================================
  // …and it re-themes by REBINDING VARIABLES, which is the actual claim.
  // =========================================================================
  describe('the swap is a variable rebind, not a rebuild', () => {
    it('does NOT recreate the <style> element (the values are rewritten in place)', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      const before = document.getElementById(renderer.getStyleElementId());
      media.set(MEDIA_PREFERS_DARK, true);
      const after = document.getElementById(renderer.getStyleElementId());

      expect(after).toBe(before); // same node, new textContent
      expect(after!.textContent).toContain(DARK_THEME.colors.node.default.fill);
    });

    it('never touches the SHARED stylesheet (it is theme-independent)', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      const shared = document.getElementById(GRAFLORIA_BASE_STYLE_ID);
      const text = shared!.textContent;

      media.set(MEDIA_PREFERS_DARK, true);

      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)).toBe(shared);
      expect(document.getElementById(GRAFLORIA_BASE_STYLE_ID)!.textContent).toBe(text);
    });

    it('ZERO nodes are restyled when nothing baked a theme literal', () => {
      // The whole point. An idle diagram of plain nodes paints entirely through
      // the stylesheet's variables, so rebinding them is the ENTIRE re-theme.
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      const a = addNode();
      const b = addNode();
      renderer.render(VIEWPORT, 1);
      expect(renderer.getThemeBoundEntityCount()).toBe(0);

      media.set(MEDIA_PREFERS_DARK, true);

      // Nothing was dirtied — the next frame reuses every cached VNode.
      expect(a.isDirty).toBe(false);
      expect(b.isDirty).toBe(false);
    });

    it('…but a node that DID bake one is dirtied (correctness beats the fast path)', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      const plain = addNode();
      const selected = addNode();
      selected.setState({ selected: true }); // the state layer inlines theme colours
      renderer.render(VIEWPORT, 1);

      expect(renderer.getThemeBoundEntityCount()).toBe(1);

      media.set(MEDIA_PREFERS_DARK, true);

      expect(selected.isDirty).toBe(true);
      expect(plain.isDirty).toBe(false);
    });

    it('a themeRef-bound node stays var-driven, so it is NOT dirtied either', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

      const bound = addNode({ fill: themeRef('category.critical') });
      renderer.render(VIEWPORT, 1);

      // Its fill is `var(--grafloria-category-critical, …)`, and that variable is
      // about to be rewritten — so no rebuild is needed.
      expect(renderer.getThemeBoundEntityCount()).toBe(0);

      media.set(MEDIA_PREFERS_DARK, true);
      expect(bound.isDirty).toBe(false);

      // …and the variable really did change, so the node really does repaint.
      expect(instanceVars(renderer)['--grafloria-category-critical']).toBe(DARK_THEME.categories!.critical);
    });

    it('programmatic mode has no stylesheet, so it invalidates everything (correctly)', () => {
      const media = new FakeMedia();
      renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES, useCSSMode: false });

      const node = addNode();
      renderer.render(VIEWPORT, 1);

      media.set(MEDIA_PREFERS_DARK, true);

      expect(node.isDirty).toBe(true);
      expect(document.getElementById(renderer.getStyleElementId())).toBeNull();
    });
  });

  // =========================================================================
  // Instance scoping must survive all of this (the Wave-3 invariant)
  // =========================================================================
  it('a second diagram is NOT re-themed when the first follows the OS', () => {
    const media = new FakeMedia();

    renderer = new SVGRenderer(engine, { colorMode: 'system', themes: THEMES });

    const otherEngine = new DiagramEngine();
    otherEngine.createDiagram('Other');
    const other = new SVGRenderer(otherEngine, {}, LIGHT_THEME); // pinned light

    media.set(MEDIA_PREFERS_DARK, true);

    expect(instanceVars(renderer)['--grafloria-node-fill']).toBe(DARK_THEME.colors.node.default.fill);
    expect(instanceVars(other)['--grafloria-node-fill']).toBe(LIGHT_THEME.colors.node.default.fill);

    other.dispose();
    otherEngine.destroy();
  });
});
