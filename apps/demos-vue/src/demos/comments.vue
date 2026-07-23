<script setup lang="ts">
import { shallowRef } from 'vue';
import { GrafloriaFlow, GrafloriaCommentPanel } from '@grafloria/vue';
import type { CommentStore } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Anchored comment threads: :comments="true" turns the capability on; the
// conversation panel binds to the canvas's own CommentStore.
const store = shallowRef<CommentStore | null>(null);
const nodes = [
  { id: 'design', position: { x: 80, y: 120 },  size: { width: 150, height: 66 }, data: { label: 'Design' } },
  { id: 'review', position: { x: 330, y: 120 }, size: { width: 150, height: 66 }, data: { label: 'Review' } },
  { id: 'ship',   position: { x: 580, y: 120 }, size: { width: 150, height: 66 }, data: { label: 'Ship' } },
];
const edges = [
  { id: 'e1', source: 'design', target: 'review' },
  { id: 'e2', source: 'review', target: 'ship' },
];
function onInit(instance: DiagramInstance) {
  const s = (instance as unknown as { getCommentStore(): CommentStore | null }).getCommentStore();
  if (s) {
    const t = s.createThread({ kind: 'node', id: 'review' }, 'Can we tighten the hero copy?');
    s.reply(t, 'On it — draft by Friday.');
    store.value = s;
  }
  markReady();
}
</script>

<template>
  <div style="display:flex; height:100vh">
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" :comments="true" @init="onInit" />
    </div>
    <div v-if="store" style="width:300px; border-left:1px solid #E3E7F2; overflow:auto">
      <GrafloriaCommentPanel :store="store" />
    </div>
  </div>
</template>
