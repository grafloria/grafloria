import { component$, noSerialize, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type GrafloriaCollabOptions } from '@grafloria/qwik';
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
const badge = { position: 'absolute', top: '8px', left: '8px', zIndex: '2', font: '11px ui-monospace,Menlo,monospace', background: 'rgba(37,99,235,.85)', color: '#fff', padding: '2px 8px', borderRadius: '4px' } as const;

/** One in-page hub, two peers. Transports are live objects, not data: noSerialize. */
function makeCollab() {
  const hub = new MemoryHub();
  const a = { transport: hub.connect('ana'), actor: 'ana', batch: false, awarenessThrottleMs: 0, presence: { name: 'Ana', smoothing: 0 } };
  const b = { transport: hub.connect('bo'), actor: 'bo', batch: false, awarenessThrottleMs: 0, presence: { name: 'Bo', smoothing: 0 } };
  return { collabA: noSerialize(a as unknown as GrafloriaCollabOptions), collabB: noSerialize(b as unknown as GrafloriaCollabOptions) };
}

export default component$(() => {
  const collab = useSignal(makeCollab);
  return (
    <div>
      <div style={{ fontSize: '12px', opacity: '.8', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        Move your pointer over the left canvas — your cursor appears live in the right one.
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 45px)' }}>
        <div style={{ flex: '1', minWidth: '0', position: 'relative', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <span style={badge}>Ana (you)</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={edges} collab={collab.value.collabA} style={{ display: 'block', height: '100%' }}
            onInit$={() => markReady()} />
        </div>
        <div style={{ flex: '1', minWidth: '0', position: 'relative' }}>
          <span style={badge}>Bo (sees Ana)</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={structuredClone(edges)} collab={collab.value.collabB} style={{ display: 'block', height: '100%' }} />
        </div>
      </div>
    </div>
  );
});
