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
// What that CANNOT do is anything whose painting is not one of those three: images,
// background gradients, box-shadows, transforms, clipping, pseudo-elements. Those are
// reported by the caller as a fidelity risk rather than silently approximated.

import type { VNode } from '../types/vnode.types';
import type { Rectangle } from '../types/geometry.types';
import type { CustomNodeCapture } from './custom-nodes';
import { viewBoxTransform } from './custom-nodes';

/** Minimal structural view of the DOM we need — keeps this compilable without `lib.dom`. */
type El = {
  localName: string;
  namespaceURI: string | null;
  attributes: ArrayLike<{ name: string; value: string }>;
  childNodes: ArrayLike<{ nodeType: number; nodeValue: string | null }>;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  ownerDocument: { defaultView: unknown } | null;
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
    };

    walk(el, ctx);

    if (ctx.out.length === 0) return { id, rect, fidelity: 'empty' };
    return { id, rect, fidelity: 'vector', content: ctx.out };
  } catch {
    return { id, rect, fidelity: 'empty' };
  }
}

interface WalkContext {
  win: { getComputedStyle(e: unknown): Record<string, string> & { getPropertyValue(p: string): string } };
  originX: number;
  originY: number;
  scale: number;
  out: VNode[];
  budget: number;
  sawUncapturable: boolean;
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
  if (rect.width > 0 && rect.height > 0) emitBox(el, style, rect, ctx);

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

  if (!isTransparent(bg)) {
    ctx.out.push({
      type: 'rect',
      props: {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
        ...(radius > 0 ? { rx: round(radius) } : {}),
        fill: bg,
      },
      children: [],
    });
  }

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

/** 4dp is finer than any renderer resolves, and keeps the output byte-stable. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
