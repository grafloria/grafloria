<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// The four edge path families side by side — type picks router + connector,
// each overridable per edge.
const TYPES = ['direct', 'smooth', 'orthogonal', 'bezier'] as const;

const nodes = TYPES.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 100, y: 40 + i * 120 }, size: { width: 130, height: 54 }, label: type },
  { id: 'b' + i, position: { x: 600, y: 90 + i * 120 }, size: { width: 130, height: 54 }, label: '' },
]);
const edges = TYPES.map((type, i) => ({ id: 'e' + i, source: 'a' + i, target: 'b' + i, type }));
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
