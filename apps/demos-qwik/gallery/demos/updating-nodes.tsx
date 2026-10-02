import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 80, y: 90 }, size: { width: 200, height: 90 }, label: 'BEFORE',
    shape: { type: 'rect', fill: '#eef2ff', stroke: '#6366f1' } },
  { id: 'b', position: { x: 560, y: 90 }, size: { width: 200, height: 90 }, label: 'Steady' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Edit a live node from OUTSIDE the canvas — type a label, pick a background,
 *  drag the width slider — and it re-renders on the spot via the tracked
 *  setters setMetadata / setSize. */
export default component$(() => {
  // The live instance is not data: noSerialize keeps it out of Qwik's state.
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const label = useSignal('BEFORE');
  const color = useSignal('#eef2ff');
  const width = useSignal(200);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '18px', alignItems: 'center', padding: '10px 24px',
        borderBottom: '1px solid rgba(127,127,127,.25)', font: '13px system-ui, sans-serif' }}>
        <label style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>Label
          <input type="text" value={label.value} autocomplete="off"
            onInput$={(_, el) => {
              label.value = el.value;
              instance.value?.getModel().getNode('a')?.setMetadata('label', el.value);
              instance.value?.renderNow();
            }} />
        </label>
        <label style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>Background
          <input type="color" value={color.value}
            onInput$={(_, el) => {
              color.value = el.value;
              instance.value?.getModel().getNode('a')?.setMetadata('shape', { type: 'rect', fill: el.value, stroke: '#334155' });
              instance.value?.renderNow();
            }} />
        </label>
        <label style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>Width
          <input type="range" min={140} max={360} step={1} value={width.value}
            onInput$={(_, el) => {
              width.value = Number(el.value);
              const node = instance.value?.getModel().getNode('a');
              node?.setSize(width.value, node.size.height);
              instance.value?.renderNow();
            }} />
          <output style={{ font: '12px ui-monospace, monospace', minWidth: '32px' }}>{width.value}</output>
        </label>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges}
          onInit$={$((api: DiagramInstance) => { instance.value = noSerialize(api); markReady(); })} />
      </div>
    </div>
  );
});
