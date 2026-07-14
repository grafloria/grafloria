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

// Side effect: define the element on import. This is what makes
// `<script type="module" src="…/grafloria.js"></script>` + `<grafloria-flow>` in the
// markup Just Work, which is the entire point of the card.
defineGrafloriaFlow();
