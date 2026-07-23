<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Select the node: the built-in resizer chrome appears — corner dots + edge
// lines, min/max clamped DURING the gesture, one release = one undo step.
const nodes = [
  { id: 'a', position: { x: 200, y: 140 }, size: { width: 220, height: 110 },
    data: { label: 'Select me, then drag a corner' },
    metadata: { sizing: { minWidth: 120, minHeight: 70, maxWidth: 460, maxHeight: 240 } } },
];
const edges: never[] = [];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
