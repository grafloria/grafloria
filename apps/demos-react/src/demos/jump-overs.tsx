import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const jp = { enabled: true, size: 10, detectMode: 'all' };
const nodes = [
  { id: 'a', position: { x: 80,  y: 90 },  size: { width: 100, height: 44 }, label: 'A' },
  { id: 'b', position: { x: 80,  y: 430 }, size: { width: 100, height: 44 }, label: 'B' },
  { id: 'c', position: { x: 760, y: 90 },  size: { width: 100, height: 44 }, label: 'C' },
  { id: 'd', position: { x: 760, y: 430 }, size: { width: 100, height: 44 }, label: 'D' },
];
const edges = [
  { id: 'ad', source: 'a', target: 'd', type: 'direct' as const, style: { jumpPoints: jp } },
  { id: 'bc', source: 'b', target: 'c', type: 'direct' as const, style: { jumpPoints: jp } },
];

/** Crossing wires hop: style.jumpPoints arcs the owning edge over the other
 *  where they intersect. */
export default function JumpOversDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
