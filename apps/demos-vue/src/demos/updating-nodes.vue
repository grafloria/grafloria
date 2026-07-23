<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Edit a live node from OUTSIDE the canvas — type a label, pick a background,
// drag the width slider — and it re-renders on the spot. Each control calls a
// tracked setter (setMetadata, setSize) that bumps the mutation epoch.
const nodes = [
  { id: 'a', position: { x: 80,  y: 90 }, size: { width: 200, height: 90 }, label: 'BEFORE',
    shape: { type: 'rect', fill: '#eef2ff', stroke: '#6366f1' } },
  { id: 'b', position: { x: 560, y: 90 }, size: { width: 200, height: 90 }, label: 'Steady' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

let instance: DiagramInstance | null = null;
const label = ref('BEFORE');
const color = ref('#eef2ff');
const width = ref(200);

const nodeA = () => instance?.getModel().getNode('a') as any;
function onLabel() { try { nodeA()?.setMetadata('label', label.value); instance?.renderNow(); } catch { /* */ } }
function onColor() { try { nodeA()?.setMetadata('shape', { type: 'rect', fill: color.value, stroke: '#334155' }); instance?.renderNow(); } catch { /* */ } }
function onWidth() { try { const n = nodeA(); if (n) n.setSize(Number(width.value), n.size.height); instance?.renderNow(); } catch { /* */ } }

function onInit(inst: DiagramInstance) {
  instance = inst;
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:18px; align-items:center; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25); font:13px system-ui, sans-serif">
      <label style="display:flex; gap:7px; align-items:center">Label
        <input type="text" v-model="label" @input="onLabel" autocomplete="off"
          style="font:inherit; padding:3px 7px; border:1px solid rgba(127,127,127,.5); border-radius:5px; background:transparent; color:inherit"></label>
      <label style="display:flex; gap:7px; align-items:center">Background
        <input type="color" v-model="color" @input="onColor"
          style="width:34px; height:26px; padding:0; border:1px solid rgba(127,127,127,.5); border-radius:5px; background:transparent"></label>
      <label style="display:flex; gap:7px; align-items:center">Width
        <input type="range" min="140" max="360" step="1" v-model="width" @input="onWidth">
        <output style="font:12px ui-monospace, monospace; min-width:32px">{{ width }}</output></label>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
