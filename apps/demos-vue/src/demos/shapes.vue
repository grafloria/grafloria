<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { registerPathShape } from '@grafloria/element';
import { markReady } from '../ready';

// The 21 built-in figures — flowchart / BPMN / UML / ERD — plus a custom
// five-point star registered at runtime through registerPathShape(). Links
// attach to the real silhouette edge, not a bounding box.
const FIGURES = [
  'rect', 'circle', 'ellipse', 'diamond', 'hexagon', 'parallelogram', 'parallelogram-top',
  'trapezoid', 'trapezoid-bottom', 'triangle', 'triangle-down', 'package', 'cube',
  'document', 'cylinder', 'cloud', 'predefined-process', 'component', 'note', 'terminal', 'actor',
];

// A five-point star, as a custom silhouette through the public API.
const starPath = (w: number, h: number) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2, r = R * 0.42;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = (i % 2 ? r : R), ang = -Math.PI / 2 + i * Math.PI / 5;
    d += (i ? 'L' : 'M') + (cx + rad * Math.cos(ang)).toFixed(2) + ',' + (cy + rad * Math.sin(ang)).toFixed(2) + ' ';
  }
  return d + 'Z';
};
// Must be registered BEFORE the node that uses it paints.
registerPathShape('star', starPath);

const nodes = [...FIGURES, 'star'].map((type, i) => ({
  id: type,
  position: { x: 40 + (i % 6) * 200, y: 40 + Math.floor(i / 6) * 150 },
  size: { width: type === 'terminal' ? 170 : 130, height: 90 },
  label: type,
  shape: { type, fill: '#dbeafe', stroke: '#2563eb' },
}));
const edges: never[] = [];
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
