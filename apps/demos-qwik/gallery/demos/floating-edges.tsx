import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const POSITIONS: Record<string, { x: number; y: number }> = {
  right: { x: 620, y: 200 }, below: { x: 220, y: 460 }, corner: { x: 620, y: 460 },
};
const positions = Object.keys(POSITIONS);

const build = (pos: string) => [
  { id: 'a', position: { x: 220, y: 200 }, size: { width: 140, height: 90 }, label: 'A' },
  { id: 'b', position: { ...POSITIONS[pos]! }, size: { width: 140, height: 90 }, label: 'B' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct' as const, metadata: { connectionPoint: 'smart' } }];

/** metadata.connectionPoint: 'smart' floats the edge along the node PERIMETER —
 *  move B around A and the wire re-attaches to whichever side faces it.
 *  Repositioning is pure data: the buttons just rewrite the nodes. */
export default component$(() => {
  const where = useSignal('right');
  return (
    <div style={{ height: '100vh' }}>
      <div style={{ position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '5', display: 'flex', gap: '8px' }}>
        {positions.map((p) => (
          <button key={p} data-pos={p} aria-pressed={where.value === p ? 'true' : 'false'} onClick$={() => { where.value = p; }}
            style={{ padding: '6px 14px', borderRadius: '999px', border: '1px solid #94A5F0', fontWeight: '600', cursor: 'pointer',
              background: where.value === p ? '#3B52D9' : '#EEF1FE', color: where.value === p ? '#fff' : '#3B52D9' }}>
            {p}
          </button>
        ))}
      </div>
      <GrafloriaFlow nodes={build(where.value)} defaultEdges={edges} onInit$={$(() => markReady())} />
    </div>
  );
});
