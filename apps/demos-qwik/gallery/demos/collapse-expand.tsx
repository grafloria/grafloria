import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'ext1', position: { x: 60, y: 80 }, size: { width: 120, height: 60 }, label: 'ext 1' },
  { id: 'ext2', position: { x: 60, y: 300 }, size: { width: 120, height: 60 }, label: 'ext 2' },
  { id: 'm1', position: { x: 420, y: 80 }, size: { width: 120, height: 60 }, label: 'member 1' },
  { id: 'm2', position: { x: 420, y: 200 }, size: { width: 120, height: 60 }, label: 'member 2' },
  { id: 'm3', position: { x: 420, y: 320 }, size: { width: 120, height: 60 }, label: 'member 3' },
];
const edges = [
  { id: 'a', source: 'ext1', target: 'm1' },
  { id: 'b', source: 'ext1', target: 'm2' },
  { id: 'c', source: 'ext2', target: 'm3' },
  { id: 'd', source: 'm1', target: 'm2' },
];

const btn = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

/** Collapse a group through the engine: members hide and the boundary links are
 *  replaced by ONE aggregated proxy link to the collapsed placeholder; expand
 *  restores every one. Two external nodes each feed two members. */
export default component$(() => {
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  const groupId = useSignal<string | undefined>(undefined);

  const collapse = $(async () => {
    const engine = inst.value?.getEngine() as any;
    if (engine && groupId.value) await engine.collapseGroup(groupId.value, { proxyLabel: (i: { count: number }) => `${i.count}×` });
  });
  const expand = $(async () => {
    const engine = inst.value?.getEngine() as any;
    if (engine && groupId.value) await engine.expandGroup(groupId.value);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        <button style={btn} onClick$={collapse}>collapse group</button>
        <button style={btn} onClick$={expand}>expand group</button>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} style={{ height: '100%' }}
          onInit$={$(async (instance: DiagramInstance) => {
            inst.value = noSerialize(instance);
            const engine = instance.getEngine() as any;
            const g = await engine.addGroup({ name: 'Service' });
            g.setFrame({ x: 400, y: 60, width: 180, height: 340 });
            for (const id of ['m1', 'm2', 'm3']) await engine.addToGroup(g.id, id);
            groupId.value = g.id;
            instance.renderNow();
            markReady();
          })} />
      </div>
    </div>
  );
});
