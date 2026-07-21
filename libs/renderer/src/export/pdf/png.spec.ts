// png.ts — data-URL image → the exact streams a PDF image XObject needs.
//
// The tests BUILD real PNGs (signature, chunks, zlib IDAT via node's own deflater) and
// assert on recovered PIXEL BYTES, not on "a parse happened". The unfilter tests cover
// every PNG filter type with hand-computed expectations — the place a sign error or a
// wrong bpp offset would otherwise sail through and garble every widget image.

import { deflateSync, inflateSync } from 'zlib';
import { decodeDataUrlImage, type PdfImage } from './png';

// ---------------------------------------------------------------------------
// A tiny test-side PNG builder
// ---------------------------------------------------------------------------

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunk(type: string, data: number[] | Uint8Array): number[] {
  const body = Array.from(data);
  const out: number[] = [];
  const len = body.length;
  out.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  for (const c of type) out.push(c.charCodeAt(0));
  out.push(...body);
  out.push(0, 0, 0, 0); // CRC — the decoder reads structure, not checksums (see png.ts)
  return out;
}

interface PngSpec {
  width: number;
  height: number;
  bitDepth?: number;
  colorType: number;
  interlace?: number;
  /** Raw scanlines INCLUDING the leading filter byte per row. */
  scanlines: number[];
  palette?: number[];
  trns?: number[];
  /** Split the compressed stream into this many IDAT chunks. */
  idatChunks?: number;
}

function buildPng(spec: PngSpec): Uint8Array {
  const ihdr = [
    (spec.width >>> 24) & 0xff, (spec.width >>> 16) & 0xff, (spec.width >>> 8) & 0xff, spec.width & 0xff,
    (spec.height >>> 24) & 0xff, (spec.height >>> 16) & 0xff, (spec.height >>> 8) & 0xff, spec.height & 0xff,
    spec.bitDepth ?? 8, spec.colorType, 0, 0, spec.interlace ?? 0,
  ];

  const compressed = deflateSync(Uint8Array.from(spec.scanlines));
  const out: number[] = [...SIGNATURE, ...chunk('IHDR', ihdr)];
  if (spec.palette) out.push(...chunk('PLTE', spec.palette));
  if (spec.trns) out.push(...chunk('tRNS', spec.trns));

  const parts = spec.idatChunks ?? 1;
  const per = Math.ceil(compressed.length / parts);
  for (let i = 0; i < parts; i++) {
    out.push(...chunk('IDAT', compressed.subarray(i * per, Math.min((i + 1) * per, compressed.length))));
  }
  out.push(...chunk('IEND', []));
  return Uint8Array.from(out);
}

function toDataUrl(png: Uint8Array, mime = 'image/png'): string {
  let bin = '';
  for (const b of png) bin += String.fromCharCode(b);
  // jsdom provides btoa; the DECODER under test must not rely on atob — that is the point.
  return `data:${mime};base64,${btoa(bin)}`;
}

function decode(png: Uint8Array, warnings: string[] = []): PdfImage | null {
  return decodeDataUrlImage(toDataUrl(png), w => warnings.push(w));
}

describe('decodeDataUrlImage — PNG', () => {
  describe('RGB (colour type 2) — IDAT passthrough', () => {
    // 2×2 RGB, filter 0 rows: red green / blue white.
    const rgb = () =>
      buildPng({
        width: 2,
        height: 2,
        colorType: 2,
        scanlines: [
          0, 255, 0, 0, 0, 255, 0,
          0, 0, 0, 255, 255, 255, 255,
        ],
      });

    it('passes the compressed IDAT through UNTOUCHED, with PNG-predictor DecodeParms', () => {
      const image = decode(rgb())!;
      expect(image).not.toBeNull();
      expect(image.width).toBe(2);
      expect(image.height).toBe(2);
      expect(image.colorSpace).toBe('/DeviceRGB');
      expect(image.bitsPerComponent).toBe(8);
      expect(image.filter).toBe('/FlateDecode');
      // The predictor declaration is what lets the READER undo the row filters. /Colors
      // and /Columns wrong here = a sheared, garbled image that no structural test sees.
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>');
      expect(image.smask).toBeNull();
      // Untouched means untouched: the stream still inflates to the filtered scanlines.
      expect(Array.from(inflateSync(image.data))).toEqual([
        0, 255, 0, 0, 0, 255, 0,
        0, 0, 0, 255, 255, 255, 255,
      ]);
    });

    it('concatenates MULTIPLE IDAT chunks — one zlib stream split across chunks is the PNG norm', () => {
      const split = buildPng({
        width: 2,
        height: 2,
        colorType: 2,
        scanlines: [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255],
        idatChunks: 3,
      });
      const image = decode(split)!;
      expect(Array.from(inflateSync(image.data))).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
    });
  });

  describe('greyscale (colour type 0) — passthrough with /DeviceGray', () => {
    it('embeds with Colors 1', () => {
      const image = decode(buildPng({ width: 3, height: 1, colorType: 0, scanlines: [0, 10, 128, 250] }))!;
      expect(image.colorSpace).toBe('/DeviceGray');
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 3 >>');
      expect(image.smask).toBeNull();
    });
  });

  describe('RGBA (colour type 6) — THE canvas.toDataURL case: split into RGB + SMask', () => {
    // 2×1: opaque red, half-transparent blue.
    const rgba = (filterByte = 0, scanlines?: number[]) =>
      buildPng({
        width: 2,
        height: 1,
        colorType: 6,
        scanlines: scanlines ?? [filterByte, 255, 0, 0, 255, 0, 0, 255, 128],
      });

    it('splits the channels: RGB stream + alpha as an SMask stream, both readable', () => {
      const image = decode(rgba())!;
      expect(image.colorSpace).toBe('/DeviceRGB');
      expect(image.decodeParms).toBeNull(); // the split streams are raw pixels, no predictor
      expect(Array.from(inflateSync(image.data))).toEqual([255, 0, 0, 0, 0, 255]);
      expect(image.smask).not.toBeNull();
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([255, 128]);
    });

    it('UNFILTERS first — Sub (1): each byte adds the byte one PIXEL (4 bytes) back', () => {
      // Raw pixels intended: (10,20,30,40) then (15,25,35,45) → deltas 5,5,5,5.
      const image = decode(rgba(0, [1, 10, 20, 30, 40, 5, 5, 5, 5]))!;
      expect(Array.from(inflateSync(image.data))).toEqual([10, 20, 30, 15, 25, 35]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([40, 45]);
    });

    it('unfilters Up (2): each byte adds the byte directly above', () => {
      const png = buildPng({
        width: 1,
        height: 2,
        colorType: 6,
        scanlines: [
          0, 100, 100, 100, 200, // row 0, filter None
          2, 10, 20, 30, 55,     // row 1, filter Up → 110, 120, 130, 255
        ],
      });
      const image = decode(png)!;
      expect(Array.from(inflateSync(image.data))).toEqual([100, 100, 100, 110, 120, 130]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([200, 255]);
    });

    it('unfilters Average (3): floor((left + above) / 2), with the missing edges as 0', () => {
      const png = buildPng({
        width: 2,
        height: 2,
        colorType: 6,
        scanlines: [
          0, 100, 0, 0, 255, 200, 0, 0, 255,  // row 0: (100,0,0,255), (200,0,0,255)
          3, 10, 0, 0, 0, 10, 0, 0, 1,        // row 1, Average
        ],
      });
      // Row 1 pixel 0: left=0, above=100 → avg 50 → 10+50=60 (R); alpha: above 255, left 0 → 127+0=127.
      // Row 1 pixel 1: left=60, above=200 → avg 130 → 10+130=140; alpha: left 127, above 255 → 191+1=192.
      const image = decode(png)!;
      expect(Array.from(inflateSync(image.data))).toEqual([100, 0, 0, 200, 0, 0, 60, 0, 0, 140, 0, 0]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([255, 255, 127, 192]);
    });

    it('unfilters Paeth (4): the predictor picks nearest of left/above/upper-left', () => {
      const png = buildPng({
        width: 2,
        height: 2,
        colorType: 6,
        scanlines: [
          0, 10, 10, 10, 10, 20, 20, 20, 20,
          4, 1, 1, 1, 1, 2, 2, 2, 2,
        ],
      });
      // Row 1 px0: a=0,b=10,c=0 → p=10, closest is b(10) → 1+10=11 (each channel).
      // Row 1 px1: a=11,b=20,c=10 → p=a+b-c=21; |21-11|=10, |21-20|=1, |21-10|=11 → b → 2+20=22.
      const image = decode(png)!;
      expect(Array.from(inflateSync(image.data))).toEqual([10, 10, 10, 20, 20, 20, 11, 11, 11, 22, 22, 22]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([10, 20, 11, 22]);
    });
  });

  describe('grey+alpha (colour type 4) — split like RGBA, DeviceGray', () => {
    it('splits into a grey stream and an SMask', () => {
      const image = decode(
        buildPng({ width: 2, height: 1, colorType: 4, scanlines: [0, 100, 255, 200, 0] })
      )!;
      expect(image.colorSpace).toBe('/DeviceGray');
      expect(Array.from(inflateSync(image.data))).toEqual([100, 200]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([255, 0]);
    });
  });

  describe('indexed (colour type 3) — passthrough with an /Indexed palette', () => {
    it('embeds the palette in the colourspace', () => {
      const image = decode(
        buildPng({
          width: 2,
          height: 1,
          colorType: 3,
          scanlines: [0, 0, 1],
          palette: [255, 0, 0, 0, 0, 255], // red, blue
        })
      )!;
      expect(image.colorSpace).toBe('[/Indexed /DeviceRGB 1 <ff00000000ff>]');
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>');
    });

    it('a palette WITH transparency renders opaque — and warns, never silently', () => {
      const warnings: string[] = [];
      const image = decode(
        buildPng({
          width: 1, height: 1, colorType: 3, scanlines: [0, 0],
          palette: [255, 0, 0], trns: [0],
        }),
        warnings
      );
      expect(image).not.toBeNull();
      expect(warnings.join(' ')).toMatch(/transparen/i);
    });
  });

  describe('the honest refusals — warn and return null, never guess pixels', () => {
    it('interlaced (Adam7) PNG', () => {
      const warnings: string[] = [];
      const image = decode(
        buildPng({ width: 1, height: 1, colorType: 6, interlace: 1, scanlines: [0, 1, 2, 3, 4] }),
        warnings
      );
      expect(image).toBeNull();
      expect(warnings.join(' ')).toMatch(/interlaced/i);
    });

    it('16-bit PNG', () => {
      const warnings: string[] = [];
      expect(
        decode(buildPng({ width: 1, height: 1, colorType: 2, bitDepth: 16, scanlines: [0, 0, 1, 0, 2, 0, 3] }), warnings)
      ).toBeNull();
      expect(warnings.join(' ')).toMatch(/16-bit|bit depth/i);
    });

    it('bytes that are not a PNG at all', () => {
      const warnings: string[] = [];
      expect(decodeDataUrlImage('data:image/png;base64,AAAA', w => warnings.push(w))).toBeNull();
      expect(warnings.join(' ')).toMatch(/could not be (parsed|decoded)/i);
    });

    it('an external URL (not a data: URL) stays a warning — fetching is not pure', () => {
      const warnings: string[] = [];
      expect(decodeDataUrlImage('https://example.com/x.png', w => warnings.push(w))).toBeNull();
      expect(warnings.join(' ')).toMatch(/external|not inlined|data:/i);
    });
  });
});

describe('decodeDataUrlImage — JPEG (DCTDecode passthrough)', () => {
  /** A minimal JPEG skeleton: SOI, a SOF0 with dimensions, EOI. Enough for the header scan. */
  function fakeJpeg(width: number, height: number, components: number): Uint8Array {
    const sof = [
      0xff, 0xc0, 0x00, 8 + components * 3, 8,
      (height >> 8) & 0xff, height & 0xff,
      (width >> 8) & 0xff, width & 0xff,
      components,
    ];
    for (let i = 0; i < components; i++) sof.push(i + 1, 0x11, 0);
    return Uint8Array.from([0xff, 0xd8, ...sof, 0xff, 0xd9]);
  }

  it('passes the whole file through as /DCTDecode with the SOF dimensions', () => {
    const jpeg = fakeJpeg(320, 240, 3);
    const image = decodeDataUrlImage(toDataUrl(jpeg, 'image/jpeg'), () => undefined)!;
    expect(image.filter).toBe('/DCTDecode');
    expect(image.width).toBe(320);
    expect(image.height).toBe(240);
    expect(image.colorSpace).toBe('/DeviceRGB');
    expect(Array.from(image.data)).toEqual(Array.from(jpeg));
  });

  it('greyscale JPEG → /DeviceGray', () => {
    const image = decodeDataUrlImage(toDataUrl(fakeJpeg(10, 10, 1), 'image/jpeg'), () => undefined)!;
    expect(image.colorSpace).toBe('/DeviceGray');
  });

  it('CMYK (4-component) JPEG is refused with a warning — Adobe inversion would silently ruin it', () => {
    const warnings: string[] = [];
    expect(decodeDataUrlImage(toDataUrl(fakeJpeg(10, 10, 4), 'image/jpeg'), w => warnings.push(w))).toBeNull();
    expect(warnings.join(' ')).toMatch(/CMYK/i);
  });
});
