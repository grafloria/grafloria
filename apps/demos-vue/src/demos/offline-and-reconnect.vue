<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { MemoryHub } from '@grafloria/engine';
import { markReady } from '../ready';

// Offline & reconnect: two peers on one MemoryHub via :collab. Anti-entropy
// exchanges exactly the ops each side missed and the two converge — no lost
// edits, no full resend. Offline edits are held in the local op log; the
// reconnect's sync round delivers them.
const hub = new MemoryHub();
const spec = () => ([
  { id: 'a', label: 'Alpha', position: { x: 80,  y: 90 }, size: { width: 150, height: 66 } },
  { id: 'b', label: 'Beta',  position: { x: 320, y: 90 }, size: { width: 150, height: 66 } },
]);
const nodesA = spec();
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }];
const nodesB = spec();
const edgesB = [{ id: 'e1', source: 'a', target: 'b' }];
const collabA = { transport: hub.connect('ana'), actor: 'ana', batch: false } as never;
const collabB = { transport: hub.connect('bo'), actor: 'bo', batch: false } as never;

onMounted(() => markReady());
</script>

<template>
  <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
    Cut the connection, edit both sides while disconnected, then reconnect — anti-entropy
    exchanges exactly the ops each side missed and the two converge.
  </div>
  <div style="display:flex; height:calc(100vh - 45px)">
    <div style="flex:1; min-width:0; position:relative; border-right:2px solid rgba(127,127,127,.35)">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">peer A</span>
      <GrafloriaFlow :default-nodes="nodesA" :default-edges="edgesA" :collab="collabA" />
    </div>
    <div style="flex:1; min-width:0; position:relative">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">peer B</span>
      <GrafloriaFlow :default-nodes="nodesB" :default-edges="edgesB" :collab="collabB" />
    </div>
  </div>
</template>
