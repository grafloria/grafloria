// SVGRenderer.export() — the whole pipeline, driven through the real engine.
//
// The card's claim is that ONE VNode contract yields both the live picture and a
// standalone file. These tests hold the file end of that claim to four promises:
//
//   1. STANDALONE  — no `var(--…)`, no external reference, and the theme's values
//                    are actually IN the bytes (open it in Inkscape and it looks
//                    like the app).
//   2. FAITHFUL    — the documented cascade (theme < type-default < named-class <
//                    element-inline < state) survives flattening, including the
//                    CSS priority order presentation-attr < rule < inline-style.
//   3. DETERMINISTIC — same model ⇒ byte-identical output, every time, in any
//                    process (no counters, no clock, no randomness leak).
//   4. HONEST      — what it cannot do (foreignObject content, fonts, animation)
//                    it says, in `warnings`, instead of quietly dropping.

import { SVGRenderer } from '../svg/svg-renderer';
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  LinkModel,
  PortModel,
  PortVisibilityStrategy,
} from '@grafloria/engine';
import { DARK_THEME, LIGHT_THEME } from '../themes';
import { exportSvg } from './svg-export';
import type { RasterBackend, RasterizeRequest } from './raster';
import type { VNode } from '../types';

/**
 * Everything a standalone file must NOT contain: a fetchable reference of any
 * kind. `xmlns="http://www.w3.org/2000/svg"` is a namespace IDENTIFIER, not a
 * reference — nothing ever fetches it — so it is stripped before the check.
 */
const EXTERNAL_REF = /https?:\/\/|url\((?!#)|<image\b|@import|xlink:href/;
function hasExternalRef(svg: string): boolean {
  return EXTERNAL_REF.test(svg.replace(/xmlns(:\w+)?="[^"]*"/g, ''));
}

describe('SVGRenderer.export()', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Export')!;
    renderer = new SVGRenderer(engine, {}); // CSS mode + caching: the live defaults
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function addNode(id: string, x = 0, y = 0, style?: Record<string, unknown>): NodeModel {
    const node = new NodeModel({
      id,
      type: 'basic',
      position: { x, y },
      size: { width: 100, height: 50 },
    });
    if (style) node.setStyle(style as any);
    diagram.addNode(node);
    return node;
  }

  async function svg(options = {}): Promise<string> {
    return renderer.export('svg', options);
  }

  // -------------------------------------------------------------------------
  // 1. Standalone
  // -------------------------------------------------------------------------

  describe('standalone output', () => {
    it('is a well-formed SVG document with the SVG namespace and an intrinsic size', async () => {
      addNode('n1', 100, 100);
      const out = await svg();

      expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(out.endsWith('</svg>')).toBe(true);
      expect(out).toMatch(/viewBox="80 80 140 90"/); // content bounds + 20px padding
      expect(out).toMatch(/width="140" height="90"/);
    });

    it('contains NO unresolved CSS variables', async () => {
      addNode('n1');
      addNode('n2', 200, 0, { fill: '#ff0000' });
      expect(await svg()).not.toContain('var(--');
    });

    it('contains NO external references (fonts, images, stylesheets, url() to anywhere but #)', async () => {
      const a = addNode('n1');
      const b = addNode('n2', 300, 0);
      a.setMetadata('label', 'Alpha');
      b.setMetadata('label', 'Beta');
      const out = await svg();
      expect(hasExternalRef(out)).toBe(false);
    });

    it('bakes the THEME values into the bytes (a file has no stylesheet to fall back on)', async () => {
      addNode('n1');
      const out = await svg();

      // The node VNode carries no fill at all in CSS mode — `.diagram-node { fill:
      // var(--grafloria-node-fill) }` painted it live. The export must have resolved it
      // into a concrete presentation attribute.
      expect(out).toContain(`fill="${LIGHT_THEME.colors.node.default.fill}"`);
      expect(out).toContain(`stroke="${LIGHT_THEME.colors.node.default.stroke}"`);
      expect(out).toContain(`stroke-width="${LIGHT_THEME.nodes.default.strokeWidth}px"`);
    });

    it('follows the renderer\'s theme: a dark diagram exports dark', async () => {
      addNode('n1');
      renderer.setTheme(DARK_THEME);
      const out = await svg();

      expect(out).toContain(`fill="${DARK_THEME.colors.node.default.fill}"`);
      expect(out).not.toContain(`fill="${LIGHT_THEME.colors.node.default.fill}"`);
    });

    it('flattens label typography, which lives ONLY in the stylesheet', async () => {
      addNode('n1').setMetadata('label', 'Hello');
      const out = await svg();

      expect(out).toContain(`font-family="${LIGHT_THEME.typography.fontFamily.default}"`);
      expect(out).toContain(`font-size="${LIGHT_THEME.typography.fontSize.md}px"`);
      expect(out).toContain(`fill="${LIGHT_THEME.colors.text.primary}"`);
      expect(out).toContain('>Hello</text>');
    });

    it('paints a background rect when asked, and nothing when not', async () => {
      addNode('n1');
      expect(await svg({ backgroundColor: '#fafafa' })).toContain(
        '<rect x="-20" y="-20" width="140" height="90" fill="#fafafa"/>'
      );
      expect(await svg()).not.toContain('#fafafa');
    });

    it('scale multiplies the intrinsic size but never the viewBox (same picture, more pixels)', async () => {
      addNode('n1');
      const out = await svg({ scale: 2 });
      expect(out).toContain('viewBox="-20 -20 140 90"');
      expect(out).toContain('width="280" height="180"');
    });

    it('embedFontCss is the font seam — verbatim CSS in <defs>, CDATA-wrapped', async () => {
      addNode('n1');
      const face = "@font-face{font-family:'Inter';src:url(data:font/woff2;base64,AAAA) format('woff2')}";
      const out = await svg({ embedFontCss: face });

      expect(out).toContain('<defs><style type="text/css"><![CDATA[');
      expect(out).toContain(face);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Faithful — the cascade survives flattening
  // -------------------------------------------------------------------------

  describe('the style cascade survives the flattening', () => {
    it("element-inline beats the theme (a node's own fill is in the file)", async () => {
      addNode('n1', 0, 0, { fill: '#123456', stroke: '#654321', strokeWidth: 4 });
      const out = await svg();

      // ONE value per property: the cascade's winner, as a presentation attribute.
      expect(out).toContain('fill="#123456"');
      expect(out).toContain('stroke="#654321"');
      expect(out).toContain('stroke-width="4"');
      expect(out).not.toContain(`fill="${LIGHT_THEME.colors.node.default.fill}"`);
    });

    it('state beats element-inline (a selected node exports selected)', async () => {
      const node = addNode('n1', 0, 0, { fill: '#123456' });
      diagram.selectNode(node);
      const out = await svg();

      expect(out).toContain(`fill="${LIGHT_THEME.colors.node.selected.fill}"`);
      expect(out).not.toContain('#123456');
    });

    it("REGRESSION: a 'spread' shape (ellipse) keeps its own fill — the stylesheet used to eat it", async () => {
      // A presentation attribute LOSES to `.diagram-node { fill: var(…) }`, so the
      // spread-mode shapes (ellipse / hexagon / every extended figure) rendered the
      // theme fill instead of their own, live AND on export. buildShapeBody now
      // hoists the paint into an inline style for those shapes too.
      const node = addNode('n1');
      node.setMetadata('shape', { type: 'ellipse', fill: '#e8f5e9', stroke: '#4caf50' });
      const out = await svg();

      expect(out).toMatch(/<ellipse[^>]*fill="#e8f5e9"/);
      expect(out).toMatch(/<ellipse[^>]*stroke="#4caf50"/);
      // and the theme fill must NOT be what paints the ellipse
      expect(out).not.toMatch(/<ellipse[^>]*fill="#ffffff"/);
    });

    it('a visible port exports with the port palette, not the node palette', async () => {
      engine.setInteractionConfig({ portVisibility: PortVisibilityStrategy.ALWAYS });
      const node = addNode('n1');
      node.addPort(new PortModel({ id: 'p1', type: 'output', side: 'right' }));
      const out = await svg();

      // `.port-output { stroke: var(--grafloria-port-output) }` lives ONLY in the
      // stylesheet — the flattener has to have resolved it.
      expect(out).toMatch(
        new RegExp(`<circle[^>]*stroke="${LIGHT_THEME.colors.port.output}"`)
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Deterministic
  // -------------------------------------------------------------------------

  describe('determinism', () => {
    it('two exports of the same model are byte-identical', async () => {
      const a = addNode('n1');
      const b = addNode('n2', 300, 0);
      a.setMetadata('label', 'A');
      b.setMetadata('label', 'B');

      expect(await svg()).toBe(await svg());
    });

    it('two RENDERERS of the same model are byte-identical (no instance counter leaks in)', async () => {
      addNode('n1').setMetadata('label', 'A');
      const first = await svg();

      const second = new SVGRenderer(engine, {});
      try {
        // `data-grafloria-instance` differs between the two (grafloria-N is a global
        // counter) — which is exactly why the serializer must drop it.
        expect(await second.export('svg')).toBe(first);
      } finally {
        second.dispose();
      }
      expect(first).not.toContain('data-grafloria-instance');
      expect(first).not.toContain('grafloria-1');
    });

    it('is a stable snapshot — byte-for-byte', () => {
      // Hand-built tree (no engine ids), so this pins the EXACT bytes of the
      // serializer + flattener, not just their self-consistency.
      const tree: VNode = {
        type: 'svg',
        key: 'diagram-root',
        props: { viewBox: '0 0 100 50', className: 'grafloria-diagram', 'data-grafloria-instance': 'grafloria-9' },
        children: [
          {
            type: 'g',
            key: 'node-a',
            props: { transform: 'translate(0, 0)', className: 'node-group' },
            children: [
              { type: 'rect', props: { width: 100, height: 50, rx: 4, className: 'diagram-node' } },
              { type: 'text', props: { x: 50, y: 25, textAnchor: 'middle', className: 'diagram-label', textContent: 'A' } },
            ],
          },
        ],
      };

      expect(exportSvg(tree, { theme: LIGHT_THEME }).svg).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50" class="grafloria-diagram">' +
          '<g transform="translate(0, 0)" class="node-group">' +
          '<rect width="100" height="50" rx="4" class="diagram-node" fill="#ffffff" stroke="#d1d5db" stroke-width="1px"/>' +
          '<text x="50" y="25" text-anchor="middle" class="diagram-label" ' +
          'font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" ' +
          'font-size="14px" fill="#111827">A</text>' +
          '</g>' +
          '</svg>'
      );
    });

    it('does not leak the foreignObject container id (a global counter) into the bytes', async () => {
      const node = addNode('n1');
      node.setMetadata('useForeignObject', true);
      const out = await svg();

      expect(out).toContain('<foreignObject');
      expect(out).not.toContain('container-id');
      expect(out).not.toMatch(/fo-n1-\d+/);
    });
  });

  // -------------------------------------------------------------------------
  // paint servers + filters: everything self-contained in <defs>
  // -------------------------------------------------------------------------

  describe('defs', () => {
    it('a gradient fill exports as a real <linearGradient> referenced by url(#…)', async () => {
      addNode('n1', 0, 0, {
        fill: {
          type: 'linear',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          stops: [
            { offset: 0, color: '#ff0000' },
            { offset: 1, color: '#0000ff' },
          ],
        },
      });
      const out = await svg();

      const id = /url\(#(grafloria-def-[a-z0-9]+)\)/.exec(out)?.[1];
      expect(id).toBeDefined();
      expect(out).toContain(`<linearGradient id="${id}"`);
      expect(out).toContain('<stop offset="0" stop-color="#ff0000"/>');
      expect(hasExternalRef(out)).toBe(false); // url(#…) is internal, and stays internal
    });

    it('the node shadow\'s CSS blur() becomes an feGaussianBlur def (rasterizers do not do CSS filters)', async () => {
      addNode('n1');
      const out = await svg();

      expect(out).toContain('filter="url(#grafloria-blur-4)"');
      expect(out).toContain('<feGaussianBlur stdDeviation="2"/>');
      expect(out).not.toContain('blur(4px)');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Honest
  // -------------------------------------------------------------------------

  describe('foreignObject — what a headless exporter can and cannot know', () => {
    beforeEach(() => {
      addNode('n1').setMetadata('useForeignObject', true);
    });

    it('serialize (default): emits the shell and WARNS that host-mounted HTML is not in the VNode tree', () => {
      const { svg: out, warnings } = renderer.exportSvgString();

      expect(out).toContain('<foreignObject');
      expect(warnings.join('\n')).toMatch(/host-mounted HTML\/components are NOT in the tree/);
    });

    it('placeholder: a box where the component is, so a server thumbnail is not a hole', () => {
      const { svg: out } = renderer.exportSvgString({ foreignObject: 'placeholder' });

      expect(out).not.toContain('<foreignObject');
      expect(out).toContain('class="grafloria-foreign-placeholder"');
    });

    it('omit: gone', () => {
      expect(renderer.exportSvgString({ foreignObject: 'omit' }).svg).not.toContain('foreignObject');
    });

    it('captureForeignObject: a browser-side caller can hand the live markup back', () => {
      const { svg: out } = renderer.exportSvgString({
        captureForeignObject: () => '<div xmlns="http://www.w3.org/1999/xhtml">LIVE</div>',
      });
      expect(out).toContain('>LIVE</div></foreignObject>');
    });
  });

  // -------------------------------------------------------------------------
  // raster
  // -------------------------------------------------------------------------

  describe('raster formats', () => {
    let seen: RasterizeRequest | undefined;
    const backend: RasterBackend = {
      rasterize: async request => {
        seen = request;
        return 'data:image/png;base64,FAKE';
      },
    };

    beforeEach(() => {
      seen = undefined;
      addNode('n1');
    });

    it('hands the rasterizer the standalone SVG at the scaled pixel size', async () => {
      const url = await renderer.export('png', { scale: 2, rasterBackend: backend });

      expect(url).toBe('data:image/png;base64,FAKE');
      expect(seen?.mimeType).toBe('image/png');
      expect(seen?.width).toBe(280); // 140 × 2
      expect(seen?.height).toBe(180);
      expect(seen?.svg).toContain('<svg xmlns=');
      expect(seen?.svg).not.toContain('var(--');
    });

    it('passes quality through for the lossy formats (default 0.92)', async () => {
      await renderer.export('jpeg', { rasterBackend: backend });
      expect(seen?.mimeType).toBe('image/jpeg');
      expect(seen?.quality).toBe(0.92);

      await renderer.export('webp', { quality: 0.5, rasterBackend: backend });
      expect(seen?.mimeType).toBe('image/webp');
      expect(seen?.quality).toBe(0.5);
    });

    it('svg needs no rasterizer at all', async () => {
      await expect(renderer.export('svg')).resolves.toContain('<svg');
    });
  });

  // -------------------------------------------------------------------------
  // capabilities + edges
  // -------------------------------------------------------------------------

  it('declares its capabilities honestly (export yes; hit-test / measurement no)', () => {
    expect(renderer.capabilities.supportsExport).toBe(true);
    expect(renderer.capabilities.supportsHitTest).toBe(false);
    expect(renderer.capabilities.supportsMeasurement).toBe(false);
  });

  it('exports the WHOLE diagram by default, not the current viewport', async () => {
    addNode('n1', 0, 0);
    addNode('n2', 5000, 4000); // far off any plausible screen
    const out = await svg();

    expect(out).toContain('viewBox="-20 -20 5140 4090"');
    expect(out.match(/class="node-group"/g)).toHaveLength(2);
  });

  it('honours an explicit viewport', async () => {
    addNode('n1', 0, 0);
    const out = await svg({ viewport: { x: 0, y: 0, width: 640, height: 480 } });
    expect(out).toContain('viewBox="0 0 640 480"');
  });

  it('exports an empty diagram as a valid (non-zero-area) document rather than throwing', async () => {
    const out = await svg();
    expect(out).toContain('<svg xmlns=');
    expect(out).toContain('viewBox="0 0 40 40"');
  });

  it('exports links, arrowheads and labels', async () => {
    const a = addNode('n1', 0, 0);
    const b = addNode('n2', 300, 0);
    const pa = new PortModel({ id: 'pa', type: 'output', side: 'right' } as any);
    const pb = new PortModel({ id: 'pb', type: 'input', side: 'left' } as any);
    a.addPort(pa);
    b.addPort(pb);
    diagram.addLink(new LinkModel('pa', 'pb'));

    const out = await svg();
    expect(out).toContain('class="link-group"');
    expect(out).toContain('<path');
    expect(out).toContain(LIGHT_THEME.colors.link.default);
  });
});
