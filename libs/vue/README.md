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
