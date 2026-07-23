import type { Component } from 'vue';
export const ROUTES: Record<string, () => Promise<{ default: Component }>> = {
  'nodes/custom-nodes': () => import('./demos/custom-nodes.vue'),
  'nodes/html-nodes': () => import('./demos/html-nodes.vue'),
  'nodes/node-resizer': () => import('./demos/node-resizer.vue'),
  'edges/editable-edge': () => import('./demos/editable-edge.vue'),
  'layout/elk-tree': () => import('./demos/elk-tree.vue'),
  'misc/minimap-and-controls': () => import('./demos/minimap-and-controls.vue'),
  'diagrams/class-uml': () => import('./demos/class-uml.vue'),
  'diagrams/erd-editor': () => import('./demos/erd-editor.vue'),
  'dashboard/dashboard-builder': () => import('./demos/dashboard-builder.vue'),
  'collab/two-tabs-live': () => import('./demos/two-tabs-live.vue'),
  'collab/comments': () => import('./demos/comments.vue'),
  'misc/mermaid-text': () => import('./demos/mermaid-text.vue'),
};
