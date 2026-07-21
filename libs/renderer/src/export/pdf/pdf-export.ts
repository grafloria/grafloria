// Vector PDF (Card 4) — a TRUE vector PDF with selectable, searchable text.
//
// THE DEPENDENCY DECISION (the card asks for it explicitly)
// ---------------------------------------------------------
// The named pipeline is svg2pdf.js + jsPDF. We do NOT use it, for three reasons that all
// point the same way:
//
//  1. svg2pdf.js NEEDS A DOM. It walks a live `SVGElement`, and leans on `getBBox()` and
//     `getComputedStyle()` — browser layout APIs. jsdom does not implement `getBBox` (it
//     returns zeros), so in Node it does not merely need a shim, it silently produces an
//     EMPTY PDF. Adopting it would therefore break the two things this module is FOR:
//     the DOM-free guarantee (a node-environment test pins it) and the headless-server
//     story that is Card 6's whole differentiator.
//  2. It is ~450KB (jsPDF ~350 + svg2pdf ~100) shipped to every browser consumer, to
//     re-derive a picture we already hold in a clean, fully-resolved VNode tree.
//  3. Its input would be our SVG STRING — so we would serialize a tree to XML, hand it to
//     a library to re-parse into a DOM, and have it walk that DOM. We already have the
//     tree, already flattened (every `var(--…)` resolved into a concrete value). Painting
//     straight from it is both less code and strictly more faithful.
//
// So the PDF is written directly. This is not "faking it" — the output is a real vector
// PDF: paths are paths, and text is text (`BT`/`Tj`), so it is selectable and searchable
// in any reader, and it scales without pixelation.
//
// WHAT IT COSTS — stated plainly, because these are real limits:
//   • FONTS are the PDF base-14 (Helvetica/Times/Courier). Those are built into every
//     reader, so text needs no embedded font program — but the diagram's actual face
//     (Inter, system-ui) is NOT one of them, so a PDF renders in the nearest standard
//     family. Embedding the real face would need a font parser + subsetter.
//   • TEXT OUTSIDE WinAnsi (Arabic, CJK, emoji) cannot be written with a standard font.
//     Those characters are replaced with '?' and reported in `warnings` — loudly, because
//     a silently-mangled label is worse than a missing one.
//   • GRADIENTS become their first stop's colour (PDF axial shadings exist; mapping the
//     whole paint-server model onto them is a bigger job than this card).
//   • BLURRED elements (the node drop shadow) are DROPPED. PDF has no gaussian blur, and
//     drawing the shadow un-blurred would put a hard black slab behind every node — far
//     worse than no shadow.
//   • foreignObject cannot be represented at all.
//
// Everything here is pure and deterministic: same tree ⇒ same bytes.

import type { VNode } from '../../types/vnode.types';
import type { Rectangle } from '../../types/geometry.types';
import {
  encodeWinAnsi,
  latin1Bytes,
  measureBaseFont,
  num,
  pageDimensions,
  parsePdfColor,
  parseColorAlpha,
  pdfString,
  pickBaseFont,
  PdfWriter,
  type BaseFont,
  type Orientation,
  type PageSize,
  type PdfRgb,
} from './pdf-primitives';
import { pdfCircle, pdfEllipse, pdfLine, pdfPoly, pdfRect, svgPathToPdf, type PathOps } from './pdf-path';
import { vnodeBounds } from '../bounds';
// The shared geometry module — see pdf-path.ts.
import { parseTransform, type Matrix } from '../../canvas/path-geometry';
import { createClassStyleResolver, type ClassStyleResolver } from '../style-flattener';
import { attrNameForProp, serializeStyle } from '../../vnode/patch';
import { LIGHT_THEME } from '../../themes/default-light-theme';
import type { Theme } from '../../types/theme.types';

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  /** ISO-8601. Omit for a deterministic file — a wall-clock stamp makes bytes differ. */
  creationDate?: string;
}

export interface PdfExportOptions {
  /**
   * The theme the tree was rendered with. REQUIRED for fidelity in CSS mode: a node's fill
   * and a link's stroke live in the stylesheet, not on the element, so without the theme
   * to resolve them the PDF comes out nearly blank. Defaults to LIGHT_THEME.
   */
  theme?: Theme;
  pageSize?: PageSize | { width: number; height: number };
  orientation?: Orientation;
  /** Points (1/72"). Default 36 (half an inch) on every side. */
  margin?: number | { top: number; right: number; bottom: number; left: number };
  /** The world rectangle to draw. Default: the tree's content bounds. */
  viewBox?: Rectangle;
  /** Padding around the content bounds, in world units. Default 20. */
  padding?: number;
  metadata?: PdfMetadata;
  /** Paint a page background. Default: none (white paper shows through). */
  backgroundColor?: string;
  /**
   * Pages to lay the diagram across. Supplied by the paginator (Card 5).
   *
   * `rect` is the world WINDOW mapped onto the paper — the same size on every page, so all
   * pages render at one scale. `clip` is what is actually painted, and is smaller when a
   * break was pulled in to spare a node: the page then shows white space at its edge rather
   * than half a box. A bare Rectangle means "clip = rect".
   *
   * Default: one page holding the whole diagram.
   */
  pages?: Array<Rectangle | { rect: Rectangle; clip?: Rectangle }>;
  /** Draw "n / total" at the foot of each page. Default false; the paginator turns it on. */
  pageNumbers?: boolean;
}

export interface PdfExportResult {
  pdf: Uint8Array;
  pageCount: number;
  warnings: string[];
}

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function resolveMargins(margin: PdfExportOptions['margin']): Margins {
  if (typeof margin === 'number') return { top: margin, right: margin, bottom: margin, left: margin };
  if (margin) return margin;
  return { top: 36, right: 36, bottom: 36, left: 36 };
}

/** Per-page paint state, so we emit a colour/width op only when it actually changes. */
interface PaintState {
  fill: string | null;
  stroke: string | null;
  lineWidth: number | null;
  dash: string | null;
  alpha: number | null;
  font: string | null;
}

class ContentStream {
  readonly ops: string[] = [];
  private state: PaintState = { fill: null, stroke: null, lineWidth: null, dash: null, alpha: null, font: null };
  /** ExtGState names for the alphas we used: PDF puts constant alpha in a resource dict. */
  readonly alphas = new Set<number>();
  readonly fonts = new Set<BaseFont>();

  push(op: string): void {
    this.ops.push(op);
  }

  save(): void {
    this.ops.push('q');
  }

  restore(): void {
    this.ops.push('Q');
    // A `Q` rolls the graphics state back to whatever it was at the matching `q`, and we
    // do not track that — so forget our cache rather than skip an op we still need.
    this.state = { fill: null, stroke: null, lineWidth: null, dash: null, alpha: null, font: null };
  }

  setFill(rgb: PdfRgb): void {
    const op = `${num(rgb.r)} ${num(rgb.g)} ${num(rgb.b)} rg`;
    if (this.state.fill === op) return;
    this.state.fill = op;
    this.ops.push(op);
  }

  setStroke(rgb: PdfRgb): void {
    const op = `${num(rgb.r)} ${num(rgb.g)} ${num(rgb.b)} RG`;
    if (this.state.stroke === op) return;
    this.state.stroke = op;
    this.ops.push(op);
  }

  setLineWidth(width: number): void {
    if (this.state.lineWidth === width) return;
    this.state.lineWidth = width;
    this.ops.push(`${num(width)} w`);
  }

  setDash(dash: string | null): void {
    const op = dash ? `[${dash}] 0 d` : '[] 0 d';
    if (this.state.dash === op) return;
    this.state.dash = op;
    this.ops.push(op);
  }

  setAlpha(alpha: number): void {
    const rounded = Number(alpha.toFixed(3));
    if (this.state.alpha === rounded) return;
    this.state.alpha = rounded;
    this.alphas.add(rounded);
    this.ops.push(`/GS${alphaName(rounded)} gs`);
  }

  setFont(font: BaseFont, size: number): void {
    const op = `/F${fontIndex(font)} ${num(size)} Tf`;
    if (this.state.font === op) return;
    this.state.font = op;
    this.fonts.add(font);
    this.ops.push(op);
  }

  concat(m: Matrix): void {
    this.ops.push(`${num(m.a)} ${num(m.b)} ${num(m.c)} ${num(m.d)} ${num(m.e)} ${num(m.f)} cm`);
  }
}

const BASE_FONTS: BaseFont[] = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
];

const fontIndex = (font: BaseFont): number => BASE_FONTS.indexOf(font) + 1;
const alphaName = (alpha: number): string => String(Math.round(alpha * 1000));

/** Elements that draw nothing and whose children are references. */
const NON_PAINTING = new Set([
  'defs', 'title', 'desc', 'metadata', 'linearGradient', 'radialGradient',
  'stop', 'filter', 'marker', 'clipPath', 'mask', 'pattern', 'style',
]);

function nn(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Export a rendered VNode tree as a vector PDF.
 */
export function exportPdf(root: VNode, options: PdfExportOptions = {}): PdfExportResult {
  const warnings: string[] = [];
  const margins = resolveMargins(options.margin);
  const page = pageDimensions(options.pageSize ?? 'a4', options.orientation ?? 'landscape');

  // The world rectangle(s) to draw. One page unless the paginator supplied a grid.
  const content =
    options.viewBox ??
    (() => {
      const bounds = vnodeBounds(root);
      const pad = options.padding ?? 20;
      if (!bounds) return { x: 0, y: 0, width: 100, height: 100 };
      return { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 };
    })();

  // Normalise: a bare Rectangle means "paint the whole window".
  const pages: Array<{ rect: Rectangle; clip: Rectangle }> = (
    options.pages?.length ? options.pages : [content]
  ).map(page => {
    const rect = 'rect' in page ? page.rect : page;
    const clip = 'rect' in page ? (page.clip ?? rect) : page;
    return { rect, clip };
  });

  // Gradients are resolved by id from <defs>, so collect them before painting.
  const gradients = collectGradientStops(root);
  // The stylesheet, flattened — the same resolver the SVG exporter uses.
  const classStyles = createClassStyleResolver(options.theme ?? LIGHT_THEME, warnings);

  const writer = new PdfWriter();
  const catalogId = writer.allocate();
  const pagesId = writer.allocate();

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  const streams: ContentStream[] = [];

  for (let i = 0; i < pages.length; i++) {
    pageIds.push(writer.allocate());
    contentIds.push(writer.allocate());
  }

  const boxWidth = page.width - margins.left - margins.right;
  const boxHeight = page.height - margins.top - margins.bottom;

  pages.forEach(({ rect, clip }, index) => {
    const stream = new ContentStream();
    streams.push(stream);

    // Fit the world rectangle into the page's content box, preserving aspect, centred.
    const scale = Math.min(boxWidth / rect.width, boxHeight / rect.height);
    const drawWidth = rect.width * scale;
    const drawHeight = rect.height * scale;
    const offsetX = margins.left + (boxWidth - drawWidth) / 2;
    const offsetY = margins.bottom + (boxHeight - drawHeight) / 2;

    if (options.backgroundColor) {
      const bg = parsePdfColor(options.backgroundColor);
      if (bg) {
        stream.save();
        stream.setFill(bg);
        stream.push(`0 0 ${num(page.width)} ${num(page.height)} re`);
        stream.push('f');
        stream.restore();
      }
    }

    stream.save();

    // PDF's origin is BOTTOM-left with y up; SVG's is TOP-left with y down. This one
    // matrix does the flip, the fit, and the world offset in a single CTM — so every
    // coordinate below is written in the SVG's own space and lands in the right place.
    //   x_pdf = offsetX + (x_svg - rect.x) * scale
    //   y_pdf = offsetY + drawHeight - (y_svg - rect.y) * scale
    const ctm: Matrix = {
      a: scale,
      b: 0,
      c: 0,
      d: -scale,
      e: offsetX - rect.x * scale,
      f: offsetY + drawHeight + rect.y * scale,
    };
    stream.concat(ctm);

    // Clip to what this page actually PAINTS. That is `clip`, not `rect`: when the
    // paginator pulled a break back to spare a node, the clip is narrower than the window,
    // and the page shows white space instead of a sliced-in-half box.
    stream.push(`${num(clip.x)} ${num(clip.y)} ${num(clip.width)} ${num(clip.height)} re`);
    stream.push('W n');

    paint(root, stream, { gradients, warnings, classStyles });

    stream.restore();

    if (options.pageNumbers && pages.length > 0) {
      paintPageNumber(stream, index + 1, pages.length, page, margins);
    }
  });

  // ---- assemble the document ------------------------------------------------

  const usedFonts = new Set<BaseFont>();
  const usedAlphas = new Set<number>();
  for (const stream of streams) {
    stream.fonts.forEach(f => usedFonts.add(f));
    stream.alphas.forEach(a => usedAlphas.add(a));
  }

  const fontIds = new Map<BaseFont, number>();
  for (const font of BASE_FONTS) {
    if (usedFonts.has(font)) fontIds.set(font, writer.allocate());
  }

  const fontResources = [...fontIds.entries()]
    .map(([font, id]) => `/F${fontIndex(font)} ${id} 0 R`)
    .join(' ');

  // Constant alpha lives in an ExtGState, not in an operator — /ca fill, /CA stroke.
  const alphaResources = [...usedAlphas]
    .sort((a, b) => a - b)
    .map(alpha => `/GS${alphaName(alpha)} << /Type /ExtGState /ca ${num(alpha)} /CA ${num(alpha)} >>`)
    .join(' ');

  const resources =
    `<< /Font << ${fontResources} >> ` +
    `/ExtGState << ${alphaResources} >> ` +
    `/ProcSet [/PDF /Text] >>`;

  streams.forEach((stream, index) => {
    writer.set(
      pageIds[index],
      `<< /Type /Page /Parent ${pagesId} 0 R ` +
        `/MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
        `/Resources ${resources} ` +
        `/Contents ${contentIds[index]} 0 R >>`
    );
    writer.setStream(contentIds[index], '', latin1Bytes(stream.ops.join('\n')));
  });

  for (const [font, id] of fontIds) {
    writer.set(
      id,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`
    );
  }

  writer.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

  const infoId = buildInfo(writer, options.metadata);
  writer.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  return { pdf: writer.build(catalogId, infoId), pageCount: pages.length, warnings: dedupe(warnings) };
}

function buildInfo(writer: PdfWriter, metadata?: PdfMetadata): number | null {
  if (!metadata) return null;

  const entries: string[] = [];
  const add = (key: string, value?: string) => {
    if (value) entries.push(`/${key} ${pdfString(encodeWinAnsi(value).bytes)}`);
  };

  add('Title', metadata.title);
  add('Author', metadata.author);
  add('Subject', metadata.subject);
  add('Keywords', metadata.keywords);
  entries.push('/Producer (Grafloria)');
  if (metadata.creationDate) add('CreationDate', toPdfDate(metadata.creationDate));

  const id = writer.allocate();
  writer.set(id, `<< ${entries.join(' ')} >>`);
  return id;
}

/** ISO-8601 → PDF's own `D:YYYYMMDDHHmmSS` date literal. */
function toPdfDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

interface PaintContext {
  gradients: Map<string, PdfRgb>;
  warnings: string[];
  classStyles: ClassStyleResolver;
}

/**
 * THE ELEMENT'S REAL PAINT — the CSS cascade, resolved.
 *
 * This is not optional decoration. In CSS mode (the live default) a node's fill and a
 * link's stroke are NOT on the element: they come from the injected stylesheet, and the
 * VNode carries only `class="diagram-node"`. Painting the raw props would therefore give
 * every link no stroke and every node no fill — i.e. a nearly BLANK PDF. (It did. That is
 * how this was found.)
 *
 * So the same flattener the SVG exporter uses is applied here, in the same CSS priority
 * order — presentation attribute < author rule < inline style — and keys are normalised
 * through `attrNameForProp`, the mapping SHARED with the DOM patcher. Sharing it is what
 * stops a `strokeWidth` prop and a `stroke-width` rule from both surviving and the wrong
 * one winning.
 */
function resolved(vnode: VNode, ctx: PaintContext): Record<string, string> {
  const props = vnode.props ?? {};
  const out: Record<string, string> = {};

  // (1) presentation attributes — the lowest layer
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (value === null || value === undefined || typeof value === 'function') continue;
    if (key === 'style' || key === 'className' || key === 'textContent' || key === 'innerHTML') continue;
    out[attrNameForProp(key)] = String(value);
  }

  // (2) the stylesheet — an author rule BEATS a presentation attribute
  const className = props['className'];
  if (typeof className === 'string' && className.trim() !== '') {
    Object.assign(out, ctx.classStyles(className.trim().split(/\s+/)));
  }

  // (3) the element's own inline style — the cascade's winner
  const style = serializeStyle(props['style']);
  if (style) {
    for (const declaration of style.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const prop = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (prop && value) out[prop] = value;
    }
  }

  return out;
}

/** A gradient's FIRST stop — what a gradient fill degrades to. See the header. */
function collectGradientStops(root: VNode): Map<string, PdfRgb> {
  const out = new Map<string, PdfRgb>();

  const walk = (vnode: VNode): void => {
    if (!vnode || typeof vnode !== 'object') return;

    if (vnode.type === 'linearGradient' || vnode.type === 'radialGradient') {
      const id = vnode.props?.['id'];
      const firstStop = (vnode.children ?? []).find(c => c?.type === 'stop');
      const color = parsePdfColor(firstStop?.props?.['stopColor'] ?? firstStop?.props?.['stop-color']);
      if (typeof id === 'string' && color) out.set(id, color);
    }

    for (const child of vnode.children ?? []) walk(child);
  };

  walk(root);
  return out;
}

/**
 * Walk the tree, painting into the content stream.
 *
 * There is no parent-matrix parameter here on purpose: PDF's CTM is STATEFUL, and `q`/`Q`
 * are a real stack. So a group's transform is pushed with `cm` and popped with `Q`, and
 * the composition happens in the PDF itself — exactly as it does in SVG. Threading an
 * accumulated matrix through as well would apply every transform twice.
 */
function paint(vnode: VNode, stream: ContentStream, ctx: PaintContext): void {
  if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string') return;

  if (NON_PAINTING.has(vnode.type)) return;

  // The CASCADE, resolved — see `resolved()`. Everything below reads from this map, never
  // from the raw props, because in CSS mode the raw props carry no paint at all.
  const style = resolved(vnode, ctx);
  if (style['display'] === 'none') return;

  if (vnode.type === 'foreignObject') {
    ctx.warnings.push(
      'foreignObject cannot be represented in PDF (it is HTML, and PDF has no HTML) — omitted. ' +
        'Nodes rendered as HTML components will be missing from the PDF.'
    );
    return;
  }

  // Images: this writer has no image XObject support (rect/line/path/text/circle/ellipse/
  // polygon only), so an <image> cannot be drawn. Report it rather than dropping it
  // silently — the SVG export carries the image faithfully; the PDF simply cannot.
  if (vnode.type === 'image') {
    ctx.warnings.push(
      'an <image> was omitted from the PDF — PDF image embedding (XObjects) is not implemented. ' +
        'The SVG export renders it; the PDF cannot.'
    );
    return;
  }

  // A blur is a filter, and PDF has no filters. Dropping the element beats drawing the
  // node shadow as a hard black slab.
  const filter = style['filter'];
  if (typeof filter === 'string' && /blur\(|url\(#grafloria-blur/.test(filter)) {
    ctx.warnings.push('blurred elements (the node drop shadow) are omitted — PDF has no gaussian blur');
    return;
  }

  const local = parseTransform(style['transform']);
  const hasTransform = !isIdentity(local);

  if (hasTransform) {
    stream.save();
    stream.concat(local);
  }

  drawElement(vnode, style, stream, ctx);

  for (const child of vnode.children ?? []) {
    if (child && typeof child === 'object') paint(child, stream, ctx);
  }

  if (hasTransform) stream.restore();
}

function isIdentity(m: Matrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

/** Resolve a paint value, following `url(#grad)` into the collected stops. */
function resolvePaint(value: unknown, ctx: PaintContext): PdfRgb | null {
  if (typeof value === 'string') {
    const ref = /^url\(#([^)]+)\)$/.exec(value.trim());
    if (ref) {
      const stop = ctx.gradients.get(ref[1]);
      if (stop) {
        ctx.warnings.push(
          'a gradient fill was flattened to its first stop — PDF axial shadings are not implemented'
        );
        return stop;
      }
      return null;
    }
  }
  return parsePdfColor(value);
}

function drawElement(
  vnode: VNode,
  style: Record<string, string>,
  stream: ContentStream,
  ctx: PaintContext
): void {
  if (vnode.type === 'text') {
    drawText(vnode, style, stream, ctx);
    return;
  }

  const ops = geometryOps(vnode, style);
  if (!ops || ops.length === 0) return;

  const fill = resolvePaint(style['fill'], ctx);
  const stroke = resolvePaint(style['stroke'], ctx);
  // `1px` is a legal CSS width and `Number('1px')` is NaN — parseFloat, not Number.
  const strokeWidth = len(style['stroke-width'], 1);

  const willFill = fill !== null;
  const willStroke = stroke !== null && strokeWidth > 0;
  if (!willFill && !willStroke) return;

  const alpha =
    nn(style['opacity'], 1) *
    nn(style['fill-opacity'], 1) *
    (fill ? parseColorAlpha(style['fill']) : 1);

  stream.save();

  if (alpha < 1) stream.setAlpha(Math.max(0, alpha));
  if (willFill) stream.setFill(fill);
  if (willStroke) {
    stream.setStroke(stroke);
    stream.setLineWidth(strokeWidth);
    stream.setDash(normaliseDash(style['stroke-dasharray']));
  }

  for (const op of ops) stream.push(op);

  // B = fill then stroke; f = fill; S = stroke.
  stream.push(willFill && willStroke ? 'B' : willFill ? 'f' : 'S');
  stream.restore();
}

/**
 * A CSS length → number. `parseFloat`, because the flattener emits real CSS values and
 * `stroke-width: 1px` is one of them — `Number('1px')` is NaN, which would silently turn
 * every themed stroke into width 0 (i.e. invisible links).
 */
function len(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** `"5,5"` / `"5 5"` → `"5 5"` (PDF wants a space-separated array). */
function normaliseDash(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === 'none') return null;
  const parts = value
    .split(/[\s,]+/)
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 0);
  return parts.length ? parts.map(num).join(' ') : null;
}

function geometryOps(vnode: VNode, style: Record<string, string>): PathOps | null {
  switch (vnode.type) {
    case 'rect':
      return pdfRect(
        len(style['x']),
        len(style['y']),
        len(style['width']),
        len(style['height']),
        len(style['rx']),
        len(style['ry'])
      );

    case 'circle': {
      const r = len(style['r']);
      return r > 0 ? pdfCircle(len(style['cx']), len(style['cy']), r) : null;
    }

    case 'ellipse':
      return pdfEllipse(len(style['cx']), len(style['cy']), len(style['rx']), len(style['ry']));

    case 'line':
      return pdfLine(len(style['x1']), len(style['y1']), len(style['x2']), len(style['y2']));

    case 'polygon':
    case 'polyline':
      return pdfPoly(style['points'], vnode.type === 'polygon');

    case 'path': {
      const d = style['d'];
      return typeof d === 'string' && d.trim() !== '' ? svgPathToPdf(d) : null;
    }

    default:
      return null; // g, svg, tspan: containers, no geometry of their own
  }
}

function parsePoints(points: unknown): Array<[number, number]> {
  if (typeof points !== 'string') return [];
  const nums = points.trim().split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

/**
 * Real PDF text: `BT … Tj … ET`. Selectable, searchable, copy-pasteable.
 *
 * The one fiddly bit is the TEXT MATRIX. The page CTM flips y (PDF is y-up, SVG is
 * y-down), and text drawn under that flip would come out MIRRORED. So the text matrix
 * un-flips locally — `1 0 0 -1 x y` — which puts the glyphs upright at the right place.
 */
function drawText(
  vnode: VNode,
  style: Record<string, string>,
  stream: ContentStream,
  ctx: PaintContext
): void {
  const content = textContentOf(vnode);
  if (!content.trim()) return;

  // `font-size: 14px` — parseFloat, not Number (see `len`).
  const fontSize = len(style['font-size'], 12);
  if (fontSize <= 0) return;

  const font = pickBaseFont(style['font-family'], style['font-weight'], style['font-style']);

  const fill = resolvePaint(style['fill'] ?? style['color'], ctx) ?? { r: 0, g: 0, b: 0 };
  const anchor = String(style['text-anchor'] ?? 'start');

  const x = len(style['x']);
  const y = len(style['y']);

  const lines = content.split('\n');
  const opacity = nn(style['opacity'], 1) * nn(style['fill-opacity'], 1);

  stream.save();
  if (opacity < 1) stream.setAlpha(Math.max(0, opacity));
  stream.setFill(fill);
  stream.setFont(font, fontSize);

  lines.forEach((line, index) => {
    const encoded = encodeWinAnsi(line);
    if (encoded.unsupported.length > 0) {
      ctx.warnings.push(
        `text "${line}" contains characters the PDF base-14 fonts cannot encode ` +
          `(${[...new Set(encoded.unsupported)].join('')}) — they are replaced with '?'. ` +
          `Embedding a font that covers them would need a font subsetter, which this exporter does not have.`
      );
    }

    const width = measureBaseFont(font, line, fontSize);
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const lineY = y + index * fontSize;

    stream.push('BT');
    // Un-flip: the page CTM has d = -scale, so without this the glyphs render upside down.
    stream.push(`1 0 0 -1 ${num(left)} ${num(lineY)} Tm`);
    stream.push(`${pdfString(encoded.bytes)} Tj`);
    stream.push('ET');
  });

  stream.restore();
}

function textContentOf(vnode: VNode): string {
  const own = vnode.props?.['textContent'];
  if (typeof own === 'string' && own !== '') return own;

  const lines: string[] = [];
  for (const child of vnode.children ?? []) {
    if (typeof child === 'string') {
      lines.push(child);
    } else if (child && typeof child === 'object') {
      const nested = textContentOf(child);
      if (nested) lines.push(nested);
    }
  }
  return lines.join('\n');
}

/** "3 / 7", centred in the bottom margin. Drawn OUTSIDE the clipped content area. */
function paintPageNumber(
  stream: ContentStream,
  page: number,
  total: number,
  size: { width: number; height: number },
  margins: Margins
): void {
  const label = `${page} / ${total}`;
  const fontSize = 9;
  const width = measureBaseFont('Helvetica', label, fontSize);

  stream.save();
  stream.setFill({ r: 0.4, g: 0.4, b: 0.4 });
  stream.setFont('Helvetica', fontSize);
  stream.push('BT');
  stream.push(`${num((size.width - width) / 2)} ${num(Math.max(12, margins.bottom / 2))} Td`);
  stream.push(`${pdfString(encodeWinAnsi(label).bytes)} Tj`);
  stream.push('ET');
  stream.restore();
}

function dedupe(warnings: string[]): string[] {
  return [...new Set(warnings)];
}
