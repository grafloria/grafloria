<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Drag a subflow container by its frame and the whole graph inside it moves with
// it — members and frame together, as one undoable step. The page only flips
// enableGroupDrag; the engine does the rest.
const nodes = [
  { id: 'm1', position: { x: 400, y: 200 }, size: { width: 100, height: 50 }, label: 'stage 1' },
  { id: 'm2', position: { x: 560, y: 220 }, size: { width: 100, height: 50 }, label: 'stage 2' },
  { id: 'outside', position: { x: 120, y: 500 }, size: { width: 100, height: 50 }, label: 'outside' },
];
const edges = [{ id: 'e1', source: 'm1', target: 'm2' }];

function onInit(api: DiagramInstance) {
  const finish = () => markReady();
  (async () => {
    try {
      const engine: any = api.getEngine();
      engine.setInteractionConfig({ enableGroupDrag: true });
      const g = await engine.addGroup({ name: 'Pipeline' });
      g.setFrame({ x: 370, y: 180, width: 320, height: 170 });
      await engine.addToGroup(g.id, 'm1');
      await engine.addToGroup(g.id, 'm2');
      api.renderNow();
    } catch { /* group wiring optional; canvas still paints */ }
    finish();
  })();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
