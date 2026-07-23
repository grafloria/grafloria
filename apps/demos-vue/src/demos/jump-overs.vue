<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Crossing wires hop: style.jumpPoints arcs the owning edge over the other
// where they intersect.
const jp = { enabled: true, size: 10, detectMode: 'all' };
const nodes = [
  { id: 'a', position: { x: 80,  y: 90 },  size: { width: 100, height: 44 }, label: 'A' },
  { id: 'b', position: { x: 80,  y: 430 }, size: { width: 100, height: 44 }, label: 'B' },
  { id: 'c', position: { x: 760, y: 90 },  size: { width: 100, height: 44 }, label: 'C' },
  { id: 'd', position: { x: 760, y: 430 }, size: { width: 100, height: 44 }, label: 'D' },
];
const edges = [
  { id: 'ad', source: 'a', target: 'd', type: 'direct', style: { jumpPoints: jp } },
  { id: 'bc', source: 'b', target: 'c', type: 'direct', style: { jumpPoints: jp } },
];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
