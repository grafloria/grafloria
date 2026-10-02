import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

/** PDF export: a true VECTOR PDF — paths stay paths, text stays selectable text
 *  — with zero new dependencies, straight from instance.export('pdf'). */
const nodes = [
  { id: 'a', label: 'Requirements', position: { x: 60,  y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#eef2ff', stroke: '#4f46e5', strokeWidth: 2 } },
  { id: 'b', label: 'Design',       position: { x: 340, y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2 } },
  { id: 'c', label: 'Ship',         position: { x: 620, y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#ecfdf5', stroke: '#059669', strokeWidth: 2 } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];

const btn = { padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const note = useSignal('A true VECTOR PDF — paths stay paths, text stays selectable text.');

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', flexWrap: 'wrap' }}>
        <button style={btn} onClick$={async () => {
          const href = await instance.value!.export('pdf');
          const a = document.createElement('a');
          a.href = href; a.download = 'diagram.pdf'; a.click();
          note.value = `diagram.pdf saved (${Math.round(href.length * 3 / 4 / 1024)} KB)`;
        }}>download PDF</button>
        <span style={{ font: '12px ui-monospace,monospace', opacity: '.8' }}>{note.value}</span>
      </div>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        style={{ display: 'block', height: 'calc(100vh - 45px)' }}
        onInit$={$((api: DiagramInstance) => { instance.value = noSerialize(api); markReady(); })}
      />
    </div>
  );
});
