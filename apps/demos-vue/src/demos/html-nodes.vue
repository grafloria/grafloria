<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// Custom nodes THE VUE WAY: a named #node-card slot with real bindings — the
// node still hit-tests, routes and drags like any other.
const nodes = [
  { id: 'a', type: 'card', position: { x: 80, y: 90 },  size: { width: 230, height: 110 },
    data: { title: 'Build', owner: 'CI', status: 'passing' } },
  { id: 'b', type: 'card', position: { x: 430, y: 90 }, size: { width: 230, height: 110 },
    data: { title: 'Deploy', owner: 'CD', status: 'ready' } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges">
      <template #node-card="{ data }">
        <div style="height:100%; background:#fff; border:1.5px solid #94A5F0; border-radius:12px;
                    padding:10px 14px; box-shadow:0 2px 10px rgba(35,42,61,.08); font-family:inherit">
          <div style="font-weight:700">{{ data.title }}</div>
          <div style="font-size:12px; color:#5A6478">owner: {{ data.owner }}</div>
          <span style="font-size:11px; font-weight:600; color:#059669; background:#ecfdf5;
                       border-radius:999px; padding:1px 8px">{{ data.status }}</span>
        </div>
      </template>
    </GrafloriaFlow>
  </div>
</template>
