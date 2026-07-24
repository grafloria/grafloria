<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Collapse a group through the engine: members hide and the boundary links are
// replaced by ONE aggregated proxy link to the collapsed placeholder; expand
// restores every one. Two external nodes each feed two members.
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

let apiRef: DiagramInstance | null = null;
let groupId: string | undefined;

async function collapse() {
  const engine: any = apiRef?.getEngine();
  if (engine && groupId) await engine.collapseGroup(groupId, { proxyLabel: (i: { count: number }) => `${i.count}×` });
}
async function expand() {
  const engine: any = apiRef?.getEngine();
  if (engine && groupId) await engine.expandGroup(groupId);
}

async function onInit(api: DiagramInstance) {
  apiRef = api;
  try {
    const engine: any = api.getEngine();
    const g = await engine.addGroup({ name: 'Service' });
    g.setFrame({ x: 400, y: 60, width: 180, height: 340 });
    for (const id of ['m1', 'm2', 'm3']) await engine.addToGroup(g.id, id);
    groupId = g.id;
  } catch { /* canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex;gap:8px;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      <button @click="collapse" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">collapse group</button>
      <button @click="expand" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">expand group</button>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
