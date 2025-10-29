import { Route } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { BasicDemoComponent } from './pages/basic-demo/basic-demo.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'basic-demo',
    component: BasicDemoComponent
  },
  {
    path: 'erd-designer',
    loadComponent: () => import('./pages/erd-designer/erd-designer.component').then(m => m.ErdDesignerComponent)
  },
  {
    path: 'workflow-builder',
    loadComponent: () => import('./pages/workflow-builder/workflow-builder.component').then(m => m.WorkflowBuilderComponent)
  },
  {
    path: 'dashboard-builder',
    loadComponent: () => import('./pages/dashboard-builder/dashboard-builder.component').then(m => m.DashboardBuilderComponent)
  },
  {
    path: 'form-builder',
    loadComponent: () => import('./pages/form-builder/form-builder.component').then(m => m.FormBuilderComponent)
  },
  {
    path: 'custom-nodes',
    loadComponent: () => import('./pages/custom-nodes/custom-nodes.component').then(m => m.CustomNodesComponent)
  },
  {
    path: 'shape-gallery',
    loadComponent: () => import('./pages/shape-gallery/shape-gallery.component').then(m => m.ShapeGalleryComponent)
  },
  {
    path: 'template-builder',
    loadComponent: () => import('./pages/template-builder/template-builder.component').then(m => m.TemplateBuilderComponent)
  },
  {
    path: 'advanced-routing',
    loadComponent: () => import('./pages/advanced-routing-demo/advanced-routing-demo.component').then(m => m.AdvancedRoutingDemoComponent)
  },
  {
    path: 'layout-showcase',
    loadComponent: () => import('./pages/layout-showcase/layout-showcase.component').then(m => m.LayoutShowcaseComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
