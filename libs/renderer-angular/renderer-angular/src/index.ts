// Export components
export * from './lib/components/diagram-canvas.component';
export * from './lib/components/interaction-config-panel.component';
export * from './lib/components/property-panel/property-panel.component';
export * from './lib/components/property-panel/property-editor.component';
export * from './lib/components/node-toolbar';
// Wave 3 (Edges & links): path-anchored edge toolbar + rendered-route geometry
export * from './lib/components/link-toolbar';

// Export directives
export * from './lib/directives/grafloria-handle.directive';
export * from './lib/directives/responsive-canvas.directive';

// Export services
export * from './lib/services/vnode-renderer.service';
export * from './lib/services/interaction-handler.service';
export * from './lib/services/component-renderer.service';
export * from './lib/services/property-panel.service';
export * from './lib/services/property-editor-registry.service';
export * from './lib/services/handle-registry.service';

// Export adapters
export * from './lib/adapters/angular-component-adapter';

// Export mode-aware services
export * from './lib/services/mode-manager.service';
export * from './lib/services/execution-tracker.service';
export * from './lib/services/simulation-engine.service';
export * from './lib/services/breakpoint-manager.service';

// Phase 1.1: Animation service
export * from './lib/services/angular-animation.service';

// Interaction arbitration (ToolManager) for the canvas' mouse ladder.
//
// wave14/ng-touch — three DEAD exports removed from here, deliberately:
//  - PointerInputController ("unified Pointer Events input pipeline"): written,
//    exported, spec'd, never constructed by anything. Touch input now goes
//    through the SHARED TouchGestureController from @grafloria/renderer, wired
//    inside DiagramCanvasComponent.
//  - MobileToolbarComponent + TouchResizeHandleComponent ("Phase 4: Mobile
//    components"): referenced by nothing but their own specs. Touch resize is
//    real now, but it comes from the shared SelectionToolsController driven by
//    the touch controller — not from a dedicated handle component.
// A green unit suite proves a unit works, never that anything calls it; these
// shipped in the installable package looking like the touch story while the
// canvas was mouse-only.
export * from './lib/interaction';
// Phase 2 (Angular-native DX): declarative <ng-template grafloriaNode> custom
// nodes and app-wide provideGrafloria() configuration.
export * from './lib/directives/grafloria-node-def.directive';
export * from './lib/providers';
// Tier 2 (advanced domains): the dashboard kit, the Angular way.
export * from './lib/components/dashboard/grafloria-dashboard.component';
export * from './lib/components/dashboard/grafloria-widget-def.directive';
export * from './lib/components/grafloria-diagram.component';
