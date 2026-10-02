import { component$ } from '@builder.io/qwik';
import { GrafloriaFlow, type EdgeSpec, type NodeSpec } from '@grafloria/qwik';

/**
 * Editor chrome in one prop. `plugins` mounts the minimap, the zoom/fit
 * controls and the dotted background — all lazily imported by the core, so an
 * app that never passes the prop ships none of that code.
 */
const nodes: NodeSpec[] = Array.from({ length: 9 }, (_, i) => ({
  id: `n${i}`,
  position: { x: 90 + (i % 3) * 300, y: 70 + Math.floor(i / 3) * 190 },
  size: { width: 170, height: 74 },
  label: `Step ${i + 1}`,
}));

const edges: EdgeSpec[] = Array.from({ length: 8 }, (_, i) => ({
  id: `e${i}`,
  source: `n${i}`,
  target: `n${i + 1}`,
}));

export default component$(() => (
  <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} plugins={true} />
));
