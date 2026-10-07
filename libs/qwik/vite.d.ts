/**
 * An OPTIONAL Vite plugin: it pre-bundles the engine, renderer and element for the
 * dev server (fewer requests on the first load). Not needed — see `vite.mjs`.
 * Structurally a Vite `Plugin`; typed without importing `vite` so this package does
 * not depend on it.
 */
export interface GrafloriaQwikPlugin {
  name: string;
  config(): { optimizeDeps: { include: string[] } };
}
export declare function grafloriaQwik(): GrafloriaQwikPlugin;
export default grafloriaQwik;
