<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Eight nodes tween between layouts — grid · ring · row — by writing
// node.position every frame on an ease-out curve (pure userland; no animation
// API needed). The ring edges follow because they re-route to the nodes.
const IDS = Array.from({ length: 8 }, (_, i) => `n${i}`);
const SIZE = { width: 96, height: 40 };
const HX = SIZE.width / 2, HY = SIZE.height / 2;
const CX = 600, CY = 285;

function circleLayout() { const o: any = {}; IDS.forEach((id, i) => { const a = (i / IDS.length) * 2 * Math.PI - Math.PI / 2; o[id] = { x: CX + 250 * Math.cos(a) - HX, y: CY + 205 * Math.sin(a) - HY }; }); return o; }
function gridLayout()   { const o: any = {}; IDS.forEach((id, i) => { const c = i % 4, r = (i / 4) | 0; o[id] = { x: (315 + c * 190) - HX, y: (160 + r * 250) - HY }; }); return o; }
function rowLayout()    { const o: any = {}; IDS.forEach((id, i) => { o[id] = { x: (90 + i * 145) - HX, y: CY - HY }; }); return o; }

const LAYOUTS: any = { grid: gridLayout(), circle: circleLayout(), row: rowLayout() };
const ORDER = ['grid', 'circle', 'row'];
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const nodes = IDS.map((id) => ({ id, position: { ...LAYOUTS.grid[id] }, size: SIZE, label: id.toUpperCase() }));
const edges = IDS.map((id, i) => ({ id: `e${i}`, source: id, target: IDS[(i + 1) % IDS.length] }));

let instance: DiagramInstance | null = null;
let current = 'grid';
let busy = false;
const readout = ref('layout: grid');

function tweenTo(targets: any, duration = 900) {
  return new Promise<void>((resolve) => {
    if (!instance) { resolve(); return; }
    const model = instance.getModel();
    const starts: any = {};
    for (const id of Object.keys(targets)) { const p = (model.getNode(id) as any).position; starts[id] = { x: p.x, y: p.y }; }
    const t0 = performance.now();
    const frame = (now: number) => {
      const raw = Math.min(1, (now - t0) / duration);
      const k = easeOutCubic(raw);
      instance!.batchUpdate((m) => {
        for (const id of Object.keys(targets)) {
          const s = starts[id], t = targets[id];
          (m.getNode(id) as any).setPosition(s.x + (t.x - s.x) * k, s.y + (t.y - s.y) * k);
        }
      });
      instance!.renderNow();
      if (raw < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

async function shuffle() {
  if (busy) return; busy = true;
  current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  readout.value = `layout: ${current}`;
  await tweenTo(LAYOUTS[current]);
  busy = false;
}

function onInit(inst: DiagramInstance) {
  instance = inst;
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:16px; align-items:center; padding:10px 24px; font:12px/1.5 system-ui, sans-serif; border-bottom:1px solid rgba(127,127,127,.25)">
      <button @click="shuffle" type="button"
        style="font:12px system-ui, sans-serif; padding:4px 12px; border:1px solid rgba(127,127,127,.5); border-radius:6px; background:transparent; color:inherit; cursor:pointer">▶ shuffle layout</button>
      <span style="opacity:.7">{{ readout }}</span>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
