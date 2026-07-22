/**
 * Lazy, memoized loader for the canvas-plugins chain (minimap, zoom/fit
 * controls, background grid) — the elkjs recipe applied to the ext layer.
 *
 * The framework wrappers reference `attachCanvasPlugins` on their `plugins`
 * code path; a STATIC import makes every consumer bundle carry the whole ext
 * chain whether plugins are used or not (measured: +0.6 MB on the Angular
 * consumer app). Loading through `import()` keeps the chain out of the module
 * graph until the first attach — bundlers split it into its own chunk.
 */
let pending: Promise<typeof import('./components/attach')> | undefined;

export function loadCanvasPlugins(): Promise<typeof import('./components/attach')> {
  return (pending ??= import('./components/attach'));
}
