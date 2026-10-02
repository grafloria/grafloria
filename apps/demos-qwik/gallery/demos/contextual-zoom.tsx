import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`, position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 140 },
  size: { width: 150, height: 70 }, label: `Node ${i}`,
}));
const edges: EdgeSpec[] = Array.from({ length: 11 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}`, type: 'direct' }));

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Zoom to `z`, repaint, and report the tier the renderer chose. */
function tierAt(api: DiagramInstance, wrap: HTMLElement | undefined, z: number): string {
  const a = api as any;
  a.viewport.setZoom(z);
  a.renderNow();
  const tier = a.getQualityState().tier;
  const labels = wrap?.querySelectorAll('svg text').length ?? 0;
  return `zoom ${z}×  →  tier "${tier}"  (${labels} text nodes)`;
}

const btn = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

/** Level-of-detail: the tier the renderer draws is a pure function of zoom.
 *  high → medium → sketch → low, both in getQualityState().tier and in the
 *  amount of text that reaches the DOM. */
export default component$(() => {
  const wrap = useSignal<HTMLElement>();
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  const readout = useSignal('');
  const zoom = $((z: number) => {
    if (inst.value) readout.value = tierAt(inst.value, wrap.value, z);
  });

  return (
    <div ref={wrap} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center' }}>
        <span>zoom:</span>
        <button style={btn} onClick$={() => zoom(1.5)}>1.5× high</button>
        <button style={btn} onClick$={() => zoom(0.7)}>0.7× medium</button>
        <button style={btn} onClick$={() => zoom(0.3)}>0.3× sketch</button>
        <button style={btn} onClick$={() => zoom(0.15)}>0.15× low</button>
        <span style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: '0.85' }}>{readout.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} rendererConfig={{ qualityGovernor: false }}
          onInit$={$((instance: DiagramInstance) => {
            inst.value = noSerialize(instance);
            instance.fitView(40);
            readout.value = tierAt(instance, wrap.value, 1.5);
            markReady();
          })} />
      </div>
    </div>
  );
});
