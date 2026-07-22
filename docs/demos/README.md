# The Grafloria demo gallery

**[Browse it live → grafloria.com/demos](https://grafloria.com/demos/)**

100+ self-contained pages, each demonstrating exactly one capability — custom
nodes, layouts, dashboards, UML/ER kits, collaboration, exports, and more.
Every page is real: what you drag, connect, undo, and export runs through the
same published packages you'd install from npm.

## The gallery is also the test suite

Every demo doubles as a CI gate. On each change, headless Chromium loads every
page, drives it with real gestures, and asserts it did something true:

| Gate | What it proves |
| --- | --- |
| `node demos/e2e/gallery-run.mjs` | every demo loads and its feature actually runs |
| `node demos/e2e/interaction-run.mjs` | 1,000+ live-gesture checks (drag, connect, undo…) |
| `node demos/e2e/visual-run.mjs` | 220+ frames pixel-diffed against blessed goldens |
| `node demos/e2e/save-load-run.mjs` | serialization round-trips |
| `node demos/e2e/export-*-run.mjs` | exported SVG/PDF bytes rasterized and pixel-probed |

If a feature regresses, the demo showing it goes red and CI fails. That's the
contract: **if it's in the gallery, it works — and if it works, it's in the
gallery.**

## Run it locally

```sh
npm ci
node demos/build.mjs      # bundle libs → demos/shell/grafloria.js
npx serve demos           # any static server, then open /index.html
```

Each demo page is plain HTML + one module script — view-source is the tutorial.
