import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
  { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
];

/** Proximity connect, wired into the ENGINE: drag a node next to another and the
 *  wire proposes AND commits itself — the engine's own drag path, not host glue.
 *  The page only sets enableProximityConnect. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} onInit$={$((instance: DiagramInstance) => {
      instance.getEngine().setInteractionConfig({ enableProximityConnect: true } as never);
      instance.renderNow();
      markReady();
    })} />
  </div>
));
