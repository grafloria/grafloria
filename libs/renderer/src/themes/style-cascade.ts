// THE style cascade — one ordered spread, one application model.
//
// Styling & theming — Card "Named style classes (classDef / linkStyle equivalent)".
//
// ┌─ CASCADE (lowest → highest) ────────────────────────────────────────────┐
// │  1. theme          theme.colors.node.default / theme.nodes.default      │
// │  2. type-default   theme.nodes[node.type] / theme.links[link type]      │
// │  3. named-class    style.styleClass → style-registry (classDef)         │
// │  4. element-inline node.style / link.style (the entity's own props)     │
// │  5. state          selected > highlighted > hovered > disabled > error   │
// └─────────────────────────────────────────────────────────────────────────┘
// It is a literal ordered spread below — precedence is the reading order, and
// every layer is a plain object, so the whole thing is unit-testable.
//
// APPLICATION MODEL — **inline-resolved** (decided; the alternative is noted):
//
//   Layer 1 (theme) is left to the STYLESHEET in CSS mode: the shared rules
//   (`[data-grafloria-instance] .diagram-node { fill: var(--grafloria-node-fill) }`)
//   paint it. So a property that NO layer above the theme sets emits nothing,
//   and still falls back to the theme — which is what lets a theme swap repaint
//   untouched elements without re-resolving them.
//
//   Layers 2–5 are resolved HERE and emitted on the element (inline style /
//   presentation attributes). Inline beats any stylesheet rule, so the winner of
//   the spread is the winner on screen — including `state`, which therefore
//   beats element-inline, exactly as documented. (The `.diagram-node.selected`
//   rules stay in the stylesheet as the fallback for elements the renderer does
//   not resolve, e.g. HTML-layer nodes styled by the host.)
//
//   THE ALTERNATIVE we did not take: emit each named class as a real CSS class
//   (`.grafloria-style-critical`) at lower specificity than the state rules. That
//   gets `state > named-class` for free from CSS, but it cannot express
//   `state > element-inline` (an inline style always beats a stylesheet rule,
//   and the previous card deliberately made element-inline overrides INLINE so
//   they'd beat the theme). It also means every runtime `defineStyle()` has to
//   patch a live stylesheet. One ordered spread expresses the whole cascade in
//   one place instead of splitting it across CSS specificity and source order.
//
// In programmatic (Canvas) mode there is no stylesheet at all, so layer 1 joins
// the same spread (`includeThemeBase`), and the SAME precedence applies.

import type { LinkModel, LinkStyle, NodeModel, NodeStyle } from '@grafloria/engine';
import type { Theme } from '../types/theme.types';
import { resolveStyleClasses } from './style-registry';

/** The documented cascade, lowest → highest. Exported for docs/tests. */
export const CASCADE_ORDER = [
  'theme',
  'type-default',
  'named-class',
  'element-inline',
  'state',
] as const;
export type CascadeLayer = (typeof CASCADE_ORDER)[number];

export interface CascadeOptions {
  /**
   * Include the theme base as layer 1. Programmatic/Canvas mode must (there is
   * no stylesheet); CSS mode must NOT (the stylesheet paints it, and inlining
   * it would defeat the theme fallback and the CSS-variable scoping).
   */
  includeThemeBase?: boolean;
}

/** Style keys that address the registry/DOM rather than a paint value. */
const META_KEYS = new Set(['className', 'styleClass']);

/** Drop `undefined` values (they must not clobber a lower layer) and meta keys. */
function declared<T extends object>(style: T | undefined): Partial<T> {
  if (!style) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || META_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function nodeThemeBase(theme: Theme): Partial<NodeStyle> {
  return {
    fill: theme.colors.node.default.fill,
    stroke: theme.colors.node.default.stroke,
    strokeWidth: theme.nodes.default.strokeWidth,
    borderRadius: theme.nodes.default.borderRadius,
    opacity: theme.nodes.default.opacity,
  };
}

/**
 * `theme.nodes[type]` — the per-type defaults the Theme type has always allowed
 * (and nothing ever read). `default` is the base layer, not a type override.
 */
function nodeTypeDefaults(theme: Theme, type: string | undefined): Partial<NodeStyle> {
  if (!type || type === 'default') return {};
  return declared(theme.nodes[type] as Partial<NodeStyle> | undefined);
}

/** State layer: exclusive, highest precedence first. Mirrors the stylesheet's state rules. */
function nodeStateStyle(node: NodeModel, theme: Theme): Partial<NodeStyle> {
  const c = theme.colors.node;
  const state = node.state;

  if (state.selected) {
    return { fill: c.selected.fill, stroke: c.selected.stroke, strokeWidth: 2 };
  }
  if (state.highlighted) {
    return { fill: c.highlighted.fill, stroke: c.highlighted.stroke, strokeWidth: 2 };
  }
  if (state.hovered) {
    return { fill: c.hovered.fill, stroke: c.hovered.stroke };
  }
  if (!state.enabled) {
    return {
      fill: c.disabled.fill,
      stroke: c.disabled.stroke,
      opacity: theme.effects.opacity.disabled,
    };
  }
  if (state.error) {
    return { fill: c.error.fill, stroke: c.error.stroke };
  }
  return {};
}

/**
 * LEGACY `metadata.shape` PAINTS — part of the element-inline layer.
 *
 * `node.setMetadata('shape', { type: 'ellipse', fill, stroke, strokeWidth, opacity })`
 * predates `NodeStyle` and is still how the shape TYPE and corner radius are
 * configured, so its paint fields are widely used.
 *
 * THE BUG THIS FIXES: the renderer used to apply these paints in
 * `renderNodeShape()` — i.e. AFTER the cascade had already resolved, spread on
 * top of the finished object. That put them above EVERY layer, `state` included.
 * A selected node whose shape config carried a fill therefore never showed its
 * selection colour, and neither did a hovered, disabled or errored one: the shape
 * config silently outranked the entire documented cascade.
 *
 * They belong HERE, inside element-inline, where `state` still beats them — and
 * where an explicit `node.setStyle({ fill })` (the typed, documented API) beats
 * an untyped legacy metadata bag, which is the other way round from how it used
 * to be, and the way round a caller would expect.
 */
function shapeMetadataStyle(node: NodeModel): Partial<NodeStyle> {
  const shape = node.getMetadata?.('shape') as Record<string, unknown> | undefined;
  if (!shape) return {};
  return declared({
    fill: shape['fill'],
    stroke: shape['stroke'],
    strokeWidth: shape['strokeWidth'],
    opacity: shape['opacity'],
  } as Partial<NodeStyle>);
}

/** Resolve a node's effective style. ONE ordered spread — see the header. */
export function resolveNodeStyle(
  node: NodeModel,
  theme: Theme,
  options: CascadeOptions = {}
): Partial<NodeStyle> {
  return {
    ...(options.includeThemeBase ? nodeThemeBase(theme) : undefined),
    ...nodeTypeDefaults(theme, node.type),
    ...resolveStyleClasses<NodeStyle>(node.style?.styleClass),
    // element-inline: the entity's own props, from BOTH places they can live.
    // The typed `node.style` wins over the legacy `metadata.shape` paints.
    ...shapeMetadataStyle(node),
    ...declared(node.style),
    ...nodeStateStyle(node, theme),
  };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

function linkThemeBase(theme: Theme): Partial<LinkStyle> {
  return declared({
    stroke: theme.links.default.stroke,
    strokeWidth: theme.links.default.strokeWidth,
    strokeDasharray: theme.links.default.strokeDasharray,
    opacity: theme.links.default.opacity,
  });
}

/**
 * A link's "type" for `theme.links[type]`: an explicit `type` metadata key when
 * the host sets one, else the path type (`smooth` / `orthogonal` / …), which is
 * the structural analogue of React Flow's `edge.type`.
 */
export function linkTypeKey(link: LinkModel): string {
  return (link.getMetadata?.('type') as string | undefined) ?? link.pathType;
}

function linkTypeDefaults(theme: Theme, link: LinkModel): Partial<LinkStyle> {
  const type = linkTypeKey(link);
  if (!type || type === 'default') return {};
  return declared(theme.links[type] as Partial<LinkStyle> | undefined);
}

/** State layer. LinkModel.state is exclusive, so order here just mirrors the stylesheet. */
function linkStateStyle(link: LinkModel, theme: Theme): Partial<LinkStyle> {
  const c = theme.colors.link;

  if (link.state === 'selected') return { stroke: c.selected, strokeWidth: 3 };
  if (link.state === 'highlighted') return { stroke: c.highlighted, strokeWidth: 3 };
  if (link.state === 'hovered') return { stroke: c.hovered };
  return {};
}

/** Resolve a link's effective style. ONE ordered spread — see the header. */
export function resolveLinkStyle(
  link: LinkModel,
  theme: Theme,
  options: CascadeOptions = {}
): Partial<LinkStyle> {
  return {
    ...(options.includeThemeBase ? linkThemeBase(theme) : undefined),
    ...linkTypeDefaults(theme, link),
    ...resolveStyleClasses<LinkStyle>(link.style?.styleClass),
    ...declared(link.style),
    ...linkStateStyle(link, theme),
  };
}
