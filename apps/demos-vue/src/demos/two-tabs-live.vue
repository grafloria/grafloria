<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { BroadcastChannelTransport } from '@grafloria/engine';
import { markReady } from '../ready';

// Real multiplayer with no server: two canvases in one page, each joined to the
// same room over BroadcastChannel via :collab. Drag a node on the left — the
// right converges through the engine's per-property CRDT, with presence cursors
// painted for the remote actor.
const room = 'vue-collab-' + Math.random().toString(36).slice(2, 8);
const nodesA = [
  { id: 'a', position: { x: 60, y: 60 },  size: { width: 150, height: 66 }, data: { label: 'Ingest' } },
  { id: 'b', position: { x: 320, y: 60 }, size: { width: 150, height: 66 }, data: { label: 'Publish' } },
];
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }];
const nodesB = structuredClone(nodesA);
const edgesB = structuredClone(edgesA);
const collabA = { transport: new BroadcastChannelTransport({ name: room, actor: 'ana' }), actor: 'ana', presence: { name: 'Ana' } };
const collabB = { transport: new BroadcastChannelTransport({ name: room, actor: 'ben' }), actor: 'ben', presence: { name: 'Ben' } };
onMounted(() => markReady());
</script>

<template>
  <div style="display:flex; height:100vh; gap:1px; background:#E3E7F2">
    <div style="flex:1; background:#fff; display:flex; flex-direction:column">
      <div style="padding:6px 12px; font-size:12px; color:#5A6478">Tab A — Ana</div>
      <div style="flex:1">
        <GrafloriaFlow :default-nodes="nodesA" :default-edges="edgesA" :collab="collabA" />
      </div>
    </div>
    <div style="flex:1; background:#fff; display:flex; flex-direction:column">
      <div style="padding:6px 12px; font-size:12px; color:#5A6478">Tab B — Ben</div>
      <div style="flex:1">
        <GrafloriaFlow :default-nodes="nodesB" :default-edges="edgesB" :collab="collabB" />
      </div>
    </div>
  </div>
</template>
