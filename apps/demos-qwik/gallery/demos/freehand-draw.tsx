import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerTool, createDrawTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Freehand draw: the pen is live against the canvas. Press and drag to commit
 *  one simplified stroke entity — real vector ink, not a screenshot. A sample
 *  wave is seeded so the board is not blank. */
export default component$(() => {
  const hostRef = useSignal<HTMLDivElement>();
  return (
    <div ref={hostRef} style={{ display: 'block', height: '100vh' }}>
      <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} style={{ display: 'block', height: '100%' }}
        onInit$={$((instance: DiagramInstance) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const model = instance.getModel() as any;
          if (model) {
            const pts = Array.from({ length: 24 }, (_, i) => ({ x: 120 + i * 20, y: 200 + Math.sin(i / 2) * 40 }));
            model.addStroke(new StrokeModel(pts, { color: '#e11d48', width: 3 }, { id: 'seed' }));
            registerTool(createDrawTool(whiteboardHost(instance, hostRef.value!), { color: '#e11d48', width: 3, simplifyEpsilon: 0.8 }));
            instance.renderNow();
          }
          markReady();
        })} />
    </div>
  );
});
