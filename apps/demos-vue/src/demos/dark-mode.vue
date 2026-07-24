<script setup lang="ts">
import { ref, computed } from 'vue';
import { GrafloriaFlow, LIGHT_THEME, DARK_THEME } from '@grafloria/vue';
import { markReady } from '../ready';

// Theme is a prop: swap :theme between the built-in token sets at runtime and
// every painted element re-skins — no CSS surgery.
const dark = ref(true);
const theme = computed(() => (dark.value ? DARK_THEME : LIGHT_THEME));
const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 160, height: 70 }, label: 'Tokens' },
  { id: 'b', position: { x: 480, y: 140 }, size: { width: 160, height: 70 }, label: 'not CSS hacks' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', label: 'theme-bound' }];

import { onMounted } from 'vue';
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh; position:relative">
    <div style="position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:5">
      <button @click="dark = !dark"
        style="padding:7px 18px; border-radius:999px; border:1px solid #94A5F0; background:#EEF1FE; color:#3B52D9; font-weight:600; cursor:pointer">
        {{ dark ? '☀ light' : '☾ dark' }}
      </button>
    </div>
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" :theme="theme" />
  </div>
</template>
