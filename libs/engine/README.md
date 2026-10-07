# @grafloria/engine

The headless core of the [Grafloria](https://github.com/grafloria/grafloria)
diagram engine — no DOM required. Graph model (nodes, edges, ports, groups),
commands with undo/redo, layout engines (ELK, dagre, force, tree, grid, and a
zero-config `auto`), a Mermaid-compatible text format with a lossless sidecar,
collaboration op-log with replicas, and serialization with schema migrations.

**Docs:** [tutorials & concept guides](https://grafloria.com/learn/) — start with [The model](https://grafloria.com/learn/the-model/) · [111 live demos](https://grafloria.com/demos/)

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

Runs in browsers, Node, and workers. Pure ESM (tree-shakeable,
`sideEffects: false`); Node ≥ 20.19 can `require()` it too. Pair with `@grafloria/renderer` to draw it, or
one of the framework packages: `@grafloria/element` (any framework),
`@grafloria/react`, `@grafloria/angular`, `@grafloria/vue`.

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is
uncompressed ESM source plus full TypeScript declarations (the whole family
installs ~9 MB). None of it reaches your users as-is; what matters is what
your bundler emits.

Worst case, importing the **entire** public surface of `@grafloria/engine`
(the full headless engine — model, commands/undo, dagre/force/tree/grid layout, Mermaid-compatible DSL, validation, collab, serialization), measured with esbuild (minify, ESM, code-splitting):

| | minified | gzipped |
|---|---|---|
| eager bundle | 991 KB | **251 KB** |
| elkjs — lazy chunk, downloads **only** if ELK layout is invoked | 1,441 KB | 436 KB |

A real app importing only what it uses ships less. Reproduce it in two minutes:

```sh
npm i -D esbuild @grafloria/engine
echo "export * from '@grafloria/engine';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK
chunk and inflates the number by ~1.4 MB. Real app bundlers (Angular CLI,
Vite, Next.js) split by default. Since engine 0.3.0 / renderer 0.4.0 /
element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them,
and Node ≥ 20.19 can `require()` them too.

## Third-party code

Everything a browser loads from this package is a plain ES module, so it also runs
unbundled (Vite's dev server, import maps). Four dependencies only ship CommonJS or
UMD builds, so the package carries ES module copies of them in `vendor/`, each with
its licence at the top of the file:
[eventemitter3](https://github.com/primus/eventemitter3) (MIT),
[@dagrejs/dagre](https://github.com/dagrejs/dagre) and
[@dagrejs/graphlib](https://github.com/dagrejs/graphlib) (MIT),
[lemonadejs](https://github.com/lemonadejs/lemonadejs) (MIT) and
[elkjs](https://github.com/kieler/elkjs) (**EPL-2.0** — `vendor/elk.js`, unchanged
apart from the ES module wrapper; its source is at that link).

MIT © [Grafloria](https://github.com/grafloria/grafloria)
