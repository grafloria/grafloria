# Grafloria — Qwik demos

A live gallery for `@grafloria/qwik`, served by Vite's Qwik dev server.

## Run it

```sh
npx vite --config apps/demos-qwik/vite.config.ts --mode ssr
```

Then open <http://localhost:4290/>.

**`--mode ssr` is not optional.** Qwik's Vite plugin only starts its dev SSR
server when the Vite mode is `ssr`; without the flag it falls back to a
client-only mount through `src/entry.dev.tsx`, which is a useful comparison but
is not what this app is for. Both modes work:

```sh
# SSR + resume (the interesting path)
npx vite --config apps/demos-qwik/vite.config.ts --mode ssr

# CSR only — mounts via src/entry.dev.tsx
npx vite --config apps/demos-qwik/vite.config.ts
```

Set `QWIK_DEBUG=1` to turn on the Qwik plugin's transform logging.

## What is here

Each route is one `component$`, selected by `?demo=<slug>`:

- `hello-flow` — plain data in, a live canvas out.
- `editor-chrome` — minimap, zoom controls and background grid from one `plugins` prop.
- `auto-layout` — declarative dagre layout, tracked by prop VALUE.
- `custom-nodes` — real Qwik components rendered into the diagram's HTML layer.
- `toolbar-and-hooks` — `GrafloriaProvider` + `useGrafloria` / `useSelection` / `useViewport`, driven by QRL click handlers.
- `ssr-resumable` — `renderToStaticSVG()` on the server, adopted by the client via `createDiagram({ hydrate })`.

Navigation is plain `<a href="?demo=…">`, so every demo is a fresh **server**
render — which is the thing worth exercising.

## Why this is a Vite app and the others are not

`apps/demos-vue` and `demos/` are one-shot esbuild bundles. Qwik cannot be: the
optimizer is what turns `component$`, `$()` and every QRL into separately
loadable segments, so the library has to go through a real Qwik build. That is
also the honest test — it is exactly what a consumer's app does.

The config aliases `@grafloria/*` straight at the library sources, so edits to
`libs/qwik` hot-reload into the page with no build step.
