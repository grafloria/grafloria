import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'win',  position: { x: 300, y: 200 }, size: { width: 240, height: 120 }, label: 'window body' },
  { id: 'grip', position: { x: 300, y: 200 }, size: { width: 240, height: 28 },  label: '⠿ title bar (drag me)' },
];
const edges: any[] = [];

/** A designated grip drags its parent — and ONLY the grip: the body still
 *  selects but no longer drags. The grip is made a drag-handle child INSIDE the
 *  parent's top strip through the live model. */
export default function DragHandleDemo() {
  const onInit = (instance: DiagramInstance) => {
    const grip = instance.getModel().getNode('grip');
    if (grip) {
      grip.setParent('win');
      grip.setPosition(0, 0);               // local → covers the parent's top 28px
      grip.setBehavior({ dragHandler: { isDragHandler: true } });
      instance.renderNow();
    }
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
