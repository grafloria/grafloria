// flate.ts — the tiny, dependency-free DEFLATE pieces the PDF image path needs.
//
// WHY THIS EXISTS AT ALL: a canvas PNG (the widget capture's image format) is RGBA, and
// PDF has no RGBA — the alpha must be split into a separate /SMask stream. Splitting
// means DECOMPRESSING the PNG's IDAT (zlib), and re-compressing two streams. `fflate`
// sits in node_modules but only as a TRANSITIVE dependency (of @tokenizer/inflate), so
// depending on it would break the day that package drops it. Hence: a small RFC 1950/1951
// inflate of our own, and a stored-block (uncompressed) zlib writer for the way back out.
//
// THE ORACLE: node's own `zlib` (test-side only — the shipped code never touches it).
// Everything my inflate reads was produced by a real deflater, and everything my writer
// produces is read back by a real inflater. That is a far stronger check than fixture
// bytes copied from a spec appendix.

import { deflateSync, inflateSync, deflateRawSync } from 'zlib';
import { adler32, inflateRaw, zlibDeflateStored, zlibInflate } from './flate';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

/** ASCII → bytes. (jsdom's test environment has no TextEncoder.) */
const ascii = (s: string): Uint8Array => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xff));

/** Deterministic pseudo-random bytes — no Math.random in tests. */
function noise(length: number, seed = 0x2f6e2b1): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    out[i] = state >>> 16;
  }
  return out;
}

describe('adler32', () => {
  it('matches the RFC 1950 example values', () => {
    // adler32 of "abc" is 0x024d0127 (well-known vector).
    expect(adler32(bytes(0x61, 0x62, 0x63))).toBe(0x024d0127);
    expect(adler32(new Uint8Array(0))).toBe(1);
  });

  it('matches what node zlib embeds in a stream it wrote', () => {
    const data = noise(70000); // > NMAX, so the modulo folding is exercised
    const stream = deflateSync(data);
    // The last four bytes of a zlib stream ARE the adler32 of the raw data.
    const tail = stream.subarray(stream.length - 4);
    const expected = ((tail[0] << 24) | (tail[1] << 16) | (tail[2] << 8) | tail[3]) >>> 0;
    expect(adler32(data)).toBe(expected);
  });
});

describe('inflateRaw — RFC 1951, all three block types', () => {
  it('reads a STORED block', () => {
    const data = noise(1000);
    expect(Array.from(inflateRaw(deflateRawSync(data, { level: 0 })))).toEqual(Array.from(data));
  });

  it('reads FIXED-Huffman blocks (short highly-compressible data)', () => {
    // Tiny inputs make zlib pick the fixed table (no tree cost to amortise).
    const data = ascii('aaaaabbbbbcccc');
    expect(Array.from(inflateRaw(deflateRawSync(data)))).toEqual(Array.from(data));
  });

  it('reads DYNAMIC-Huffman blocks with real LZ77 matches at every distance class', () => {
    // Repetitive structured data at several scales forces dynamic trees and a spread of
    // length/distance codes, including the extra-bits ranges.
    const pattern = ascii('the quick brown fox jumps over the lazy dog - ');
    const data = new Uint8Array(200000);
    for (let i = 0; i < data.length; i++) data[i] = pattern[i % pattern.length] ^ (i >> 11) & 3;
    expect(Array.from(inflateRaw(deflateRawSync(data)))).toEqual(Array.from(data));
  });

  it('reads multi-block streams (flush points force block boundaries)', () => {
    const data = noise(300000);
    expect(Array.from(inflateRaw(deflateRawSync(data, { level: 1 })))).toEqual(Array.from(data));
  });

  it('MUTATION GUARD: exercises EVERY short match distance, 1–64 and beyond', () => {
    // A survived mutation proved the point: an off-by-one in the distance-base table for
    // codes the test data never emitted round-trips clean. Period-d repetition forces the
    // deflater to a nearest match AT distance d, so each small distance code (and its
    // extra bits) is decoded at least once; the far ones cover the high codes.
    const parts: number[] = [];
    for (const d of [...Array.from({ length: 64 }, (_, i) => i + 1), 100, 250, 700, 3000, 20000, 30000]) {
      const seed = noise(Math.min(d, 4096), d * 2654435761);
      for (let repeat = 0; repeat < 6; repeat++) parts.push(...seed);
    }
    const data = Uint8Array.from(parts);
    expect(Array.from(inflateRaw(deflateRawSync(data)))).toEqual(Array.from(data));
    expect(Array.from(inflateRaw(deflateRawSync(data, { level: 9 })))).toEqual(Array.from(data));
  });

  it('throws on garbage rather than returning wrong pixels', () => {
    expect(() => inflateRaw(noise(64, 0xdead))).toThrow();
  });
});

describe('zlibInflate — the RFC 1950 wrapper PNG IDAT uses', () => {
  it('round-trips node-compressed data at every compression level', () => {
    const data = noise(50000);
    for (const level of [0, 1, 6, 9]) {
      expect(Array.from(zlibInflate(deflateSync(data, { level })))).toEqual(Array.from(data));
    }
  });

  it('rejects a stream that is not zlib (a PNG signature, say)', () => {
    expect(() => zlibInflate(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toThrow();
  });
});

describe('zlibDeflateStored — the way back out', () => {
  it('produces a stream a REAL inflater accepts, byte-for-byte', () => {
    const data = noise(200000); // > one stored block's 65535 limit, so block splitting runs
    expect(Array.from(inflateSync(zlibDeflateStored(data)))).toEqual(Array.from(data));
  });

  it('handles the empty stream and the exact block-boundary sizes', () => {
    for (const size of [0, 1, 65535, 65536]) {
      const data = noise(size, size + 7);
      expect(Array.from(inflateSync(zlibDeflateStored(data)))).toEqual(Array.from(data));
    }
  });

  it('is deterministic — same bytes in, same bytes out (PDF exports must not drift)', () => {
    const data = noise(1000);
    expect(Array.from(zlibDeflateStored(data))).toEqual(Array.from(zlibDeflateStored(data)));
  });
});
