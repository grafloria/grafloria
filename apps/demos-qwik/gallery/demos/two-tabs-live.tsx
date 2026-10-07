import { component$, noSerialize, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type GrafloriaCollabOptions } from '@grafloria/qwik';
import { BroadcastChannelTransport } from '@grafloria/engine';
import { markReady } from '../ready';

const nodesA = [
  { id: 'a', position: { x: 60, y: 60 },  size: { width: 150, height: 66 }, data: { label: 'Ingest' } },
  { id: 'b', position: { x: 320, y: 60 }, size: { width: 150, height: 66 }, data: { label: 'Publish' } },
];
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }];

/** Both peers' collab options. A transport holds a live channel and callbacks —
 *  not data — so each options object goes through noSerialize(). */
function makeCollab() {
  const room = 'qwik-collab-' + Math.random().toString(36).slice(2, 8);
  const a: GrafloriaCollabOptions = { transport: new BroadcastChannelTransport({ name: room, actor: 'ana' }), actor: 'ana', presence: { name: 'Ana' } };
  const b: GrafloriaCollabOptions = { transport: new BroadcastChannelTransport({ name: room, actor: 'ben' }), actor: 'ben', presence: { name: 'Ben' } };
  return { collabA: noSerialize(a), collabB: noSerialize(b) };
}

/** Real multiplayer with no server: two canvases in one page, each joined to
 *  the same room over BroadcastChannel via collab. Drag a node on the left —
 *  the right converges through the engine's per-property CRDT, with presence
 *  cursors painted for the remote actor. */
export default component$(() => {
  // The initializer runs once per component — one room for the page's life.
  const collab = useSignal(makeCollab);
  return (
    <div style={{ display: 'flex', height: '100vh', gap: '1px', background: '#E3E7F2' }}>
      <div style={{ flex: '1', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px', fontSize: '12px', color: '#5A6478' }}>Tab A — Ana</div>
        <GrafloriaFlow defaultNodes={nodesA} defaultEdges={edgesA} collab={collab.value.collabA} style={{ flex: '1' }}
          onInit$={() => markReady()} />
      </div>
      <div style={{ flex: '1', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px', fontSize: '12px', color: '#5A6478' }}>Tab B — Ben</div>
        <GrafloriaFlow defaultNodes={structuredClone(nodesA)} defaultEdges={structuredClone(edgesA)} collab={collab.value.collabB} style={{ flex: '1' }} />
      </div>
    </div>
  );
});
