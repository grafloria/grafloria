import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { SwimlaneService } from '@grafloria/element';
import { markReady } from '../ready';

const LANES = [
  { name: 'Backlog', weight: 1 },
  { name: 'In progress', weight: 2 },
  { name: 'Done', weight: 1 },
];
const SIZE = { width: 172, height: 46 };
// Each ticket starts centred in its lane's band (the 480-tall pool splits 1:2:1).
const TICKETS = [
  { id: 'login', label: 'Login page', lane: 0, x: 200, y: 83 },
  { id: 'pdf', label: 'Export to PDF', lane: 0, x: 390, y: 83 },
  { id: 'search', label: 'Search API', lane: 1, x: 200, y: 263 },
  { id: 'billing', label: 'Billing fix', lane: 1, x: 480, y: 263 },
  { id: 'emails', label: 'Onboarding emails', lane: 2, x: 200, y: 443 },
];
const nodes = [
  ...TICKETS.map((t) => ({ id: t.id, position: { x: t.x, y: t.y }, size: SIZE, label: t.label })),
  { id: 'new', position: { x: 1080, y: 240 }, size: SIZE, label: 'New ticket' },
];
const edges: never[] = [];

/** A pool of weighted lanes you can work in by hand: drag tickets between
 *  lanes (each lane's title counts its tickets), drop the new one in, and none
 *  can leave the pool. Grabbing a lane moves the whole pool. */
export default function SwimlanesDemo() {
  const onInit = (instance: DiagramInstance) => {
    const diagram = (instance.getEngine() as any).getDiagram();
    const svc = new SwimlaneService(diagram);
    const { pool, lanes } = svc.createPool({
      name: 'Delivery',
      orientation: 'horizontal',
      bounds: { x: 60, y: 40, width: 980, height: 480 },
      lanes: LANES,
      headerSize: 40,
    });
    TICKETS.forEach((t) => lanes[t.lane].addMember(t.id, diagram));

    const relabel = () => {
      svc.getLanes(pool).forEach((lane, i) => {
        const count = [...lane.members].filter((id) => diagram.getNode(id)).length;
        const name = `${LANES[i].name} · ${count}`;
        if (lane.name !== name) {
          lane.name = name;
          lane.setMetadata('count', count);
        }
      });
      instance.renderNow();
    };
    relabel();
    instance.on('nodes:change', () => setTimeout(relabel, 0));
    instance.fitView(40);
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
