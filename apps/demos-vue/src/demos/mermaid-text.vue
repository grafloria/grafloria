<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Diagram-as-text: exportText() writes Mermaid-style text from the live canvas;
// loadText() reconciles edited text back INTO the same instance — positions
// survive through the lossless sidecar.
const text = ref('');
let instance: DiagramInstance | null = null;
const nodes = [
  { id: 'start', position: { x: 80, y: 60 },  size: { width: 140, height: 60 }, data: { label: 'Start' } },
  { id: 'work',  position: { x: 320, y: 60 }, size: { width: 140, height: 60 }, data: { label: 'Work' } },
  { id: 'done',  position: { x: 560, y: 60 }, size: { width: 140, height: 60 }, data: { label: 'Done' } },
];
const edges = [
  { id: 'e1', source: 'start', target: 'work' },
  { id: 'e2', source: 'work', target: 'done' },
];
function exportText() {
  text.value = instance?.exportText() ?? '';
}
function loadText() {
  instance?.loadText(text.value);
}
function onInit(inst: DiagramInstance) {
  instance = inst;
  exportText();
  markReady();
}
</script>

<template>
  <div style="display:flex; height:100vh">
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
    <div style="width:340px; border-left:1px solid #E3E7F2; display:flex; flex-direction:column; padding:10px; gap:8px">
      <div style="display:flex; gap:8px">
        <button @click="exportText" style="padding:6px 14px; border-radius:7px; border:0; background:#3B52D9; color:#fff; font-weight:600; cursor:pointer">⇢ Export</button>
        <button @click="loadText" style="padding:6px 14px; border-radius:7px; border:1px solid #94A5F0; background:#EEF1FE; color:#3B52D9; font-weight:600; cursor:pointer">⇠ Load</button>
      </div>
      <textarea v-model="text" style="flex:1; font:12.5px/1.6 ui-monospace, Menlo, monospace; border:1px solid #E3E7F2; border-radius:8px; padding:10px; resize:none"></textarea>
    </div>
  </div>
</template>
