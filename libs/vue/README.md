# @grafloria/vue

Vue 3 bindings for **Grafloria Diagrams** and **Grafloria Dashboards**. Grafloria is an MIT diagram and dashboard engine for JavaScript: one headless core, native Angular, React and Vue bindings, one document format and one undo stack.

Grafloria Diagrams is an MIT JavaScript diagram library for flowcharts, workflow editors, UML and ER diagrams, with obstacle-avoiding routing, auto-layout, undo and real-time collaboration built in. In Vue: `v-model` data, slot-based custom nodes, declarative layout. `<GrafloriaDashboard>` brings the dashboard layout kit with live `layout`, `sizing` and `static` props.

**Docs:** [Vue 3 in 10 minutes](https://grafloria.com/learn/vue/) · [Vue deep guides](https://grafloria.com/learn/vue-custom-nodes/) · [every demo as a Vue SFC](https://grafloria.com/demos-vue/)

```sh
npm install @grafloria/vue @grafloria/element @grafloria/renderer @grafloria/engine
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow, type NodeSpec, type EdgeSpec } from '@grafloria/vue';

const nodes = ref<NodeSpec[]>([
  { id: 'a', type: 'job', position: { x: 0, y: 0 }, size: { width: 180, height: 80 }, data: { title: 'Extract' } },
  { id: 'b', position: { x: 260, y: 0 }, label: 'Load' },
]);
const edges = ref<EdgeSpec[]>([{ source: 'a', target: 'b' }]);
</script>

<template>
  <GrafloriaFlow v-model:nodes="nodes" v-model:edges="edges" layout="elk" style="height: 400px">
    <template #node-job="{ node, data }">
      <div class="job-card">{{ data.title }}</div>
    </template>
  </GrafloriaFlow>
</template>
```

- **`v-model:nodes` / `v-model:edges`** — controlled data; adds/removes made
  inside the diagram emit back as specs. Ordinary Vue reactivity reaches the
  canvas: replace the array, or change it in place (`nodes.value.push(…)`,
  `nodes.value[0].label = 'X'`) — only the items that changed are applied, so a
  dragged node keeps its place. (In-place changes are seen through the reactive
  proxy, a walk of every field on each change; a very large diagram held in a
  `shallowRef` and replaced skips that walk.) `defaultNodes`/`defaultEdges` for
  uncontrolled use.
- **Custom nodes are slots** — `#node-<type>` renders every node of that
  `type` (declaring the slot is the whole opt-in); `#node` is the wildcard.
  Real Vue inside: reactivity, components, event handlers — and the app
  context: `inject`, globally registered components, plugins and
  `useGrafloria()` all work inside a node.
- **Children reach the instance** — components in `<GrafloriaFlow>`'s default
  slot render after the canvas and can call `useGrafloria()` / `useSelection()`
  with no provider. Wrap the flow and its siblings in `<GrafloriaProvider>` for
  a toolbar outside the flow; the flow then publishes to that provider.
- **`layout`** — `'elk' | 'dagre' | 'force' | 'tree' | 'grid' | 'auto' | …` or
  `{ name, options }`; re-runs on value change, never on data change;
  `@layout-done` fires after. ELK loads lazily (~1.4 MB you don't ship unless
  a layout runs).
- **`highlighterConfig`** — the outline layer: outlines around the hovered node,
  the selected node, nodes with a validation issue, and valid connection
  targets. Off by default; `true` turns every kind on, an object picks kinds
  (`{ showValidation: false }` keeps hover and selection only). Follows the prop live.
- **`highlightConnected`** — select a node and its lines come forward in ink
  while the rest fade: `true`, or `{ depth, stroke, outgoing, dimOpacity }`
  (`depth: Infinity` traces every path in and out). Off by default; follows
  the prop live.
- **`groups` / `defaultGroups`** — zones around some nodes: a spec's `groups`,
  or the live GroupModels of a loaded document (`fromDocument()`), reconciled
  like `nodes`.
- **`<GrafloriaDiagram spec>`** — hosts any kit spec. A CHANGED spec (or
  options) replaces the diagram; an equal one built again on a re-render does
  not, so `spec={erDiagram({ … })}` written inline is fine.
- **Events** — `@init` (the `DiagramInstance`), `@selection-change`,
  `@connect`, `@node-click`, `@edge-click`.
- **Template ref API** — `getInstance()`, `applyLayout()`, `exportSvg()`,
  `exportPdf()`, `exportDiagram()`, `snapshot()`, `fitView()`.

Ships ESM for bundlers (tree-shakeable, `sideEffects: false`) plus CJS for
Node. MIT © [Grafloria](https://github.com/grafloria/grafloria)

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is
uncompressed ESM source plus full TypeScript declarations (the whole family
installs ~9 MB). None of it reaches your users as-is; what matters is what
your bundler emits.

Worst case, importing the **entire** public surface of `@grafloria/vue`
(engine + renderer + the Vue component layer), measured with esbuild (minify, ESM, code-splitting):

| | minified | gzipped |
|---|---|---|
| eager bundle | 1145 KB | **334 KB** |
| elkjs — lazy chunk, downloads **only** if ELK layout is invoked | 1,423 KB | 432 KB |

A real app importing only what it uses ships less. Reproduce it in two minutes:

```sh
npm i -D esbuild @grafloria/vue
echo "export * from '@grafloria/vue';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out --external:vue
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK
chunk and inflates the number by ~1.4 MB. Real app bundlers (Angular CLI,
Vite, Next.js) split by default. Since engine 0.3.0 / renderer 0.4.0 /
element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them,
and Node ≥ 20.19 can `require()` them too.

