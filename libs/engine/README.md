# @grafloria/engine

The headless core of the [Grafloria](https://github.com/grafloria/grafloria)
diagram engine — no DOM required. Graph model (nodes, edges, ports, groups),
commands with undo/redo, layout engines (ELK, dagre, force, tree, grid, and a
zero-config `auto`), a Mermaid-compatible text format with a lossless sidecar,
collaboration op-log with replicas, and serialization with schema migrations.

```sh
npm install @grafloria/engine
```

```ts
import { DiagramEngine } from '@grafloria/engine';

const engine = new DiagramEngine();
const diagram = engine.createDiagram('flow');
// … add nodes/links, then:
await engine.layout('elk');          // ELK loads lazily on first use
const doc = diagram.serialize();     // round-trippable document
```

Runs in browsers, Node, and workers. ESM for bundlers (tree-shakeable,
`sideEffects: false`) plus CJS. Pair with `@grafloria/renderer` to draw it, or
one of the framework packages: `@grafloria/element` (any framework),
`@grafloria/react`, `@grafloria/renderer-angular`, `@grafloria/vue`.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
