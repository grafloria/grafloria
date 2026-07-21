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
// REFUSALS are loud, never guessed: interlaced (Adam7's pass geometry is a different
// decoder), 16-bit (canvas never emits it), CMYK JPEG (Adobe's inversion convention would
// silently invert the colours), external URLs (fetching is not pure). CRCs are read past,
// not verified: the input is a data: URL the capture layer just built, not a file that
// survived a network.

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

function decodePng(bytes: Uint8Array, warn: (message: string) => void): PdfImage | null {
  const png = parsePng(bytes);
  if (!png) {
    warn('an <image> data: URL could not be parsed as a PNG — the image is omitted from the PDF.');
    return null;
  }

  if (png.interlace !== 0) {
    warn(
      'an interlaced (Adam7) PNG cannot be embedded — the PDF predictor model has no interlacing. ' +
        'Re-encode the image non-interlaced (canvas.toDataURL always is). The image is omitted.'
    );
    return null;
  }

  if (png.bitDepth !== 8) {
    warn(
      `a ${png.bitDepth}-bit PNG cannot be embedded (only 8-bit channels are supported; ` +
        'canvas images are always 8-bit). The image is omitted from the PDF.'
    );
    return null;
  }

  const { width, height, colorType } = png;

  // Passthrough colour types: the IDAT already IS a /FlateDecode+predictor stream.
  if (colorType === 2 || colorType === 0 || colorType === 3) {
    let colorSpace: string;
    let colors: number;
    if (colorType === 2) {
      colorSpace = '/DeviceRGB';
      colors = 3;
    } else if (colorType === 0) {
      colorSpace = '/DeviceGray';
      colors = 1;
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
      colors = 1;
    }

    return {
      width,
      height,
      colorSpace,
      bitsPerComponent: 8,
      data: png.idat,
      filter: '/FlateDecode',
      decodeParms: `<< /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${width} >>`,
      smask: null,
    };
  }

  // Alpha colour types: inflate, unfilter, split the planes.
  if (colorType === 6 || colorType === 4) {
    const channels = colorType === 6 ? 4 : 2;
    let raw: Uint8Array;
    try {
      raw = unfilter(zlibInflate(png.idat), width, height, channels);
    } catch {
      warn('an <image> PNG has a corrupt pixel stream — the image is omitted from the PDF.');
      return null;
    }

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
      colorSpace: colorType === 6 ? '/DeviceRGB' : '/DeviceGray',
      bitsPerComponent: 8,
      data: zlibDeflateStored(color),
      filter: '/FlateDecode',
      decodeParms: null,
      smask: { data: zlibDeflateStored(alpha), bitsPerComponent: 8 },
    };
  }

  warn(`a PNG with colour type ${colorType} is not supported — the image is omitted from the PDF.`);
  return null;
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

  // Scan segments for a start-of-frame (SOF0/1/2 cover baseline + progressive).
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
      const height = (bytes[pos + 5] << 8) | bytes[pos + 6];
      const width = (bytes[pos + 7] << 8) | bytes[pos + 8];
      const components = bytes[pos + 9];

      if (components === 4) {
        warn(
          'a CMYK JPEG cannot be embedded — Adobe CMYK JPEGs use an inverted convention that ' +
            'would silently invert every colour. The image is omitted from the PDF.'
        );
        return null;
      }
      if (components !== 1 && components !== 3) {
        warn(`a JPEG with ${components} components is not supported — the image is omitted from the PDF.`);
        return null;
      }

      return {
        width,
        height,
        colorSpace: components === 3 ? '/DeviceRGB' : '/DeviceGray',
        bitsPerComponent: 8,
        data: bytes,
        filter: '/DCTDecode',
        decodeParms: null,
        smask: null,
      };
    }

    pos += 2 + length;
  }

  warn('a JPEG data: URL carries no start-of-frame header — the image is omitted from the PDF.');
  return null;
}
