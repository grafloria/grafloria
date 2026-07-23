<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Five ports, five different SVG primitives — including an author-supplied
// custom path. Always-visible via node metadata.
const SHAPES = [
  { id: 'circle',   spec: { shape: 'circle', size: 16 } },
  { id: 'square',   spec: { shape: 'square', size: 16 } },
  { id: 'diamond',  spec: { shape: 'diamond', size: 16 } },
  { id: 'triangle', spec: { shape: 'triangle', size: 16 } },
  { id: 'path',     spec: { shape: 'path', size: 18, path: 'M0,-9 L9,0 L0,9 L-9,0 Z M0,-4 L4,0 L0,4 L-4,0 Z' } },
];

const nodes = SHAPES.map((s, i) => ({
  id: s.id, position: { x: 120 + i * 170, y: 240 }, size: { width: 120, height: 70 }, label: s.id,
  ports: [{ id: s.id + '-p', side: 'right' as const, shape: s.spec }],
}));
const edges: never[] = [];

function onInit(instance: DiagramInstance) {
  instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
