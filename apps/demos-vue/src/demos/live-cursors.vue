<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { MemoryHub } from '@grafloria/engine';
import { markReady } from '../ready';

// Live cursors with no server: two canvases join the same MemoryHub room via
// :collab. Move the pointer over the left canvas and the cursor appears live in
// the right one — remote cursors live on a separate presence DOM layer, so 60Hz
// cursor traffic never repaints the diagram and never enters the op log.
const hub = new MemoryHub();
const spec = () => ([
  { id: 'a', label: 'Plan',  position: { x: 70,  y: 90 }, size: { width: 150, height: 66 } },
  { id: 'b', label: 'Build', position: { x: 320, y: 90 }, size: { width: 150, height: 66 } },
]);
const nodesA = spec();
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }];
const nodesB = spec();
const edgesB = [{ id: 'e1', source: 'a', target: 'b' }];
const collabA = { transport: hub.connect('ana'), actor: 'ana', batch: false, awarenessThrottleMs: 0, presence: { name: 'Ana', smoothing: 0 } } as never;
const collabB = { transport: hub.connect('bo'), actor: 'bo', batch: false, awarenessThrottleMs: 0, presence: { name: 'Bo', smoothing: 0 } } as never;

onMounted(() => markReady());
</script>

<template>
  <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
    Move your pointer over the left canvas — your cursor appears live in the right one.
  </div>
  <div style="display:flex; height:calc(100vh - 45px)">
    <div style="flex:1; min-width:0; position:relative; border-right:2px solid rgba(127,127,127,.35)">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">Ana (you)</span>
      <GrafloriaFlow :default-nodes="nodesA" :default-edges="edgesA" :collab="collabA" />
    </div>
    <div style="flex:1; min-width:0; position:relative">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">Bo (sees Ana)</span>
      <GrafloriaFlow :default-nodes="nodesB" :default-edges="edgesB" :collab="collabB" />
    </div>
  </div>
</template>
