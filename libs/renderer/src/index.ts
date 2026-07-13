// Export all types
export * from './types';

// Export VNode utilities (foreignObject support)
export * from './vnode';

// Export themes
export * from './themes';

// NOTE: the second `IRenderer` (core/renderer.interface) and its consumer stack
// — SVGRendererV2, the Canvas stub, HybridRenderer, RendererFactory,
// RendererStrategyManager — are gone. Nothing in production ever used them: the
// live pipeline is SVGRenderer (diagram → VNode) + the VNode patcher
// (VNode → DOM). The vocabulary worth keeping (RendererCapabilities, hitTest,
// export, text measurement) now lives on the surviving contract in
// types/renderer.interface.ts.

// Export renderers
export * from './svg';

// Wave 4: the Canvas 2D backend — the SECOND consumer of the same VNode tree
// (retained-mode painting, colour-keyed hit canvas, devicePixelRatio scaling,
// dirty-rectangle partial redraw), plus the per-diagram SVG⇄Canvas switch.
export * from './canvas';

// Phase 2.3: Interactive link editing tools
// Wave 3: also exports the framework-agnostic InteractionController.
export * from './interaction';

// Wave 3 (framework-agnostic instance API): the camera. Screen↔world conversion,
// zoom clamping, pan, and the viewBox convention — the math every framework
// wrapper otherwise re-implements.
export * from './viewport';

// Wave 3: the headless instance CONTRACT (types) a future createDiagram()
// implements. See ./instance/diagram-instance.ts for what still blocks it.
export * from './instance';

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
