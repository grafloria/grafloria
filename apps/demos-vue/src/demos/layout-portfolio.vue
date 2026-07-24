<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Five layout engines — tree, radial, circular, grid, force — over one graph,
// plus a disconnected component that gets packed beside the rest. Each button
// restacks every node at (0,0) then runs that engine.
const COMP_A = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'];
const COMP_B = ['b0', 'b1', 'b2'];

const engines = ['tree', 'radial', 'circular', 'grid', 'force'];
const active = ref('tree');
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

let apiRef: DiagramInstance | null = null;

async function run(name: string) {
  const engine: any = apiRef?.getEngine();
  if (!engine) return;
  for (const n of engine.getDiagram().getNodes()) n.setPosition(0, 0);
  await engine.layout(name, { nodeSpacing: 36, rankSpacing: 70 });
  active.value = name;
}

async function onInit(api: DiagramInstance) {
  apiRef = api;
  await run('tree');
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex;gap:8px;padding:10px 24px;align-items:center;border-bottom:1px solid rgba(127,127,127,.25)">
      <button v-for="name in engines" :key="name" @click="run(name)" :aria-pressed="name === active"
        style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">{{ name }}</button>
      <span style="margin-left:auto;font:12px ui-monospace,monospace;opacity:.8">{{ active }}</span>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
