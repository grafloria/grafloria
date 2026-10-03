<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerStencils, bindShapeDataPanel, NodeFactory } from '@grafloria/element';
import { markReady } from '../ready';

// T9/visio — Visio's "Shape Data" window. Every master ships a dataSchema and
// the values live on node.data. Select a shape and edit the fields its master
// declares — a framework-free property sheet (bindShapeDataPanel) driven by the
// template's dataSchema, writing through SetNodeDataCommand so every field edit
// is undoable (Ctrl/⌘+Z) and collab-safe. Click empty canvas to deselect; the
// panel follows the selection.
const panel = ref<HTMLDivElement>();
let handle: ReturnType<typeof bindShapeDataPanel> | null = null;

function onInit(api: DiagramInstance) {
  const engine = api.getEngine() as any;
  // Masters carry the dataSchema the panel renders.
  registerStencils(engine.templateRegistry);
  const factory = new NodeFactory(engine.templateRegistry, api.getModel() as any);
  factory.createFromTemplate('flowchart-decision', { label: 'Approve?' }, { x: 220, y: 180 });
  factory.createFromTemplate('flowchart-process', { label: 'Pay' }, { x: 460, y: 180 });

  // The panel owns its element's inside.
  handle = bindShapeDataPanel(api as any, panel.value!);

  api.renderNow();
  markReady();
}
onBeforeUnmount(() => { handle?.destroy(); handle = null; });
</script>

<template>
  <div style="display:flex;height:100vh;min-height:0">
    <div style="flex:1;min-width:0;position:relative">
      <GrafloriaFlow :default-nodes="[]" :default-edges="[]" @init="onInit" />
    </div>
    <div id="sd-panel" ref="panel" style="width:232px;flex:none"></div>
  </div>
</template>
