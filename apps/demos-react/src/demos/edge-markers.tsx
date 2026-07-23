import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const HEADS = ['arrow', 'open-arrow', 'circle', 'square', 'diamond', 'crow-foot', 'hollow-diamond', 'one-or-many', 'none'];

const nodes = HEADS.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 120, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: type },
  { id: 'b' + i, position: { x: 620, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: '' },
]);
const edges = HEADS.map((type, i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i,
  style: { arrowHead: { type, size: 14, filled: false } },
}));

/** Eight built-in arrowheads + explicit none, one row each — the ERD heads
 *  (crow-foot, one-or-many) are first-class citizens. */
export default function EdgeMarkersDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
