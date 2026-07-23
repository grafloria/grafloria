import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'n', position: { x: 380, y: 220 }, size: { width: 180, height: 160 }, label: 'placements',
    ports: [
      { id: 'out', side: 'left' as const,  shape: { shape: 'circle', size: 12 }, label: { text: 'OUT', layout: 'outside' } },
      { id: 'in',  side: 'right' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'IN', layout: 'inside' } },
      { id: 'ort', side: 'top' as const,   shape: { shape: 'circle', size: 12 }, label: { text: 'ORT', layout: 'orthogonal' } },
    ] },
  { id: 'flip', position: { x: 120, y: 250 }, size: { width: 120, height: 80 }, label: 'keepUpright',
    ports: [{ id: 'up', side: 'left' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'up', layout: 'outside', angle: 160, keepUpright: true } }] },
];
const edges: never[] = [];

/** Port labels with placement control: outside, inside, orthogonal — plus an
 *  angled label that keeps itself upright. */
export default function PortLabelsDemo() {
  const onInit = (instance: DiagramInstance) => {
    instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
    instance.renderNow();
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
