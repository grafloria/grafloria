import { useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { registerTool, createDrawTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Freehand draw: the pen is live against the canvas. Press and drag to commit
 *  one simplified stroke entity — real vector ink, not a screenshot. A sample
 *  wave is seeded so the board is not blank. */
export default function FreehandDrawDemo() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel() as any;
    if (model) {
      const pts = Array.from({ length: 24 }, (_, i) => ({ x: 120 + i * 20, y: 200 + Math.sin(i / 2) * 40 }));
      model.addStroke(new StrokeModel(pts, { color: '#e11d48', width: 3 }, { id: 'seed' }));
      registerTool(createDrawTool(whiteboardHost(instance, hostRef.current!), { color: '#e11d48', width: 3, simplifyEpsilon: 0.8 }));
      instance.renderNow();
    }
    markReady();
  };

  return (
    <div ref={hostRef} style={{ display: 'block', height: '100vh' }}>
      <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} style={{ display: 'block', height: '100%' }} onInit={onInit} />
    </div>
  );
}
