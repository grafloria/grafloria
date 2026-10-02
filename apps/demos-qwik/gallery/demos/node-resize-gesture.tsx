import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type EdgeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  // Select it: the renderer paints the full resizer chrome (4 corner dots + 4
  // edge lines). The gesture clamps to these limits DURING the drag.
  { id: 'clamp', position: { x: 140, y: 130 }, size: { width: 160, height: 100 },
    data: { label: '80–260 wide' },
    metadata: { sizing: { minWidth: 80, minHeight: 60, maxWidth: 260, maxHeight: 200 } } },
  // Aspect-locked: every handle holds the 160/100 = 1.6 ratio.
  { id: 'ratio', position: { x: 560, y: 130 }, size: { width: 160, height: 100 },
    data: { label: 'aspect 1.6' },
    metadata: { sizing: { aspectLock: true } } },
];
const edges: EdgeSpec[] = [];

/** Select a node and the renderer paints the resizer chrome — corner dots and
 *  edge lines, each with its own cursor — with min/max/aspect clamped during a
 *  real pointer drag. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$(() => markReady())} />
  </div>
));
