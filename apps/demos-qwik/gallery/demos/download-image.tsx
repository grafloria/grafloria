import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

/** Download image: exports the VNode tree — labels, arrowheads, shadows and all
 *  — not a screenshot. PNG (raster) and SVG (vector) both come from the same
 *  instance.export() pipeline. */
const SHADOW = { offsetX: 3, offsetY: 4, blur: 5, color: '#1e293b' };

const nodes = [
  { id: 'ingest',    label: 'Ingest',    position: { x: 60,  y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 } },
  { id: 'transform', label: 'Transform', position: { x: 340, y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2, shadow: SHADOW } },
  { id: 'publish',   label: 'Publish',   position: { x: 620, y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#dcfce7', stroke: '#16a34a', strokeWidth: 2 } },
];
const edges = [
  { id: 'e1', source: 'ingest', target: 'transform', label: 'rows' },
  { id: 'e2', source: 'transform', target: 'publish' },
];

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href; a.download = name; a.click();
}

const btn = { padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const note = useSignal('Exports the VNode tree — not a screenshot.');

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', flexWrap: 'wrap' }}>
        <button style={btn} onClick$={async () => {
          const d = await instance.value!.export('png', { scale: 2 });
          download(d, 'diagram.png');
          note.value = `diagram.png saved (${Math.round(d.length * 3 / 4 / 1024)} KB)`;
        }}>download PNG</button>
        <button style={btn} onClick$={async () => {
          const svg = await instance.value!.export('svg');
          download('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 'diagram.svg');
          note.value = `diagram.svg saved (${Math.round(svg.length / 1024)} KB)`;
        }}>download SVG</button>
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
