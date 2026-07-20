// The standalone SVG document: a pure function from the renderer's VNode tree to
// a self-contained, styles-inlined SVG string.
//
// GUARANTEES (each one is pinned by a test in svg-export.spec.ts):
//   • no `var(--…)`            — the theme cascade is RESOLVED, not referenced
//   • no external references   — no http(s), no `<image href>`, no @import, no
//                                webfont URL: every `url(#…)` points inside the
//                                document's own `<defs>`
//   • deterministic            — same tree + same options ⇒ byte-identical string,
//                                every time, in any process
//   • zero DOM                 — plain Node, a worker, an SSR pass; no `document`
//
// WHAT IS NOT GUARANTEED (be blunt — see README of the card):
//   • FONTS are declared (`font-family: …`), not embedded. Glyphs still come from
//     the machine that renders the file. Pass `embedFontCss` with a @font-face
//     whose src is a data: URI to make the file truly self-contained; we do NOT
//     subset or convert text to paths.
//   • CSS ANIMATIONS are not exported. A static picture has no time axis, so an
//     animated link exports as its base (un-dashed) stroke.
//   • foreignObject content is host-mounted DOM, not VNode — see the serializer.

import type { VNode } from '../types/vnode.types';
import type { Theme } from '../types/theme.types';
import type { Rectangle } from '../types/geometry.types';
import { LIGHT_THEME } from '../themes/default-light-theme';
import { createClassStyleResolver } from './style-flattener';
import { serializeVNode, escapeAttr, type ForeignObjectMode } from './vnode-serializer';
import { clampOutputSize, DEFAULT_MAX_OUTPUT_SIZE, padRect, vnodeBounds } from './bounds';
import { filterTreeByIds } from './scope';
import {
  customNodeBounds,
  customNodeVNodes,
  filterCaptures,
  type CustomNodeCapture,
  type HtmlFallbackMode,
} from './custom-nodes';
import { embedModelInSvg } from './round-trip';
import { fontFaceCss, type FontSource } from './assets';
import type { DiagramDocumentEnvelope } from '@grafloria/engine';

export const SVG_XMLNS = 'http://www.w3.org/2000/svg';

/** The XML prolog. Required by strict XML parsers and by most SVG→PDF toolchains. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';

export interface SvgExportOptions {
  /**
   * The theme whose values get baked into the output. MUST be the theme the tree
   * was rendered with — it is the source of every `--grafloria-*` value the live
   * stylesheet would have supplied. Defaults to LIGHT_THEME.
   */
  theme?: Theme;

  /**
   * Multiplies the SVG's `width`/`height` (its intrinsic size) while the
   * `viewBox` stays put — so the picture is unchanged, just rendered larger. This
   * is what makes a 2x PNG a 2x PNG.
   */
  scale?: number;

  /** Painted as a full-viewBox rect behind everything. Default: transparent. */
  backgroundColor?: string;

  /** What to do with `<foreignObject>` subtrees. Default `'serialize'`. */
  foreignObject?: ForeignObjectMode;

  /** Supply the live HTML inside a foreignObject (browser-side callers). */
  captureForeignObject?: (vnode: VNode) => string | undefined;

  /**
   * CUSTOM-NODE CONTENT — the widgets an HTML-layer node paints, which the VNode tree
   * does not contain and cannot contain (the renderer emits an empty `<g>` for those
   * nodes; the page paints a raw HTML host that is a SIBLING of the SVG).
   *
   * Plain data, captured by whoever has the DOM — `createDiagram` does it for you.
   * Passing it keeps this function pure: no element ever reaches here.
   * See `capture-host.ts` for the capture and `custom-nodes.ts` for the placement.
   */
  customNodes?: readonly CustomNodeCapture[];

  /**
   * What to do with a custom node that could only be captured as HTML. Default
   * `'foreignObject'`. Whatever you choose, it is REPORTED in `warnings` — a widget
   * that cannot make it into the file faithfully never does so quietly.
   */
  htmlFallback?: HtmlFallbackMode;

  /**
   * CSS emitted verbatim into a `<style>` inside `<defs>`. THE font seam: pass an
   * `@font-face` whose `src` is a `data:` URI and the exported file carries its
   * own glyphs. We do not fetch, subset or embed fonts for you — that is a
   * deliberate boundary, not an oversight.
   */
  embedFontCss?: string;

  /**
   * Fonts to EMBED as base64 `@font-face` rules — the built form of the `embedFontCss` seam.
   * Both are honoured; `embedFontCss` is appended after these.
   */
  embedFonts?: FontSource[];

  /**
   * Fit the viewBox to the CONTENT — the union box of everything the tree actually
   * draws (labels, ports and arrowheads included), not the root's own viewBox.
   *
   * The root `<svg>`'s viewBox is the live VIEWPORT: it is scoped to what the user
   * is looking at, and at any zoom but 1 it is not even the same rectangle. A file
   * wants the diagram, so this defaults to ON. Turn it off to keep the tree's own
   * viewBox verbatim (that is what a pagination tile does — it has already chosen
   * its rectangle).
   */
  fitToContent?: boolean;

  /** Margin around the fitted content box, in world units. Default 20. */
  padding?: number;

  /**
   * Export ONLY these node/link ids. The tree is pruned to them (not merely cropped
   * — an un-selected node outside the viewBox is invisible but its markup, and its
   * labels, would still be in the bytes) and the box is fitted around them.
   */
  includeIds?: Iterable<string>;

  /** Use this exact viewBox and fit nothing. Wins over `fitToContent`. */
  viewBox?: Rectangle;

  /**
   * Cap on the output's intrinsic size, per side, in px. Default 4000. The scale is
   * REDUCED to fit rather than the picture being cropped — see `clampOutputSize`.
   */
  maxSize?: number;

  /** Floor on the output's intrinsic size, per side, in px. Default 1. */
  minSize?: number;

  /** Prepend the `<?xml …?>` prolog. Default false (an inline `<svg>` must not have one). */
  xmlDeclaration?: boolean;

  /**
   * Embed this document envelope in the SVG's `<metadata>`, making the exported file
   * an EDITABLE artifact: re-import it and get the diagram back, losslessly.
   *
   * Takes the envelope rather than building one, because an envelope carries a
   * `createdAt` — and minting a timestamp in here would make the export
   * non-deterministic, which is a guarantee this module does not get to break.
   * `SVGRenderer.export` builds it for you (see `ExportOptions.embedModel`).
   */
  embedModel?: DiagramDocumentEnvelope;
}

export interface SvgExportResult {
  /** The standalone SVG document. */
  svg: string;
  /** Intrinsic width in px (viewBox width × the CLAMPED scale). */
  width: number;
  /** Intrinsic height in px. */
  height: number;
  /** The world rectangle the document actually covers — what pagination and PDF page off. */
  viewBox: ViewBox;
  /** Fidelity caveats hit during this export (foreignObject, unresolved vars, size clamp, …). */
  warnings: string[];
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read the root `<svg>` VNode's viewBox — or synthesize one from width/height. */
function readViewBox(root: VNode): ViewBox {
  const raw = root.props?.['viewBox'];
  if (typeof raw === 'string') {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  // The empty-diagram root carries width/height instead of a viewBox.
  const width = Number(root.props?.['width'] ?? 0);
  const height = Number(root.props?.['height'] ?? 0);
  return { x: 0, y: 0, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
}

/**
 * Serialize a rendered VNode tree to a standalone SVG string.
 *
 * @param root the root `<svg>` VNode from `SVGRenderer.render(viewport, zoom)`
 */
export function exportSvg(root: VNode, options: SvgExportOptions = {}): SvgExportResult {
  const theme = options.theme ?? LIGHT_THEME;
  const requestedScale = options.scale && options.scale > 0 ? options.scale : 1;
  const warnings: string[] = [];

  // (1) SCOPE — prune before anything else, so the box is fitted to what survives.
  const tree = options.includeIds !== undefined ? filterTreeByIds(root, options.includeIds) : root;

  // Custom-node content is scoped by the SAME ids. A capture is keyed by node id, so
  // `includeIds` prunes widgets exactly as it prunes nodes.
  const captures = filterCaptures(options.customNodes ?? [], options.includeIds);
  const custom = customNodeVNodes(captures, { htmlFallback: options.htmlFallback });
  warnings.push(...custom.warnings);

  // (2) THE BOX. Priority: an explicit viewBox, else the content fit (the default —
  // the root's own viewBox is the live viewport, which is not what a file wants),
  // else the tree's viewBox verbatim.
  const viewBox = resolveViewBox(tree, options, warnings, captures);

  // (3) SIZE, capped.
  //
  // NO CAP BY DEFAULT HERE. The cap exists to stop a canvas request the browser will
  // silently refuse — and an SVG allocates no canvas. It is a VECTOR document: a
  // 9000px-wide intrinsic size costs nothing and still renders sharp at any size, so
  // clamping it would shrink a perfectly good file for no reason.
  //
  // The raster path (`SVGRenderer.export('png'|…)`) therefore passes the real cap in
  // explicitly. A caller who wants an SVG capped too can pass `maxSize`.
  const clamped = clampOutputSize(
    viewBox.width,
    viewBox.height,
    requestedScale,
    options.maxSize ?? Infinity,
    options.minSize ?? 1
  );
  if (clamped.warning) warnings.push(clamped.warning);

  const width = clamped.width;
  const height = clamped.height;

  const classStyles = createClassStyleResolver(theme, warnings);

  // Defs the serializer had to synthesize (blur filters). Filled during the walk,
  // emitted after it — hence children are serialized BEFORE the document is composed.
  const extraDefs = new Map<string, string>();

  const serialize = (child: VNode): string =>
    serializeVNode(child, {
      classStyles,
      foreignObject: options.foreignObject,
      captureForeignObject: options.captureForeignObject,
      warnings,
      extraDefs,
    });

  // Custom nodes are serialized LAST, so they paint above the diagram — the same
  // stacking the live page has, where `.grafloria-html-layer` sits on top of the SVG layer.
  const children =
    (tree.children ?? [])
      .filter(child => child !== null && child !== undefined)
      .map(serialize)
      .join('') + custom.nodes.map(serialize).join('');

  const background =
    options.backgroundColor !== undefined
      ? `<rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" ` +
        `fill="${escapeAttr(options.backgroundColor)}"/>`
      : '';

  // The font seam. CDATA-wrapped so a `>` or `&` in the caller's CSS cannot
  // break the document.
  const embedded = options.embedFonts?.length ? fontFaceCss(options.embedFonts) : '';
  const fontCss = [embedded, options.embedFontCss].filter(Boolean).join('\n');
  const fontDefs = fontCss ? `<style type="text/css"><![CDATA[\n${fontCss}\n]]></style>` : '';

  const synthesized = Array.from(extraDefs.values()).join('');
  const defs = fontDefs || synthesized ? `<defs>${fontDefs}${synthesized}</defs>` : '';

  const prolog = options.xmlDeclaration ? XML_DECLARATION : '';

  let svg =
    prolog +
    `<svg xmlns="${SVG_XMLNS}" ` +
    `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" ` +
    `width="${width}" height="${height}" class="grafloria-diagram">` +
    defs +
    background +
    children +
    `</svg>`;

  // The source model, carried inside the picture (Card 7). Injected AFTER composition
  // so it cannot disturb the serializer's byte layout when it is absent.
  if (options.embedModel) {
    svg = embedModelInSvg(svg, options.embedModel);
  }

  return { svg, width, height, viewBox, warnings };
}

/**
 * The rectangle the file covers.
 *
 * DEFAULT: fit the content. The root `<svg>`'s own viewBox is the LIVE VIEWPORT —
 * scoped to what the user happens to be looking at, and at any zoom ≠ 1 not even the
 * same rectangle. Exporting it is how a "download PNG" button produces a picture of
 * the user's scroll position instead of a picture of the diagram.
 */
function resolveViewBox(
  tree: VNode,
  options: SvgExportOptions,
  warnings: string[],
  captures: readonly CustomNodeCapture[] = []
): ViewBox {
  if (options.viewBox) return options.viewBox;

  if (options.fitToContent !== false) {
    const drawn = vnodeBounds(tree, {
      includeIds: options.includeIds ? new Set(options.includeIds) : undefined,
    });

    // The custom nodes' own rects join the fit. Two reasons this is not optional:
    // a lifted chart hides its geometry behind a `<g transform>` and a foreignObject's
    // content is opaque, so `vnodeBounds` under-measures a board — and on an ALL-custom
    // dashboard it measures nothing at all and the file comes out a 40px square.
    const content = unionRects(drawn, customNodeBounds(captures));
    if (content) return padRect(content, options.padding ?? 20);

    // Nothing is drawn. A zero-area document is rejected by rasterizers, so emit a
    // small valid square instead of a degenerate one.
    if (options.includeIds !== undefined) {
      warnings.push('nothing to export: no element matched the requested ids');
    }
    const side = Math.max(1, (options.padding ?? 20) * 2);
    return { x: 0, y: 0, width: side, height: side };
  }

  return readViewBox(tree);
}

/** Union of two optional rectangles — either, both, or neither. */
function unionRects(a: Rectangle | null, b: Rectangle | null): Rectangle | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
