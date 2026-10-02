import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerTool, createEraserTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Eraser: wipe over ink to remove it. Whole-stroke delete; a sweep across
 *  several strokes is one undo step. Three parallel strokes are seeded and the
 *  eraser tool is live against the canvas. */
const ink = (id: string, y: number) =>
  new StrokeModel([{ x: 100, y }, { x: 300, y }, { x: 500, y }], { color: '#1f2933', width: 4 }, { id });

export default component$(() => {
  const hostRef = useSignal<HTMLDivElement>();
  return (
    <div ref={hostRef} style={{ display: 'block', height: '100vh' }}>
      <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} style={{ display: 'block', height: '100%' }}
        onInit$={$((instance: DiagramInstance) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const model = instance.getModel() as any;
          if (model) {
            model.addStroke(ink('top', 120));
            model.addStroke(ink('mid', 240));
            model.addStroke(ink('bot', 360));
            registerTool(createEraserTool(whiteboardHost(instance, hostRef.value!), { radius: 10 }));
            instance.renderNow();
          }
          markReady();
        })} />
    </div>
  );
});
