<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Ports are model anatomy: the target's left port declares maxConnections: 1 and
// REFUSES a second wire during the real drag — the UI stays enabled.
const nodes = [
  { id: 's1', position: { x: 60,  y: 60 },  size: { width: 150, height: 70 }, label: 'Source 1' },
  { id: 's2', position: { x: 60,  y: 240 }, size: { width: 150, height: 70 }, label: 'Source 2' },
  { id: 't',  position: { x: 520, y: 150 }, size: { width: 150, height: 70 }, label: 'Target (1 max)',
    ports: [
      { id: 't__left',  side: 'left',  type: 'bi', maxConnections: 1 },
      { id: 't__right', side: 'right', type: 'bi' },
    ] },
];
const edges: never[] = [];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
