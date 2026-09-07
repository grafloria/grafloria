import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';

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
      // A short hash is the scope id: it becomes the data-v-… attribute, so it
      // must be attribute-safe (a path is not).
      const id = createHash('md5').update(relative(root, args.path)).digest('hex').slice(0, 8);
      const { descriptor } = parse(src, { filename: args.path });
      const scoped = descriptor.styles.some((s) => s.scoped);
      const scriptResult = compileScript(descriptor, { id, inlineTemplate: true });
      // Compile <style> blocks and inject them at runtime — esbuild bundles a
      // single JS file, so an SFC's styles ride along as a head <style> element
      // (mirrors what a real Vue toolchain does). Without this, a demo whose
      // layout/card CSS lives in <style> mounts unsized and unstyled.
      const css = descriptor.styles
        .map((s) => compileStyle({ source: s.content, filename: args.path, id, scoped: s.scoped }).code)
        .join('\n');
      const styleInject = css
        ? `if (typeof document !== 'undefined') { const __s = document.createElement('style'); __s.textContent = ${JSON.stringify(css)}; document.head.appendChild(__s); }\n`
        : '';
      // <style scoped> compiles to `.x[data-v-ID]` selectors; the renderer only
      // stamps data-v-ID on the component's elements when the component carries
      // __scopeId (what vite-plugin-vue appends). Without it every scoped rule
      // was dead — context-menu and execute-flow mounted unstyled (2026-09-07).
      let code = scriptResult.content;
      if (scoped) {
        code = code.replace(/export default\s+/, 'const __sfc = ') + `\n__sfc.__scopeId = 'data-v-${id}';\nexport default __sfc;\n`;
      }
      return { contents: styleInject + code, loader: 'ts', resolveDir: dirname(args.path) };
    });
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: join(out, 'main.js'),
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  // The renderer's classes rely on ASSIGNMENT semantics for class fields (the
  // same setting the gallery bundle uses). Without this, esbuild's default
  // [[Define]] semantics silently clobber fields — foreignObject html-node
  // bodies stop rendering. Matches demos/build.mjs.
  tsconfigRaw: { compilerOptions: { useDefineForClassFields: false, experimentalDecorators: true } },
  plugins: [vuePlugin],
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  alias: {
    'fs/promises': L('renderer/e2e/node-stubs.ts'),
    path: L('renderer/e2e/node-stubs.ts'),
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
