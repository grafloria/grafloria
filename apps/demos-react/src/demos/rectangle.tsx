import { useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
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

export default function RectangleDemo() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel();
    if (model) {
      registerTool(createRectangleTool(
        whiteboardHost(instance, hostRef.current!),
        { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, label: 'Box' },
      ));
    }
    markReady();
  };

  return (
    <div ref={hostRef} style={{ display: 'block', height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} style={{ display: 'block', height: '100%' }} onInit={onInit} />
    </div>
  );
}
