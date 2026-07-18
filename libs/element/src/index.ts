/**
 * `@grafloria/element` — the universal embed.
 *
 * Two surfaces over the same headless core:
 *
 *   1. `<grafloria-flow>` — a custom element. Attributes/properties in, DOM events
 *      out, slotted `<template>`s for custom nodes. Works in Vue, Svelte, Solid,
 *      Lit, Alpine, plain HTML, a CMS, a notebook — with no wrapper library.
 *   2. `Grafloria.render(spec, el)` — the Mermaid-shaped one-call API.
 *
 * Importing this module registers `<grafloria-flow>` automatically (and is a no-op
 * on the server, where `customElements` does not exist). Call
 * `Grafloria.define('my-flow')` yourself if you want a different tag name.
 */

import { defineGrafloriaFlow } from './lib/grafloria-flow-element';

export { GrafloriaFlowElement, defineGrafloriaFlow, GRAFLORIA_EVENTS } from './lib/grafloria-flow-element';

export { Grafloria, render, renderStatic } from './lib/grafloria';
export type { DiagramSpec, RenderSpec, RenderOptions } from './lib/grafloria';

export {
  registerNodeType,
  unregisterNodeType,
  registeredNodeTypes,
  getNodeType,
  hasNodeType,
  renderFromTemplate,
} from './lib/node-type-registry';
export type { NodeTypeRenderer } from './lib/node-type-registry';

// Re-exported so an embed never needs a second import to describe a diagram.
export type {
  DiagramInstance,
  CreateDiagramOptions,
  NodeSpec,
  EdgeSpec,
  PortSpec,
  HydrationSnapshot,
  StaticRenderOptions,
  StaticRenderResult,
  Theme,
} from '@grafloria/renderer';
export { renderToStaticSVG, LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';

/* ==========================================================================
 * WAVE 10 — THE REACHABILITY FIX.
 *
 * Everything below this line ALREADY EXISTED, was ALREADY unit-tested, and was
 * ALREADY exported from `@grafloria/renderer` / `@grafloria/engine`. None of it was
 * reachable by an actual embedder, because THIS file — the public package —
 * re-exported exactly three runtime values (`renderToStaticSVG`, `LIGHT_THEME`,
 * `DARK_THEME`) and nothing else.
 *
 * So: PNG/SVG/PDF export, the round-trip artifact, the Mermaid text format, the
 * minimap, the perf HUD, the quality governor, the named-style registry, the
 * WCAG contrast maths, `deriveTheme()`, `themeRef()`, the design-token bridges,
 * cross-tab sync, the CRDT, presence, comments and presentation mode were all
 * built, all green, and all WIRED TO NOTHING at the package boundary. The
 * gallery is what caught it: not one of these demos could be written.
 *
 * The rule this file now follows: if the library claims a feature, this file
 * exports the handle you drive it with. `libs/element/src/reachability.spec.ts`
 * is the lock — it fails if any of these names stops being reachable.
 * ========================================================================== */

// -- Theming ---------------------------------------------------------------
// The theme set + the OS-preference controller behind `colorMode: 'system'`.
export {
  HIGH_CONTRAST_LIGHT_THEME,
  HIGH_CONTRAST_DARK_THEME,
  DEFAULT_THEME_SET,
  ColorModeController,
  resolveThemeFromPrefs,
  readColorPreferences,
  MEDIA_PREFERS_DARK,
  MEDIA_PREFERS_CONTRAST,
  MEDIA_FORCED_COLORS,
} from '@grafloria/renderer';
export type { ColorMode, ThemeSet, ColorPreferences } from '@grafloria/renderer';

// Theme-bound properties: the CALLER's semantic colours follow a theme swap.
export {
  themeRef,
  isThemeRef,
  themeRefToken,
  themeRefVar,
  resolveThemeRef,
  themeRefCssValue,
  resolveBindableVars,
} from '@grafloria/renderer';
export type { ThemeRef } from '@grafloria/renderer';

// WCAG maths + a theme derivation that audits its own output.
export {
  WCAG,
  parseColor,
  toHex,
  relativeLuminance,
  contrastRatio,
  meetsContrast,
  rgbToHsl,
  hslToRgb,
  lightnessOf,
  withLightness,
  ensureContrast,
  auditThemeContrast,
  assertThemeContrast,
  deriveTheme,
} from '@grafloria/renderer';
export type { ContrastCheck, ContrastReport, DeriveThemeOptions, Rgb, Hsl } from '@grafloria/renderer';

// The design-token bridge: drive Grafloria from shadcn / MUI / Tailwind variables.
export {
  shadcnBridge,
  muiBridge,
  tailwindBridge,
  BRIDGEABLE_TOKENS,
  generateTokenBridgeBlock,
  generateInstanceOverrideCSS,
} from '@grafloria/renderer';
export type { TokenBridge } from '@grafloria/renderer';

// Port data types — the registry the renderer reads for glyph colours and the
// validator reads for connection compatibility. Same reachability hole as the
// style classes below: read on every frame, and no embedder could WRITE to it —
// the typed-ports demo could not colour its own types through the public API
// (its glyphs silently fell back to direction colours, and the screenshot audit
// read them as such).
export { portTypeRegistry, arePortDataTypesCompatible, portTypeColor } from '@grafloria/engine';
export type { PortDataTypeDefinition } from '@grafloria/engine';

// Named style classes — the `named-class` layer of the cascade. The cascade read
// this registry on every frame; nothing could WRITE to it.
export {
  defineStyle,
  defineStyles,
  getStyle,
  hasStyle,
  removeStyle,
  clearStyles,
  listStyles,
  resolveStyleClasses,
  resolveNodeStyle,
  resolveLinkStyle,
  CASCADE_ORDER,
} from '@grafloria/renderer';
export type { NamedStyle, CascadeLayer } from '@grafloria/renderer';

// Instance-scoped CSS variables — two diagrams, two themes, one page.
export {
  GRAFLORIA_INSTANCE_ATTR,
  GRAFLORIA_VAR_PREFIX,
  THEME_VARS,
  THEME_TOKENS,
  cssVarName,
  themeVar,
  themeVarValue,
  resolveThemeVars,
  instanceScopeSelector,
} from '@grafloria/renderer';
export type { ThemeToken } from '@grafloria/renderer';

// -- Export ----------------------------------------------------------------
// Deterministic, DOM-free SVG serialization; true vector PDF; the raster seam.
export {
  exportSvg,
  serializeVNode,
  vnodeBounds,
  exportPdf,
  paginate,
  buildPrintDocument,
  exportBatch,
  createDomRasterBackend,
  resolveRasterBackend,
  canRasterizeInThisEnvironment,
  svgToDataUri,
  mimeTypeForFormat,
} from '@grafloria/renderer';
export type {
  SvgExportOptions,
  SvgExportResult,
  PdfExportOptions,
  PdfExportResult,
  RasterBackend,
  ExportFormat,
  ExportOptions,
} from '@grafloria/renderer';

// The model rides INSIDE the artifact: SVG metadata + a real PNG iTXt chunk.
export {
  GRAFLORIA_NS,
  GRAFLORIA_MODEL_KEY,
  embedModelInSvg,
  extractModelFromSvg,
  embedModelInPng,
  extractModelFromPng,
  extractModel,
  isEditableArtifact,
  importDiagram,
} from '@grafloria/renderer';

// -- Canvas furniture ------------------------------------------------------
// One call over a DiagramInstance. `gridEnabled` / `showMinimap` / `snapEnabled`
// are only live once this runs — which nothing could call.
export {
  attachCanvasPlugins,
  createMiniMap,
  createControls,
  createBackground,
} from '@grafloria/renderer';
export type {
  CanvasPluginOptions,
  CanvasPlugins,
  MiniMapOptions,
  ControlsOptions,
  BackgroundOptions,
  BackgroundVariant,
} from '@grafloria/renderer';

// -- Performance -----------------------------------------------------------
export { PerfHud, formatSnapshot, EMPTY_SNAPSHOT, QualityGovernor } from '@grafloria/renderer';
export type { PerfSnapshot, QualityBias, GovernorState, GovernorOptions } from '@grafloria/renderer';

// -- Collaboration (renderer half) -----------------------------------------
// Presence is a SEPARATE DOM layer that never enters the VNode tree.
export {
  bindPresence,
  PresenceOverlay,
  PRESENCE_LAYER_CLASS,
  actorColor,
  actorInitials,
  contrastingTextColor,
} from '@grafloria/renderer';
export type { PresencePeer, PresenceSource, PresenceBinding } from '@grafloria/renderer';

export { CommentOverlayController } from '@grafloria/renderer';
export type { CommentSource, CommentRendererHost, CommentOverlayOptions } from '@grafloria/renderer';

export {
  InMemoryViewportChannel,
  presentTo,
  followPresenter,
  lockDocument,
  isDocumentLocked,
  loadReadonlySnapshot,
} from '@grafloria/renderer';
export type { ViewportChannel, PresenterViewport } from '@grafloria/renderer';

// -- Collaboration (engine half) -------------------------------------------
// Sync, the CRDT and comments live in the ENGINE, and this package did not
// re-export the engine AT ALL — its only reference was a type-only import,
// erased at build. Zero collaboration symbols survived into the bundle.
export {
  createSyncSession,
  SyncAdapter,
  MemoryHub,
  MemoryTransport,
  BroadcastChannelTransport,
  WebSocketTransport,
  UnreliableHub,
  Awareness,
  VersionVector,
  OpBatcher,
  CausalBuffer,
} from '@grafloria/engine';
export type { SyncTransport, SyncSessionOptions, SyncAdapterOptions, AwarenessState } from '@grafloria/engine';

// The per-property CRDT. Whole-entity LWW would silently throw one edit away.
export {
  Replica,
  LwwRegistry,
  OpLog,
  UndoStack,
  ReferentialIntegrity,
  LamportClock,
  applyOp,
  replay,
  compareOps,
  opId,
} from '@grafloria/engine';
export type { ActorId, Op, ReplicaOptions, Stamp } from '@grafloria/engine';

// Threaded comments. A deleted node ORPHANS its thread; it never destroys it.
export { CommentStore } from '@grafloria/engine';
export type { AnchorSpec, CommentStoreOptions } from '@grafloria/engine';

// The lossless Mermaid-compatible text format, with hand-edit detection.
export {
  exportDiagramText,
  importDiagramText,
  stripGrafloriaSidecar,
  GRAFLORIA_DOC_PREFIX,
  GRAFLORIA_HASH_PREFIX,
} from '@grafloria/engine';
export type { ExportTextOptions, ImportTextOptions, ImportTextResult } from '@grafloria/engine';

export { DiagramSerializer } from '@grafloria/engine';

// wave10/whiteboard: ink as a first-class model entity — authors seed and inspect strokes
// through this, the same class the draw tool commits.
export { StrokeModel, DEFAULT_STROKE_STYLE } from '@grafloria/engine';
export type { StrokePoint, StrokeStyle, SerializedStroke } from '@grafloria/engine';

// ===========================================================================
// wave10/gallery BUG FIX — the AUTHORING SEAMS were not on the public embed.
//
// This package's own doc calls itself "the universal embed … so an embed never
// needs a second import". It exported fifteen values, and every registry an
// author actually extends the engine THROUGH was missing from all of them:
//
//   registerLinkTemplate / registerLabelTemplate  — custom edges & labels
//   registerMarker                                — named custom arrowheads
//   registerConnector / registerAnchor /
//     registerConnectionPoint                     — the wave-6 link pipeline
//   registerConnectionValidator / isValidConnection — vetoing a connection
//   registerTool                                  — replacing a gesture
//   createPortal / createViewportPortal           — anchoring UI to geometry
//                                                   (an edge toolbar, a badge)
//
// Every one of them is a documented, semver'd, unit-tested extension point of
// `@grafloria/renderer`. None was reachable from `<grafloria-flow>` or `Grafloria.render()`
// — i.e. from the surface this package exists to BE. An embedder who took the
// package at its word ("no second import") could not write a custom edge.
//
// These are re-exports, not new API. The registries are process-wide singletons
// in @grafloria/renderer, so registering through here is the same registration the
// renderer's own consumers read.
// ===========================================================================

export {
  // Custom edges, labels and named markers (Wave 4 — Card 5).
  registerLinkTemplate,
  unregisterLinkTemplate,
  listLinkTemplates,
  registerLabelTemplate,
  unregisterLabelTemplate,
  listLabelTemplates,
  registerMarker,
  unregisterMarker,
  listMarkers,
  htmlLabelVNode,

  // The link pipeline: anchors, connection points, connectors (Wave 6 — Card 2).
  registerAnchor,
  listAnchors,
  registerConnectionPoint,
  listConnectionPoints,
  registerConnector,
  listConnectors,

  // Connection validation + the tool registry (Wave 6 — Card 5).
  registerConnectionValidator,
  isValidConnection,
  clearConnectionValidators,
  registerTool,
  listTools,

  // wave10/whiteboard: the freehand-draw / rectangle / eraser tools + the in-progress
  // ink overlay. Register them through `registerTool` — an embed draws on its diagram
  // with no second import, which is the whole promise of this package.
  createDrawTool,
  createRectangleTool,
  createEraserTool,
  // wave13/stroke-edit: select + move committed ink (the drawn/erased/EDITED triad closes).
  createStrokeEditTool,
  DrawTool,
  RectangleTool,
  EraserTool,
  StrokeEditTool,
  InkOverlay,
  INK_OVERLAY_CLASS,

  // Anchoring your own DOM to diagram geometry — how an edge toolbar is built.
  createPortal,
  createViewportPortal,
  createCounterScaledPortal,
} from '@grafloria/renderer';

export type {
  LinkTemplate,
  LinkTemplateContext,
  LabelTemplate,
  LabelTemplateContext,
  MarkerDefinition,
  MarkerContext,
  AnchorFn,
  AnchorContext,
  ConnectionPointFn,
  ConnectionPointContext,
  ConnectorFn,
  ConnectorContext,
  ConnectionValidator,
  ConnectionCandidate,
  CanvasTool,
  Portal,
  ViewportPortal,
  // wave10/whiteboard tool option/host types.
  WhiteboardHost,
  DrawToolOptions,
  RectangleToolOptions,
  EraserToolOptions,
  StrokeEditToolOptions,
  InkPreviewStyle,
} from '@grafloria/renderer';

// ===========================================================================
// wave11/nodes GALLERY BUG FIX — the NODE authoring seams were not on the embed.
//
// Same finding shape as Wave 10, one layer down. This package re-exported the
// EDGE/PORT authoring registries (Wave 10) and the whole collaboration/export
// stack, but the NODE-shape and node-sizing seams — every one a documented,
// unit-tested, `@grafloria/renderer`-exported extension point — were missing from
// all fifteen-plus re-exports. An embedder taking the package at its word ("the
// universal embed … an embed never needs a second import") could NOT:
//
//   - draw any of the 21 built-in figures' CUSTOM cousins, or register a custom
//     silhouette: `registerShape` / `registerPathShape` / `listShapes` were
//     reachable only past the package boundary. (The 21 built-ins render fine via
//     `shape: { type }`, because the registry pre-registers them; a custom shape
//     could not be added at all.)
//   - read or reuse the per-node sizing contract the resizer AND the auto-sizer
//     share (`getNodeSizing` / `clampSizeToConstraints` / `resolveAspectRatio`) —
//     the min/max/aspect clamp math that a custom resize gesture (built on the
//     public `registerTool` seam) needs to honour a node's declared limits.
//   - measure a node from its content (`desiredNodeSize` / `measureLabelContent`
//     / `autoSizeNode`), or build an in-node foreignObject / read its toolbar
//     config, or drive proximity-connect from the shipped `SnapController`, or
//     create SWIMLANES — `SwimlaneService`, a whole engine feature React Flow
//     does not have, was reachable only via a second `@grafloria/engine` import.
//
// All re-exports, no new API. The registries are process-wide singletons in
// @grafloria/renderer / @grafloria/engine, so registering through here is the exact
// registration the renderer's own consumers read.
// ===========================================================================

export {
  // The node figure registry (21 built-ins + custom silhouettes).
  registerShape,
  registerPathShape,
  unregisterShape,
  getShape,
  hasShape,
  listShapes,
  getShapeDefinition,
  getShapeRegistryVersion,
  onShapeRegistryChange,

  // Per-node sizing constraints — the min/max/aspect contract the resizer clamps
  // to DURING a gesture and the auto-sizer floors/ceils to.
  getNodeSizing,
  isAutoSized,
  resolveAspectRatio,
  clampSizeToConstraints,
  clampValue,

  // Content-aware auto-sizing (a node grows to fit its label + panel).
  measureLabelContent,
  desiredNodeSize,
  outerSizeForInner,
  autoSizeNode,
  autoSizeDiagram,

  // Per-node toolbar config seam + in-node HTML (foreignObject) content.
  getNodeToolbar,
  resolveToolbar,
  getHtmlContent,
  hasHtmlContent,
  buildHtmlForeignObject,

  // Proximity-connect: the shipped reference implementation, addressable at last.
  SnapController,
  DEFAULT_SNAP_CONFIG,
} from '@grafloria/renderer';

export type {
  ShapeDefinition,
  PathShapeOptions,
  PathGeometry,
  NodeSizing,
  ClampOptions,
  ContentSize,
  AutoSizeOptions,
  NodeToolbarConfig,
  HtmlNodeContent,
  HtmlContentNode,
  SnapConfig,
  ProximityCandidate,
} from '@grafloria/renderer';

// Swimlanes / pools / lanes — a whole containment model in the ENGINE that the
// package re-exported none of. React Flow has no equivalent.
export { SwimlaneService } from '@grafloria/engine';
export type { Pool, LaneSpec, CreatePoolOptions, LaneOrientation } from '@grafloria/engine';

// wave11/gallery BUG FIX — three more authoring seams were not on the embed.
//
// Writing the interaction + layout gallery surfaced three documented, unit-
// tested features of the renderer/engine that no embedder could reach through
// this package, exactly the shape wave 10 was cleaning up:
//
//   SnapController + its config/result types — the snapline / equal-spacing
//     guide engine (libs/renderer/src/interaction/snapping.ts). It is a pure
//     class a HOST constructs to draw alignment guides while dragging; the live
//     pipeline never instantiates it, and it was on NO public entry point, so
//     "helper lines" could not be built from any framework.
//
//   GroupModel + GroupCollapseService — the ONLY way to author a compound
//     (nested-container) diagram or to collapse/expand one. `render()`'s spec
//     has no group vocabulary, `DiagramModel.addGroup()` demands a GroupModel,
//     and neither the model class nor the collapse service was re-exported —
//     so nested containers and expand/collapse (both engine.layout() and the
//     collapse snapshot are real and tested) were unreachable through the embed.
// ===========================================================================
// SnapController + DEFAULT_SNAP_CONFIG are already re-exported by the node-seams block
// above (proximity-connect needs SnapController too); only the extra types are new here.
export type { SnapResult, AlignmentGuide, SpacingGuide } from '@grafloria/renderer';

export { GroupModel } from '@grafloria/engine';
export { GroupCollapseService, PROXY_NODE_GROUP_KEY, PROXY_LINK_GROUP_KEY } from '@grafloria/engine';

//   serveLayout — the worker body for OFF-THREAD layout. `engine.setLayoutPort()`
//     takes any port; an app runs the layout in a real Worker by importing this
//     package inside the worker and calling `serveLayout(self)`. It was exported
//     from @grafloria/engine and reachable by NOBODY through the embed, so the whole
//     off-thread-layout capability (progress streaming + mid-run cancellation with
//     a retained partial result) could not be wired from the public package.
export { serveLayout } from '@grafloria/engine';
export type { LayoutPort, LayoutServePort, LayoutProgress } from '@grafloria/engine';


// ===========================================================================
// DIAGRAM KIT — reusable ER / UML builders (wave16m).
//
// The diagrams/* demos proved Grafloria can draw database tables with crow's-foot
// cardinality (field-level FK→PK included) and full-vocabulary UML class
// diagrams — but every page hand-composed the HTML cards, the CSS, the
// selection overrides and the marker tables. That is a capability, not a
// feature. This kit is the feature: typed builders that emit a ready render()
// spec + one self-injected stylesheet, so an embedder writes DATA:
//
//   const spec = erDiagram({ entities, relationships });
//   render(spec, el);
//
//   const uml = umlDiagram({ classes, relationships });
//   const api = render(uml, el); uml.finalize(api);
// ===========================================================================
export {
  erDiagram,
  erRowCenterY,
  ER_ROW_H,
  ER_HEAD_H,
  umlDiagram,
  ensureDiagramKitStyles,
  DIAGRAM_KIT_STYLE_ID,
} from './lib/diagram-kit';
export type {
  ErColumn,
  ErEntitySpec,
  ErRelationshipSpec,
  ErCardinality,
  ErSide,
  ErDiagramOptions,
  UmlClassSpec,
  UmlRelationshipSpec,
  UmlRelationKind,
  UmlSide,
  UmlDiagramOptions,
} from './lib/diagram-kit';


// Side effect: define the element on import. This is what makes
// `<script type="module" src="…/grafloria.js"></script>` + `<grafloria-flow>` in the
// markup Just Work, which is the entire point of the card.
defineGrafloriaFlow();
