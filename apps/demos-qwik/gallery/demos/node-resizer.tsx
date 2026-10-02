import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type EdgeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 200, y: 140 }, size: { width: 220, height: 110 },
    data: { label: 'Select me, then drag a corner' },
    metadata: { sizing: { minWidth: 120, minHeight: 70, maxWidth: 460, maxHeight: 240 } } },
];
const edges: EdgeSpec[] = [];

/** Select the node: the built-in resizer chrome appears — corner dots + edge
 *  lines, min/max clamped DURING the gesture, one release = one undo step. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$(() => markReady())} />
  </div>
));
