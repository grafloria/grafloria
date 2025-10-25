// Export all types
export * from './types';

// Export VNode utilities (foreignObject support)
export * from './vnode';

// Export themes
export * from './themes';

// Export core services (excluding interfaces already exported from types)
export { RendererFactory } from './core/renderer-factory';
export { RendererStrategyManager } from './core/renderer-strategy-manager';

// Export renderers
export * from './svg';
export * from './canvas';

// Hybrid rendering (Phase 3.5)
export * from './hybrid';
