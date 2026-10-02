<p align="center">
  <a href="https://grafloria.com"><img src="assets/logo/grafloria-mark.svg" width="120" alt="Grafloria — a bloom of connected diagram nodes"></a>
</p>

<h1 align="center">Grafloria</h1>

<p align="center"><b>Grafloria is an MIT diagram and dashboard engine for JavaScript: one headless core, native Angular, React, Vue and Qwik bindings, one document format and one undo stack.</b></p>

<table align="center"><tr>
<td valign="top" width="50%">

### Grafloria Diagrams
Grafloria Diagrams is an MIT JavaScript diagram library for flowcharts, workflow editors, UML and ER diagrams, with obstacle-avoiding routing, auto-layout, undo and real-time collaboration built in.

**[grafloria.com/diagrams](https://grafloria.com/diagrams/)** · [React](https://grafloria.com/react/) · [Angular](https://grafloria.com/angular/) · [Vue](https://grafloria.com/vue/) · [Qwik](https://grafloria.com/qwik/) · [JavaScript](https://grafloria.com/javascript/) · [Mermaid](https://grafloria.com/mermaid/)

</td><td valign="top" width="50%">

### Grafloria Dashboards
Grafloria Dashboards is an MIT JavaScript dashboard layout library: draggable, resizable widgets on a grid or a splitter layout, with undo, nesting and persistence built in, for Angular, React, Vue or plain JavaScript.

**[grafloria.com/dashboards](https://grafloria.com/dashboards/)** · [tutorial](https://grafloria.com/learn/javascript-dashboards/) · [live demo](https://grafloria.com/demos/dashboard/fluid-board.html) · `npm i @grafloria/dashboard`

</td></tr></table>

Both share one engine: one document format, one undo stack, a diagram can be a widget in a
dashboard. Every capability is one of 100+ live demos, each executed in CI with real pointer
events. MIT licensed, every feature free; there is no commercial tier.

## Documentation

**[grafloria.com/learn](https://grafloria.com/learn/)** — 10-minute tutorials for
JavaScript, React, Vue and Angular, twelve framework-specific deep guides, twelve
concept guides, and reference pages. Every code sample is executed against the
published packages before it is published. Machine-readable full text:
[llms.txt](https://grafloria.com/llms.txt) / [llms-full.txt](https://grafloria.com/llms-full.txt).

## Packages

| Package | What it is |
| --- | --- |
| `@grafloria/engine` | Headless core — graph model, commands/undo, layout engines (ELK, dagre, force, tree…), Mermaid-compatible text format with type-aware import layout, `.drawio` import, collab op-log |
| `@grafloria/renderer` | SVG renderer — interaction, theming, a11y outline, and the export pipeline (SVG, PNG, and a self-contained vector **PDF writer**: gradients, soft masks, images, text) |
| `@grafloria/element` | `<grafloria-flow>` custom element + high-level kits: dashboard kit (grid pack, widgets), UML kit, ERD kit — works in any framework or none |
| `@grafloria/react` | React bindings — component custom nodes, hooks, SSR + hydration |
| `@grafloria/angular` | Angular components, directives, and services |
| `@grafloria/canvas-ng` | Angular canvas integration |
| `@grafloria/vue` | Vue 3 bindings — `v-model` data, slot-based custom nodes |
| `@grafloria/qwik` | Qwik bindings — QRL callbacks, component custom nodes, SSR + **resumability** (no hydration pass) |

All packages are on npm under the [`@grafloria`](https://www.npmjs.com/org/grafloria) scope — ESM for bundlers (tree-shakeable) plus CJS for Node.

## Quick start (any page, no framework)

```html
<script type="module" src="shell/grafloria.js"></script>

<grafloria-flow theme="light" fit-view
  nodes='[{"id":"a","position":{"x":0,"y":0},"label":"Extract"},
          {"id":"b","position":{"x":220,"y":0},"label":"Transform"}]'
  edges='[{"source":"a","target":"b"}]'>
</grafloria-flow>

<script>
  document.querySelector('grafloria-flow')
    .addEventListener('grafloria-connect', (e) => console.log(e.detail.link));
</script>
```

Simple data rides on attributes (JSON strings); rich data goes in as properties
(`el.nodes = [...]`) — the standard custom-element contract every framework's template
binding already targets. Custom node templates are `<template data-node-type="…">`
children. Every capability has a working page in the demo gallery.

## Server rendering (SSR)

A Grafloria diagram renders **in Node, with no DOM**, and the browser then
**adopts** that markup instead of rebuilding it — no flash, no re-layout. Two
functions, both from `@grafloria/renderer` (and re-exported by
`@grafloria/element`, `@grafloria/react` and `@grafloria/qwik`):

```ts
// --- server ---------------------------------------------------------------
import { renderToStaticSVG } from '@grafloria/renderer';

const { html, css, snapshot } = renderToStaticSVG({
  nodes, edges, width: 900, height: 520, fitView: true,
});
// `html` is exactly the markup createDiagram() would have mounted. Send it
// inside your container, and `css` in a <style> in the document head — the
// client re-injects identical content under the same ids, so nothing repaints.

// --- client ---------------------------------------------------------------
import { createDiagram } from '@grafloria/renderer';

container.innerHTML = html;                 // already there if the server sent it
createDiagram(container, { nodes, edges, hydrate: snapshot });
// → patcher.stats.created === 0, removed === 0. The server's DOM nodes are the
//   live ones; nothing was torn down and rebuilt under the user.
```

The render is **deterministic**: node/edge ids fall back to `node-<i>` rather
than a nanoid, auto-created ports get stable `<nodeId>__<side>` names, and the
camera (size, zoom, origin) travels in the snapshot. Server and client
therefore produce byte-identical VNode trees, which is what makes *adoption*
safe instead of a rebuild.

The result also stands alone: `svg` is just the `<svg>`, for an `<img>`, an
email or a README thumbnail.

**Scope, stated plainly.** Custom / HTML-layer nodes are not server-rendered —
they are framework components and the server has no framework. They mount on
the client, inside the (empty, correctly transformed) HTML layer the SSR markup
already carries. Everything the SVG renderer draws — nodes, ports, edges,
labels, arrows, routing — is in the snapshot, which is the part that would
otherwise re-layout.

### Per framework

| | how you turn it on |
| --- | --- |
| `@grafloria/qwik` | `<GrafloriaFlow ssr={{ html, snapshot }} />`. Qwik **resumes** rather than hydrating, so a server-rendered diagram costs *no component JavaScript* until someone interacts with it. |
| `@grafloria/react` | `<GrafloriaFlow ssr={…} />` — adopts the same server DOM, but React still walks the tree to hydrate it. |
| anything else | the two-call form above; `@grafloria/element` also re-exports it as `Grafloria.renderStatic()`. |

For comparison: React Flow cannot do this at all (it is `'use client'`-only),
and Mermaid server-renders something that can never become interactive.

### Run the SSR demo

[`apps/demos-qwik/`](apps/demos-qwik/) is a working Qwik SSR app over the real
library — six routes, server-rendered per request:

```sh
npm ci
npx vite --config apps/demos-qwik/vite.config.ts --mode ssr   # → localhost:4290
```

**`--mode ssr` is required.** Qwik's Vite plugin only starts its dev SSR server
in that mode; without the flag it falls back to a client-only mount (which is
also worth looking at — it is the React/Vue comparison). The `ssr-resumable`
route is the end-to-end proof: view source and the laid-out diagram is already
there, before any JavaScript has run.

## The demo gallery is the documentation

**[Play with 111 live demos → grafloria.com/demos](https://grafloria.com/demos/)** — each
one a real, runnable example of exactly one capability, and each executed in CI as a gate.
If it's in the gallery, it works; if it works, it's in the gallery.

```sh
npm ci
node demos/build.mjs          # bundle libs → demos/shell/grafloria.js
npx serve demos               # any static server — then open /index.html
```

Highlights: a [Visio-style editor](https://grafloria.com/demos/diagrams/visio-editor.html)
with a searchable stencil palette, page grid + snap, zoom/minimap, group/ungroup and a real
properties panel · [.drawio import](https://grafloria.com/demos/misc/drawio-import.html)
(plain **and** compressed saves — the migration on-ramp from diagrams.net) ·
[Mermaid text](https://grafloria.com/mermaid/) in *and* out of the live canvas with
type-aware layout · dashboard builder with drag-pack grid · live-cursor collaboration on an
op-log · ERD / class-UML kits · PDF export with real vector gradients, shadows, and images.

<a href="https://grafloria.com/demos/diagrams/visio-editor.html"><img src="docs/shots/visio-editor.png" alt="The Visio-style editor: searchable stencil palette, page grid with snap, a selected BPMN gateway with its X marker and caption below, a properties panel with Shape / Size &amp; Position / Format sections, minimap and zoom controls"></a>

<p align="center"><i>The Visio-style flagship — every gesture in this screenshot is CI-gated: 41 pointer/keyboard cases, an 80-master render sheet, and 13 in-canvas table-editing cases.</i></p>

## Bundle size — read this before judging the npm stats

Installing the package family unpacks ~9 MB — uncompressed ESM source plus
full TypeScript declarations (pure ESM since engine 0.3.0; Node ≥ 20.19 can
`require()` it too). **None of that is shipped weight.** Measured worst-case — importing the *entire* public surface,
esbuild with minify + ESM + `--splitting`:

| entry | eager (gzip) | notes |
|---|---|---|
| `@grafloria/engine` | **228 KB** | headless: model, undo, layout, DSL, validation, collab |
| `@grafloria/react` / `@grafloria/vue` | **334 KB** | + SVG renderer, interaction, export, themes |
| `@grafloria/angular` | **395 KB** | + the full Angular component library |
| `@grafloria/element` | **451 KB** | the whole stack incl. every kit |
| elkjs layout | 432 KB **lazy** | a split chunk that downloads only if ELK layout is invoked |

Real apps importing only what they use ship less. Each package README carries
a two-minute reproduction script; `--splitting` is essential (without it the
lazy ELK chunk gets inlined and inflates the number by ~1.4 MB).

## Quality gates

The test surface is unusually deep, and all of it runs on every change:

- **6,900+ unit tests** across the engine, renderer, and kits
- **Visual gate** — 235 golden frames pixel-diffed against blessed captures, with
  per-frame tolerance measured from each demo's own run-to-run jitter
- **Interaction gate** — 1,119 live-gesture checks (real mouse, real browser) across all 111 demos
- **Editor gates** — 41 pointer/keyboard gesture cases on the Visio-style editor,
  13 in-canvas table-editing cases, and an 80-master render sheet that fails on a
  clipped caption or ink outside a shape's bounds
- **Mermaid oracle** — 28 cases driven through *real* mermaid v11 in both directions:
  everything we read, real Mermaid accepts; everything we write, real Mermaid parses
- **Export gates** — exported SVG/PDF bytes are rasterized and pixel-probed
  (`pdftoppm`), not just string-matched
- **Save/load, dashboard-scenario, and reachability gates** — every public API a demo
  uses must be importable from the published entry points

## Repository layout

Nx monorepo: libraries in [`libs/`](libs/), the demo gallery in [`demos/`](demos/),
**per-framework demo apps** in [`apps/demos-angular/`](apps/demos-angular/),
[`apps/demos-react/`](apps/demos-react/) and [`apps/demos-vue/`](apps/demos-vue/) —
every gallery demo as a real component in that framework, ~100 routes each, live at
[grafloria.com/demos-angular](https://grafloria.com/demos-angular/) (and `-react`, `-vue`) —
plus an Angular showcase app in [`apps/renderer-demo/`](apps/renderer-demo/) and architecture
notes in [`documentation/`](documentation/).

[`apps/demos-qwik/`](apps/demos-qwik/) is the odd one out and deliberately so: a
Vite app rather than a one-shot esbuild bundle, because Qwik's optimizer is what
turns `component$`, `$()` and every QRL into loadable segments — so the library
has to go through a real Qwik build, which is exactly what a consumer does. It
is also where SSR is exercised end to end (see
[Server rendering](#server-rendering-ssr)).

```sh
npx nx run-many -t test       # all unit tests
node demos/e2e/visual-run.mjs # any gate can be run alone
```

## License

[MIT](LICENSE)
