<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerTool } from '@grafloria/element';
import { markReady } from '../ready';

// A node carries a rotation the renderer bakes into its SVG transform. A rotate
// gesture is wired to real pointer events through the public registerTool seam —
// orbit the pointer around the node's centre and it spins live.
const nodes = [{ id: 'n', position: { x: 360, y: 150 }, size: { width: 200, height: 120 }, label: 'spin me' }];
const edges: never[] = [];

function onInit(api: DiagramInstance) {
  try {
    let grab: any = null;
    const center = (node: any) => ({
      x: node.position.x + node.size.width / 2,
      y: node.position.y + node.size.height / 2,
    });
    registerTool({
      id: 'demo-rotate',
      priority: 10,
      hitTest: (_e: unknown, hit: any) => !!hit.node,
      onPointerDown: (e: any, hit: any) => {
        const c = center(hit.node);
        grab = { node: hit.node, cx: c.x, cy: c.y,
          a0: Math.atan2(e.world.y - c.y, e.world.x - c.x), r0: hit.node.rotation };
      },
      onPointerMove: (e: any) => {
        if (!grab) return;
        const a = Math.atan2(e.world.y - grab.cy, e.world.x - grab.cx);
        grab.node.setRotation(grab.r0 + (a - grab.a0) * 180 / Math.PI);
      },
      onPointerUp: () => { grab = null; },
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
