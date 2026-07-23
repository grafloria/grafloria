<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Select a node and the renderer paints the full resizer chrome — four corner
// dots and four edge lines, each with its own cursor. One node clamps to
// 80–260 × 60–200; the other locks its 1.6 aspect ratio through any handle.
const nodes = [
  { id: 'clamp', position: { x: 140, y: 130 }, size: { width: 160, height: 100 },
    data: { label: '80–260 wide' },
    metadata: { sizing: { minWidth: 80, minHeight: 60, maxWidth: 260, maxHeight: 200 } } },
  { id: 'ratio', position: { x: 560, y: 130 }, size: { width: 160, height: 100 },
    data: { label: 'aspect 1.6' },
    metadata: { sizing: { aspectLock: true } } },
];
const edges: never[] = [];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
