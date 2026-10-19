// svg-renderer.edge-label-theme.spec.ts
//
// A flowchart pipe label (`A -->|Submit| B`) in the DARK theme drew black text
// on the theme's dark label chip — 1.43:1, unreadable. The chip followed the
// theme (`theme.colors.background.surface`), the text did not (LabelRenderer
// fell back to a hard-coded '#000000'). State-diagram labels were fine only
// because they came in by another road that passed the theme's colours.
//
// These tests resolve the colours the renderer actually paints — through the
// instance's variable block in CSS mode, as literals in programmatic mode — and
// hold every label of the fence to WCAG AA (4.5:1) against its own chip.

import { DiagramEngine, importDiagramText, type LinkModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import { LabelRenderer } from './LabelRenderer';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import { resolveThemeVars } from '../themes/theme-vars';
import { contrastRatio } from '../themes/contrast';
import { CanvasStyleResolver } from '../canvas/style-resolution';
import type { Theme } from '../types/theme.types';
import type { VNode } from '../types/vnode.types';

const FENCE = 'flowchart LR\n    Draft -->|Submit| R["In review"]\n    R -->|Approve| Approved\n    R -->|Reject| Draft';

function renderFence(theme: Theme, useCSSMode: boolean): VNode {
  const { diagram } = importDiagramText(FENCE);
  const engine = new DiagramEngine();
  engine.setDiagram(diagram);
  const renderer = new SVGRenderer(engine, { useCSSMode, qualityGovernor: false }, theme);
  return renderer.render({ x: 0, y: 0, width: 1200, height: 800 }, 1) as VNode;
}

function findAll(node: VNode | null | undefined, pred: (n: VNode) => boolean, out: VNode[] = []): VNode[] {
  if (!node) return out;
  if (pred(node)) out.push(node);
  for (const child of (node.children ?? []) as VNode[]) findAll(child, pred, out);
  return out;
}

const hasClass = (n: VNode, cls: string): boolean =>
  typeof n.props?.['className'] === 'string' && (n.props['className'] as string).split(/\s+/).includes(cls);

/** The fill a browser would paint: inline style beats the attribute; var() resolves against the theme block. */
function paintedFill(node: VNode, theme: Theme): string | undefined {
  const style = node.props?.['style'];
  const inline = style && typeof style === 'object' ? (style as Record<string, string>)['fill'] : undefined;
  const raw = inline ?? (node.props?.['fill'] as string | undefined);
  if (!raw) return undefined;
  const v = raw.match(/^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/i);
  if (!v) return raw;
  return resolveThemeVars(theme)[v[1]] ?? v[2];
}

describe('edge-label text follows the theme (flowchart pipe labels)', () => {
  for (const useCSSMode of [true, false]) {
    describe(useCSSMode ? 'CSS mode' : 'programmatic mode', () => {
      for (const theme of [DARK_THEME, LIGHT_THEME]) {
        it(`${theme.name}: every pipe label reads at >= 4.5:1 against its chip`, () => {
          const root = renderFence(theme, useCSSMode);
          const groups = findAll(root, (n) => hasClass(n, 'link-label-group'));
          expect(groups).toHaveLength(3);
          for (const group of groups) {
            const [text] = findAll(group, (n) => hasClass(n, 'link-label-text'));
            const [chip] = findAll(group, (n) => hasClass(n, 'link-label-bg'));
            const fg = paintedFill(text, theme);
            const bg = paintedFill(chip, theme);
            expect(fg).toBeDefined();
            expect(bg).toBeDefined();
            expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    });
  }

  it('the dark text is the theme ink (text.primary), as the state-diagram labels already were', () => {
    const root = renderFence(DARK_THEME, false);
    const [text] = findAll(root, (n) => hasClass(n, 'link-label-text'));
    expect(paintedFill(text, DARK_THEME)).toBe(DARK_THEME.colors.text.primary);
  });
});

describe('LabelRenderer: theme defaults', () => {
  const { diagram } = importDiagramText('flowchart LR\n  A -->|go| B');
  const link = diagram.getLinks()[0] as LinkModel;
  const label = link.labels[0];
  const renderer = new LabelRenderer();
  // The line as painted — a bare imported link has no route of its own yet.
  const path = [{ x: 0, y: 0 }, { x: 120, y: 0 }];

  it('with a theme, the text falls back to theme.colors.text.primary (not black)', () => {
    const vnode = renderer.renderLabel(label, link, { theme: DARK_THEME, path })!;
    const [text] = findAll(vnode, (n) => hasClass(n, 'link-label-text'));
    expect(paintedFill(text, DARK_THEME)).toBe(DARK_THEME.colors.text.primary);
  });

  it('in CSS mode both paints are theme variables, written as inline style (attributes cannot hold var())', () => {
    const vnode = renderer.renderLabel(label, link, { theme: DARK_THEME, cssMode: true, path })!;
    const [text] = findAll(vnode, (n) => hasClass(n, 'link-label-text'));
    const [chip] = findAll(vnode, (n) => hasClass(n, 'link-label-bg'));
    expect((text.props['style'] as Record<string, string>)['fill']).toBe('var(--grafloria-link-label-color)');
    expect((chip.props['style'] as Record<string, string>)['fill']).toBe('var(--grafloria-link-label-background)');
    expect(text.props['fill']).toBeUndefined();
    expect(chip.props['fill']).toBeUndefined();
  });

  it("an author's own colour still wins, in either mode", () => {
    const own = { ...label, style: { ...(label.style ?? {}), color: '#b91c1c', background: '#fef2f2' } };
    for (const cssMode of [false, true]) {
      const vnode = renderer.renderLabel(own, link, { theme: DARK_THEME, cssMode, path })!;
      const [text] = findAll(vnode, (n) => hasClass(n, 'link-label-text'));
      const [chip] = findAll(vnode, (n) => hasClass(n, 'link-label-bg'));
      expect(paintedFill(text, DARK_THEME)).toBe('#b91c1c');
      expect(paintedFill(chip, DARK_THEME)).toBe('#fef2f2');
    }
  });

  it('with no theme at all (the bare public API) it keeps its old black-on-nothing default', () => {
    const vnode = renderer.renderLabel(label, link, { path })!;
    const [text] = findAll(vnode, (n) => hasClass(n, 'link-label-text'));
    expect(findAll(vnode, (n) => hasClass(n, 'link-label-bg'))).toHaveLength(0);
    expect(paintedFill(text, LIGHT_THEME)).toBe('#000000');
  });
});

// The CSS-mode tree now carries `var(--grafloria-link-label-*)` paints. Two
// consumers read that tree WITHOUT a stylesheet — the standalone SVG file and the
// canvas painter — and each must resolve the variables to the theme's values, or
// the label paints black-on-black there. (The arrowhead's `var(--grafloria-link-stroke, …)`
// had the same leak into exported files before this.)
describe('consumers without a stylesheet resolve the label variables', () => {
  it('a standalone SVG export carries literal paints — no var(--…) anywhere', async () => {
    const { diagram } = importDiagramText(FENCE);
    const engine = new DiagramEngine();
    engine.setDiagram(diagram);
    const renderer = new SVGRenderer(engine, { qualityGovernor: false }, DARK_THEME);
    renderer.render({ x: 0, y: 0, width: 1200, height: 800 }, 1);
    const file = await renderer.export('svg');
    expect(file).toContain('Submit');
    expect(file).not.toContain('var(--');
    const text = file.match(/<text[^>]*class="link-label-text"[^>]*>/)![0];
    const chip = file.match(/<rect[^>]*class="link-label-bg"[^>]*>/)![0];
    expect(text).toContain(`fill="${DARK_THEME.colors.text.primary}"`);
    expect(chip).toContain(`fill="${DARK_THEME.colors.background.surface}"`);
  });

  it('the canvas painter resolves an inline var() paint through the theme', () => {
    const resolver = new CanvasStyleResolver({ theme: DARK_THEME });
    const base = resolver.rootStyle();
    const text = resolver.resolve({ className: 'link-label-text', style: { fill: 'var(--grafloria-link-label-color)' } }, base);
    const chip = resolver.resolve({ className: 'link-label-bg', style: { fill: 'var(--grafloria-link-label-background)' } }, base);
    const arrow = resolver.resolve({ style: 'fill:var(--grafloria-link-stroke, #123456)' }, base);
    expect(text.fill).toBe(DARK_THEME.colors.text.primary);
    expect(chip.fill).toBe(DARK_THEME.colors.background.surface);
    expect(arrow.fill).toBe(DARK_THEME.colors.link.default);
  });
});
