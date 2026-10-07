import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'n1', position: { x: 260, y: 200 }, size: { width: 120, height: 60 }, label: 'drag me' },
  { id: 'n2', position: { x: 520, y: 200 }, size: { width: 120, height: 60 }, label: 'and me' },
];

/** Drag a node, press ⌘Z / Ctrl+Z — it returns to where the drag began. The
 *  pointer drag now commits one undoable step through the engine command stack;
 *  the page wires nothing beyond rendering the nodes. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} onInit$={$(() => markReady())} />
  </div>
));
