<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Data flowing through TYPED ports: Grafloria owns the graph and fires change
// events, the app owns the arithmetic. Typing a new input recomputes every
// downstream node LIVE along the real link topology; rewiring recomputes off the
// new topology. input ──▶ [ ×3 ] ──▶ [ +10 ] ──▶ sink
const nodes = [
  { id: 'in',  position: { x: 40,  y: 120 }, size: { width: 120, height: 56 }, label: 'input',
    ports: [{ id: 'in.out', side: 'right' as const, type: 'output', dataType: 'number' }], data: { value: 2 } },
  { id: 'mul', position: { x: 240, y: 120 }, size: { width: 120, height: 56 }, label: '× 3',
    ports: [{ id: 'mul.in', side: 'left' as const, type: 'input', dataType: 'number' },
            { id: 'mul.out', side: 'right' as const, type: 'output', dataType: 'number' }], data: { op: 'mul', k: 3, value: 0 } },
  { id: 'add', position: { x: 440, y: 120 }, size: { width: 120, height: 56 }, label: '+ 10',
    ports: [{ id: 'add.in', side: 'left' as const, type: 'input', dataType: 'number' },
            { id: 'add.out', side: 'right' as const, type: 'output', dataType: 'number' }], data: { op: 'add', k: 10, value: 0 } },
  { id: 'out', position: { x: 640, y: 120 }, size: { width: 120, height: 56 }, label: 'sink',
    ports: [{ id: 'out.in', side: 'left' as const, type: 'input', dataType: 'number' }], data: { op: 'sink', value: 0 } },
];
const edges = [
  { id: 'l1', source: 'in',  target: 'mul', sourceHandle: 'in.out',  targetHandle: 'mul.in' },
  { id: 'l2', source: 'mul', target: 'add', sourceHandle: 'mul.out', targetHandle: 'add.in' },
  { id: 'l3', source: 'add', target: 'out', sourceHandle: 'add.out', targetHandle: 'out.in' },
];

const srcValue = ref(2);
const formula = ref('');

function onInit(api: DiagramInstance) {
  try {
    const model: any = api.getModel();
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
      const v = (id: string) => model.getNode(id).data.value;
      formula.value = `→  ×3=${v('mul')}  →  +10=${v('add')}  →  sink=${v('out')}`;
    };
    (window as any).__cf_propagate = propagate;
    (window as any).__cf_setSrc = (n: number) => {
      model.getNode('in').data.value = Number.isFinite(n) ? n : 0;
      propagate();
    };
    model.on('link:added', () => propagate());
    model.on('link:removed', () => propagate());
    propagate();
  } catch { /* interaction wiring optional; canvas still paints */ }
  markReady();
}

function onSrcInput(e: Event) {
  const n = Number((e.target as HTMLInputElement).value);
  srcValue.value = Number.isFinite(n) ? n : 0;
  (window as any).__cf_setSrc?.(srcValue.value);
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.9; border-bottom:1px solid rgba(127,127,127,.25); display:flex; align-items:center; gap:14px; flex-wrap:wrap">
      <label style="display:inline-flex; align-items:center; gap:6px">input
        <input type="number" step="1" :value="srcValue" @input="onSrcInput"
          style="width:74px; font:inherit; padding:2px 6px; border:1px solid rgba(127,127,127,.5); border-radius:4px; background:transparent; color:inherit" />
      </label>
      <span style="white-space:pre">{{ formula }}</span>
    </div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
