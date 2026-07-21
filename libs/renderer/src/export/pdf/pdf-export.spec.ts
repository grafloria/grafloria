// Card 4 — a real vector PDF.
//
// These tests parse the BYTES we produce: the xref offsets are checked against the actual
// object positions, the content stream is read back out, and the text is asserted to be
// real PDF text operators rather than an image of text. A PDF that "looks right" in a
// string comparison but whose xref is wrong will not open in Acrobat at all.

import { deflateSync, inflateSync } from 'zlib';
import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from '../../svg/svg-renderer';
import type { VNode } from '../../types/vnode.types';
import { exportPdf } from './pdf-export';
import { encodeWinAnsi, measureBaseFont, PAGE_SIZES, parsePdfColor, pageDimensions, pickBaseFont } from './pdf-primitives';
import { svgPathToPdf } from './pdf-path';
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

/** Extract one indirect object's body by number: `N 0 obj … endobj`. */
function pdfObject(pdf: Uint8Array, id: number): string {
  const match = new RegExp(`(?:^|\\n)${id} 0 obj\\n([\\s\\S]*?)\\nendobj`).exec(text(pdf));
  return match ? match[1] : '';
}

/** Every op-index in order — for "A must happen before B in the stream" assertions. */
function orderedIndexOf(haystack: string, ...needles: string[]): number[] {
  let from = 0;
  return needles.map(needle => {
    const at = haystack.indexOf(needle, from);
    if (at >= 0) from = at + needle.length;
    return at;
  });
}

const isAscending = (values: number[]): boolean =>
  values.every((v, i) => v >= 0 && (i === 0 || v > values[i - 1]));

// -- a tiny in-test PNG builder (CRCs zeroed; the decoder reads structure, not checksums) --
function pngChunk(type: string, data: number[] | Uint8Array): number[] {
  const body = Array.from(data);
  const out = [(body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff];
  for (const c of type) out.push(c.charCodeAt(0));
  out.push(...body, 0, 0, 0, 0);
  return out;
}

function testPng(width: number, height: number, colorType: number, scanlines: number[]): string {
  const ihdr = [
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    8, colorType, 0, 0, 0,
  ];
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', deflateSync(Uint8Array.from(scanlines))),
    ...pngChunk('IEND', []),
  ]);
  let bin = '';
  for (const b of png) bin += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(bin)}`;
}

/** 2×2 opaque RGB: red green / blue white. */
const RGB_PNG = () => testPng(2, 2, 2, [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
/** 2×1 RGBA: opaque red, half-transparent blue — the canvas.toDataURL shape. */
const RGBA_PNG = () => testPng(2, 1, 6, [0, 255, 0, 0, 255, 0, 0, 255, 128]);

// -- def builders, in the exact prop shapes `svg/paint-servers.ts` emits --------------
const defs = (children: VNode[]): VNode => ({ type: 'defs', props: {}, children } as VNode);

const stops2 = (): VNode[] => [
  el('stop', { offset: 0, 'stop-color': '#ff0000' }),
  el('stop', { offset: 1, 'stop-color': '#0000ff' }),
];

const linGrad = (id: string, coords: Record<string, unknown>, stops = stops2()): VNode =>
  ({
    type: 'linearGradient',
    props: { id, gradientUnits: 'userSpaceOnUse', ...coords },
    children: stops,
  } as VNode);

const radGrad = (id: string, coords: Record<string, unknown>, stops = stops2()): VNode =>
  ({
    type: 'radialGradient',
    props: { id, gradientUnits: 'userSpaceOnUse', ...coords },
    children: stops,
  } as VNode);

describe('pdf-primitives', () => {
  describe('parsePdfColor', () => {
    it.each([
      ['#ff0000', { r: 1, g: 0, b: 0 }],
      ['#00ff00', { r: 0, g: 1, b: 0 }],
      ['#fff', { r: 1, g: 1, b: 1 }],
      ['rgb(255, 0, 0)', { r: 1, g: 0, b: 0 }],
      ['white', { r: 1, g: 1, b: 1 }],
    ])('parses %s', (input, expected) => {
      const rgb = parsePdfColor(input)!;
      expect(rgb.r).toBeCloseTo(expected.r);
      expect(rgb.g).toBeCloseTo(expected.g);
      expect(rgb.b).toBeCloseTo(expected.b);
    });

    it('returns null for "none"/unknown rather than guessing black', () => {
      // Guessing black would turn an unrecognised value into a solid black node.
      expect(parsePdfColor('none')).toBeNull();
      expect(parsePdfColor('transparent')).toBeNull();
      expect(parsePdfColor('url(#grad)')).toBeNull();
      expect(parsePdfColor('chartreuse-ish')).toBeNull();
      expect(parsePdfColor(undefined)).toBeNull();
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

    it('splits a big sweep into several cubics (one bezier cannot be a half-circle)', () => {
      const ops = svgPathToPdf('M 0 0 A 10 10 0 1 1 0 20');
      expect(ops.filter(op => op.endsWith(' c')).length).toBeGreaterThanOrEqual(2);
    });

    it('a zero radius degenerates to a straight line, per the spec', () => {
      expect(svgPathToPdf('M 0 0 A 0 0 0 0 1 10 0')).toEqual(['0 0 m', '10 0 l']);
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

  it('reports an UNPARSEABLE <image> as omitted rather than dropping it silently', () => {
    // 'AAAA' is not a PNG. A decodable image now embeds (see the XObject suite); an
    // undecodable one must still warn and leave a valid file behind.
    const { pdf, warnings } = exportPdf(
      tree([g({}, [el('image', { x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAAA' })])])
    );
    expect(warnings.some(w => /image/i.test(w) && /PDF/.test(w))).toBe(true);
    // The image is not smuggled in as anything else, and the file is still valid.
    expect(text(pdf)).not.toContain('/Image');
    expect(xrefIsValid(pdf)).toBe(true);
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

    it('flattens a gradient STROKE to its first stop, and says so — stroking a shading needs outline geometry we do not build', () => {
      const withGradient = tree([
        defs([linGrad('grad', { x1: 0, y1: 0, x2: 10, y2: 0 })]),
        el('rect', { x: 0, y: 0, width: 10, height: 10, stroke: 'url(#grad)', strokeWidth: 2 }),
      ]);

      const { pdf, warnings } = exportPdf(withGradient);
      expect(warnings.join(' ')).toContain('first stop');
      expect(contentStreams(pdf)).toContain('1 0 0 RG'); // the red first stop, as a stroke
    });

    it('flattens a gradient fill ON TEXT to its first stop, and says so', () => {
      const { pdf, warnings } = exportPdf(
        tree([
          defs([linGrad('grad', { x1: 0, y1: 0, x2: 10, y2: 0 })]),
          el('text', { x: 0, y: 0, fontSize: 12, fill: 'url(#grad)', textContent: 'Hi' }),
        ])
      );
      expect(warnings.join(' ')).toContain('first stop');
      expect(contentStreams(pdf)).toContain('1 0 0 rg');
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

describe('gradient fills — REAL PDF shadings, not first-stop flattening', () => {
  const gradRect = (gradProps: Record<string, unknown> = { x1: 0, y1: 25, x2: 100, y2: 25 }) =>
    tree([
      defs([linGrad('grafloria-def-g1', gradProps)]),
      el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
    ]);

  it('a linear gradient becomes /ShadingType 2 with the DEF\'S OWN pixel coords (direction matters)', () => {
    const { pdf, warnings } = exportPdf(gradRect());
    const body = text(pdf);

    expect(body).toContain('/ShadingType 2');
    // x1 y1 x2 y2 — left red, right blue. Swapped endpoints = a flipped gradient.
    expect(body).toContain('/Coords [0 25 100 25]');
    expect(body).toContain('/C0 [1 0 0]');
    expect(body).toContain('/C1 [0 0 1]');
    // SVG's default spreadMethod is 'pad' — the shading must extend past both endpoints.
    expect(body).toContain('/Extend [true true]');
    // The gradient RENDERS now, so the old flattening warning must be gone.
    expect(warnings.join(' ')).not.toContain('first stop');
    expect(xrefIsValid(pdf)).toBe(true);
  });

  it('WEAK-TOOTH GUARD: the shading is actually INVOKED — clipped to the shape, inside its own q/Q', () => {
    // "/ShadingType 2 exists in the file" passes with the shading unreferenced by anything.
    // The proof is the content stream: shape path → W n (clip) → /Sh1 sh, all before the Q.
    const content = contentStreams(exportPdf(gradRect()).pdf);
    const sequence = orderedIndexOf(content, '0 0 m', '100 0 l', 'W n', '/Sh1 sh', 'Q');
    expect(isAscending(sequence)).toBe(true);
    // And no solid-fill fallback painted over/under it.
    expect(content).not.toContain('1 0 0 rg');
  });

  it('a THREE-stop gradient becomes a Type 3 stitching function with interior bounds', () => {
    const threeStops = [
      el('stop', { offset: 0, 'stop-color': '#ff0000' }),
      el('stop', { offset: '50%', 'stop-color': '#ffffff' }), // percent offsets must parse
      el('stop', { offset: 1, 'stop-color': '#0000ff' }),
    ];
    const { pdf } = exportPdf(
      tree([
        defs([linGrad('grafloria-def-g1', { x1: 0, y1: 0, x2: 100, y2: 0 }, threeStops)]),
        el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
      ])
    );
    const body = text(pdf);
    expect(body).toContain('/FunctionType 3');
    expect(body).toContain('/Bounds [0.5]');
    expect(body).toContain('/Encode [0 1 0 1]');
    // The two sub-functions carry the right stop pairs.
    expect(body).toContain('/C0 [1 0 0] /C1 [1 1 1]');
    expect(body).toContain('/C0 [1 1 1] /C1 [0 0 1]');
  });

  it('a radial gradient becomes /ShadingType 3, focal at the centre', () => {
    const { pdf } = exportPdf(
      tree([
        defs([radGrad('grafloria-def-r1', { cx: 50, cy: 25, r: 40 })]),
        el('circle', { cx: 50, cy: 25, r: 20, fill: 'url(#grafloria-def-r1)' }),
      ])
    );
    const body = text(pdf);
    expect(body).toContain('/ShadingType 3');
    expect(body).toContain('/Coords [50 25 0 50 25 40]');
    expect(contentStreams(pdf)).toContain('sh');
  });

  it('objectBoundingBox coords (a model-spec gradient) are mapped through the ELEMENT\'S box', () => {
    // buildLinearGradient emits 0–1 coords with no gradientUnits attr — the SVG default.
    const oBB: VNode = {
      type: 'linearGradient',
      props: { id: 'grafloria-def-obb', x1: 0, y1: 0, x2: 1, y2: 0 },
      children: stops2(),
    } as VNode;
    const { pdf } = exportPdf(
      tree([defs([oBB]), el('rect', { x: 5, y: 5, width: 20, height: 10, fill: 'url(#grafloria-def-obb)' })])
    );
    expect(text(pdf)).toContain('/Coords [5 5 25 5]');
  });

  it('a gradient-filled shape that is ALSO stroked keeps its stroke (a second pass)', () => {
    const { pdf } = exportPdf(
      tree([
        defs([linGrad('grafloria-def-g1', { x1: 0, y1: 0, x2: 100, y2: 0 })]),
        el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)', stroke: '#000000', strokeWidth: 2 }),
      ])
    );
    const content = contentStreams(pdf);
    expect(content).toContain('/Sh1 sh');
    // The stroke is painted as its own pass, after the shading's Q.
    expect(isAscending(orderedIndexOf(content, '/Sh1 sh', 'Q', '0 0 0 RG', 'S'))).toBe(true);
  });

  it('stop opacity is a DOCUMENTED limit: the shading paints opaque, and warns', () => {
    const translucent = [
      el('stop', { offset: 0, 'stop-color': '#ff0000', 'stop-opacity': 0.5 }),
      el('stop', { offset: 1, 'stop-color': '#0000ff' }),
    ];
    const { pdf, warnings } = exportPdf(
      tree([
        defs([linGrad('grafloria-def-g1', { x1: 0, y1: 0, x2: 100, y2: 0 }, translucent)]),
        el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
      ])
    );
    expect(text(pdf)).toContain('/ShadingType 2'); // still renders — opaquely
    expect(warnings.join(' ')).toMatch(/stop.*opacit|opacit.*stop/i);
  });

  it('rgba() stop colours: the colour is honoured, the alpha is the same documented limit', () => {
    const rgbaStops = [
      el('stop', { offset: 0, 'stop-color': 'rgba(255, 0, 0, 0.5)' }),
      el('stop', { offset: 1, 'stop-color': '#0000ff' }),
    ];
    const { pdf, warnings } = exportPdf(
      tree([
        defs([linGrad('grafloria-def-g1', { x1: 0, y1: 0, x2: 100, y2: 0 }, rgbaStops)]),
        el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
      ])
    );
    expect(text(pdf)).toContain('/C0 [1 0 0]');
    expect(warnings.join(' ')).toMatch(/stop.*opacit|opacit.*stop/i);
  });

  it('a PATTERN fill is flattened to its background colour — and warns (it used to vanish silently)', () => {
    const pattern: VNode = {
      type: 'pattern',
      props: { id: 'grafloria-def-p1', width: 8, height: 8, patternUnits: 'userSpaceOnUse' },
      children: [
        el('rect', { x: 0, y: 0, width: 8, height: 8, fill: '#00ff00' }),
        el('circle', { cx: 4, cy: 4, r: 1, fill: '#000000' }),
      ],
    } as VNode;
    const { pdf, warnings } = exportPdf(
      tree([defs([pattern]), el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-p1)' })])
    );
    expect(warnings.join(' ')).toMatch(/pattern/i);
    expect(contentStreams(pdf)).toContain('0 1 0 rg'); // the pattern's background survives
  });

  it('same gradient on two shapes → ONE shading resource, invoked twice', () => {
    const { pdf } = exportPdf(
      tree([
        defs([linGrad('grafloria-def-g1', { x1: 0, y1: 0, x2: 100, y2: 0 })]),
        el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
        el('rect', { x: 0, y: 60, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
      ])
    );
    expect(contentStreams(pdf).match(/\/Sh1 sh/g)).toHaveLength(2);
    expect(text(pdf).match(/\/ShadingType 2/g)).toHaveLength(1);
  });
});

describe('images — PDF image XObjects, painted with Do', () => {
  const imageTree = (href: string, extra: Record<string, unknown> = {}) =>
    tree([g({}, [el('image', { x: 10, y: 20, width: 4, height: 4, href, ...extra })])]);

  it('an opaque RGB PNG embeds as a FlateDecode XObject with PNG-predictor DecodeParms — IDAT passthrough', () => {
    const { pdf, warnings } = exportPdf(imageTree(RGB_PNG()));
    const body = text(pdf);

    const ref = /\/Im1 (\d+) 0 R/.exec(body);
    expect(ref).not.toBeNull();
    const object = pdfObject(pdf, Number(ref![1]));
    expect(object).toContain('/Subtype /Image');
    expect(object).toContain('/Width 2');
    expect(object).toContain('/Height 2');
    expect(object).toContain('/ColorSpace /DeviceRGB');
    expect(object).toContain('/BitsPerComponent 8');
    expect(object).toContain('/Filter /FlateDecode');
    // /Columns wrong = a sheared image that every structural test would miss.
    expect(object).toContain('/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>');

    // The embed is real, so the old "PDF cannot draw images" warning must be gone.
    expect(warnings.join(' ')).not.toMatch(/not implemented/);
    expect(xrefIsValid(pdf)).toBe(true);
  });

  it('WEAK-TOOTH GUARD: the XObject is actually DRAWN — placed with cm and invoked with Do inside q/Q', () => {
    const content = contentStreams(exportPdf(imageTree(RGB_PNG())).pdf);
    // [w 0 0 -h x y+h]: the -h un-flips the image under the page's y-down CTM.
    expect(isAscending(orderedIndexOf(content, 'q', '4 0 0 -4 10 24 cm', '/Im1 Do', 'Q'))).toBe(true);
  });

  it('an RGBA PNG (canvas.toDataURL) splits: RGB stream + alpha wired as /SMask — and the PIXELS are right', () => {
    const { pdf } = exportPdf(imageTree(RGBA_PNG()));
    const body = text(pdf);

    const ref = /\/Im1 (\d+) 0 R/.exec(body)!;
    const image = pdfObject(pdf, Number(ref[1]));
    const smaskRef = /\/SMask (\d+) 0 R/.exec(image);
    expect(smaskRef).not.toBeNull();

    const smask = pdfObject(pdf, Number(smaskRef![1]));
    expect(smask).toContain('/Subtype /Image');
    expect(smask).toContain('/ColorSpace /DeviceGray');

    // Read the two streams back OUT of the file and inflate them: colour then coverage.
    const imageStream = /stream\n([\s\S]*?)\nendstream/.exec(image)!;
    const smaskStream = /stream\n([\s\S]*?)\nendstream/.exec(smask)!;
    const toBytes = (s: string) => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xff));
    expect(Array.from(inflateSync(toBytes(imageStream[1])))).toEqual([255, 0, 0, 0, 0, 255]);
    expect(Array.from(inflateSync(toBytes(smaskStream[1])))).toEqual([255, 128]);
  });

  it('the same href twice → ONE XObject, two Do invocations', () => {
    const href = RGB_PNG();
    const { pdf } = exportPdf(
      tree([
        el('image', { x: 0, y: 0, width: 4, height: 4, href }),
        el('image', { x: 10, y: 0, width: 4, height: 4, href }),
      ])
    );
    expect(contentStreams(pdf).match(/\/Im1 Do/g)).toHaveLength(2);
    expect(text(pdf).match(/\/Subtype \/Image/g)).toHaveLength(1);
  });

  it('an EXTERNAL URL image stays a warning — fetching would make the export impure', () => {
    const { pdf, warnings } = exportPdf(imageTree('https://example.com/logo.png'));
    expect(warnings.join(' ')).toMatch(/external|not inlined/i);
    expect(text(pdf)).not.toContain('/Image');
  });

  it('image opacity rides the ExtGState like every other element', () => {
    const { pdf } = exportPdf(imageTree(RGB_PNG(), { opacity: 0.5 }));
    expect(text(pdf)).toContain('/ca 0.5');
    expect(isAscending(orderedIndexOf(contentStreams(pdf), 'gs', '/Im1 Do'))).toBe(true);
  });

  it('is deterministic with images and gradients in the tree — same tree, same bytes', () => {
    const build = () =>
      exportPdf(
        tree([
          defs([linGrad('grafloria-def-g1', { x1: 0, y1: 0, x2: 100, y2: 0 })]),
          el('rect', { x: 0, y: 0, width: 100, height: 50, fill: 'url(#grafloria-def-g1)' }),
          el('image', { x: 10, y: 20, width: 4, height: 4, href: RGBA_PNG() }),
        ])
      ).pdf;
    expect(Array.from(build())).toEqual(Array.from(build()));
  });
});

describe('element-level clip paths — clip-path="url(#…)" on a group', () => {
  const clipDef = (id: string, children: VNode[], props: Record<string, unknown> = {}): VNode =>
    ({ type: 'clipPath', props: { id, ...props }, children } as VNode);

  it('emits the clip shape as a PDF path with W n, scoped by q/Q — content after the Q is NOT clipped', () => {
    const { pdf, warnings } = exportPdf(
      tree([
        defs([clipDef('c1', [el('rect', { x: 2, y: 0, width: 5, height: 5 })])]),
        g({ clipPath: 'url(#c1)' }, [el('rect', { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' })]),
        el('rect', { x: 200, y: 0, width: 10, height: 10, fill: '#00ff00' }),
      ])
    );
    const content = contentStreams(pdf);
    // clip path geometry → W n → the clipped content → Q → the unclipped sibling.
    expect(isAscending(orderedIndexOf(content, '2 0 m', 'W n', '1 0 0 rg', 'Q', '0 1 0 rg'))).toBe(true);
    expect(warnings.join(' ')).not.toMatch(/clip/i);
  });

  it('a multi-shape clipPath unions its children into one clip path before the single W n', () => {
    const content = contentStreams(
      exportPdf(
        tree([
          defs([
            clipDef('c1', [
              el('rect', { x: 2, y: 0, width: 5, height: 5 }),
              el('circle', { cx: 30, cy: 30, r: 10 }),
            ]),
          ]),
          g({ clipPath: 'url(#c1)' }, [el('rect', { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' })]),
        ])
      ).pdf
    );
    // Both shapes' geometry lands before ONE W n (the second W n in the file — the first is the page clip).
    const afterPageClip = content.slice(content.indexOf('W n') + 3);
    expect(isAscending(orderedIndexOf(afterPageClip, '2 0 m', '40 30 m', 'W n', '1 0 0 rg'))).toBe(true);
    expect(afterPageClip.match(/W n/g)).toHaveLength(1);
  });

  it('a path-shaped clip works — the d attribute is the clip geometry', () => {
    const content = contentStreams(
      exportPdf(
        tree([
          defs([clipDef('c1', [el('path', { d: 'M 2 0 L 7 0 L 7 5 L 2 5 Z' })])]),
          g({ clipPath: 'url(#c1)' }, [el('rect', { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' })]),
        ])
      ).pdf
    );
    expect(isAscending(orderedIndexOf(content.slice(content.indexOf('W n') + 3), '2 0 m', '7 0 l', 'W n', '1 0 0 rg'))).toBe(true);
  });

  it('a clip on a group scopes the group\'s WHOLE subtree, transforms included', () => {
    const content = contentStreams(
      exportPdf(
        tree([
          defs([clipDef('c1', [el('rect', { x: 2, y: 0, width: 5, height: 5 })])]),
          g({ clipPath: 'url(#c1)', transform: 'translate(100, 200)' }, [
            el('rect', { x: 0, y: 0, width: 10, height: 10, fill: '#ff0000' }),
          ]),
        ])
      ).pdf
    );
    // The clip rides INSIDE the group's own cm: an element's transform applies to its
    // clip path too (SVG moves them together — animate a clipped group and watch).
    expect(isAscending(orderedIndexOf(content, '1 0 0 1 100 200 cm', '2 0 m', 'W n', '1 0 0 rg', 'Q'))).toBe(true);
  });

  it('a MISSING clip def warns and paints unclipped — losing content beats losing it silently', () => {
    const { pdf, warnings } = exportPdf(
      tree([g({ clipPath: 'url(#nope)' }, [el('rect', { x: 0, y: 0, width: 10, height: 10, fill: '#ff0000' })])])
    );
    expect(warnings.join(' ')).toMatch(/clip/i);
    expect(contentStreams(pdf)).toContain('1 0 0 rg'); // the content survived
  });

  it('clipPathUnits="objectBoundingBox" is a documented limit: warn, paint unclipped', () => {
    const { pdf, warnings } = exportPdf(
      tree([
        defs([
          clipDef('c1', [el('rect', { x: 0, y: 0, width: 0.5, height: 0.5 })], {
            clipPathUnits: 'objectBoundingBox',
          }),
        ]),
        g({ clipPath: 'url(#c1)' }, [el('rect', { x: 0, y: 0, width: 10, height: 10, fill: '#ff0000' })]),
      ])
    );
    expect(warnings.join(' ')).toMatch(/objectBoundingBox/);
    expect(contentStreams(pdf)).toContain('1 0 0 rg');
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
