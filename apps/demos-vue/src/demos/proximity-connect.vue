<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { SnapController } from '@grafloria/element';
import { markReady } from '../ready';

// Drag a node near another and a dashed wire proposes itself LIVE, then commits
// on drop — SnapController.findProximityConnection driven from host glue on
// node:moved, exactly the shape React Flow's Proximity Connect example takes.
const nodes = [
  { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
  { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
];
const edges: never[] = [];
const wrap = ref<HTMLElement | null>(null);

function onInit(api: DiagramInstance) {
  try {
    const diagram = api.getModel();
    const engine = api.getEngine() as any;
    const snap = new SnapController();
    const host = wrap.value!;
    const NS = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(NS, 'svg');
    overlay.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:5');
    const wire = document.createElementNS(NS, 'line');
    wire.setAttribute('class', 'proximity-temp-wire');
    wire.setAttribute('stroke', '#f59e0b');
    wire.setAttribute('stroke-width', '2');
    wire.setAttribute('stroke-dasharray', '7 5');
    wire.setAttribute('visibility', 'hidden');
    overlay.appendChild(wire);
    host.appendChild(overlay);
    const hideWire = () => wire.setAttribute('visibility', 'hidden');

    const paintProposal = (movedId: string) => {
      const cand: any = snap.findProximityConnection(engine, movedId);
      if (!cand) { hideWire(); return; }
      const rect = host.getBoundingClientRect();
      const end = (nodeId: string, port: any) => {
        const n: any = diagram.getNode(nodeId);
        const w = port.getAbsolutePosition(n.getBoundingBox());
        const c = api.viewport.worldToClient(w.x, w.y, rect);
        return { x: c.x - rect.left, y: c.y - rect.top };
      };
      const s = end(cand.sourceNodeId, cand.sourcePort);
      const t = end(cand.targetNodeId, cand.targetPort);
      wire.setAttribute('x1', String(s.x)); wire.setAttribute('y1', String(s.y));
      wire.setAttribute('x2', String(t.x)); wire.setAttribute('y2', String(t.y));
      wire.setAttribute('visibility', 'visible');
    };
    (diagram as any).on('node:moved', ({ nodeId }: any) => paintProposal(nodeId));
    (api as any).on('nodes:change', () => {
      for (const n of diagram.getNodes()) {
        const cand: any = snap.findProximityConnection(engine, n.id);
        if (cand) { engine.commandManager.execute(snap.buildProximityLinkCommand(cand)); break; }
      }
      hideWire();
    });
  } catch { /* interaction wiring optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div ref="wrap" style="position:relative; height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
