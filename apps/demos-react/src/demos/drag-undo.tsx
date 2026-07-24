import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'n1', position: { x: 260, y: 200 }, size: { width: 120, height: 60 }, label: 'drag me' },
  { id: 'n2', position: { x: 520, y: 200 }, size: { width: 120, height: 60 }, label: 'and me' },
];
const edges: any[] = [];

/** Drag a node, press ⌘Z / Ctrl+Z — it returns to where the drag began. The
 *  pointer drag now commits one undoable step through the engine command stack;
 *  the page wires nothing beyond rendering the nodes. */
export default function DragUndoDemo() {
  const onInit = (instance: DiagramInstance) => {
    void instance;
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
