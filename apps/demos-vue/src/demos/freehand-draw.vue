<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool, createDrawTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

// Freehand draw: the pen is live against the canvas. Press and drag to commit
// one simplified stroke entity — real vector ink, not a screenshot. A sample
// wave is seeded so the board is not blank.
const host = ref<HTMLElement | null>(null);

function onInit(inst: DiagramInstance) {
  const model = inst.getEngine().getDiagram() as any;
  if (model && host.value) {
    // Seed one example stroke (a gentle wave) so the ink surface is visible.
    const pts = Array.from({ length: 24 }, (_, i) => ({ x: 120 + i * 20, y: 200 + Math.sin(i / 2) * 40 }));
    model.addStroke(new StrokeModel(pts, { color: '#e11d48', width: 3 }, { id: 'seed' }));
    registerTool(createDrawTool(whiteboardHost(inst, host.value), { color: '#e11d48', width: 3, simplifyEpsilon: 0.8 }));
    inst.renderNow();
  }
  markReady();
}

onMounted(() => { /* markReady fires from onInit */ });
</script>

<template>
  <div ref="host" style="height:100vh">
    <GrafloriaFlow style="height:100%" @init="onInit" />
  </div>
</template>
