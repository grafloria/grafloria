<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Command-based history on the component surface: drag a node (one gesture =
// one step), then undo()/redo() from your own UI — ⌘Z works too.
const nodes = [
  { id: 'a', position: { x: 160, y: 160 }, size: { width: 160, height: 70 }, label: 'Drag, then undo' },
  { id: 'b', position: { x: 480, y: 280 }, size: { width: 160, height: 70 }, label: 'Every step counts' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

let apiRef: DiagramInstance | null = null;
function onInit(api: DiagramInstance) { apiRef = api; markReady(); }
function undo() { void apiRef?.undo(); }
function redo() { void apiRef?.redo(); }
</script>

<template>
  <div style="height:100vh; position:relative">
    <div style="position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:5; display:flex; gap:8px">
      <button @click="undo" style="padding:7px 16px; border-radius:999px; border:0; background:#3B52D9; color:#fff; font-weight:600; cursor:pointer">↩ Undo</button>
      <button @click="redo" style="padding:7px 16px; border-radius:999px; border:1px solid #94A5F0; background:#EEF1FE; color:#3B52D9; font-weight:600; cursor:pointer">↪ Redo</button>
    </div>
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
