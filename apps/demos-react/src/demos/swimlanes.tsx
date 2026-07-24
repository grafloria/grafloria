import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { SwimlaneService } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'task', position: { x: 1090, y: 300 }, size: { width: 120, height: 50 }, label: 'ticket' },
];
const edges: never[] = [];

/** Pools and weighted lanes that tile a frame: a "Delivery" pool split into
 *  three lanes — Backlog, In progress (weight 2, twice as tall), Done — through
 *  the public SwimlaneService. */
export default function SwimlanesDemo() {
  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    const diagram = engine.getDiagram();
    const svc = new SwimlaneService(diagram);
    svc.createPool({
      name: 'Delivery',
      orientation: 'horizontal',
      bounds: { x: 60, y: 60, width: 1000, height: 480 },
      lanes: [
        { name: 'Backlog', weight: 1 },
        { name: 'In progress', weight: 2 },
        { name: 'Done', weight: 1 },
      ],
      headerSize: 40,
    });
    instance.renderNow();
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
