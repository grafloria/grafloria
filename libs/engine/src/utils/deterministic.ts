// DETERMINISTIC SCOPE — a model built without reading the clock or a random source.
//
// Every entity stamps a timestamp and mints random ids (nanoid / uuid → crypto).
// That is right for a live editor and wrong for a STATIC render: a server
// component prerendered by a framework that forbids reading the clock or entropy
// outside a cache boundary (Next 16's default `cacheComponents`) failed on the
// first `Date.now()` in an entity constructor, and a static SVG that embeds
// random ids is not reproducible anyway.
//
// Inside `runDeterministic(fn)` the engine's clock is frozen (default 0) and ids
// come from a counter — no `Date.now()`, no `Math.random()`, no crypto. Outside
// it nothing changes. Scopes nest (the outer one wins) and are synchronous only:
// the scope ends when `fn` returns.

interface Scope {
  now: number;
  seq: number;
  prefix: string;
}

let active: Scope | null = null;

export interface DeterministicOptions {
  /** The frozen clock reading, in ms since the epoch. Default 0. */
  now?: number;
  /** Prefix for the counter ids minted in the scope. Default `'d'`. */
  idPrefix?: string;
}

/**
 * Run `fn` with the engine's clock frozen and its ids drawn from a counter, so
 * building (and rendering) a model reads neither the clock nor a random source and
 * the same input yields the same output. `renderToStaticSVG` runs inside one.
 */
export function runDeterministic<T>(fn: () => T, options: DeterministicOptions = {}): T {
  if (active) return fn();
  active = { now: options.now ?? 0, seq: 0, prefix: options.idPrefix ?? 'd' };
  try {
    return fn();
  } finally {
    active = null;
  }
}

/** Is a deterministic scope active? */
export function isDeterministic(): boolean {
  return active !== null;
}

/** The engine's clock: `Date.now()`, or the frozen reading inside a deterministic scope. */
export function engineNow(): number {
  return active ? active.now : Date.now();
}

/** The next counter value inside a deterministic scope, or null outside one. */
export function nextDeterministicSeq(): number | null {
  return active ? active.seq++ : null;
}

/** The id prefix of the active scope. */
export function deterministicPrefix(): string {
  return active?.prefix ?? 'd';
}
