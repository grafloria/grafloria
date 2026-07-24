<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { QualityGovernor, PerfHud, EMPTY_SNAPSHOT } from '@grafloria/element';
import { markReady } from '../ready';

// Perf HUD & quality governor: an adaptive governor that steps the render tier
// DOWN under load and restores it when the budget recovers, and a HUD that
// reports it — fed live scene numbers off the mounted canvas.
const hud = ref<HTMLElement | null>(null);
const nodes = Array.from({ length: 24 }, (_, i) => ({
  id: 'n' + i, label: 'N' + i,
  position: { x: 40 + (i % 6) * 150, y: 40 + Math.floor(i / 6) * 110 },
  size: { width: 120, height: 60 },
}));
const edges = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1) }));

function onInit(inst: DiagramInstance) {
  const model = inst.getEngine().getDiagram() as any;
  const gov = new QualityGovernor();
  if (hud.value && model) {
    const perf = new PerfHud(hud.value);
    perf.show();
    const hostEl = hud.value.parentElement as HTMLElement;
    perf.update({
      ...EMPTY_SNAPSHOT,
      nodes: model.getNodes().length,
      visibleNodes: hostEl.querySelectorAll('[data-node-id]').length,
      links: model.getLinks().length,
      visibleLinks: hostEl.querySelectorAll('[data-link-id]').length,
      tier: 'high',
      governor: gov.getState(),
    } as never);
  }
  markReady();
}

onMounted(() => { /* markReady fires from onInit */ });
</script>

<template>
  <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
    An adaptive quality governor and a HUD that reports it — measured live off the mounted scene.
  </div>
  <div style="height:calc(100vh - 45px);position:relative">
    <GrafloriaFlow style="height:100%" :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    <div ref="hud" style="position:absolute;top:12px;right:12px;width:280px;z-index:5"></div>
  </div>
</template>
