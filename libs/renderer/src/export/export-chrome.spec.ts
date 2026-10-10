// An export is a picture of the DIAGRAM, not of the editor around it.
//
// After any drag the dragged node is still selected (and still hovered — the
// pointer is on it), so a "Download PNG" button pressed next was exporting the
// dashed selection ring, the resize dots, the hover-only port circles and the
// interaction layers. Every format funnels through the same render pass, so the
// gate is format-wide: a diagram exported WITH chrome on screen must be
// byte-identical to the same diagram exported with nothing selected — for SVG,
// PNG (the SVG it rasterizes), PDF, and paged SVG/PDF — and the screen must get
// its chrome back on the very next frame.

import { SVGRenderer } from '../svg/svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { RasterBackend, RasterizeRequest } from './raster';
import type { VNode } from '../types';

const CHROME = /selection-highlight|-handle\b|handle-dot|resize-tool-layer|node-ports-overlay|connection-preview|snap-guide|waypoint-handle|control-point-handle|class="[^"]*\b(selected|hovered)\b|data-selected="true"|data-focused|port-hovered|port-highlighted/;

function classesOf(v: VNode | null | undefined, out: string[] = []): string[] {
  if (!v || typeof v !== 'object') return out;
  const c = (v.props as any)?.className ?? (v.props as any)?.class;
  if (typeof c === 'string') out.push(c);
  for (const ch of v.children ?? []) classesOf(ch as VNode, out);
  return out;
}

describe('exports carry no editor chrome (selection, hover, handles, ports, tool layers)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let a: NodeModel;
  let b: NodeModel;
  let link: LinkModel;
  const view = { x: -100, y: -100, width: 900, height: 600 };

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Chrome')!;
    renderer = new SVGRenderer(engine, {});
    a = new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 120, height: 60 } });
    b = new NodeModel({ id: 'b', type: 'basic', position: { x: 400, y: 200 }, size: { width: 120, height: 60 } });
    a.addPort(new PortModel({ id: 'pa', type: 'output', side: 'right' } as any));
    b.addPort(new PortModel({ id: 'pb', type: 'input', side: 'left' } as any));
    diagram.addNode(a);
    diagram.addNode(b);
    link = new LinkModel('pa', 'pb');
    diagram.addLink(link);
    link.setPoints([{ x: 120, y: 30 }, { x: 260, y: 120 }, { x: 400, y: 230 }]);
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  /** What a user has on screen right after dragging A: selected + hovered, a port lit, a link picked. */
  function putChromeOnScreen(): void {
    a.setSelected(true);
    a.setState({ hovered: true });
    a.getPorts()[0].isHovered = true;
    b.getPorts()[0].isValidTarget = true;
    link.setState('selected');
    renderer.setAccessibleFocus({ type: 'node', id: 'a' });
    // A real frame first, so the node/link VNode caches hold the CHROMED picture —
    // an export that reads the cache would hand that straight back.
    renderer.render(view, 1);
  }

  function clearChrome(): void {
    a.setSelected(false);
    a.setState({ hovered: false });
    a.getPorts()[0].isHovered = false;
    b.getPorts()[0].isValidTarget = false;
    link.setState('default');
    renderer.setAccessibleFocus(null);
    renderer.render(view, 1);
  }

  function capture(): { svg: string; pdf: string; pages: string; pagedPdf: string } {
    const pdfText = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
    const pages = { pageWidth: 300, pageHeight: 300 };
    return {
      svg: renderer.exportSvgString().svg,
      pdf: pdfText(renderer.exportPdf().pdf),
      pages: renderer.exportPages(pages).pages.map((p) => p.svg).join('\n'),
      pagedPdf: pdfText(renderer.exportPaginatedPdf(pages).pdf),
    };
  }

  it('the screen really does draw the chrome (so the assertions below can bite)', () => {
    putChromeOnScreen();
    const screen = classesOf(renderer.render(view, 1)).join(' ');
    expect(screen).toMatch(/selection-highlight/);
    expect(screen).toMatch(/node-ports-overlay/);
    expect(screen).toMatch(/resize-tool-layer/);
  });

  it('SVG export has no chrome markup', () => {
    putChromeOnScreen();
    const svg = renderer.exportSvgString().svg;
    expect(svg).not.toMatch(CHROME);
  });

  it('every format is byte-identical to the same diagram exported with nothing selected', () => {
    putChromeOnScreen();
    const chromed = capture();
    clearChrome();
    const clean = capture();
    expect(chromed.svg).toBe(clean.svg);
    expect(chromed.pdf).toBe(clean.pdf);
    expect(chromed.pages).toBe(clean.pages);
    expect(chromed.pagedPdf).toBe(clean.pagedPdf);
  });

  it('PNG rasterizes the clean SVG', async () => {
    const seen: RasterizeRequest[] = [];
    const backend: RasterBackend = {
      rasterize: async (req) => {
        seen.push(req);
        return 'data:image/png;base64,AAAA';
      },
    } as RasterBackend;
    putChromeOnScreen();
    await renderer.export('png', { rasterBackend: backend });
    await renderer.export('jpeg', { rasterBackend: backend });
    expect(seen).toHaveLength(2);
    for (const r of seen) expect(r.svg).not.toMatch(CHROME);
  });

  it('the screen keeps its chrome and its model state after an export', () => {
    putChromeOnScreen();
    renderer.exportSvgString();
    renderer.exportPdf();
    expect(a.isSelected()).toBe(true);
    expect(a.state.hovered).toBe(true);
    expect(a.getPorts()[0].isHovered).toBe(true);
    expect(b.getPorts()[0].isValidTarget).toBe(true);
    expect(link.state).toBe('selected');
    const screen = classesOf(renderer.render(view, 1)).join(' ');
    expect(screen).toMatch(/selection-highlight/);
    expect(screen).toMatch(/node-ports-overlay/);
    expect(screen).toMatch(/resize-tool-layer/);
  });

  it("scope 'selection' still picks the selected node, drawn without its ring", () => {
    putChromeOnScreen();
    const svg = renderer.exportSvgString({ scope: 'selection' }).svg;
    expect(svg.match(/class="node-group"/g)).toHaveLength(1);
    expect(svg).not.toMatch(CHROME);
  });
});
