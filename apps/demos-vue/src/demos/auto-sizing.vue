<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Content-aware sizing: metadata.sizing.auto grows the node to fit its label on
// the very next frame; the fixed twin below keeps its declared 60px.
const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 60, height: 36 },
    label: 'a comfortably long label that will not fit in sixty pixels',
    metadata: { sizing: { auto: true, padding: 10 } } },
  { id: 'b', position: { x: 120, y: 280 }, size: { width: 60, height: 36 },
    label: 'a comfortably long label that will not fit in sixty pixels' },
];
const edges: never[] = [];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
