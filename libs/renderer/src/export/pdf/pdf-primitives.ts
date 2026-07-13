// The PDF primitives: colour, geometry, text encoding, and the file container.
//
// Separated from the VNode→PDF painter (`pdf-painter.ts`) so each is testable on its
// own: this file knows PDF and nothing about diagrams; the painter knows diagrams and
// speaks to PDF only through here.

import { utf8 } from '../round-trip';
import { parseColor as parseThemeColor } from '../../themes/contrast';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * PDF reals, written short and DETERMINISTIC.
 *
 * `toFixed` then strip trailing zeros: 3 decimals is well below a printer's resolution
 * (a point is 1/72"), and it keeps `0.1+0.2` from writing `0.30000000000000004` into the
 * file — which would make two exports of the same diagram differ in their bytes.
 * `-0` is normalised to `0`, for the same reason.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** PDF paints in 0–1 channels, not 0–255. Named `PdfRgb` so it cannot be confused with the theme's `Rgb` (which is 0–255). */
export interface PdfRgb {
  r: number;
  g: number;
  b: number;
}

/** The handful of CSS keywords the renderer's themes and defaults actually use. */
const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
};

/**
 * Parse a CSS colour to PDF's 0–1 RGB.
 *
 * The hex / rgb() parsing is NOT re-implemented: `themes/contrast.ts` already owns the
 * "parse the colour forms a theme can actually hold" job (#rgb, #rgba, #rrggbb, #rrggbbaa,
 * rgb(), rgba()) and has its own tests. This adds only what is PDF-specific — the 0–255 →
 * 0–1 rescale, the `none`/`transparent`/`url(#…)` cases, and a few CSS keywords.
 *
 * `null` means DO NOT PAINT. Not black: guessing black for a value we could not read would
 * turn one unrecognised colour into a solid black node, which is far worse than a missing
 * fill.
 */
export function parsePdfColor(value: unknown): PdfRgb | null {
  if (typeof value !== 'string') return null;

  const text = value.trim().toLowerCase();
  if (text === '' || text === 'none' || text === 'transparent') return null;

  // url(#gradient): PDF axial shadings are a different beast. The painter resolves the
  // gradient's first stop and warns; that is not this function's job.
  if (text.startsWith('url(')) return null;

  const rgb255 = parseThemeColor(NAMED[text] ?? text);
  if (!rgb255) return null;

  return { r: rgb255.r / 255, g: rgb255.g / 255, b: rgb255.b / 255 };
}

/** The alpha of an `rgba()` / `#rrggbbaa`, or 1. Multiplied into the element's opacity. */
export function parseColorAlpha(value: unknown): number {
  if (typeof value !== 'string') return 1;
  const text = value.trim().toLowerCase();

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 8) return Number.parseInt(hex.slice(6, 8), 16) / 255;
    if (hex.length === 4) {
      const c = hex[3];
      return Number.parseInt(c + c, 16) / 255;
    }
    return 1;
  }

  const rgba = /^rgba\(([^)]+)\)$/.exec(text);
  if (rgba) {
    const parts = rgba[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 4 && Number.isFinite(parts[3])) return Math.max(0, Math.min(1, parts[3]));
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------

/**
 * The 0x80–0x9F slots of WinAnsiEncoding, which are NOT Latin-1: this is where cp1252
 * puts the curly quotes, the dashes and the ellipsis — every one of which the renderer
 * can emit (its own truncation ellipsis is '…').
 */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85, // … — the renderer's ellipsis
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98,
  0x2122: 0x99, // ™
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

export interface EncodedText {
  /** WinAnsi bytes, ready for a PDF literal string. */
  bytes: number[];
  /** Characters that WinAnsi cannot represent at all (CJK, Arabic, emoji…). */
  unsupported: string[];
}

/**
 * Encode a string to WinAnsiEncoding — what the PDF base-14 fonts speak.
 *
 * Anything outside it (Arabic, CJK, emoji) CANNOT be written with a standard font: it
 * needs an embedded font program with a matching CMap, which means a font parser and a
 * subsetter. We do not have one, so those characters are replaced and REPORTED, and the
 * caller turns that into a loud warning. A silently-mangled label is worse than a
 * missing one, and a silently-empty one is worse than both.
 */
export function encodeWinAnsi(text: string): EncodedText {
  const bytes: number[] = [];
  const unsupported: string[] = [];

  for (const char of text) {
    const code = char.codePointAt(0)!;

    if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else if (WIN_ANSI_HIGH[code] !== undefined) {
      bytes.push(WIN_ANSI_HIGH[code]);
    } else if (code >= 0xa0 && code <= 0xff) {
      bytes.push(code); // Latin-1 supplement lines up with WinAnsi here
    } else if (code === 0x09) {
      bytes.push(0x20); // tab → space
    } else {
      bytes.push(0x3f); // '?'
      unsupported.push(char);
    }
  }

  return { bytes, unsupported };
}

/** Wrap WinAnsi bytes as a PDF literal string, escaping the three characters that bite. */
export function pdfString(bytes: number[]): string {
  let out = '(';
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += '\\'; // ( ) \
    out += String.fromCharCode(byte);
  }
  return out + ')';
}

// ---------------------------------------------------------------------------
// The base-14 fonts
// ---------------------------------------------------------------------------

export type BaseFont =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold';

/**
 * Pick a base-14 font for a CSS font stack.
 *
 * These 14 fonts are built into every PDF reader, so using them means REAL selectable,
 * searchable text with no embedded font program. The diagram's actual face (Inter,
 * system-ui) is not one of them, so the PDF renders in the nearest standard family —
 * that is the documented trade for not shipping a font subsetter.
 */
export function pickBaseFont(fontFamily: unknown, fontWeight: unknown, fontStyle: unknown): BaseFont {
  const family = String(fontFamily ?? '').toLowerCase();
  const weight = String(fontWeight ?? '');
  const bold = weight === 'bold' || Number(weight) >= 600;
  const italic = String(fontStyle ?? '') === 'italic';

  if (family.includes('mono') || family.includes('courier') || family.includes('consolas')) {
    return bold ? 'Courier-Bold' : 'Courier';
  }

  if (family.includes('serif') && !family.includes('sans-serif')) {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold) return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }

  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

/**
 * Helvetica's real glyph advances (AFM units, /1000), for ASCII.
 *
 * Worth the table: every node label is CENTRED, and centring needs a width. With a flat
 * 0.6em guess a centred label sits visibly off-centre in the PDF. With the true advances
 * it lands where the SVG puts it.
 */
const HELVETICA_WIDTHS: Record<number, number> = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556,
  112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722,
  120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584,
};

const BOLD_SCALE = 1.06; // Helvetica-Bold is a touch wider; close enough for centring.

/** Text width in px, for a base-14 font at a given size. */
export function measureBaseFont(font: BaseFont, text: string, fontSize: number): number {
  if (font.startsWith('Courier')) {
    return text.length * 0.6 * fontSize; // Courier is monospaced at 600/1000
  }

  const bold = font.includes('Bold');
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    units += HELVETICA_WIDTHS[code] ?? 556; // an unknown glyph gets the mean advance
  }
  const width = (units / 1000) * fontSize;
  return bold ? width * BOLD_SCALE : width;
}

// ---------------------------------------------------------------------------
// The file container
// ---------------------------------------------------------------------------

/**
 * Assemble a PDF file from its indirect objects.
 *
 * A PDF is: a header, a run of numbered objects, a cross-reference table giving each
 * object's BYTE OFFSET, and a trailer pointing at the catalog. The xref offsets are why
 * this cannot be done with string concatenation alone — they must be measured in BYTES,
 * not characters, so everything is built as bytes from the start.
 */
export class PdfWriter {
  private readonly objects: Array<number[]> = [];

  /** Reserve an object number (1-based). Lets objects reference each other before both exist. */
  allocate(): number {
    this.objects.push([]);
    return this.objects.length;
  }

  /** Fill in an allocated object's body (everything between `N 0 obj` and `endobj`). */
  set(id: number, body: string | number[]): void {
    this.objects[id - 1] = typeof body === 'string' ? latin1Bytes(body) : body;
  }

  /** A stream object: a dict plus raw data. */
  setStream(id: number, dict: string, data: number[]): void {
    const head = latin1Bytes(`<< ${dict} /Length ${data.length} >>\nstream\n`);
    const tail = latin1Bytes('\nendstream');
    this.objects[id - 1] = [...head, ...data, ...tail];
  }

  build(catalogId: number, infoId?: number | null): Uint8Array {
    const out: number[] = [];
    // %PDF-1.4, then a comment line of high bytes marking the file as binary — without
    // it some tools transfer a PDF in text mode and mangle the stream data.
    push(out, '%PDF-1.4\n');
    out.push(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a);

    const offsets: number[] = [];
    for (let i = 0; i < this.objects.length; i++) {
      offsets.push(out.length);
      push(out, `${i + 1} 0 obj\n`);
      out.push(...this.objects[i]);
      push(out, '\nendobj\n');
    }

    const xref = out.length;
    push(out, `xref\n0 ${this.objects.length + 1}\n`);
    push(out, '0000000000 65535 f \n');
    for (const offset of offsets) {
      push(out, `${String(offset).padStart(10, '0')} 00000 n \n`);
    }

    // /Info is what a reader shows as Title/Author in its document-properties panel. It
    // is referenced from the TRAILER, not the catalog — an Info object that exists but is
    // not named here is invisible, which is a silent way to ship "metadata support" that
    // sets no metadata.
    const infoRef = infoId ? ` /Info ${infoId} 0 R` : '';
    push(out, `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R${infoRef} >>\n`);
    push(out, `startxref\n${xref}\n%%EOF\n`);

    return new Uint8Array(out);
  }
}

function push(out: number[], text: string): void {
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff);
}

/** A PDF's syntax is bytes, not UTF-16 — content streams are Latin-1/WinAnsi. */
export function latin1Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff);
  return out;
}

/** UTF-8 bytes, for the few places a PDF wants them (nothing yet — kept honest). */
export const toUtf8 = utf8.encode;

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

/** Page sizes in POINTS (1/72"), which is PDF's only unit. */
export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  a3: { width: 841.89, height: 1190.55 },
  tabloid: { width: 792, height: 1224 },
} as const;

export type PageSize = keyof typeof PAGE_SIZES;
export type Orientation = 'portrait' | 'landscape';

/** The page's dimensions in points, after orientation. */
export function pageDimensions(
  size: PageSize | { width: number; height: number },
  orientation: Orientation
): { width: number; height: number } {
  const base = typeof size === 'string' ? PAGE_SIZES[size] : size;
  const portrait = { width: base.width, height: base.height };
  return orientation === 'landscape' ? { width: portrait.height, height: portrait.width } : portrait;
}
