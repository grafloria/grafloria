import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const L = (p: string) => join(root, 'libs', p);

/**
 * The Qwik demo server.
 *
 * Unlike `apps/demos-vue` (a one-shot esbuild bundle) this is a real Vite dev
 * server, because Qwik NEEDS its optimizer: `component$`, `$()` and every QRL
 * are compiled into separately loadable segments. Running the library through
 * the optimizer here is also the honest test — it is exactly what a consumer's
 * app does.
 *
 * `devSsrServer` (on by default) renders each request in Node through
 * `src/entry.ssr.tsx`, so what the browser receives is server-rendered HTML
 * that RESUMES. That is the whole point of the Qwik binding, so the demo
 * should not fake it with a client-only mount.
 */
export default defineConfig({
  root: here,
  server: { port: 4290, strictPort: false },
  resolve: {
    alias: [
      // The workspace libraries, straight from source — no build step, and
      // edits to libs/qwik hot-reload into the page.
      { find: '@grafloria/qwik', replacement: L('qwik/src/index.ts') },
      { find: '@grafloria/engine', replacement: L('engine/src/index.ts') },
      { find: '@grafloria/renderer', replacement: L('renderer/src/index.ts') },
      { find: '@grafloria/element', replacement: L('element/src/index.ts') },
      // @grafloria/engine's TemplateConverter imports node built-ins that the
      // browser bundle must not pull in. Same stubs the other demo bundles use.
      { find: /^fs\/promises$/, replacement: L('renderer/e2e/node-stubs.ts') },
      { find: /^path$/, replacement: L('renderer/e2e/node-stubs.ts') },
    ],
  },
  // The renderer's classes rely on ASSIGNMENT semantics for class fields; the
  // same note that `demos/build.mjs` and `apps/demos-vue/build.mjs` carry.
  esbuild: { target: 'es2020' },
  build: { target: 'es2020' },
  plugins: [
    qwikVite({
      debug: process.env['QWIK_DEBUG'] === '1',
      client: { input: 'src/root.tsx', devInput: 'src/entry.dev.tsx' },
      ssr: { input: 'src/entry.ssr.tsx' },
      // eslint-plugin-qwik is not a workspace dependency; the lint pass would
      // only fail to load.
      lint: false,
    }),
  ],
});
