export const ROUTES: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  'nodes/custom-nodes': () => import('./demos/custom-nodes'),
  'nodes/html-nodes': () => import('./demos/html-nodes'),
  'nodes/node-resizer': () => import('./demos/node-resizer'),
  'edges/editable-edge': () => import('./demos/editable-edge'),
  'layout/elk-tree': () => import('./demos/elk-tree'),
  'misc/minimap-and-controls': () => import('./demos/minimap-and-controls'),
  'diagrams/class-uml': () => import('./demos/class-uml'),
  'diagrams/erd-editor': () => import('./demos/erd-editor'),
  'dashboard/dashboard-builder': () => import('./demos/dashboard-builder'),
  'collab/two-tabs-live': () => import('./demos/two-tabs-live'),
  'collab/comments': () => import('./demos/comments'),
  'misc/mermaid-text': () => import('./demos/mermaid-text'),
};
import type React from 'react';
