<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerLinkTemplate } from '@grafloria/element';
import { markReady } from '../ready';

// registerLinkTemplate() is the seam for an entirely custom edge shape — handed
// the frame's routed path, it returns whatever SVG it likes. Here a two-rail
// "pipe": a wide translucent casing under a thin core.
registerLinkTemplate('pipe', (ctx: { pathData: string; selected: boolean }) => {
  const d = ctx.pathData;
  const stroke = ctx.selected ? '#2563eb' : '#0ea5e9';
  return [
    { type: 'path', props: { d, className: 'pipe-casing', fill: 'none', stroke, 'stroke-width': 10, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' } },
    { type: 'path', props: { d, className: 'pipe-core', fill: 'none', stroke, 'stroke-width': 2.5 } },
  ];
});

const nodes = [
  { id: 'a', position: { x: 120, y: 120 }, size: { width: 140, height: 64 }, label: 'Source' },
  { id: 'b', position: { x: 680, y: 340 }, size: { width: 140, height: 64 }, label: 'Sink' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth', style: { template: 'pipe' } }];

let instance: DiagramInstance | null = null;
const which = ref('pipe');
function useTemplate(name: string) {
  which.value = name;
  try {
    instance?.getModel().getLink('e1')?.updateStyle({ template: name || undefined });
    instance?.renderNow();
  } catch { /* not ready */ }
}
function onInit(inst: DiagramInstance) {
  instance = inst;
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:8px; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25)">
      <button @click="useTemplate('pipe')" :aria-pressed="which === 'pipe'"
        style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer">custom template</button>
      <button @click="useTemplate('')" :aria-pressed="which === ''"
        style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer">default edge</button>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
