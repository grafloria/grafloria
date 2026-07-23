<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// EdgeSpec.router is a real per-link knob: three lanes, three algorithms
// (orthogonal, manhattan grid search, elk edge router), each dodging the
// obstacle that sits dead on its straight A→B line.
const LANES: [string, string, string][] = [
  ['orthogonal', 'orthogonal — HVH elbows', '#2563eb'],
  ['manhattan',  'manhattan — grid search', '#059669'],
  ['elk',        'elk — ELK edge router',   '#7c3aed'],
];

const nodes = LANES.flatMap(([, label], i) => {
  const yc = 110 + i * 150;
  return [
    { id: 'a' + i, position: { x: 70, y: yc - 24 },  size: { width: 108, height: 48 }, label: 'A' },
    { id: 'b' + i, position: { x: 760, y: yc - 24 }, size: { width: 108, height: 48 }, label: 'B' },
    { id: 'o' + i, position: { x: 410, y: yc - 42 }, size: { width: 100, height: 84 },
      label, style: { fill: '#fde68a', stroke: '#d97706' } },
  ];
});
const edges = LANES.map(([router, , color], i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i, router,
  style: { stroke: color, strokeWidth: 2.5 },
}));
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
