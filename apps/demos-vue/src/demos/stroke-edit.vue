<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool, createDrawTool, createStrokeEditTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

// Stroke edit: draw ink with the pen, then switch to the edit tool and drag a
// committed stroke — the whole stroke translates as one undoable step. The draw
// and edit tools are both registered; the toolbar is the tool-switch seam
// (setActive).
const host = ref<HTMLElement | null>(null);
const edit = ref(false);
let drawTool: { setActive: (a: boolean) => void } | undefined;
let editTool: { setActive: (a: boolean) => void } | undefined;

function setTool(next: boolean) {
  edit.value = next;
  drawTool?.setActive(!next);
  editTool?.setActive(next);
}

function onInit(inst: DiagramInstance) {
  const model = inst.getEngine().getDiagram() as any;
  if (model && host.value) {
    // Seed one stroke to author-then-edit against.
    model.addStroke(new StrokeModel(
      [{ x: 120, y: 200 }, { x: 240, y: 230 }, { x: 360, y: 210 }, { x: 420, y: 260 }],
      { color: '#0f766e', width: 4 }, { id: 'seed' },
    ));
    const wbHost = whiteboardHost(inst, host.value);
    drawTool = createDrawTool(wbHost, { color: '#0f766e', width: 4 }) as never;
    registerTool(drawTool as never);
    editTool = createStrokeEditTool(wbHost, { active: false }) as never;
    registerTool(editTool as never);
    inst.renderNow();
  }
  markReady();
}

onMounted(() => { /* markReady fires from onInit */ });
</script>

<template>
  <div style="display:flex;gap:8px;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25);align-items:center">
    <span>tool:</span>
    <button @click="setTool(false)" :style="{ background: edit ? 'transparent' : '#0f766e', color: edit ? 'inherit' : '#fff' }"
      style="padding:4px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);cursor:pointer;font:inherit">draw</button>
    <button @click="setTool(true)" :style="{ background: edit ? '#0f766e' : 'transparent', color: edit ? '#fff' : 'inherit' }"
      style="padding:4px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);cursor:pointer;font:inherit">edit</button>
  </div>
  <div ref="host" style="height:calc(100vh - 45px)">
    <GrafloriaFlow style="height:100%" @init="onInit" />
  </div>
</template>
