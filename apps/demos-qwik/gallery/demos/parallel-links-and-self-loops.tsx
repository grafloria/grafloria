import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 140, y: 120 }, size: { width: 130, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 660, y: 120 }, size: { width: 130, height: 60 }, label: 'B' },
  { id: 's', position: { x: 400, y: 380 }, size: { width: 130, height: 60 }, label: 'Self' },
];
const edges = [
  { id: 'p1', source: 'a', target: 'b', type: 'direct' as const },
  { id: 'p2', source: 'a', target: 'b', type: 'direct' as const },
  { id: 'p3', source: 'a', target: 'b', type: 'direct' as const },
  { id: 'loop', source: 's', target: 's' },
];

/** Three links between the same pair auto-separate onto their own lanes
 *  (parallelLinks, on by default); a link from a node to ITSELF routes as a real
 *  loop outside the node body. The lane spacing (18) is the JS page's. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges}
      rendererConfig={{ parallelLinks: true, parallelSpacing: 18 }}
      onInit$={$(() => markReady())} />
  </div>
));
