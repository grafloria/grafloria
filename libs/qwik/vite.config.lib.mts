/**
 * The PUBLISHED build of @grafloria/qwik — a Qwik library, packaged the way the
 * official Qwik library template packages one:
 *
 *     npx vite build --config libs/qwik/vite.config.lib.mts --mode lib
 *
 * (or `node libs/qwik/build-release.mjs`, which also emits the types.)
 *
 * `--mode lib` puts the Qwik optimizer in LIBRARY mode: every `component$`, `$()`
 * and `useVisibleTask$` comes out as `componentQrl(inlinedQrl(…))` — already
 * optimized, but with each segment still inline. The output is named
 * `*.qwik.mjs` and package.json points its `qwik` field at it; that pair is what
 * tells a consumer's `qwikVite()` to run ITS optimizer over the file, splitting
 * the segments into lazily loaded chunks of the consumer's own app.
 *
 * Plain `tsc` output (what 0.10.6 shipped) still contained the raw `$()` calls, so
 * a consumer's Vite dev server — which pre-bundles dependencies with esbuild, not
 * with the Qwik optimizer — failed with "Optimizer should replace all usages of
 * $()". Production builds happened to survive; dev never did.
 *
 * Everything a consumer installs alongside us stays EXTERNAL: Qwik itself (one
 * runtime per app, or nothing works), and the engine, renderer and element, which
 * must be the SAME copies the app imports — registries (`registerShape`,
 * `registerConnectionValidator`, `registerTool`) and `instanceof` checks only work
 * across one copy.
 */
import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const shared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
// An ARRAY, not a function: qwikVite adds its own externals in lib mode, and Vite
// merges two arrays but lets one function silently replace the other.
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const external = [/^node:/, ...shared.map((dep) => new RegExp(`^${escape(dep)}(/.*)?$`))];

export default defineConfig({
  root: here,
  // The library is not a site: no public dir, no HTML entry.
  publicDir: false,
  resolve: {
    // SOURCE before output. A checkout that once ran a tsc release build carries a
    // compiled `.js` beside every `.ts` (gitignored), and Vite's default order picks
    // the `.js` — which the optimizer does not transform, so `component$` would ship
    // raw again, the very bug this build exists to fix.
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    target: 'es2020',
    outDir: join(here, 'lib'),
    emptyOutDir: true,
    // Readable output: consumers re-optimize and minify it anyway, and a readable
    // file is one a user can debug from node_modules.
    minify: false,
    sourcemap: true,
    lib: {
      entry: join(here, 'src', 'index.ts'),
      formats: ['es'],
      fileName: () => 'index.qwik.mjs',
    },
    rollupOptions: { external },
  },
  plugins: [qwikVite({ rootDir: here, srcDir: join(here, 'src'), lint: false, debug: process.env['QWIK_DEBUG'] === '1' })],
});
