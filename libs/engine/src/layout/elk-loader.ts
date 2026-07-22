/**
 * Lazy, memoized loader for elkjs — the single heaviest dependency in the
 * engine (~1.4 MB bundled GWT output).
 *
 * ELK is only needed when a diagram actually RUNS the `elk` layout algorithm
 * (or the ElkRouter routing strategy). Importing it at module top-level made
 * every consumer bundle carry it whether they used it or not. Loading through
 * `import()` keeps the module graph free of elkjs until first use: bundlers
 * (esbuild, vite, webpack, the Angular CLI) split it into its own chunk that
 * is fetched on the first ELK layout call, and the CommonJS build defers the
 * `require` the same way.
 *
 * The wave11 lesson still applies one level down: constructing `new ELK()`
 * spawns elkjs's nested Worker, so instances must ALSO be created lazily —
 * this loader only fetches the module; callers instantiate on first layout.
 */
let pending: Promise<typeof import('elkjs/lib/elk.bundled')> | undefined;

export function loadElk(): Promise<typeof import('elkjs/lib/elk.bundled')> {
  return (pending ??= import('elkjs/lib/elk.bundled'));
}
