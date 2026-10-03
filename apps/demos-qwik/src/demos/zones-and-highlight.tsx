import { component$, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type EdgeSpec, type GroupSpec, type NodeSpec } from '@grafloria/qwik';

/**
 * Two props that follow their value live: `groups` (zones around some nodes —
 * a spec's `groups`, or the GroupModels of a loaded document) and
 * `highlightConnected` (select a node and its lines come forward while the
 * rest fade). Both buttons only change Qwik state; the canvas follows.
 */
const nodes: NodeSpec[] = [
  { id: 'order', position: { x: 80, y: 90 }, size: { width: 170, height: 64 }, label: 'Order placed' },
  { id: 'pick', position: { x: 340, y: 90 }, size: { width: 170, height: 64 }, label: 'Pick items' },
  { id: 'pack', position: { x: 340, y: 260 }, size: { width: 170, height: 64 }, label: 'Pack' },
  { id: 'ship', position: { x: 620, y: 170 }, size: { width: 170, height: 64 }, label: 'Ship' },
];

const edges: EdgeSpec[] = [
  { id: 'e1', source: 'order', target: 'pick', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'pick', target: 'pack', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e3', source: 'pack', target: 'ship', sourceHandle: 'right', targetHandle: 'left' },
];

const WAREHOUSE: GroupSpec = { id: 'warehouse', label: 'Warehouse', children: ['pick', 'pack'] };

export default component$(() => {
  const highlight = useSignal(true);
  const zoned = useSignal(true);
  return (
    <>
      <div class="toolbar">
        <button type="button" id="toggle-highlight" onClick$={() => (highlight.value = !highlight.value)}>
          Highlight connected: {highlight.value ? 'on' : 'off'}
        </button>
        <button type="button" id="toggle-zone" onClick$={() => (zoned.value = !zoned.value)}>
          Warehouse zone: {zoned.value ? 'on' : 'off'}
        </button>
        <span class="readout">Click a step to see its lines.</span>
      </div>
      <div class="canvas">
        <GrafloriaFlow
          defaultNodes={nodes}
          defaultEdges={edges}
          groups={zoned.value ? [WAREHOUSE] : []}
          highlightConnected={highlight.value}
          fitView
        />
      </div>
    </>
  );
});
