// Canvas 2D backend — the second consumer of the VNode tree.
//
// `svg/svg-renderer.ts` PRODUCES the tree; `vnode/patch.ts` turns it into SVG
// DOM; this turns it into Canvas 2D draw calls, with colour-keyed hit-testing,
// devicePixelRatio scaling and dirty-rectangle partial redraw. `render-backend.ts`
// lets one live diagram switch between the two.

export { CanvasRenderer, parseViewBox } from './canvas-renderer';
export type {
  CanvasFrameStats,
  CanvasLike,
  CanvasPick,
  CanvasRendererOptions,
} from './canvas-renderer';

export { DiagramRenderBackend } from './render-backend';
export type { BackendMode, CanvasRefusedEvent, RenderBackendOptions } from './render-backend';

// Wave 8 (Card 5): what a switch to canvas would COST this diagram.
//
// The automatic far-zoom tier the card asked for was built, measured and deleted — the
// numbers are in the header of `tier-policy.ts`. What survives is not a perf switch but a
// safety check on the switch that has existed since wave 4: canvas mode has no
// accessibility semantics, cannot paint HTML nodes, and drops DOM focus, and until now it
// would do all three without a word.
export { ALWAYS_SAFE_MODE, canvasSafety, explainHazards } from './tier-policy';
export type { CanvasHazard, CanvasSafety, CanvasSafetyInput } from './tier-policy';

export {
  CANVAS_LINK_HIT_TOLERANCE,
  VNodePainter,
  collectDefinitions,
  colorKeyFromPixel,
  entityOf,
  geometryOf,
  nextColorKey,
  textLines,
} from './vnode-painter';
export type {
  EntityScope,
  HitKind,
  HitRecord,
  PaintOptions,
  PaintResult,
  TextLine,
} from './vnode-painter';

export {
  CanvasStyleResolver,
  INHERITED_DEFAULTS,
  classListOf,
  fontString,
  parseDashArray,
  parseInlineStyle,
  readCssVarOverrides,
  textAlignFor,
  textBaselineFor,
  toNumber,
} from './style-resolution';
export type { ComputedStyle, StyleResolverOptions } from './style-resolution';

export { NULL_CONTEXT, RecordingContext2D } from './canvas-context';
export type { Canvas2DLike, DrawCall } from './canvas-context';

export {
  DirtyRegionTracker,
  collectEntities,
  mergeRects,
  previewIsActive,
} from './dirty-region';
export type { DirtyDiff, EntitySnapshot } from './dirty-region';

export {
  IDENTITY,
  applyMatrix,
  arcToCubics,
  boundsIntersect,
  boundsUnion,
  circlePath,
  distanceToPath,
  distanceToSegment,
  ellipsePath,
  flattenPath,
  linePath,
  multiply,
  padBounds,
  parsePath,
  parseTransform,
  pathBounds,
  pointInPath,
  polyPath,
  rectPath,
  rotation,
  scaling,
  transformCmds,
  translation,
} from './path-geometry';
export type { Bounds, Matrix, PathCmd, SubPath } from './path-geometry';
