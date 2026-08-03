/**
 * Memoized loader for the canvas-plugins chain (minimap, zoom/fit controls,
 * background grid). The async signature is load-bearing — wrappers await it —
 * but the import underneath is STATIC on purpose.
 *
 * It used to be a lazy `import()`. That made attach.js the only module in the
 * package that was both statically re-exported (the public
 * `attachCanvasPlugins` API) and dynamically imported — and esbuild compiles
 * that dual shape into a lazy-init wrapper whose hoisted functions stay
 * reachable through the static re-export BEFORE the wrapper has assigned the
 * module's consts. A consumer bundling with esbuild (no splitting) and calling
 * `attachCanvasPlugins()` directly crashed inside `createBackground` on an
 * undefined SVG_NS. The chain measures ~17 KB minified — laziness here bought
 * nothing worth that failure mode. (elkjs stays lazy; it is 1.4 MB and
 * dynamic-ONLY, which is the shape that makes laziness safe.)
 */
import * as attachModule from './components/attach';

export function loadCanvasPlugins(): Promise<typeof import('./components/attach')> {
  return Promise.resolve(attachModule);
}
