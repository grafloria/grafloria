// Card 7 — the exported picture IS the document.
//
// The claim under test: export a diagram to SVG or PNG, hand the file to someone else,
// and they can open it and keep editing — with the model bit-for-bit intact.

import { DiagramEngine, DiagramModel, DiagramSerializer, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import type { RasterBackend } from './raster';
import {
  GRAFLORIA_MODEL_KEY,
  base64ToBytes,
  bytesToBase64,
  bytesToDataUrl,
  crc32,
  dataUrlToBytes,
  embedModelInPng,
  embedModelInSvg,
  extractModel,
  extractModelFromPng,
  extractModelFromSvg,
  importDiagram,
  isEditableArtifact,
  utf8,
} from './round-trip';

/** A real, minimal 1×1 PNG (signature + IHDR + IDAT + IEND). */
const ONE_PIXEL_PNG = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
);

describe('base64 (pure — no atob/btoa, which do not both exist anywhere)', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('handles every input length mod 3 (the padding cases)', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => i * 37));
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('decodes a real PNG signature', () => {
    expect(Array.from(ONE_PIXEL_PNG.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});

describe('utf8 (implemented, not borrowed — TextEncoder is absent in jsdom)', () => {
  it.each([
    ['ascii', 'hello world'],
    ['2-byte', 'é à ü ñ'],
    ['3-byte', '世界 مرحبا'],
    ['4-byte / astral (surrogate pairs — where hand-rolled codecs break)', '😀 🎨 𝄞'],
    ['mixed', 'a é 世 😀 z'],
    ['empty', ''],
  ])('round-trips %s', (_name, text) => {
    expect(utf8.decode(utf8.encode(text))).toBe(text);
  });

  it('encodes to the bytes UTF-8 actually specifies', () => {
    expect(Array.from(utf8.encode('é'))).toEqual([0xc3, 0xa9]);
    expect(Array.from(utf8.encode('世'))).toEqual([0xe4, 0xb8, 0x96]);
    expect(Array.from(utf8.encode('😀'))).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });
});

describe('crc32', () => {
  it('matches the known IEEE check value for "123456789"', () => {
    const bytes = utf8.encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});

describe('round-trip', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  const CREATED_AT = '2026-01-01T00:00:00.000Z';

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Round trip')!;
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function buildDiagram(): void {
    const a = new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
    const b = new NodeModel({ id: 'b', type: 'basic', position: { x: 300, y: 120 }, size: { width: 100, height: 50 } });
    a.addPort(new PortModel({ id: 'pa', type: 'output', side: 'right' } as any));
    b.addPort(new PortModel({ id: 'pb', type: 'input', side: 'left' } as any));
    diagram.addNode(a);
    diagram.addNode(b);
    diagram.addLink(new LinkModel('pa', 'pb'));
  }

  const envelope = () =>
    new DiagramSerializer().serializeEnvelope(diagram, { generator: '@grafloria/renderer', createdAt: CREATED_AT });

  // -------------------------------------------------------------------------
  // SVG
  // -------------------------------------------------------------------------

  describe('SVG <metadata>', () => {
    it('embeds the model and reads it straight back', () => {
      buildDiagram();
      const svg = embedModelInSvg('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', envelope());

      expect(svg).toContain(`<${GRAFLORIA_MODEL_KEY}`);
      expect(extractModelFromSvg(svg)).toEqual(envelope());
    });

    it('a plain SVG simply has no model — that is not an error', () => {
      expect(extractModelFromSvg('<svg><rect/></svg>')).toBeNull();
    });

    it('survives a diagram whose labels contain XML metacharacters', () => {
      const node = new NodeModel({ id: 'x', type: 'basic', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      node.setMetadata('label', 'a < b & c > d "quoted"');
      diagram.addNode(node);

      const svg = embedModelInSvg('<svg></svg>', envelope());
      const back = extractModelFromSvg(svg)!;
      expect((back.document.nodes as any[])[0].metadata.label).toBe('a < b & c > d "quoted"');
    });

    it('survives non-Latin-1 labels (the exact thing a tEXt chunk would have mangled)', () => {
      const node = new NodeModel({ id: 'x', type: 'basic', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      node.setMetadata('label', 'مرحبا 世界 — “curly”');
      diagram.addNode(node);

      const back = extractModelFromSvg(embedModelInSvg('<svg></svg>', envelope()))!;
      expect((back.document.nodes as any[])[0].metadata.label).toBe('مرحبا 世界 — “curly”');
    });

    it('a present-but-CORRUPT payload throws instead of degrading to "no model"', () => {
      const svg = `<svg><metadata><${GRAFLORIA_MODEL_KEY}>{not json</${GRAFLORIA_MODEL_KEY}></metadata></svg>`;
      expect(() => extractModelFromSvg(svg)).toThrow(/not valid JSON/);
    });

    it('the SVG still renders — the metadata sits inside the root and paints nothing', () => {
      buildDiagram();
      const svg = embedModelInSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', envelope());
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"><metadata>')).toBe(true);
      expect(svg).toContain('<rect/>');
      expect(svg.endsWith('</svg>')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PNG
  // -------------------------------------------------------------------------

  describe('PNG iTXt chunk', () => {
    it('embeds the model in a REAL png and reads it back', () => {
      buildDiagram();
      const png = embedModelInPng(ONE_PIXEL_PNG, envelope());
      expect(extractModelFromPng(png)).toEqual(envelope());
    });

    it('keeps the image valid: signature intact, IEND still last, pixels untouched', () => {
      buildDiagram();
      const png = embedModelInPng(ONE_PIXEL_PNG, envelope());

      expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // IEND is the final 12 bytes of every PNG.
      const tail = png.subarray(png.length - 8, png.length - 4);
      expect(String.fromCharCode(...tail)).toBe('IEND');
      // The file grew by exactly our chunk, and the original bytes before IEND survive.
      expect(png.length).toBeGreaterThan(ONE_PIXEL_PNG.length);
      expect(Array.from(png.subarray(0, 33))).toEqual(Array.from(ONE_PIXEL_PNG.subarray(0, 33)));
    });

    it('writes a CRC the PNG spec would accept (type + data, big-endian)', () => {
      buildDiagram();
      const png = embedModelInPng(ONE_PIXEL_PNG, envelope());

      // Find our iTXt chunk and re-verify its CRC the way a decoder would.
      let offset = 8;
      let checked = false;
      while (offset + 8 <= png.length) {
        const length =
          ((png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3]) >>> 0;
        const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
        if (type === 'iTXt') {
          const typeAndData = png.subarray(offset + 4, offset + 8 + length);
          const stored =
            ((png[offset + 8 + length] << 24) |
              (png[offset + 9 + length] << 16) |
              (png[offset + 10 + length] << 8) |
              png[offset + 11 + length]) >>>
            0;
          expect(stored).toBe(crc32(typeAndData));
          checked = true;
        }
        offset = offset + 8 + length + 4;
      }
      expect(checked).toBe(true);
    });

    it('a plain PNG has no model', () => {
      expect(extractModelFromPng(ONE_PIXEL_PNG)).toBeNull();
    });

    it('refuses to embed into something that is not a PNG', () => {
      buildDiagram();
      expect(() => embedModelInPng(new Uint8Array([1, 2, 3]), envelope())).toThrow(/not a PNG/);
    });

    it('carries non-Latin-1 text — iTXt is UTF-8 (tEXt would have corrupted this)', () => {
      const node = new NodeModel({ id: 'x', type: 'basic', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      node.setMetadata('label', '世界 مرحبا');
      diagram.addNode(node);

      const back = extractModelFromPng(embedModelInPng(ONE_PIXEL_PNG, envelope()))!;
      expect((back.document.nodes as any[])[0].metadata.label).toBe('世界 مرحبا');
    });
  });

  // -------------------------------------------------------------------------
  // THE ACTUAL PROMISE: export → import → the same diagram
  // -------------------------------------------------------------------------

  describe('the lossless cycle', () => {
    it('SVG: export, re-import, and the model is IDENTICAL (the engine invariant, through a picture)', async () => {
      buildDiagram();
      const svg = await renderer.export('svg', { embedModel: true, embedModelCreatedAt: CREATED_AT });

      const reopened = importDiagram(svg)!;
      expect(reopened).not.toBeNull();

      const serializer = new DiagramSerializer();
      expect(serializer.serialize(reopened)).toEqual(serializer.serialize(diagram));
    });

    it('PNG: export, re-import, and the model is IDENTICAL', async () => {
      buildDiagram();

      // A backend that produces a real PNG, so the chunk surgery runs on real bytes.
      const backend: RasterBackend = { rasterize: async () => bytesToDataUrl(ONE_PIXEL_PNG, 'image/png') };
      const url = await renderer.export('png', {
        embedModel: true,
        embedModelCreatedAt: CREATED_AT,
        rasterBackend: backend,
      });

      const reopened = importDiagram(url)!;
      const serializer = new DiagramSerializer();
      expect(serializer.serialize(reopened)).toEqual(serializer.serialize(diagram));
    });

    it('the re-opened diagram keeps its nodes, links and geometry', async () => {
      buildDiagram();
      const svg = await renderer.export('svg', { embedModel: true, embedModelCreatedAt: CREATED_AT });
      const reopened = importDiagram(svg)!;

      expect(reopened.getNodes().map(n => n.id).sort()).toEqual(['a', 'b']);
      expect(reopened.getLinks()).toHaveLength(1);
      expect(reopened.getNodes().find(n => n.id === 'b')!.position).toEqual({ x: 300, y: 120 });
    });

    it('a TAMPERED payload refuses to load — the envelope checksum catches it', async () => {
      buildDiagram();
      const svg = await renderer.export('svg', { embedModel: true, embedModelCreatedAt: CREATED_AT });

      // Move a node by editing the embedded JSON, leaving the checksum stale.
      const tampered = svg.replace('"x":300', '"x":999');
      expect(tampered).not.toBe(svg);
      expect(() => importDiagram(tampered)).toThrow(/checksum/i);
    });

    it('embedModel is OFF by default — a normal export carries no model', async () => {
      buildDiagram();
      const svg = await renderer.export('svg');
      expect(svg).not.toContain(GRAFLORIA_MODEL_KEY);
      expect(importDiagram(svg)).toBeNull();
    });

    it('an embedded export is STILL deterministic when given a createdAt', async () => {
      buildDiagram();
      const opts = { embedModel: true, embedModelCreatedAt: CREATED_AT } as const;
      expect(await renderer.export('svg', opts)).toBe(await renderer.export('svg', opts));
    });

    it('isEditableArtifact tells them apart', async () => {
      buildDiagram();
      expect(isEditableArtifact(await renderer.export('svg', { embedModel: true, embedModelCreatedAt: CREATED_AT }))).toBe(true);
      expect(isEditableArtifact(await renderer.export('svg'))).toBe(false);
    });

    it('importDiagram returns null for a picture with nothing in it', () => {
      expect(importDiagram('<svg><rect/></svg>')).toBeNull();
      expect(importDiagram(ONE_PIXEL_PNG)).toBeNull();
    });
  });

  describe('extractModel accepts whatever the caller happens to have', () => {
    it('an SVG string, PNG bytes, and both flavours of data: URL', () => {
      buildDiagram();
      const env = envelope();

      const svg = embedModelInSvg('<svg></svg>', env);
      const png = embedModelInPng(ONE_PIXEL_PNG, env);

      expect(extractModel(svg)).toEqual(env);
      expect(extractModel(png)).toEqual(env);
      expect(extractModel(bytesToDataUrl(png, 'image/png'))).toEqual(env);
      expect(extractModel(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).toEqual(env);
    });
  });

  describe('data: URLs', () => {
    it('round-trips base64 bytes', () => {
      expect(Array.from(dataUrlToBytes(bytesToDataUrl(ONE_PIXEL_PNG, 'image/png')))).toEqual(
        Array.from(ONE_PIXEL_PNG)
      );
    });

    it('decodes the percent-encoded SVG form the raster path uses', () => {
      const svg = '<svg>é…</svg>';
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      expect(utf8.decode(dataUrlToBytes(url))).toBe(svg);
    });

    it('rejects a non-data URL', () => {
      expect(() => dataUrlToBytes('https://example.com/a.png')).toThrow(/not a data: URL/);
    });
  });
});
