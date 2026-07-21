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
//   • GRADIENT FILLS are REAL: linear → /ShadingType 2, radial → /ShadingType 3, painted
//     as `sh` clipped to the shape (see drawGradientFill for why not a pattern fill).
//     What still flattens to the first stop: gradient STROKES (a shading through a stroke
//     needs the stroke's outline as a clip, which we do not build) and gradient-filled
//     TEXT (needs text-as-clip). Stop OPACITY renders opaque and warns — a shading SMask
//     is a whole transparency-group machinery. Each of these warns.
//   • IMAGES embed as real XObjects for data: PNGs (incl. RGBA — the alpha channel is
//     split into an /SMask) and JPEGs (DCTDecode passthrough). Still refused, loudly:
//     external URLs (fetching would make the export impure), interlaced PNGs, 16-bit
//     PNGs, CMYK JPEGs. RGBA re-compression is stored-block (see flate.ts): raw-size
//     streams, correct pixels.
//   • ELEMENT clip-paths (clip-path="url(#…)" with userSpaceOnUse shapes) clip for real
//     via W n. clipPathUnits="objectBoundingBox" warns and paints unclipped.
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
import { decodeDataUrlImage, type PdfImage } from './png';
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

  // Gradients / patterns / clip paths are resolved by id from <defs> — collect first.
  const defs = collectDefs(root);
  // The stylesheet, flattened — the same resolver the SVG exporter uses.
  const classStyles = createClassStyleResolver(options.theme ?? LIGHT_THEME, warnings);
  const ctx: PaintContext = { defs, shadings: new ShadingRegistry(), images: new ImageRegistry(), warnings, classStyles };

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

    paint(root, stream, ctx);

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

  // Image XObjects: one stream object per distinct image, plus its /SMask stream when the
  // source PNG carried alpha. Wiring the SMask by reference is the whole point — an alpha
  // plane that exists but is not named in the image dict renders opaque, silently.
  const imageEntries = ctx.images.entries();
  const imageRefs: string[] = [];
  for (const { name, image } of imageEntries) {
    let smaskRef = '';
    if (image.smask) {
      const smaskId = writer.allocate();
      writer.setStream(
        smaskId,
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent ${image.smask.bitsPerComponent} /Filter /FlateDecode`,
        Array.from(image.smask.data)
      );
      smaskRef = ` /SMask ${smaskId} 0 R`;
    }

    const imageId = writer.allocate();
    const decodeParms = image.decodeParms ? ` /DecodeParms ${image.decodeParms}` : '';
    writer.setStream(
      imageId,
      `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace ${image.colorSpace} /BitsPerComponent ${image.bitsPerComponent} ` +
        `/Filter ${image.filter}${decodeParms}${smaskRef}`,
      Array.from(image.data)
    );
    imageRefs.push(`/${name} ${imageId} 0 R`);
  }

  const shadingResources = ctx.shadings
    .entries()
    .map(([name, dict]) => `/${name} ${dict}`)
    .join(' ');

  const resources =
    `<< /Font << ${fontResources} >> ` +
    `/ExtGState << ${alphaResources} >> ` +
    (shadingResources ? `/Shading << ${shadingResources} >> ` : '') +
    (imageRefs.length ? `/XObject << ${imageRefs.join(' ')} >> ` : '') +
    `/ProcSet [/PDF /Text${imageRefs.length ? ' /ImageB /ImageC /ImageI' : ''}] >>`;

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
  defs: Defs;
  shadings: ShadingRegistry;
  images: ImageRegistry;
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

// ---------------------------------------------------------------------------
// Paint-server defs — gradients, patterns, clip paths, resolved by id.
// ---------------------------------------------------------------------------

interface GradientStopDef {
  offset: number;
  color: PdfRgb;
  alpha: number;
}

interface GradientDef {
  kind: 'linear' | 'radial';
  /** SVG default is objectBoundingBox; the widget capture emits userSpaceOnUse. */
  objectBoundingBox: boolean;
  /** Raw def coords: x1/y1/x2/y2 (linear, defaults 0,0,1,0) or cx/cy/r (radial, defaults .5,.5,.5). */
  coords: { x1: number; y1: number; x2: number; y2: number } | { cx: number; cy: number; r: number };
  stops: GradientStopDef[];
}

interface Defs {
  gradients: Map<string, GradientDef>;
  /** Pattern defs — flattened to their background colour (see resolvePaint). */
  patterns: Map<string, VNode>;
  clipPaths: Map<string, VNode>;
}

/** Both prop spellings occur: the capture emits `stop-color`, hand-built trees `stopColor`. */
function stopProp(vnode: VNode, kebab: string, camel: string): unknown {
  return vnode.props?.[kebab] ?? vnode.props?.[camel];
}

function parseStops(vnode: VNode): GradientStopDef[] {
  const stops: GradientStopDef[] = [];
  for (const child of vnode.children ?? []) {
    if (!child || typeof child !== 'object' || child.type !== 'stop') continue;
    const colorValue = stopProp(child, 'stop-color', 'stopColor');
    const color = parsePdfColor(colorValue);
    if (!color) continue;

    // Offsets arrive as numbers, "0.5" or "50%".
    const rawOffset = child.props?.['offset'];
    let offset = 0;
    if (typeof rawOffset === 'number') offset = rawOffset;
    else if (typeof rawOffset === 'string') {
      const pct = rawOffset.trim().endsWith('%');
      const parsed = Number.parseFloat(rawOffset);
      offset = Number.isFinite(parsed) ? (pct ? parsed / 100 : parsed) : 0;
    }

    const stopOpacity = nn(stopProp(child, 'stop-opacity', 'stopOpacity'), 1);
    stops.push({
      offset: Math.max(0, Math.min(1, offset)),
      color,
      alpha: stopOpacity * parseColorAlpha(colorValue),
    });
  }

  // PDF stitching wants monotonic domains; SVG clamps out-of-order offsets the same way.
  for (let i = 1; i < stops.length; i++) stops[i].offset = Math.max(stops[i].offset, stops[i - 1].offset);
  return stops;
}

/** Every def the painter can resolve by id, in one walk. */
function collectDefs(root: VNode): Defs {
  const defs: Defs = { gradients: new Map(), patterns: new Map(), clipPaths: new Map() };

  const walk = (vnode: VNode): void => {
    if (!vnode || typeof vnode !== 'object') return;
    const id = vnode.props?.['id'];

    if ((vnode.type === 'linearGradient' || vnode.type === 'radialGradient') && typeof id === 'string') {
      const props = vnode.props ?? {};
      const stops = parseStops(vnode);
      if (stops.length > 0) {
        defs.gradients.set(id, {
          kind: vnode.type === 'linearGradient' ? 'linear' : 'radial',
          objectBoundingBox: props['gradientUnits'] !== 'userSpaceOnUse',
          coords:
            vnode.type === 'linearGradient'
              ? { x1: nn(props['x1'], 0), y1: nn(props['y1'], 0), x2: nn(props['x2'], 1), y2: nn(props['y2'], 0) }
              : { cx: nn(props['cx'], 0.5), cy: nn(props['cy'], 0.5), r: nn(props['r'], 0.5) },
          stops,
        });
      }
    } else if (vnode.type === 'pattern' && typeof id === 'string') {
      defs.patterns.set(id, vnode);
    } else if (vnode.type === 'clipPath' && typeof id === 'string') {
      defs.clipPaths.set(id, vnode);
    }

    for (const child of vnode.children ?? []) walk(child);
  };

  walk(root);
  return defs;
}

// ---------------------------------------------------------------------------
// Document-level resources the painter accumulates while painting.
// ---------------------------------------------------------------------------

/** Shadings, deduped by their full dict (same gradient + same geometry = one resource). */
class ShadingRegistry {
  private readonly byDict = new Map<string, string>();

  nameFor(dict: string): string {
    const existing = this.byDict.get(dict);
    if (existing) return existing;
    const name = `Sh${this.byDict.size + 1}`;
    this.byDict.set(dict, name);
    return name;
  }

  entries(): Array<[name: string, dict: string]> {
    return [...this.byDict.entries()].map(([dict, name]) => [name, dict]);
  }

  get size(): number {
    return this.byDict.size;
  }
}

/** Images, deduped by href — one XObject however many times a data URL is drawn. */
class ImageRegistry {
  /** null = decode failed (already warned) — remembered so one bad image warns once. */
  private readonly byHref = new Map<string, { name: string; image: PdfImage } | null>();
  private count = 0;

  resolve(href: string, warn: (message: string) => void): { name: string; image: PdfImage } | null {
    const cached = this.byHref.get(href);
    if (cached !== undefined) return cached;

    const image = decodeDataUrlImage(href, warn);
    const entry = image ? { name: `Im${++this.count}`, image } : null;
    this.byHref.set(href, entry);
    return entry;
  }

  entries(): Array<{ name: string; image: PdfImage }> {
    return [...this.byHref.values()].filter((e): e is { name: string; image: PdfImage } => e !== null);
  }
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

  // A blur is a filter, and PDF has no filters. Dropping the element beats drawing the
  // node shadow as a hard black slab.
  const filter = style['filter'];
  if (typeof filter === 'string' && /blur\(|url\(#grafloria-blur/.test(filter)) {
    ctx.warnings.push('blurred elements (the node drop shadow) are omitted — PDF has no gaussian blur');
    return;
  }

  const local = parseTransform(style['transform']);
  const hasTransform = !isIdentity(local);

  // An element's clip path rides INSIDE its own transform: SVG applies the transform to
  // element and clip alike (they move together), so the clip ops are emitted after `cm`.
  const clip = resolveClip(style['clip-path'], ctx);
  if (clip === 'hide') return; // an EMPTY clipPath clips everything away — SVG semantics

  const scoped = hasTransform || clip !== null;
  if (scoped) stream.save();
  if (hasTransform) stream.concat(local);
  if (clip) {
    for (const op of clip) stream.push(op);
    stream.push('W n');
  }

  drawElement(vnode, style, stream, ctx);

  for (const child of vnode.children ?? []) {
    if (child && typeof child === 'object') paint(child, stream, ctx);
  }

  if (scoped) stream.restore();
}

/**
 * `clip-path: url(#…)` → the clip's PDF path ops, or null for "paint unclipped", or
 * 'hide' when the clip resolves to nothing (SVG: an empty clip path renders nothing).
 *
 * Multiple clip shapes concatenate into ONE path before a single `W n` — nonzero winding
 * over same-direction subpaths is their union, which is SVG's multi-child semantics.
 * Every refusal (missing def, objectBoundingBox units) WARNS and paints unclipped:
 * bleeding content is a visible flaw, silently vanished content is a lost diagram.
 */
function resolveClip(value: unknown, ctx: PaintContext): PathOps | 'hide' | null {
  if (typeof value !== 'string') return null;
  const ref = /^url\(#([^)]+)\)$/.exec(value.trim());
  if (!ref) return value.trim() === 'none' ? null : null;

  const def = ctx.defs.clipPaths.get(ref[1]);
  if (!def) {
    ctx.warnings.push(
      `a clip-path references "#${ref[1]}", which is not in the tree — the content is painted UNCLIPPED`
    );
    return null;
  }

  if (def.props?.['clipPathUnits'] === 'objectBoundingBox') {
    ctx.warnings.push(
      'a clipPath with clipPathUnits="objectBoundingBox" is not supported — the content is painted UNCLIPPED'
    );
    return null;
  }

  const ops: PathOps = [];
  for (const child of def.children ?? []) {
    if (!child || typeof child !== 'object') continue;
    const childOps = geometryOps(child, resolved(child, ctx));
    if (childOps) ops.push(...childOps);
    if (child.props?.['transform']) {
      ctx.warnings.push('a transform on a clipPath child is ignored — the untransformed shape clips');
    }
  }

  return ops.length > 0 ? ops : 'hide';
}

function isIdentity(m: Matrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

/** A `url(#…)` reference's target id, or null. */
function urlRefId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ref = /^url\(#([^)]+)\)$/.exec(value.trim());
  return ref ? ref[1] : null;
}

/**
 * Resolve a paint value to a FLAT colour, degrading paint servers with a warning.
 *
 * This is the fallback path only: gradient FILLS on shapes render as real shadings and
 * never come through here. What does: gradient strokes, gradient-filled text, and
 * patterns — each flattened to its most honest stand-in colour, each warned with the
 * caller's own reason (`why`), so the fidelity report says exactly what degraded.
 */
function flattenedPaint(value: unknown, ctx: PaintContext, why: string): PdfRgb | null {
  const id = urlRefId(value);
  if (id === null) return parsePdfColor(value);

  const gradient = ctx.defs.gradients.get(id);
  if (gradient) {
    ctx.warnings.push(why);
    return gradient.stops[0].color;
  }

  const pattern = ctx.defs.patterns.get(id);
  if (pattern) {
    // The most honest stand-in for a pattern is the field its marks sit on — its
    // background rect's fill, when it has one.
    ctx.warnings.push(
      'a pattern paint was flattened to its background colour — PDF tiling patterns are not implemented'
    );
    for (const child of pattern.children ?? []) {
      const color = parsePdfColor(child?.props?.['fill']);
      if (child?.type === 'rect' && color) return color;
    }
    return null;
  }

  ctx.warnings.push(`a paint references "url(#${id})", which is not in the tree — not painted`);
  return null;
}

// ---------------------------------------------------------------------------
// Gradient fills — real PDF shadings.
//
// THE APPROACH — `sh` clipped to the shape, NOT a /Pattern fill, and deliberately so:
// a shading PATTERN's /Matrix maps pattern space to the page's DEFAULT user space, which
// means every use site would need the full accumulated CTM (page transform × every
// ancestor group's cm) threaded through the painter just to place the pattern — and one
// matrix slip silently paints every gradient somewhere else. The `sh` operator instead
// paints in the CURRENT user space: the same q/cm/Q stack the rest of the painter
// already trusts, so the def's userSpaceOnUse pixel coords drop straight in with no
// bookkeeping at all. The price is that a filled-AND-stroked shape emits its geometry
// twice (once as the clip, once for the stroke) — cheap, and only when stroked.
// ---------------------------------------------------------------------------

/** Type 2 (exponential) function between two stops — PDF's native two-colour ramp. */
function rampFunction(from: GradientStopDef, to: GradientStopDef): string {
  const c = (s: GradientStopDef) => `[${num(s.color.r)} ${num(s.color.g)} ${num(s.color.b)}]`;
  return `<< /FunctionType 2 /Domain [0 1] /C0 ${c(from)} /C1 ${c(to)} /N 1 >>`;
}

/** 2 stops → one Type 2; more → a Type 3 stitching of Type 2 ramps at the stop offsets. */
function shadingFunction(stops: GradientStopDef[]): string {
  // Pad the domain: SVG pads before the first and after the last stop with their colours.
  const padded = [...stops];
  if (padded[0].offset > 0) padded.unshift({ ...padded[0], offset: 0 });
  if (padded[padded.length - 1].offset < 1) padded.push({ ...padded[padded.length - 1], offset: 1 });
  if (padded.length === 1) padded.push({ ...padded[0], offset: 1 });

  if (padded.length === 2) return rampFunction(padded[0], padded[1]);

  // /Bounds must ascend strictly inside (0,1) — two stops at one offset (a hard colour
  // break) become an epsilon-wide ramp, which is what it looks like at any zoom.
  const bounds: number[] = [];
  let previous = 0;
  for (let i = 1; i < padded.length - 1; i++) {
    const bound = Math.min(Math.max(padded[i].offset, previous + 0.0001), 0.9999);
    bounds.push(bound);
    previous = bound;
  }

  const functions: string[] = [];
  for (let i = 0; i < padded.length - 1; i++) functions.push(rampFunction(padded[i], padded[i + 1]));

  return (
    `<< /FunctionType 3 /Domain [0 1] /Functions [${functions.join(' ')}] ` +
    `/Bounds [${bounds.map(num).join(' ')}] /Encode [${functions.map(() => '0 1').join(' ')}] >>`
  );
}

/**
 * The shading dict for a gradient as used by ONE element (objectBoundingBox coords
 * depend on the element's box), or null when the box cannot be determined.
 */
function shadingDictFor(gradient: GradientDef, vnode: VNode, ctx: PaintContext): string | null {
  let coords: string;

  if (gradient.kind === 'linear') {
    let { x1, y1, x2, y2 } = gradient.coords as { x1: number; y1: number; x2: number; y2: number };
    if (gradient.objectBoundingBox) {
      const box = vnodeBounds(vnode);
      if (!box) return null;
      x1 = box.x + x1 * box.width;
      y1 = box.y + y1 * box.height;
      x2 = box.x + x2 * box.width;
      y2 = box.y + y2 * box.height;
    }
    coords = `/ShadingType 2 /ColorSpace /DeviceRGB /Coords [${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)}]`;
  } else {
    let { cx, cy, r } = gradient.coords as { cx: number; cy: number; r: number };
    if (gradient.objectBoundingBox) {
      const box = vnodeBounds(vnode);
      if (!box) return null;
      cx = box.x + cx * box.width;
      cy = box.y + cy * box.height;
      // SVG's oBB radius against a non-square box is an ellipse (via gradientTransform);
      // the normalised diagonal is the spec's own circle-equivalent and the honest circle.
      r = r * (Math.hypot(box.width, box.height) / Math.SQRT2);
    }
    // PDF radial coords are [x0 y0 r0 x1 y1 r1]: inner circle (SVG's focal, radius 0) to
    // the outer circle. The capture emits no focal point, so it sits at the centre.
    coords = `/ShadingType 3 /ColorSpace /DeviceRGB /Coords [${num(cx)} ${num(cy)} 0 ${num(cx)} ${num(cy)} ${num(r)}]`;
  }

  if (gradient.stops.some(stop => stop.alpha < 1)) {
    ctx.warnings.push(
      'a gradient stop with opacity < 1 is painted OPAQUE — a translucent shading needs an ' +
        'ExtGState soft mask (a transparency group per gradient), which this exporter does not build'
    );
  }

  // /Extend [true true] = SVG's default spreadMethod="pad": both ends run on.
  return `<< ${coords} /Function ${shadingFunction(gradient.stops)} /Extend [true true] >>`;
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

  if (vnode.type === 'image') {
    drawImage(style, stream, ctx);
    return;
  }

  const ops = geometryOps(vnode, style);
  if (!ops || ops.length === 0) return;

  // A gradient FILL gets a real shading; everything else resolves to a flat colour.
  const fillId = urlRefId(style['fill']);
  const gradient = fillId ? ctx.defs.gradients.get(fillId) : undefined;
  let shadingName: string | null = null;
  let fill: PdfRgb | null = null;
  if (gradient) {
    const dict = shadingDictFor(gradient, vnode, ctx);
    if (dict) {
      shadingName = ctx.shadings.nameFor(dict);
    } else {
      ctx.warnings.push(
        'a gradient fill was flattened to its first stop — its objectBoundingBox coords need an ' +
          'element bounding box that could not be determined'
      );
      fill = gradient.stops[0].color;
    }
  } else {
    // The gradient branch above is the only gradient path, so the `why` here can only
    // ever fire for patterns / dangling refs, which carry their own messages.
    fill = flattenedPaint(style['fill'], ctx, 'a gradient fill was flattened to its first stop');
  }
  const stroke = flattenedPaint(
    style['stroke'],
    ctx,
    'a gradient STROKE was flattened to its first stop — painting a shading through a stroke ' +
      'needs the stroke outline as a clipping path, which this exporter does not build'
  );
  // `1px` is a legal CSS width and `Number('1px')` is NaN — parseFloat, not Number.
  const strokeWidth = len(style['stroke-width'], 1);

  const willFill = fill !== null;
  const willStroke = stroke !== null && strokeWidth > 0;
  if (!shadingName && !willFill && !willStroke) return;

  const alpha =
    nn(style['opacity'], 1) *
    nn(style['fill-opacity'], 1) *
    (fill ? parseColorAlpha(style['fill']) : 1);

  if (shadingName) {
    // Clip to the shape, paint the shading, pop. The clip is why W n precedes sh.
    stream.save();
    if (alpha < 1) stream.setAlpha(Math.max(0, alpha));
    for (const op of ops) stream.push(op);
    stream.push('W n');
    stream.push(`/${shadingName} sh`);
    stream.restore();

    if (willStroke) {
      // Second pass: the shading consumed the path as its clip, so stroke a fresh one.
      const strokeAlpha = nn(style['opacity'], 1);
      stream.save();
      if (strokeAlpha < 1) stream.setAlpha(Math.max(0, strokeAlpha));
      stream.setStroke(stroke);
      stream.setLineWidth(strokeWidth);
      stream.setDash(normaliseDash(style['stroke-dasharray']));
      for (const op of ops) stream.push(op);
      stream.push('S');
      stream.restore();
    }
    return;
  }

  stream.save();

  if (alpha < 1) stream.setAlpha(Math.max(0, alpha));
  if (fill) stream.setFill(fill);
  if (stroke && willStroke) {
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
 * An <image> → its XObject invocation: `q`, a placement `cm`, `Do`, `Q`.
 *
 * The placement matrix is [w 0 0 -h x y+h]: Do paints the unit square with (0,0) at the
 * image's BOTTOM-left, while the page CTM is y-down SVG space — the -h re-flips so the
 * top pixel row lands at y, not upside down at y+h.
 */
function drawImage(style: Record<string, string>, stream: ContentStream, ctx: PaintContext): void {
  const href = style['href'] ?? style['xlink:href'];
  if (typeof href !== 'string' || href.trim() === '') return;

  const entry = ctx.images.resolve(href, message => ctx.warnings.push(message));
  if (!entry) return; // refused and already warned (external URL, interlaced, corrupt…)

  const width = len(style['width'], entry.image.width);
  const height = len(style['height'], entry.image.height);
  if (width <= 0 || height <= 0) return;

  const alpha = nn(style['opacity'], 1);

  stream.save();
  if (alpha < 1) stream.setAlpha(Math.max(0, alpha));
  stream.concat({ a: width, b: 0, c: 0, d: -height, e: len(style['x']), f: len(style['y']) + height });
  stream.push(`/${entry.name} Do`);
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

  const fill =
    flattenedPaint(
      style['fill'] ?? style['color'],
      ctx,
      'a gradient fill on text was flattened to its first stop — shading-filled text needs ' +
        'text-as-clipping-path, which this exporter does not build'
    ) ?? { r: 0, g: 0, b: 0 };
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
