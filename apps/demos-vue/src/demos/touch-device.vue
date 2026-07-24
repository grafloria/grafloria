<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Real finger input through the same pipeline a phone uses: one finger pans, one
// finger on a node drags it, a tap selects, two fingers pinch-zoom. The binder
// forks touch pointers to the gesture controller; touch-action:none keeps the
// browser from eating the gesture.
const nodes = [
  { id: 'a', position: { x: 500, y: 120 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 500, y: 320 }, size: { width: 120, height: 60 }, label: 'B' },
];
const edges: never[] = [];
const readout = ref('drive with a finger: pan, pinch, tap, drag');

function onInit(_api: DiagramInstance) {
  // Touch gestures are handled entirely by the engine's binder — nothing to wire.
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.85; border-bottom:1px solid rgba(127,127,127,.25); white-space:pre">{{ readout }}</div>
    <div style="flex:1; position:relative; touch-action:none">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
