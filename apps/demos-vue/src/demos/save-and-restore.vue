<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { DiagramSerializer } from '@grafloria/element';
import { markReady } from '../ready';

// Save a document as a serialized snapshot, then restore it into the live canvas:
// drag things around, click save, drag again, click restore — the canvas snaps
// back to the saved state and the post-save edits are gone.
const nodes = [
  { id: 'n1', position: { x: 80, y: 100 }, size: { width: 120, height: 48 }, label: 'n1' },
  { id: 'n2', position: { x: 320, y: 100 }, size: { width: 120, height: 48 }, label: 'n2' },
];
const edges = [{ id: 'e', source: 'n1', target: 'n2' }];
const readout = ref('drag a node, save, drag again, restore');
let apiRef: any = null;
const serializer = new DiagramSerializer();
let saved: any = null;

function onInit(api: DiagramInstance) {
  apiRef = api;
  markReady();
}

function save() {
  try {
    const api = apiRef; if (!api) return;
    saved = { doc: serializer.serialize(api.getModel()) };
    readout.value = `saved: ${api.getModel().getNodes().length} nodes\nnow move a node, then restore`;
  } catch { readout.value = 'save unavailable'; }
}
function restore() {
  try {
    const api = apiRef; if (!api) return;
    if (!saved) { readout.value = 'nothing saved yet — click save first'; return; }
    const doc: any = serializer.deserialize(structuredClone(saved.doc));
    api.setNodes(doc.getNodes().map((n: any) => ({
      id: n.id, position: { x: n.position.x, y: n.position.y }, size: { ...n.size },
      label: n.getLabel?.() ?? n.getMetadata('label'),
    })));
    api.renderNow();
    readout.value = `restored the saved snapshot (${doc.getNodes().length} nodes) — edits after save are gone`;
  } catch { readout.value = 'restore unavailable'; }
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:8px; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25)">
      <button @click="save" style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer; font:inherit">save</button>
      <button @click="restore" style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer; font:inherit">restore into fresh peer</button>
    </div>
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.85; border-bottom:1px solid rgba(127,127,127,.25); white-space:pre">{{ readout }}</div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
