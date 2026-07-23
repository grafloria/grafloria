import { useRef, useState } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 80,  y: 90 }, size: { width: 200, height: 90 }, label: 'BEFORE',
    shape: { type: 'rect', fill: '#eef2ff', stroke: '#6366f1' } },
  { id: 'b', position: { x: 560, y: 90 }, size: { width: 200, height: 90 }, label: 'Steady' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Edit a live node from OUTSIDE the canvas — type a label, pick a background,
 *  drag the width slider — and it re-renders on the spot via the tracked
 *  setters setMetadata / setSize. */
export default function UpdatingNodesDemo() {
  const instanceRef = useRef<DiagramInstance | null>(null);
  const nodeRef = useRef<any>(null);
  const [label, setLabel] = useState('BEFORE');
  const [color, setColor] = useState('#eef2ff');
  const [width, setWidth] = useState(200);

  const onInit = (instance: DiagramInstance) => {
    instanceRef.current = instance;
    nodeRef.current = instance.getModel().getNode('a');
    markReady();
  };

  const repaint = () => instanceRef.current?.renderNow();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '10px 24px',
        borderBottom: '1px solid rgba(127,127,127,.25)', font: '13px system-ui, sans-serif' }}>
        <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>Label
          <input type="text" value={label} autoComplete="off"
            onChange={(e) => { setLabel(e.target.value); nodeRef.current?.setMetadata('label', e.target.value); repaint(); }} />
        </label>
        <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>Background
          <input type="color" value={color}
            onChange={(e) => { setColor(e.target.value); nodeRef.current?.setMetadata('shape', { type: 'rect', fill: e.target.value, stroke: '#334155' }); repaint(); }} />
        </label>
        <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>Width
          <input type="range" min={140} max={360} step={1} value={width}
            onChange={(e) => { const w = Number(e.target.value); setWidth(w); nodeRef.current?.setSize(w, nodeRef.current.size.height); repaint(); }} />
          <output style={{ font: '12px ui-monospace, monospace', minWidth: 32 }}>{width}</output>
        </label>
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
