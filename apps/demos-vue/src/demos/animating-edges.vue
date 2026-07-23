<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Four CSS stroke animations, straight from the spec: style.animation is a live
// keyframe on the painted path — marching-ants · flow · pulse · dash-flow.
const TYPES = ['marching-ants', 'flow', 'pulse', 'dash-flow'];
const nodes = TYPES.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 120, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: type },
  { id: 'b' + i, position: { x: 640, y: 60 + i * 110 }, size: { width: 130, height: 56 }, label: '' },
]);
const edges = TYPES.map((type, i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i,
  style: { animation: { type, speed: 'normal' } },
}));
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
