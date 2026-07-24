<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Proximity connect wired into the ENGINE: drag a node next to another and the
// wire proposes AND commits itself — driven by the engine's own drag path, not
// host glue. The page only sets enableProximityConnect.
const nodes = [
  { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
  { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
];
const edges: never[] = [];

function onInit(api: DiagramInstance) {
  try {
    api.getEngine().setInteractionConfig({ enableProximityConnect: true } as never);
  } catch { /* config optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
