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
  const [nodes, setNodes] = useNodesState([
    { id: 'a', type: 'job', custom: true, position: { x: 0, y: 0 }, data: { title: 'Extract' } },
    { id: 'b', position: { x: 240, y: 0 }, label: 'Load' },
  ]);
  const [edges, setEdges] = useEdgesState([{ source: 'a', target: 'b' }]);
  return (
    <GrafloriaFlow
      nodes={nodes} onNodesChange={setNodes}
      edges={edges} onEdgesChange={setEdges}
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
- **SSR** — `renderToStaticSVG()` on the server, hydrate on the client via the
  `ssr` prop: the diagram adopts the server DOM without a flash.
- Ships ESM for bundlers (tree-shakeable, `sideEffects: false`) plus CJS.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
