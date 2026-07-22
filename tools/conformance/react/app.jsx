import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';

function App() {
  const [instance, setInstance] = useState(null);
  const [status, setStatus] = useState('idle');
  const roundTrip = () => {
    const text = instance.exportText();
    instance.setNodes([{ id: 'z', position: { x: 0, y: 0 }, size: { width: 60, height: 40 }, label: 'Z' }]);
    const result = instance.loadText(text);
    setStatus(`text round-trip: ${result.source} → ${instance.getModel().getNodes().length} nodes`);
  };
  return (
    <div>
      <p><button id="rt" onClick={roundTrip}>Text round-trip</button> <span id="status">{status}</span></p>
      <div style={{ width: 800, height: 400, border: '1px solid #ccc' }}>
        <GrafloriaFlow
          defaultNodes={[
            { id: 'a', position: { x: 60, y: 60 }, size: { width: 140, height: 60 }, label: 'Extract' },
            { id: 'b', position: { x: 320, y: 60 }, size: { width: 140, height: 60 }, label: 'Transform' },
            { id: 'c', position: { x: 580, y: 60 }, size: { width: 120, height: 60 }, label: 'Load' },
          ]}
          defaultEdges={[{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]}
          plugins={true}
          onInit={setInstance}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById('app')).render(<App />);
