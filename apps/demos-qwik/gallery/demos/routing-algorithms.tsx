import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const LANES: [string, string, string][] = [
  ['orthogonal', 'orthogonal — HVH elbows', '#2563eb'],
  ['manhattan',  'manhattan — grid search', '#059669'],
  ['elk',        'elk — ELK edge router',   '#7c3aed'],
];

/** The three lanes; `dy` slides the middle (manhattan) lane's wall. */
const build = (dy = 0) => LANES.flatMap(([, label], i) => {
  const yc = 110 + i * 150;
  const oy = yc - 42 + (i === 1 ? dy : 0);
  return [
    { id: 'a' + i, position: { x: 70, y: yc - 24 },  size: { width: 108, height: 48 }, label: 'A' },
    { id: 'b' + i, position: { x: 760, y: yc - 24 }, size: { width: 108, height: 48 }, label: 'B' },
    { id: 'o' + i, position: { x: 410, y: oy }, size: { width: 100, height: 84 },
      label, style: { fill: '#fde68a', stroke: '#d97706' } },
  ];
});
const nodes = build(0);
const edges = LANES.map(([router, , color], i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i, router,
  style: { stroke: color, strokeWidth: 2.5 },
}));

/** "orthogonal:4pts · manhattan:6pts · elk:4pts" — one count per lane. */
const readoutOf = (instance: DiagramInstance) => LANES
  .map(([id], i) => `${id}:${instance.getModel().getLink(`e${i}`)?.points.length ?? '?'}pts`).join('  ·  ');

const BTN = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

/** EdgeSpec.router is a real per-link knob: three lanes, three algorithms,
 *  each dodging the obstacle its own way. Drag an obstacle and watch — or
 *  "move the walls" to slide the manhattan lane's wall and re-solve it live. */
export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const shifted = useSignal(false);
  const readout = useSignal('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', alignItems: 'center',
        borderBottom: '1px solid rgba(127,127,127,.25)', font: '13px system-ui, sans-serif' }}>
        <button id="shuffle" style={BTN} onClick$={() => {
          const api = instance.value;
          if (!api) return;
          shifted.value = !shifted.value;
          api.setNodes(build(shifted.value ? 46 : 0));
          api.renderNow();
          readout.value = readoutOf(api);
        }}>move the walls</button>
        <span id="readout" style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: '.8' }}>{readout.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((api: DiagramInstance) => {
          instance.value = noSerialize(api);
          api.on('nodes:change', () => requestAnimationFrame(() => { readout.value = readoutOf(api); }));
          api.renderNow();
          readout.value = readoutOf(api);
          markReady();
        })} />
      </div>
    </div>
  );
});
