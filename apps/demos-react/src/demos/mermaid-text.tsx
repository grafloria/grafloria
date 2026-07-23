import { useRef, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
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
export default function MermaidTextDemo() {
  const instanceRef = useRef<DiagramInstance | null>(null);
  const [text, setText] = useState('');
  const doExport = () => { if (instanceRef.current) setText(instanceRef.current.exportText()); };
  const doLoad = () => { instanceRef.current?.loadText(text); };
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        style={{ flex: 1 }}
        onInit={(instance) => {
          instanceRef.current = instance;
          setText(instance.exportText());
          markReady();
        }}
      />
      <div style={{ width: 340, borderLeft: '1px solid #E3E7F2', display: 'flex', flexDirection: 'column', padding: 10, gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={doExport} style={{ padding: '6px 14px', borderRadius: 7, border: 0, background: '#3B52D9', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>⇢ Export</button>
          <button onClick={doLoad} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #94A5F0', background: '#EEF1FE', color: '#3B52D9', fontWeight: 600, cursor: 'pointer' }}>⇠ Load</button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, font: '12.5px/1.6 ui-monospace, Menlo, monospace', border: '1px solid #E3E7F2', borderRadius: 8, padding: 10, resize: 'none' }} />
      </div>
    </div>
  );
}
