<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool, createRectangleTool } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

// Rectangle tool: drag out a box on the canvas and it becomes a real NODE —
// connectable, resizable, laid out — because a rectangle IS a box, unlike
// freehand ink. A seeded box shows the shape the tool produces.
const host = ref<HTMLElement | null>(null);
const nodes = [
  { id: 'box1', position: { x: 120, y: 100 }, size: { width: 300, height: 180 }, label: 'Box',
    style: { shape: 'rectangle', fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 } },
];

function onInit(inst: DiagramInstance) {
  const model = inst.getEngine().getDiagram();
  if (model && host.value) {
    registerTool(createRectangleTool(
      whiteboardHost(inst, host.value),
      { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, label: 'Box' },
    ));
  }
  markReady();
}

onMounted(() => { /* markReady fires from onInit */ });
</script>

<template>
  <div ref="host" style="height:100vh">
    <GrafloriaFlow style="height:100%" :default-nodes="nodes" @init="onInit" />
  </div>
</template>
