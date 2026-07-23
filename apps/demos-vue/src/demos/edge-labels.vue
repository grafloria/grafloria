<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// A label anchored ON the edge — it rides the wire, is draggable along it, and
// re-anchors automatically when the edge re-routes (pinned to a fraction of the
// route, not to canvas coordinates).
const nodes = [
  { id: 'a', position: { x: 120, y: 160 }, size: { width: 150, height: 70 }, label: 'Service A' },
  { id: 'b', position: { x: 560, y: 160 }, size: { width: 150, height: 70 }, label: 'Service B' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct', label: 'depends on' }];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
