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

// Wave 4: deterministic headless export — VNode → standalone, styles-inlined SVG
// (pure, zero-DOM) → PNG/JPEG/WebP. Same VNode contract the live patcher consumes.
export * from './export';
// Wave 4: the Canvas 2D backend — the THIRD consumer of the same VNode tree
// (retained-mode painting, colour-keyed hit canvas, devicePixelRatio scaling,
// dirty-rectangle partial redraw), plus the per-diagram SVG⇄Canvas switch. It shares
// the export flattener's cascade, so screen / hit-canvas / exported file cannot drift.
export * from './canvas';

// Phase 2.3: Interactive link editing tools
// Wave 3: also exports the framework-agnostic InteractionController.
export * from './interaction';

// Wave 6: the ACCESSIBILITY layer. Semantics (roles/names emitted into the VNode
// tree, so they survive SSR + export), graph topology, the AT-navigable outline
// text mirror + natural-language summary, the managed aria-live region, and
// focus containment (focus never rests on off-screen geometry).
export * from './a11y';

// Wave 3 (framework-agnostic instance API): the camera. Screen↔world conversion,
// zoom clamping, pan, and the viewBox convention — the math every framework
// wrapper otherwise re-implements.
export * from './viewport';

// Wave 3 declared the headless instance contract; Wave 4 IMPLEMENTS it:
// createDiagram() + the DomEventBinder / RenderScheduler / custom-node host that
// were its four blockers. This is what every framework wrapper binds to.
export * from './instance';

// Wave 4 (Card 6): SSR-safe render + hydration. renderToStaticSVG() runs the
// real renderer in Node with no DOM; createDiagram({ hydrate }) adopts the DOM
// it produced instead of rebuilding it.
export * from './ssr';

// Wave 4: browser/server guards. Every DOM, measurement and animation touch in
// this library goes through these.
export * from './platform';

// Wave 8 (Card 3): DEFERRED / LAZY view instantiation. freeze()/unfreeze(), an
// autoFreeze mode that drops the view of anything that leaves the viewport, and a
// time-sliced async mount that yields to rAF so opening a huge graph paints in
// milliseconds instead of blocking the tab until every link has been routed.
export * from './lazy';

// Wave 9 (Collaboration) — Card 5, Part B: LIVE PRESENCE. Remote cursors, remote
// selections and name badges, as a SEPARATE DOM LAYER that never enters the VNode
// tree — a cursor moving at 60fps must not dirty a 10k-node diagram's frame, and an
// idle canvas with presence mounted still costs 0.0ms.
export * from './presence';

// Wave 6 (Cards 0/2/5/6/7): the EXTENSION API. One capability-scoped host over
// the registries that already existed (shapes, edge templates/markers, routers,
// node templates, animations), the link-pipeline seams that did NOT (anchors,
// connection points, connectors), a pluggable tool + connection-validation
// registry, and the portal/Background/MiniMap/Controls components.
export * from './ext';

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
// Wave 8 (Performance & scale) — Card 7: the adaptive quality governor + perf HUD.
export * from './perf';
