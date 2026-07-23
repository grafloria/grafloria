<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Custom-shaped nodes declared per node in the spec — the Vue way.
const nodes = [
  { id: 'a', position: { x: 60, y: 80 },  size: { width: 180, height: 80 }, data: { label: 'Ingest' },
    shape: { type: 'terminal', fill: '#ecfdf5', stroke: '#059669' } },
  { id: 'b', position: { x: 380, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Transform' },
    shape: { type: 'predefined-process', fill: '#eff6ff', stroke: '#2563eb' } },
  { id: 'c', position: { x: 700, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Publish' },
    shape: { type: 'document', fill: '#fdf4ff', stroke: '#9333ea' } },
];
const edges = [
  { id: 'e1', source: 'a', target: 'b' },
  { id: 'e2', source: 'b', target: 'c' },
];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
