import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'n', position: { x: 380, y: 220 }, size: { width: 180, height: 160 }, label: 'placements',
    ports: [
      { id: 'out', side: 'left' as const,  shape: { shape: 'circle', size: 12 }, label: { text: 'OUT', layout: 'outside' } },
      { id: 'in',  side: 'right' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'IN', layout: 'inside' } },
      { id: 'ort', side: 'top' as const,   shape: { shape: 'circle', size: 12 }, label: { text: 'ORT', layout: 'orthogonal' } },
    ] },
  // Two identical angled labels — one keeps upright, one does not (as on the JS page).
  { id: 'flip', position: { x: 120, y: 250 }, size: { width: 120, height: 80 }, label: 'keepUpright',
    ports: [{ id: 'up', side: 'left' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'up', layout: 'outside', angle: 160, keepUpright: true } }] },
  { id: 'noflip', position: { x: 700, y: 250 }, size: { width: 120, height: 80 }, label: 'raw 160°',
    ports: [{ id: 'raw', side: 'left' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'raw', layout: 'outside', angle: 160, keepUpright: false } }] },
];
const edges: never[] = [];

/** Port labels with placement control: outside, inside, orthogonal — plus an
 *  angled label that keeps itself upright, beside the same angle left raw. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes as never} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
      instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
      instance.renderNow();
      markReady();
    })} />
  </div>
));
