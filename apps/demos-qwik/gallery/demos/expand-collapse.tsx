import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { GroupModel, GroupCollapseService } from '@grafloria/element';
import { markReady } from '../ready';

// A container of three members, plus an external node wired to two of them across
// the boundary. Collapse hides the members, shrinks the group to a placeholder,
// and re-homes the boundary edges onto an aggregated proxy; expand restores it.
const nodes = [
  { id: 'ext', position: { x: 480, y: 60 }, size: { width: 100, height: 44 }, label: 'external' },
  { id: 'c1', position: { x: 60, y: 40 }, size: { width: 90, height: 40 }, label: 'c1' },
  { id: 'c2', position: { x: 60, y: 110 }, size: { width: 90, height: 40 }, label: 'c2' },
  { id: 'c3', position: { x: 60, y: 180 }, size: { width: 90, height: 40 }, label: 'c3' },
];
const edges = [
  { id: 'e1', source: 'c1', target: 'c2' },
  { id: 'e2', source: 'c1', target: 'ext' },
  { id: 'e3', source: 'c2', target: 'ext' },
  { id: 'e4', source: 'ext', target: 'c3' },
];

/** Repaint and describe the model — a module-level helper, so every $() may call it. */
function readoutOf(api: DiagramInstance, g: InstanceType<typeof GroupModel>): string {
  api.renderNow();
  const model = api.getModel();
  const visible = model.getNodes().filter((n: any) => n.state.visible !== false).length;
  return `visible=${visible}  nodes=${model.getNodes().length}  links=${model.getLinks().length}  collapsed=${g.isCollapsed}`;
}

const btn = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

/** Collapse a container to a placeholder — members hide, boundary edges
 *  aggregate onto a proxy — then expand it back, lossless, through the real
 *  GroupCollapseService. */
export default component$(() => {
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  const group = useSignal<NoSerialize<InstanceType<typeof GroupModel>>>();
  const collapser = useSignal<NoSerialize<InstanceType<typeof GroupCollapseService>>>();
  const readout = useSignal('');

  const collapse = $(() => {
    const api = inst.value, g = group.value;
    if (!api || !g) return;
    collapser.value?.collapse(g);
    readout.value = readoutOf(api, g);
  });
  const expand = $(() => {
    const api = inst.value, g = group.value;
    if (!api || !g) return;
    collapser.value?.expand(g);
    readout.value = readoutOf(api, g);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center' }}>
        <button style={btn} onClick$={collapse}>collapse</button>
        <button style={btn} onClick$={expand}>expand</button>
        <span style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: '0.8' }}>{readout.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$(async (instance: DiagramInstance) => {
          inst.value = noSerialize(instance);
          const model = instance.getModel();
          const g = new GroupModel({ id: 'box', name: 'Service' });
          model.addGroup(g);
          g.padding = 14;
          for (const id of ['c1', 'c2', 'c3']) g.addMember(id, model);
          group.value = noSerialize(g);
          collapser.value = noSerialize(new GroupCollapseService(model));

          await instance.getEngine().layout('dagre', { direction: 'TB', nodeSpacing: 30, rankSpacing: 50 });
          instance.renderNow();
          instance.fitView(60);
          readout.value = readoutOf(instance, g);
          markReady();
        })} />
      </div>
    </div>
  );
});
