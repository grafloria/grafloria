<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { createDiagramApi } from '@grafloria/element';
import { markReady } from '../ready';

// Drag a node and every node it overlaps lights up red, live — served by the
// public wrapper createDiagramApi(...).getIntersectingNodes on every move.
const HILITE = { type: 'rect', fill: '#fecaca', stroke: '#dc2626' };
const rectOf = (n: any) => ({ x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height });

const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 180, height: 110 }, label: 'A · drag me' },
  { id: 'b', position: { x: 460, y: 140 }, size: { width: 180, height: 110 }, label: 'B' },
  { id: 'c', position: { x: 800, y: 140 }, size: { width: 180, height: 110 }, label: 'C' },
  { id: 's', position: { x: 150, y: 430 }, size: { width: 60, height: 60 }, label: 'S' },
];
const edges: never[] = [];

function onInit(api: DiagramInstance) {
  try {
    const diagram = api.getModel();
    const pub = createDiagramApi(api as never) as any;
    const hits = (id: string) => pub
      .getIntersectingNodes(rectOf(diagram.getNode(id)))
      .filter((o: any) => o.id !== id)
      .map((o: any) => o.id);
    const relight = (movedId: string) => {
      const moved = diagram.getNode(movedId);
      if (!moved) return;
      const lit = hits(movedId);
      for (const n of diagram.getNodes()) {
        const want = lit.includes(n.id);
        const has = (n as any).getMetadata('shape') === HILITE;
        if (want && !has) (n as any).setMetadata('shape', HILITE);
        else if (!want && has) (n as any).setMetadata('shape', undefined);
      }
    };
    (diagram as any).on('node:moved', ({ nodeId }: any) => relight(nodeId));
  } catch { /* interaction wiring optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace, monospace; opacity:.8; border-bottom:1px solid rgba(127,127,127,.25)">
      drag a node — the overlap set recomputes on every move
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
