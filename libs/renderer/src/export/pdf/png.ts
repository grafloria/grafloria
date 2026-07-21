// data-URL image → the streams a PDF image XObject wants. Pure, synchronous, DOM-free.
//
// THE TWO PNG PATHS, chosen per colour type:
//
//  • PASSTHROUGH (RGB / grey / indexed): PNG's IDAT is a zlib stream of row-filtered
//    pixels, and PDF's /FlateDecode with /DecodeParms /Predictor 15 speaks EXACTLY that
//    dialect (the PNG "optimum" predictor tag covers all five row filters, which each row
//    names for itself). So the compressed bytes are copied into the PDF untouched — no
//    decode, no recompress, no quality or size change.
//
//  • SPLIT (RGBA / grey+alpha — what canvas.toDataURL('image/png') actually emits): PDF
//    has no interleaved-alpha colourspace; alpha must live in a separate /SMask image. So
//    the IDAT is inflated (flate.ts), the rows un-filtered, the channels split, and the
//    two planes re-compressed as stored-block zlib. Stored means the embedded image is
//    raw-size (see flate.ts for why we do not ship a compressor) — correct first.
//
// INTERLACED (Adam7) PNGs take the split path too: the seven passes are each unfiltered
// on their own and reassembled into raster order (passthrough is impossible — the PDF
// predictor model has no interlacing). 16-BIT samples are downsampled to their HIGH byte
// (big-endian, so byte 0 of each sample): the error is < 0.4% of full scale — invisible —
// and it keeps one code path instead of gambling on reader support for /Predictor with
// /BitsPerComponent 16. CMYK JPEGs embed as /DeviceCMYK DCTDecode; when they carry the
// Adobe APP14 marker the sample values are INVERTED (Adobe's convention — Pillow and
// ImageMagick both follow it, checked against their actual output), which the image
// dict's /Decode array undoes. APP14 transform 2 (YCCK) passes through as well: the
// reader's own DCT decoder does the YCCK→CMYK conversion (poppler pixel-verified).
//
// REFUSALS are loud, never guessed: sub-8-bit PNGs (1/2/4-bit packing) and external URLs
// (fetching is not pure). CRCs are read past, not verified: the input is a data: URL the
// capture layer just built, not a file that survived a network.

import { zlibDeflateStored, zlibInflate } from './flate';

/** Everything the PDF writer needs to embed one image XObject. */
export interface PdfImage {
  width: number;
  height: number;
  /** A PDF colourspace expression: `/DeviceRGB`, `/DeviceGray`, or `[/Indexed …]`. */
  colorSpace: string;
  bitsPerComponent: number;
  /** The image stream, already encoded for `filter`. */
  data: Uint8Array;
  filter: '/FlateDecode' | '/DCTDecode';
  /** The `/DecodeParms` dict (PNG-predictor passthrough), or null. */
  decodeParms: string | null;
  /** The `/Decode` array (Adobe-inverted CMYK JPEGs), or null for the default mapping. */
  decode: string | null;
  /** The alpha plane as a /DeviceGray zlib stream, or null for opaque images. */
  smask: { data: Uint8Array; bitsPerComponent: number } | null;
}

/**
 * Decode a `data:image/png` / `data:image/jpeg` URL into a PDF-embeddable image.
 * Returns null (after calling `warn`) for anything it cannot embed FAITHFULLY.
 */
export function decodeDataUrlImage(href: string, warn: (message: string) => void): PdfImage | null {
  const match = /^data:(image\/[a-z+.-]+)?(;base64)?,([\s\S]*)$/i.exec(href.trim());
  if (!match) {
    warn(
      'an <image> references an external URL — it is not inlined in the PDF (fetching would make ' +
        'the export impure); the SVG export carries the reference.'
    );
    return null;
  }

  const mime = (match[1] ?? '').toLowerCase();
  let bytes: Uint8Array;
  try {
    bytes = match[2] ? base64Decode(match[3]) : percentDecode(match[3]);
  } catch {
    warn('an <image> data: URL could not be decoded (malformed base64) — the image is omitted from the PDF.');
    return null;
  }

  if (mime === 'image/jpeg' || mime === 'image/jpg') return decodeJpeg(bytes, warn);
  return decodePng(bytes, warn);
}

// ---------------------------------------------------------------------------
// base64 / percent decoding — no atob, no Buffer: this must run anywhere.
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const table = new Int8Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) table[B64.charCodeAt(i)] = i;
  table['='.charCodeAt(0)] = -2;
  return table;
})();

function base64Decode(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const code = B64_LOOKUP[text.charCodeAt(i) & 0xff];
    if (code === -2) break; // '=' padding: done
    if (code < 0) {
      if (/\s/.test(text[i])) continue; // data URLs may wrap
      throw new Error('invalid base64');
    }
    buffer = (buffer << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function percentDecode(text: string): Uint8Array {
  const decoded = decodeURIComponent(text);
  const out = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i) & 0xff;
  return out;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface PngChunks {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  idat: Uint8Array;
  palette: Uint8Array | null;
  trns: boolean;
}

function parsePng(bytes: Uint8Array): PngChunks | null {
  if (bytes.length < 8 + 25 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;

  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns = false;
  const idatParts: Uint8Array[] = [];
  let sawIhdr = false;

  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const dataStart = pos + 8;
    if (length < 0 || dataStart + length > bytes.length) return null;
    const data = bytes.subarray(dataStart, dataStart + length);

    if (type === 'IHDR') {
      if (length < 13) return null;
      width = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
      height = ((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]) >>> 0;
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      sawIhdr = true;
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = true;
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }

    pos = dataStart + length + 4; // skip CRC — see the header
  }

  if (!sawIhdr || idatParts.length === 0 || width === 0 || height === 0) return null;

  let total = 0;
  for (const part of idatParts) total += part.length;
  const idat = new Uint8Array(total);
  let offset = 0;
  for (const part of idatParts) {
    idat.set(part, offset);
    offset += part.length;
  }

  return { width, height, bitDepth, colorType, interlace, idat, palette, trns };
}

/** channels per pixel, by PNG colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function decodePng(bytes: Uint8Array, warn: (message: string) => void): PdfImage | null {
  const png = parsePng(bytes);
  if (!png) {
    warn('an <image> data: URL could not be parsed as a PNG — the image is omitted from the PDF.');
    return null;
  }

  if (png.bitDepth !== 8 && png.bitDepth !== 16) {
    warn(
      `a ${png.bitDepth}-bit PNG cannot be embedded (sub-byte sample packing is not implemented; ` +
        'canvas images are always 8-bit). The image is omitted from the PDF.'
    );
    return null;
  }

  const { width, height, colorType } = png;
  const channels = CHANNELS[colorType];
  if (channels === undefined) {
    warn(`a PNG with colour type ${colorType} is not supported — the image is omitted from the PDF.`);
    return null;
  }

  const sixteen = png.bitDepth === 16;
  const interlaced = png.interlace !== 0;

  // The colourspace, shared by both paths. Indexed needs its palette either way.
  let colorSpace: string;
  if (colorType === 2 || colorType === 6) {
    colorSpace = '/DeviceRGB';
  } else if (colorType === 0 || colorType === 4) {
    colorSpace = '/DeviceGray';
  } else {
    if (!png.palette || png.palette.length % 3 !== 0 || png.palette.length === 0) {
      warn('an indexed PNG carries no palette — the image is omitted from the PDF.');
      return null;
    }
    if (png.trns) {
      warn(
        'an indexed PNG with palette transparency (tRNS) renders OPAQUE in the PDF — expanding ' +
          'palette alpha to an SMask is not implemented.'
      );
    }
    let hex = '';
    for (const b of png.palette) hex += b.toString(16).padStart(2, '0');
    colorSpace = `[/Indexed /DeviceRGB ${png.palette.length / 3 - 1} <${hex}>]`;
  }

  // Passthrough: the IDAT already IS a /FlateDecode+predictor stream — but only for
  // opaque 8-bit non-interlaced images (interlacing has no PDF predictor equivalent,
  // 16-bit is downsampled, and alpha must be split out).
  if (!interlaced && !sixteen && (colorType === 2 || colorType === 0 || colorType === 3)) {
    const colors = colorType === 2 ? 3 : 1;
    return {
      width,
      height,
      colorSpace,
      bitsPerComponent: 8,
      data: png.idat,
      filter: '/FlateDecode',
      decodeParms: `<< /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${width} >>`,
      decode: null,
      smask: null,
    };
  }

  // Decode path: inflate, unfilter (per pass when interlaced), then reduce.
  const sampleBytes = sixteen ? 2 : 1;
  const bpp = channels * sampleBytes;
  let raw: Uint8Array;
  try {
    const inflated = zlibInflate(png.idat);
    raw = interlaced ? deinterlace(inflated, width, height, bpp) : unfilter(inflated, width, height, bpp);
  } catch {
    warn('an <image> PNG has a corrupt pixel stream — the image is omitted from the PDF.');
    return null;
  }

  // 16-bit → 8-bit: keep the HIGH byte of each big-endian sample. Max error 255/65535
  // (< 0.4% of full scale); 0x0000 and 0xffff stay exact. See the header for why this
  // beats a 16-BPC passthrough.
  if (sixteen) {
    const reduced = new Uint8Array(raw.length / 2);
    for (let i = 0; i < reduced.length; i++) reduced[i] = raw[i * 2];
    raw = reduced;
  }

  // Alpha colour types split into colour + /SMask planes; opaque ones embed whole.
  if (colorType === 6 || colorType === 4) {
    const colorChannels = channels - 1;
    const color = new Uint8Array(width * height * colorChannels);
    const alpha = new Uint8Array(width * height);
    for (let p = 0, c = 0, r = 0; p < width * height; p++, r += channels) {
      for (let k = 0; k < colorChannels; k++) color[c++] = raw[r + k];
      alpha[p] = raw[r + colorChannels];
    }

    return {
      width,
      height,
      colorSpace,
      bitsPerComponent: 8,
      data: zlibDeflateStored(color),
      filter: '/FlateDecode',
      decodeParms: null,
      decode: null,
      smask: { data: zlibDeflateStored(alpha), bitsPerComponent: 8 },
    };
  }

  return {
    width,
    height,
    colorSpace,
    bitsPerComponent: 8,
    data: zlibDeflateStored(raw),
    filter: '/FlateDecode',
    decodeParms: null,
    decode: null,
    smask: null,
  };
}

/**
 * Adam7: seven passes, each a sub-image with its own filtered scanlines (PNG spec §8.2).
 * Pass p samples the pixels at (x0 + i·dx, y0 + j·dy) — reassembling is just writing each
 * pass pixel back to that address. `bpp` is BYTES per pixel (16-bit samples ride along
 * untouched; downsampling happens after reassembly).
 */
const ADAM7 = [
  { x0: 0, y0: 0, dx: 8, dy: 8 },
  { x0: 4, y0: 0, dx: 8, dy: 8 },
  { x0: 0, y0: 4, dx: 4, dy: 8 },
  { x0: 2, y0: 0, dx: 4, dy: 4 },
  { x0: 0, y0: 2, dx: 2, dy: 4 },
  { x0: 1, y0: 0, dx: 2, dy: 2 },
  { x0: 0, y0: 1, dx: 1, dy: 2 },
];

function deinterlace(data: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const out = new Uint8Array(width * height * bpp);
  let pos = 0;

  for (const { x0, y0, dx, dy } of ADAM7) {
    const passWidth = Math.ceil(Math.max(0, width - x0) / dx);
    const passHeight = Math.ceil(Math.max(0, height - y0) / dy);
    if (passWidth === 0 || passHeight === 0) continue; // empty passes have NO scanlines

    const passLength = passHeight * (passWidth * bpp + 1);
    // Each pass is filtered AGAINST ITSELF: its own rows are the "above" neighbours.
    const passRaw = unfilter(data.subarray(pos, pos + passLength), passWidth, passHeight, bpp);
    pos += passLength;

    for (let j = 0; j < passHeight; j++) {
      for (let i = 0; i < passWidth; i++) {
        const src = (j * passWidth + i) * bpp;
        const dst = ((y0 + j * dy) * width + (x0 + i * dx)) * bpp;
        for (let k = 0; k < bpp; k++) out[dst + k] = passRaw[src + k];
      }
    }
  }

  return out;
}

/**
 * Undo PNG row filtering (spec §6): every row opens with a filter byte, and each filter
 * predicts from the reconstructed left / above / upper-left BYTES at a pixel's stride.
 */
function unfilter(data: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  if (data.length < height * (stride + 1)) throw new Error('pixel stream shorter than the image');

  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    const prevOut = rowOut - stride;

    for (let x = 0; x < stride; x++) {
      const value = data[rowIn + x];
      const left = x >= bpp ? out[rowOut + x - bpp] : 0;
      const above = y > 0 ? out[prevOut + x] : 0;
      const upperLeft = y > 0 && x >= bpp ? out[prevOut + x - bpp] : 0;

      let predictor: number;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = above; break;
        case 3: predictor = (left + above) >> 1; break;
        case 4: {
          // Paeth: the neighbour closest to left+above-upperLeft, ties in that order.
          const p = left + above - upperLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - above);
          const pc = Math.abs(p - upperLeft);
          predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
          break;
        }
        default:
          throw new Error(`unknown PNG filter type ${filter}`);
      }
      out[rowOut + x] = (value + predictor) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// JPEG — DCTDecode passthrough: the file IS the stream; only the header is read.
// ---------------------------------------------------------------------------

function decodeJpeg(bytes: Uint8Array, warn: (message: string) => void): PdfImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    warn('an <image> data: URL could not be parsed as a JPEG — the image is omitted from the PDF.');
    return null;
  }

  // Scan segments for the start-of-frame (SOF0/1/2 cover baseline + progressive) AND the
  // Adobe APP14 marker — both live before the entropy data, so stop at SOS (0xDA).
  let sof: { width: number; height: number; components: number } | null = null;
  /** APP14 "Adobe" colour-transform byte: 0 = CMYK/RGB, 1 = YCbCr, 2 = YCCK. */
  let adobeTransform: number | null = null;

  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = bytes[pos + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      pos += 2; // standalone markers carry no length
      continue;
    }
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];

    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      sof = {
        height: (bytes[pos + 5] << 8) | bytes[pos + 6],
        width: (bytes[pos + 7] << 8) | bytes[pos + 8],
        components: bytes[pos + 9],
      };
    } else if (
      marker === 0xee &&
      length >= 14 &&
      String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7], bytes[pos + 8]) === 'Adobe'
    ) {
      // Segment data: "Adobe"(5) version(2) flags0(2) flags1(2) transform(1).
      adobeTransform = bytes[pos + 15];
    } else if (marker === 0xda) {
      break; // entropy-coded data — nothing after this is a header
    }

    pos += 2 + length;
  }

  if (!sof) {
    warn('a JPEG data: URL carries no start-of-frame header — the image is omitted from the PDF.');
    return null;
  }

  const { width, height, components } = sof;
  let colorSpace: string;
  let decode: string | null = null;

  if (components === 4) {
    colorSpace = '/DeviceCMYK';
    // THE ADOBE TRAP: files carrying the APP14 "Adobe" marker store INVERTED CMYK
    // (Photoshop, Pillow and ImageMagick all do — verified against their output). The
    // /Decode array flips every channel back. Transform 2 (YCCK) is fine too: the
    // reader's DCT decoder converts YCCK → (still inverted) CMYK before /Decode applies
    // (pixel-verified through poppler). No APP14 → plain CMYK, default mapping.
    if (adobeTransform !== null) decode = '[1 0 1 0 1 0 1 0]';
  } else if (components === 3) {
    colorSpace = '/DeviceRGB';
  } else if (components === 1) {
    colorSpace = '/DeviceGray';
  } else {
    warn(`a JPEG with ${components} components is not supported — the image is omitted from the PDF.`);
    return null;
  }

  return {
    width,
    height,
    colorSpace,
    bitsPerComponent: 8,
    data: bytes,
    filter: '/DCTDecode',
    decodeParms: null,
    decode,
    smask: null,
  };
}
