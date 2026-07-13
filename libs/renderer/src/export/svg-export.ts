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
import { LIGHT_THEME } from '../themes/default-light-theme';
import { createClassStyleResolver } from './style-flattener';
import { serializeVNode, escapeAttr, type ForeignObjectMode } from './vnode-serializer';

export const SVG_XMLNS = 'http://www.w3.org/2000/svg';

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
   * CSS emitted verbatim into a `<style>` inside `<defs>`. THE font seam: pass an
   * `@font-face` whose `src` is a `data:` URI and the exported file carries its
   * own glyphs. We do not fetch, subset or embed fonts for you — that is a
   * deliberate boundary, not an oversight.
   */
  embedFontCss?: string;
}

export interface SvgExportResult {
  /** The standalone SVG document. */
  svg: string;
  /** Intrinsic width in px (viewBox width × scale). */
  width: number;
  /** Intrinsic height in px. */
  height: number;
  /** Fidelity caveats hit during this export (foreignObject, unresolved vars, …). */
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
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const warnings: string[] = [];

  const viewBox = readViewBox(root);
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;

  const classStyles = createClassStyleResolver(theme, warnings);

  // Defs the serializer had to synthesize (blur filters). Filled during the walk,
  // emitted after it — hence children are serialized BEFORE the document is composed.
  const extraDefs = new Map<string, string>();

  const children = (root.children ?? [])
    .filter(child => child !== null && child !== undefined)
    .map(child =>
      serializeVNode(child, {
        classStyles,
        foreignObject: options.foreignObject,
        captureForeignObject: options.captureForeignObject,
        warnings,
        extraDefs,
      })
    )
    .join('');

  const background =
    options.backgroundColor !== undefined
      ? `<rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" ` +
        `fill="${escapeAttr(options.backgroundColor)}"/>`
      : '';

  // The font seam. CDATA-wrapped so a `>` or `&` in the caller's CSS cannot
  // break the document.
  const fontDefs = options.embedFontCss
    ? `<style type="text/css"><![CDATA[\n${options.embedFontCss}\n]]></style>`
    : '';

  const synthesized = Array.from(extraDefs.values()).join('');
  const defs = fontDefs || synthesized ? `<defs>${fontDefs}${synthesized}</defs>` : '';

  const svg =
    `<svg xmlns="${SVG_XMLNS}" ` +
    `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" ` +
    `width="${width}" height="${height}" class="grafloria-diagram">` +
    defs +
    background +
    children +
    `</svg>`;

  return { svg, width, height, warnings };
}
