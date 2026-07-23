<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// A Manhattan/orthogonal route that dodges an obstacle: the A→B edge declares
// router:'orthogonal' and bends in right-angle segments around the wall O that
// sits squarely on the straight line between them.
const nodes = [
  { id: 'a', position: { x: 80, y: 305 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 840, y: 305 }, size: { width: 120, height: 60 }, label: 'B' },
  { id: 'o', position: { x: 430, y: 250 }, size: { width: 140, height: 170 }, label: 'obstacle' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', router: 'orthogonal' }];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
