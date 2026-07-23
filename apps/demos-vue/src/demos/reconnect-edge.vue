<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Select the wire, then drag its endpoint handle from B onto C — the edge
// reconnects, undoably. Built-in behaviour; nothing to wire.
const nodes = [
  { id: 'a', position: { x: 80,  y: 260 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 660, y: 110 }, size: { width: 120, height: 60 }, label: 'B' },
  { id: 'c', position: { x: 660, y: 430 }, size: { width: 120, height: 60 }, label: 'C' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', type: 'direct' }];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
