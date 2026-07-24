import { useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { registerTool, createEraserTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Eraser: wipe over ink to remove it. Whole-stroke delete; a sweep across
 *  several strokes is one undo step. Three parallel strokes are seeded and the
 *  eraser tool is live against the canvas. */
const ink = (id: string, y: number) =>
  new StrokeModel([{ x: 100, y }, { x: 300, y }, { x: 500, y }], { color: '#1f2933', width: 4 }, { id });

export default function EraserDemo() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel() as any;
    if (model) {
      model.addStroke(ink('top', 120));
      model.addStroke(ink('mid', 240));
      model.addStroke(ink('bot', 360));
      registerTool(createEraserTool(whiteboardHost(instance, hostRef.current!), { radius: 10 }));
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
