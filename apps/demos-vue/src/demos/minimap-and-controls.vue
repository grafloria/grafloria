<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Editor chrome in one prop: :plugins="true" mounts minimap, zoom controls and
// the dotted background — lazy-loaded, so they cost nothing unused.
const nodes = Array.from({ length: 9 }, (_, i) => ({
  id: 'n' + i, position: { x: 90 + (i % 3) * 300, y: 70 + Math.floor(i / 3) * 190 },
  size: { width: 170, height: 74 }, data: { label: 'Step ' + (i + 1) },
}));
const edges = Array.from({ length: 8 }, (_, i) => ({
  id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1),
}));
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" :plugins="true" />
  </div>
</template>
