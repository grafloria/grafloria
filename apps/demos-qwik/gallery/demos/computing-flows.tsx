import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'in',  position: { x: 40,  y: 120 }, size: { width: 120, height: 56 }, label: 'input',
    ports: [{ id: 'in.out', side: 'right', type: 'output', dataType: 'number' }], data: { value: 2 } },
  { id: 'mul', position: { x: 240, y: 120 }, size: { width: 120, height: 56 }, label: '× 3',
    ports: [{ id: 'mul.in', side: 'left', type: 'input', dataType: 'number' },
            { id: 'mul.out', side: 'right', type: 'output', dataType: 'number' }], data: { op: 'mul', k: 3, value: 0 } },
  { id: 'add', position: { x: 440, y: 120 }, size: { width: 120, height: 56 }, label: '+ 10',
    ports: [{ id: 'add.in', side: 'left', type: 'input', dataType: 'number' },
            { id: 'add.out', side: 'right', type: 'output', dataType: 'number' }], data: { op: 'add', k: 10, value: 0 } },
  { id: 'out', position: { x: 640, y: 120 }, size: { width: 120, height: 56 }, label: 'sink',
    ports: [{ id: 'out.in', side: 'left', type: 'input', dataType: 'number' }], data: { op: 'sink', value: 0 } },
] as never[];
const edges = [
  { id: 'l1', source: 'in',  target: 'mul', sourceHandle: 'in.out',  targetHandle: 'mul.in' },
  { id: 'l2', source: 'mul', target: 'add', sourceHandle: 'mul.out', targetHandle: 'add.in' },
  { id: 'l3', source: 'add', target: 'out', sourceHandle: 'add.out', targetHandle: 'out.in' },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Push the values down the REAL link topology, repaint, and return the
 *  readout. Module level so every Qwik handler can call it. */
function propagate(api: DiagramInstance): string {
  const model = api.getModel() as any;
  const order = ['in', 'mul', 'add', 'out'];
  const incoming = (nodeId: string) => model.getLinks().filter((l: any) => l.targetNodeId === nodeId);
  for (const id of order) {
    const node = model.getNode(id);
    if (id === 'in') continue;
    const feeds = incoming(id);
    const input = feeds.length ? (model.getNode(feeds[0].sourceNodeId)?.data.value ?? 0) : null;
    if (input === null) continue;
    const d = node.data;
    d.value = d.op === 'mul' ? input * d.k : d.op === 'add' ? input + d.k : input;
  }
  api.renderNow();
  const v = (id: string) => model.getNode(id).data.value;
  return `→  ×3=${v('mul')}  →  +10=${v('add')}  →  sink=${v('out')}`;
}

/** Data flowing through typed ports: type a value and every downstream node
 *  recomputes LIVE along the real link topology. Grafloria owns the graph and
 *  fires the change events; the app owns the arithmetic. */
export default component$(() => {
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  const formula = useSignal('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: '0.9',
        borderBottom: '1px solid rgba(127,127,127,.25)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>input
          <input type="number" step={1} value={2}
            style={{ width: '74px', font: 'inherit', padding: '2px 6px', border: '1px solid rgba(127,127,127,.5)', borderRadius: '4px', background: 'transparent', color: 'inherit' }}
            onInput$={(_, el) => {
              const api = inst.value;
              if (!api) return;
              const n = Number(el.value);
              (api.getModel() as any).getNode('in').data.value = Number.isFinite(n) ? n : 0;
              formula.value = propagate(api);
            }} />
        </label>
        <span style={{ whiteSpace: 'pre' }}>{formula.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
          inst.value = noSerialize(instance);
          const model = instance.getModel() as any;
          model.on('link:added', () => { formula.value = propagate(instance); });
          model.on('link:removed', () => { formula.value = propagate(instance); });
          formula.value = propagate(instance);
          markReady();
        })} />
      </div>
    </div>
  );
});
