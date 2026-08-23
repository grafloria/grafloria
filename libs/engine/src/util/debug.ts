/**
 * Opt-in diagnostic logging — SILENT unless a host turns it on.
 *
 * A library has no business narrating into someone else's console. This one did:
 * the published packages carried ~690 ungated `console.log` calls, most of them
 * with emoji, and they fired during ordinary use — a 500-node grid layout emitted
 * 3,492 lines from the router alone, and moving the mouse across a canvas logged
 * a line per port hover, including the consumer's own node labels. In a
 * production app that is noise at best and a data leak at worst; in a hot path it
 * is also cost, since every one of those messages had to be formatted first.
 *
 * The messages themselves are worth keeping — they are how you debug a routing
 * fallback or a layout that chose the wrong tier. So they live here instead,
 * behind a switch that defaults to off:
 *
 * ```ts
 * import { setDebugLogging } from '@grafloria/engine';
 * setDebugLogging(true);   // now the diagnostics appear
 * ```
 *
 * WARNINGS AND ERRORS DO NOT COME THROUGH HERE. `console.warn` and
 * `console.error` are for things the host needs to know about whether or not it
 * asked, and they stay exactly where they are — this module is only for the
 * running commentary.
 *
 * ### Calling it in a hot path
 *
 * The `enabled` check happens INSIDE the call, so the arguments are still
 * evaluated before the call is made: `debugLog(`x ${expensive()}`)` pays for
 * `expensive()` and the template even while logging is off. That is fine for the
 * once-per-layout messages this replaced, and wrong for anything per-frame or
 * per-pointermove — there, guard the call site with `isDebugLogging()` so the
 * arguments are never built.
 */

let enabled = false;

/**
 * Turn diagnostic logging on or off. Off by default, and off is the only state a
 * consumer ever sees unless they ask for otherwise.
 */
export function setDebugLogging(on: boolean): void {
  enabled = on;
}

/** Whether diagnostics are on — use this to guard an expensive call site. */
export function isDebugLogging(): boolean {
  return enabled;
}

/** Emit a diagnostic. No-op unless {@link setDebugLogging} turned it on. */
export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}
