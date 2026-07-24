<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Download image: exports the VNode tree — labels, arrowheads, shadows and all
// — not a screenshot. PNG (raster) and SVG (vector) both come from the same
// instance.export() pipeline.
const SHADOW = { offsetX: 3, offsetY: 4, blur: 5, color: '#1e293b' };
const note = ref('Exports the VNode tree — not a screenshot.');
let instance: DiagramInstance | null = null;

const nodes = [
  { id: 'ingest',    label: 'Ingest',    position: { x: 60,  y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 } },
  { id: 'transform', label: 'Transform', position: { x: 340, y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2, shadow: SHADOW } },
  { id: 'publish',   label: 'Publish',   position: { x: 620, y: 100 }, size: { width: 170, height: 78 }, style: { fill: '#dcfce7', stroke: '#16a34a', strokeWidth: 2 } },
];
const edges = [
  { id: 'e1', source: 'ingest', target: 'transform', label: 'rows' },
  { id: 'e2', source: 'transform', target: 'publish' },
];

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href; a.download = name; a.click();
}
async function downloadPng() {
  const d = await instance!.export('png', { scale: 2 } as never);
  download(d as string, 'diagram.png');
  note.value = `diagram.png saved (${Math.round((d as string).length * 3 / 4 / 1024)} KB)`;
}
async function downloadSvg() {
  const svg = await instance!.export('svg') as string;
  download('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 'diagram.svg');
  note.value = `diagram.svg saved (${Math.round(svg.length / 1024)} KB)`;
}

function onInit(inst: DiagramInstance) { instance = inst; markReady(); }
onMounted(() => { /* markReady fires from onInit */ });
</script>

<template>
  <div style="display:flex;gap:8px;align-items:center;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap">
    <button @click="downloadPng" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font:inherit">download PNG</button>
    <button @click="downloadSvg" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font:inherit">download SVG</button>
    <span style="font:12px ui-monospace,monospace;opacity:.8">{{ note }}</span>
  </div>
  <div style="height:calc(100vh - 45px)">
    <GrafloriaFlow style="height:100%" :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
