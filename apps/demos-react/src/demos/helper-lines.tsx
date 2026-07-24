import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { SnapController } from '@grafloria/element';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'anchor', position: { x: 200, y: 120 }, size: { width: 120, height: 60 }, label: 'anchor' },
  { id: 'below',  position: { x: 200, y: 320 }, size: { width: 120, height: 60 }, label: 'below' },
  { id: 'mover',  position: { x: 460, y: 500 }, size: { width: 120, height: 60 }, label: 'drag me' },
];
const edges: any[] = [];

/** Snaplines: drag a node near another's edge and its position snaps into
 *  alignment with a dashed guide. The page flips enableHelperLines; the pure
 *  SnapController.computeSnap is the engine behind the live drag path. */
export default function HelperLinesDemo() {
  const readoutRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    // SnapController proves the engine; enableHelperLines wires it into the drag.
    void new SnapController({ snapThreshold: 8, equalSpacing: true });
    engine.setInteractionConfig({ enableHelperLines: true });
    if (readoutRef.current) readoutRef.current.textContent = 'drag the lower-right node toward the others — dashed guides appear as edges align';
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
