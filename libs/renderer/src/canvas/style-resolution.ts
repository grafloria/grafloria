// style-resolution.ts — THE CSS-vs-Canvas seam.
//
// THE PROBLEM
// -----------
// In CSS mode a diagram's paint comes from THREE places, and the browser's CSS
// engine merges them for us:
//
//   1. presentation attributes on the element   (`<rect fill="#eee">`)
//   2. the renderer's stylesheet                (`.diagram-node { fill: var(--grafloria-node-fill) }`)
//      whose values are per-instance CSS custom properties carrying the theme
//   3. the element's inline style               (`style="fill: red"`), which the
//      renderer deliberately uses for the resolved cascade because it beats (2)
//
// Canvas has NO CSS engine. `ctx.fillStyle` needs a concrete colour. A node body
// in CSS mode carries NO fill at all — just `class="diagram-node"` — so a canvas
// backend that only read `props.fill` would paint every node black or not at all.
// That is the entire "canvas mode looks different from SVG mode" bug class.
//
// THE FIX — REUSE the export card's flattener, do not re-derive the cascade
// ------------------------------------------------------------------------
// `export/style-flattener.ts` already solved the hard, dangerous half of this for
// the headless SVG exporter: match an element's class list against the renderer's
// own `BASE_STYLE_RULES`, order by (specificity, source order) exactly as a
// browser does, and substitute every `var(--grafloria-*)` from `resolveThemeVars`.
//
// This module IMPORTS that resolver (`createClassStyleResolver`) rather than
// shipping a second copy. If Canvas and Export disagreed about what
// `.diagram-node.selected` resolves to, then the picture on screen, the picture
// in the exported file, and the picture on the hit canvas would all drift apart —
// three renderings of one diagram, three different answers. One cascade, three
// consumers.
//
// What this module adds ON TOP, because a raster backend needs it and a
// serializer does not:
//   - the full CSS PRIORITY ORDER (presentation attrs < class rules < inline
//     style) applied to a live element,
//   - INHERITANCE down the group chain (fill/stroke/font inherit in SVG; filter
//     and clip-path do not), and group-opacity compositing,
//   - TYPED parsing: `"2px"` → 2, `"5,5"` → [5,5], `text-anchor` → `textAlign`,
//     `dominant-baseline` → `textBaseline`, a canvas `font` shorthand.
//
// KNOWN AND DOCUMENTED LIMIT: host-authored CSS *rules* (`.diagram-node { fill:
// red }` in the app's own stylesheet, or `:hover` selectors) are invisible to
// Canvas — there is no cascade to consult. CSS custom-property overrides ARE
// honoured (see `readCssVarOverrides`), and they are the supported theming seam
// for canvas mode; arbitrary CSS rules remain an SVG-mode-only capability.

import type { Theme } from '../types/theme.types';
import type { VNodeProps } from '../types/vnode.types';
import { createClassStyleResolver, type ClassStyleResolver } from '../export/style-flattener';
import { THEME_TOKENS, THEME_VARS } from '../themes/theme-vars';

/** Everything the painter needs to know to draw one element. */
export interface ComputedStyle {
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  strokeDasharray?: number[];
  /** Element opacity, already multiplied down the group chain. */
  opacity: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textAnchor: 'start' | 'middle' | 'end';
  dominantBaseline: string;
  /** `display: none` / `visibility: hidden` → not painted at all. */
  visible: boolean;
  /** CSS filter string (e.g. `blur(4px)`), passed through when supported. */
  filter?: string;
  /** `clip-path: url(#id)` → the referenced clip id. */
  clipPathId?: string;
}

/** Style values that INHERIT from a parent element in SVG. */
export const INHERITED_DEFAULTS: ComputedStyle = {
  fill: '#000000',
  stroke: undefined,
  strokeWidth: 1,
  opacity: 1,
  fontFamily: 'sans-serif',
  fontSize: 12,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAnchor: 'start',
  dominantBaseline: 'auto',
  visible: true,
};

// ---------------------------------------------------------------------------
// CSS value plumbing
// ---------------------------------------------------------------------------

/** `"2px"` / `2` / `"2"` → 2. Returns `undefined` for anything unparseable. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const n = parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
}

/** `"5,5"` / `"5 5"` / `[5,5]` → `[5, 5]`. `"none"` → `[]`. */
export function parseDashArray(value: unknown): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n));
  const s = String(value).trim();
  if (!s || s === 'none') return [];
  const parts = s
    .split(/[\s,]+/)
    .map((v) => parseFloat(v))
    .filter((v) => Number.isFinite(v));
  return parts.length > 0 ? parts : undefined;
}

/**
 * Parse an inline `style` — the renderer emits BOTH forms: a CSS string
 * (`"fill: red; stroke-width: 2"`, from the shape registry and the link style
 * computation) and an object (`{ cursor: 'move' }`, from the interaction
 * overlays). Both are normalised to kebab-case CSS declarations here.
 */
export function parseInlineStyle(style: unknown): Record<string, string> {
  if (!style) return {};

  if (typeof style === 'string') {
    const out: Record<string, string> = {};
    for (const decl of style.split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (prop) out[prop] = value;
    }
    return out;
  }

  if (typeof style === 'object') {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      out[camelToKebab(key)] = String(value);
    }
    return out;
  }

  return {};
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** The class tokens on an element (`className` prop, space separated). */
export function classListOf(props: VNodeProps | undefined): string[] {
  const raw = props?.['className'];
  if (!raw || typeof raw !== 'string') return [];
  return raw.trim().split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

export interface StyleResolverOptions {
  theme: Theme;
  /**
   * CSS custom-property overrides — normally read off the diagram's host element
   * with {@link readCssVarOverrides}, so a host that redefines `--grafloria-*` in its
   * own stylesheet gets the same paint on canvas as it does on SVG.
   */
  varOverrides?: Record<string, string>;
}

/**
 * Resolves VNode props → concrete paint values, reproducing the SVG cascade.
 * The CLASS-RULE layer is the export card's flattener; this adds priority order,
 * inheritance and typed parsing on top.
 */
export class CanvasStyleResolver {
  private theme: Theme;
  private classRules: ClassStyleResolver;
  /** Declarations dropped because a variable could not be resolved. */
  readonly warnings: string[] = [];

  constructor(options: StyleResolverOptions) {
    this.theme = options.theme;
    this.classRules = this.compile(options.theme, options.varOverrides);
  }

  /**
   * Build the class-rule resolver for a theme.
   *
   * `createClassStyleResolver` bakes `resolveThemeVars(theme)` in, so the honest
   * way to honour a host's `--grafloria-*` OVERRIDES is to hand it a theme that reads
   * back the overridden values — rather than forking the flattener, or
   * post-processing its output (which could not tell a colour that came from an
   * overridden token apart from an identical colour that did not).
   */
  private compile(theme: Theme, overrides?: Record<string, string>): ClassStyleResolver {
    const effective =
      overrides && Object.keys(overrides).length > 0
        ? applyVarOverridesToTheme(theme, overrides)
        : theme;

    this.warnings.length = 0;
    return createClassStyleResolver(effective, this.warnings);
  }

  setTheme(theme: Theme, varOverrides?: Record<string, string>): void {
    this.theme = theme;
    this.classRules = this.compile(theme, varOverrides);
  }

  getTheme(): Theme {
    return this.theme;
  }

  /** The root style every diagram starts from (theme font, no paint inherited). */
  rootStyle(): ComputedStyle {
    return {
      ...INHERITED_DEFAULTS,
      fontFamily: String(this.theme.typography.fontFamily.default),
      fontSize: Number(this.theme.typography.fontSize.md) || INHERITED_DEFAULTS.fontSize,
    };
  }

  /**
   * Compute an element's style: inherit from the parent, then apply
   * presentation attributes < matched class rules < inline style.
   */
  resolve(props: VNodeProps | undefined, inherited: ComputedStyle): ComputedStyle {
    const style: ComputedStyle = { ...inherited };

    // `opacity` composites down the tree (a group at 0.5 halves its children), so
    // it is multiplied rather than overwritten. Non-inherited by CSS: a child does
    // not keep its parent's filter or clip.
    style.filter = undefined;
    style.clipPathId = undefined;

    if (!props) return style;

    // ---- 1. presentation attributes (lowest priority) ----------------------
    const decls: Record<string, string> = {};
    collectPresentationAttrs(props, decls);

    // ---- 2. the renderer's stylesheet — THE SHARED CASCADE ------------------
    const classes = classListOf(props);
    if (classes.length > 0) {
      Object.assign(decls, this.classRules(classes));
    }

    // ---- 3. inline style (highest priority) --------------------------------
    Object.assign(decls, parseInlineStyle(props['style']));

    applyDecls(decls, style);
    return style;
  }
}

/** Apply a resolved declaration bag onto a typed style. */
function applyDecls(decls: Record<string, string>, style: ComputedStyle): void {
  for (const [prop, rawValue] of Object.entries(decls)) {
    const value = String(rawValue).trim();
    if (value === '' || value === 'inherit') continue;

    switch (prop) {
      case 'fill':
        style.fill = value === 'none' ? undefined : value;
        break;
      case 'stroke':
        style.stroke = value === 'none' ? undefined : value;
        break;
      case 'stroke-width': {
        const n = toNumber(value);
        if (n !== undefined) style.strokeWidth = n;
        break;
      }
      case 'stroke-dasharray':
        style.strokeDasharray = parseDashArray(value);
        break;
      case 'opacity': {
        const n = toNumber(value);
        // Element opacity multiplies whatever the parent chain already applied.
        if (n !== undefined) style.opacity *= n;
        break;
      }
      case 'fill-opacity': {
        const n = toNumber(value);
        if (n !== undefined) style.fillOpacity = n;
        break;
      }
      case 'stroke-opacity': {
        const n = toNumber(value);
        if (n !== undefined) style.strokeOpacity = n;
        break;
      }
      case 'font-family':
        style.fontFamily = value;
        break;
      case 'font-size': {
        const n = toNumber(value);
        if (n !== undefined) style.fontSize = n;
        break;
      }
      case 'font-weight':
        style.fontWeight = value;
        break;
      case 'font-style':
        style.fontStyle = value;
        break;
      case 'text-anchor':
        if (value === 'start' || value === 'middle' || value === 'end') style.textAnchor = value;
        break;
      case 'dominant-baseline':
      case 'alignment-baseline':
        style.dominantBaseline = value;
        break;
      case 'display':
        if (value === 'none') style.visible = false;
        break;
      case 'visibility':
        if (value === 'hidden' || value === 'collapse') style.visible = false;
        break;
      case 'filter':
        if (value !== 'none') style.filter = value;
        break;
      case 'clip-path': {
        const m = /url\(\s*#([^)\s]+)\s*\)/.exec(value);
        if (m) style.clipPathId = m[1];
        break;
      }
      default:
        break; // cursor, pointer-events, transition … mean nothing to a raster
    }
  }
}

/**
 * VNode props that are SVG PRESENTATION ATTRIBUTES, in CSS-property form.
 *
 * Everything else on `props` is geometry (`x`, `d`, `points`), identity (`key`,
 * `data-*`), or DOM plumbing (`onClick`) and is not paint.
 */
const PRESENTATION_PROPS: Record<string, string> = {
  fill: 'fill',
  stroke: 'stroke',
  strokeWidth: 'stroke-width',
  strokeDasharray: 'stroke-dasharray',
  opacity: 'opacity',
  fillOpacity: 'fill-opacity',
  strokeOpacity: 'stroke-opacity',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  textAnchor: 'text-anchor',
  dominantBaseline: 'dominant-baseline',
  alignmentBaseline: 'alignment-baseline',
  display: 'display',
  visibility: 'visibility',
  filter: 'filter',
  clipPath: 'clip-path',
};

function collectPresentationAttrs(props: VNodeProps, out: Record<string, string>): void {
  for (const [key, cssProp] of Object.entries(PRESENTATION_PROPS)) {
    const value = props[key];
    if (value === undefined || value === null || typeof value === 'function') continue;
    out[cssProp] = String(value);
  }
}

/**
 * A theme whose `--grafloria-*` values carry the host's overrides.
 *
 * The flattener resolves variables through `resolveThemeVars(theme)`, so the
 * honest way to inject a host override is to give it a theme that already reads
 * back the overridden value. Only the tokens the host actually overrode are
 * touched; everything else is the theme's own value.
 */
function applyVarOverridesToTheme(theme: Theme, overrides: Record<string, string>): Theme {
  const patched = structuredCloneish(theme);

  for (const token of THEME_TOKENS) {
    const binding = THEME_VARS[token];
    const override = overrides[binding.cssVar];
    if (override === undefined) continue;
    writeToken(patched, token, override);
  }

  return patched;
}

/** Where each theme token is READ from — the inverse of THEME_VARS[token].read. */
const TOKEN_WRITERS: Partial<Record<string, (t: any, v: string) => void>> = {
  'node.fill': (t, v) => (t.colors.node.default.fill = v),
  'node.stroke': (t, v) => (t.colors.node.default.stroke = v),
  'node.strokeWidth': (t, v) => (t.nodes.default.strokeWidth = parseFloat(v)),
  'node.selected.fill': (t, v) => (t.colors.node.selected.fill = v),
  'node.selected.stroke': (t, v) => (t.colors.node.selected.stroke = v),
  'node.highlighted.fill': (t, v) => (t.colors.node.highlighted.fill = v),
  'node.highlighted.stroke': (t, v) => (t.colors.node.highlighted.stroke = v),
  'node.hovered.fill': (t, v) => (t.colors.node.hovered.fill = v),
  'node.hovered.stroke': (t, v) => (t.colors.node.hovered.stroke = v),
  'node.disabled.fill': (t, v) => (t.colors.node.disabled.fill = v),
  'node.disabled.stroke': (t, v) => (t.colors.node.disabled.stroke = v),
  'node.disabled.opacity': (t, v) => (t.effects.opacity.disabled = parseFloat(v)),
  'node.error.fill': (t, v) => (t.colors.node.error.fill = v),
  'node.error.stroke': (t, v) => (t.colors.node.error.stroke = v),
  'link.stroke': (t, v) => (t.colors.link.default = v),
  'link.strokeWidth': (t, v) => (t.links.default.strokeWidth = parseFloat(v)),
  'link.selected.stroke': (t, v) => (t.colors.link.selected = v),
  'link.highlighted.stroke': (t, v) => (t.colors.link.highlighted = v),
  'link.hovered.stroke': (t, v) => (t.colors.link.hovered = v),
  'label.fontFamily': (t, v) => (t.typography.fontFamily.default = v),
  'label.fontSize': (t, v) => (t.typography.fontSize.md = parseFloat(v)),
  'label.color': (t, v) => (t.colors.text.primary = v),
  'port.fill': (t, v) => (t.colors.background.surface = v),
  'port.strokeWidth': (t, v) => (t.ports.strokeWidth = parseFloat(v)),
  'port.input': (t, v) => (t.colors.port.input = v),
  'port.output': (t, v) => (t.colors.port.output = v),
  'port.bi': (t, v) => (t.colors.port.bi = v),
};

function writeToken(theme: Theme, token: string, value: string): void {
  TOKEN_WRITERS[token]?.(theme as any, value);
}

/** Deep-ish clone that survives jsdom/node without structuredClone. */
function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Read the `--grafloria-*` values ACTUALLY COMPUTED on a host element.
 *
 * This is what makes canvas mode honour a host that overrides the theme through
 * CSS (`.dark-mode [data-grafloria-instance] { --grafloria-node-fill: #222 }`) — the
 * variable is resolved by the browser's own cascade and handed to the canvas
 * resolver as a concrete value. Returns `{}` in a headless environment.
 */
export function readCssVarOverrides(element: Element | null | undefined): Record<string, string> {
  if (!element) return {};
  const view = (element.ownerDocument as Document | null)?.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return {};

  let computed: CSSStyleDeclaration;
  try {
    computed = view.getComputedStyle(element);
  } catch {
    return {};
  }
  if (!computed || typeof computed.getPropertyValue !== 'function') return {};

  const out: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const name = THEME_VARS[token].cssVar;
    const value = computed.getPropertyValue(name);
    if (value && value.trim()) out[name] = value.trim();
  }
  return out;
}

/** Build the canvas `font` shorthand from a resolved style. */
export function fontString(style: ComputedStyle): string {
  const parts: string[] = [];
  if (style.fontStyle && style.fontStyle !== 'normal') parts.push(style.fontStyle);
  if (style.fontWeight && style.fontWeight !== 'normal') parts.push(String(style.fontWeight));
  parts.push(`${style.fontSize}px`);
  parts.push(style.fontFamily || 'sans-serif');
  return parts.join(' ');
}

/** SVG `text-anchor` → canvas `textAlign`. */
export function textAlignFor(anchor: ComputedStyle['textAnchor']): CanvasTextAlign {
  if (anchor === 'middle') return 'center';
  if (anchor === 'end') return 'right';
  return 'left';
}

/**
 * SVG `dominant-baseline` → canvas `textBaseline`.
 *
 * The renderer only ever emits `middle` (centred labels), `hanging` (top-aligned
 * text blocks) and `baseline`; anything else falls back to the canvas default,
 * which is what an unset `dominant-baseline` means in SVG too.
 */
export function textBaselineFor(baseline: string | undefined): CanvasTextBaseline {
  switch (baseline) {
    case 'middle':
    case 'central':
      return 'middle';
    case 'hanging':
    case 'text-before-edge':
      return 'hanging';
    case 'text-after-edge':
    case 'ideographic':
      return 'ideographic';
    case 'baseline':
    case 'alphabetic':
    case 'auto':
    default:
      return 'alphabetic';
  }
}
