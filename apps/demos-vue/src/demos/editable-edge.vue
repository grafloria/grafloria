<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Click the wire to select it, click its body to drop a waypoint, drag the
// waypoint — the route bends to follow. Every bend is undoable.
const nodes = [
  { id: 'a', position: { x: 120, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'A' } },
  { id: 'b', position: { x: 620, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'B' } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
