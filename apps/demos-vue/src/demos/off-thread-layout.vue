<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Force layout in a REAL module Worker via engine.setLayoutPort(): the 45-node
// graph is arranged off the main thread, which keeps ticking the whole time.
const N = 45;

const nodes = Array.from({ length: N }, (_, i) => ({
  id: `n${i}`, position: { x: (i % 9) * 90, y: Math.floor(i / 9) * 90 },
  size: { width: 40, height: 40 }, label: `${i}`,
}));
const edges = [
  ...Array.from({ length: N - 1 }, (_, k) => {
    const i = k + 1;
    return { id: `e${i}`, source: `n${i - 1}`, target: `n${i}`, type: 'direct' as const };
  }),
  ...Array.from({ length: Math.ceil(N / 5) }, (_, k) => {
    const i = k * 5;
    return { id: `x${i}`, source: `n${i}`, target: `n${(i + 12) % N}`, type: 'direct' as const };
  }),
];

async function onInit(api: DiagramInstance) {
  const engine: any = api.getEngine();
  try {
    const worker = new Worker(new URL('./layout.worker.js', import.meta.url), { type: 'module' });
    engine.setLayoutPort(worker);
    await engine.layout('force', { seed: 0x5eed, iterations: 200, threshold: 0 });
  } catch { /* main-thread layout still paints */ }
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
