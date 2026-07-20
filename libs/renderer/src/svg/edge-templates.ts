/**
 * edge-templates.ts — Wave 4 (Edges & links), Card 5
 *
 * The extensibility seam for edges: LINK templates, LABEL templates and custom
 * MARKERS. Before this, `LabelRenderer` could only emit SVG `<text>` and
 * `ArrowStyle.type` was a closed enum — an author who wanted an HTML badge on an
 * edge, a bespoke link body, or a half-arrowhead had to fork the renderer.
 *
 * Three registries, one shape (same as the named-style registry in
 * ../themes/style-registry.ts, deliberately):
 *
 *   registerLinkTemplate('audit-trail', ctx => …)   // link.style.template
 *   registerLabelTemplate('badge',      ctx => …)   // label.template
 *   registerMarker('feather',           { render, tipOffset })  // arrowHead.type
 *
 * WHY NAMES AND NOT FUNCTIONS ON THE MODEL: LinkStyle / LinkLabel are
 * serializable model state that lives in @grafloria/engine, and the engine must not
 * depend on the renderer's VNode type. A name survives save/load; a closure does
 * not. It also means a template can be redefined at runtime and every link using
 * it repaints — which is why renderers subscribe to `onEdgeTemplateChange` and
 * drop their VNode cache, exactly like they do for named styles.
 *
 * Framework-agnostic: VNodes only. A template that wants real HTML returns a
 * `foreignObject` VNode (see `htmlLabelVNode`); the patcher materialises its
 * children in the XHTML namespace and then treats the subtree as opaque.
 */

import type { ArrowStyle, LinkLabel, LinkModel, Point } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import type { Theme } from '../types/theme.types';
import { XHTML_NS } from '../vnode/patch';
import {
  LABEL_TEMPLATES,
  LINK_TEMPLATES,
  MARKERS,
  scopedTable,
} from '../ext/registry-scope';

// ===========================================================================
// Contexts handed to author code
// ===========================================================================

/** What a LINK template is given. Everything it needs; nothing it can corrupt. */
export interface LinkTemplateContext {
  link: LinkModel;
  /** The ROUTED polyline for this frame — not the model's stale `segments`. */
  points: Point[];
  /** The SVG path string the default renderer would have drawn (jumps included). */
  pathData: string;
  /** Resolved link styles (stroke, strokeWidth, className, …) for this state. */
  styles: Record<string, unknown>;
  theme: Theme;
  /** Current level-of-detail tier, so a template can drop detail when zoomed out. */
  lod: string;
  /** True when the link is selected — templates usually want to react to this. */
  selected: boolean;
}

/** What a LABEL template is given. */
export interface LabelTemplateContext {
  label: LinkLabel;
  link: LinkModel;
  /** World-space anchor the label resolved to (position/slot + offset + optimizer). */
  anchor: Point;
  /** Rotation in degrees the default renderer would have applied, if any. */
  rotation?: number;
  theme: Theme;
}

/** What a custom MARKER is given. */
export interface MarkerContext {
  style: ArrowStyle;
  /** Normalised size (never negative). */
  size: number;
  /** Resolved colour (the marker's own, else the link's stroke). */
  color: string;
  /** Stroke width for outlined markers. */
  width: number;
  /**
   * The SVG transform placing the marker: `translate(x, y) rotate(deg)`. The
   * marker draws in its LOCAL frame — origin at the anchor, +x along the
   * direction of travel — and MUST put this on its root element.
   */
  transform: string;
  /** Theme background — the fill for hollow markers, so they don't glare on dark. */
  backgroundColor: string;
  /** Which end this marker sits on. */
  end: 'source' | 'target';
}

export type LinkTemplate = (ctx: LinkTemplateContext) => VNode | VNode[] | null;
export type LabelTemplate = (ctx: LabelTemplateContext) => VNode | VNode[] | null;

export interface MarkerDefinition {
  render: (ctx: MarkerContext) => VNode | null;
  /**
   * Distance from the marker's local origin to its visual TIP along +x. The
   * renderer pulls the marker back from the path endpoint by exactly this, so
   * the tip lands ON the port. A triangle drawn from 0 to `size` has tipOffset
   * `size`; a dot centred on the origin has `size / 2`; a bar has 0.
   *
   * Either a constant or a function of the style (so it can scale with `size`).
   */
  tipOffset?: number | ((style: ArrowStyle) => number);
}

// ===========================================================================
// Registries
// ===========================================================================

const linkTemplates = new Map<string, LinkTemplate>();
const labelTemplates = new Map<string, LabelTemplate>();
const markers = new Map<string, MarkerDefinition>();
const listeners = new Set<() => void>();
let version = 0;

function bump(): void {
  version++;
  listeners.forEach(listener => listener());
}

export function registerLinkTemplate(name: string, template: LinkTemplate): void {
  linkTemplates.set(name, template);
  bump();
}

export function getLinkTemplate(name: string): LinkTemplate | undefined {
  // DIAGRAM-FIRST, then process-global — see `ext/registry-scope.ts`.
  return scopedTable<LinkTemplate>(LINK_TEMPLATES)?.get(name) ?? linkTemplates.get(name);
}

export function registerLabelTemplate(name: string, template: LabelTemplate): void {
  labelTemplates.set(name, template);
  bump();
}

export function getLabelTemplate(name: string): LabelTemplate | undefined {
  return scopedTable<LabelTemplate>(LABEL_TEMPLATES)?.get(name) ?? labelTemplates.get(name);
}

export function registerMarker(name: string, definition: MarkerDefinition): void {
  markers.set(name, definition);
  bump();
}

export function getMarker(name: string): MarkerDefinition | undefined {
  return scopedTable<MarkerDefinition>(MARKERS)?.get(name) ?? markers.get(name);
}

export function hasMarker(name: string): boolean {
  return scopedTable<MarkerDefinition>(MARKERS)?.has(name) === true || markers.has(name);
}

/** Resolve a registered marker's tip offset for a concrete style. */
export function markerTipOffset(definition: MarkerDefinition, style: ArrowStyle): number {
  const tip = definition.tipOffset;
  if (typeof tip === 'function') return tip(style);
  return typeof tip === 'number' ? tip : 0;
}

export function listLinkTemplates(): string[] {
  return union(linkTemplates, scopedTable<LinkTemplate>(LINK_TEMPLATES));
}

export function listLabelTemplates(): string[] {
  return union(labelTemplates, scopedTable<LabelTemplate>(LABEL_TEMPLATES));
}

export function listMarkers(): string[] {
  return union(markers, scopedTable<MarkerDefinition>(MARKERS));
}

/** Global names plus this diagram's own, global order first, no duplicates. */
function union(global: Map<string, unknown>, scoped: Map<string, unknown> | undefined): string[] {
  if (!scoped || scoped.size === 0) return Array.from(global.keys());
  return [...new Set([...global.keys(), ...scoped.keys()])];
}

// ---------------------------------------------------------------------------
// Wave 6 — Card 0: per-name removal.
//
// `clearEdgeTemplates()` was all-or-nothing, which is useless as an extension
// disposer: tearing down ONE extension would have wiped every OTHER extension's
// templates too. These remove exactly one registration, which is what the
// ExtensionHost's `links.registerTemplate()` disposer needs.
// ---------------------------------------------------------------------------

/** Remove one link template. Returns false when it was not registered. */
export function unregisterLinkTemplate(name: string): boolean {
  const existed = linkTemplates.delete(name);
  if (existed) bump();
  return existed;
}

/** Remove one label template. Returns false when it was not registered. */
export function unregisterLabelTemplate(name: string): boolean {
  const existed = labelTemplates.delete(name);
  if (existed) bump();
  return existed;
}

/** Remove one marker. Returns false when it was not registered. */
export function unregisterMarker(name: string): boolean {
  const existed = markers.delete(name);
  if (existed) bump();
  return existed;
}

/** Drop every registration (tests, hosts tearing a document down). */
export function clearEdgeTemplates(): void {
  if (linkTemplates.size === 0 && labelTemplates.size === 0 && markers.size === 0) return;
  linkTemplates.clear();
  labelTemplates.clear();
  markers.clear();
  bump();
}


/**
 * Internal: let a PER-DIAGRAM registry participate in the version/notify
 * protocol. A scoped registration must invalidate cached VNodes for exactly the
 * reason a global one must — the definition is baked into the cache. Notifying
 * every renderer (not just the contributing one) is deliberate: over-invalidation
 * costs a repaint, under-invalidation shows a stale picture.
 */
export function notifyEdgeTemplatesChanged(): void {
  bump();
}

/** Bumped on every mutation — renderers key cache invalidation off this. */
export function getEdgeTemplateVersion(): number {
  return version;
}

/**
 * Subscribe to registry changes. Renderers use this to drop cached link VNodes
 * when a template is (re)defined — the template's OUTPUT is baked into the
 * cached VNode, so a redefinition that did not invalidate would never show up.
 */
export function onEdgeTemplateChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ===========================================================================
// HTML helper — the foreignObject seam, reused for edges
// ===========================================================================

export interface HtmlLabelOptions {
  /** Stable id: becomes part of the VNode key. */
  id: string;
  /** Raw HTML. Injected verbatim via `innerHTML` — the author owns its safety. */
  html: string;
  /** Centre of the label box in world coordinates. */
  anchor: Point;
  width: number;
  height: number;
  /** Extra class on the XHTML wrapper div. */
  className?: string;
}

/**
 * A `foreignObject` VNode carrying arbitrary HTML, positioned so `anchor` is its
 * CENTRE (labels are centred on the path, unlike nodes which are top-left).
 *
 * THE KEY CARRIES A CONTENT HASH, and that is load-bearing. The VNode patcher
 * treats `foreignObject` subtrees as OPAQUE: it patches their props but NEVER
 * diffs into their children, so that whatever a framework mounted inside stays
 * alive. That is exactly right for host-mounted content — and exactly wrong for
 * content we own, because an edited label would keep rendering its old HTML
 * forever. Folding the content into the key means changed HTML is a DIFFERENT
 * VNode identity, which the patcher replaces wholesale. Unchanged HTML keeps the
 * same key and the same live DOM.
 */
export function htmlLabelVNode(options: HtmlLabelOptions): VNode {
  const { id, html, anchor, width, height, className } = options;

  return {
    type: 'foreignObject',
    key: `link-label-html-${id}-${hashString(html)}`,
    props: {
      x: anchor.x - width / 2,
      y: anchor.y - height / 2,
      width,
      height,
      className: 'link-label-foreign',
      // foreignObject has no fill/stroke of its own; overflow must be visible or
      // a label that outgrows its box is silently clipped.
      style: { overflow: 'visible' },
    },
    children: [
      {
        type: 'div',
        props: {
          xmlns: XHTML_NS,
          className: className ? `link-label-html ${className}` : 'link-label-html',
          innerHTML: html,
          style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          },
        },
        children: [],
      },
    ],
  };
}

/** FNV-1a — small, fast, stable across runs. Only used to key VNodes. */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
