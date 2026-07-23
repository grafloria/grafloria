<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { markReady } from '../ready';

// metadata.connectionPoint: 'smart' floats the edge along the node PERIMETER —
// move B around A and the wire re-attaches to whichever side faces it.
// Repositioning is pure data: the buttons just rewrite the nodes.
const POSITIONS: Record<string, { x: number; y: number }> = {
  right: { x: 620, y: 200 }, below: { x: 220, y: 460 }, corner: { x: 620, y: 460 },
};
const positions = Object.keys(POSITIONS);

const build = (pos: string) => [
  { id: 'a', position: { x: 220, y: 200 }, size: { width: 140, height: 90 }, label: 'A' },
  { id: 'b', position: { ...POSITIONS[pos] }, size: { width: 140, height: 90 }, label: 'B' },
];

const where = ref('right');
const nodes = ref(build('right'));
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct', metadata: { connectionPoint: 'smart' } }];

function place(pos: string) {
  where.value = pos;
  nodes.value = build(pos);
}
onMounted(() => markReady());
</script>

<template>
  <div style="position:relative; height:100vh">
    <div style="position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:5; display:flex; gap:8px">
      <button v-for="p in positions" :key="p" @click="place(p)"
        :style="{ background: where === p ? '#3B52D9' : '#EEF1FE', color: where === p ? '#fff' : '#3B52D9' }"
        style="padding:6px 14px; border-radius:999px; border:1px solid #94A5F0; font-weight:600; cursor:pointer">
        {{ p }}
      </button>
    </div>
    <GrafloriaFlow :nodes="nodes" :default-edges="edges" />
  </div>
</template>
