import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(root, 'dist', 'apps', 'demos-vue');
const L = (p) => join(root, 'libs', p);

// A compact esbuild plugin: SFC → <script setup> + <template> render fn, the
// standard @vue/compiler-sfc pipeline, so the .vue file IS the source that runs.
const vuePlugin = {
  name: 'vue-sfc',
  setup(b) {
    b.onLoad({ filter: /\.vue$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const id = relative(root, args.path);
      const { descriptor } = parse(src, { filename: args.path });
      const scriptResult = compileScript(descriptor, { id, inlineTemplate: true });
      const code = scriptResult.content;
      return { contents: code, loader: 'ts', resolveDir: dirname(args.path) };
    });
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.ts')],
  bundle: true,
  format: 'esm',
  outfile: join(out, 'main.js'),
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  plugins: [vuePlugin],
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  alias: {
    '@grafloria/vue': L('vue/src/index.ts'),
    '@grafloria/engine': L('engine/src/index.ts'),
    '@grafloria/renderer': L('renderer/src/index.ts'),
    '@grafloria/element': L('element/src/index.ts'),
    vue: join(root, 'node_modules/vue/dist/vue.runtime.esm-bundler.js'),
  },
});

// The off-thread-layout demo spawns a REAL module Worker. esbuild does not
// bundle `new URL('./x.worker.ts', import.meta.url)` under a single-file build,
// so emit the worker as its own ESM entry alongside main.js; the demo loads it
// by its built filename ('./layout.worker.js').
await build({
  entryPoints: [join(here, 'src', 'demos', 'layout.worker.ts')],
  bundle: true,
  format: 'esm',
  outfile: join(out, 'layout.worker.js'),
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
console.log('demos-vue → dist/apps/demos-vue');
