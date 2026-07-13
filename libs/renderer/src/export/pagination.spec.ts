// Card 5 — pagination and print.
//
// The behaviour that matters is SNAPPING: a page break through the middle of a node leaves
// half a box and half a word, which is what makes a tiled printout unusable. So the tests
// below are mostly about where the breaks land, and about the invariant that keeps the
// scale consistent — every page's WINDOW is a full page, only its CLIP shrinks.

import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import type { VNode } from '../types/vnode.types';
import { buildPrintDocument, nodeBoxes, paginate, printDocument } from './pagination';

const node = (id: string, x: number, y: number, w = 100, h = 50): VNode =>
  ({
    type: 'g',
    key: `node-${id}`,
    props: { transform: `translate(${x}, ${y})` },
    children: [{ type: 'rect', props: { x: 0, y: 0, width: w, height: h } }],
  }) as VNode;

const tree = (children: VNode[]): VNode =>
  ({ type: 'svg', key: 'diagram-root', props: {}, children } as VNode);

describe('nodeBoxes', () => {
  it('collects the world box of each NODE', () => {
    const boxes = nodeBoxes(tree([node('a', 0, 0), node('b', 300, 100)]));
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x).toEqual({ min: 0, max: 100 });
    expect(boxes[1].y).toEqual({ min: 100, max: 150 });
  });

  it('ignores links — a line cut across a page boundary reads fine; a cut NODE does not', () => {
    const withLink = tree([
      node('a', 0, 0),
      { type: 'g', key: 'link-1', props: {}, children: [{ type: 'path', props: { d: 'M 0 0 L 900 900' } }] } as VNode,
    ]);
    expect(nodeBoxes(withLink)).toHaveLength(1);
  });
});

describe('paginate', () => {
  it('lays a wide diagram across a row of pages', () => {
    // Content 0..1000 wide, pages 400 wide → 3 columns.
    const diagram = tree([node('a', 0, 0), node('b', 900, 0)]);
    const result = paginate(diagram, { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: false });

    expect(result.columns).toBe(3);
    expect(result.rows).toBe(1);
    expect(result.pages).toHaveLength(3);
  });

  it('builds a 2-D grid, in reading order', () => {
    const diagram = tree([node('a', 0, 0), node('b', 500, 500)]);
    const result = paginate(diagram, { pageWidth: 300, pageHeight: 300, padding: 0, snapToNodes: false });

    expect(result.pages.map(p => [p.row, p.column])).toEqual(
      result.pages.map(p => [p.row, p.column]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    );
    expect(result.pages[0].index).toBe(0);
  });

  it("EVERY page's window is a FULL page — otherwise tiles render at different scales", () => {
    const diagram = tree([node('a', 0, 0), node('b', 700, 0), node('c', 1400, 0)]);
    const result = paginate(diagram, { pageWidth: 400, pageHeight: 400, padding: 0 });

    for (const page of result.pages) {
      expect(page.rect.width).toBe(400);
      expect(page.rect.height).toBe(400);
    }
  });

  describe('snapping — the point of the card', () => {
    // A node sitting ACROSS the naive break at x=400.
    const straddling = () => tree([node('a', 0, 0, 50, 50), node('cut', 380, 0, 100, 50), node('c', 700, 0, 50, 50)]);

    it('pulls the break back to the leading edge of a node it would have sliced', () => {
      const result = paginate(straddling(), {
        pageWidth: 400,
        pageHeight: 400,
        padding: 0,
        snapToNodes: true,
      });

      // Naive break at 400 cuts the node spanning 380..480. The break moves back to 380.
      expect(result.columnBreaks[1]).toBe(380);
    });

    it('…so the CLIP stops at the node, leaving white space instead of half a box', () => {
      const result = paginate(straddling(), { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: true });
      const first = result.pages[0];

      expect(first.rect.width).toBe(400); // the window is still a full page
      expect(first.clip.width).toBe(380); // …but only 380 of it is painted
    });

    it('and the node lands WHOLE on the next page', () => {
      const result = paginate(straddling(), { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: true });
      const second = result.pages[1];

      expect(second.rect.x).toBe(380);
      // The node runs 380..480, comfortably inside this page's 380..780 window.
      expect(second.rect.x + second.rect.width).toBeGreaterThanOrEqual(480);
    });

    it('leaves the break alone when nothing is in the way', () => {
      const clean = tree([node('a', 0, 0, 50, 50), node('b', 600, 0, 50, 50)]);
      const result = paginate(clean, { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: true });
      expect(result.columnBreaks[1]).toBe(400);
    });

    it('does NOT snap when snapToNodes is off', () => {
      const result = paginate(straddling(), { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: false });
      expect(result.columnBreaks[1]).toBe(400);
    });

    // Content starts at x=0 (node 'a'), so the naive break really is at 400. The wide node
    // spans 60..440, straddling it: sparing it means pulling the break back to 60, leaving a
    // page only 15% full.
    const veryWide = () => tree([node('a', 0, 0, 5, 50), node('wide', 60, 0, 380, 50), node('b', 700, 0, 50, 50)]);

    it('REFUSES to move a break so far that it would explode the page count — and WARNS about the cut', () => {
      const result = paginate(veryWide(), {
        pageWidth: 400,
        pageHeight: 400,
        padding: 0,
        snapToNodes: true,
        snapTolerance: 0.25, // the break may only give up 100 of its 400
      });

      expect(result.columnBreaks[1]).toBe(400); // not moved — the move was too expensive
      expect(result.warnings.join(' ')).toContain('cuts through');
      expect(result.warnings.join(' ')).toContain('snapTolerance');
    });

    it('a bigger tolerance lets the same break move', () => {
      const result = paginate(veryWide(), {
        pageWidth: 400,
        pageHeight: 400,
        padding: 0,
        snapToNodes: true,
        snapTolerance: 0.9, // the ceiling — a break may give up at most 90% of its page
      });
      expect(result.columnBreaks[1]).toBe(60);
      expect(result.warnings).toEqual([]);
    });

    it('snaps on the Y axis too', () => {
      const vertical = tree([node('a', 0, 0, 50, 50), node('cut', 0, 380, 50, 100), node('c', 0, 700, 50, 50)]);
      const result = paginate(vertical, { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: true });
      expect(result.rowBreaks[1]).toBe(380);
    });
  });

  describe('overlap', () => {
    it('starts each page early, so the tiles share a strip to trim and tape', () => {
      const diagram = tree([node('a', 0, 0), node('b', 900, 0)]);
      const result = paginate(diagram, {
        pageWidth: 400,
        pageHeight: 400,
        padding: 0,
        snapToNodes: false,
        overlap: 20,
      });
      expect(result.columnBreaks[1]).toBe(380); // 400 - 20
    });

    it('is 0 by default', () => {
      const diagram = tree([node('a', 0, 0), node('b', 900, 0)]);
      const result = paginate(diagram, { pageWidth: 400, pageHeight: 400, padding: 0, snapToNodes: false });
      expect(result.columnBreaks[1]).toBe(400);
    });
  });

  it('a diagram that fits on one page gets exactly one page', () => {
    const result = paginate(tree([node('a', 0, 0)]), { pageWidth: 1000, pageHeight: 1000, padding: 0 });
    expect(result.pages).toHaveLength(1);
  });

  it('an empty diagram does not hang or divide by zero', () => {
    const result = paginate(tree([]), { pageWidth: 400, pageHeight: 400 });
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildPrintDocument', () => {
  it('emits one sheet per page, each forcing a page break', () => {
    const html = buildPrintDocument(['<svg>1</svg>', '<svg>2</svg>']);
    expect(html.match(/class="sheet/g)).toHaveLength(2);
    expect(html).toContain('page-break-after: always');
  });

  it('the LAST sheet does not force a break — else every print ends with a blank page', () => {
    const html = buildPrintDocument(['<svg>1</svg>', '<svg>2</svg>']);
    expect(html).toContain('class="sheet last"');
    expect(html).toContain('.sheet.last { page-break-after: auto');
  });

  it('sets the @page size and margin', () => {
    const html = buildPrintDocument(['<svg/>'], { pageSize: 'A4 landscape', margin: '5mm' });
    expect(html).toContain('@page { size: A4 landscape; margin: 5mm; }');
  });

  it('escapes the title', () => {
    expect(buildPrintDocument([], { title: '<script>x</script>' })).toContain('&lt;script&gt;');
  });

  it('is pure — it returns a string and touches no DOM', () => {
    expect(typeof buildPrintDocument(['<svg/>'])).toBe('string');
  });
});

describe('printDocument', () => {
  it('rejects with a useful message where there is no browser', async () => {
    // jsdom defines `document` as a GETTER on the global, so a plain assignment to it
    // silently does nothing — defineProperty is the only way to take it away.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });

    try {
      await expect(printDocument('<html></html>')).rejects.toThrow(/needs a browser/);
      await expect(printDocument('<html></html>')).rejects.toThrow(/export\("pdf"\)/);
    } finally {
      if (original) Object.defineProperty(globalThis, 'document', original);
    }
  });

  it('prints through a hidden IFRAME — a popup would be blocked, and the button would do nothing', async () => {
    const frames: HTMLIFrameElement[] = [];
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'iframe') frames.push(el as HTMLIFrameElement);
      return el;
    });

    const printed = jest.fn();
    // jsdom does not implement window.print, so stand one up on the frame's window.
    const promise = printDocument(buildPrintDocument(['<svg/>']));

    const frame = frames[0];
    expect(frame).toBeDefined();
    expect(frame.style.position).toBe('fixed');
    expect(frame.getAttribute('aria-hidden')).toBe('true');

    Object.defineProperty(frame, 'contentWindow', {
      value: { focus: jest.fn(), print: printed, document: frame.contentDocument },
      configurable: true,
    });
    frame.onload?.(new Event('load'));

    await promise;
    expect(printed).toHaveBeenCalled();
    jest.restoreAllMocks();
  }, 10000);
});

describe('SVGRenderer paginated export', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Paged')!;
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function addNode(id: string, x: number, y = 0): void {
    const model = new NodeModel({ id, type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    model.setMetadata('label', id);
    diagram.addNode(model);
  }

  it('exportPages yields one standalone SVG per tile, each with its own viewBox', () => {
    addNode('a', 0);
    addNode('b', 1200);

    const result = renderer.exportPages({ pageWidth: 400, pageHeight: 400 });

    expect(result.pages.length).toBeGreaterThan(1);
    for (const page of result.pages) {
      expect(page.svg).toContain('<svg xmlns=');
      expect(page.svg).toContain(`viewBox="${page.rect.x} ${page.rect.y} 400 400"`);
    }
  });

  it('exportPaginatedPdf produces one PDF with a page per tile, numbered', () => {
    addNode('a', 0);
    addNode('b', 1200);

    const { pdf, pageCount } = renderer.exportPaginatedPdf({ pageWidth: 400, pageHeight: 400 });

    expect(pageCount).toBeGreaterThan(1);
    const body = Array.from(pdf, b => String.fromCharCode(b)).join('');
    expect(body.match(/\/Type \/Page\b/g)).toHaveLength(pageCount);
    expect(body).toContain(`(1 / ${pageCount}) Tj`);
  });

  it('a paginated PDF of a one-page diagram is a one-page PDF', () => {
    addNode('a', 0);
    const { pageCount } = renderer.exportPaginatedPdf({ pageWidth: 2000, pageHeight: 2000 });
    expect(pageCount).toBe(1);
  });
});
