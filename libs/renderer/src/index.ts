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

// Phase 1: Animation system
export { AnimationService } from './services/animation.service';
export type { AnimationConfig } from './services/animation.service';
export * from './utils/animation-utils';

// Phase 1.1: Animation enhancements
export * from './utils/animation-presets';
export * from './utils/animation-priority';
export { AnimationPerformanceService } from './services/animation-performance.service';
export type {
  AnimationMetrics,
  PerformanceWarningEvent,
  PerformanceThresholds,
} from './services/animation-performance.service';
export { PerformanceWarning } from './services/animation-performance.service';
export {
  CustomAnimationRegistry,
  getGlobalCustomAnimationRegistry,
  resetGlobalCustomAnimationRegistry,
} from './services/custom-animation-registry';
export type {
  CustomAnimationDefinition,
  AppliedAnimation,
} from './services/custom-animation-registry';
export {
  AnimationLifecycleManager,
  getGlobalAnimationLifecycleManager,
  resetGlobalAnimationLifecycleManager,
} from './services/animation-lifecycle';
export type {
  AnimationLifecycleEvent,
  AnimationEventData,
  LifecycleCallback,
} from './services/animation-lifecycle';
export {
  AnimationSequencer,
  createSequencer,
  fadeInSequence,
  staggerSequence,
} from './services/animation-sequencer';
export type {
  AnimationStepOptions,
  AnimationStep,
  SequenceState,
} from './services/animation-sequencer';
