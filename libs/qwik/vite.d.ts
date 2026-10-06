/**
 * The Vite plugin that pre-bundles the engine, renderer and element for the dev
 * server — see `vite.mjs` for why a Qwik library needs it. Structurally a Vite
 * `Plugin`; typed without importing `vite` so this package does not depend on it.
 */
export interface GrafloriaQwikPlugin {
  name: string;
  config(): { optimizeDeps: { include: string[] } };
}
export declare function grafloriaQwik(): GrafloriaQwikPlugin;
export default grafloriaQwik;
