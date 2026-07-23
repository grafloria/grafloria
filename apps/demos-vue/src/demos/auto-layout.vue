<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Zero-config layout: every node starts at 0,0 and layout="auto" picks a
// sensible arrangement for the graph's shape.
const IDS = ['ingest', 'parse', 'validate', 'enrich', 'score', 'store', 'index', 'notify', 'retry'];

const nodes = IDS.map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 130, height: 52 },
  label: id[0].toUpperCase() + id.slice(1),
}));
const edges = [
  { id: 'e1', source: 'ingest',   target: 'parse' },
  { id: 'e2', source: 'parse',    target: 'validate' },
  { id: 'e3', source: 'validate', target: 'enrich' },
  { id: 'e4', source: 'validate', target: 'retry' },
  { id: 'e5', source: 'enrich',   target: 'score' },
  { id: 'e6', source: 'score',    target: 'store' },
  { id: 'e7', source: 'score',    target: 'index' },
  { id: 'e8', source: 'store',    target: 'notify' },
  { id: 'e9', source: 'index',    target: 'notify' },
];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" layout="auto" />
  </div>
</template>
