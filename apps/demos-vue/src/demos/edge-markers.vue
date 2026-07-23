<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import { registerMarker } from '@grafloria/element';
import { markReady } from '../ready';

// Eight built-in arrowheads, one AUTHOR-DEFINED marker via registerMarker(), and
// one explicit `none` — each row's left node names the head its wire wears.
const BUILTINS = ['arrow', 'open-arrow', 'circle', 'square', 'diamond', 'crow-foot', 'hollow-diamond', 'one-or-many'];

// A custom marker — a raw feather glyph. registerMarker is the open seam; the
// catalogue is not a closed enum.
const FEATHER_DEF = {
  tipOffset: (style: { size: number }) => style.size,
  render: (mctx: { size: number; color: string; transform: unknown }) => ({
    type: 'path',
    props: {
      d: `M0,0 L${mctx.size},0 M${mctx.size * 0.4},-4 L${mctx.size},0 L${mctx.size * 0.4},4`,
      stroke: mctx.color, fill: 'none', 'stroke-width': 1.5,
      transform: mctx.transform, className: 'arrow arrow-feather',
    },
  }),
};
registerMarker('feather', FEATHER_DEF as never);

const ROWS = [...BUILTINS, 'feather', 'none'];
const nodes = ROWS.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 120, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: type },
  { id: 'b' + i, position: { x: 620, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: '' },
]);
const edges = ROWS.map((type, i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i,
  style: { arrowHead: { type, size: 14, filled: false } },
}));
onMounted(() => markReady());
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" />
  </div>
</template>
