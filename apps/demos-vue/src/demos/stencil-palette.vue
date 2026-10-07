<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerStencils, bindStencilPalette } from '@grafloria/element';
import { markReady } from '../ready';

// Stencil palette (Visio-style): drag a shape out of a categorized stencil
// palette and drop it on the canvas — 80 BPMN / flowchart / UML / ERD masters,
// searchable, each thumbnail drawn from the shape's own outline geometry. A
// drop lands centred on the cursor as ONE undoable command (Ctrl/⌘+Z takes the
// whole shape back); section headers collapse.
const rail = ref<HTMLDivElement>();
const canvas = ref<HTMLDivElement>();
let handle: ReturnType<typeof bindStencilPalette> | null = null;

function onInit(api: DiagramInstance) {
  // Every built-in master behind engine.templateRegistry, so NodeFactory can
  // stamp any of them by id.
  registerStencils((api.getEngine() as any).templateRegistry);

  // The palette itself: sections from listStencils(), drops onto the canvas.
  // It owns the rail's inside.
  handle = bindStencilPalette(api as any, { palette: rail.value!, canvas: canvas.value! }, {
    data: (master: any) => ({ label: master.meta?.name ?? master.id }),
  });
  markReady();
}
onBeforeUnmount(() => { handle?.destroy(); handle = null; });
</script>

<template>
  <!-- The two-pane authoring frame: palette rail + canvas. -->
  <div style="display:flex;height:100vh;min-height:0">
    <div id="stencil-rail" ref="rail" style="width:232px;flex:none"></div>
    <div id="stencil-canvas" ref="canvas" style="flex:1;min-width:0;position:relative">
      <GrafloriaFlow :default-nodes="[]" :default-edges="[]" @init="onInit" />
    </div>
  </div>
</template>
