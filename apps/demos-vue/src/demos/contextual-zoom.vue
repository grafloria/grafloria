<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Level-of-detail: the tier the renderer draws is a pure function of zoom. Zoom
// in for full detail (labels, port glyphs); zoom out and it sheds detail through
// medium → sketch → low. The governor is OFF so the tier is a pure function of zoom.
const nodes = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`, position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 140 },
  size: { width: 150, height: 70 }, label: `Node ${i}`,
}));
const edges = Array.from({ length: 11 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}`, type: 'direct' }));

const readout = ref('');
const wrap = ref<HTMLElement | null>(null);
let apiRef: any = null;

function labelCount(host: HTMLElement) { return host.querySelectorAll('svg text').length; }

function tierAt(z: number) {
  try {
    const api = apiRef; if (!api) return;
    api.viewport.setZoom(z);
    api.renderNow();
    const tier = api.getQualityState().tier;
    readout.value = `zoom ${z}×  →  tier "${tier}"  (${labelCount(wrap.value!)} text nodes)`;
  } catch { /* ignore */ }
}

function onInit(api: DiagramInstance) {
  try {
    apiRef = api;
    api.fitView(40);
    tierAt(1.5);
  } catch { /* ignore */ }
  markReady();
}
</script>

<template>
  <div ref="wrap" style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:8px; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25); align-items:center">
      <span>zoom:</span>
      <button v-for="z in [1.5, 0.7, 0.3, 0.15]" :key="z" @click="tierAt(z)"
        style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer; font:inherit">{{ z }}×</button>
      <span style="margin-left:auto; font:12px/1.4 ui-monospace,monospace; opacity:.85">{{ readout }}</span>
    </div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" :renderer-config="{ qualityGovernor: false }" @init="onInit" />
    </div>
  </div>
</template>
