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

// Side effect: define the element on import. This is what makes
// `<script type="module" src="…/grafloria.js"></script>` + `<grafloria-flow>` in the
// markup Just Work, which is the entire point of the card.
defineGrafloriaFlow();
