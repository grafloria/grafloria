<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// PDF export: a true VECTOR PDF — paths stay paths, text stays selectable text
// — with zero new dependencies, straight from instance.export('pdf').
const note = ref('A true VECTOR PDF — paths stay paths, text stays selectable text.');
let instance: DiagramInstance | null = null;

const nodes = [
  { id: 'a', label: 'Requirements', position: { x: 60,  y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#eef2ff', stroke: '#4f46e5', strokeWidth: 2 } },
  { id: 'b', label: 'Design',       position: { x: 340, y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2 } },
  { id: 'c', label: 'Ship',         position: { x: 620, y: 90 }, size: { width: 190, height: 78 }, style: { fill: '#ecfdf5', stroke: '#059669', strokeWidth: 2 } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];

async function downloadPdf() {
  const href = await instance!.export('pdf') as string;
  const a = document.createElement('a');
  a.href = href; a.download = 'diagram.pdf'; a.click();
  note.value = `diagram.pdf saved (${Math.round(href.length * 3 / 4 / 1024)} KB)`;
}

function onInit(inst: DiagramInstance) { instance = inst; markReady(); }
onMounted(() => { /* markReady fires from onInit */ });
</script>

<template>
  <div style="display:flex;gap:8px;align-items:center;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap">
    <button @click="downloadPdf" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font:inherit">download PDF</button>
    <span style="font:12px ui-monospace,monospace;opacity:.8">{{ note }}</span>
  </div>
  <div style="height:calc(100vh - 45px)">
    <GrafloriaFlow style="height:100%" :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
