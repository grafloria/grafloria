import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const TYPES = ['marching-ants', 'flow', 'pulse', 'dash-flow'];

const nodes = TYPES.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 120, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: type },
  { id: 'b' + i, position: { x: 640, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: '' },
]);
const edges = TYPES.map((type, i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i,
  style: { animation: { type, speed: 'normal' } },
}));

/** Four CSS stroke animations from the spec — style.animation is a live
 *  keyframe on the painted path (marching-ants · flow · pulse · dash-flow). */
export default function AnimatingEdgesDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
