<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A layered pipeline laid out left-to-right. Mental-map-preserving incremental
// layout means adding a node barely moves the rest — the engine exposes
// layoutIncremental() with a movement report and a tween plan the host drives.
const nodes = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 110, height: 46 }, label: id,
}));
const edges = [
  { id: 'e0', source: 'n0', target: 'n1' },
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' },
  { id: 'e4', source: 'n4', target: 'n5' },
];

async function onInit(instance: DiagramInstance) {
  try {
    await instance.getEngine().layout('layered', { direction: 'LR' });
    instance.renderNow();
    instance.fitView(40);
  } catch { /* canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
