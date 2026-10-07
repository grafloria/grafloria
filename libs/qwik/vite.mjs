/**
 * `@grafloria/qwik/vite` — OPTIONAL since the release after 0.10.6. A Vite config
 * needs nothing for Grafloria: `qwikVite()` (plus `qwikCity()` in a Qwik City app)
 * is the whole setup.
 *
 * WHY IT IS NO LONGER NEEDED. `@grafloria/qwik` is a Qwik library, so Vite never
 * pre-bundles it — nor the engine, renderer and element it imports: the dev server
 * serves them as raw ES modules. 0.10.6's engine depended on CommonJS packages a
 * browser cannot load raw (eventemitter3, @dagrejs/dagre, lemonadejs, elkjs) and
 * the dev server died on "…eventemitter3/index.js does not provide an export named
 * 'default'"; this plugin worked around it. Now the engine ships ES module copies of
 * those packages, so everything a browser loads is plain ESM, and the engine,
 * renderer and element carry a `qwik` field, which makes `qwikVite()` serve exactly
 * one copy of each however the app imports them.
 *
 * WHAT IT STILL DOES, if you keep it: it pre-bundles the three packages for the dev
 * server (`optimizeDeps.include`, in the `parent > child` form so it resolves them
 * from where `@grafloria/qwik` is installed, pnpm included). The first dev page load
 * then makes a few dozen requests instead of ~600. Production builds are identical
 * with or without it.
 *
 * ```ts
 * import { qwikVite } from '@builder.io/qwik/optimizer';
 * import { grafloriaQwik } from '@grafloria/qwik/vite';
 *
 * export default defineConfig({ plugins: [qwikVite(), grafloriaQwik()] });
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
