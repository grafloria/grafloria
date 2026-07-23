<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Three links between the same pair auto-separate onto their own lanes
// (parallelLinks, on by default); a link from a node to ITSELF routes as a real
// loop outside the node body.
const nodes = [
  { id: 'a', position: { x: 140, y: 120 }, size: { width: 130, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 660, y: 120 }, size: { width: 130, height: 60 }, label: 'B' },
  { id: 's', position: { x: 400, y: 380 }, size: { width: 130, height: 60 }, label: 'Self' },
];
const edges = [
  { id: 'p1', source: 'a', target: 'b', type: 'direct' },
  { id: 'p2', source: 'a', target: 'b', type: 'direct' },
  { id: 'p3', source: 'a', target: 'b', type: 'direct' },
  { id: 'loop', source: 's', target: 's' },
];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
