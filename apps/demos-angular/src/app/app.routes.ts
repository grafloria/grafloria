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
  { path: 'nodes/auto-sizing', loadComponent: () => import('./demos/auto-sizing/auto-sizing.component').then((m) => m.AutoSizingComponent) },
  { path: 'nodes/connection-limit', loadComponent: () => import('./demos/connection-limit/connection-limit.component').then((m) => m.ConnectionLimitComponent) },
  { path: 'nodes/shapes', loadComponent: () => import('./demos/shapes/shapes.component').then((m) => m.ShapesComponent) },
  { path: 'edges/edge-labels', loadComponent: () => import('./demos/edge-labels/edge-labels.component').then((m) => m.EdgeLabelsComponent) },
  { path: 'edges/edge-markers', loadComponent: () => import('./demos/edge-markers/edge-markers.component').then((m) => m.EdgeMarkersComponent) },
  { path: 'edges/edge-types', loadComponent: () => import('./demos/edge-types/edge-types.component').then((m) => m.EdgeTypesComponent) },
  { path: 'edges/jump-overs', loadComponent: () => import('./demos/jump-overs/jump-overs.component').then((m) => m.JumpOversComponent) },
  { path: 'edges/floating-edges', loadComponent: () => import('./demos/floating-edges/floating-edges.component').then((m) => m.FloatingEdgesComponent) },
  { path: 'layout/dagre-tree', loadComponent: () => import('./demos/dagre-tree/dagre-tree.component').then((m) => m.DagreTreeComponent) },
  { path: 'layout/force-layout', loadComponent: () => import('./demos/force-layout/force-layout.component').then((m) => m.ForceLayoutComponent) },
];
