<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A designated grip drags its parent — and ONLY the grip: the body still selects
// but no longer drags. The grip becomes a drag-handle child INSIDE the parent's
// top strip, reached through the live model.
const nodes = [
  { id: 'win',  position: { x: 300, y: 200 }, size: { width: 240, height: 120 }, label: 'window body' },
  { id: 'grip', position: { x: 300, y: 200 }, size: { width: 240, height: 28 },  label: '⠿ title bar (drag me)' },
];
const edges: never[] = [];

function onInit(api: DiagramInstance) {
  try {
    const diagram = api.getEngine().getDiagram() as any;
    const grip = diagram?.getNode('grip');
    if (grip) {
      grip.setParent('win');
      grip.setPosition(0, 0);
      grip.setBehavior({ dragHandler: { isDragHandler: true } });
    }
    api.renderNow();
  } catch { /* interaction wiring optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
