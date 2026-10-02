import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const COMP_A = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'];
const COMP_B = ['b0', 'b1', 'b2'];

const ENGINES = ['tree', 'radial', 'circular', 'grid', 'force'];
const nodes = [...COMP_A, ...COMP_B].map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 56, height: 56 }, label: id,
}));
const edges = [
  { id: 'a01', source: 'a0', target: 'a1' },
  { id: 'a02', source: 'a0', target: 'a2' },
  { id: 'a13', source: 'a1', target: 'a3' },
  { id: 'a14', source: 'a1', target: 'a4' },
  { id: 'a25', source: 'a2', target: 'a5' },
  { id: 'b01', source: 'b0', target: 'b1' },
  { id: 'b12', source: 'b1', target: 'b2' },
];

/** Restack every node at (0,0), then run one engine — module level so every $() may call it. */
async function restackAndRun(instance: DiagramInstance, name: string): Promise<void> {
  const engine = instance.getEngine() as any;
  for (const n of engine.getDiagram().getNodes()) n.setPosition(0, 0);
  await engine.layout(name, { nodeSpacing: 36, rankSpacing: 70 });
}

/** Five layout engines — tree, radial, circular, grid, force — over one graph,
 *  plus a disconnected component that gets packed beside the rest. Each button
 *  restacks every node at (0,0) then runs that engine. */
export default component$(() => {
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  const active = useSignal('tree');

  const run = $(async (name: string) => {
    if (!inst.value) return;
    await restackAndRun(inst.value, name);
    active.value = name;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', alignItems: 'center', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        {ENGINES.map((name) => (
          <button key={name} onClick$={() => run(name)} aria-pressed={name === active.value}
            style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            {name}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', font: '12px ui-monospace,monospace', opacity: '0.8' }}>{active.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} style={{ height: '100%' }}
          onInit$={$(async (instance: DiagramInstance) => {
            inst.value = noSerialize(instance);
            await run('tree');
            markReady();
          })} />
      </div>
    </div>
  );
});
