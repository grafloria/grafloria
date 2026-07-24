import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const A = ['a0', 'a1', 'a2', 'a3'];
const B = ['b0', 'b1', 'b2', 'b3'];
const PAIRS: [string, string][] = [
  ['a0', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a0'], ['a0', 'a2'],
  ['b0', 'b1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b0'], ['b0', 'b2'],
  ['a0', 'b0'],
];

const layout = { name: 'force', options: { seed: 1, nodeSpacing: 55 } };
const nodes = [...A, ...B].map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 60, height: 60 }, label: id,
}));
const edges = PAIRS.map(([s, t], i) => ({ id: 'e' + i, source: s, target: t }));

/** Force-directed layout: two dense clusters and one bridge — the simulation
 *  separates the clusters and keeps neighbours close. Seeded, so reproducible. */
export default function ForceLayoutDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} layout={layout} />
    </div>
  );
}
