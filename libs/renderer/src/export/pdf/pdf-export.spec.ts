// Card 4 — a real vector PDF.
//
// These tests parse the BYTES we produce: the xref offsets are checked against the actual
// object positions, the content stream is read back out, and the text is asserted to be
// real PDF text operators rather than an image of text. A PDF that "looks right" in a
// string comparison but whose xref is wrong will not open in Acrobat at all.

import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from '../../svg/svg-renderer';
import type { VNode } from '../../types/vnode.types';
import { exportPdf } from './pdf-export';
import { encodeWinAnsi, measureBaseFont, PAGE_SIZES, parseColor, pageDimensions, pickBaseFont } from './pdf-primitives';
import { arcToCubics, svgPathToPdf } from './pdf-path';
import { utf8 } from '../round-trip';

/**
 * Decode a PDF as LATIN-1, one byte per character.
 *
 * NOT UTF-8: a PDF opens with a binary-marker comment (0xE2 0xE3 0xCF 0xD3) that is not
 * valid UTF-8, so a UTF-8 decode collapses those bytes into replacement characters and
 * every subsequent CHARACTER offset drifts from its BYTE offset — which would make the
 * xref check below silently meaningless. PDF is a byte format; read it as bytes.
 */
const text = (pdf: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < pdf.length; i++) out += String.fromCharCode(pdf[i]);
  return out;
};

/** Read a PDF's xref table and check every offset really points at `N 0 obj`. */
function xrefIsValid(pdf: Uint8Array): boolean {
  const body = text(pdf);
  const startxref = /startxref\s+(\d+)/.exec(body);
  if (!startxref) return false;

  const xrefStart = Number(startxref[1]);
  const table = body.slice(xrefStart);
  if (!table.startsWith('xref')) return false;

  const entries = [...table.matchAll(/^(\d{10}) (\d{5}) ([nf])\s*$/gm)];
  let objectNumber = 0;
  for (const entry of entries) {
    const offset = Number(entry[1]);
    const kind = entry[3];
    if (kind === 'f') {
      objectNumber++;
      continue;
    }
    // The byte at `offset` must begin this object.
    if (!body.slice(offset).startsWith(`${objectNumber} 0 obj`)) return false;
    objectNumber++;
  }
  return entries.length > 1;
}

/** The concatenated content of every content stream in the file. */
function contentStreams(pdf: Uint8Array): string {
  const body = text(pdf);
  return [...body.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]).join('\n');
}

const g = (props: Record<string, unknown>, children: VNode[] = []): VNode =>
  ({ type: 'g', props, children }) as VNode;
const el = (type: string, props: Record<string, unknown>): VNode => ({ type, props } as VNode);

const tree = (children: VNode[]): VNode => ({ type: 'svg', key: 'diagram-root', props: {}, children } as VNode);

describe('pdf-primitives', () => {
  describe('parseColor', () => {
    it.each([
      ['#ff0000', { r: 1, g: 0, b: 0 }],
      ['#00ff00', { r: 0, g: 1, b: 0 }],
      ['#fff', { r: 1, g: 1, b: 1 }],
      ['rgb(255, 0, 0)', { r: 1, g: 0, b: 0 }],
      ['white', { r: 1, g: 1, b: 1 }],
    ])('parses %s', (input, expected) => {
      const rgb = parseColor(input)!;
      expect(rgb.r).toBeCloseTo(expected.r);
      expect(rgb.g).toBeCloseTo(expected.g);
      expect(rgb.b).toBeCloseTo(expected.b);
    });

    it('returns null for "none"/unknown rather than guessing black', () => {
      // Guessing black would turn an unrecognised value into a solid black node.
      expect(parseColor('none')).toBeNull();
      expect(parseColor('url(#grad)')).toBeNull();
      expect(parseColor('chartreuse-ish')).toBeNull();
      expect(parseColor(undefined)).toBeNull();
    });
  });

  describe('encodeWinAnsi', () => {
    it('encodes ASCII', () => {
      expect(encodeWinAnsi('Hi').bytes).toEqual([72, 105]);
    });

    it("maps the renderer's own ellipsis into cp1252's 0x85 slot", () => {
      // '…' is NOT Latin-1; it lives in WinAnsi's 0x80-0x9F block. Getting this wrong
      // makes every truncated label end in garbage.
      const encoded = encodeWinAnsi('a…');
      expect(encoded.bytes).toEqual([97, 0x85]);
      expect(encoded.unsupported).toEqual([]);
    });

    it('maps curly quotes and dashes', () => {
      expect(encodeWinAnsi('“ ” – —').bytes).toEqual([0x93, 32, 0x94, 32, 0x96, 32, 0x97]);
    });

    it('REPORTS what it cannot encode instead of silently mangling it', () => {
      const encoded = encodeWinAnsi('a世b');
      expect(encoded.bytes).toEqual([97, 0x3f, 98]); // '?' placeholder
      expect(encoded.unsupported).toEqual(['世']);
    });
  });

  it('pickBaseFont maps a CSS stack onto the base-14', () => {
    expect(pickBaseFont('Inter, sans-serif', '400', 'normal')).toBe('Helvetica');
    expect(pickBaseFont('Inter, sans-serif', 'bold', 'normal')).toBe('Helvetica-Bold');
    expect(pickBaseFont('Inter, sans-serif', '600', 'normal')).toBe('Helvetica-Bold');
    expect(pickBaseFont('Georgia, serif', '400', 'normal')).toBe('Times-Roman');
    expect(pickBaseFont('Menlo, monospace', '400', 'normal')).toBe('Courier');
    expect(pickBaseFont('Inter', '400', 'italic')).toBe('Helvetica-Oblique');
  });

  it('measureBaseFont uses real Helvetica advances, not a flat guess', () => {
    // 'i' (222/1000) is much narrower than 'W' (944/1000) — a 0.6em guess says they match.
    expect(measureBaseFont('Helvetica', 'i', 100)).toBeCloseTo(22.2);
    expect(measureBaseFont('Helvetica', 'W', 100)).toBeCloseTo(94.4);
  });

  it('pageDimensions swaps for landscape', () => {
    expect(pageDimensions('a4', 'portrait')).toEqual(PAGE_SIZES.a4);
    expect(pageDimensions('a4', 'landscape')).toEqual({ width: PAGE_SIZES.a4.height, height: PAGE_SIZES.a4.width });
  });
});

describe('svgPathToPdf', () => {
  it('converts move + line', () => {
    expect(svgPathToPdf('M 10 20 L 30 40')).toEqual(['10 20 m', '30 40 l']);
  });

  it('passes a cubic through', () => {
    expect(svgPathToPdf('M 0 0 C 1 2 3 4 5 6')).toEqual(['0 0 m', '1 2 3 4 5 6 c']);
  });

  it('converts a QUADRATIC to the exactly-equivalent cubic (2/3 rule)', () => {
    // Q 3 0 6 0 from (0,0): controls at 2/3 toward (3,0) → (2,0) and (4,0).
    expect(svgPathToPdf('M 0 0 Q 3 0 6 0')).toEqual(['0 0 m', '2 0 4 0 6 0 c']);
  });

  it('reflects the previous control point for S — the smooth shorthand', () => {
    // After C with c2=(3,4) ending at (5,6), S's first control is the REFLECTION: (7,8).
    const ops = svgPathToPdf('M 0 0 C 1 2 3 4 5 6 S 9 9 10 10');
    expect(ops[2]).toBe('7 8 9 9 10 10 c');
  });

  it('handles H and V', () => {
    expect(svgPathToPdf('M 0 0 H 5 V 7')).toEqual(['0 0 m', '5 0 l', '5 7 l']);
  });

  it('accumulates relative commands', () => {
    expect(svgPathToPdf('M 10 10 l 5 5')).toEqual(['10 10 m', '15 15 l']);
  });

  it('closes with h', () => {
    expect(svgPathToPdf('M 0 0 L 1 1 Z')).toContain('h');
  });

  it('treats extra pairs in an M run as implicit linetos (as SVG does)', () => {
    expect(svgPathToPdf('M 0 0 1 1 2 2')).toEqual(['0 0 m', '1 1 l', '2 2 l']);
  });

  describe('arcs — PDF has none, so they become cubics', () => {
    it('emits cubics that START and END on the arc endpoints', () => {
      const ops = svgPathToPdf('M 100 100 A 20 20 0 0 1 140 100');
      expect(ops[0]).toBe('100 100 m');
      // The final op is a cubic landing exactly on the endpoint.
      const last = ops[ops.length - 1];
      expect(last.endsWith('140 100 c')).toBe(true);
    });

    it('splits a big sweep into ≤90° pieces (one bezier cannot be a half-circle)', () => {
      const cubics = arcToCubics({ x: 0, y: 0 }, { x: 0, y: 20 }, 10, 10, 0, true, true);
      expect(cubics.length).toBeGreaterThanOrEqual(2);
    });

    it('lands on the endpoint for a semicircle', () => {
      const cubics = arcToCubics({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, 10, 0, false, true);
      const [, , end] = cubics[cubics.length - 1];
      expect(end.x).toBeCloseTo(20);
      expect(end.y).toBeCloseTo(0);
    });

    it('a zero radius degenerates to a straight line, per the spec', () => {
      const cubics = arcToCubics({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 0, 0, false, true);
      expect(cubics).toHaveLength(1);
      expect(cubics[0][2]).toEqual({ x: 10, y: 0 });
    });
  });
});

describe('exportPdf — the document', () => {
  const simple = () => tree([g({}, [el('rect', { x: 0, y: 0, width: 100, height: 50, fill: '#ff0000' })])]);

  it('produces a file every reader recognises: header, xref, trailer, EOF', () => {
    const { pdf } = exportPdf(simple());
    const body = text(pdf);

    expect(body.startsWith('%PDF-1.4')).toBe(true);
    expect(body).toContain('/Type /Catalog');
    expect(body).toContain('/Type /Pages');
    expect(body).toContain('/Type /Page');
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('writes an xref whose every offset really points at its object', () => {
    // The single most common way a hand-written PDF fails to open.
    expect(xrefIsValid(exportPdf(simple()).pdf)).toBe(true);
  });

  it('is DETERMINISTIC — same tree, same bytes', () => {
    const a = exportPdf(simple()).pdf;
    const b = exportPdf(simple()).pdf;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('is VECTOR: the rect is a path with a fill operator, not an embedded image', () => {
    const content = contentStreams(exportPdf(simple()).pdf);
    expect(content).toContain('re'); // rectangle path
    expect(content).toMatch(/\bf\b|\bB\b/); // fill / fill+stroke
    expect(content).toContain('1 0 0 rg'); // the red fill, in PDF's 0-1 RGB
    expect(content).not.toContain('/Image');
  });

  it('honours page size and orientation', () => {
    const portrait = text(exportPdf(simple(), { pageSize: 'a4', orientation: 'portrait' }).pdf);
    expect(portrait).toContain('/MediaBox [0 0 595.28 841.89]');

    const landscape = text(exportPdf(simple(), { pageSize: 'a4', orientation: 'landscape' }).pdf);
    expect(landscape).toContain('/MediaBox [0 0 841.89 595.28]');

    const letter = text(exportPdf(simple(), { pageSize: 'letter', orientation: 'portrait' }).pdf);
    expect(letter).toContain('/MediaBox [0 0 612 792]');
  });

  it('writes document metadata into /Info, referenced FROM THE TRAILER (else it is invisible)', () => {
    const { pdf } = exportPdf(simple(), {
      metadata: { title: 'My Diagram', author: 'Ada', subject: 'Flow', keywords: 'a,b' },
    });
    const body = text(pdf);

    expect(body).toContain('(My Diagram)');
    expect(body).toContain('(Ada)');
    expect(body).toMatch(/trailer[\s\S]*\/Info \d+ 0 R/);
  });

  it('escapes the characters that would otherwise break a PDF string literal', () => {
    const { pdf } = exportPdf(simple(), { metadata: { title: 'a(b)c\\d' } });
    expect(text(pdf)).toContain('(a\\(b\\)c\\\\d)');
  });

  describe('text is REAL TEXT — selectable and searchable', () => {
    const labelled = () =>
      tree([
        g({}, [
          el('rect', { x: 0, y: 0, width: 100, height: 50, fill: '#ffffff' }),
          el('text', { x: 50, y: 25, textAnchor: 'middle', fontSize: 14, fill: '#111827', textContent: 'Hello' }),
        ]),
      ]);

    it('emits BT/Tj/ET with the literal string, and declares the font', () => {
      const { pdf } = exportPdf(labelled());
      const content = contentStreams(pdf);

      expect(content).toContain('BT');
      expect(content).toContain('(Hello) Tj');
      expect(content).toContain('ET');
      expect(text(pdf)).toContain('/BaseFont /Helvetica');
      expect(text(pdf)).toContain('/Encoding /WinAnsiEncoding');
    });

    it('un-flips the text matrix — otherwise every label renders MIRRORED under the y-flip CTM', () => {
      const content = contentStreams(exportPdf(labelled()).pdf);
      expect(content).toMatch(/1 0 0 -1 [-\d.]+ [-\d.]+ Tm/);
    });

    it('warns — loudly — about text it cannot encode, instead of silently mangling it', () => {
      const { warnings } = exportPdf(
        tree([el('text', { x: 0, y: 0, fontSize: 12, fill: '#000', textContent: 'مرحبا' })])
      );
      expect(warnings.join(' ')).toMatch(/cannot encode/);
      expect(warnings.join(' ')).toMatch(/subsetter/);
    });
  });

  describe('the honest limits, each one reported', () => {
    it('DROPS a blurred element (the node shadow) rather than drawing a hard black slab', () => {
      const { pdf, warnings } = exportPdf(
        tree([
          el('rect', { x: 3, y: 3, width: 100, height: 50, fill: '#000', opacity: 0.1, filter: 'blur(4px)' }),
          el('rect', { x: 0, y: 0, width: 100, height: 50, fill: '#ffffff' }),
        ])
      );

      expect(warnings.join(' ')).toContain('no gaussian blur');
      // The shadow was the only thing with opacity 0.1, so its ExtGState is the tell:
      // if the shadow had been painted, /ca 0.1 would be in the resources.
      expect(text(pdf)).not.toContain('/ca 0.1');
      // …and the white node itself did survive.
      expect(contentStreams(pdf)).toContain('1 1 1 rg');
    });

    it('flattens a gradient to its first stop, and says so', () => {
      const withGradient = tree([
        {
          type: 'defs',
          props: {},
          children: [
            {
              type: 'linearGradient',
              props: { id: 'grad' },
              children: [
                el('stop', { offset: '0', stopColor: '#ff0000' }),
                el('stop', { offset: '1', stopColor: '#0000ff' }),
              ],
            } as VNode,
          ],
        } as VNode,
        el('rect', { x: 0, y: 0, width: 10, height: 10, fill: 'url(#grad)' }),
      ]);

      const { pdf, warnings } = exportPdf(withGradient);
      expect(warnings.join(' ')).toContain('first stop');
      expect(contentStreams(pdf)).toContain('1 0 0 rg'); // the red first stop
    });

    it('omits foreignObject and says why', () => {
      const { warnings } = exportPdf(
        tree([{ type: 'foreignObject', props: { x: 0, y: 0, width: 10, height: 10 }, children: [] } as VNode])
      );
      expect(warnings.join(' ')).toContain('foreignObject cannot be represented in PDF');
    });
  });

  it('applies a group transform through the PDF CTM stack (q / cm / Q)', () => {
    const content = contentStreams(
      exportPdf(tree([g({ transform: 'translate(100, 200)' }, [el('rect', { width: 10, height: 10, fill: '#000' })])]))
        .pdf
    );
    expect(content).toContain('1 0 0 1 100 200 cm');
    expect(content).toContain('q');
    expect(content).toContain('Q');
  });

  it('puts constant opacity in an ExtGState (PDF has no opacity operator)', () => {
    const { pdf } = exportPdf(tree([el('rect', { width: 10, height: 10, fill: '#000', opacity: 0.5 })]));
    expect(text(pdf)).toContain('/ExtGState');
    expect(text(pdf)).toContain('/ca 0.5');
    expect(contentStreams(pdf)).toContain('gs');
  });

  it('renders a dashed stroke', () => {
    const content = contentStreams(
      exportPdf(tree([el('rect', { width: 10, height: 10, stroke: '#000', strokeWidth: 2, strokeDasharray: '5,5' })]))
        .pdf
    );
    expect(content).toContain('[5 5] 0 d');
    expect(content).toContain('2 w');
  });

  it('paginates: one page per supplied rectangle, each clipped to its own slice', () => {
    const { pdf, pageCount } = exportPdf(simple(), {
      pages: [
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 50, y: 0, width: 50, height: 50 },
      ],
      pageNumbers: true,
    });

    expect(pageCount).toBe(2);
    expect(text(pdf).match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(contentStreams(pdf)).toContain('W n'); // the clip
    expect(contentStreams(pdf)).toContain('(1 / 2) Tj');
    expect(contentStreams(pdf)).toContain('(2 / 2) Tj');
    expect(xrefIsValid(pdf)).toBe(true);
  });

  it('an empty tree still produces a valid one-page document', () => {
    const { pdf, pageCount } = exportPdf(tree([]));
    expect(pageCount).toBe(1);
    expect(xrefIsValid(pdf)).toBe(true);
  });
});

describe('SVGRenderer.export("pdf") — through the real engine', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('PDF')!;
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function addNode(id: string, x = 0, y = 0): NodeModel {
    const node = new NodeModel({ id, type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    node.setMetadata('label', id);
    diagram.addNode(node);
    return node;
  }

  it('exports a real diagram to a valid, vector PDF with its labels as text', () => {
    addNode('Alpha', 0, 0);
    addNode('Beta', 300, 0);

    const { pdf, warnings } = renderer.exportPdf();

    expect(xrefIsValid(pdf)).toBe(true);
    const content = contentStreams(pdf);
    expect(content).toContain('(Alpha) Tj');
    expect(content).toContain('(Beta) Tj');
    // The node shadow is blurred, so it is dropped — and reported.
    expect(warnings.join(' ')).toContain('no gaussian blur');
  });

  it('REGRESSION: the THEME is resolved — in CSS mode the paint is in the stylesheet, not on the element', () => {
    // The node's fill and the link's stroke are NOT props: the VNode carries only
    // class="diagram-node" / class="diagram-link", and the live picture is painted by the
    // injected stylesheet. The PDF painter originally read the raw props, so links came
    // out with no stroke (skipped entirely) and nodes with no fill — a nearly BLANK PDF.
    addNode('a', 0, 0);
    const content = contentStreams(renderer.exportPdf().pdf);

    // The light theme's node fill (#ffffff) and border (#6b7280) are in the bytes.
    expect(content).toContain('1 1 1 rg');
    expect(content).toMatch(/0\.42 0\.447 0\.502 RG/);
    // …and the border is 1px wide, not 0. `Number('1px')` is NaN — parseFloat matters.
    expect(content).toContain('1 w');
  });

  it('exports links as vector paths', () => {
    const a = addNode('a', 0, 0);
    const b = addNode('b', 300, 0);
    a.addPort(new PortModel({ id: 'pa', type: 'output', side: 'right' } as any));
    b.addPort(new PortModel({ id: 'pb', type: 'input', side: 'left' } as any));
    diagram.addLink(new LinkModel('pa', 'pb'));

    const content = contentStreams(renderer.exportPdf().pdf);
    expect(content).toMatch(/\bc\b/); // the curved link is cubics
    expect(content).toMatch(/\bS\b|\bB\b/); // stroked
  });

  it('export("pdf") returns a data: URL, since IRenderer.export is string-typed', async () => {
    addNode('a');
    const url = await renderer.export('pdf');
    expect(url.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('honours pdf options through the export seam', () => {
    addNode('a');
    const { pdf } = renderer.exportPdf({
      pdf: { pageSize: 'letter', orientation: 'portrait', metadata: { title: 'T' } },
    });
    expect(text(pdf)).toContain('/MediaBox [0 0 612 792]');
    expect(text(pdf)).toContain('(T)');
  });

  it('scopes to a selection', () => {
    addNode('keep', 0, 0).setSelected(true);
    addNode('drop', 900, 900);

    const content = contentStreams(renderer.exportPdf({ scope: 'selection' }).pdf);
    expect(content).toContain('(keep) Tj');
    expect(content).not.toContain('(drop) Tj');
  });
});
