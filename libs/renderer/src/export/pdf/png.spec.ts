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

    it('MUTATION GUARD — Paeth TIE pa == pc must pick LEFT (spec order), not upper-left', () => {
      // Constructed so the second row's second pixel hits pa == pc with left ≠ upper-left:
      // a=90, b=105, c=100 → p=95, pa=5, pb=10, pc=5 — the spec breaks the tie toward a.
      // (`pa <= pc` mutated to `pa < pc` picks c=100 and reconstructs 105, not 95.)
      const png = buildPng({
        width: 2,
        height: 2,
        colorType: 6,
        scanlines: [
          0, 100, 100, 100, 100, 105, 105, 105, 105,
          4, 246, 246, 246, 246, 5, 5, 5, 5, // 246 ≡ −10: px0 = 100−10 = 90
        ],
      });
      const image = decode(png)!;
      expect(Array.from(inflateSync(image.data))).toEqual([100, 100, 100, 105, 105, 105, 90, 90, 90, 95, 95, 95]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([100, 105, 90, 95]);
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

    it('a palette WITH transparency builds a REAL /SMask — alpha = tRNS[index], no warning', () => {
      // 4×1: indices 0,1,2,1. tRNS covers only indices 0 and 1 — index 2 sits PAST the
      // table and must be opaque 255 (PNG spec: entries beyond the table default opaque).
      const warnings: string[] = [];
      const image = decode(
        buildPng({
          width: 4, height: 1, colorType: 3,
          scanlines: [0, 0, 1, 2, 1],
          palette: [255, 0, 0, 0, 255, 0, 0, 0, 255],
          trns: [0, 128],
        }),
        warnings
      )!;
      expect(image.colorSpace).toBe('[/Indexed /DeviceRGB 2 <ff000000ff000000ff>]');
      // The COLOUR stream is still the untouched IDAT passthrough — only the mask needed a decode.
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 4 >>');
      expect(Array.from(inflateSync(image.data))).toEqual([0, 0, 1, 2, 1]);
      expect(image.smask).not.toBeNull();
      expect(image.smask!.bitsPerComponent).toBe(8);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([0, 128, 255, 128]);
      expect(warnings).toEqual([]); // the old "renders OPAQUE" warning is gone
    });

    it('the tRNS mask decode UNFILTERS the index rows first (Up filter)', () => {
      // 2×2, row 1 Up-filtered: raw indices row0 = 0,1; row1 = 0+1, 1+1 = 1, 2.
      const image = decode(
        buildPng({
          width: 2, height: 2, colorType: 3,
          scanlines: [0, 0, 1, 2, 1, 1],
          palette: [255, 0, 0, 0, 255, 0, 0, 0, 255],
          trns: [10, 200, 30],
        })
      )!;
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([10, 200, 200, 30]);
    });
  });

  describe('interlaced (Adam7) — de-interlaced through the seven passes, then re-embedded', () => {
    // 4×4 RGB where pixel (x,y) carries [i, 100+i, 200+i] with i = y*4+x — every pixel
    // unique, so ANY misplacement (swapped pass offsets, wrong strides) changes the
    // output bytes. The scanlines are written in PASS order, exactly as Adam7 stores
    // them: P1 (0,0); P4 (2,0); P5 (0,2),(2,2); P6 two rows; P7 two full rows.
    const adam7rgb = () =>
      buildPng({
        width: 4,
        height: 4,
        colorType: 2,
        interlace: 1,
        scanlines: [
          0, 0, 100, 200,                                                   // P1: (0,0)
          0, 2, 102, 202,                                                   // P4: (2,0)
          0, 8, 108, 208, 10, 110, 210,                                     // P5: (0,2) (2,2)
          0, 1, 101, 201, 3, 103, 203,                                      // P6 row y=0: (1,0) (3,0)
          0, 9, 109, 209, 11, 111, 211,                                     // P6 row y=2: (1,2) (3,2)
          1, 4, 104, 204, 1, 1, 1, 1, 1, 1, 1, 1, 1,                        // P7 row y=1 — SUB-filtered
          0, 12, 112, 212, 13, 113, 213, 14, 114, 214, 15, 115, 215,        // P7 row y=3
        ],
      });

    it('reassembles the raster in IMAGE order — each pass unfiltered on its own', () => {
      const warnings: string[] = [];
      const image = decode(adam7rgb(), warnings)!;
      expect(image).not.toBeNull();
      expect(image.colorSpace).toBe('/DeviceRGB');
      // Re-encoded raw (no predictor): passthrough is impossible for interlaced IDAT.
      expect(image.decodeParms).toBeNull();
      const expected: number[] = [];
      for (let i = 0; i < 16; i++) expected.push(i, 100 + i, 200 + i);
      expect(Array.from(inflateSync(image.data))).toEqual(expected);
      expect(warnings).toEqual([]); // the old refusal warning is gone
    });

    it('MUTATION GUARD — every one of the SEVEN passes lands at its own offsets (8×8, unique values)', () => {
      // The 4×4 case above leaves passes 2 and 3 EMPTY (both start past a 4-wide image),
      // so a pass-2 ↔ pass-3 offset swap sails through it — this 8×8 greyscale populates
      // all seven passes with 64 unique values, so ANY offset/stride slip reorders bytes.
      const image = decode(
        buildPng({
          width: 8,
          height: 8,
          colorType: 0,
          interlace: 1,
          scanlines: [
            0, 0,                                  // P1 (0,0)
            0, 4,                                  // P2 (4,0)
            0, 32, 36,                             // P3 (0,4) (4,4)
            0, 2, 6, 0, 34, 38,                    // P4 rows y=0, y=4
            0, 16, 18, 20, 22, 0, 48, 50, 52, 54,  // P5 rows y=2, y=6
            0, 1, 3, 5, 7, 0, 17, 19, 21, 23,      // P6 rows y=0, y=2
            0, 33, 35, 37, 39, 0, 49, 51, 53, 55,  // P6 rows y=4, y=6
            0, 8, 9, 10, 11, 12, 13, 14, 15,       // P7 row y=1
            0, 24, 25, 26, 27, 28, 29, 30, 31,     // P7 row y=3
            0, 40, 41, 42, 43, 44, 45, 46, 47,     // P7 row y=5
            0, 56, 57, 58, 59, 60, 61, 62, 63,     // P7 row y=7
          ],
        })
      )!;
      expect(Array.from(inflateSync(image.data))).toEqual([...Array(64).keys()]);
    });

    it('interlaced RGBA still splits into colour + SMask, in raster order', () => {
      // 2×2: passes are P1 (0,0), P6 (1,0), P7 (0,1),(1,1).
      const image = decode(
        buildPng({
          width: 2,
          height: 2,
          colorType: 6,
          interlace: 1,
          scanlines: [
            0, 10, 11, 12, 255,               // P1
            0, 20, 21, 22, 200,               // P6
            0, 30, 31, 32, 100, 40, 41, 42, 0, // P7
          ],
        })
      )!;
      expect(Array.from(inflateSync(image.data))).toEqual([10, 11, 12, 20, 21, 22, 30, 31, 32, 40, 41, 42]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([255, 200, 100, 0]);
    });

    it('interlaced INDEXED keeps its palette colourspace through the decode path', () => {
      // 2×1: P1 (0,0), P6 (1,0); P7 starts at y=1 and the image is 1 tall — empty pass.
      const image = decode(
        buildPng({
          width: 2,
          height: 1,
          colorType: 3,
          interlace: 1,
          scanlines: [0, 0, 0, 1],
          palette: [255, 0, 0, 0, 0, 255],
        })
      )!;
      expect(image.colorSpace).toBe('[/Indexed /DeviceRGB 1 <ff00000000ff>]');
      expect(image.decodeParms).toBeNull();
      expect(Array.from(inflateSync(image.data))).toEqual([0, 1]);
    });
  });

  describe('16-bit — downsampled to the HIGH byte (documented: error < 0.4%, one code path, no predictor-at-16 reader risk)', () => {
    it('takes the high byte of every big-endian sample — low bytes chosen to SCREAM if picked', () => {
      // Samples 0xFF11 0x0022 0x8033 / 0x0144 0xFE55 0x7F66: high bytes 255,0,128 / 1,254,127.
      // A low-byte mutation yields 17,34,51… — nowhere near.
      const image = decode(
        buildPng({
          width: 2,
          height: 1,
          colorType: 2,
          bitDepth: 16,
          scanlines: [0, 0xff, 0x11, 0x00, 0x22, 0x80, 0x33, 0x01, 0x44, 0xfe, 0x55, 0x7f, 0x66],
        })
      )!;
      expect(image.bitsPerComponent).toBe(8);
      expect(image.colorSpace).toBe('/DeviceRGB');
      expect(image.decodeParms).toBeNull();
      expect(Array.from(inflateSync(image.data))).toEqual([255, 0, 128, 1, 254, 127]);
    });

    it('16-bit RGBA: the alpha plane is the high byte too', () => {
      const image = decode(
        buildPng({
          width: 1,
          height: 1,
          colorType: 6,
          bitDepth: 16,
          scanlines: [0, 0xab, 0x01, 0xcd, 0x02, 0xef, 0x03, 0x80, 0x7f],
        })
      )!;
      expect(Array.from(inflateSync(image.data))).toEqual([0xab, 0xcd, 0xef]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([0x80]);
    });

    it('unfilters at the 16-bit BYTE stride before downsampling (Up across a 2-byte pixel)', () => {
      // Grey 1×2: row 1 is Up-filtered against row 0's raw BYTES, then the high byte wins.
      const image = decode(
        buildPng({
          width: 1,
          height: 2,
          colorType: 0,
          bitDepth: 16,
          scanlines: [0, 0x12, 0xff, 2, 0x01, 0x00],
        })
      )!;
      expect(image.colorSpace).toBe('/DeviceGray');
      expect(Array.from(inflateSync(image.data))).toEqual([0x12, 0x13]);
    });

    it('16-bit AND interlaced compose', () => {
      // Grey 2×2 Adam7: P1 (0,0), P6 (1,0), P7 (0,1),(1,1) — 2-byte samples.
      const image = decode(
        buildPng({
          width: 2,
          height: 2,
          colorType: 0,
          bitDepth: 16,
          interlace: 1,
          scanlines: [0, 0x10, 0xaa, 0, 0x20, 0xbb, 0, 0x30, 0xcc, 0x40, 0xdd],
        })
      )!;
      expect(Array.from(inflateSync(image.data))).toEqual([0x10, 0x20, 0x30, 0x40]);
    });
  });

  describe('sub-8-bit PNGs — 1/2/4-bit grey and indexed embed at their NATIVE depth', () => {
    it('4-bit grey: IDAT passthrough with /BitsPerComponent 4 in dict AND DecodeParms', () => {
      // 4×2 ramp, packed two samples per byte: rows 0x01 0x23 / 0x45 0x67.
      const image = decode(
        buildPng({ width: 4, height: 2, colorType: 0, bitDepth: 4, scanlines: [0, 0x01, 0x23, 0, 0x45, 0x67] })
      )!;
      expect(image.colorSpace).toBe('/DeviceGray');
      expect(image.bitsPerComponent).toBe(4);
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 4 /Columns 4 >>');
      expect(Array.from(inflateSync(image.data))).toEqual([0, 0x01, 0x23, 0, 0x45, 0x67]);
      expect(image.smask).toBeNull();
    });

    it('1-bit grey: BitsPerComponent 1, untouched stream', () => {
      // 8×1 checker: 0b10101010 = 0xaa.
      const image = decode(buildPng({ width: 8, height: 1, colorType: 0, bitDepth: 1, scanlines: [0, 0xaa] }))!;
      expect(image.bitsPerComponent).toBe(1);
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 1 /Columns 8 >>');
      expect(Array.from(inflateSync(image.data))).toEqual([0, 0xaa]);
    });

    it('2-bit grey: BitsPerComponent 2', () => {
      const image = decode(buildPng({ width: 4, height: 1, colorType: 0, bitDepth: 2, scanlines: [0, 0x1b] }))!;
      expect(image.bitsPerComponent).toBe(2);
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 2 /Columns 4 >>');
    });

    it('4-bit INDEXED keeps the palette colourspace at 4 bits — palette embedded, never expanded', () => {
      // 3×1: packed indices 0x01, 0x20 → 0, 1, 2.
      const image = decode(
        buildPng({
          width: 3, height: 1, colorType: 3, bitDepth: 4,
          scanlines: [0, 0x01, 0x20],
          palette: [255, 0, 0, 0, 255, 0, 0, 0, 255],
        })
      )!;
      expect(image.colorSpace).toBe('[/Indexed /DeviceRGB 2 <ff000000ff000000ff>]');
      expect(image.bitsPerComponent).toBe(4);
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 4 /Columns 3 >>');
      expect(Array.from(inflateSync(image.data))).toEqual([0, 0x01, 0x20]);
    });

    it('4-bit indexed + tRNS: the mask indices are unpacked MSB-FIRST from packed bytes', () => {
      // 3×1 packed 0x01, 0x20 → indices 0,1,2; tRNS [10, 200] → alpha 10, 200, 255.
      // An LSB-first unpack reads 1,0,0 → alpha 200,10,10 — nowhere near.
      const image = decode(
        buildPng({
          width: 3, height: 1, colorType: 3, bitDepth: 4,
          scanlines: [0, 0x01, 0x20],
          palette: [255, 0, 0, 0, 255, 0, 0, 0, 255],
          trns: [10, 200],
        })
      )!;
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([10, 200, 255]);
      // Colour stream stays passthrough at native depth.
      expect(image.bitsPerComponent).toBe(4);
      expect(Array.from(inflateSync(image.data))).toEqual([0, 0x01, 0x20]);
    });

    it('1-bit indexed + tRNS: a fully transparent ink over an opaque paper', () => {
      // 8×1: 0b01100001; tRNS [255, 0] — index 1 transparent, index 0 opaque.
      const image = decode(
        buildPng({
          width: 8, height: 1, colorType: 3, bitDepth: 1,
          scanlines: [0, 0x61],
          palette: [255, 255, 255, 0, 0, 0],
          trns: [255, 0],
        })
      )!;
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([255, 0, 0, 255, 255, 255, 255, 0]);
    });
  });

  describe('interlaced sub-8-bit — Adam7 and bit-packing COMBINED (each pass row is packed on its own)', () => {
    it('interlaced 4-bit grey de-interlaces then scales to 8-bit (level × 17)', () => {
      // 2×2: P1 (0,0)=1, P6 (1,0)=5, P7 row y=1 = 9, 13. Each pass row packs its own bits.
      const image = decode(
        buildPng({
          width: 2, height: 2, colorType: 0, bitDepth: 4, interlace: 1,
          scanlines: [0, 0x10, 0, 0x50, 0, 0x9d],
        })
      )!;
      expect(image.bitsPerComponent).toBe(8);
      expect(image.colorSpace).toBe('/DeviceGray');
      expect(image.decodeParms).toBeNull();
      expect(Array.from(inflateSync(image.data))).toEqual([17, 85, 153, 221]);
    });

    it('interlaced 1-bit grey → 0 / 255', () => {
      // 2×2: P1=1, P6=0, P7 = 0,1 (bits in the high positions of their pass bytes).
      const image = decode(
        buildPng({
          width: 2, height: 2, colorType: 0, bitDepth: 1, interlace: 1,
          scanlines: [0, 0x80, 0, 0x00, 0, 0x40],
        })
      )!;
      expect(Array.from(inflateSync(image.data))).toEqual([255, 0, 0, 255]);
    });

    it('MUTATION GUARD — 8×8 interlaced 4-bit populates ALL SEVEN passes, v = (3x+5y) mod 16', () => {
      // Any pass origin/stride slip moves pixels by (Δx,Δy) with 3Δx+5Δy ≢ 0 (mod 16)
      // for every offset the seven passes can confuse — so the output bytes change.
      const v = (x: number, y: number) => (3 * x + 5 * y) % 16;
      const ADAM7 = [
        [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
        [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
      ];
      const scanlines: number[] = [];
      for (const [x0, y0, dx, dy] of ADAM7) {
        const pw = Math.ceil((8 - x0) / dx);
        const ph = Math.ceil((8 - y0) / dy);
        if (!pw || !ph) continue;
        for (let j = 0; j < ph; j++) {
          scanlines.push(0); // filter None
          let byte = 0;
          for (let i = 0; i < pw; i++) {
            const sample = v(x0 + i * dx, y0 + j * dy);
            if (i % 2 === 0) byte = sample << 4;
            else { scanlines.push(byte | sample); byte = 0; }
          }
          if (pw % 2 === 1) scanlines.push(byte);
        }
      }
      const image = decode(
        buildPng({ width: 8, height: 8, colorType: 0, bitDepth: 4, interlace: 1, scanlines })
      )!;
      const expected: number[] = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expected.push(v(x, y) * 17);
      expect(Array.from(inflateSync(image.data))).toEqual(expected);
    });

    it('interlaced 8-bit indexed + tRNS builds the mask from RASTER-order indices', () => {
      // 2×1: P1 (0,0)=1, P6 (1,0)=0. tRNS [40, 200] → raster alpha 200, 40.
      const image = decode(
        buildPng({
          width: 2, height: 1, colorType: 3, interlace: 1,
          scanlines: [0, 1, 0, 0],
          palette: [255, 0, 0, 0, 255, 0],
          trns: [40, 200],
        })
      )!;
      expect(image.colorSpace).toBe('[/Indexed /DeviceRGB 1 <ff000000ff00>]');
      expect(Array.from(inflateSync(image.data))).toEqual([1, 0]);
      expect(Array.from(inflateSync(image.smask!.data))).toEqual([200, 40]);
    });
  });

  describe('REAL-ENCODER fixtures (Pillow / ImageMagick — zlib-verified before check-in)', () => {
    // 16×16 4-bit grey ramp, column x = level x (ImageMagick -depth 4).
    const GRAY4_RAMP =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQBAAAAAD/aE28AAAAAmJLR0QADzoyPqMAAAAHdElNRQfqBxUNOw8KOYgDAAAAFUlEQVQI12NgVHZN71x99j3D4GAAAIhAPAG6V7HMAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA3LTIxVDEzOjU5OjE1KzAwOjAwfRKTZgAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNy0yMVQxMzo1OToxNSswMDowMAxPK9oAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDctMjFUMTM6NTk6MTUrMDA6MDBbWgoFAAAAAElFTkSuQmCC';
    // 16×16 1-bit checkerboard, 4-px blocks (Pillow mode '1').
    const GRAY1_CHECKER =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQAAAAA3iMLMAAAAFElEQVR4nGPkZ2BigCLGD0hsHOIAMiICG+iQ6usAAAAASUVORK5CYII=';
    // 24×8 8-bit indexed thirds red|green|blue, tRNS [0, 128] (Pillow bits=8).
    const IDX8_TRNS =
      'iVBORw0KGgoAAAANSUhEUgAAABgAAAAICAMAAADUf89RAAADAFBMVEX/AAAA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUz4tDAAAAAnRSTlMAgJsrThgAAAAVSURBVHicY2CAAkYoYIICmPgQkQAAR8gAwQEPj78AAAAASUVORK5CYII=';
    // Same thirds at 4-bit indexed (Pillow bits=4).
    const IDX4_TRNS =
      'iVBORw0KGgoAAAANSUhEUgAAABgAAAAIBAMAAAARjyJQAAAAMFBMVEX/AAAA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACk+nGOAAAAAnRSTlMAgJsrThgAAAAWSURBVHicY2RgYGAQhGImEAcGqMsBABCKADL5PHF1AAAAAElFTkSuQmCC';
    // 16×16 4-bit grey ramp, INTERLACED (ImageMagick -interlace PNG -depth 4).
    const GRAY4_LACE_RAMP =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQBAAAAAGIb30qAAAAAmJLR0QADzoyPqMAAAAHdElNRQfqBxUNOw8KOYgDAAAALUlEQVQI12PgYOBg8AFClh4QUluHQExuXefQCeHw2feJIRiVXdM7V599TyEDAFZXOLmwhcf6AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA3LTIxVDEzOjU5OjE1KzAwOjAwfRKTZgAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNy0yMVQxMzo1OToxNSswMDowMAxPK9oAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDctMjFUMTM6NTk6MTUrMDA6MDBbWgoFAAAAAElFTkSuQmCC';

    const real = (b64: string, warnings: string[] = []) =>
      decodeDataUrlImage(`data:image/png;base64,${b64}`, w => warnings.push(w));

    it('ImageMagick 4-bit grey ramp: native-depth passthrough, stream inflates to whole rows', () => {
      const warnings: string[] = [];
      const image = real(GRAY4_RAMP, warnings)!;
      expect(image).not.toBeNull();
      expect(image.width).toBe(16);
      expect(image.bitsPerComponent).toBe(4);
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 4 /Columns 16 >>');
      expect(inflateSync(image.data).length).toBe(16 * (8 + 1)); // 8 packed bytes + filter byte per row
      expect(warnings).toEqual([]);
    });

    it('Pillow 1-bit checkerboard: BitsPerComponent 1 passthrough', () => {
      const image = real(GRAY1_CHECKER)!;
      expect(image.bitsPerComponent).toBe(1);
      expect(image.decodeParms).toBe('<< /Predictor 15 /Colors 1 /BitsPerComponent 1 /Columns 16 >>');
      expect(inflateSync(image.data).length).toBe(16 * (2 + 1));
    });

    it('Pillow 8-bit indexed + tRNS: palette embedded, SMask thirds are 0 / 128 / 255', () => {
      const warnings: string[] = [];
      const image = real(IDX8_TRNS, warnings)!;
      expect(image.width).toBe(24);
      expect(image.height).toBe(8);
      // Pillow pads the palette to 256 entries — hival 255, red/green/blue up front.
      expect(image.colorSpace.startsWith('[/Indexed /DeviceRGB 255 <ff000000ff000000ff')).toBe(true);
      const alpha = Array.from(inflateSync(image.smask!.data));
      const expectRow = [...Array(8).fill(0), ...Array(8).fill(128), ...Array(8).fill(255)];
      expect(alpha).toEqual([...Array(8)].flatMap(() => expectRow));
      expect(warnings).toEqual([]);
    });

    it('Pillow 4-bit indexed + tRNS: same thirds, native 4-bit colour stream', () => {
      const image = real(IDX4_TRNS)!;
      expect(image.bitsPerComponent).toBe(4);
      expect(image.colorSpace.startsWith('[/Indexed /DeviceRGB 15 <ff000000ff000000ff')).toBe(true);
      const alpha = Array.from(inflateSync(image.smask!.data));
      const expectRow = [...Array(8).fill(0), ...Array(8).fill(128), ...Array(8).fill(255)];
      expect(alpha).toEqual([...Array(8)].flatMap(() => expectRow));
    });

    it('ImageMagick INTERLACED 4-bit ramp decodes to the exact 8-bit ramp — every Adam7+packing seam', () => {
      const warnings: string[] = [];
      const image = real(GRAY4_LACE_RAMP, warnings)!;
      expect(image.bitsPerComponent).toBe(8);
      const expected: number[] = [];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expected.push(x * 17);
      expect(Array.from(inflateSync(image.data))).toEqual(expected);
      expect(warnings).toEqual([]);
    });
  });

  describe('the honest refusals — warn and return null, never guess pixels', () => {
    it('a sub-8-bit depth on a colour type that cannot carry it (RGB at 4-bit) is refused', () => {
      const warnings: string[] = [];
      expect(
        decode(buildPng({ width: 1, height: 1, colorType: 2, bitDepth: 4, scanlines: [0, 0, 0] }), warnings)
      ).toBeNull();
      expect(warnings.join(' ')).toMatch(/4-bit|not valid|bit/i);
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
  /**
   * A minimal JPEG skeleton: SOI, [APP14 "Adobe"], a SOF0 with dimensions, EOI. Enough
   * for the header scan. `app14` is the Adobe colour-transform byte (0 = CMYK/RGB,
   * 2 = YCCK), or null for no marker.
   */
  function fakeJpeg(width: number, height: number, components: number, app14: number | null = null): Uint8Array {
    const head: number[] = [0xff, 0xd8];
    if (app14 !== null) {
      // FF EE, length 14, "Adobe", version 100, flags0, flags1, transform.
      head.push(0xff, 0xee, 0x00, 0x0e);
      for (const c of 'Adobe') head.push(c.charCodeAt(0));
      head.push(0x00, 0x64, 0x00, 0x00, 0x00, 0x00, app14);
    }
    const sof = [
      0xff, 0xc0, 0x00, 8 + components * 3, 8,
      (height >> 8) & 0xff, height & 0xff,
      (width >> 8) & 0xff, width & 0xff,
      components,
    ];
    for (let i = 0; i < components; i++) sof.push(i + 1, 0x11, 0);
    return Uint8Array.from([...head, ...sof, 0xff, 0xd9]);
  }

  // A REAL 8×8 solid-red CMYK JPEG written by Pillow: APP14 "Adobe" transform 0, data
  // stored INVERTED (the Adobe convention) — pixel-verified via pdftoppm: it renders red
  // exactly when the image dict carries /Decode [1 0 1 0 1 0 1 0], cyan without it.
  const PIL_CMYK_RED =
    '/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/8AAFAgACAAIBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwD0CvP68/r0Cv/Z';

  // The same solid red written by ImageMagick: APP14 transform 2 — the data is YCCK.
  // The PDF reader's own DCT decoder converts YCCK back to (inverted) CMYK; poppler
  // pixel-verified: red with the /Decode inversion.
  const IM_YCCK_RED =
    '/9j/7gAOQWRvYmUAZAAAAAAC/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/9sAQwEREhIYFRgvGhovY0I4QmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj/8AAFAgACAAIBAEiAAIRAQMRAQQiAP/EABYAAQEBAAAAAAAAAAAAAAAAAAAFB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAFBv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAOBAEAAhEDEQQAAD8AtAFEG0AB/9k=';

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

  describe('CMYK (4-component) — /DeviceCMYK, with the Adobe inversion handled via /Decode', () => {
    it('APP14 transform 0 (Adobe CMYK, inverted data) → /Decode [1 0 1 0 1 0 1 0]', () => {
      const warnings: string[] = [];
      const jpeg = fakeJpeg(10, 10, 4, 0);
      const image = decodeDataUrlImage(toDataUrl(jpeg, 'image/jpeg'), w => warnings.push(w))!;
      expect(image).not.toBeNull();
      expect(image.colorSpace).toBe('/DeviceCMYK');
      expect(image.filter).toBe('/DCTDecode');
      expect(image.decode).toBe('[1 0 1 0 1 0 1 0]');
      expect(Array.from(image.data)).toEqual(Array.from(jpeg));
      expect(warnings).toEqual([]);
    });

    it('APP14 transform 2 (YCCK) embeds too — the READER\'S DCT decoder does the YCCK→CMYK step', () => {
      const image = decodeDataUrlImage(toDataUrl(fakeJpeg(10, 10, 4, 2), 'image/jpeg'), () => undefined)!;
      expect(image).not.toBeNull();
      expect(image.colorSpace).toBe('/DeviceCMYK');
      expect(image.decode).toBe('[1 0 1 0 1 0 1 0]');
    });

    it('NO APP14 marker → the data is not Adobe-inverted, so NO /Decode', () => {
      const image = decodeDataUrlImage(toDataUrl(fakeJpeg(10, 10, 4, null), 'image/jpeg'), () => undefined)!;
      expect(image).not.toBeNull();
      expect(image.colorSpace).toBe('/DeviceCMYK');
      expect(image.decode).toBeNull();
    });

    it('a REAL Pillow CMYK JPEG (Adobe transform 0) decodes with the inversion', () => {
      const image = decodeDataUrlImage(`data:image/jpeg;base64,${PIL_CMYK_RED}`, () => undefined)!;
      expect(image.width).toBe(8);
      expect(image.height).toBe(8);
      expect(image.colorSpace).toBe('/DeviceCMYK');
      expect(image.decode).toBe('[1 0 1 0 1 0 1 0]');
    });

    it('a REAL ImageMagick YCCK JPEG (Adobe transform 2) decodes with the inversion', () => {
      const image = decodeDataUrlImage(`data:image/jpeg;base64,${IM_YCCK_RED}`, () => undefined)!;
      expect(image.width).toBe(8);
      expect(image.colorSpace).toBe('/DeviceCMYK');
      expect(image.decode).toBe('[1 0 1 0 1 0 1 0]');
    });
  });

  it('RGB and grey JPEGs carry NO /Decode array', () => {
    const image = decodeDataUrlImage(toDataUrl(fakeJpeg(10, 10, 3), 'image/jpeg'), () => undefined)!;
    expect(image.decode).toBeNull();
  });
});
