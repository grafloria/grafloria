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
// vanishing silently.
//
// Two more things it transcribes:
//
//   pseudo-elements   `::before` / `::after` boxes, read via getComputedStyle(el, '::…').
//                     A pseudo has NO element to getBoundingClientRect(), so its box is
//                     DERIVED: explicit width/height + position offsets for an absolute
//                     pseudo; the origin's content start (border + padding in) for a
//                     static one. Quoted `content` strings go through the SAME text
//                     emission as real text nodes (so text-transform etc. hold);
//                     attr()/counter()/url() content is skipped and reported; a painted
//                     pseudo whose box cannot be derived is reported, never guessed.
//   clipping          `overflow: hidden|clip|auto|scroll` wraps the element's
//                     DESCENDANTS in a `<g clip-path="url(#…)">` whose `<clipPath>` is
//                     the (rounded) border box, so a chart or image inside a rounded
//                     card cannot bleed past the corners; CSS `clip-path` basic shapes
//                     (inset/circle/ellipse/polygon) wrap the element ITSELF the same
//                     way; path()/url() clip-paths are skipped and reported (content
//                     exports unclipped, not wrong). Nested clips compose as nested
//                     groups. SVG/resvg honour clipPath faithfully; the PDF painter does
//                     not yet apply clips, which is reported as a fidelity risk.
// Transforms remain out of scope and, when they carry paint we cannot see, degrade to
// the reported fidelity fallbacks.

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
      | {
          getComputedStyle(
            e: unknown,
            pseudo?: string | null
          ): Record<string, string> & { getPropertyValue(p: string): string };
        }
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
      // jsdom does not implement getComputedStyle(el, '::before') — it LOGS a
      // not-implemented error (it does not throw) and returns the element's own style,
      // once per call. Probing it per element would print hundreds of identical lines
      // into every jsdom-hosted test run for a fact known up front: jsdom announces
      // itself in the UA. Real browsers are untouched.
      pseudoUnsupported: /jsdom/i.test(
        (win as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? ''
      ),
    };

    walk(el, ctx, ctx.out);

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
  win: {
    getComputedStyle(
      e: unknown,
      pseudo?: string | null
    ): Record<string, string> & { getPropertyValue(p: string): string };
  };
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
  /**
   * Set when `getComputedStyle(el, '::before')` THROWS (jsdom says "not implemented").
   * One probe decides for the whole capture — without this, every element of every
   * jsdom-hosted capture logs its own not-implemented error, hundreds of lines of
   * noise about a fact we learned on the first call.
   */
  pseudoUnsupported?: boolean;
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

function walk(el: El, ctx: WalkContext, sink: VNode[]): void {
  if (ctx.budget-- <= 0) return;

  const style = ctx.win.getComputedStyle(el);
  if (style['display'] === 'none' || style['visibility'] === 'hidden') return;
  // Fully transparent chrome — the kit's hover-revealed resize handle is exactly this.
  // It is not on screen, so it must not be in the file.
  if (parseFloat(style['opacity'] ?? '1') === 0) return;

  if (el.localName === 'svg' && el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    liftSvg(el, ctx, sink);
    return; // lifted whole — never descend, the transcription owns the subtree
  }

  const rect = localRect(ctx, el.getBoundingClientRect());
  const hasBox = rect.width > 0 && rect.height > 0;

  // Clipping. CSS `clip-path` clips the element ITSELF (own background included);
  // `overflow` clips only its DESCENDANTS. Each becomes a detached sink that is
  // wrapped in a `<g clip-path="url(#…)">` at the end — IF anything painted into it,
  // so an empty clip leaves neither a group nor a def behind. Nested clips compose
  // naturally: an inner clipped element builds its own group inside the outer one.
  const selfClip = hasBox ? clipPathShapeFor(style['clip-path'] ?? style['clipPath'] ?? '', rect, ctx) : null;
  const overflowClip = hasBox ? overflowClipFor(style, rect) : null;

  const ownSink: VNode[] = selfClip ? [] : sink;
  const childSink: VNode[] = overflowClip ? [] : ownSink;

  if (hasBox) {
    emitBox(style, rect, ctx, ownSink);
    // An <img> paints its bitmap; that is its whole content and it has no children.
    if (el.localName === 'img') emitImage(el, rect, ctx, el.getAttribute('src'), ownSink);
  }

  // Does the origin have flow content of its own? A static ::after flows AFTER it,
  // at a position this transcriber cannot measure — that case warns instead of guessing.
  let hasFlowContent = false;
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as unknown as { nodeType: number; nodeValue: string | null };
    if (
      child.nodeType === ELEMENT_NODE ||
      (child.nodeType === TEXT_NODE && (child.nodeValue ?? '').trim() !== '')
    ) {
      hasFlowContent = true;
      break;
    }
  }

  const beforeExists = hasBox ? emitPseudo(el, style, rect, '::before', ctx, childSink, false) : false;

  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as unknown as { nodeType: number; nodeValue: string | null };
    if (child.nodeType === ELEMENT_NODE) {
      walk(child as unknown as El, ctx, childSink);
    } else if (child.nodeType === TEXT_NODE && (child.nodeValue ?? '').trim() !== '') {
      emitText(el, child, style, ctx, childSink);
    }
  }

  if (hasBox) emitPseudo(el, style, rect, '::after', ctx, childSink, hasFlowContent || beforeExists);

  if (overflowClip && childSink.length > 0) {
    pushDef(ctx, overflowClip.id, () => overflowClip.def);
    ownSink.push({
      type: 'g',
      props: { 'clip-path': `url(#${overflowClip.id})` },
      children: childSink,
    });
  }
  if (selfClip && ownSink.length > 0) {
    pushDef(ctx, selfClip.id, () => selfClip.def);
    sink.push({
      type: 'g',
      props: { 'clip-path': `url(#${selfClip.id})` },
      children: ownSink,
    });
  }
}

/**
 * Background fill and borders → `<rect>` / `<line>`, pushed into `sink` (the display
 * list of whatever clip scope the element lives in). Also used for a pseudo-element's
 * derived box — the style record is then the PSEUDO's computed style, which is what
 * makes gradients/shadows/borders on a `::before` ride the exact same code.
 */
function emitBox(
  style: Record<string, string>,
  rect: Rectangle,
  ctx: WalkContext,
  sink: VNode[]
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
    sink.push({
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
  emitBackgroundImage(bgImage, rect, ctx, sink);

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
    sink.push({
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
    sink.push({
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
  ctx: WalkContext,
  sink: VNode[]
): void {
  const raw = (textNode.nodeValue ?? '').replace(/\s+/g, ' ').trim();
  if (raw === '') return;

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

  pushTextVNode(raw, rect, style, ctx, sink);
}

/**
 * The one place a run of text becomes a `<text>` VNode. Real text nodes arrive here
 * with their Range-measured box; pseudo-element `content` strings arrive with their
 * DERIVED box — and because both go through this, text-transform, colour, tracking and
 * the baseline approximation cannot drift between the two.
 */
function pushTextVNode(
  raw: string,
  rect: Rectangle,
  style: Record<string, string>,
  ctx: WalkContext,
  sink: VNode[]
): void {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return;

  // `text-transform` is applied by the RENDERER, not stored in the text node — the DOM
  // still says "Total revenue" while the screen says "TOTAL REVENUE". Copying nodeValue
  // verbatim is how an export comes out subtly but visibly wrong on every widget title.
  const content = applyTextTransform(collapsed, style['text-transform'] ?? style['textTransform']);

  const fontSize = px(style['font-size'] ?? style['fontSize'] ?? '12') / 1;
  const align = (style['text-align'] ?? style['textAlign'] ?? 'start').toLowerCase();
  const anchor = align === 'center' ? 'middle' : align === 'right' || align === 'end' ? 'end' : 'start';
  const x = anchor === 'middle' ? rect.x + rect.width / 2 : anchor === 'end' ? rect.x + rect.width : rect.x;
  // Alphabetic baseline ≈ 0.36em below the centre of the line box for typical faces.
  const y = rect.y + rect.height / 2 + fontSize * 0.36;

  const color = style['color'] ?? '#000';
  const tracking = px(style['letter-spacing'] ?? style['letterSpacing'] ?? '');
  sink.push({
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
function liftSvg(el: El, ctx: WalkContext, sink: VNode[]): void {
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
  sink.push({
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

/**
 * The capture-time verdict on an external image, EXPORTED because the async export path
 * revises it: `await export(…)` fetches external URLs (environment fetch, then
 * `ExportOptions.assetFetcher`) and STRIPS this warning from any capture whose images it
 * embedded — see `stripResolvedImageWarnings`. The synchronous entry points cannot fetch,
 * so for them this text is the whole truth, and it names the way out.
 */
export const IMAGE_PDF_WARNING =
  'a widget image references an EXTERNAL URL — a synchronous export keeps the link (the ' +
  'SVG renders online, but a PDF cannot fetch a URL, so it will be MISSING from a PDF ' +
  'export). `await export(…)` embeds the image when its server allows CORS or when ' +
  'ExportOptions.assetFetcher is supplied.';

/** Companion caveat from `resolveImageHref` — same lifecycle as {@link IMAGE_PDF_WARNING}. */
export const IMAGE_NOT_INLINED_WARNING =
  'an image could not be inlined (cross-origin or unloaded) — the export references it ' +
  'externally and is not fully self-contained.';

/**
 * Remove the two external-image caveats from a capture's warning — called by the async
 * export AFTER it embedded every external image the capture held, at which point both
 * sentences assert a problem that no longer exists (the same defect, mirrored, as
 * staying silent about one that does). Returns undefined when nothing else remains.
 */
export function stripResolvedImageWarnings(warning: string | undefined): string | undefined {
  if (!warning) return warning;
  const stripped = warning
    .replace(IMAGE_PDF_WARNING, '')
    .replace(IMAGE_NOT_INLINED_WARNING, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped === '' ? undefined : stripped;
}

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
function emitBackgroundImage(bgImage: string, rect: Rectangle, ctx: WalkContext, sink: VNode[]): void {
  const url = parseBgUrl(bgImage);
  if (!url) return;
  emitImage(null, rect, ctx, url, sink);
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
function emitImage(
  el: El | null,
  rect: Rectangle,
  ctx: WalkContext,
  src: string | null,
  sink: VNode[]
): void {
  if (!src) return;
  const href = resolveImageHref(el, src, ctx);
  // Only an EXTERNAL image is a PDF risk now: the PDF writer embeds data: PNGs/JPEGs
  // as image XObjects (b2854b0a1) and carries its own precise warnings for the forms
  // it refuses (interlaced, 16-bit, CMYK…). An external URL it cannot fetch, so that
  // half of the old blanket warning is the half that stays.
  if (!href.startsWith('data:')) ctx.warnings.push(IMAGE_PDF_WARNING);
  sink.push({
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
  ctx.warnings.push(IMAGE_NOT_INLINED_WARNING);
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

// -- pseudo-elements ---------------------------------------------------------
//
// `getComputedStyle(el, '::before')` reports a pseudo's computed style, but a pseudo
// has NO element to getBoundingClientRect() — its box must be DERIVED:
//
//   absolute/fixed   left/top (or right/bottom + size) offsets against the origin's
//                    border box, plus computed width/height. This is the decorative-
//                    pseudo idiom and it derives exactly.
//   static/relative  a ::before flows at the origin's CONTENT start (border + padding
//                    in). A ::after only flows there when the origin has no other flow
//                    content — otherwise its position depends on layout this
//                    transcriber cannot measure, and it warns instead of guessing.
//
// Sizes: explicit px/% resolve; `auto` resolves for a TEXT pseudo (its line box is
// derived from its own font, the same approximation `emitText` makes), but a PAINTED
// box with auto size is underivable and is reported, never guessed.


/** A px/% length against a basis. Returns null for auto/keywords/unparsable. */
function resolveLen(token: string, basis: number): number | null {
  const t = (token ?? '').trim();
  if (t === '') return null;
  const pct = /^(-?[\d.]+)%$/.exec(t);
  if (pct) return (parseFloat(pct[1]) / 100) * basis;
  const abs = /^(-?[\d.]+)(?:px)?$/.exec(t);
  if (abs) return parseFloat(abs[1]);
  return null;
}

/** Everything outside quoted strings — for detecting attr()/counter()/url() content. */
function stripQuoted(value: string): string {
  return value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '');
}

/**
 * A computed `content` value → the text it contributes. Quoted strings (and their
 * concatenation) are transcribed; attr()/counter()/url() cannot be resolved from
 * computed style alone and are skipped WITH a warning. The `/ "alt text"` clause is
 * not rendered content and is cut.
 */
function parsePseudoContent(value: string, ctx: WalkContext): string {
  if (/(attr|counters?|url|image-set)\s*\(/i.test(stripQuoted(value))) {
    ctx.warnings.push(
      'a pseudo-element content value (attr()/counter()/url()) was skipped — only quoted ' +
        'strings are transcribed.'
    );
  }
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && i + 1 < value.length) out += value[++i];
      else out += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/') {
      break; // alt-text clause — never rendered
    }
  }
  return out;
}

/** Does the pseudo's style paint a box at all (background or any visible border)? */
function pseudoPaintsBox(ps: Record<string, string>): boolean {
  if (!isTransparent(ps['background-color'] ?? ps['backgroundColor'] ?? '')) return true;
  const bgi = (ps['background-image'] ?? ps['backgroundImage'] ?? '').trim();
  if (bgi !== '' && bgi !== 'none') return true;
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (
      px(ps[`border-${side}-width`] ?? '') > 0 &&
      (ps[`border-${side}-style`] ?? 'none') !== 'none' &&
      !isTransparent(ps[`border-${side}-color`] ?? '')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Transcribe one `::before` / `::after`. Returns whether the pseudo EXISTS (generated
 * a box per `content`), which the caller feeds into the ::after flow-position rule —
 * a ::before box is flow content the ::after would come after.
 */
function emitPseudo(
  el: El,
  originStyle: Record<string, string>,
  originRect: Rectangle,
  which: '::before' | '::after',
  ctx: WalkContext,
  sink: VNode[],
  precededByFlowContent: boolean
): boolean {
  if (ctx.pseudoUnsupported) return false;
  let ps: Record<string, string> | undefined;
  try {
    ps = ctx.win.getComputedStyle(el, which);
  } catch {
    ctx.pseudoUnsupported = true; // e.g. jsdom — learn it once, not once per element
    return false;
  }
  if (!ps) return false;

  const rawContent = (ps['content'] ?? '').trim();
  // `content: none | normal` (or nothing readable) → the pseudo generates NO box.
  if (rawContent === '' || rawContent === 'none' || rawContent === 'normal') return false;
  if (ps['display'] === 'none' || ps['visibility'] === 'hidden') return true;
  if (parseFloat(ps['opacity'] ?? '1') === 0) return true;

  const text = parsePseudoContent(rawContent, ctx);
  const paintsBox = pseudoPaintsBox(ps);
  if (text === '' && !paintsBox) return true; // exists, but there is nothing to draw

  const w = resolveLen(ps['width'] ?? '', originRect.width);
  const h = resolveLen(ps['height'] ?? '', originRect.height);

  // The flow start of the origin's content box — where a static ::before sits.
  const flowX =
    originRect.x +
    px(originStyle['border-left-width'] ?? originStyle['borderLeftWidth'] ?? '') +
    px(originStyle['padding-left'] ?? originStyle['paddingLeft'] ?? '');
  const flowY =
    originRect.y +
    px(originStyle['border-top-width'] ?? originStyle['borderTopWidth'] ?? '') +
    px(originStyle['padding-top'] ?? originStyle['paddingTop'] ?? '');

  const pos = (ps['position'] ?? 'static').toLowerCase();
  let x: number | null;
  let y: number | null;

  if (pos === 'absolute' || pos === 'fixed') {
    // Containing block approximated by the origin box — the decorative-pseudo idiom
    // (`position: relative` origin, absolute pseudo) makes this exact.
    const left = resolveLen(ps['left'] ?? '', originRect.width);
    const right = resolveLen(ps['right'] ?? '', originRect.width);
    const top = resolveLen(ps['top'] ?? '', originRect.height);
    const bottom = resolveLen(ps['bottom'] ?? '', originRect.height);
    x =
      left !== null
        ? originRect.x + left
        : right !== null && w !== null
          ? originRect.x + originRect.width - right - w
          : left === null && right === null
            ? flowX // no offsets → the static position
            : null;
    y =
      top !== null
        ? originRect.y + top
        : bottom !== null && h !== null
          ? originRect.y + originRect.height - bottom - h
          : top === null && bottom === null
            ? flowY
            : null;
  } else {
    if (which === '::after' && precededByFlowContent) {
      ctx.warnings.push(
        'a painted ::after pseudo-element flows after content this transcriber cannot ' +
          'measure — it was skipped.'
      );
      return true;
    }
    x = flowX;
    y = flowY;
    if (pos === 'relative') {
      x += resolveLen(ps['left'] ?? '', originRect.width) ?? 0;
      y += resolveLen(ps['top'] ?? '', originRect.height) ?? 0;
    }
  }

  if (x === null || y === null) {
    ctx.warnings.push(
      `the position of a ${which} pseudo-element could not be derived — it was skipped.`
    );
    return true;
  }

  const box: Rectangle | null = w !== null && h !== null ? { x, y, width: w, height: h } : null;

  if (box && box.width > 0 && box.height > 0) {
    emitBox(ps, box, ctx, sink);
  } else if (paintsBox) {
    ctx.warnings.push(
      `a painted ${which} pseudo-element's box could not be derived (auto size) — its ` +
        'background/border was skipped.'
    );
  }

  if (text !== '') {
    const fontSize = px(ps['font-size'] ?? ps['fontSize'] ?? '12');
    const lineBox = resolveLen(ps['line-height'] ?? '', 0) ?? fontSize * 1.2;
    const textRect: Rectangle = box ?? { x, y, width: w ?? 0, height: h ?? lineBox };
    pushTextVNode(text, textRect, ps, ctx, sink);
  }
  return true;
}

// -- clipping ----------------------------------------------------------------
//
// Both clip forms become ONE def shape inside a `<clipPath id="grafloria-def-…">` —
// `rect` (optional rx) / `circle` / `ellipse` / `polygon`, in host-local user space
// (default clipPathUnits, userSpaceOnUse) — referenced by a `<g clip-path="url(#…)">`
// wrapping exactly the content the clip governs. That single-shape contract is what
// the PDF painter will consume when it learns element-level clips.

interface ClipDef {
  id: string;
  def: VNode;
}

const OVERFLOW_CLIPPING = new Set(['hidden', 'clip', 'auto', 'scroll']);

/** `overflow` that clips → the element's (rounded) border box as a clip shape. */
function overflowClipFor(style: Record<string, string>, rect: Rectangle): ClipDef | null {
  const ox = style['overflow-x'] ?? style['overflowX'] ?? style['overflow'] ?? '';
  const oy = style['overflow-y'] ?? style['overflowY'] ?? style['overflow'] ?? '';
  if (!OVERFLOW_CLIPPING.has(ox) && !OVERFLOW_CLIPPING.has(oy)) return null;
  const radius = px(style['border-top-left-radius'] ?? style['borderTopLeftRadius'] ?? '0');
  return clipShapeDef('rect', {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
    ...(radius > 0 ? { rx: round(radius) } : {}),
  });
}

/** Wrap one shape in a stably-identified `<clipPath>` def (same shape → same id). */
function clipShapeDef(type: string, props: Record<string, unknown>): ClipDef {
  const id = paintDefId({ clip: type, props });
  return {
    id,
    def: { type: 'clipPath', props: { id }, children: [{ type, props, children: [] }] },
  };
}

/**
 * A computed CSS `clip-path` → a clip def, or null. inset()/circle()/ellipse()/
 * polygon() are transcribed; path()/url()/shape() cannot be expressed as one of the
 * def shapes and are skipped WITH a warning — the content exports unclipped, which is
 * a smaller lie than clipping it wrong.
 */
function clipPathShapeFor(value: string, rect: Rectangle, ctx: WalkContext): ClipDef | null {
  const t = (value ?? '').trim();
  if (t === '' || t === 'none') return null;

  const m = /^(inset|circle|ellipse|polygon)\(([\s\S]*)\)(?:\s+([a-z-]+))?$/i.exec(t);
  if (!m) {
    ctx.warnings.push(
      'an unsupported clip-path (path()/url()/reference-box form) was skipped — that ' +
        'content is exported UNCLIPPED.'
    );
    return null;
  }
  if (m[3] && m[3].toLowerCase() !== 'border-box') {
    ctx.warnings.push(`a clip-path reference box "${m[3]}" was approximated as border-box.`);
  }

  const kind = m[1].toLowerCase();
  const args = m[2].trim();
  const shape =
    kind === 'inset'
      ? insetShape(args, rect)
      : kind === 'circle'
        ? circleShape(args, rect)
        : kind === 'ellipse'
          ? ellipseShape(args, rect)
          : polygonShape(args, rect);

  if (!shape) {
    ctx.warnings.push(`a clip-path ${kind}() could not be parsed and was skipped — that content is exported UNCLIPPED.`);
    return null;
  }
  return clipShapeDef(shape.type, shape.props);
}

interface ClipShape {
  type: string;
  props: Record<string, unknown>;
}

/** `inset(t r b l round radius)` → a (rounded) rect. Percentages resolve per axis. */
function insetShape(args: string, rect: Rectangle): ClipShape | null {
  const [offsetsPart, roundPart] = args.split(/\bround\b/i);
  const tokens = offsetsPart.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 4) return null;
  // CSS 1-to-4 expansion: t / t+lr / t+lr+b / t r b l.
  const o = [
    tokens[0],
    tokens[1] ?? tokens[0],
    tokens[2] ?? tokens[0],
    tokens[3] ?? tokens[1] ?? tokens[0],
  ];
  const top = resolveLen(o[0], rect.height);
  const right = resolveLen(o[1], rect.width);
  const bottom = resolveLen(o[2], rect.height);
  const left = resolveLen(o[3], rect.width);
  if (top === null || right === null || bottom === null || left === null) return null;

  const width = rect.width - left - right;
  const height = rect.height - top - bottom;
  if (!(width > 0) || !(height > 0)) return null;

  const radius = roundPart ? resolveLen(roundPart.trim().split(/[\s/]+/)[0] ?? '', rect.width) : null;
  return {
    type: 'rect',
    props: {
      x: round(rect.x + left),
      y: round(rect.y + top),
      width: round(width),
      height: round(height),
      ...(radius !== null && radius > 0 ? { rx: round(radius) } : {}),
    },
  };
}

/** The centre a `… at <position>` clause resolves to, in host-local pixels. */
function shapeCentre(args: string, rect: Rectangle): { cx: number; cy: number } {
  const c = parseRadialCenter(args) ?? { x: 0.5, y: 0.5 };
  return { cx: rect.x + rect.width * c.x, cy: rect.y + rect.height * c.y };
}

/** One radius token against one axis; `closest-`/`farthest-side` use the given distances. */
function shapeRadius(
  token: string,
  basis: number,
  closest: number,
  farthest: number
): number | null {
  const t = (token ?? '').trim().toLowerCase();
  if (t === '' || t === 'closest-side') return closest;
  if (t === 'farthest-side') return farthest;
  return resolveLen(t, basis);
}

function circleShape(args: string, rect: Rectangle): ClipShape | null {
  const { cx, cy } = shapeCentre(args, rect);
  const sides = [cx - rect.x, rect.x + rect.width - cx, cy - rect.y, rect.y + rect.height - cy];
  const rToken = args.split(/\bat\b/i)[0].trim();
  // A circle's percentage radius resolves against the reference-box diagonal / √2.
  const r = shapeRadius(
    rToken,
    Math.hypot(rect.width, rect.height) / Math.SQRT2,
    Math.min(...sides),
    Math.max(...sides)
  );
  if (r === null || !(r > 0)) return null;
  return { type: 'circle', props: { cx: round(cx), cy: round(cy), r: round(r) } };
}

function ellipseShape(args: string, rect: Rectangle): ClipShape | null {
  const { cx, cy } = shapeCentre(args, rect);
  const tokens = args.split(/\bat\b/i)[0].trim().split(/\s+/).filter(Boolean);
  const rx = shapeRadius(
    tokens[0] ?? '',
    rect.width,
    Math.min(cx - rect.x, rect.x + rect.width - cx),
    Math.max(cx - rect.x, rect.x + rect.width - cx)
  );
  const ry = shapeRadius(
    tokens[1] ?? tokens[0] ?? '',
    rect.height,
    Math.min(cy - rect.y, rect.y + rect.height - cy),
    Math.max(cy - rect.y, rect.y + rect.height - cy)
  );
  if (rx === null || ry === null || !(rx > 0) || !(ry > 0)) return null;
  return {
    type: 'ellipse',
    props: { cx: round(cx), cy: round(cy), rx: round(rx), ry: round(ry) },
  };
}

function polygonShape(args: string, rect: Rectangle): ClipShape | null {
  const parts = splitTopLevel(args);
  let start = 0;
  let evenodd = false;
  const first = (parts[0] ?? '').trim().toLowerCase();
  if (first === 'evenodd' || first === 'nonzero') {
    evenodd = first === 'evenodd';
    start = 1;
  }

  const points: string[] = [];
  for (let i = start; i < parts.length; i++) {
    const pair = parts[i].trim().split(/\s+/);
    if (pair.length !== 2) return null;
    const vx = resolveLen(pair[0], rect.width);
    const vy = resolveLen(pair[1], rect.height);
    if (vx === null || vy === null) return null;
    points.push(`${round(rect.x + vx)},${round(rect.y + vy)}`);
  }
  if (points.length < 3) return null;

  return {
    type: 'polygon',
    props: { points: points.join(' '), ...(evenodd ? { 'clip-rule': 'evenodd' } : {}) },
  };
}

/** 4dp is finer than any renderer resolves, and keeps the output byte-stable. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
