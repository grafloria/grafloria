/**
 * `@grafloria/qwik/vite` — one Vite plugin, next to `qwikVite()`:
 *
 * ```ts
 * import { qwikVite } from '@builder.io/qwik/optimizer';
 * import { grafloriaQwik } from '@grafloria/qwik/vite';
 *
 * export default defineConfig({ plugins: [qwikVite(), grafloriaQwik()] });
 * ```
 *
 * WHY IT EXISTS. `@grafloria/qwik` is a Qwik library: its package.json `qwik` field
 * makes `qwikVite()` run the app's optimizer over it — and, by the same token,
 * EXCLUDES it from Vite's dev-server dependency pre-bundling. Vite then serves its
 * imports raw too: it never pre-bundles a package that is imported only from inside
 * `node_modules`. The engine, renderer and element it imports are ESM, but they
 * depend on CommonJS packages (eventemitter3, @dagrejs/dagre, lemonadejs, elkjs) a
 * browser cannot load raw — the dev server failed with "…eventemitter3/index.js does
 * not provide an export named 'default'" while production builds (which bundle
 * everything) worked.
 *
 * Vite's own answer for "an excluded ESM dependency with CommonJS inside" is to list
 * the nested packages in `optimizeDeps.include`. That is all this plugin does — in the
 * `parent > child` form, so it resolves them from where `@grafloria/qwik` is
 * installed (it works under pnpm's strict layout too). Writing the same line in your
 * own config is equivalent:
 *
 * ```ts
 * optimizeDeps: { include: ['@grafloria/qwik > @grafloria/engine',
 *   '@grafloria/qwik > @grafloria/renderer', '@grafloria/qwik > @grafloria/element'] }
 * ```
 */
const NESTED = ['@grafloria/engine', '@grafloria/renderer', '@grafloria/element'];

export function grafloriaQwik() {
  return {
    name: 'vite-plugin-grafloria-qwik',
    config() {
      return { optimizeDeps: { include: NESTED.map((dep) => `@grafloria/qwik > ${dep}`) } };
    },
  };
}

export default grafloriaQwik;
