import { createRoot } from 'react-dom/client';
import { GrafloriaFlow } from '@grafloria/react';
import { MemoryHub } from '@grafloria/engine';

const hub = new MemoryHub();
const NODES = [
  { id: 'ingest', position: { x: 60, y: 60 }, size: { width: 140, height: 60 }, label: 'Ingest' },
  { id: 'store', position: { x: 300, y: 160 }, size: { width: 140, height: 60 }, label: 'Store' },
];
const EDGES = [{ source: 'ingest', target: 'store' }];

function Pane({ actor, title }) {
  return (
    <div style={{ flex: 1 }}>
      <h3>{title}</h3>
      <div id={`pane-${actor}`} style={{ height: 320, border: '2px solid #888' }}>
        <GrafloriaFlow defaultNodes={NODES} defaultEdges={EDGES}
          collab={{ transport: hub.connect(actor), actor, batch: false }} />
      </div>
    </div>
  );
}
createRoot(document.getElementById('app')).render(
  <div>
    <h2>Collab — drag left, watch right (one CRDT, zero servers)</h2>
    <div style={{ display: 'flex', gap: 16, width: 980 }}>
      <Pane actor="alice" title="Alice" />
      <Pane actor="bob" title="Bob" />
    </div>
  </div>
);
