<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A container group with a real frame: drag the child in — it becomes a
// member and the frame carries it; membership is explicit, geometry never
// silently detaches it. Group API via the public engine.
const nodes = [
  { id: 'child', position: { x: 120, y: 420 }, size: { width: 100, height: 50 }, label: 'child' },
];
const edges: never[] = [];

async function onInit(api: DiagramInstance) {
  try {
    const engine: any = api.getEngine();
    engine.setInteractionConfig({ enableGroupDrag: true });
    const g = await engine.addGroup({ name: 'Container' });
    g.setFrame({ x: 400, y: 150, width: 320, height: 260 });
    g.constrainChildren = true;
  } catch { /* canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
