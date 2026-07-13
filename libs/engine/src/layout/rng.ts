// Wave 7 (Auto-layout) — Card 0: deterministic randomness.
//
// Three layout adapters seeded themselves from `Math.random()`:
//
//   force-layout-adapter.ts:250   x = (Math.random() - 0.5) * 500
//   spectral-layout-adapter.ts    (power-iteration start vector)
//   community-layout-adapter.ts   (label-propagation tie-breaks)
//
// So the same graph produced different coordinates on every run. That is not a
// stylistic complaint: it makes layout untestable (no golden output), it makes a
// saved diagram unreproducible (reopen it, the picture moves), and it makes the
// mental-map card (#6) impossible to even define — you cannot minimise movement
// against a baseline that itself moves.
//
// Card 0's contract is: SAME GRAPH + SAME SEED => BYTE-IDENTICAL COORDINATES.
// This module is how. It is a plain seeded PRNG (mulberry32: 32-bit state, one
// multiply-xor-shift round — fast, well-distributed enough for layout jitter, and
// famously short so its behaviour is auditable at a glance).
//
// It deliberately does NOT try to be cryptographically anything. Layout wants
// *reproducible* noise, not *unpredictable* noise.

/** A seeded, deterministic source of randomness. */
export interface LayoutRng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  between(min: number, max: number): number;
  /** The seed this generator was created with (so a result can report it). */
  readonly seed: number;
}

/**
 * The seed used when a caller asks for a layout without naming one.
 *
 * A FIXED default (not a time-derived one) is the whole point: an author who
 * never thinks about seeds still gets the same picture every time they open
 * their diagram. Randomness is opt-in, by passing a different seed.
 */
export const DEFAULT_LAYOUT_SEED = 0x5eed;

/** mulberry32 — a small, fast, well-behaved 32-bit PRNG. */
export function createLayoutRng(seed: number = DEFAULT_LAYOUT_SEED): LayoutRng {
  // Normalise: NaN/Infinity/negative/fractional seeds must not silently produce
  // a degenerate generator (a NaN state makes every draw NaN, which lands every
  // node at the same place and looks like "layout didn't run").
  let state = Number.isFinite(seed) ? Math.floor(Math.abs(seed)) >>> 0 : DEFAULT_LAYOUT_SEED;
  if (state === 0) state = DEFAULT_LAYOUT_SEED;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    next,
    between: (min: number, max: number) => min + next() * (max - min),
  };
}

/**
 * Deterministic order for a set of entities.
 *
 * The second half of reproducibility, and the half that is easy to forget: a
 * seeded PRNG only helps if the graph is CONSUMED in a stable order. Node maps
 * iterate in insertion order, which differs between an authored diagram and the
 * same diagram loaded from JSON — so two "identical" graphs could feed the same
 * seeded generator in different orders and still diverge.
 *
 * Sorting by id makes the input canonical, which is what actually makes the
 * layout idempotent across a save/load round-trip.
 */
export function inStableOrder<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
