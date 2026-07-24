<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

// A DAG a→b→c→d that stays acyclic: a connection whose target can already reach
// its source is refused, so the loop can never close. A validator walks the live
// directed edges through the real connect pipeline.
const nodes = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id, position: { x: 60 + i * 170, y: 120 }, size: { width: 110, height: 46 }, label: id.toUpperCase(),
}));
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
];
const readout = ref('acyclic guard active on a→b→c→d');
let dispose: (() => void) | undefined;

function reaches(model: any, fromId: string, toId: string) {
  const nodeOf = (portId: string, cached: string) => model.getNodeByPortId(portId)?.id ?? cached;
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === toId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const link of model.getLinks()) {
      if (nodeOf(link.sourcePortId, link.sourceNodeId) === cur) stack.push(nodeOf(link.targetPortId, link.targetNodeId));
    }
  }
  return false;
}

function onInit(api: DiagramInstance) {
  try {
    const model: any = api.getModel();
    clearConnectionValidators();
    dispose = registerConnectionValidator(({ sourceNode, targetNode }: any) => {
      if (!sourceNode || !targetNode) return true;
      if (reaches(model, targetNode.id, sourceNode.id)) return 'Refused: would create a cycle';
      return true;
    }) as any;
  } catch { /* validator optional; canvas still paints */ }
  markReady();
}

onBeforeUnmount(() => { dispose?.(); clearConnectionValidators(); });
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.8; border-bottom:1px solid rgba(127,127,127,.25); white-space:pre">{{ readout }}</div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
