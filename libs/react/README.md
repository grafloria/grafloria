# @grafloria/react

React bindings for the [Grafloria](https://github.com/grafloria/grafloria)
diagram engine — deliberately React Flow-shaped: custom nodes are **your React
components** (portal-mounted, so hooks, context, and state work inside),
controlled or uncontrolled data, hooks, and SSR with hydration.

```sh
npm install @grafloria/react @grafloria/renderer @grafloria/engine
```

```tsx
import { GrafloriaFlow, useNodesState, useEdgesState } from '@grafloria/react';
import type { NodeProps } from '@grafloria/react';

function JobNode({ data }: NodeProps<{ title: string }>) {
  return <div className="job-card">{data.title}</div>;
}

export function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: 'a', type: 'job', custom: true, position: { x: 0, y: 0 }, data: { title: 'Extract' } },
    { id: 'b', position: { x: 240, y: 0 }, label: 'Load' },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([{ source: 'a', target: 'b' }]);
  return (
    <GrafloriaFlow
      nodes={nodes} onNodesChange={onNodesChange}
      edges={edges} onEdgesChange={onEdgesChange}
      nodeTypes={{ job: JobNode }}
      layout="elk" onLayoutDone={() => {}}
    />
  );
}
```

- **Hooks** — `useGrafloria()` (the live instance), `useNodesState`,
  `useEdgesState`, `useSelection`, `useOnSelectionChange`, `useViewport`.
- **`layout`** — declarative auto-layout by registry name or `{ name, options }`;
  re-runs on value change, never on data change. ELK loads lazily.
- **Ports — no `<Handle>` needed.** React Flow requires `<Handle>` components
  because handles ARE its port system. Grafloria's ports are model anatomy:
  declare them on the spec and the core renders, positions, and wires them —
  identically in React, Angular, Vue, and the plain element.

  ```tsx
  { id: 'a', type: 'job', custom: true, position: { x: 0, y: 0 },
    data: { title: 'Extract' },
    ports: [{ id: 'out', side: 'right', type: 'output' }] }
  ```
- **SSR** — `renderToStaticSVG()` on the server, hydrate on the client via the
  `ssr` prop: the diagram adopts the server DOM without a flash.
- Ships ESM for bundlers (tree-shakeable, `sideEffects: false`) plus CJS.

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is
uncompressed ESM source plus full TypeScript declarations (the whole family
installs ~9 MB). None of it reaches your users as-is; what matters is what
your bundler emits.

Worst case, importing the **entire** public surface of `@grafloria/react`
(engine + renderer + the React component layer), measured with esbuild (minify, ESM, code-splitting):

| | minified | gzipped |
|---|---|---|
| eager bundle | 1146 KB | **334 KB** |
| elkjs — lazy chunk, downloads **only** if ELK layout is invoked | 1,423 KB | 432 KB |

A real app importing only what it uses ships less. Reproduce it in two minutes:

```sh
npm i -D esbuild @grafloria/react
echo "export * from '@grafloria/react';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out --external:react --external:react-dom --external:react/jsx-runtime
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK
chunk and inflates the number by ~1.4 MB. Real app bundlers (Angular CLI,
Vite, Next.js) split by default. Since engine 0.3.0 / renderer 0.4.0 /
element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them,
and Node ≥ 20.19 can `require()` them too.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
