# @grafloria/qwik

Qwik bindings for **Grafloria Diagrams** and **Grafloria Dashboards**. Grafloria is an MIT diagram and dashboard engine for JavaScript: one headless core, native Angular, React, Vue and Qwik bindings, one document format and one undo stack.

Grafloria Diagrams is an MIT JavaScript diagram library for flowcharts, workflow editors, UML and ER diagrams, with obstacle-avoiding routing, auto-layout, undo and real-time collaboration built in. In Qwik: server-rendered and **resumable** — the diagram is on the page, correct, before any component JavaScript runs.

```sh
npm install @grafloria/qwik @grafloria/element @grafloria/renderer @grafloria/engine
```

```tsx
import { component$, useSignal, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type NodeSpec, type EdgeSpec } from '@grafloria/qwik';

export default component$(() => {
  const nodes = useSignal<NodeSpec[]>([
    { id: 'a', type: 'job', position: { x: 0, y: 0 }, size: { width: 180, height: 80 }, data: { title: 'Extract' } },
    { id: 'b', position: { x: 260, y: 0 }, label: 'Load' },
  ]);
  const edges = useSignal<EdgeSpec[]>([{ source: 'a', target: 'b' }]);

  return (
    <GrafloriaFlow
      nodes={nodes.value}
      edges={edges.value}
      layout="elk"
      nodeTypes={{ job: JobCard }}
      onNodesChange$={$((next) => (nodes.value = next))}
      style={{ height: '400px' }}
    />
  );
});
```

- **`nodes` / `edges`** — controlled data; adds and removes made inside the
  diagram come back through `onNodesChange$` / `onEdgesChange$`.
  `defaultNodes` / `defaultEdges` for uncontrolled use.
- **`nodeTypes`** — custom nodes as Qwik components, keyed by node `type`.
  Declaring the type is the whole opt-in. (Read the container caveat below.)
- **`layout`** — `'elk' | 'dagre' | 'force' | 'tree' | 'grid' | 'auto' | …` or
  `{ name, options }`; re-runs on value change, never on data change;
  `onLayoutDone$` fires after. ELK loads lazily (~1.4 MB you don't ship unless
  a layout runs).
- **`highlighterConfig`** — the outline layer: outlines around the hovered node,
  the selected node, nodes with a validation issue, and valid connection
  targets. Off by default; `true` turns every kind on, an object picks kinds
  (`{ showValidation: false }` keeps hover and selection only). Follows the prop live.
- **Callbacks are QRLs** — `onInit$`, `onSelectionChange$`, `onConnect$`,
  `onNodeClick$`, `onEdgeClick$`. The `$` suffix is what lets Qwik's optimizer
  split each handler into its own lazy chunk.
- **Hooks** — `useGrafloria()`, `useSelection()`, `useOnSelectionChange$()`,
  `useViewport()`, and `<GrafloriaProvider>` to reach the instance from
  sibling toolbars and inspectors.

MIT © [Grafloria](https://github.com/grafloria/grafloria)

## Server rendering, and why Qwik gets the best version of it

Every DOM touch in this wrapper happens inside `useVisibleTask$`, which never runs on the server. So the component renders server-side with no `window` anywhere — and you can go further and put the **real diagram** in that HTML:

```tsx
import { renderToStaticSVG, GrafloriaFlow } from '@grafloria/qwik';

// On the server (a routeLoader$, a server$ call, or a build step):
const ssr = renderToStaticSVG({ nodes, edges, width: 800, height: 600 });

// In the component:
<GrafloriaFlow nodes={nodes} edges={edges} ssr={ssr} />;
```

`renderToStaticSVG()` runs the real engine and the real renderer in Node, with no DOM, and returns the exact markup `createDiagram()` would have mounted plus a hydration snapshot. The component emits that markup verbatim, and on the client the visible task **adopts** the existing DOM via `createDiagram({ hydrate })` rather than rebuilding it: no flash, no re-layout.

React Flow cannot do this at all — it is `'use client'`-only. The React binding in this repo can, but React still walks the tree again to hydrate. Qwik *resumes*, so a server-rendered Grafloria diagram costs **no component JavaScript** until someone interacts with it.

Put `ssr.css` in your document head; the client re-injects identical content under the same ids, so nothing repaints.

Custom nodes are not server-rendered — they are framework components and the server has no framework. They mount on the client inside the (empty, correctly transformed) HTML layer the SSR markup already carries.

**See it running.** [`apps/demos-qwik`](https://github.com/grafloria/grafloria/tree/main/apps/demos-qwik) in the repository is a Qwik SSR app over this package; its `ssr-resumable` route is the end-to-end proof (view source and the laid-out diagram is already in the HTML). Clone, then:

```sh
npx vite --config apps/demos-qwik/vite.config.ts --mode ssr
```

`--mode ssr` is required — Qwik's Vite plugin only starts its dev SSR server in that mode.

## Two Qwik-specific rules

**1. Live objects must be `noSerialize()`d.** Qwik serializes the state a component closes over so the page can resume. A transport holds sockets; a `CommentStore` holds subscribers; neither survives JSON. Mark them:

```tsx
import { noSerialize, useSignal } from '@builder.io/qwik';

const collab = useSignal(
  noSerialize({ transport: new WebSocketTransport(url), actor: 'ada', presence: true })
);

<GrafloriaFlow collab={collab.value} … />;
```

The `DiagramInstance` the wrapper hands you is already `noSerialize`d; it comes back `undefined` after a resume, which is correct, because a resumed page builds a fresh instance.

**2. Custom nodes are their own Qwik container.** Qwik has no portal primitive, so `nodeTypes` components are mounted with Qwik's `render()` into the host element the core creates. That creates a *separate* container, which means **a custom node cannot read contexts provided by the surrounding app** — including router contexts. This is intended behaviour for `render()` upstream, not a bug in this wrapper. Keep custom nodes self-contained and feed them through `node.data`. The same applies to `widgetTypes` on `<GrafloriaDashboard>`.

## Qwik version

Targets **Qwik 1.x** (`@builder.io/qwik`). Qwik 2 is published as `@qwik.dev/core` and is still in beta, which is not something a published library should pin a peer range to. A Qwik 2 app can still consume this package: the v2 optimizer rewrites `@builder.io/qwik` imports to `@qwik.dev/core`. You may need the aliases described in the Qwik v2 migration notes for TypeScript to resolve types.

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is uncompressed ESM source plus full TypeScript declarations. None of it reaches your users as-is; what matters is what your bundler emits, and with Qwik the answer is unusually good, because the optimizer splits every `$` boundary into its own chunk and the preloader only fetches what an interaction actually needs.

Reproduce a worst-case eager bundle in two minutes:

```sh
npm i -D esbuild @grafloria/qwik
echo "export * from '@grafloria/qwik';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out --external:@builder.io/qwik
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK chunk and inflates the number by ~1.4 MB. Real app bundlers split by default. Since engine 0.3.0 / renderer 0.4.0 / element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them, and Node ≥ 20.19 can `require()` them too.
