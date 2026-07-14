// Bundle the PUBLIC entry point for the gallery.
//
// Deliberately `libs/element` — the framework-free web component — and not the engine's
// internals. A gallery that reached past the public API could show off features an actual
// embedder cannot get to, which is precisely the failure this gallery exists to catch.
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

await build({
  entryPoints: [join(repo, 'libs/element/src/index.ts')],
  bundle: true,
  format: 'esm',
  outfile: join(here, 'shell', 'grafloria.js'),
  platform: 'browser',
  target: 'es2020',
  alias: {
    '@grafloria/engine': join(repo, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(repo, 'libs/renderer/src/index.ts'),
    'fs/promises': join(repo, 'libs/renderer/e2e/node-stubs.ts'),
    path: join(repo, 'libs/renderer/e2e/node-stubs.ts'),
  },
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      useDefineForClassFields: false,
    },
  },
  logLevel: 'warning',
});
console.log('demos: bundled libs/element -> demos/shell/grafloria.js');
