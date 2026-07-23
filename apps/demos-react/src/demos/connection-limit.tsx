import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 's1', position: { x: 60, y: 60 },  size: { width: 150, height: 70 }, label: 'Source 1' },
  { id: 's2', position: { x: 60, y: 240 }, size: { width: 150, height: 70 }, label: 'Source 2' },
  { id: 't',  position: { x: 520, y: 150 }, size: { width: 150, height: 70 }, label: 'Target (1 max)',
    // A single input port on the left that accepts at most ONE connection.
    ports: [
      { id: 't__left',  side: 'left',  type: 'bi', maxConnections: 1 },
      { id: 't__right', side: 'right', type: 'bi' },
    ] },
];
const edges: any[] = [];

/** A port declares maxConnections:1 and REFUSES a second wire during the real
 *  drag — the cap is per-port model anatomy, not a disabled UI. */
export default function ConnectionLimitDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
