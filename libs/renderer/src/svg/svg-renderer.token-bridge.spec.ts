// Card "design-token bridge + accessibility-aware theming" — the renderer half.
//
// The bridge is only real if it actually OVERRIDES the theme in the cascade, and
// the a11y blocks are only real if they in turn override the bridge. Both come
// down to source order inside one `<style>` element, so both are read back out of
// the DOM rather than out of the generators.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine } from '@grafloria/engine';
import {
  BRIDGEABLE_TOKENS,
  DARK_THEME,
  LIGHT_THEME,
  muiBridge,
  shadcnBridge,
  tailwindBridge,
  THEME_VARS,
} from '../themes';

/** Every <style> this renderer owns, in DOCUMENT ORDER — which is what decides the cascade. */
function ownedStyles(renderer: SVGRenderer): HTMLStyleElement[] {
  return Array.from(document.head.querySelectorAll('style')).filter(el =>
    [renderer.getStyleElementId(), renderer.getOverrideElementId()].includes(el.id)
  );
}

function overrideCss(renderer: SVGRenderer): string {
  return document.getElementById(renderer.getOverrideElementId())?.textContent ?? '';
}

describe('SVGRenderer — design-token bridge', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    engine.createDiagram('Test');
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
    document.head.querySelectorAll('style[id^="grafloria-renderer-"]').forEach(el => el.remove());
  });

  // =========================================================================
  // The mechanism: the bridge must come AFTER the theme, or it does nothing.
  // =========================================================================
  describe('cascade order', () => {
    it('the override block is emitted AFTER the theme block', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: { 'node.fill': 'var(--card)' } }, LIGHT_THEME);

      const ids = ownedStyles(renderer).map(el => el.id);
      expect(ids).toEqual([renderer.getStyleElementId(), renderer.getOverrideElementId()]);
      // Same selector, same specificity → later wins. If the order ever flips,
      // the bridge silently stops working, which is why this is pinned.
    });

    it('…and STAYS after it across a theme re-injection', () => {
      // setTheme() removes and re-appends the theme element, which would move it
      // to the END of <head> — putting it after the bridge and undoing it.
      renderer = new SVGRenderer(engine, { tokenBridge: { 'node.fill': 'var(--card)' } }, LIGHT_THEME);
      renderer.setTheme(DARK_THEME);

      const ids = ownedStyles(renderer).map(el => el.id);
      expect(ids).toEqual([renderer.getStyleElementId(), renderer.getOverrideElementId()]);
    });

    it('the bridge overrides the theme value for the token it maps', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: { 'node.fill': 'var(--card)' } }, LIGHT_THEME);

      // The theme still declares its own value…
      const themeCss = document.getElementById(renderer.getStyleElementId())!.textContent!;
      expect(themeCss).toContain(`--grafloria-node-fill: ${LIGHT_THEME.colors.node.default.fill}`);
      // …and the override, coming later, re-points it at the host's token.
      expect(overrideCss(renderer)).toContain('--grafloria-node-fill: var(--card);');
    });

    it('is scoped to THIS instance — a second diagram is untouched', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: { 'node.fill': 'var(--card)' } }, LIGHT_THEME);

      const otherEngine = new DiagramEngine();
      otherEngine.createDiagram('Other');
      const other = new SVGRenderer(otherEngine, {}, LIGHT_THEME);

      expect(overrideCss(renderer)).toContain(`[data-grafloria-instance="${renderer.getInstanceId()}"]`);
      expect(overrideCss(other)).not.toContain('--grafloria-node-fill: var(--card)');

      other.dispose();
      otherEngine.destroy();
    });
  });

  // =========================================================================
  // Runtime
  // =========================================================================
  describe('setTokenBridge()', () => {
    it('applies a bridge after construction', () => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      expect(overrideCss(renderer)).not.toContain('--grafloria-node-fill: var(--card)');

      renderer.setTokenBridge({ 'node.fill': 'var(--card)' });

      expect(overrideCss(renderer)).toContain('--grafloria-node-fill: var(--card);');
      expect(renderer.getTokenBridge()).toEqual({ 'node.fill': 'var(--card)' });
    });

    it('removes it again', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: { 'node.fill': 'var(--card)' } }, LIGHT_THEME);
      renderer.setTokenBridge(null);

      expect(overrideCss(renderer)).not.toContain('--grafloria-node-fill: var(--card)');
      expect(renderer.getTokenBridge()).toBeUndefined();
    });

    it('accepts a raw custom property as the key, for the odd variable', () => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      renderer.setTokenBridge({ '--grafloria-node-fill': 'red' });
      expect(overrideCss(renderer)).toContain('--grafloria-node-fill: red;');
    });

    it('bridges a CALLER token (category), not just chrome', () => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      renderer.setTokenBridge({ 'category.critical': 'var(--destructive)' });
      expect(overrideCss(renderer)).toContain('--grafloria-category-critical: var(--destructive);');
    });

    it('goes with the renderer on dispose', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: { 'node.fill': 'var(--card)' } }, LIGHT_THEME);
      const id = renderer.getOverrideElementId();
      renderer.dispose();
      expect(document.getElementById(id)).toBeNull();
    });

    it('is a no-op in programmatic mode (there is no stylesheet to bridge)', () => {
      renderer = new SVGRenderer(engine, { useCSSMode: false }, LIGHT_THEME);
      renderer.setTokenBridge({ 'node.fill': 'var(--card)' });
      expect(document.getElementById(renderer.getOverrideElementId())).toBeNull();
    });
  });

  // =========================================================================
  // Presets — the "one-line adapter" the card promises
  // =========================================================================
  describe('presets', () => {
    it.each([
      ['shadcn', shadcnBridge()],
      ['mui', muiBridge()],
      ['tailwind', tailwindBridge()],
    ])('%s maps only tokens that EXIST (a typo would silently do nothing)', (_name, bridge) => {
      const known = new Set<string>(BRIDGEABLE_TOKENS);
      for (const token of Object.keys(bridge)) {
        expect(known.has(token)).toBe(true);
      }
    });

    it.each([
      ['shadcn', shadcnBridge()],
      ['mui', muiBridge()],
      ['tailwind', tailwindBridge()],
    ])('%s covers the paint every diagram shows: node, link, label, port', (_name, bridge) => {
      for (const token of ['node.fill', 'node.stroke', 'link.stroke', 'label.color', 'port.fill']) {
        expect(bridge[token]).toBeDefined();
      }
    });

    it('shadcn wraps its bare colour components for the generation in use', () => {
      expect(shadcnBridge()['node.fill']).toBe('hsl(var(--card))');
      expect(shadcnBridge({ space: 'oklch' })['node.fill']).toBe('oklch(var(--card))');
      expect(shadcnBridge({ space: 'raw' })['node.fill']).toBe('var(--card)');
    });

    it('a preset reaches the DOM as real declarations', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: shadcnBridge() }, LIGHT_THEME);
      const css = overrideCss(renderer);

      expect(css).toContain('--grafloria-node-fill: hsl(var(--card));');
      expect(css).toContain('--grafloria-link-stroke: hsl(var(--border));');
      expect(css).toContain('--grafloria-label-color: hsl(var(--card-foreground));');
    });
  });

  // =========================================================================
  // Accessibility — the floor every diagram gets, bridge or no bridge
  // =========================================================================
  describe('accessibility media queries', () => {
    it('every renderer emits them, even with no bridge and no colorMode', () => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      const css = overrideCss(renderer);

      expect(css).toContain('@media (forced-colors: active)');
      expect(css).toContain('@media (prefers-contrast: more)');
    });

    it('forced-colors rebinds the VARIABLES to system colours — so the whole engine follows', () => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      const css = overrideCss(renderer);

      expect(css).toContain('--grafloria-node-fill: Canvas;');
      expect(css).toContain('--grafloria-node-stroke: CanvasText;');
      expect(css).toContain('--grafloria-node-selected-stroke: Highlight;');
      expect(css).toContain('--grafloria-label-color: CanvasText;');
      expect(css).toContain('--grafloria-link-stroke: CanvasText;');
    });

    it('forced-colors comes LAST — the OS outranks both the theme and the host', () => {
      renderer = new SVGRenderer(engine, { tokenBridge: shadcnBridge() }, LIGHT_THEME);
      const css = overrideCss(renderer);

      const bridgeAt = css.indexOf('hsl(var(--card))');
      const contrastAt = css.indexOf('@media (prefers-contrast: more)');
      const forcedAt = css.indexOf('@media (forced-colors: active)');

      expect(bridgeAt).toBeGreaterThanOrEqual(0);
      expect(bridgeAt).toBeLessThan(contrastAt);
      expect(contrastAt).toBeLessThan(forcedAt);
    });

    it('prefers-contrast thickens strokes — the half of contrast colour cannot supply', () => {
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      const css = overrideCss(renderer);
      const block = css.slice(css.indexOf('@media (prefers-contrast: more)'));

      expect(block).toContain('--grafloria-node-stroke-width: 2px;');
      expect(block).toContain('--grafloria-link-stroke-width: 3px;');
      expect(block).toContain('--grafloria-node-selected-stroke-width: 4px;');
    });

    it('every variable it rebinds is one the stylesheet actually reads', () => {
      // A forced-colors override on a variable nothing consumes is dead CSS.
      renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
      const css = overrideCss(renderer);
      const declared = [...css.matchAll(/(--grafloria-[\w-]+):/g)].map(match => match[1]);
      const known = new Set(Object.values(THEME_VARS).map(binding => binding.cssVar));

      expect(declared.length).toBeGreaterThan(10);
      for (const name of declared) {
        expect(known.has(name)).toBe(true);
      }
    });
  });
});
