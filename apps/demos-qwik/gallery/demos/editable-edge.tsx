import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'A' } },
  { id: 'b', position: { x: 620, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'B' } },
];
// A straight wire, as on the JS page: the waypoint you drop is the only bend.
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct' as const }];

/** Click the wire to select it, click its body to drop a waypoint, drag the
 *  waypoint — the route bends to follow. Every bend is undoable.
 *  Waypoint editing is OFF in the engine's defaults, so the demo turns it on
 *  through the interaction config, exactly as the JS gallery page does. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges}
      interaction={{ enableWaypointEditing: true, showWaypointHandles: true }}
      onInit$={$(() => markReady())} />
  </div>
));
