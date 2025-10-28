// Export all types
export * from './types';

// Export VNode utilities (foreignObject support)
export * from './vnode';

// Export themes
export * from './themes';

// Export core renderer strategy interfaces (used by Angular service)
export type {
  IRenderer as IRendererStrategy,
  RendererCapabilities,
  RendererConfig,
  SVGRendererConfig as SVGRendererStrategyConfig,
  CanvasRendererConfig as CanvasRendererStrategyConfig,
  RenderOptions,
  NodeUpdate,
  TextStyle,
  TextMetrics,
  BoundingBox,
  ExportFormat,
  ExportOptions,
  RendererConstructor,
} from './core/renderer.interface';

// Export core services
export { RendererFactory } from './core/renderer-factory';
export {
  RendererStrategyManager,
  type RendererChangeEvent,
  type RendererChangeCallback,
} from './core/renderer-strategy-manager';

// Export renderers
export * from './svg';
export * from './canvas';

// Hybrid rendering (Phase 3.5)
export * from './hybrid';

// Phase 2.3: Interactive link editing tools
export * from './interaction';
