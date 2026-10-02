/**
 * `@qwik-client-manifest` is a VIRTUAL module: the Qwik Vite plugin generates
 * it at build time and `@builder.io/qwik/server` imports it unconditionally.
 * Jest has no Vite, so the import fails to resolve and the whole server entry
 * point blows up before a single test runs.
 *
 * The server reads exactly one thing from it — `manifest` — and treats
 * `undefined` as "no manifest", which is the correct answer in a test: there
 * is no client build, so there are no symbol-to-chunk mappings to look up and
 * QRLs resolve through the dev-mode path instead.
 */
export const manifest = undefined;
