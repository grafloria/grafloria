import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'a', position: { x: 500, y: 120 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 500, y: 320 }, size: { width: 120, height: 60 }, label: 'B' },
];
const edges: any[] = [];

/** Pan, pinch-zoom, tap-to-select and one-finger node drag — all from real touch
 *  PointerEvents through the same pipeline a phone uses. touch-action:none keeps
 *  the browser from eating the gestures; the engine binder does the rest. */
export default function TouchDeviceDemo() {
  const readoutRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    void instance;
    if (readoutRef.current) readoutRef.current.textContent = 'drive with a finger (or DevTools touch emulation): pan, pinch, tap, drag';
    markReady();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div ref={readoutRef} style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: 0.85,
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }} />
      <div style={{ flex: 1, touchAction: 'none' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
