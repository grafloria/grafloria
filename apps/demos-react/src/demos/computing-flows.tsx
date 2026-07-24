import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
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
];
const edges: any[] = [
  { id: 'l1', source: 'in',  target: 'mul', sourceHandle: 'in.out',  targetHandle: 'mul.in' },
  { id: 'l2', source: 'mul', target: 'add', sourceHandle: 'mul.out', targetHandle: 'add.in' },
  { id: 'l3', source: 'add', target: 'out', sourceHandle: 'add.out', targetHandle: 'out.in' },
];

/** Data flowing through typed ports: type a value and every downstream node
 *  recomputes LIVE along the real link topology. Grafloria owns the graph and
 *  fires the change events; the app owns the arithmetic. */
export default function ComputingFlowsDemo() {
  const srcRef = useRef<HTMLInputElement | null>(null);
  const formulaRef = useRef<HTMLSpanElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const api = instance as any;
    const model = api.getModel();

    const report = () => {
      const v = (id: string) => model.getNode(id).data.value;
      if (formulaRef.current) formulaRef.current.textContent = `→  ×3=${v('mul')}  →  +10=${v('add')}  →  sink=${v('out')}`;
      if (srcRef.current && document.activeElement !== srcRef.current) srcRef.current.value = String(v('in'));
    };
    const propagate = () => {
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
      report();
    };

    srcRef.current?.addEventListener('input', () => {
      const n = Number(srcRef.current!.value);
      model.getNode('in').data.value = Number.isFinite(n) ? n : 0;
      propagate();
    });
    model.on('link:added', () => propagate());
    model.on('link:removed', () => propagate());

    propagate();
    markReady();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: 0.9,
        borderBottom: '1px solid rgba(127,127,127,.25)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>input
          <input ref={srcRef} type="number" step={1} defaultValue={2}
            style={{ width: 74, font: 'inherit', padding: '2px 6px', border: '1px solid rgba(127,127,127,.5)', borderRadius: 4, background: 'transparent', color: 'inherit' }} />
        </label>
        <span ref={formulaRef} style={{ whiteSpace: 'pre' }} />
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
