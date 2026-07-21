// A small, dependency-free DEFLATE pair: RFC 1951 inflate in, stored-block zlib out.
//
// WHY NOT fflate: it IS in node_modules — but only as a transitive dependency of
// `@tokenizer/inflate` (checked in package-lock.json; it appears in no dependency list of
// this workspace). Importing a package we do not declare works until the package that
// does declare it bumps a version, and then the renderer build breaks for a reason
// nobody can see in our package.json. The PDF exporter's whole design is
// dependency-free (see pdf-export.ts's header); ~200 lines of RFC 1951 keeps it that way.
//
// WHY ONLY STORED BLOCKS ON THE WAY OUT: writing a real compressor (LZ77 + Huffman)
// is an order of magnitude more code and bug surface than reading one, and correctness
// beats size here — a stored-block stream is still a 100% valid /FlateDecode stream that
// every PDF reader inflates. The cost is honest: a split RGBA image embeds at raw size.
//
// Everything here is pure (Uint8Array in, Uint8Array out), synchronous, DOM-free and
// deterministic — the properties the exporter guarantees.

/** adler32 (RFC 1950) — the checksum a zlib stream ends with. */
export function adler32(data: Uint8Array): number {
  // 65521 is the largest prime < 2^16; 5552 is the standard NMAX (largest n such that
  // the sums cannot overflow 32 bits before folding).
  let a = 1;
  let b = 0;
  let i = 0;
  while (i < data.length) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) {
      a += data[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// ---------------------------------------------------------------------------
// Inflate — RFC 1951
// ---------------------------------------------------------------------------

/** The length-code table: base lengths and extra bits for codes 257–285. */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
/** The distance-code table: base distances and extra bits for codes 0–29. */
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** The order in which the code-length-code lengths are stored in a dynamic block. */
const CLC_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * A canonical Huffman decoding table.
 *
 * Built from code LENGTHS only (that is all DEFLATE transmits): codes of the same length
 * are consecutive integers, shorter lengths first — RFC 1951 §3.2.2. Decoding walks the
 * bit stream one bit at a time against per-length first-code/first-symbol offsets; at
 * PNG-IDAT sizes this is simple and fast enough, and has no table-size edge cases.
 */
interface Huffman {
  /** counts[len] = how many codes have this length. */
  counts: Int32Array;
  /** symbols, sorted by (length, symbol) — canonical order. */
  symbols: Int32Array;
}

function buildHuffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Int32Array(16);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
  counts[0] = 0;

  // Sanity: an over-subscribed code set can never have been written by a real deflater.
  let left = 1;
  for (let len = 1; len <= 15; len++) {
    left = (left << 1) - counts[len];
    if (left < 0) throw new Error('invalid deflate data: over-subscribed Huffman code');
  }

  const offsets = new Int32Array(16);
  for (let len = 1; len < 15; len++) offsets[len + 1] = offsets[len] + counts[len];

  const symbols = new Int32Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    if (lengths[symbol] !== 0) symbols[offsets[lengths[symbol]]++] = symbol;
  }

  return { counts, symbols };
}

/** The fixed literal/length and distance tables (RFC 1951 §3.2.6), built once. */
let FIXED_LIT: Huffman | null = null;
let FIXED_DIST: Huffman | null = null;
function fixedTables(): { lit: Huffman; dist: Huffman } {
  if (!FIXED_LIT) {
    const litLengths = new Uint8Array(288);
    for (let i = 0; i < 144; i++) litLengths[i] = 8;
    for (let i = 144; i < 256; i++) litLengths[i] = 9;
    for (let i = 256; i < 280; i++) litLengths[i] = 7;
    for (let i = 280; i < 288; i++) litLengths[i] = 8;
    FIXED_LIT = buildHuffman(litLengths);
    FIXED_DIST = buildHuffman(new Uint8Array(30).fill(5));
  }
  return { lit: FIXED_LIT, dist: FIXED_DIST! };
}

class BitReader {
  private pos = 0;
  private bitBuf = 0;
  private bitCount = 0;

  constructor(private readonly data: Uint8Array) {}

  bits(count: number): number {
    while (this.bitCount < count) {
      if (this.pos >= this.data.length) throw new Error('invalid deflate data: unexpected end of stream');
      this.bitBuf |= this.data[this.pos++] << this.bitCount;
      this.bitCount += 8;
    }
    const value = this.bitBuf & ((1 << count) - 1);
    this.bitBuf >>>= count;
    this.bitCount -= count;
    return value;
  }

  /** Decode one symbol: walk the canonical code a bit at a time (RFC 1951 §3.2.2). */
  symbol(huffman: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= this.bits(1);
      const count = huffman.counts[len];
      if (code - first < count) return huffman.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('invalid deflate data: bad Huffman code');
  }

  /** Skip to the next byte boundary and read raw bytes (stored blocks). */
  stored(length: number, out: number[]): void {
    this.bitBuf = 0;
    this.bitCount = 0;
    if (this.pos + length > this.data.length) throw new Error('invalid deflate data: stored block overruns stream');
    for (let i = 0; i < length; i++) out.push(this.data[this.pos++]);
  }

  u16le(): number {
    this.bitBuf = 0;
    this.bitCount = 0;
    if (this.pos + 2 > this.data.length) throw new Error('invalid deflate data: unexpected end of stream');
    return this.data[this.pos++] | (this.data[this.pos++] << 8);
  }
}

/** Inflate a raw RFC 1951 stream. Throws on malformed data — wrong pixels are worse than no pixels. */
export function inflateRaw(data: Uint8Array): Uint8Array {
  const reader = new BitReader(data);
  const out: number[] = [];

  let final = 0;
  do {
    final = reader.bits(1);
    const type = reader.bits(2);

    if (type === 0) {
      // Stored: LEN, NLEN (one's complement), then raw bytes.
      const len = reader.u16le();
      const nlen = reader.u16le();
      if ((len ^ 0xffff) !== nlen) throw new Error('invalid deflate data: stored block LEN/NLEN mismatch');
      reader.stored(len, out);
      continue;
    }

    let lit: Huffman;
    let dist: Huffman;
    if (type === 1) {
      ({ lit, dist } = fixedTables());
    } else if (type === 2) {
      // Dynamic: the two code tables arrive themselves Huffman-coded (RFC 1951 §3.2.7).
      const hlit = reader.bits(5) + 257;
      const hdist = reader.bits(5) + 1;
      const hclen = reader.bits(4) + 4;
      const clcLengths = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) clcLengths[CLC_ORDER[i]] = reader.bits(3);
      const clc = buildHuffman(clcLengths);

      const lengths = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < lengths.length) {
        const sym = reader.symbol(clc);
        if (sym < 16) {
          lengths[i++] = sym;
        } else if (sym === 16) {
          if (i === 0) throw new Error('invalid deflate data: repeat with no previous length');
          const prev = lengths[i - 1];
          let repeat = 3 + reader.bits(2);
          while (repeat-- > 0) lengths[i++] = prev;
        } else if (sym === 17) {
          let repeat = 3 + reader.bits(3);
          while (repeat-- > 0) lengths[i++] = 0;
        } else {
          let repeat = 11 + reader.bits(7);
          while (repeat-- > 0) lengths[i++] = 0;
        }
        if (i > lengths.length) throw new Error('invalid deflate data: code lengths overflow');
      }
      lit = buildHuffman(lengths.subarray(0, hlit));
      dist = buildHuffman(lengths.subarray(hlit));
    } else {
      throw new Error('invalid deflate data: reserved block type');
    }

    // The compressed data proper: literals, end-of-block, and <length, distance> copies.
    for (;;) {
      const sym = reader.symbol(lit);
      if (sym < 256) {
        out.push(sym);
      } else if (sym === 256) {
        break;
      } else {
        const li = sym - 257;
        if (li >= LENGTH_BASE.length) throw new Error('invalid deflate data: bad length code');
        const length = LENGTH_BASE[li] + reader.bits(LENGTH_EXTRA[li]);
        const di = reader.symbol(dist);
        if (di >= DIST_BASE.length) throw new Error('invalid deflate data: bad distance code');
        const distance = DIST_BASE[di] + reader.bits(DIST_EXTRA[di]);
        if (distance > out.length) throw new Error('invalid deflate data: distance beyond output');
        // Byte-at-a-time ON PURPOSE: distance < length is legal (run replication).
        for (let k = 0, from = out.length - distance; k < length; k++) out.push(out[from + k]);
      }
    }
  } while (!final);

  return Uint8Array.from(out);
}

/** Inflate an RFC 1950 (zlib) stream — the wrapper a PNG IDAT uses. */
export function zlibInflate(data: Uint8Array): Uint8Array {
  if (data.length < 6) throw new Error('invalid zlib data: too short');
  const cmf = data[0];
  const flg = data[1];
  // CM must be 8 (deflate) and the header checksum must divide by 31 — RFC 1950.
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) throw new Error('invalid zlib data: bad header');
  if (flg & 0x20) throw new Error('invalid zlib data: preset dictionaries are not supported');
  // The trailing 4 bytes are the adler32; inflateRaw stops at the final block, so simply
  // passing the remainder (checksum included) is safe.
  return inflateRaw(data.subarray(2));
}

// ---------------------------------------------------------------------------
// Deflate (stored blocks only) — RFC 1950/1951
// ---------------------------------------------------------------------------

/**
 * Wrap raw bytes as a valid zlib stream using STORED (uncompressed) deflate blocks.
 *
 * Every PDF reader's /FlateDecode accepts this — stored blocks are ordinary deflate.
 * See the header for why we do not compress.
 */
export function zlibDeflateStored(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + blockCount * 5 + data.length + 4);
  let pos = 0;

  // CMF/FLG: deflate, 32K window; FCHECK makes the 16-bit header divisible by 31.
  out[pos++] = 0x78;
  out[pos++] = 0x01;

  for (let i = 0; i < blockCount; i++) {
    const start = i * 65535;
    const chunk = data.subarray(start, Math.min(start + 65535, data.length));
    out[pos++] = i === blockCount - 1 ? 1 : 0; // BFINAL, BTYPE=00
    out[pos++] = chunk.length & 0xff;
    out[pos++] = chunk.length >> 8;
    out[pos++] = ~chunk.length & 0xff;
    out[pos++] = (~chunk.length >> 8) & 0xff;
    out.set(chunk, pos);
    pos += chunk.length;
  }

  const checksum = adler32(data);
  out[pos++] = (checksum >>> 24) & 0xff;
  out[pos++] = (checksum >>> 16) & 0xff;
  out[pos++] = (checksum >>> 8) & 0xff;
  out[pos++] = checksum & 0xff;

  return out;
}
