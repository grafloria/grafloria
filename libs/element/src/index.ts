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
} from '@grafloria/renderer';

// Side effect: define the element on import. This is what makes
// `<script type="module" src="…/grafloria.js"></script>` + `<grafloria-flow>` in the
// markup Just Work, which is the entire point of the card.
defineGrafloriaFlow();
