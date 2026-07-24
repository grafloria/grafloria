<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool, createEraserTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

// Eraser: wipe over ink to remove it. Whole-stroke delete; a sweep across
// several strokes is one undo step. Three parallel strokes are seeded and the
// eraser tool is live against the canvas.
const host = ref<HTMLElement | null>(null);

const ink = (id: string, y: number) =>
  new StrokeModel([{ x: 100, y }, { x: 300, y }, { x: 500, y }], { color: '#1f2933', width: 4 }, { id });

function onInit(inst: DiagramInstance) {
  const model = inst.getEngine().getDiagram() as any;
  if (model && host.value) {
    model.addStroke(ink('top', 120));
    model.addStroke(ink('mid', 240));
    model.addStroke(ink('bot', 360));
    registerTool(createEraserTool(whiteboardHost(inst, host.value), { radius: 10 }));
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
