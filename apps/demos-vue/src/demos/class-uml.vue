<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaDiagram } from '@grafloria/vue';
import { umlDiagram } from '@grafloria/element';
import { markReady } from '../ready';

// A UML class diagram from PURE DATA via the umlDiagram() kit — compartments,
// hollow-triangle inheritance, hollow-diamond aggregation, all interactive.
const spec = umlDiagram({
  classes: [
    { id: 'Animal', abstract: true, position: { x: 380, y: 40 },
      attributes: ['# name: String', '# age: int'],
      methods: ['+ speak(): void', '+ move(): void'] },
    { id: 'Dog', position: { x: 150, y: 320 },
      attributes: ['+ breed: String'], methods: ['+ speak(): void', '+ fetch(): void'] },
    { id: 'Cat', position: { x: 620, y: 320 },
      attributes: ['+ indoor: bool'], methods: ['+ speak(): void', '+ purr(): void'] },
    { id: 'Owner', position: { x: 380, y: 600 },
      attributes: ['+ name: String'], methods: ['+ adopt(p): void'] },
  ],
  relationships: [
    { from: 'Dog', to: 'Animal', kind: 'inheritance' },
    { from: 'Cat', to: 'Animal', kind: 'inheritance' },
    { from: 'Owner', to: 'Dog', kind: 'aggregation', label: 'owns' },
    { from: 'Owner', to: 'Cat', kind: 'aggregation', label: 'owns' },
  ],
});
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaDiagram :spec="spec" />
  </div>
</template>
