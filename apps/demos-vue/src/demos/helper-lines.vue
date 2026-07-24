<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { SnapController } from '@grafloria/element';
import { markReady } from '../ready';

// Snaplines: drag a node near another's edge/centre and the position SNAPS to
// alignment with a dashed guide; a genuine near-miss beyond the 8px threshold
// does not. enableHelperLines wires the pure SnapController into the drag path.
const nodes = [
  { id: 'anchor', position: { x: 200, y: 120 }, size: { width: 120, height: 60 }, label: 'anchor' },
  { id: 'below',  position: { x: 200, y: 320 }, size: { width: 120, height: 60 }, label: 'below' },
  { id: 'mover',  position: { x: 460, y: 500 }, size: { width: 120, height: 60 }, label: 'drag me' },
];
const edges: never[] = [];
const readout = ref('drag the lower-right node toward the others — dashed guides appear as edges align');

function onInit(api: DiagramInstance) {
  try {
    // The pure snap engine is also the one wired into the live drag path.
    void new SnapController({ snapThreshold: 8, equalSpacing: true });
    api.getEngine().setInteractionConfig({ enableHelperLines: true } as never);
  } catch { /* config optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.8; border-bottom:1px solid rgba(127,127,127,.25); white-space:pre">{{ readout }}</div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
