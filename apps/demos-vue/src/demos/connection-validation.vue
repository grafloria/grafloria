<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

// A registered validator vetoes an invalid connection before it is made:
// output→output is rejected (with a reason), output→input is allowed.
const nodes = [
  { id: 'a', position: { x: 120, y: 260 }, size: { width: 120, height: 70 }, label: 'A (out)',
    ports: [{ id: 'ao', side: 'right' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
  { id: 'b', position: { x: 640, y: 140 }, size: { width: 120, height: 70 }, label: 'B (in)',
    ports: [{ id: 'bi', side: 'left' as const, type: 'input', shape: { shape: 'circle', size: 13 } }] },
  { id: 'c', position: { x: 640, y: 400 }, size: { width: 120, height: 70 }, label: 'C (out)',
    ports: [{ id: 'co', side: 'left' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
];
const edges: never[] = [];
let dispose: (() => void) | undefined;

function onInit(instance: DiagramInstance) {
  clearConnectionValidators();
  dispose = registerConnectionValidator(({ sourcePort, targetPort }: any) => {
    if (!sourcePort || !targetPort) return true;
    if (sourcePort.type === 'output' && targetPort.type === 'output') return 'an output cannot feed another output';
    return true;
  }) as any;
  instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
  markReady();
}

onBeforeUnmount(() => { dispose?.(); clearConnectionValidators(); });
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
