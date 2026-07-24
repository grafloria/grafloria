<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { GrafloriaFlow, LIGHT_THEME, DARK_THEME } from '@grafloria/vue';
import type { Theme } from '@grafloria/vue';
import { themeRef, HIGH_CONTRAST_LIGHT_THEME } from '@grafloria/element';
import { markReady } from '../ready';

// themeRef('category.critical') — a theme swap recolours the CALLER's own
// semantic colours, not just the chrome. The nodes never name a colour; they
// declare a MEANING and the theme decides what it looks like.
const SEVERITY: [string, string, number][] = [
  ['critical', 'Disk failure', 60],
  ['warning', 'Latency spike', 250],
  ['success', 'Backup complete', 440],
  ['info', 'Config reloaded', 630],
];

const themes = [
  { key: 'light', label: 'light', theme: LIGHT_THEME },
  { key: 'dark', label: 'dark', theme: DARK_THEME },
  { key: 'hc', label: 'high contrast', theme: HIGH_CONTRAST_LIGHT_THEME },
];
const active = ref('light');
const theme = shallowRef<Theme>(LIGHT_THEME);

const nodes = [
  ...SEVERITY.map(([cat, label, x]) => ({
    id: cat, position: { x, y: 90 }, size: { width: 170, height: 76 }, data: { label },
    style: {
      fill: themeRef(`category.${cat}`),
      stroke: themeRef(`category.${cat}`),
      strokeWidth: themeRef('numbers.emphasis'),
    },
  })),
  { id: 'sink', position: { x: 340, y: 280 }, size: { width: 200, height: 76 }, data: { label: 'Incident queue' } },
];
const edges = SEVERITY.map(([cat]) => ({
  id: `e-${cat}`, source: cat, target: 'sink',
  style: { stroke: themeRef(`category.${cat}`), strokeWidth: themeRef('numbers.regular') },
}));

function setTheme(key: string) {
  active.value = key;
  theme.value = themes.find((t) => t.key === key)!.theme;
}

import { onMounted } from 'vue';
onMounted(() => markReady());
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex;gap:8px;align-items:center;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      <strong style="font-size:12px">theme:</strong>
      <button v-for="t in themes" :key="t.key" @click="setTheme(t.key)" :aria-pressed="t.key === active"
        style="padding:6px 14px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">{{ t.label }}</button>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" :theme="theme" />
    </div>
  </div>
</template>
