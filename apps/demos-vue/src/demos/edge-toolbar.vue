<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { createViewportPortal } from '@grafloria/element';
import { markReady } from '../ready';

// A floating toolbar anchored to the PATH via createViewportPortal() — it drops
// DOM into the world layer that tracks the camera. The toolbar sits at the edge
// midpoint and re-anchors every frame as the route moves.
const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 130, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 660, y: 140 }, size: { width: 130, height: 60 }, label: 'B' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth' }];

const wrap = ref<HTMLElement | null>(null);
let raf = 0;
let portal: { element: HTMLElement; setPosition: (x: number, y: number) => void; dispose: () => void } | null = null;

const midpoint = (pts: { x: number; y: number }[]) => {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  let half = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (half <= seg) { const t = half / (seg || 1); return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
    half -= seg;
  }
  return pts[0];
};

function onInit(instance: DiagramInstance) {
  try {
    const diagram = instance.getModel() as any;
    const htmlLayer = wrap.value!.querySelector('.grafloria-html-layer') as HTMLElement;
    portal = createViewportPortal(htmlLayer, { className: 'edge-tb' }) as any;
    portal!.element.innerHTML = '<button title="toggle dashed">✎</button><button title="delete edge">🗑</button>';
    portal!.element.setAttribute('style', 'display:flex; gap:4px; background:#1e293b; padding:3px 5px; border-radius:6px; pointer-events:auto');

    const [editBtn, deleteBtn] = portal!.element.querySelectorAll('button');
    editBtn.addEventListener('click', () => {
      const link = diagram.getLink('e1');
      if (!link) return;
      const dashed = link.style?.strokeDasharray;
      link.updateStyle({ strokeDasharray: dashed ? undefined : '8 5' });
      instance.renderNow();
    });
    deleteBtn.addEventListener('click', async () => {
      if (!diagram.getLink('e1')) return;
      await instance.getEngine().removeLink('e1');
      cancelAnimationFrame(raf);
      portal?.dispose();
      portal = null;
      instance.renderNow();
    });

    const loop = () => {
      const link = diagram.getLink('e1');
      if (portal && link) {
        const m = midpoint(link.points);
        portal.setPosition(m.x, m.y);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch { /* canvas still paints */ }
  markReady();
}

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  portal?.dispose();
  portal = null;
});
</script>

<template>
  <div ref="wrap" style="position:relative; height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
