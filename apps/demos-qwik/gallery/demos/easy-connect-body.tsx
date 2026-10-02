import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
  { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
];

/** Easy Connect, in the ENGINE: press anywhere on a node body and release
 *  anywhere on another and they wire up — no aiming at a 6px port. The page only
 *  flips enableEasyConnect; the built-in drag path does the rest. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} onInit$={$((instance: DiagramInstance) => {
      instance.getEngine().setInteractionConfig({ enableEasyConnect: true } as never);
      instance.renderNow();
      markReady();
    })} />
  </div>
));
