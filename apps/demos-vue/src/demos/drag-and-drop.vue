<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Drag a chip out of the palette and drop it on the canvas: a node is created AT
// THE DROP POINT, in world coordinates (so it lands under the cursor even after
// the camera has panned/zoomed). Each drop is a new, independent node.
const canvas = ref<HTMLElement | null>(null);
const readout = ref('');
let apiRef: any = null;
let dragKind: string | null = null;

function clientToWorld(clientX: number, clientY: number) {
  const api = apiRef;
  const rect = canvas.value!.getBoundingClientRect();
  const vp = api.viewport;
  const zoom = vp.getZoom();
  const v = vp.getViewport();
  return { x: v.x + (clientX - rect.left) / zoom, y: v.y + (clientY - rect.top) / zoom };
}

async function dropAt(kind: string, clientX: number, clientY: number) {
  const api = apiRef; if (!api) return;
  const w = clientToWorld(clientX, clientY);
  const node: any = await api.getEngine().addNode({ type: 'rect', position: { x: w.x - 55, y: w.y - 22 }, size: { width: 110, height: 44 } });
  node.data = { kind };
  node.setMetadata('label', kind);
  api.renderNow();
  readout.value = `${api.getModel().getNodes().length} nodes`;
}

function onInit(api: DiagramInstance) {
  try {
    apiRef = api;
    const host = canvas.value!;
    host.addEventListener('dragover', (e) => e.preventDefault());
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragKind) void dropAt(dragKind, (e as DragEvent).clientX, (e as DragEvent).clientY);
    });
  } catch { /* drop wiring optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:grid; grid-template-columns:160px 1fr; height:100vh">
    <div style="border-right:1px solid rgba(127,127,127,.25); padding:12px; display:flex; flex-direction:column; gap:10px">
      <div v-for="kind in ['source','filter','sink']" :key="kind" draggable="true"
        @dragstart="dragKind = kind"
        style="padding:10px; border:1px dashed rgba(127,127,127,.5); border-radius:8px; text-align:center; cursor:grab; user-select:none; font:13px/1.2 system-ui,sans-serif; text-transform:capitalize">{{ kind }}</div>
    </div>
    <div ref="canvas" style="position:relative">
      <GrafloriaFlow :default-nodes="[]" :default-edges="[]" @init="onInit" />
      <span style="position:absolute; right:10px; top:8px; font:12px/1.4 ui-monospace,monospace; opacity:.75; pointer-events:none">{{ readout }}</span>
    </div>
  </div>
</template>
