/**
 * @jest-environment node
 *
 * ONE server render, any page theme.
 *
 * `renderToStaticSVG()` promises a theme-INDEPENDENT `svg` (the theme lives in
 * the `--grafloria-*` variable block of `css`). A docs site that prerenders a
 * Mermaid fence once and serves it to light and dark readers depends on that.
 * It was broken for every labelled line: the label's text and chip were written
 * as presentation attributes (`fill="#000000"`, `fill="#f9fafb"`), so a light and
 * a dark render of the same fence differed exactly there — and the dark one
 * painted black text on a dark chip (1.43:1).
 *
 * The check is the literal promise: render the same fence under LIGHT_THEME and
 * DARK_THEME and the two `svg` strings are byte-identical; only `css` differs.
 */
import { importDiagramText, runDeterministic } from '@grafloria/engine';
import { renderToStaticSVG } from './render-to-static';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import { contrastRatio } from '../themes/contrast';
import type { Theme } from '../types/theme.types';

/** Import + render under one deterministic scope, so link ids match between runs. */
function ssr(text: string, theme: Theme): { svg: string; css: string } {
  return runDeterministic(() => {
    const { diagram, errors } = importDiagramText(text);
    expect(errors ?? []).toEqual([]);
    const out = renderToStaticSVG({
      // Live models pass straight through (model-input's reconcilers accept them).
      nodes: diagram.getNodes() as never,
      edges: diagram.getLinks() as never,
      groups: diagram.getGroups() as never,
      theme,
      width: 900,
      height: 600,
      fitView: true,
      instanceId: 'gf-doc',
      standalone: true,
    });
    return { svg: out.svg, css: out.css };
  });
}

/** The value of `--name` in this render's variable block. */
function cssVar(css: string, name: string): string | undefined {
  const m = css.match(new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*([^;]+);`));
  return m?.[1].trim();
}

/** A paint as the browser would resolve it: `var(--x)` looked up in the block. */
function resolvePaint(value: string | undefined, css: string): string | undefined {
  if (!value) return undefined;
  const v = value.match(/^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/i);
  if (!v) return value.trim();
  return cssVar(css, v[1]) ?? v[2]?.trim();
}

/** fill of an element: its inline style wins over its attribute (as in CSS). */
function fillOf(element: string): string | undefined {
  const inline = element.match(/style="[^"]*\bfill:\s*([^;"]+)/);
  if (inline) return inline[1].trim();
  return element.match(/\sfill="([^"]+)"/)?.[1];
}

const PIPE_FLOW = 'flowchart LR\n    Draft -->|Submit| R["In review"]\n    R -->|Approve| Approved\n    R -->|Reject| Draft';

describe('renderToStaticSVG — one SVG for every page theme', () => {
  it('a flowchart with pipe labels: light and dark SVG strings are identical, only the CSS differs', () => {
    const light = ssr(PIPE_FLOW, LIGHT_THEME);
    const dark = ssr(PIPE_FLOW, DARK_THEME);
    // Sanity: the labels are really in there.
    expect(light.svg).toContain('Submit');
    expect(light.svg).toContain('link-label-text');
    expect(light.svg).toBe(dark.svg);
    expect(light.css).not.toBe(dark.css);
  });

  // The rest of what differed between a light and a dark render of the features
  // fences: a subgraph's frame, band and caption, and a two-line label's muted
  // second line — all written as the theme's literals.
  it.each([
    ['a subgraph frame', 'flowchart LR\n    subgraph Sales[Sales team]\n      direction TB\n      Inquiry --> Offer\n    end\n    subgraph Ops[Operations]\n      Order --> Delivery\n    end\n    Offer --> Order', 'group-frame-label'],
    ['a two-line (sublabel) node', 'flowchart LR\n    A["Invoice<br/>draft"] --> B["**Approved**<br/>by finance"]\n    B -->|"**Send** to client"| C', 'diagram-sublabel'],
  ])('%s: light and dark SVG strings are identical', (_name, fence, marker) => {
    const light = ssr(fence, LIGHT_THEME);
    const dark = ssr(fence, DARK_THEME);
    expect(light.svg).toContain(marker);
    expect(light.svg).toBe(dark.svg);
  });

  it('the label colours are variables of the theme block, defined in both themes', () => {
    const light = ssr(PIPE_FLOW, LIGHT_THEME);
    const dark = ssr(PIPE_FLOW, DARK_THEME);
    for (const name of ['--grafloria-link-label-color', '--grafloria-link-label-background']) {
      expect(light.svg).toContain(`var(${name})`);
      expect(cssVar(light.css, name)).toBeDefined();
      expect(cssVar(dark.css, name)).toBeDefined();
    }
    expect(cssVar(dark.css, '--grafloria-link-label-color')).toBe(DARK_THEME.colors.text.primary);
    expect(cssVar(dark.css, '--grafloria-link-label-background')).toBe(DARK_THEME.colors.background.surface);
  });

  it('every pipe label reads at >= 4.5:1 in BOTH themes, resolved through the shipped CSS', () => {
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      const { svg, css } = ssr(PIPE_FLOW, theme);
      const groups = svg.split('class="link-label-group"').slice(1);
      expect(groups.length).toBe(3);
      for (const group of groups) {
        const text = group.match(/<text[^>]*class="link-label-text"[^>]*>/)?.[0] ?? '';
        const bg = group.match(/<rect[^>]*class="link-label-bg"[^>]*>/)?.[0] ?? '';
        const fg = resolvePaint(fillOf(text), css);
        const back = resolvePaint(fillOf(bg), css);
        expect(fg).toBeDefined();
        expect(back).toBeDefined();
        expect(contrastRatio(fg!, back!)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
