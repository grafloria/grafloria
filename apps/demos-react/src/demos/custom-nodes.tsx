import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 60, y: 80 },  size: { width: 180, height: 80 }, data: { label: 'Ingest' },
    shape: { type: 'terminal', fill: '#ecfdf5', stroke: '#059669' } },
  { id: 'b', position: { x: 380, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Transform' },
    shape: { type: 'predefined-process', fill: '#eff6ff', stroke: '#2563eb' } },
  { id: 'c', position: { x: 700, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Publish' },
    shape: { type: 'document', fill: '#fdf4ff', stroke: '#9333ea' } },
];
const edges = [
  { id: 'e1', source: 'a', target: 'b' },
  { id: 'e2', source: 'b', target: 'c' },
];

/** Custom-shaped nodes declared per node in the spec — the React way. */
export default function CustomNodesDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
