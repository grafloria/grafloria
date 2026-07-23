import { useEffect, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const POSITIONS: Record<string, { x: number; y: number }> = {
  right: { x: 620, y: 200 }, below: { x: 220, y: 460 }, corner: { x: 620, y: 460 },
};
const positions = Object.keys(POSITIONS);

const build = (pos: string) => [
  { id: 'a', position: { x: 220, y: 200 }, size: { width: 140, height: 90 }, label: 'A' },
  { id: 'b', position: { ...POSITIONS[pos] }, size: { width: 140, height: 90 }, label: 'B' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct' as const, metadata: { connectionPoint: 'smart' } }];

/** metadata.connectionPoint: 'smart' floats the edge along the node PERIMETER —
 *  move B around A and the wire re-attaches to whichever side faces it.
 *  Repositioning is pure data: the buttons just rewrite the nodes. */
export default function FloatingEdgesDemo() {
  const [where, setWhere] = useState('right');
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', gap: 8 }}>
        {positions.map((p) => (
          <button key={p} onClick={() => setWhere(p)}
            style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid #94A5F0', fontWeight: 600, cursor: 'pointer',
              background: where === p ? '#3B52D9' : '#EEF1FE', color: where === p ? '#fff' : '#3B52D9' }}>
            {p}
          </button>
        ))}
      </div>
      <GrafloriaFlow nodes={build(where)} defaultEdges={edges} />
    </div>
  );
}
