<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A container that holds a nested graph: three nodes become members, the frame
// fits itself around them, and a "Retry handler" sub-group nests inside — a
// real parent/child group hierarchy, with "outside" beyond both frames.
const nodes = [
  { id: 'n1', position: { x: 400, y: 150 }, size: { width: 120, height: 60 }, label: 'stage 1' },
  { id: 'n2', position: { x: 560, y: 150 }, size: { width: 120, height: 60 }, label: 'stage 2' },
  { id: 'n3', position: { x: 480, y: 275 }, size: { width: 120, height: 60 }, label: 'retry' },
  { id: 'outside', position: { x: 80, y: 150 }, size: { width: 120, height: 60 }, label: 'outside' },
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n1', target: 'n3' },
];

async function onInit(api: DiagramInstance) {
  try {
    const engine: any = api.getEngine();
    const diagram = engine.getDiagram();
    const g = await engine.addGroup({ name: 'Pipeline' });
    await engine.addToGroup(g.id, 'n1');
    await engine.addToGroup(g.id, 'n2');
    await engine.addToGroup(g.id, 'n3');

    const inner = await engine.addGroup({ name: 'Retry handler' });
    await engine.addToGroup(inner.id, 'n3');
    g.addMember(inner.id, diagram);

    inner.fitToContents(diagram);
    g.fitToContents(diagram);
  } catch { /* canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
