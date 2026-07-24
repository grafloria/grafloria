import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(root, 'dist', 'apps', 'demos-react');
const L = (p) => join(root, 'libs', p);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  outfile: join(out, 'main.js'),
  splitting: false,
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  // The renderer's classes rely on ASSIGNMENT semantics for class fields (the
  // same setting the gallery bundle uses). Without this, esbuild's default
  // [[Define]] semantics silently clobber fields — foreignObject html-node
  // bodies stop rendering. Matches demos/build.mjs.
  tsconfigRaw: { compilerOptions: { useDefineForClassFields: false, experimentalDecorators: true } },
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    'fs/promises': L('renderer/e2e/node-stubs.ts'),
    path: L('renderer/e2e/node-stubs.ts'),
    '@grafloria/react': L('react/src/index.ts'),
    '@grafloria/engine': L('engine/src/index.ts'),
    '@grafloria/renderer': L('renderer/src/index.ts'),
    '@grafloria/element': L('element/src/index.ts'),
  },
});

// The off-thread-layout demo spawns a REAL module Worker. esbuild does not
// bundle `new URL('./x.worker.ts', import.meta.url)` under a single-file build,
// so emit the worker as its own ESM entry alongside main.js; the demo loads it
// by its built filename ('./off-thread-layout.worker.js').
await build({
  entryPoints: [join(here, 'src', 'demos', 'off-thread-layout.worker.ts')],
  bundle: true,
  format: 'esm',
  outfile: join(out, 'off-thread-layout.worker.js'),
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@grafloria/engine': L('engine/src/index.ts'),
    '@grafloria/renderer': L('renderer/src/index.ts'),
    '@grafloria/element': L('element/src/index.ts'),
  },
});

cpSync(join(here, 'src', 'index.html'), join(out, 'index.html'));
console.log('demos-react → dist/apps/demos-react');
