<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Easy Connect in the ENGINE: press anywhere on a node body and release anywhere
// on another — they wire up, no aiming at a 6px port. The page only flips
// enableEasyConnect; the built-in drag path starts from the nearest port.
const nodes = [
  { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
  { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
];
const edges: never[] = [];

function onInit(api: DiagramInstance) {
  try {
    api.getEngine().setInteractionConfig({ enableEasyConnect: true } as never);
  } catch { /* config optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
