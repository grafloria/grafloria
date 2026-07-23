import { Routes } from '@angular/router';

/** One route per demo, mirroring the gallery's <category>/<name> paths so the
 *  shell can map a JS demo page to its Angular twin mechanically. */
export const routes: Routes = [
  { path: 'nodes/custom-nodes', loadComponent: () => import('./demos/custom-nodes/custom-nodes.component').then((m) => m.CustomNodesComponent) },
  { path: 'nodes/html-nodes', loadComponent: () => import('./demos/html-nodes/html-nodes.component').then((m) => m.HtmlNodesComponent) },
  { path: 'nodes/node-resizer', loadComponent: () => import('./demos/node-resizer/node-resizer.component').then((m) => m.NodeResizerComponent) },
  { path: 'edges/editable-edge', loadComponent: () => import('./demos/editable-edge/editable-edge.component').then((m) => m.EditableEdgeComponent) },
  { path: 'layout/elk-tree', loadComponent: () => import('./demos/elk-tree/elk-tree.component').then((m) => m.ElkTreeComponent) },
  { path: 'misc/minimap-and-controls', loadComponent: () => import('./demos/minimap-and-controls/minimap-and-controls.component').then((m) => m.MinimapAndControlsComponent) },
  { path: 'diagrams/class-uml', loadComponent: () => import('./demos/class-uml/class-uml.component').then((m) => m.ClassUmlComponent) },
  { path: 'diagrams/erd-editor', loadComponent: () => import('./demos/erd-editor/erd-editor.component').then((m) => m.ErdEditorComponent) },
  { path: 'dashboard/dashboard-builder', loadComponent: () => import('./demos/dashboard-builder/dashboard-builder.component').then((m) => m.DashboardBuilderComponent) },
  { path: 'collab/two-tabs-live', loadComponent: () => import('./demos/two-tabs-live/two-tabs-live.component').then((m) => m.TwoTabsLiveComponent) },
  { path: 'collab/comments', loadComponent: () => import('./demos/comments/comments.component').then((m) => m.CommentsComponent) },
  { path: 'misc/mermaid-text', loadComponent: () => import('./demos/mermaid-text/mermaid-text.component').then((m) => m.MermaidTextComponent) },
];
