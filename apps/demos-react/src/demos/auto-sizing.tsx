import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  // Declared TOO SMALL for its label, but opted into content-aware sizing:
  // metadata.sizing.auto grows it to fit on the very next frame.
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 60, height: 36 },
    label: 'a comfortably long label that will not fit in sixty pixels',
    metadata: { sizing: { auto: true, padding: 10 } } },
  // The fixed control that must NOT resize — growth is opt-in, per node.
  { id: 'b', position: { x: 120, y: 280 }, size: { width: 60, height: 36 },
    label: 'a comfortably long label that will not fit in sixty pixels' },
];
const edges: any[] = [];

/** Content-aware sizing: metadata.sizing.auto grows the node to fit its label
 *  on the very next frame — the fixed twin below stays at its declared 60px. */
export default function AutoSizingDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
