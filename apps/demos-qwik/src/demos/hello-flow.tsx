import { component$ } from '@builder.io/qwik';
import { GrafloriaFlow, type EdgeSpec, type NodeSpec } from '@grafloria/qwik';

/**
 * The smallest useful diagram: plain data in, a live, pannable, zoomable,
 * draggable canvas out. Nothing here is Qwik-specific — that is the point.
 */
const nodes: NodeSpec[] = [
  { id: 'a', position: { x: 80, y: 120 }, size: { width: 180, height: 72 }, label: 'Ingest' },
  { id: 'b', position: { x: 380, y: 120 }, size: { width: 180, height: 72 }, label: 'Transform' },
  { id: 'c', position: { x: 680, y: 40 }, size: { width: 180, height: 72 }, label: 'Warehouse' },
  { id: 'd', position: { x: 680, y: 210 }, size: { width: 180, height: 72 }, label: 'Dashboard' },
];

const edges: EdgeSpec[] = [
  { id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'b', target: 'c', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e3', source: 'b', target: 'd', sourceHandle: 'right', targetHandle: 'left' },
];

export default component$(() => (
  <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} fitView />
));
