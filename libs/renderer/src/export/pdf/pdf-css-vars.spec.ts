// PDF export resolves CSS variables in an element's OWN paint, and says so when it can't.
//
// The docs review found every arrowhead missing from exported PDFs. Markers paint
// through an inline style whose colour is `var(--grafloria-link-stroke, <literal>)`
// (so a theme swap or token bridge recolours them with their line). The class
// stylesheet's variables were resolved; an element's inline style was not, so the
// colour reached `parsePdfColor` as the raw `var(…)`, came back null, and the
// marker was silently skipped — while the docs tell users to trust `onWarnings`.
//
// The order a variable resolves in: the LIVE computed value (a DOM is there, so a
// token bridge is honoured), then the theme's token value, then the var()'s own
// fallback. Only when all three fail is the paint dropped — with a warning.

import { DiagramEngine, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from '../../svg/svg-renderer';
import type { VNode } from '../../types/vnode.types';
import { exportPdf } from './pdf-export';
import { LIGHT_THEME } from '../../themes/default-light-theme';
import { parsePdfColor, num } from './pdf-primitives';

const text = (pdf: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < pdf.length; i++) out += String.fromCharCode(pdf[i]);
  return out;
};
const streams = (pdf: Uint8Array): string =>
  [...text(pdf).matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]).join('\n');

/** `r g b rg` (fill) for a CSS colour, as the writer formats it. */
const fillOp = (css: string): string => {
  const c = parsePdfColor(css)!;
  return `${num(c.r)} ${num(c.g)} ${num(c.b)} rg`;
};

const tree = (children: VNode[]): VNode =>
  ({ type: 'svg', key: 'diagram-root', props: {}, children } as VNode);
const triangle = (style: Record<string, unknown>): VNode =>
  ({ type: 'polygon', props: { points: '0,-5 10,0 0,5', style } } as VNode);

describe('PDF export — arrowheads (CSS variables in inline paint)', () => {
  it('a real diagram exports its arrowhead as a filled triangle in the line colour', () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('pdf-arrows')!;
    const renderer = new SVGRenderer(engine, {});
    const a = new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
    a.addPort(new PortModel({ id: 'ao', type: 'output', side: 'right' }));
    const b = new NodeModel({ id: 'b', type: 'basic', position: { x: 300, y: 0 }, size: { width: 100, height: 50 } });
    b.addPort(new PortModel({ id: 'bi', type: 'input', side: 'left' }));
    diagram.addNode(a);
    diagram.addNode(b);
    diagram.addLink(new LinkModel('ao', 'bi'));
    renderer.render({ x: 0, y: 0, width: 800, height: 600 }, 1);

    const result = renderer.exportPdf();
    const content = streams(result.pdf);

    // The marker's own group: `1 0 0 1 <tip> cm` … `Q`. It used to be EMPTY.
    const marker = /1 0 0 1 [\d.]+ [\d.]+ cm\n([\s\S]*?)\nQ/.exec(content);
    expect(marker).not.toBeNull();
    const body = marker![1];
    expect(body).toContain(fillOp(LIGHT_THEME.colors.link.default));
    expect(body).toMatch(/ m\n[\s\S]* l\n[\s\S]* l\nh\nB/); // three points, closed, filled+stroked
    // Nothing about it was unreadable, so nothing is reported about it.
    expect(result.warnings.filter(w => /colour|variable/i.test(w))).toEqual([]);

    renderer.dispose();
    engine.destroy();
  });

  it("resolves a variable from the theme's token value first", () => {
    const { pdf, warnings } = exportPdf(
      tree([triangle({ fill: 'var(--grafloria-link-stroke, #ff0000)' })]),
      { theme: LIGHT_THEME }
    );
    expect(streams(pdf)).toContain(fillOp(LIGHT_THEME.colors.link.default));
    expect(warnings).toEqual([]);
  });

  it('prefers the LIVE computed value when the caller can read one (a token bridge)', () => {
    const { pdf } = exportPdf(
      tree([triangle({ fill: 'var(--grafloria-link-stroke, #ff0000)' })]),
      {
        theme: LIGHT_THEME,
        resolveVar: (name: string) => (name === '--grafloria-link-stroke' ? ' #00ff00 ' : ''),
      }
    );
    expect(streams(pdf)).toContain(fillOp('#00ff00'));
  });

  it("falls back to the var()'s own fallback, nested parentheses included", () => {
    const { pdf, warnings } = exportPdf(
      tree([triangle({ fill: 'var(--app-accent, rgb(0, 0, 255))' })]),
      { theme: LIGHT_THEME }
    );
    expect(streams(pdf)).toContain(fillOp('rgb(0, 0, 255)'));
    expect(warnings).toEqual([]);
  });

  it('warns — and does not paint — only when a variable truly cannot be resolved', () => {
    const { pdf, warnings } = exportPdf(
      tree([triangle({ fill: 'var(--app-accent)', stroke: '#123456' })]),
      { theme: LIGHT_THEME }
    );
    expect(warnings.some(w => w.includes('--app-accent'))).toBe(true);
    // The stroke was readable, so the shape is still drawn — stroked, not filled.
    const content = streams(pdf);
    expect(content).toMatch(/\nS\n/);
    expect(content).not.toMatch(/\nB\n|\nf\n/);
  });

  it('warns when a colour cannot be read at all, instead of dropping it silently', () => {
    const { warnings } = exportPdf(
      tree([triangle({ fill: 'not-a-colour' })]),
      { theme: LIGHT_THEME }
    );
    expect(warnings.some(w => w.includes('not-a-colour'))).toBe(true);
  });
});
