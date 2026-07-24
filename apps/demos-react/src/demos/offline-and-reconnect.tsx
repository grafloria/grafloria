import { useEffect, useMemo } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { MemoryHub } from '@grafloria/element';
import { markReady } from '../ready';

/** Offline & reconnect: two peers on one MemoryHub via collab. Anti-entropy
 *  exchanges exactly the ops each side missed and the two converge — no lost
 *  edits, no full resend. Offline edits are held in the local op log; the
 *  reconnect's sync round delivers them. */
const spec = () => ([
  { id: 'a', label: 'Alpha', position: { x: 80,  y: 90 }, size: { width: 150, height: 66 } },
  { id: 'b', label: 'Beta',  position: { x: 320, y: 90 }, size: { width: 150, height: 66 } },
]);
const edges = [{ id: 'e1', source: 'a', target: 'b' }];
const badge = { position: 'absolute', top: 8, left: 8, zIndex: 2, font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: 4 } as const;

export default function OfflineAndReconnectDemo() {
  useEffect(() => markReady(), []);
  const { collabA, collabB } = useMemo(() => {
    const hub = new MemoryHub();
    return {
      collabA: { transport: hub.connect('ana'), actor: 'ana', batch: false },
      collabB: { transport: hub.connect('bo'), actor: 'bo', batch: false },
    };
  }, []);
  return (
    <div>
      <div style={{ fontSize: 12, opacity: .8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        Cut the connection, edit both sides while disconnected, then reconnect — anti-entropy
        exchanges exactly the ops each side missed and the two converge.
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 45px)' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <span style={badge}>peer A</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={edges} collab={collabA as never} style={{ display: 'block', height: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <span style={badge}>peer B</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={structuredClone(edges)} collab={collabB as never} style={{ display: 'block', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
