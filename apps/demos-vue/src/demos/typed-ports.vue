<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { portTypeRegistry } from '@grafloria/element';
import { markReady } from '../ready';

// Ports coloured by data type, refusing a mismatched connection —
// number→number is allowed, number→string is rejected before it is made.
// Compatibility comes entirely from the registered types.
portTypeRegistry.registerAll([
  { name: 'number', color: '#2563eb', compatibleWith: ['number'] },
  { name: 'string', color: '#9333ea', compatibleWith: ['string'] },
]);

const nodes = [
  { id: 'src', position: { x: 120, y: 260 }, size: { width: 130, height: 70 }, label: 'number src',
    ports: [{ id: 'out', side: 'right' as const, type: 'output', dataType: 'number', shape: { shape: 'circle', size: 13 } }] },
  { id: 'num', position: { x: 640, y: 140 }, size: { width: 130, height: 70 }, label: 'number in',
    ports: [{ id: 'nin', side: 'left' as const, type: 'input', dataType: 'number', shape: { shape: 'circle', size: 13 } }] },
  { id: 'str', position: { x: 640, y: 400 }, size: { width: 130, height: 70 }, label: 'string in',
    ports: [{ id: 'sin', side: 'left' as const, type: 'input', dataType: 'string', shape: { shape: 'circle', size: 13 } }] },
];
const edges: never[] = [];

function onInit(instance: DiagramInstance) {
  instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
