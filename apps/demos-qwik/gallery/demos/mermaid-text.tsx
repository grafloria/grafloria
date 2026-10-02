import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'start', position: { x: 80, y: 60 },  size: { width: 140, height: 60 }, data: { label: 'Start' } },
  { id: 'work',  position: { x: 320, y: 60 }, size: { width: 140, height: 60 }, data: { label: 'Work' } },
  { id: 'done',  position: { x: 560, y: 60 }, size: { width: 140, height: 60 }, data: { label: 'Done' } },
];
const edges = [
  { id: 'e1', source: 'start', target: 'work' },
  { id: 'e2', source: 'work', target: 'done' },
];

/** Diagram-as-text: exportText() writes Mermaid-style text from the live
 *  canvas; loadText() reconciles edited text back INTO the same instance —
 *  positions survive through the lossless sidecar. */
export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const text = useSignal('');
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        style={{ flex: '1' }}
        onInit$={$((api: DiagramInstance) => {
          instance.value = noSerialize(api);
          text.value = api.exportText();
          markReady();
        })}
      />
      <div style={{ width: '340px', borderLeft: '1px solid #E3E7F2', display: 'flex', flexDirection: 'column', padding: '10px', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick$={() => { if (instance.value) text.value = instance.value.exportText(); }}
            style={{ padding: '6px 14px', borderRadius: '7px', border: '0', background: '#3B52D9', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>⇢ Export</button>
          <button onClick$={() => { instance.value?.loadText(text.value); }}
            style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #94A5F0', background: '#EEF1FE', color: '#3B52D9', fontWeight: '600', cursor: 'pointer' }}>⇠ Load</button>
        </div>
        <textarea value={text.value} onInput$={(_, el) => { text.value = el.value; }}
          style={{ flex: '1', font: '12.5px/1.6 ui-monospace, Menlo, monospace', border: '1px solid #E3E7F2', borderRadius: '8px', padding: '10px', resize: 'none' }} />
      </div>
    </div>
  );
});
