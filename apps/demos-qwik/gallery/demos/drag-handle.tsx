import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'win',  position: { x: 300, y: 200 }, size: { width: 240, height: 120 }, label: 'window body' },
  { id: 'grip', position: { x: 300, y: 200 }, size: { width: 240, height: 28 },  label: '⠿ title bar (drag me)' },
];
const edges: EdgeSpec[] = [];

/** A designated grip drags its parent — and ONLY the grip: the body still
 *  selects but no longer drags. The grip is made a drag-handle child INSIDE the
 *  parent's top strip through the live model. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
      const grip = instance.getModel().getNode('grip');
      if (grip) {
        grip.setParent('win');
        grip.setPosition(0, 0);               // local → covers the parent's top 28px
        grip.setBehavior({ dragHandler: { isDragHandler: true } });
        instance.renderNow();
      }
      markReady();
    })} />
  </div>
));
