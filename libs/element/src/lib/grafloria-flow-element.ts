import { createDiagram, DARK_THEME, LIGHT_THEME } from '@grafloria/renderer';
import type {
  CreateDiagramOptions,
  DiagramInstance,
  EdgeSpec,
  NodeSpec,
  Theme,
} from '@grafloria/renderer';
import { getNodeType, renderFromTemplate } from './node-type-registry';

/**
 * `<grafloria-flow>` — the universal embed.
 *
 * React Flow serves React. ngx-vflow serves Angular. Each is a wall around one
 * framework. A custom element has no wall: Vue, Svelte, Solid, Lit, Alpine,
 * plain HTML, a CMS block, a Jupyter/Observable cell and a static site all speak
 * "HTML element with attributes and events". This is the piece that lets Grafloria
 * reach the long tail those libraries cannot.
 *
 * ```html
 * <grafloria-flow theme="dark" fit-view
 *             nodes='[{"id":"a","position":{"x":0,"y":0},"label":"A"}]'
 *             edges='[{"source":"a","target":"b"}]'>
 *   <template data-node-type="card">
 *     <div class="card"><h4 data-field="title"></h4></div>
 *   </template>
 * </grafloria-flow>
 *
 * <script>
 *   document.querySelector('grafloria-flow')
 *     .addEventListener('grafloria-connect', e => console.log(e.detail.link));
 * </script>
 * ```
 *
 * Rich data goes in as PROPERTIES (`el.nodes = [...]`) and simple data as
 * ATTRIBUTES (JSON strings) — the standard custom-element contract that every
 * framework's template binding already targets:
 * `:nodes` in Vue, `nodes={...}` in Svelte/Solid, `[attr.nodes]` in Angular.
 *
 * Everything it does is delegation. There is no diagram logic in this file.
 */

const THEMES: Record<string, Theme> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
};

/** Events emitted on the element. All bubble and cross shadow boundaries. */
export const GRAFLORIA_EVENTS = {
  ready: 'grafloria-ready',
  nodesChange: 'grafloria-nodes-change',
  edgesChange: 'grafloria-edges-change',
  selectionChange: 'grafloria-selection-change',
  connect: 'grafloria-connect',
  nodeClick: 'grafloria-node-click',
  edgeClick: 'grafloria-edge-click',
  viewportChange: 'grafloria-viewport-change',
} as const;

export class GrafloriaFlowElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      'nodes',
      'edges',
      'theme',
      'fit-view',
      'readonly',
      'zoom',
      'min-zoom',
      'max-zoom',
      'pan',
      'wheel-zoom',
    ];
  }

  private instance: DiagramInstance | null = null;
  private canvas: HTMLDivElement | null = null;

  private _nodes: NodeSpec[] = [];
  private _edges: EdgeSpec[] = [];
  private connected = false;

  // -- properties (the rich path) ---------------------------------------------

  get nodes(): NodeSpec[] {
    return this._nodes;
  }
  set nodes(value: NodeSpec[]) {
    this._nodes = value ?? [];
    this.instance?.setNodes(this._nodes);
  }

  get edges(): EdgeSpec[] {
    return this._edges;
  }
  set edges(value: EdgeSpec[]) {
    this._edges = value ?? [];
    this.instance?.setEdges(this._edges);
  }

  /** The headless instance — the escape hatch to everything else. */
  get diagram(): DiagramInstance | null {
    return this.instance;
  }

  // -- lifecycle ---------------------------------------------------------------

  connectedCallback(): void {
    if (this.connected) return;
    this.connected = true;

    // Attributes may have been parsed before we upgraded.
    this.readAttributeModel();

    // Light DOM, not shadow DOM: the diagram's stylesheet is injected into
    // <head> and its CSS variables cascade — a shadow root would cut both off,
    // and hosts routinely want to style nodes from their own stylesheet.
    this.canvas = document.createElement('div');
    this.canvas.className = 'grafloria-flow-canvas';
    this.canvas.setAttribute('style', 'position:relative;width:100%;height:100%');
    this.appendChild(this.canvas);

    if (!this.style.display) this.style.display = 'block';

    this.instance = createDiagram(this.canvas, this.buildOptions());
    this.wireEvents(this.instance);
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.instance?.dispose();
    this.instance = null;
    this.canvas?.remove();
    this.canvas = null;
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (previous === next) return;

    switch (name) {
      case 'nodes':
        this._nodes = parseJsonAttribute<NodeSpec[]>(next, []);
        this.instance?.setNodes(this._nodes);
        return;
      case 'edges':
        this._edges = parseJsonAttribute<EdgeSpec[]>(next, []);
        this.instance?.setEdges(this._edges);
        return;
      case 'theme':
        if (this.instance) this.instance.setTheme(this.resolveTheme());
        return;
      case 'fit-view':
        if (this.instance && next !== null) this.instance.fitView();
        return;
      case 'zoom':
        if (this.instance && next !== null) this.instance.viewport.setZoom(Number(next));
        return;
      default:
        // pan / wheel-zoom / readonly / min-zoom / max-zoom are read at mount:
        // they configure the event binder, which is created once. Changing them
        // afterwards is rare enough that we do not tear the instance down.
        return;
    }
  }

  // -- API ---------------------------------------------------------------------

  fitView(padding?: number): void {
    this.instance?.fitView(padding);
  }

  // -- internals ---------------------------------------------------------------

  private buildOptions(): CreateDiagramOptions {
    return {
      nodes: this._nodes,
      edges: this._edges,
      theme: this.resolveTheme(),
      fitView: this.hasAttribute('fit-view'),
      readonly: this.hasAttribute('readonly'),
      enablePan: this.getAttribute('pan') !== 'false',
      enableZoom: this.getAttribute('wheel-zoom') !== 'false',
      zoom: this.hasAttribute('zoom') ? Number(this.getAttribute('zoom')) : undefined,
      minZoom: this.hasAttribute('min-zoom')
        ? Number(this.getAttribute('min-zoom'))
        : undefined,
      maxZoom: this.hasAttribute('max-zoom')
        ? Number(this.getAttribute('max-zoom'))
        : undefined,
      renderCustomNode: (node, element) => this.renderCustomNode(node, element),
    };
  }

  /**
   * Custom nodes, two ways and no framework: a registered renderer
   * (`Grafloria.registerNodeType`), or a slotted `<template data-node-type="…">`.
   */
  private renderCustomNode(
    node: Parameters<NonNullable<CreateDiagramOptions['renderCustomNode']>>[0],
    element: HTMLElement
  ): void {
    const renderer = getNodeType(node.type);
    if (renderer) {
      renderer(node, element);
      return;
    }

    const template = this.querySelector<HTMLTemplateElement>(
      `template[data-node-type="${cssEscape(node.type)}"]`
    );
    if (template) {
      renderFromTemplate(template, node, element);
      return;
    }

    // Nothing registered: leave the host empty rather than throwing inside a
    // render. The node still exists, is selectable and is draggable.
  }

  private resolveTheme(): Theme {
    return THEMES[this.getAttribute('theme') ?? 'light'] ?? LIGHT_THEME;
  }

  private readAttributeModel(): void {
    if (this._nodes.length === 0 && this.hasAttribute('nodes')) {
      this._nodes = parseJsonAttribute<NodeSpec[]>(this.getAttribute('nodes'), []);
    }
    if (this._edges.length === 0 && this.hasAttribute('edges')) {
      this._edges = parseJsonAttribute<EdgeSpec[]>(this.getAttribute('edges'), []);
    }
  }

  /** Instance events → DOM CustomEvents. `composed` so they escape a shadow root. */
  private wireEvents(instance: DiagramInstance): void {
    const forward = (type: string, detail: unknown) => {
      this.dispatchEvent(
        new CustomEvent(type, { detail, bubbles: true, composed: true })
      );
    };

    instance.on('ready', () => forward(GRAFLORIA_EVENTS.ready, { diagram: instance }));
    instance.on('nodes:change', (payload) => forward(GRAFLORIA_EVENTS.nodesChange, payload));
    instance.on('edges:change', (payload) => forward(GRAFLORIA_EVENTS.edgesChange, payload));
    instance.on('selection:change', (payload) =>
      forward(GRAFLORIA_EVENTS.selectionChange, payload)
    );
    instance.on('connect', (payload) => forward(GRAFLORIA_EVENTS.connect, payload));
    instance.on('node:click', (payload) => forward(GRAFLORIA_EVENTS.nodeClick, payload));
    instance.on('edge:click', (payload) => forward(GRAFLORIA_EVENTS.edgeClick, payload));
    instance.on('viewport:change', (payload) =>
      forward(GRAFLORIA_EVENTS.viewportChange, payload)
    );
  }
}

/** JSON attribute → value. A malformed attribute must not take the page down. */
function parseJsonAttribute<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('[grafloria-flow] ignoring malformed JSON attribute:', raw);
    return fallback;
  }
}

/** Minimal CSS.escape for the attribute selector (jsdom/older browsers lack it). */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/**
 * Register the element. Idempotent, and safe to call on the server (where
 * `customElements` does not exist) — which is what lets a bundle be imported
 * from an SSR entry point without a `typeof window` dance at every call site.
 */
export function defineGrafloriaFlow(tagName = 'grafloria-flow'): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tagName)) return;
  customElements.define(tagName, GrafloriaFlowElement);
}
