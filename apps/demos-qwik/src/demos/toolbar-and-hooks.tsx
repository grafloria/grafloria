import { component$, useSignal, $ } from '@builder.io/qwik';
import {
  GrafloriaFlow,
  GrafloriaProvider,
  useGrafloria,
  useSelection,
  useViewport,
  type EdgeSpec,
  type NodeSpec,
} from '@grafloria/qwik';

/**
 * The hooks, in the shape an app actually uses them: a `<GrafloriaProvider>`
 * publishes the live instance, and SIBLINGS of the canvas subscribe to it.
 *
 * Every hook here is a SUBSCRIPTION — no diagram state is mirrored into Qwik
 * and no diagram logic lives in this file. Note also that none of the button
 * handlers run until you click one: they are QRLs, so Qwik never downloads
 * them on load.
 */
const nodes: NodeSpec[] = [
  { id: 'plan', position: { x: 60, y: 60 }, size: { width: 160, height: 64 }, label: 'Plan' },
  { id: 'build', position: { x: 300, y: 60 }, size: { width: 160, height: 64 }, label: 'Build' },
  { id: 'test', position: { x: 540, y: 60 }, size: { width: 160, height: 64 }, label: 'Test' },
  { id: 'ship', position: { x: 780, y: 60 }, size: { width: 160, height: 64 }, label: 'Ship' },
];

const edges: EdgeSpec[] = [
  { id: 'e1', source: 'plan', target: 'build', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'build', target: 'test', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e3', source: 'test', target: 'ship', sourceHandle: 'right', targetHandle: 'left' },
];

const Toolbar = component$(() => {
  const store = useGrafloria();
  const selection = useSelection();
  const viewport = useViewport();
  const lastExport = useSignal('');

  const zoomBy = $((delta: number) => {
    store.value?.viewport.zoomBy(delta);
    store.value?.render();
  });

  return (
    <div class="toolbar">
      <button type="button" onClick$={() => zoomBy(0.2)}>
        Zoom in
      </button>
      <button type="button" onClick$={() => zoomBy(-0.2)}>
        Zoom out
      </button>
      <button type="button" onClick$={() => store.value?.fitView(40)}>
        Fit view
      </button>
      <button
        type="button"
        onClick$={async () => {
          const svg = await store.value?.export('svg');
          lastExport.value = svg ? `${svg.length.toLocaleString()} bytes of SVG` : '';
        }}
      >
        Export SVG
      </button>
      <span class="readout">zoom {viewport.value.zoom.toFixed(2)}</span>
      <span class="readout">
        selected {selection.value.nodes.length} node(s), {selection.value.edges.length} edge(s)
      </span>
      {lastExport.value && <span class="readout">{lastExport.value}</span>}
    </div>
  );
});

export default component$(() => (
  <GrafloriaProvider>
    <Toolbar />
    <div class="canvas">
      {/* The outline layer, scoped: hover + selection. `true` would also turn
          on the validation outlines, which on a four-box demo just paints every
          node amber. */}
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        fitView
        highlighterConfig={{ showHover: true, showSelection: true, showValidation: false }}
      />
    </div>
  </GrafloriaProvider>
));
