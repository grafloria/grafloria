<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { defineStyle } from '@grafloria/element';
import { markReady } from '../ready';

// The registry is a process-wide singleton, so namespace class names to this demo.
const WARN = 'nsc-warn';
const BOLD = 'nsc-bold';
defineStyle(WARN, { fill: '#f97316', stroke: '#9a3412', strokeWidth: 2 });
defineStyle(BOLD, { strokeWidth: 6 });

// defineStyle() + style.styleClass — one deterministic cascade:
// theme < type-default < named-class < element-inline < state.
const nodes = [
  { id: 'classed', position: { x: 60, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'styleClass: warn' },
    style: { styleClass: WARN } },
  { id: 'override', position: { x: 320, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'warn + inline fill' },
    style: { styleClass: WARN, fill: '#22c55e' } },
  { id: 'stacked', position: { x: 580, y: 90 }, size: { width: 190, height: 78 }, data: { label: 'warn bold' },
    style: { styleClass: `${WARN} ${BOLD}` } },
  { id: 'plain', position: { x: 320, y: 250 }, size: { width: 190, height: 78 }, data: { label: 'no class (theme)' } },
];
const edges: never[] = [];

onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
