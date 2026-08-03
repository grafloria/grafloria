# @grafloria/vue

Vue 3 bindings for the [Grafloria](https://github.com/grafloria/grafloria)
diagram engine — `v-model` data, slot-based custom nodes, declarative layout.

```sh
npm install @grafloria/vue @grafloria/renderer @grafloria/engine
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
  inside the diagram emit back as specs. `defaultNodes`/`defaultEdges` for
  uncontrolled use.
- **Custom nodes are slots** — `#node-<type>` renders every node of that
  `type` (declaring the slot is the whole opt-in); `#node` is the wildcard.
  Real Vue inside: reactivity, components, event handlers.
- **`layout`** — `'elk' | 'dagre' | 'force' | 'tree' | 'grid' | 'auto' | …` or
  `{ name, options }`; re-runs on value change, never on data change;
  `@layout-done` fires after. ELK loads lazily (~1.4 MB you don't ship unless
  a layout runs).
- **Events** — `@init` (the `DiagramInstance`), `@selection-change`,
  `@connect`, `@node-click`, `@edge-click`.
- **Template ref API** — `getInstance()`, `applyLayout()`, `exportSvg()`,
  `exportPdf()`, `exportDiagram()`, `snapshot()`, `fitView()`.

Ships ESM for bundlers (tree-shakeable, `sideEffects: false`) plus CJS for
Node. MIT © [Grafloria](https://github.com/grafloria/grafloria)

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat. Installing the
Grafloria family unpacks ~14 MB because every package publishes its code three
ways — a CJS build, an ESM build, and TypeScript declarations. None of that
reaches your users as-is; what matters is what your bundler emits.

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
Vite, Next.js) split by default. Use current versions — engine ≥ 0.2.13,
renderer ≥ 0.3.12, element ≥ 0.3.22 — older cores were CJS-only, which
defeats splitting and tree-shaking.

