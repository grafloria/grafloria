<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Dagre layered layout, declaratively: every node starts at 0,0 and the layout
// prop arranges the tree — including the isolated node b2.
const layout = { name: 'dagre', options: { direction: 'TB', nodeSpacing: 40, rankSpacing: 80 } };
const nodes = ['root', 'a', 'b', 'a1', 'a2', 'b1', 'b2'].map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 120, height: 48 }, label: id,
}));
const edges = [
  { id: 'e1', source: 'root', target: 'a', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e2', source: 'root', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e3', source: 'a', target: 'a1', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e4', source: 'a', target: 'a2', sourceHandle: 'bottom', targetHandle: 'top' },
  { id: 'e5', source: 'b', target: 'b1', sourceHandle: 'bottom', targetHandle: 'top' },
];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" :layout="layout" />
  </div>
</template>
