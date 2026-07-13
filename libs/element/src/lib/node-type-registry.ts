import type { NodeModel } from '@grafloria/engine';

/**
 * The framework-free custom-node registry behind `<grafloria-flow>` and
 * `Grafloria.registerNodeType()`.
 *
 * A "node type" is just a function that fills a host element the core handed us:
 *
 * ```ts
 * Grafloria.registerNodeType('card', (node, el) => {
 *   el.innerHTML = `<div class="card">${node.data.title}</div>`;
 * });
 * ```
 *
 * There is a second, zero-JavaScript path: a `<template data-node-type="card">`
 * slotted inside the `<grafloria-flow>` element. The template is cloned per node and
 * `[data-field="title"]` elements are filled from `node.data` — which is what
 * lets a CMS, a notebook or a plain HTML page ship a custom node with no build
 * step at all.
 */

/** Fills `element` with the visual for `node`. Called once per mounted node. */
export type NodeTypeRenderer = (node: NodeModel, element: HTMLElement) => void;

const registry = new Map<string, NodeTypeRenderer>();

/** Register (or replace) a node type globally. */
export function registerNodeType(type: string, renderer: NodeTypeRenderer): void {
  registry.set(type, renderer);
}

export function getNodeType(type: string): NodeTypeRenderer | undefined {
  return registry.get(type);
}

export function hasNodeType(type: string): boolean {
  return registry.has(type);
}

/** Drop a registration (mostly for tests). */
export function unregisterNodeType(type: string): void {
  registry.delete(type);
}

/** Every registered type name. */
export function registeredNodeTypes(): string[] {
  return [...registry.keys()];
}

/**
 * Render a node from a slotted `<template data-node-type="...">`.
 *
 * Clones the template's content into `element` and substitutes `node.data` into
 * every `[data-field="key"]` descendant's text. Values are written with
 * `textContent`, never `innerHTML`: a diagram's `data` is frequently
 * user-supplied, and a template engine that injected raw HTML here would be an
 * XSS vector in every host that embeds us.
 */
export function renderFromTemplate(
  template: HTMLTemplateElement,
  node: NodeModel,
  element: HTMLElement
): void {
  const fragment = template.content.cloneNode(true) as DocumentFragment;

  const fields = fragment.querySelectorAll<HTMLElement>('[data-field]');
  for (const field of Array.from(fields)) {
    const key = field.getAttribute('data-field');
    if (!key) continue;
    const value = key === 'id' ? node.id : (node.data as Record<string, unknown>)[key];
    field.textContent = value === undefined || value === null ? '' : String(value);
  }

  element.textContent = '';
  element.appendChild(fragment);
}
