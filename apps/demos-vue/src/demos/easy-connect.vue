<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool, SnapController } from '@grafloria/element';
import { markReady } from '../ready';

// Easy Connect: the WHOLE node is a handle. Press anywhere on one node, release
// anywhere on another, and they connect — wired through the public registerTool
// seam, committing with the shipped link command.
const nodes = [
  { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
  { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
];
const edges: never[] = [];

function onInit(api: DiagramInstance) {
  try {
    const model = api.getModel();
    const engine = api.getEngine() as any;
    const snap = new SnapController();
    let src: any = null;
    registerTool({
      id: 'demo-easy-connect',
      priority: 10,
      hitTest: (_e: unknown, hit: any) => !!hit.node,
      onPointerDown: (_e: unknown, hit: any) => { src = hit.node; },
      onPointerUp: (e: any) => {
        if (!src) return;
        const tgt = (model as any).getNodeAtPosition(e.world.x, e.world.y);
        if (tgt && tgt.id !== src.id) {
          const candidate = {
            sourcePort: src.getPortBySide('right') ?? src.getPorts()[0],
            targetPort: tgt.getPortBySide('left') ?? tgt.getPorts()[0],
            sourceNodeId: src.id, targetNodeId: tgt.id, distance: 0,
          };
          engine.commandManager.execute(snap.buildProximityLinkCommand(candidate as never));
        }
        src = null;
      },
      onCancel: () => { src = null; },
    } as never);
  } catch { /* interaction wiring optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
