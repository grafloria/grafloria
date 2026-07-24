<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

// A typed graph — sources, transforms, sinks — with a registered validator:
// nothing flows OUT of a Sink, so a connection whose source is a sink is
// refused (with a reason) while the legal ones connect.
const nodes = [
  { id: 'src', position: { x: 80, y: 80 }, size: { width: 120, height: 46 }, label: 'Source', data: { role: 'source' } },
  { id: 'xf', position: { x: 320, y: 80 }, size: { width: 120, height: 46 }, label: 'Transform', data: { role: 'transform' } },
  { id: 'sink', position: { x: 560, y: 80 }, size: { width: 120, height: 46 }, label: 'Sink', data: { role: 'sink' } },
];
const edges: never[] = [];
let dispose: (() => void) | undefined;

function onInit(instance: DiagramInstance) {
  clearConnectionValidators();
  dispose = registerConnectionValidator(({ sourceNode }: any) => {
    if (sourceNode?.data?.role === 'sink') return 'A Sink has no outputs';
    return true;
  }) as any;
  instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
  markReady();
}

onBeforeUnmount(() => { dispose?.(); clearConnectionValidators(); });
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.8;border-bottom:1px solid rgba(127,127,127,.25)">validator registered: a Sink may not be a connection source</div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
