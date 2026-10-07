import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 160 }, size: { width: 150, height: 70 }, label: 'Service A' },
  { id: 'b', position: { x: 560, y: 160 }, size: { width: 150, height: 70 }, label: 'Service B' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct' as const, label: 'depends on' }];

/** An edge label from the spec — drag a node and the label rides its wire;
 *  double-click it on the canvas to edit in place. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$(() => markReady())} />
  </div>
));
