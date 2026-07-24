import { useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 160, y: 160 }, size: { width: 160, height: 70 }, label: 'Drag, then undo' },
  { id: 'b', position: { x: 480, y: 280 }, size: { width: 160, height: 70 }, label: 'Every step counts' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Command-based history on the component surface: drag a node (one gesture =
 *  one step), then undo()/redo() from your own UI — ⌘Z works too. */
export default function UndoRedoDemo() {
  const inst = useRef<DiagramInstance | null>(null);
  const onInit = (instance: DiagramInstance) => {
    inst.current = instance;
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', gap: 8 }}>
        <button onClick={() => void inst.current?.undo()}
          style={{ padding: '7px 16px', borderRadius: 999, border: 0, background: '#3B52D9', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>↩ Undo</button>
        <button onClick={() => void inst.current?.redo()}
          style={{ padding: '7px 16px', borderRadius: 999, border: '1px solid #94A5F0', background: '#EEF1FE', color: '#3B52D9', fontWeight: 600, cursor: 'pointer' }}>↪ Redo</button>
      </div>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
