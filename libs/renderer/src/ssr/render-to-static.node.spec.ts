/**
 * @jest-environment node
 *
 * The SSR proof: this whole file runs with NO `window` and NO `document`.
 *
 * Importing `@grafloria/renderer` and constructing an `SVGRenderer` used to throw
 * `ReferenceError: document is not defined` right here (SVGRenderer.injectThemeCSS
 * reached straight for `document`), which is why nothing could server-render.
 * Keeping these tests in the `node` environment means any future DOM access
 * slipped into the render path fails loudly instead of silently making the
 * library browser-only again.
 */
import { renderToStaticSVG } from './render-to-static';
import { serializeVNodeToSVG } from './serialize-svg';
import { isBrowser, hasDocument } from '../platform';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import type { EdgeSpec, NodeSpec } from '../instance/model-input';

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 80, y: 90 }, size: { width: 140, height: 60 }, label: 'Start' },
  { id: 'b', position: { x: 420, y: 260 }, size: { width: 140, height: 60 }, label: 'End' },
];
const EDGES: EdgeSpec[] = [{ id: 'e1', source: 'a', target: 'b', type: 'orthogonal' }];

describe('renderToStaticSVG (node environment — no DOM)', () => {
  it('the environment really has no DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(hasDocument()).toBe(false);
    expect(isBrowser()).toBe(false);
  });

  it('renders a complete diagram to an SVG string', () => {
    const { svg, html, snapshot } = renderToStaticSVG({
      nodes: NODES,
      edges: EDGES,
      width: 800,
      height: 600,
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain('data-vnode-key="node-a"');
    expect(svg).toContain('data-vnode-key="node-b"');
    expect(svg).toContain('data-vnode-key="link-e1"');
    // Labels made it in — this is a real render, not a placeholder.
    expect(svg).toContain('Start');
    expect(svg).toContain('End');

    expect(html).toContain(svg);
    expect(snapshot.instanceId).toBe('grafloria-ssr');
  });

  it('produces deterministic output across two independent renders', () => {
    expect(renderToStaticSVG({ nodes: NODES, edges: EDGES }).svg).toBe(
      renderToStaticSVG({ nodes: NODES, edges: EDGES }).svg
    );
  });

  it('escapes XML in labels rather than emitting broken markup', () => {
    // (the label renderer wraps long text into <tspan> lines, so assert on the
    // escaping, not on the line breaks)
    const { svg } = renderToStaticSVG({
      nodes: [{ id: 'x', position: { x: 0, y: 0 }, label: 'a < b & c' }],
    });
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('a < b & c');
  });

  it('returns the stylesheet the diagram needs (the SVG itself is theme-independent)', () => {
    const light = renderToStaticSVG({ nodes: NODES, theme: LIGHT_THEME });
    const dark = renderToStaticSVG({ nodes: NODES, theme: DARK_THEME });

    // In CSS mode the theme is CSS VARIABLES, so the emitted geometry is
    // identical — that is precisely what makes hydration a no-op…
    expect(light.svg).toBe(dark.svg);
    // …and the whole theme difference lives in the returned stylesheet.
    expect(light.css).not.toBe(dark.css);
    expect(light.css).toContain('--grafloria-');
    expect(light.css).toContain('[data-grafloria-instance="grafloria-ssr"]');
  });

  it('serializeVNodeToSVG keeps camelCase SVG attributes verbatim', () => {
    const out = serializeVNodeToSVG({
      type: 'linearGradient',
      key: 'g1',
      props: { gradientUnits: 'userSpaceOnUse', strokeWidth: 2 },
      children: [],
    });

    expect(out).toContain('gradientUnits="userSpaceOnUse"'); // NOT gradient-units
    expect(out).toContain('stroke-width="2"'); // but real camelCase props kebab
    expect(out).toContain('data-vnode-key="g1"');
  });

  it('serializeVNodeToSVG never stringifies an event handler into an attribute', () => {
    const out = serializeVNodeToSVG({
      type: 'rect',
      props: { onClick: () => undefined, x: 1 },
      children: [],
    });
    expect(out).toBe('<rect x="1"></rect>');
  });
});
