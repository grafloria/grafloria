// EDITABLE ROUND-TRIP: the exported picture IS the document.
//
// An exported PNG or SVG is normally a dead end — the model that produced it is gone,
// so "open this diagram someone sent me" means "redraw it by hand". This carries the
// source model INSIDE the artifact, so an export can be re-imported and edited with
// no loss.
//
// WE DO NOT INVENT A FORMAT. The engine already has:
//   • a suite-enforced lossless round-trip invariant — serialize(fromJSON(serialize(d)))
//     is byte-identical to serialize(d);
//   • a portable document envelope with a generator identity and an FNV-1a checksum
//     over the canonical (key-sorted) JSON, which `unwrapDiagramDocument` VERIFIES on
//     load and throws on mismatch.
// So the payload embedded here is exactly that envelope. The checksum is the thing
// that makes this safe: an SVG that some other tool has re-indented, or a PNG that a
// pipeline has re-encoded, does not load as a subtly-wrong diagram — it fails loudly.
//
// WHERE IT GOES
//   SVG   a namespaced <grafloria:model> inside <metadata>. `<metadata>` is the element
//         SVG defines for exactly this, every renderer ignores its content, and a
//         foreign namespace keeps us out of everyone else's way.
//   PNG   an `iTXt` chunk. PNG's text chunks are ancillary, so a decoder that does not
//         know them skips them and the image still displays anywhere.
//
// WHY iTXt AND NOT tEXt: `tEXt` is Latin-1 ONLY. A diagram with a non-Latin-1 label —
// any Arabic, CJK, or even a curly quote — would be silently mangled on the way into a
// tEXt chunk. `iTXt` is UTF-8 by definition, which is what JSON needs.
//
// Everything here is pure: no DOM, no deps, no clock. (The envelope's `createdAt` is
// the one non-deterministic field, so `embedModel` takes it from the caller — see
// `SvgExportOptions.embedModel`.)

import { DiagramSerializer } from '@grafloria/engine';
import type { DiagramDocumentEnvelope, DiagramModel, DiagramLoadOptions } from '@grafloria/engine';

/** The XML namespace the embedded model lives in. */
export const GRAFLORIA_NS = 'https://grafloria.dev/ns/diagram';

/**
 * The PNG text-chunk keyword, and the SVG element name.
 *
 * NOT `grafloria-diagram`: that is already the CSS class on the exported root
 * (`class="grafloria-diagram"`), so "does this file carry a model?" would answer YES for
 * every export we have ever produced.
 */
export const GRAFLORIA_MODEL_KEY = 'grafloria-model';

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXmlText(value: string): string {
  // &amp; LAST: doing it first would turn `&amp;lt;` into `<` instead of `&lt;`.
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Insert the model into an SVG document, right after the root `<svg …>` tag.
 *
 * The JSON is XML-escaped text, not base64 — it stays greppable and diffable, and the
 * envelope's checksum catches any tool that mangles it on the way through.
 */
export function embedModelInSvg(svg: string, envelope: DiagramDocumentEnvelope): string {
  const json = JSON.stringify(envelope);
  const block =
    `<metadata>` +
    `<${GRAFLORIA_MODEL_KEY} xmlns="${GRAFLORIA_NS}">${escapeXmlText(json)}</${GRAFLORIA_MODEL_KEY}>` +
    `</metadata>`;

  const rootEnd = svg.indexOf('>', svg.indexOf('<svg'));
  if (rootEnd < 0) return svg; // not an SVG we recognise — leave it alone
  return svg.slice(0, rootEnd + 1) + block + svg.slice(rootEnd + 1);
}

const MODEL_BLOCK = new RegExp(`<${GRAFLORIA_MODEL_KEY}[^>]*>([\\s\\S]*?)</${GRAFLORIA_MODEL_KEY}>`);

/**
 * Pull the model back out of an SVG. `null` when there is none — a plain SVG is not
 * an error, it is just not editable.
 *
 * THROWS if a model IS present but does not parse: a corrupted payload must not
 * silently degrade into "no model", which would look to the user like a successful
 * import of an empty diagram.
 */
export function extractModelFromSvg(svg: string): DiagramDocumentEnvelope | null {
  const match = MODEL_BLOCK.exec(svg);
  if (!match) return null;

  const json = unescapeXmlText(match[1]);
  try {
    return JSON.parse(json) as DiagramDocumentEnvelope;
  } catch (cause) {
    throw new Error(
      `[grafloria/export] this SVG carries an embedded Grafloria model, but it is not valid JSON — ` +
        `the file was modified or truncated after it was written. (${(cause as Error).message})`
    );
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The standard CRC-32 (IEEE) PNG requires on every chunk. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function writeUint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/**
 * UTF-8, implemented rather than borrowed.
 *
 * `TextEncoder`/`TextDecoder` are NOT reliably global: they are absent in jsdom (which
 * is what the renderer's own tests run in) and were late to Node. Sniffing for them and
 * falling back would give two code paths that can disagree about a surrogate pair — in a
 * module whose entire job is lossless bytes. So: one path, always, everywhere.
 */
export const utf8 = {
  encode(text: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);

      // A surrogate PAIR is one code point; combine it before encoding.
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        const low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }

      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return new Uint8Array(out);
  },

  decode(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; ) {
      const byte = bytes[i];
      let code: number;

      if (byte < 0x80) {
        code = byte;
        i += 1;
      } else if ((byte & 0xe0) === 0xc0) {
        code = ((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
        i += 2;
      } else if ((byte & 0xf0) === 0xe0) {
        code = ((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
        i += 3;
      } else {
        code =
          ((byte & 0x07) << 18) |
          ((bytes[i + 1] & 0x3f) << 12) |
          ((bytes[i + 2] & 0x3f) << 6) |
          (bytes[i + 3] & 0x3f);
        i += 4;
      }

      // Anything past the BMP goes back out as a surrogate pair.
      if (code > 0xffff) {
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      } else {
        out += String.fromCharCode(code);
      }
    }
    return out;
  },
};

/**
 * Build an uncompressed `iTXt` chunk.
 *
 * Layout (PNG spec 11.3.4.5):
 *   keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
 * with the text in UTF-8. We do not compress (flag 0), so `compressionMethod` is 0 and
 * ignored, and the payload stays readable to `strings`.
 */
function buildITxtChunk(keyword: string, text: string): Uint8Array {
  const data: number[] = [
    ...utf8.encode(keyword),
    0, // keyword terminator
    0, // compression flag: uncompressed
    0, // compression method
    0, // language tag: empty, terminated
    0, // translated keyword: empty, terminated
    ...utf8.encode(text),
  ];

  const type = utf8.encode('iTXt');
  const typeAndData = new Uint8Array([...type, ...data]);

  return new Uint8Array([
    ...writeUint32(data.length), // length counts the DATA only, not the type
    ...typeAndData,
    ...writeUint32(crc32(typeAndData)), // CRC covers type + data
  ]);
}

/**
 * Insert the model into a PNG as an `iTXt` chunk, immediately before `IEND`.
 *
 * The pixels are untouched: the result is the same image, and any decoder that does
 * not know the chunk simply skips it (text chunks are ancillary by definition).
 */
export function embedModelInPng(png: Uint8Array, envelope: DiagramDocumentEnvelope): Uint8Array {
  if (!isPng(png)) {
    throw new Error('[grafloria/export] not a PNG (bad signature) — cannot embed the model');
  }

  const chunk = buildITxtChunk(GRAFLORIA_MODEL_KEY, JSON.stringify(envelope));
  const iend = findChunk(png, 'IEND');
  if (iend === null) {
    throw new Error('[grafloria/export] malformed PNG: no IEND chunk');
  }

  // …[chunks]… | OUR CHUNK | IEND
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend.start), 0);
  out.set(chunk, iend.start);
  out.set(png.subarray(iend.start), iend.start + chunk.length);
  return out;
}

interface ChunkRef {
  /** Offset of the chunk's length field. */
  start: number;
  /** Offset of the chunk's data. */
  dataStart: number;
  length: number;
}

/** Walk the chunk list. Returns the FIRST chunk of the given type. */
function findChunk(png: Uint8Array, type: string, keyword?: string): ChunkRef | null {
  let offset = 8; // past the signature

  while (offset + 8 <= png.length) {
    const length = readUint32(png, offset);
    const chunkType = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    const dataStart = offset + 8;

    if (chunkType === type) {
      if (keyword === undefined) {
        return { start: offset, dataStart, length };
      }
      // Match on the chunk's keyword (the bytes up to the first NUL).
      const nul = png.indexOf(0, dataStart);
      if (nul > 0 && nul < dataStart + length) {
        const found = utf8.decode(png.subarray(dataStart, nul));
        if (found === keyword) return { start: offset, dataStart, length };
      }
    }

    // length + type(4) + data + crc(4)
    offset = dataStart + length + 4;
  }
  return null;
}

/**
 * Pull the model back out of a PNG. `null` when the image carries none.
 *
 * Reads BOTH `iTXt` (what we write) and `tEXt` (so a file produced by another tool, or
 * an older writer, still opens).
 */
export function extractModelFromPng(png: Uint8Array): DiagramDocumentEnvelope | null {
  if (!isPng(png)) return null;

  const json = readITxt(png) ?? readTExt(png);
  if (json === null) return null;

  try {
    return JSON.parse(json) as DiagramDocumentEnvelope;
  } catch (cause) {
    throw new Error(
      `[grafloria/export] this PNG carries an embedded Grafloria model, but it is not valid JSON — ` +
        `the file was re-encoded or truncated after it was written. (${(cause as Error).message})`
    );
  }
}

function readITxt(png: Uint8Array): string | null {
  const chunk = findChunk(png, 'iTXt', GRAFLORIA_MODEL_KEY);
  if (!chunk) return null;

  const end = chunk.dataStart + chunk.length;
  // keyword \0 flag method lang \0 translated \0 text
  let cursor = png.indexOf(0, chunk.dataStart) + 1; // past keyword
  const compressed = png[cursor];
  cursor += 2; // compression flag + method

  if (compressed === 1) {
    throw new Error(
      '[grafloria/export] the embedded model is a COMPRESSED iTXt chunk. This reader does not inflate ' +
        '(zlib is not a dependency of the renderer) — re-export with the Grafloria writer, which never compresses.'
    );
  }

  cursor = png.indexOf(0, cursor) + 1; // past language tag
  cursor = png.indexOf(0, cursor) + 1; // past translated keyword

  return utf8.decode(png.subarray(cursor, end));
}

function readTExt(png: Uint8Array): string | null {
  const chunk = findChunk(png, 'tEXt', GRAFLORIA_MODEL_KEY);
  if (!chunk) return null;

  const end = chunk.dataStart + chunk.length;
  const cursor = png.indexOf(0, chunk.dataStart) + 1; // past keyword
  return utf8.decode(png.subarray(cursor, end));
}

// ---------------------------------------------------------------------------
// data: URLs — the raster backends hand back a URL, not bytes
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure base64 → bytes. (No `atob`: it does not exist in Node, and this must stay DOM-free.) */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);

  let outIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, outIndex);
}

/** Pure bytes → base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += B64[a >> 2];
    out += B64[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 0x3f];
  }
  return out;
}

/** `data:image/png;base64,…` → the bytes. Throws on a URL that is not base64 data. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) {
    throw new Error('[grafloria/export] not a data: URL');
  }
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);

  if (!header.includes('base64')) {
    // The SVG data URL path is percent-encoded, not base64 (btoa cannot take non-Latin-1).
    return utf8.encode(decodeURIComponent(payload));
  }
  return base64ToBytes(payload);
}

/** bytes → `data:<mime>;base64,…` */
export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

// ---------------------------------------------------------------------------
// The import path
// ---------------------------------------------------------------------------

/** Anything a user might drop on the canvas: an SVG string, a data: URL, or raw bytes. */
export type Artifact = string | Uint8Array;

/**
 * Find the embedded model in ANY exported artifact — SVG text, a `data:` URL of
 * either kind, or PNG bytes. `null` when the artifact carries no model (a plain image
 * is not an error; it is simply not editable).
 */
export function extractModel(artifact: Artifact): DiagramDocumentEnvelope | null {
  if (typeof artifact !== 'string') {
    // Bytes: a PNG, or an SVG someone read as a buffer.
    return isPng(artifact) ? extractModelFromPng(artifact) : extractModelFromSvg(utf8.decode(artifact));
  }

  if (artifact.startsWith('data:')) {
    const bytes = dataUrlToBytes(artifact);
    return isPng(bytes) ? extractModelFromPng(bytes) : extractModelFromSvg(utf8.decode(bytes));
  }

  return extractModelFromSvg(artifact);
}

/** Does this artifact carry a model we could re-open? */
export function isEditableArtifact(artifact: Artifact): boolean {
  try {
    return extractModel(artifact) !== null;
  } catch {
    // A present-but-broken payload is not an editable artifact — but it IS a thing the
    // caller may want to report, so `extractModel` still throws for anyone who asks.
    return false;
  }
}

/**
 * Re-open an exported artifact as a live diagram.
 *
 * The rehydration runs through the ENGINE's own `DiagramSerializer.deserialize`, which
 * unwraps the envelope, VERIFIES the checksum (throwing on a mismatch), and runs the
 * schema migrations. So an artifact exported by an older build opens in a newer one,
 * and a corrupted one refuses to open rather than opening subtly wrong.
 *
 * Returns `null` for an artifact with no embedded model.
 */
export function importDiagram(artifact: Artifact, options?: DiagramLoadOptions): DiagramModel | null {
  const envelope = extractModel(artifact);
  if (!envelope) return null;
  return new DiagramSerializer().deserialize(envelope, options);
}
