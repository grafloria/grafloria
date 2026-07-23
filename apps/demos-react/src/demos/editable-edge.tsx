import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'A' } },
  { id: 'b', position: { x: 620, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'B' } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Click the wire to select it, click its body to drop a waypoint, drag the
 *  waypoint — the route bends to follow. Every bend is undoable. */
export default function EditableEdgeDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
