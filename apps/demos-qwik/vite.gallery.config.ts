import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Qwik GALLERY: every gallery demo as a Qwik component, a client-side app
// served at grafloria.com/demos-qwik/ like the React, Vue and Angular ones.
// (vite.config.ts beside it is the server-rendered showcase app.)
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const L = (p: string) => join(root, 'libs', p);

export default defineConfig({
  root: join(here, 'gallery'),
  base: './',
  server: { port: 4291, strictPort: false },
  resolve: {
    // Source before output — a released checkout carries stale compiled .js.
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
    alias: [
      { find: '@grafloria/qwik', replacement: L('qwik/src/index.ts') },
      { find: '@grafloria/engine', replacement: L('engine/src/index.ts') },
      { find: '@grafloria/renderer', replacement: L('renderer/src/index.ts') },
      { find: '@grafloria/element', replacement: L('element/src/index.ts') },
      { find: /^fs\/promises$/, replacement: L('renderer/e2e/node-stubs.ts') },
      { find: /^path$/, replacement: L('renderer/e2e/node-stubs.ts') },
    ],
  },
  esbuild: { target: 'es2020' },
  build: {
    target: 'es2020',
    outDir: join(root, 'dist', 'apps', 'demos-qwik'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  // The off-thread-layout demo's worker imports the engine, whose ELK loader is a
  // lazy import(); rollup refuses that in the default iife worker format.
  worker: { format: 'es' },
  plugins: [qwikVite({ csr: true, lint: false, srcDir: join(here, 'gallery') })],
});
