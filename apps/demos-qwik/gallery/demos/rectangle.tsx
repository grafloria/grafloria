import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerTool, createRectangleTool } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Rectangle tool: drag out a box on the canvas and it becomes a real NODE —
 *  connectable, resizable, laid out — because a rectangle IS a box, unlike
 *  freehand ink. A seeded box shows the shape the tool produces. */
const nodes = [
  { id: 'box1', position: { x: 120, y: 100 }, size: { width: 300, height: 180 }, label: 'Box',
    style: { shape: 'rectangle', fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 } },
];

export default component$(() => {
  const hostRef = useSignal<HTMLDivElement>();
  return (
    <div ref={hostRef} style={{ display: 'block', height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} style={{ display: 'block', height: '100%' }}
        onInit$={$((instance: DiagramInstance) => {
          const model = instance.getModel();
          if (model) {
            registerTool(createRectangleTool(
              whiteboardHost(instance, hostRef.value!),
              { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, label: 'Box' },
            ));
          }
          markReady();
        })} />
    </div>
  );
});
