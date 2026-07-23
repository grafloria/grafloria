<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { SnapController } from '@grafloria/element';
import { markReady } from '../ready';

// Delete B out of A→B→C and the chain HEALS: its two edges cascade away with it
// and a fresh A→C wire bridges the gap — getIncomers × getOutgoers, then one
// bridge committed through the shipped link command (real, undoable).
const nodes = [
  { id: 'a', position: { x: 60,  y: 120 }, size: { width: 160, height: 80 }, label: 'A' },
  { id: 'b', position: { x: 340, y: 120 }, size: { width: 160, height: 80 }, label: 'B (middle)' },
  { id: 'c', position: { x: 620, y: 120 }, size: { width: 160, height: 80 }, label: 'C' },
];
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
];

let keyHandler: ((e: KeyboardEvent) => void) | null = null;
function onInit(api: DiagramInstance) {
  try {
    const m = api.getModel();
    const eng = api.getEngine();
    const snap = new SnapController();

    const healDelete = async (id: string) => {
      const links = m.getLinks();
      const incomers = [...new Set(links.filter((l: any) => l.targetNodeId === id).map((l: any) => l.sourceNodeId))];
      const outgoers = [...new Set(links.filter((l: any) => l.sourceNodeId === id).map((l: any) => l.targetNodeId))];
      await (eng as any).removeNode(id);
      for (const s of incomers) for (const t of outgoers) {
        if (s === t) continue;
        const sn = m.getNode(s as string), tn = m.getNode(t as string);
        if (!sn || !tn) continue;
        if (m.getLinks().some((l: any) => l.sourceNodeId === s && l.targetNodeId === t)) continue;
        const candidate = {
          sourcePort: (sn as any).getPortBySide('right') ?? (sn as any).getPorts()[0],
          targetPort: (tn as any).getPortBySide('left') ?? (tn as any).getPorts()[0],
          sourceNodeId: s, targetNodeId: t, distance: 0,
        };
        (eng as any).commandManager.execute(snap.buildProximityLinkCommand(candidate as never));
      }
      api.renderNow();
    };

    keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const sel = (m as any).getSelectedNodes ? (m as any).getSelectedNodes() : [];
      if (!sel.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      (async () => { for (const n of sel) await healDelete(n.id); })();
    };
    window.addEventListener('keydown', keyHandler, true);
  } catch { /* interaction wiring optional; canvas still paints */ }
  markReady();
}
onBeforeUnmount(() => { if (keyHandler) window.removeEventListener('keydown', keyHandler, true); });
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
