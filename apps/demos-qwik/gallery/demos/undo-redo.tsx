import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 160, y: 160 }, size: { width: 160, height: 70 }, label: 'Drag, then undo' },
  { id: 'b', position: { x: 480, y: 280 }, size: { width: 160, height: 70 }, label: 'Every step counts' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Command-based history on the component surface: drag a node (one gesture =
 *  one step), then undo()/redo() from your own UI — ⌘Z works too. */
export default component$(() => {
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  return (
    <div style={{ height: '100vh' }}>
      <div style={{ position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '5', display: 'flex', gap: '8px' }}>
        <button onClick$={async () => { await inst.value?.getEngine().undo(); }}
          style={{ padding: '7px 16px', borderRadius: '999px', border: '0', background: '#3B52D9', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>↩ Undo</button>
        <button onClick$={async () => { await inst.value?.getEngine().redo(); }}
          style={{ padding: '7px 16px', borderRadius: '999px', border: '1px solid #94A5F0', background: '#EEF1FE', color: '#3B52D9', fontWeight: '600', cursor: 'pointer' }}>↪ Redo</button>
      </div>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        inst.value = noSerialize(instance);
        markReady();
      })} />
    </div>
  );
});
