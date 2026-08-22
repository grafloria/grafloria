import { createRoot } from 'react-dom/client';
import { GrafloriaFlow } from '@grafloria/react';

const nodes = [
  { id: 'a', position: { x: 60, y: 80 },  size: { width: 180, height: 80 }, data: { label: 'Ingest' } },
  { id: 'b', position: { x: 380, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Publish' } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

// Drag, connect, Cmd/Ctrl+Z. Next: https://grafloria.com/learn/react/
createRoot(document.getElementById('root')).render(
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} plugins />
  </div>
);
