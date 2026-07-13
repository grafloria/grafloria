/**
 * @jest-environment node
 *
 * THE claim of this card, tested where it actually matters: the SVG export path
 * runs with NO DOM AT ALL.
 *
 * Every other spec in `libs/renderer` runs under jsdom, where `document` exists
 * and a DOM dependency can hide forever. This file runs in the plain Node
 * environment — `document` is genuinely undefined — so it is the only place that
 * can prove a server (an SSR pass, a thumbnail worker, a print job) can build the
 * VNode tree AND serialize it.
 *
 * It also pins the honest boundary: PNG in bare Node THROWS, with instructions,
 * because there is no SVG engine to rasterize with. It does not pretend.
 */

import { SVGRenderer } from '../svg/svg-renderer';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import { canRasterizeInThisEnvironment } from './raster';

describe('headless export (no DOM)', () => {
  it('the test environment really has no document — otherwise this file proves nothing', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  function buildDiagram() {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('Headless')!;

    const a = new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 120, height: 60 } });
    a.setMetadata('label', 'Server');
    const b = new NodeModel({ id: 'b', type: 'basic', position: { x: 300, y: 120 }, size: { width: 120, height: 60 } });
    b.setMetadata('label', 'Thumbnail');
    b.setStyle({ fill: '#fee2e2' } as any);

    diagram.addNode(a);
    diagram.addNode(b);
    return engine;
  }

  it('constructs the renderer in CSS mode without a document (it used to throw)', () => {
    // The constructor injects a <style> element. Without a DOM there is nothing to
    // inject into — but that is a delivery detail of the theme, not a reason the
    // renderer cannot exist. It now no-ops instead of exploding, which is what makes
    // server-side rendering possible at all.
    const engine = buildDiagram();
    expect(() => new SVGRenderer(engine, {})).not.toThrow();
    engine.destroy();
  });

  it('renders and serializes a complete, standalone SVG in plain Node', async () => {
    const engine = buildDiagram();
    const renderer = new SVGRenderer(engine, {});

    const svg = await renderer.export('svg');

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('>Server</text>');
    expect(svg).toContain('>Thumbnail</text>');

    // The theme resolved — with no stylesheet anywhere in the process.
    expect(svg).toContain(`fill="${LIGHT_THEME.colors.node.default.fill}"`);
    expect(svg).toContain(LIGHT_THEME.typography.fontFamily.default);
    expect(svg).toContain('fill="#fee2e2"'); // the node's own style still wins

    expect(svg).not.toContain('var(--');
    // The xmlns is a namespace IDENTIFIER, not a fetchable reference — strip it,
    // then assert nothing else in the file points outside the file.
    const refs = svg.replace(/xmlns(:\w+)?="[^"]*"/g, '');
    expect(/https?:\/\/|url\((?!#)|<image\b|@import|xlink:href/.test(refs)).toBe(false);

    renderer.dispose();
    engine.destroy();
  });

  it('is deterministic across independent renderers — byte-identical', async () => {
    const one = buildDiagram();
    const two = buildDiagram();
    const rendererOne = new SVGRenderer(one, {});
    const rendererTwo = new SVGRenderer(two, {});

    expect(await rendererTwo.export('svg')).toBe(await rendererOne.export('svg'));

    rendererOne.dispose();
    rendererTwo.dispose();
    one.destroy();
    two.destroy();
  });

  it('carries the theme it was given', async () => {
    const engine = buildDiagram();
    const renderer = new SVGRenderer(engine, {}, DARK_THEME);

    const svg = await renderer.export('svg');
    expect(svg).toContain(`fill="${DARK_THEME.colors.node.default.fill}"`);
    expect(svg).not.toContain(`fill="${LIGHT_THEME.colors.node.default.fill}"`);

    renderer.dispose();
    engine.destroy();
  });

  describe('raster in bare Node — the honest boundary', () => {
    it('knows there is no canvas here', () => {
      expect(canRasterizeInThisEnvironment()).toBe(false);
    });

    it('THROWS with instructions instead of returning a broken image', async () => {
      const engine = buildDiagram();
      const renderer = new SVGRenderer(engine, {});

      await expect(renderer.export('png')).rejects.toThrow(/rasterBackend|rasterizer/i);

      renderer.dispose();
      engine.destroy();
    });

    it('works in Node the moment a backend is supplied (resvg-js / sharp / puppeteer)', async () => {
      const engine = buildDiagram();
      const renderer = new SVGRenderer(engine, {});

      const png = await renderer.export('png', {
        scale: 2,
        rasterBackend: {
          rasterize: async ({ svg, width, height }) => {
            // A real backend hands this SVG to an SVG engine. It is standalone —
            // which is exactly why resvg/sharp can render it at all.
            expect(svg).toContain('<svg xmlns=');
            expect(width).toBeGreaterThan(0);
            expect(height).toBeGreaterThan(0);
            return 'data:image/png;base64,STUB';
          },
        },
      });

      expect(png).toBe('data:image/png;base64,STUB');

      renderer.dispose();
      engine.destroy();
    });
  });
});
