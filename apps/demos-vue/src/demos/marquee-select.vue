<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool } from '@grafloria/element';
import { markReady } from '../ready';

// Marquee (rubber-band) box-selection — the gesture the binder deliberately
// leaves to the host, assembled from the PUBLIC seams: registerTool() claims the
// empty-canvas drag, viewport converts coordinates, the selection API records the
// hit. Every node fully enclosed is selected; Shift adds to the selection.
const nodes = [
  { id: 'n1', position: { x: 120, y: 110 }, size: { width: 120, height: 60 }, label: 'n1' },
  { id: 'n2', position: { x: 300, y: 110 }, size: { width: 120, height: 60 }, label: 'n2' },
  { id: 'n3', position: { x: 120, y: 230 }, size: { width: 120, height: 60 }, label: 'n3' },
  { id: 'n4', position: { x: 560, y: 120 }, size: { width: 120, height: 60 }, label: 'n4' },
  { id: 'n5', position: { x: 560, y: 300 }, size: { width: 120, height: 60 }, label: 'n5' },
  { id: 'n6', position: { x: 330, y: 410 }, size: { width: 120, height: 60 }, label: 'n6' },
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n1', target: 'n3' },
  { id: 'e3', source: 'n4', target: 'n5' },
];
const wrap = ref<HTMLElement | null>(null);
let disposeTool: (() => void) | undefined;

function worldBounds(node: any) {
  const p = typeof node.getWorldPosition === 'function' ? node.getWorldPosition() : node.position;
  return { x: p.x, y: p.y, w: node.size.width, h: node.size.height };
}
function nodesInRect(model: any, rect: any) {
  const x1 = Math.min(rect.ax, rect.bx), y1 = Math.min(rect.ay, rect.by);
  const x2 = Math.max(rect.ax, rect.bx), y2 = Math.max(rect.ay, rect.by);
  return model.getNodes().filter((n: any) => {
    const b = worldBounds(n);
    return b.x >= x1 && b.y >= y1 && b.x + b.w <= x2 && b.y + b.h <= y2;
  });
}

function onInit(api: DiagramInstance) {
  try {
    const model: any = api.getModel();
    const host = wrap.value!;
    let overlay: HTMLDivElement | null = null;
    let start: any = null;
    let baseSelection = new Set<string>();

    const showBox = (a: any, b: any) => {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'marquee-box';
        overlay.style.cssText = 'position:absolute;pointer-events:none;z-index:20;border:1px dashed #3b82f6;background:rgba(59,130,246,.15);border-radius:2px;';
        host.appendChild(overlay);
      }
      overlay.style.left = Math.min(a.x, b.x) + 'px';
      overlay.style.top = Math.min(a.y, b.y) + 'px';
      overlay.style.width = Math.abs(b.x - a.x) + 'px';
      overlay.style.height = Math.abs(b.y - a.y) + 'px';
    };
    const clearBox = () => { overlay?.remove(); overlay = null; };
    const applySelection = (worldRect: any, additive: boolean) => {
      const hit = new Set(nodesInRect(model, worldRect).map((n: any) => n.id));
      for (const n of model.getNodes()) n.setSelected(hit.has(n.id) || (additive && baseSelection.has(n.id)));
      api.renderNow();
    };

    disposeTool = registerTool({
      id: 'marquee',
      priority: 1,
      hitTest: (_ev: any, hit: any) => !!hit.empty,
      onPointerDown: (ev: any) => {
        start = { world: { ...ev.world }, screen: { ...ev.screen } };
        const additive = ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
        baseSelection = new Set(model.getSelectedNodes().map((n: any) => n.id));
        if (!additive) { model.clearSelection(); baseSelection.clear(); }
      },
      onPointerMove: (ev: any) => {
        if (!start) return;
        const rect = host.getBoundingClientRect();
        const sScreen = { x: start.screen.x - rect.left, y: start.screen.y - rect.top };
        const eScreen = { x: ev.screen.x - rect.left, y: ev.screen.y - rect.top };
        showBox(sScreen, eScreen);
        const additive = ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
        applySelection({ ax: start.world.x, ay: start.world.y, bx: ev.world.x, by: ev.world.y }, additive);
      },
      onPointerUp: (ev: any) => {
        if (start) {
          const additive = ev.modifiers.shift || ev.modifiers.ctrl || ev.modifiers.meta;
          applySelection({ ax: start.world.x, ay: start.world.y, bx: ev.world.x, by: ev.world.y }, additive);
        }
        start = null; clearBox();
      },
      onCancel: () => { start = null; clearBox(); },
    } as any) as any;
  } catch { /* marquee tool optional; canvas still paints */ }
  markReady();
}

import { onBeforeUnmount } from 'vue';
onBeforeUnmount(() => { disposeTool?.(); });
</script>

<template>
  <div ref="wrap" style="position:relative; height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
