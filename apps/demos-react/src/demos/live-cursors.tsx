import { useEffect, useMemo } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { MemoryHub } from '@grafloria/element';
import { markReady } from '../ready';

/** Live cursors with no server: two canvases join the same MemoryHub room via
 *  collab. Move the pointer over the left canvas and the cursor appears live in
 *  the right one — remote cursors live on a separate presence DOM layer, so
 *  60Hz cursor traffic never repaints the diagram and never enters the op log. */
const spec = () => ([
  { id: 'a', label: 'Plan',  position: { x: 70,  y: 90 }, size: { width: 150, height: 66 } },
  { id: 'b', label: 'Build', position: { x: 320, y: 90 }, size: { width: 150, height: 66 } },
]);
const edges = [{ id: 'e1', source: 'a', target: 'b' }];
const badge = { position: 'absolute', top: 8, left: 8, zIndex: 2, font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: 4 } as const;

export default function LiveCursorsDemo() {
  useEffect(() => markReady(), []);
  const { collabA, collabB } = useMemo(() => {
    const hub = new MemoryHub();
    return {
      collabA: { transport: hub.connect('ana'), actor: 'ana', batch: false, awarenessThrottleMs: 0, presence: { name: 'Ana', smoothing: 0 } },
      collabB: { transport: hub.connect('bo'), actor: 'bo', batch: false, awarenessThrottleMs: 0, presence: { name: 'Bo', smoothing: 0 } },
    };
  }, []);
  return (
    <div>
      <div style={{ fontSize: 12, opacity: .8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        Move your pointer over the left canvas — your cursor appears live in the right one.
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 45px)' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <span style={badge}>Ana (you)</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={edges} collab={collabA as never} style={{ display: 'block', height: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <span style={badge}>Bo (sees Ana)</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={structuredClone(edges)} collab={collabB as never} style={{ display: 'block', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
