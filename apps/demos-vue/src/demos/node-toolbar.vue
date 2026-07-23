<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A floating toolbar pinned to a node — shown while the node is selected,
// placeable on any side, and held at a CONSTANT on-screen size. A screen-space
// overlay re-anchored to the node's projected position on every camera move, so
// it rides the node through pans, zooms and drags without ballooning.
const nodes = [{ id: 'n', position: { x: 320, y: 230 }, size: { width: 200, height: 100 }, label: 'selected' }];
const edges: never[] = [];
const wrap = ref<HTMLElement | null>(null);

function onInit(api: DiagramInstance) {
  try {
    const model = api.getModel() as any;
    const host = wrap.value!;
    const OFFSET = 10;
    const placement = () => {
      const node = model.getNode('n');
      if (!node) return null;
      const { x, y } = node.position, w = node.size.width;
      return { ax: x + 0.5 * w, ay: y, tf: `translate(-50%, calc(-100% - ${OFFSET}px))` };
    };

    const toolbar = document.createElement('div');
    toolbar.className = 'nt-toolbar';
    toolbar.style.cssText = 'position:absolute; left:0; top:0; z-index:4; display:flex; gap:6px; background:#111827; padding:5px 6px; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,.3); white-space:nowrap';
    const mk = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = 'nt-btn-' + label;
      b.style.cssText = 'font:12px system-ui; border:0; border-radius:5px; padding:3px 9px; background:#374151; color:#fff; cursor:pointer';
      b.onclick = onClick;
      toolbar.appendChild(b);
    };
    mk('duplicate', () => {
      const src = model.getNode('n'); if (!src) return;
      (api as any).setNodes([
        ...model.getNodes().map((x: any) => ({ id: x.id, position: { x: x.position.x, y: x.position.y }, size: { ...x.size }, label: x.getMetadata('label') })),
        { id: 'n-copy-' + Date.now().toString(36), position: { x: src.position.x + 40, y: src.position.y + 40 }, size: { ...src.size }, label: 'copy' },
      ]);
    });
    mk('delete', () => { if (!model.getNode('n')) return; model.removeNode('n'); toolbar.style.display = 'none'; api.renderNow(); });
    host.appendChild(toolbar);

    const reposition = () => {
      const pl = placement();
      if (!pl) return;
      const r = host.getBoundingClientRect();
      const c = api.viewport.worldToClient(pl.ax, pl.ay, r);
      toolbar.style.left = (c.x - r.left) + 'px';
      toolbar.style.top = (c.y - r.top) + 'px';
      toolbar.style.transform = pl.tf;
    };
    const syncVisible = () => {
      const node = model.getNode('n');
      toolbar.style.display = (node && node.isSelected()) ? '' : 'none';
    };

    const node = model.getNode('n');
    node.on('change:position', reposition);
    node.on('change:size', reposition);
    (api as any).on('selection:change', syncVisible);
    (api as any).on('viewport:change', reposition);
    api.viewport.onChange(reposition);

    model.selectNode(node);
    api.renderNow();
    reposition();
    syncVisible();
  } catch { /* toolbar overlay optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div ref="wrap" style="position:relative; height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
