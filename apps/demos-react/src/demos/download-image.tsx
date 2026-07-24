import { useRef, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
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

export default function DownloadImageDemo() {
  const instanceRef = useRef<DiagramInstance | null>(null);
  const [note, setNote] = useState('Exports the VNode tree — not a screenshot.');

  const downloadPng = async () => {
    const d = await instanceRef.current!.export('png', { scale: 2 });
    download(d, 'diagram.png');
    setNote(`diagram.png saved (${Math.round(d.length * 3 / 4 / 1024)} KB)`);
  };
  const downloadSvg = async () => {
    const svg = await instanceRef.current!.export('svg');
    download('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 'diagram.svg');
    setNote(`diagram.svg saved (${Math.round(svg.length / 1024)} KB)`);
  };

  const btn = { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' } as const;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', flexWrap: 'wrap' }}>
        <button onClick={downloadPng} style={btn}>download PNG</button>
        <button onClick={downloadSvg} style={btn}>download SVG</button>
        <span style={{ font: '12px ui-monospace,monospace', opacity: .8 }}>{note}</span>
      </div>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        style={{ display: 'block', height: 'calc(100vh - 45px)' }}
        onInit={(instance) => { instanceRef.current = instance; markReady(); }}
      />
    </div>
  );
}
