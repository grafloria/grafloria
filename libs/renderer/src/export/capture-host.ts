// THE DOM BOUNDARY of custom-node export — the one file here that needs a browser.
//
// THE SPLIT, AND WHY
// ------------------
// `exportSvg` is pure, DOM-free and deterministic, and that is a guarantee worth more
// than the feature this file enables. So the DOM is not allowed to leak into it. The
// division is:
//
//   capture-host.ts  (HERE)   reads live elements — getBoundingClientRect,
//                             getComputedStyle — and emits PLAIN DATA.
//   custom-nodes.ts  (pure)   places that data into the export tree.
//   svg-export.ts    (pure)   still takes only data; still runs in bare Node.
//
// Nothing in this module touches ambient `document` or `window`: every entry point
// takes the element it works on and reaches the window through `ownerDocument`. So
// importing it from an SSR bundle is harmless — it simply is never called there, and
// `exportSvg` keeps working with no capture at all.
//
// WHY TRANSCRIBE RATHER THAN SCREENSHOT
// -------------------------------------
// The tempting shortcut is `foreignObject` for everything: paste the host's HTML in
// and let the browser deal with it. But a `foreignObject` is dead weight in a PDF and
// in every standalone rasterizer — the export would look right in exactly one viewer
// and be blank in the places people actually send files.
//
// So this walks the host and transcribes what it finds into SVG primitives:
//
//   inline <svg>   LIFTED, element for element, with `var(--…)` resolved through
//                  getComputedStyle. A donut's arcs stay arcs. This is the common
//                  case for the dashboard kit and it is exact, not approximated.
//   text           emitted as <text> at its laid-out position, with the resolved
//                  font and fill. This is what makes a KPI's headline number — plain
//                  HTML, no SVG anywhere near it — survive the trip.
//   boxes          background fills and borders become <rect>/<line>, which is what
//                  draws widget cards and table rules.
//
// Beyond those three it now also transcribes the CSS paint a widget card is actually
// built from, REUSING the renderer's own paint-server model (`svg/paint-servers.ts`) so
// there is exactly one set of gradient/shadow VNode builders in the codebase:
//
//   background gradient   linear-/radial-gradient() → a `<linearGradient>` /
//                         `<radialGradient>` def (userSpaceOnUse, real pixel endpoints so
//                         the CSS angle is not distorted on a non-square box) that the box
//                         rect fills with via `url(#…)`.
//   box-shadow            → the `feDropShadow` filter def, applied to the box. Outer only;
//                         `inset` is skipped and reported.
//   images                <img> / background-image:url() → an `<image>`, inlined to a
//                         data: URI when the canvas is readable.
//
// The SAME VNode tree then feeds the SVG serializer, the PDF painter and `vnodeBounds`,
// all of which already understand these element types. The honest per-format story: SVG
// and resvg render them faithfully; PDF flattens a gradient to a solid stop (with a
// warning), omits the shadow blur (the box still draws), and CANNOT draw an image at all
// (no image XObject) — so an image is reported as a PDF fidelity risk here rather than
// vanishing silently. Transforms and pseudo-elements are still out of scope and, when they
// carry paint we cannot see, degrade to the reported fidelity fallbacks.

import type { VNode } from '../types/vnode.types';
import type { Rectangle } from '../types/geometry.types';
import type { CustomNodeCapture } from './custom-nodes';
import { viewBoxTransform } from './custom-nodes';
import {
  buildLinearGradientUserSpace,
  buildRadialGradientUserSpace,
  buildShadowFilterVNode,
  paintDefId,
} from '../svg/paint-servers';
import type { GradientStop, Shadow } from '@grafloria/engine';

/** Minimal structural view of the DOM we need — keeps this compilable without `lib.dom`. */
type El = {
  localName: string;
  namespaceURI: string | null;
  attributes: ArrayLike<{ name: string; value: string }>;
  childNodes: ArrayLike<{ nodeType: number; nodeValue: string | null }>;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  ownerDocument: { defaultView: unknown; createElement?(tag: string): unknown } | null;
  getAttribute(name: string): string | null;
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Presentation properties lifted off computed style when transcribing inline SVG. */
const SVG_PAINT_PROPS = [
  ['fill', 'fill'],
  ['fill-opacity', 'fillOpacity'],
  ['stroke', 'stroke'],
  ['stroke-width', 'strokeWidth'],
  ['stroke-opacity', 'strokeOpacity'],
  ['stroke-linecap', 'strokeLinecap'],
  ['stroke-linejoin', 'strokeLinejoin'],
  ['stroke-dasharray', 'strokeDasharray'],
  ['opacity', 'opacity'],
] as const;

/**
 * Text properties — applied ONLY to elements that can render glyphs. `getComputedStyle`
 * happily reports a font for every `<path>` and `<line>` in the document, and writing
 * those out would add a `font-family` to several hundred marks that can never draw a
 * character. That is pure file weight.
 */
const SVG_TEXT_PROPS = [
  ['font-family', 'fontFamily'],
  ['font-size', 'fontSize'],
  ['font-weight', 'fontWeight'],
  ['letter-spacing', 'letterSpacing'],
  ['text-anchor', 'textAnchor'],
] as const;

const TEXT_ELEMENTS = new Set(['text', 'tspan', 'textPath']);

/** Attributes that must NOT be copied verbatim — they are re-derived or meaningless here. */
const SKIP_ATTRS = new Set(['class', 'style', 'xmlns']);

/** Geometry-free SVG elements we never need to emit. */
const SVG_IGNORED = new Set(['title', 'desc', 'metadata', 'script', 'style']);

export interface CaptureHostOptions {
  /**
   * The camera zoom the html layer is transformed by. Client rects are SCREEN space,
   * so they are divided by this to get the host-local layout coordinates the export
   * needs. Defaults to being inferred from the host itself, which is more reliable
   * than trusting a caller to remember.
   */
  scale?: number;
  /** Safety valve for a pathologically deep host. Default 4000 elements. */
  maxElements?: number;
}

/**
 * Capture ONE custom node's host into plain data.
 *
 * Never throws: an export must not be taken down by a host in a state we did not
 * anticipate. A failed capture degrades to `fidelity: 'empty'`, which the pure layer
 * turns into a marked box and a warning — the whole point being that a blank is never
 * silent.
 */
export function captureCustomNodeHost(
  id: string,
  rect: Rectangle,
  host: unknown,
  options: CaptureHostOptions = {}
): CustomNodeCapture {
  try {
    const el = host as El;
    const win = el?.ownerDocument?.defaultView as
      | { getComputedStyle(e: unknown): Record<string, string> & { getPropertyValue(p: string): string } }
      | undefined;
    if (!el || !win || typeof win.getComputedStyle !== 'function') {
      return { id, rect, fidelity: 'empty' };
    }

    const hostRect = el.getBoundingClientRect();
    // The html layer carries the camera as a CSS transform, so client rects come back
    // multiplied by the zoom. `offsetWidth` is layout space and is not, so their ratio
    // IS the zoom — no need to be told it.
    const inferred =
      hostRect.width > 0 && (host as { offsetWidth?: number }).offsetWidth
        ? hostRect.width / ((host as { offsetWidth?: number }).offsetWidth as number)
        : 1;
    const scale = options.scale && options.scale > 0 ? options.scale : inferred > 0 ? inferred : 1;

    const ctx: WalkContext = {
      win,
      originX: hostRect.left,
      originY: hostRect.top,
      scale,
      out: [],
      budget: options.maxElements ?? 4000,
      sawUncapturable: false,
      warnings: [],
      emittedDefs: new Set<string>(),
    };

    walk(el, ctx);

    if (ctx.out.length === 0) return { id, rect, fidelity: 'empty' };
    const warning = ctx.warnings.length ? dedupe(ctx.warnings).join(' ') : undefined;
    return warning
      ? { id, rect, fidelity: 'vector', content: ctx.out, warning }
      : { id, rect, fidelity: 'vector', content: ctx.out };
  } catch {
    return { id, rect, fidelity: 'empty' };
  }
}

/** Collapse repeated caveats — one gradient warning for a board of twelve is enough. */
function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

interface WalkContext {
  win: { getComputedStyle(e: unknown): Record<string, string> & { getPropertyValue(p: string): string } };
  originX: number;
  originY: number;
  scale: number;
  out: VNode[];
  budget: number;
  sawUncapturable: boolean;
  /** Fidelity caveats to surface on the capture (image-in-PDF, inset shadow, …). */
  warnings: string[];
  /** Def ids already pushed this capture — identical gradients/filters share ONE def. */
  emittedDefs: Set<string>;
}

/** Client-space rect → host-local layout rect. */
function localRect(ctx: WalkContext, r: { left: number; top: number; width: number; height: number }): Rectangle {
  return {
    x: (r.left - ctx.originX) / ctx.scale,
    y: (r.top - ctx.originY) / ctx.scale,
    width: r.width / ctx.scale,
    height: r.height / ctx.scale,
  };
}

function isTransparent(color: string): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  if (c === 'transparent' || c === 'none') return true;
  // rgba(…, 0) — a zero alpha paints nothing.
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 4 && !(parts[3] > 0)) return true;
  }
  return false;
}

const px = (value: string): number => {
  const v = parseFloat(value);
  return Number.isFinite(v) ? v : 0;
};

function walk(el: El, ctx: WalkContext): void {
  if (ctx.budget-- <= 0) return;

  const style = ctx.win.getComputedStyle(el);
  if (style['display'] === 'none' || style['visibility'] === 'hidden') return;
  // Fully transparent chrome — the kit's hover-revealed resize handle is exactly this.
  // It is not on screen, so it must not be in the file.
  if (parseFloat(style['opacity'] ?? '1') === 0) return;

  if (el.localName === 'svg' && el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    liftSvg(el, ctx);
    return; // lifted whole — never descend, the transcription owns the subtree
  }

  const rect = localRect(ctx, el.getBoundingClientRect());
  if (rect.width > 0 && rect.height > 0) {
    emitBox(el, style, rect, ctx);
    // An <img> paints its bitmap; that is its whole content and it has no children.
    if (el.localName === 'img') emitImage(el, rect, ctx, el.getAttribute('src'));
  }

  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as unknown as { nodeType: number; nodeValue: string | null };
    if (child.nodeType === ELEMENT_NODE) {
      walk(child as unknown as El, ctx);
    } else if (child.nodeType === TEXT_NODE && (child.nodeValue ?? '').trim() !== '') {
      emitText(el, child, style, ctx);
    }
  }
}

/** Background fill and borders → `<rect>` / `<line>`. */
function emitBox(
  el: El,
  style: Record<string, string>,
  rect: Rectangle,
  ctx: WalkContext
): void {
  const bg = style['background-color'] ?? style['backgroundColor'] ?? '';
  const radius = px(style['border-top-left-radius'] ?? style['borderTopLeftRadius'] ?? '0');

  // A CSS `background-image` is either a gradient (→ paint-server fill) or a bitmap
  // (→ an <image> behind the content). Its computed value keeps the layers we authored.
  const bgImage = style['background-image'] ?? style['backgroundImage'] ?? '';
  const gradientFill = gradientFillFor(bgImage, rect, ctx);

  // The box's fill: a gradient wins over a flat colour (CSS paints the image over the
  // colour), and either one is what a drop shadow is cast from.
  const fill = gradientFill ?? (isTransparent(bg) ? undefined : bg);
  const shadowRef = shadowFilterFor(style['box-shadow'] ?? style['boxShadow'] ?? '', ctx);

  if (fill !== undefined) {
    ctx.out.push({
      type: 'rect',
      props: {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
        ...(radius > 0 ? { rx: round(radius) } : {}),
        fill,
        ...(shadowRef ? { filter: shadowRef } : {}),
      },
      children: [],
    });
  } else if (shadowRef) {
    // A shadow with nothing to cast it from: feDropShadow blurs the source graphic's
    // alpha, and a box with no fill has none. Report rather than emit a shadow of nothing.
    ctx.warnings.push('a box-shadow on a widget with no painted background was omitted.');
  }

  // A bitmap background sits behind the element's content — emitted here, before the
  // children the walk descends into next.
  emitBackgroundImage(bgImage, rect, ctx);

  // Borders. A uniform box gets one stroked rect; anything else (a table's row rule is
  // a bottom border only) gets a line per painted side, which is the only way those
  // survive at all.
  const sides = (['top', 'right', 'bottom', 'left'] as const).map(side => ({
    side,
    width: px(style[`border-${side}-width`] ?? ''),
    color: style[`border-${side}-color`] ?? '',
    style: style[`border-${side}-style`] ?? 'none',
  }));
  const painted = sides.filter(s => s.width > 0 && s.style !== 'none' && !isTransparent(s.color));
  if (painted.length === 0) return;

  const uniform =
    painted.length === 4 &&
    painted.every(s => s.width === painted[0].width && s.color === painted[0].color);

  if (uniform) {
    const w = painted[0].width;
    // A CSS border sits INSIDE the box; an SVG stroke straddles the path. Inset by half.
    ctx.out.push({
      type: 'rect',
      props: {
        x: round(rect.x + w / 2),
        y: round(rect.y + w / 2),
        width: round(Math.max(0, rect.width - w)),
        height: round(Math.max(0, rect.height - w)),
        ...(radius > 0 ? { rx: round(Math.max(0, radius - w / 2)) } : {}),
        fill: 'none',
        stroke: painted[0].color,
        'stroke-width': round(w),
      },
      children: [],
    });
    return;
  }

  for (const s of painted) {
    const inset = s.width / 2;
    const [x1, y1, x2, y2] =
      s.side === 'top'
        ? [rect.x, rect.y + inset, rect.x + rect.width, rect.y + inset]
        : s.side === 'bottom'
          ? [rect.x, rect.y + rect.height - inset, rect.x + rect.width, rect.y + rect.height - inset]
          : s.side === 'left'
            ? [rect.x + inset, rect.y, rect.x + inset, rect.y + rect.height]
            : [rect.x + rect.width - inset, rect.y, rect.x + rect.width - inset, rect.y + rect.height];
    ctx.out.push({
      type: 'line',
      props: {
        x1: round(x1),
        y1: round(y1),
        x2: round(x2),
        y2: round(y2),
        stroke: s.color,
        'stroke-width': round(s.width),
      },
      children: [],
    });
  }
}

/**
 * One run of text → `<text>`.
 *
 * The position comes from a Range over the text node, which is the TIGHT laid-out box
 * — the parent's box would be the whole card for a title. SVG's `y` is the baseline
 * and CSS gives us a line box, so the baseline is derived from the box centre and the
 * font size; that is an approximation, but it is the same one every HTML→SVG
 * transcriber makes and it is visually indistinguishable for single-line runs.
 */
function emitText(
  parent: El,
  textNode: { nodeValue: string | null },
  style: Record<string, string>,
  ctx: WalkContext
): void {
  const raw = (textNode.nodeValue ?? '').replace(/\s+/g, ' ').trim();
  if (raw === '') return;

  // `text-transform` is applied by the RENDERER, not stored in the text node — the DOM
  // still says "Total revenue" while the screen says "TOTAL REVENUE". Copying nodeValue
  // verbatim is how an export comes out subtly but visibly wrong on every widget title.
  const content = applyTextTransform(raw, style['text-transform'] ?? style['textTransform']);

  const doc = (parent.ownerDocument ?? null) as unknown as { createRange?: () => unknown } | null;
  let box: { left: number; top: number; width: number; height: number } | null = null;
  try {
    const range = doc?.createRange?.() as
      | { selectNodeContents(n: unknown): void; getBoundingClientRect(): DOMRectLike }
      | undefined;
    if (range) {
      range.selectNodeContents(textNode);
      const r = range.getBoundingClientRect();
      if (r && r.width >= 0 && r.height > 0) box = r;
    }
  } catch {
    /* fall through to the parent's box */
  }
  if (!box) box = parent.getBoundingClientRect();

  const rect = localRect(ctx, box);
  if (!(rect.height > 0)) return;

  const fontSize = px(style['font-size'] ?? style['fontSize'] ?? '12') / 1;
  const align = (style['text-align'] ?? style['textAlign'] ?? 'start').toLowerCase();
  const anchor = align === 'center' ? 'middle' : align === 'right' || align === 'end' ? 'end' : 'start';
  const x = anchor === 'middle' ? rect.x + rect.width / 2 : anchor === 'end' ? rect.x + rect.width : rect.x;
  // Alphabetic baseline ≈ 0.36em below the centre of the line box for typical faces.
  const y = rect.y + rect.height / 2 + fontSize * 0.36;

  const color = style['color'] ?? '#000';
  const tracking = px(style['letter-spacing'] ?? style['letterSpacing'] ?? '');
  ctx.out.push({
    type: 'text',
    props: {
      x: round(x),
      y: round(y),
      ...(anchor !== 'start' ? { 'text-anchor': anchor } : {}),
      'font-family': style['font-family'] ?? style['fontFamily'] ?? 'sans-serif',
      'font-size': round(fontSize),
      ...(normalWeight(style) ? {} : { 'font-weight': style['font-weight'] ?? style['fontWeight'] }),
      // Tracking is part of how the kit's small-caps headers read; without it the
      // exported label is measurably narrower than the one on screen.
      ...(tracking ? { 'letter-spacing': round(tracking) } : {}),
      fill: color,
      textContent: content,
    },
    children: [],
  });
}

/** What the renderer does to the text on the way to the screen. */
function applyTextTransform(text: string, transform: string | undefined): string {
  switch ((transform ?? '').toLowerCase()) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/(^|\s)(\S)/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
    default:
      return text;
  }
}

function normalWeight(style: Record<string, string>): boolean {
  const w = String(style['font-weight'] ?? style['fontWeight'] ?? '400');
  return w === '400' || w === 'normal';
}

interface DOMRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Lift an inline `<svg>` into the display list.
 *
 * This is the fidelity win: the kit draws every chart as inline SVG, so a donut's arcs,
 * a bar's rects and a line's polylines come across as THEMSELVES — real vector, exact
 * geometry, valid in a PDF. The two things that must happen on the way:
 *
 *  1. the viewBox fit is baked into a transform (see `viewBoxTransform`), because no
 *     target downstream of here implements nested-`<svg>` viewBox mapping;
 *  2. every paint is read from COMPUTED style, which is what resolves the kit's
 *     `var(--axdb-grid)` / `var(--axdb-ink)` into literal colours. Copying attributes
 *     verbatim would carry `var(…)` into the file and break the export's standing
 *     "no unresolved custom properties" guarantee — the values would render black, or
 *     not at all, outside a browser.
 */
function liftSvg(el: El, ctx: WalkContext): void {
  const rect = localRect(ctx, el.getBoundingClientRect());
  if (!(rect.width > 0) || !(rect.height > 0)) return;

  const viewBox = parseViewBox(el.getAttribute('viewBox'));
  const fit = viewBox
    ? viewBoxTransform(viewBox, rect, el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet')
    : '';

  const children: VNode[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as unknown as { nodeType: number };
    if (child.nodeType !== ELEMENT_NODE) continue;
    const vnode = transcribeSvgElement(child as unknown as El, ctx);
    if (vnode) children.push(vnode);
  }
  if (children.length === 0) return;

  const transform = [`translate(${round(rect.x)} ${round(rect.y)})`, fit].filter(Boolean).join(' ');
  ctx.out.push({
    type: 'g',
    props: { transform, className: 'grafloria-lifted-svg' },
    children,
  });
}

function parseViewBox(raw: string | null): Rectangle | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function transcribeSvgElement(el: El, ctx: WalkContext): VNode | null {
  if (ctx.budget-- <= 0) return null;
  if (SVG_IGNORED.has(el.localName)) return null;

  const style = ctx.win.getComputedStyle(el);
  if (style['display'] === 'none' || style['visibility'] === 'hidden') return null;

  const props: Record<string, unknown> = {};

  // Geometry and every other authored attribute, verbatim.
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (SKIP_ATTRS.has(attr.name)) continue;
    props[attr.name] = attr.value;
  }

  // Paint, RESOLVED — this is what turns `var(--axdb-grid)` into a colour.
  const wanted = TEXT_ELEMENTS.has(el.localName)
    ? [...SVG_PAINT_PROPS, ...SVG_TEXT_PROPS]
    : SVG_PAINT_PROPS;
  for (const [attr, prop] of wanted) {
    const value = style[attr] ?? style[prop];
    if (value === undefined || value === '' || value === 'normal') continue;
    props[attr] = value;
  }

  const children: VNode[] = [];
  let text: string | undefined;
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as unknown as { nodeType: number; nodeValue: string | null };
    if (child.nodeType === ELEMENT_NODE) {
      const vnode = transcribeSvgElement(child as unknown as El, ctx);
      if (vnode) children.push(vnode);
    } else if (child.nodeType === TEXT_NODE && (child.nodeValue ?? '').trim() !== '') {
      text = (text ?? '') + (child.nodeValue ?? '');
    }
  }

  if (text !== undefined && children.length === 0) props['textContent'] = text;

  return { type: el.localName, props, children };
}

// ---------------------------------------------------------------------------
// CSS paint transcription — gradients, shadows, images.
//
// These read COMPUTED style values (rgb()/rgba() colours, px lengths, resolved angles),
// so the parsing is deliberately narrow: it handles the forms a browser actually emits
// from getComputedStyle, not the full authoring grammar. Everything reuses the renderer's
// own paint-server VNode builders (`svg/paint-servers.ts`) so the def shapes live in one
// place. Def dedup is by the stable `paintDefId` hash: identical paint → one def.
// ---------------------------------------------------------------------------

const IMAGE_PDF_WARNING =
  'a widget image was exported as <image> (faithful in SVG/resvg) — but PDF has no image ' +
  'primitive, so it will be MISSING from a PDF export.';

/** Register a def VNode once per capture; identical defs (same id) collapse to one. */
function pushDef(ctx: WalkContext, id: string, build: () => VNode): void {
  if (ctx.emittedDefs.has(id)) return;
  ctx.emittedDefs.add(id);
  ctx.out.push(build());
}

/** Split on TOP-LEVEL commas only — commas inside `rgb(…)` / nested `()` are left alone. */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map(s => s.trim());
}

const COLOR_TOKEN = /(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8})/;

/** Does an argument carry a colour (→ a stop), or is it a direction/shape config? */
function looksLikeColor(arg: string): boolean {
  return COLOR_TOKEN.test(arg);
}

// -- gradients ---------------------------------------------------------------

interface ParsedGradient {
  kind: 'linear' | 'radial';
  angle: number; // linear only, CSS degrees (0=up, 90=right, clockwise)
  center: { x: number; y: number } | null; // radial, fractions 0–1, null = centre
  stops: GradientStop[];
  caveats: string[];
}

/** The one flat colour that best stands in — the fill a box wears when a gradient is present. */
function gradientFillFor(bgImage: string, rect: Rectangle, ctx: WalkContext): string | undefined {
  const grad = parseGradient(bgImage);
  if (!grad) return undefined;
  for (const c of grad.caveats) ctx.warnings.push(c);

  if (grad.kind === 'linear') {
    const e = linearEndpoints(grad.angle, rect);
    const id = paintDefId({ k: 'l', ...e, stops: grad.stops });
    pushDef(ctx, id, () => buildLinearGradientUserSpace(id, { ...e, stops: grad.stops }));
    return `url(#${id})`;
  }

  const g = radialGeometry(grad, rect);
  const id = paintDefId({ k: 'r', ...g, stops: grad.stops });
  pushDef(ctx, id, () => buildRadialGradientUserSpace(id, { ...g, stops: grad.stops }));
  return `url(#${id})`;
}

/** Parse a computed `background-image` gradient. Returns null for a bitmap or `none`. */
function parseGradient(bgImage: string): ParsedGradient | null {
  const raw = (bgImage ?? '').trim();
  if (!raw || raw === 'none') return null;

  const layers = splitTopLevel(raw);
  const caveats: string[] = [];
  if (layers.length > 1) caveats.push('only the first of multiple background-image layers was exported.');

  const m = /^(repeating-)?(linear|radial)-gradient\(([\s\S]*)\)$/i.exec(layers[0]);
  if (!m) return null;
  if (m[1]) caveats.push('a repeating gradient was exported as a single non-repeating gradient.');

  const kind = m[2].toLowerCase() as 'linear' | 'radial';
  const args = splitTopLevel(m[3]);
  if (args.length === 0) return null;

  let angle = 180; // CSS default direction is `to bottom`
  let center: { x: number; y: number } | null = null;
  let stopArgs = args;

  if (!looksLikeColor(args[0])) {
    if (kind === 'linear') angle = parseAngle(args[0]);
    else center = parseRadialCenter(args[0]);
    stopArgs = args.slice(1);
  }

  const stops = parseStops(stopArgs);
  if (stops.length < 2) return null;
  return { kind, angle, center, stops, caveats };
}

/** A CSS gradient angle/side → degrees (0=up, 90=right, clockwise). */
function parseAngle(token: string): number {
  const t = token.trim().toLowerCase();
  const m = /^(-?[\d.]+)(deg|grad|rad|turn)?$/.exec(t);
  if (m) {
    const v = parseFloat(m[1]);
    switch (m[2]) {
      case 'rad':
        return (v * 180) / Math.PI;
      case 'grad':
        return v * 0.9;
      case 'turn':
        return v * 360;
      default:
        return v;
    }
  }
  if (t.startsWith('to ')) {
    const sides = new Set(t.slice(3).trim().split(/\s+/));
    const top = sides.has('top');
    const bottom = sides.has('bottom');
    const left = sides.has('left');
    const right = sides.has('right');
    // Corner directions are approximated by their 45° diagonal — exact CSS corner angles
    // depend on the box aspect ratio, which is a refinement not worth its complexity here.
    if (top && right) return 45;
    if (bottom && right) return 135;
    if (bottom && left) return 225;
    if (top && left) return 315;
    if (top) return 0;
    if (right) return 90;
    if (left) return 270;
    return 180; // bottom
  }
  return 180;
}

/** Endpoints for a linear gradient, in host-local pixel space (userSpaceOnUse). */
function linearEndpoints(
  angleDeg: number,
  rect: Rectangle
): { x1: number; y1: number; x2: number; y2: number } {
  const th = (angleDeg * Math.PI) / 180;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const w = rect.width;
  const h = rect.height;
  const cx = rect.x + w / 2;
  const cy = rect.y + h / 2;
  // The gradient line runs through the centre and spans corner-to-corner.
  const len = Math.abs(w * s) + Math.abs(h * c);
  // y is DOWN in SVG, so the "to top" direction (θ=0) is (0,-1): end = centre + (s,-c)·len/2.
  return {
    x1: round(cx - (s * len) / 2),
    y1: round(cy + (c * len) / 2),
    x2: round(cx + (s * len) / 2),
    y2: round(cy - (c * len) / 2),
  };
}

/** Centre + radius for a radial gradient, host-local pixels. Default: centre, farthest-corner. */
function radialGeometry(grad: ParsedGradient, rect: Rectangle): { cx: number; cy: number; r: number } {
  const fx = grad.center?.x ?? 0.5;
  const fy = grad.center?.y ?? 0.5;
  const cx = rect.x + rect.width * fx;
  const cy = rect.y + rect.height * fy;
  // Default ending shape/size is farthest-corner: the max distance from the centre to any
  // of the box's four corners.
  const dx = Math.max(cx - rect.x, rect.x + rect.width - cx);
  const dy = Math.max(cy - rect.y, rect.y + rect.height - cy);
  return { cx: round(cx), cy: round(cy), r: round(Math.hypot(dx, dy)) };
}

/** `circle at 25% 75%` / `at center` → the centre as 0–1 fractions, or null for default. */
function parseRadialCenter(config: string): { x: number; y: number } | null {
  const at = /\bat\s+(.+)$/i.exec(config.trim());
  if (!at) return null;
  const parts = at[1].trim().split(/\s+/);
  const axis = (token: string, horizontal: boolean): number => {
    const t = token.toLowerCase();
    if (t === 'center') return 0.5;
    if (t === 'left') return 0;
    if (t === 'right') return 1;
    if (t === 'top') return 0;
    if (t === 'bottom') return 1;
    const pct = /^(-?[\d.]+)%$/.exec(t);
    if (pct) return parseFloat(pct[1]) / 100;
    return horizontal ? 0.5 : 0.5;
  };
  const x = axis(parts[0] ?? 'center', true);
  const y = axis(parts[1] ?? parts[0] ?? 'center', false);
  return { x, y };
}

/** Parse the colour-stop list, filling in unpositioned stops by even distribution. */
function parseStops(parts: string[]): GradientStop[] {
  const raw = parts.map(parseStop).filter((s): s is { color: string; opacity?: number; offset: number | null } => s !== null);
  if (raw.length === 0) return [];

  if (raw[0].offset == null) raw[0].offset = 0;
  if (raw[raw.length - 1].offset == null) raw[raw.length - 1].offset = 1;

  // Fill each run of unpositioned stops by interpolating between its anchored neighbours.
  let i = 0;
  while (i < raw.length) {
    if (raw[i].offset != null) {
      i++;
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j].offset == null) j++;
    const prev = raw[i - 1].offset as number;
    const next = raw[j].offset as number;
    const gap = j - (i - 1);
    for (let k = i; k < j; k++) raw[k].offset = prev + ((next - prev) * (k - (i - 1))) / gap;
    i = j;
  }

  return raw.map(s => ({
    offset: round(s.offset as number),
    color: s.color,
    ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
  }));
}

/** One `rgb(…) 40%` stop → colour + optional offset (fraction) + optional split-out alpha. */
function parseStop(part: string): { color: string; opacity?: number; offset: number | null } | null {
  const t = part.trim();
  const cm = COLOR_TOKEN.exec(t);
  if (!cm) return null;
  const rawColor = cm[0];
  const rest = t.slice(0, cm.index) + t.slice(cm.index + rawColor.length);
  const pm = /(-?[\d.]+)%/.exec(rest);
  const offset = pm ? Math.max(0, Math.min(1, parseFloat(pm[1]) / 100)) : null;
  return { ...splitAlpha(rawColor), offset };
}

/** rgba(r,g,b,a<1) → { color: rgb(r,g,b), opacity: a }. Everything else passes through. */
function splitAlpha(color: string): { color: string; opacity?: number } {
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(color.trim());
  if (m) {
    const a = parseFloat(m[4]);
    if (a < 1) return { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, opacity: a };
    return { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})` };
  }
  return { color };
}

// -- box-shadow --------------------------------------------------------------

/** Build the drop-shadow filter def for a box-shadow and return its `url(#…)` ref. */
function shadowFilterFor(boxShadow: string, ctx: WalkContext): string | undefined {
  const raw = (boxShadow ?? '').trim();
  if (!raw || raw === 'none') return undefined;

  const shadows = splitTopLevel(raw);
  const first = shadows[0];
  if (/\binset\b/i.test(first)) {
    ctx.warnings.push('an inset box-shadow was skipped — inset shadows are not exported.');
    return undefined;
  }
  if (shadows.length > 1) ctx.warnings.push('only the first of multiple box-shadows was exported.');

  const shadow = parseShadow(first);
  if (!shadow) return undefined;

  const id = paintDefId({ shadow });
  pushDef(ctx, id, () => buildShadowFilterVNode(id, shadow));
  return `url(#${id})`;
}

/** `rgba(…) 2px 4px 12px 0px` (computed form: colour first) → a Shadow spec, or null. */
function parseShadow(value: string): Shadow | null {
  const t = value.trim();
  const cm = COLOR_TOKEN.exec(t);
  const color = cm ? cm[0] : 'rgba(0, 0, 0, 0.35)';
  const rest = cm ? t.slice(0, cm.index) + t.slice(cm.index + color.length) : t;
  const nums = (rest.match(/-?[\d.]+px/g) ?? []).map(v => parseFloat(v));
  if (nums.length < 2) return null;
  const [offsetX, offsetY, blur = 0] = nums; // a 4th value is spread, which SVG has no analogue for
  // CSS blur radius ≈ 2× the Gaussian std-deviation — halve it so the shadow is as soft as
  // the browser paints it, matching the serializer's own `blur()` translation.
  return { offsetX, offsetY, blur: round(blur / 2), color };
}

// -- images ------------------------------------------------------------------

/** `background-image: url("…")` → an `<image>` behind the element's content. */
function emitBackgroundImage(bgImage: string, rect: Rectangle, ctx: WalkContext): void {
  const url = parseBgUrl(bgImage);
  if (!url) return;
  emitImage(null, rect, ctx, url);
}

/** The first `url(…)` in a computed `background-image`, unquoted, or null. */
function parseBgUrl(bgImage: string): string | null {
  const m = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(bgImage ?? '');
  return m ? m[2] : null;
}

/**
 * Emit an `<image>` for an `<img>` (pass the element) or a CSS bitmap (pass null).
 * Inlined to a data: URI when the pixels are readable, so the file stays self-contained;
 * ALWAYS warned, because PDF cannot draw an image at all.
 */
function emitImage(el: El | null, rect: Rectangle, ctx: WalkContext, src: string | null): void {
  if (!src) return;
  ctx.warnings.push(IMAGE_PDF_WARNING);
  const href = resolveImageHref(el, src, ctx);
  ctx.out.push({
    type: 'image',
    props: {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      href,
    },
    children: [],
  });
}

/** A data: URI if we can read the bitmap; otherwise the original src (external, warned). */
function resolveImageHref(el: El | null, src: string, ctx: WalkContext): string {
  if (src.startsWith('data:')) return src;
  const inlined = el ? tryCanvasInline(el, ctx) : null;
  if (inlined) return inlined;
  ctx.warnings.push(
    'an image could not be inlined (cross-origin or unloaded) — the export references it ' +
      'externally and is not fully self-contained.'
  );
  return src;
}

/** Read a loaded, same-origin `<img>` to a PNG data URI via a canvas. Null on any failure. */
function tryCanvasInline(el: El, ctx: WalkContext): string | null {
  try {
    const doc = el.ownerDocument as { createElement?(tag: string): unknown } | null;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const img = el as unknown as { naturalWidth?: number; naturalHeight?: number };
    const nw = img.naturalWidth ?? 0;
    const nh = img.naturalHeight ?? 0;
    if (!nw || !nh) return null;
    const canvas = doc.createElement('canvas') as {
      width: number;
      height: number;
      getContext(t: string): { drawImage(i: unknown, x: number, y: number): void } | null;
      toDataURL(type?: string): string;
    };
    canvas.width = nw;
    canvas.height = nh;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(el, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    ctx.warnings.push(
      'an image could not be inlined (cross-origin or unloaded) — the export references it ' +
        'externally and is not fully self-contained.'
    );
    return null;
  }
}

/** 4dp is finer than any renderer resolves, and keeps the output byte-stable. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
