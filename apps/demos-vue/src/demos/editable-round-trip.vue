<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { importDiagram, isEditableArtifact } from '@grafloria/element';
import { markReady } from '../ready';

// Editable round-trip: the model rides INSIDE the exported file — an SVG
// <metadata> block. Re-open that file and you get an editable diagram back, not
// a flat picture. Pane A is the original; pane B is re-opened purely from pane
// A's exported bytes.
const WHEN = '2020-01-01T00:00:00Z';
const status = ref('exporting…');

const nodesA = [
  { id: 'a', label: 'Author',  position: { x: 60,  y: 90 },  size: { width: 150, height: 66 } },
  { id: 'b', label: 'Review',  position: { x: 300, y: 90 },  size: { width: 150, height: 66 } },
  { id: 'c', label: 'Publish', position: { x: 300, y: 230 }, size: { width: 150, height: 66 } },
];
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];
const nodesB = shallowRef<unknown[]>([]);
const edgesB = shallowRef<unknown[]>([]);

async function onInitA(inst: DiagramInstance) {
  try {
    const svg = await inst.export('svg', { embedModel: true, embedModelCreatedAt: WHEN } as never) as string;
    const editable = isEditableArtifact(svg);
    const model = importDiagram(svg) as any;
    if (model) {
      nodesB.value = model.getNodes().map((n: any) => ({
        id: n.id, label: n.getMetadata('label'),
        position: { x: n.position.x, y: n.position.y },
        size: { width: n.size.width, height: n.size.height },
      }));
      edgesB.value = model.getLinks().map((l: any) => ({ id: l.id, source: l.sourceNodeId, target: l.targetNodeId }));
      status.value = `re-opened ${model.getNodes().length} nodes from an ${editable ? 'editable' : 'unrecognised'} artifact.`;
    } else {
      status.value = 'the exported artifact carried no embedded model.';
    }
  } catch (e) {
    status.value = 'export failed: ' + (e as Error).message;
  }
  markReady();
}

onMounted(() => { /* markReady fires from onInitA */ });
</script>

<template>
  <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
    The model rides inside the exported file. Re-open it and you get an editable diagram back — {{ status }}
  </div>
  <div style="display:flex; height:calc(100vh - 45px)">
    <div style="flex:1; min-width:0; position:relative; border-right:2px solid rgba(127,127,127,.35)">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">original</span>
      <GrafloriaFlow :default-nodes="nodesA" :default-edges="edgesA" @init="onInitA" />
    </div>
    <div style="flex:1; min-width:0; position:relative">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">re-opened from the exported file</span>
      <GrafloriaFlow :nodes="(nodesB as never)" :edges="(edgesB as never)" />
    </div>
  </div>
</template>
