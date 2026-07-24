<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Groups draw a visible, labelled, themed frame — nested containers included.
// The "Pipeline" frame wraps three nodes; a nested "Retry handler" frame sits
// inside it, and both paint behind the nodes without stealing their clicks.
const nodes = [
  { id: 'n1', position: { x: 320, y: 160 }, size: { width: 120, height: 60 }, label: 'ingest' },
  { id: 'n2', position: { x: 520, y: 160 }, size: { width: 120, height: 60 }, label: 'transform' },
  { id: 'n3', position: { x: 420, y: 280 }, size: { width: 120, height: 60 }, label: 'retry' },
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n1', target: 'n3' },
];

async function onInit(api: DiagramInstance) {
  try {
    const engine: any = api.getEngine();
    const diagram = engine.getDiagram();
    const outer = await engine.addGroup({ name: 'Pipeline' });
    outer.setFrame({ x: 290, y: 120, width: 400, height: 240 });
    await engine.addToGroup(outer.id, 'n1');
    await engine.addToGroup(outer.id, 'n2');
    await engine.addToGroup(outer.id, 'n3');

    const inner = await engine.addGroup({ name: 'Retry handler' });
    inner.setFrame({ x: 390, y: 250, width: 180, height: 100 });
    await engine.addToGroup(inner.id, 'n3');
    outer.addMember(inner.id, diagram);
  } catch { /* canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
