<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// A MESH of 900 nodes (30×30, each wired to its right + down neighbour), laid
// out by a real engine. Viewport culling keeps only the visible slice in the DOM
// while the full graph lives in the model.
const R = 30, C = 30;
const nid = (r: number, c: number) => 'n' + (r * C + c);

const nodes: any[] = [];
for (let r = 0; r < R; r++)
  for (let c = 0; c < C; c++)
    nodes.push({ id: nid(r, c), position: { x: c * 120, y: r * 80 }, size: { width: 92, height: 46 }, label: '' + (r * C + c) });

const edges: any[] = [];
for (let r = 0; r < R; r++)
  for (let c = 0; c < C; c++) {
    if (c + 1 < C) edges.push({ id: 'h' + r + '_' + c, source: nid(r, c), target: nid(r, c + 1) });
    if (r + 1 < R) edges.push({ id: 'v' + r + '_' + c, source: nid(r, c), target: nid(r + 1, c) });
  }

onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" layout="layered" />
  </div>
</template>
