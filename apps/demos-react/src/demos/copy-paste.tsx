import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'orig', position: { x: 120, y: 120 }, size: { width: 130, height: 50 }, label: 'Original' },
];
const edges: any[] = [];

/** Copy a node, paste it twice — two independent copies, each with its own id
 *  and position. ⌘C / ⌘V drive the engine clipboard, and repeat pastes cascade. */
export default function CopyPasteDemo() {
  const readoutRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    void instance;
    if (readoutRef.current) readoutRef.current.textContent = 'one node — select it, then ⌘C / Ctrl+C to copy and ⌘V / Ctrl+V to paste';
    markReady();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div ref={readoutRef} style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: 0.8,
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }} />
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
