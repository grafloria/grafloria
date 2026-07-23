import { useEffect, useMemo } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { BroadcastChannelTransport } from '@grafloria/engine';
import { markReady } from '../ready';

const nodesA = [
  { id: 'a', position: { x: 60, y: 60 },  size: { width: 150, height: 66 }, data: { label: 'Ingest' } },
  { id: 'b', position: { x: 320, y: 60 }, size: { width: 150, height: 66 }, data: { label: 'Publish' } },
];
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }];

/** Real multiplayer with no server: two canvases in one page, each joined to
 *  the same room over BroadcastChannel via collab. Drag a node on the left —
 *  the right converges through the engine's per-property CRDT, with presence
 *  cursors painted for the remote actor. */
export default function TwoTabsLiveDemo() {
  useEffect(() => markReady(), []);
  const { collabA, collabB } = useMemo(() => {
    const room = 'react-collab-' + Math.random().toString(36).slice(2, 8);
    return {
      collabA: { transport: new BroadcastChannelTransport({ name: room, actor: 'ana' }), actor: 'ana', presence: { name: 'Ana' } },
      collabB: { transport: new BroadcastChannelTransport({ name: room, actor: 'ben' }), actor: 'ben', presence: { name: 'Ben' } },
    };
  }, []);
  return (
    <div style={{ display: 'flex', height: '100vh', gap: 1, background: '#E3E7F2' }}>
      <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px', fontSize: 12, color: '#5A6478' }}>Tab A — Ana</div>
        <GrafloriaFlow defaultNodes={nodesA} defaultEdges={edgesA} collab={collabA} style={{ flex: 1 }} />
      </div>
      <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px', fontSize: 12, color: '#5A6478' }}>Tab B — Ben</div>
        <GrafloriaFlow defaultNodes={structuredClone(nodesA)} defaultEdges={structuredClone(edgesA)} collab={collabB} style={{ flex: 1 }} />
      </div>
    </div>
  );
}
