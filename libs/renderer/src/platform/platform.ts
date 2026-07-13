/**
 * Platform detection (Card 6 — SSR-safe render + hydration).
 *
 * `@grafloria/renderer` must be importable, and partially USABLE, in a Node/SSR
 * process: `renderToStaticSVG()` runs the real SVGRenderer with no DOM at all.
 * Every DOM / measurement / animation touch therefore goes through one of the
 * guards below rather than assuming `window` exists.
 *
 * The rule (and the reason this module is three functions and not a framework):
 *
 *   - `isBrowser()`  — "may I touch `window`?" (rAF, listeners, ResizeObserver)
 *   - `hasDocument()`— "may I touch `document`?" (element creation, `<style>`)
 *   - `getDocument()`— the ambient document, or `undefined` — never a throw.
 *
 * They are deliberately evaluated PER CALL, not captured at module load: a
 * bundler may evaluate this module during SSR and reuse the same module
 * instance after hydration, so a cached `const isBrowser = typeof window …`
 * would freeze the answer to `false` for the life of the page.
 */

/** True when a real DOM `document` is reachable (browser, jsdom, happy-dom). */
export function hasDocument(): boolean {
  return typeof document !== 'undefined' && !!document;
}

/** True in a browser-like environment: a `window` AND a `document`. */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && hasDocument();
}

/** The ambient `Document`, or `undefined` on the server. Never throws. */
export function getDocument(): Document | undefined {
  return hasDocument() ? document : undefined;
}

/**
 * `requestAnimationFrame`, or a `setTimeout(…, 16)` shim where it is missing
 * (Node, older jsdom). Returns an opaque handle usable with {@link cancelFrame}.
 */
export function requestFrame(callback: (time: number) => void): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(now()), 16) as unknown as number;
}

/** Cancel a handle from {@link requestFrame}, whichever mechanism produced it. */
export function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

/** Monotonic-ish clock that also works where `performance` is absent. */
export function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
