// CUSTOM-NODE EXPORT — the widget content that used to export as nothing at all.
//
// THE BUG THIS CLOSES
// -------------------
// A node with `metadata.useHTMLLayer` is not drawn by the renderer. `renderNode()`
// returns an EMPTY `<g>` for it (see svg-renderer.ts) because its pixels are painted
// by the page, into a raw HTML host that lives in `.grafloria-html-layer` — a sibling of
// the SVG, not part of it. So every export path saw an empty group and faithfully
// exported an empty group: a dashboard of six widgets exported as SIX EMPTY `<g>`s.
// Not even a box. And nothing said so.
//
// THE SEAM
// --------
// The content is in the DOM, and only the DOM knows it. So the capture happens at the
// boundary that HAS a DOM (`createDiagram` owns the hosts — see `capture-host.ts`) and
// hands this module a `CustomNodeCapture`: PLAIN DATA, no elements, no live nodes.
// Everything from here down is pure.
//
// WHY VNodes AND NOT MARKUP
// -------------------------
// The obvious move is to capture an SVG/HTML *string* and paste it into the output.
// That would work for the SVG target and for nothing else. The renderer has THREE
// consumers of a picture and they all read VNodes, not strings:
//
//   • `serializeVNode`  → the standalone SVG document
//   • `paint()`          → the true-vector PDF writer (pdf/pdf-export.ts)
//   • `vnodeBounds`      → the content-fit box, which decides the viewBox
//
// Capturing a display list of VNodes therefore makes ONE representation serve all
// three: the widget lands in the SVG, in the PDF *as real vector*, and in the box the
// export fits itself to. A string would have been invisible to the latter two.
//
// WHY THE viewBox IS BAKED INTO A TRANSFORM
// -----------------------------------------
// A lifted chart is an inline `<svg viewBox="0 0 640 250">` that the browser fits into
// the host box for us. Emitting it as a NESTED `<svg>` would keep that magic in the SVG
// target and lose it everywhere else: our PDF painter walks children but implements no
// viewBox mapping, so every chart would paint at raw viewBox coordinates — wrong scale,
// wrong place, off the page. So `viewBoxTransform()` resolves the fit ONCE, here, into
// an ordinary `translate/scale` on a `<g>` — which the serializer, the PDF painter and
// the bounds walker all already understand, identically.

import type { VNode } from '../types/vnode.types';
import type { Rectangle } from '../types/geometry.types';

/**
 * How faithfully a host's content could be captured.
 *
 * - `vector` the host's paint was transcribed to SVG primitives. Exact, and it
 *   survives every target including PDF.
 * - `html`   the host holds markup we could not transcribe. The SVG target can carry
 *   it in a `<foreignObject>` (browsers render it); PDF and most standalone
 *   rasterizers cannot. Always warned about.
 * - `empty`  nothing capturable. A marked box plus a warning — never a silent blank.
 */
export type CustomNodeFidelity = 'vector' | 'html' | 'empty';

/** What the DOM boundary hands the pure layer for one custom node. */
export interface CustomNodeCapture {
  /** The node id — carried onto the group, and what `includeIds` scoping matches. */
  id: string;
  /** The node's WORLD rect (position + size), i.e. where to place the content. */
  rect: Rectangle;
  fidelity: CustomNodeFidelity;
  /**
   * The transcribed display list, in HOST-RELATIVE coordinates (0,0 = the host's
   * top-left). Placed by translating to `rect`. Only for `fidelity: 'vector'`.
   */
  content?: VNode[];
  /** Raw XHTML for the `foreignObject` attempt. Only for `fidelity: 'html'`. */
  html?: string;
}

/** What to do with a capture we could only get as HTML. */
export type HtmlFallbackMode = 'foreignObject' | 'placeholder' | 'omit';

export interface CustomNodeOptions {
  /**
   * How to export a `fidelity: 'html'` capture. Default `'foreignObject'` — the
   * honest best effort: browsers render it, so an SVG opened in a browser or placed
   * in a web page is correct. It is still reported as a fidelity risk, because a PDF
   * and most standalone rasterizers will drop it.
   */
  htmlFallback?: HtmlFallbackMode;
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** Deterministic number formatting — no `-0`, no float noise, no locale. */
export function n(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * The transform that maps a `viewBox` onto a rect the way `preserveAspectRatio` says
 * — the fit an inline `<svg>` gets from the browser for free, resolved into an
 * ordinary affine transform so every target can honour it.
 *
 * Supports the two forms that actually occur: `none` (stretch each axis
 * independently) and `x??Y?? meet` (uniform scale, then align). `slice` is treated as
 * `meet`: over-filling the widget box would paint a chart over its neighbours, and a
 * chart that is slightly small is a far smaller lie than one that overlaps.
 */
export function viewBoxTransform(
  viewBox: Rectangle,
  rect: { width: number; height: number },
  preserveAspectRatio = 'xMidYMid meet'
): string {
  const vw = viewBox.width;
  const vh = viewBox.height;
  if (!(vw > 0) || !(vh > 0)) return '';

  const par = preserveAspectRatio.trim().toLowerCase();
  const parts: string[] = [];

  if (par.startsWith('none')) {
    const sx = rect.width / vw;
    const sy = rect.height / vh;
    if (sx !== 1 || sy !== 1) parts.push(`scale(${n(sx)} ${n(sy)})`);
  } else {
    const s = Math.min(rect.width / vw, rect.height / vh);
    // Alignment of the leftover space. Default (and the kit's own) is Mid/Mid.
    const free = { x: rect.width - vw * s, y: rect.height - vh * s };
    const alignX = par.includes('xmin') ? 0 : par.includes('xmax') ? free.x : free.x / 2;
    const alignY = par.includes('ymin') ? 0 : par.includes('ymax') ? free.y : free.y / 2;
    if (alignX !== 0 || alignY !== 0) parts.push(`translate(${n(alignX)} ${n(alignY)})`);
    if (s !== 1) parts.push(`scale(${n(s)})`);
  }

  // The viewBox origin, undone last (applied first, innermost).
  if (viewBox.x !== 0 || viewBox.y !== 0) parts.push(`translate(${n(-viewBox.x)} ${n(-viewBox.y)})`);

  return parts.join(' ');
}

/**
 * Turn captures into VNodes ready to append to the exported tree.
 *
 * Pure: same captures in, same VNodes and same warnings out. Order follows the input,
 * which the boundary builds from the model's node order — so an export is byte-stable.
 */
export function customNodeVNodes(
  captures: readonly CustomNodeCapture[],
  options: CustomNodeOptions = {}
): { nodes: VNode[]; warnings: string[] } {
  const warnings: string[] = [];
  const nodes: VNode[] = [];
  const htmlFallback = options.htmlFallback ?? 'foreignObject';

  for (const capture of captures) {
    const node = customNodeVNode(capture, htmlFallback, warnings);
    if (node) nodes.push(node);
  }

  return { nodes, warnings };
}

function customNodeVNode(
  capture: CustomNodeCapture,
  htmlFallback: HtmlFallbackMode,
  warnings: string[]
): VNode | null {
  const { id, rect } = capture;

  if (capture.fidelity === 'vector') {
    const content = capture.content ?? [];
    if (content.length === 0) {
      // Claimed vector, transcribed to nothing — that is the silent blank we exist to
      // prevent, so it degrades to the empty case rather than emitting a bare group.
      return emptyCustomNode(capture, warnings, 'its captured content was empty');
    }
    return {
      type: 'g',
      key: `custom-node-${id}`,
      props: {
        className: 'grafloria-custom-node',
        'data-node-id': id,
        transform: `translate(${n(rect.x)} ${n(rect.y)})`,
      },
      children: content,
    };
  }

  if (capture.fidelity === 'html') {
    const html = capture.html ?? '';

    if (htmlFallback === 'omit') {
      warnings.push(
        `custom node "${id}" is HTML and was DROPPED (htmlFallback: "omit") — it is missing from this export.`
      );
      return null;
    }

    if (htmlFallback === 'placeholder' || html === '') {
      warnings.push(
        `custom node "${id}" is HTML and was exported as a PLACEHOLDER BOX, not its content` +
          (html === '' ? ' (nothing to embed)' : ' (htmlFallback: "placeholder")') +
          '.'
      );
      return placeholderRect(capture);
    }

    warnings.push(
      `custom node "${id}" could not be transcribed to vector; embedded as <foreignObject> HTML. ` +
        'Browsers render this, but PDF and most standalone SVG rasterizers (resvg, librsvg, ' +
        'Inkscape CLI) IGNORE foreignObject — in those targets this widget will be blank.'
    );

    return {
      type: 'foreignObject',
      key: `custom-node-${id}`,
      props: {
        className: 'grafloria-custom-node',
        'data-node-id': id,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: [
        {
          type: 'div',
          props: { xmlns: XHTML_NS, innerHTML: html },
          children: [],
        },
      ],
    };
  }

  return emptyCustomNode(capture, warnings, 'its host was empty or unreadable');
}

function emptyCustomNode(capture: CustomNodeCapture, warnings: string[], why: string): VNode {
  warnings.push(
    `custom node "${capture.id}" exported as an EMPTY BOX — ${why}. ` +
      'Its content is not in this file.'
  );
  return placeholderRect(capture);
}

/** The visible "something belongs here" marker. Never nothing. */
function placeholderRect(capture: CustomNodeCapture): VNode {
  const { id, rect } = capture;
  return {
    type: 'rect',
    key: `custom-node-${id}`,
    props: {
      className: 'grafloria-custom-node grafloria-custom-node-placeholder',
      'data-node-id': id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      fill: 'none',
      stroke: '#94a3b8',
      'stroke-width': 1,
      'stroke-dasharray': '4,4',
    },
    children: [],
  };
}

/**
 * The union of the captures' world rects.
 *
 * Needed because a lifted chart is a `<g transform>` full of nested geometry and a
 * `foreignObject`'s content is opaque — so `vnodeBounds` alone can under-measure a
 * board. On an all-custom-node dashboard it would find NOTHING and fit the file to a
 * 40px square. The node rects are the truth about where the widgets are, so the box
 * is fitted to those as well.
 */
export function customNodeBounds(
  captures: readonly CustomNodeCapture[],
  includeIds?: ReadonlySet<string>
): Rectangle | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const capture of captures) {
    if (includeIds && !includeIds.has(capture.id)) continue;
    const { x, y, width, height } = capture.rect;
    if (![x, y, width, height].every(Number.isFinite)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Keep only the captures whose node id is in `ids` — the `includeIds` scoping rule. */
export function filterCaptures(
  captures: readonly CustomNodeCapture[],
  ids: Iterable<string> | undefined
): readonly CustomNodeCapture[] {
  if (ids === undefined) return captures;
  const set = ids instanceof Set ? (ids as Set<string>) : new Set(ids);
  return captures.filter(capture => set.has(capture.id));
}
