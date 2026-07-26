// Composite / panel node model (Wave 5 / Nodes & shapes — Card 5)
//
// A node body beyond "one shape + one label": an optional header band over the
// body (ERD / UML title rows), an image slot, an icon slot, corner/count badges
// and stacked text rows. This is a LIGHTWEIGHT panel — a vertical stack plus
// four corner anchors, deliberately ~10% of a GoJS Panel — NOT a general layout
// engine.
//
// It composes with ANY base shape: the panel VNodes are OVERLAID on top of the
// shape body the registry produced, so `{ shape: 'cylinder', panel: {...} }`
// works exactly like `{ shape: 'rect', panel: {...} }`. The spec lives on
// `node.metadata.panel`, so it serializes for free.
//
// SAFETY: every text field is user data and is emitted through `textContent`
// (never innerHTML), and every image href is passed through `sanitizeAssetUrl`,
// which blocks the `javascript:`/`data:text/html` vectors. This is the same
// "diagram data is user input" rule the foreignObject XSS fix established.

import type { NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

/** Icon/badge anchor: a corner, or `'c'` — dead centre of the node body
 *  (a BPMN event's trigger glyph sits in the middle of its circle). */
export type PanelCorner = 'tl' | 'tr' | 'bl' | 'br' | 'c';

/** A header band across the top of the node (ERD/UML title row). */
export interface PanelHeader {
  text?: string;
  /**
   * STACKED header lines — the UML classifier convention of a «stereotype»
   * over the name. Wins over `text` when present; the band grows to hold
   * every line, and each line is fitted to the band width (shrunk, never
   * clipped: «enumeration» over a 120px card used to paint "umeration»
   * Enumera" cut off at both edges).
   */
  lines?: string[];
  /** Band height in px. Default 22, or 16/line + 4 when `lines` stack. */
  height?: number;
  fill?: string;
  textColor?: string;
}

/** A raster image slot below the header (data: URI strongly preferred). */
export interface PanelImage {
  href: string;
  /** Slot height in px. Default 48. */
  height?: number;
}

/** A small icon — a raster href OR an emoji/text glyph — pinned to a corner. */
export interface PanelIcon {
  href?: string;
  /** Emoji or short glyph, used when `href` is absent. */
  glyph?: string;
  /** Box size in px. Default 18. */
  size?: number;
  /** Corner to pin to. Default 'tl'. */
  corner?: PanelCorner;
}

/** A count / status badge pinned to a corner. */
export interface PanelBadge {
  text: string;
  corner?: PanelCorner;
  fill?: string;
  textColor?: string;
}

/** A stacked body text row (ERD field / UML member). */
export interface PanelRow {
  text: string;
  align?: 'start' | 'middle' | 'end';
}

/** The composite-panel spec stored at `node.metadata.panel`. */
export interface PanelSpec {
  header?: PanelHeader;
  image?: PanelImage;
  icon?: PanelIcon;
  badges?: PanelBadge[];
  rows?: PanelRow[];
  /** Per-row height in px. Default 18. */
  rowHeight?: number;
}

const DEFAULT_HEADER_HEIGHT = 22;
const DEFAULT_IMAGE_HEIGHT = 48;
const DEFAULT_ROW_HEIGHT = 18;
const DEFAULT_ICON_SIZE = 18;
const DEFAULT_FONT_SIZE = 12;
const HEADER_LINE_HEIGHT = 16;
const MIN_HEADER_FONT_PX = 8;

/** The header's lines, whether given as `lines` or a single `text`. */
function headerLines(header: PanelHeader): string[] {
  if (header.lines && header.lines.length > 0) return header.lines;
  return header.text ? [header.text] : [];
}

/** The header band's height: explicit, or grown to hold its stacked lines. */
function headerHeight(header: PanelHeader): number {
  if (header.height !== undefined) return header.height;
  const n = headerLines(header).length;
  return n > 1 ? n * HEADER_LINE_HEIGHT + 4 : DEFAULT_HEADER_HEIGHT;
}

/**
 * The font size at which one UNWRAPPABLE header line fits `maxWidth`. Same
 * 0.6em average-glyph estimate the label engine uses; the floor keeps a very
 * long line legible-and-shrunk rather than invisible (past it the band is
 * simply too small for the name, and clipping at 8px beats 3px noise).
 */
function fitHeaderLine(line: string, maxWidth: number, base: number): number {
  if (!line || !isFinite(maxWidth) || maxWidth <= 0) return base;
  const needed = maxWidth / (line.length * 0.6);
  return needed >= base ? base : Math.max(MIN_HEADER_FONT_PX, Math.floor(needed));
}

/** Read a node's panel spec, or null when it has none. */
export function getNodePanel(node: NodeModel): PanelSpec | null {
  const raw = node.getMetadata('panel');
  return raw && typeof raw === 'object' ? (raw as PanelSpec) : null;
}

/** True when the node carries a composite panel. */
export function hasPanel(node: NodeModel): boolean {
  return getNodePanel(node) !== null;
}

/**
 * Allow only image-safe URL schemes on an asset href. Blocks `javascript:` and
 * `data:text/html` (the executable-URL vectors); permits `data:image/*`,
 * `blob:`, `http(s):`, and scheme-relative / path references. An unsafe or
 * non-string href resolves to '' so the slot renders empty instead of dangerous.
 */
export function sanitizeAssetUrl(href: unknown): string {
  if (typeof href !== 'string') return '';
  const trimmed = href.trim();
  if (trimmed === '') return '';
  // Strip whitespace + control chars (0x00–0x20 and DEL) an attacker could use
  // to smuggle a scheme past the check ("java\tscript:"), but keep URL
  // punctuation intact. Escapes only — never embed raw control bytes here.
  const normalized = trimmed.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return '';
  if (normalized.startsWith('data:')) {
    // Only raster image data URIs — never data:text/html or data:image/svg+xml
    // (SVG can carry script).
    return /^data:image\/(png|jpe?g|gif|webp|bmp|avif);/.test(normalized) ? trimmed : '';
  }
  return trimmed;
}

/**
 * Extra content space a panel reserves so content-aware auto-sizing (Card 7)
 * grows the shape to fit the WHOLE body. `top` = header + image stacked above
 * the label; `bottom` = the stacked rows below it; `width` = the widest text the
 * panel must show.
 */
export function measurePanelReserve(
  node: NodeModel
): { top?: number; bottom?: number; width?: number } | undefined {
  const panel = getNodePanel(node);
  if (!panel) return undefined;

  const rowHeight = panel.rowHeight ?? DEFAULT_ROW_HEIGHT;
  let top = 0;
  let bottom = 0;
  let width = 0;

  if (panel.header) {
    top += headerHeight(panel.header);
    for (const line of headerLines(panel.header)) width = Math.max(width, estimate(line));
  }
  if (panel.image) top += panel.image.height ?? DEFAULT_IMAGE_HEIGHT;
  if (panel.rows && panel.rows.length > 0) {
    bottom += panel.rows.length * rowHeight;
    for (const row of panel.rows) width = Math.max(width, estimate(row.text));
  }

  const out: { top?: number; bottom?: number; width?: number } = {};
  if (top > 0) out.top = top;
  if (bottom > 0) out.bottom = bottom;
  if (width > 0) out.width = width;
  return Object.keys(out).length > 0 ? out : undefined;
}

function estimate(text: string | undefined): number {
  return text ? text.length * DEFAULT_FONT_SIZE * 0.6 + 12 : 0;
}

/** Style inputs the host renderer supplies (theme-derived, CSS-mode aware). */
export interface PanelRenderContext {
  /** Node id — used for stable child keys. */
  nodeId: string;
  fontSize: number;
  headerFill: string;
  headerTextColor: string;
  bodyTextColor: string;
  badgeFill: string;
  badgeTextColor: string;
}

/**
 * Build the panel overlay VNodes for a node, in draw order (background bands
 * first, corner overlays last). Returns [] when the node has no panel. These are
 * appended to the node group ON TOP of the base shape body, so the panel rides
 * whatever silhouette the shape registry drew.
 */
export function renderNodePanel(
  node: NodeModel,
  width: number,
  height: number,
  ctx: PanelRenderContext
): VNode[] {
  const panel = getNodePanel(node);
  if (!panel) return [];

  const out: VNode[] = [];
  const rowHeight = panel.rowHeight ?? DEFAULT_ROW_HEIGHT;
  let cursorY = 0;

  // ── header band ──────────────────────────────────────────────────────────
  if (panel.header) {
    const header = panel.header;
    const h = headerHeight(header);
    out.push({
      type: 'rect',
      key: `panel-header-bg-${ctx.nodeId}`,
      props: {
        x: 0,
        y: 0,
        width,
        height: h,
        fill: header.fill ?? ctx.headerFill,
        className: 'panel-header',
        pointerEvents: 'none',
      },
    });
    const lines = headerLines(header);
    const lineH = lines.length > 0 ? h / lines.length : h;
    lines.forEach((line, i) => {
      // A stacked stereotype line reads smaller and lighter than the name —
      // the UML card convention («interface» over Interface).
      const stereo = lines.length > 1 && i < lines.length - 1;
      const base = stereo ? ctx.fontSize - 2 : ctx.fontSize;
      out.push(
        textVNode(`panel-header-text-${ctx.nodeId}${lines.length > 1 ? `-${i}` : ''}`, {
          text: line,
          x: width / 2,
          y: lineH * (i + 0.5),
          align: 'middle',
          fill: header.textColor ?? ctx.headerTextColor,
          // A header line cannot wrap; it shrinks to its band instead of
          // painting past the card's edges.
          fontSize: fitHeaderLine(line, width - 10, base),
          fontWeight: stereo ? 400 : 600,
        })
      );
    });
    cursorY += h;
  }

  // ── image slot ───────────────────────────────────────────────────────────
  if (panel.image) {
    const h = panel.image.height ?? DEFAULT_IMAGE_HEIGHT;
    const href = sanitizeAssetUrl(panel.image.href);
    if (href) {
      out.push({
        type: 'image',
        key: `panel-image-${ctx.nodeId}`,
        props: {
          x: 0,
          y: cursorY,
          width,
          height: h,
          href,
          preserveAspectRatio: 'xMidYMid meet',
          className: 'panel-image',
          pointerEvents: 'none',
        },
      });
    }
    cursorY += h;
  }

  // ── stacked rows (ERD/UML members), pinned to the BOTTOM of the body ───────
  if (panel.rows && panel.rows.length > 0) {
    const rowsTop = height - panel.rows.length * rowHeight;
    panel.rows.forEach((row, i) => {
      const align = row.align ?? 'start';
      const x = align === 'middle' ? width / 2 : align === 'end' ? width - 6 : 6;
      out.push(
        textVNode(`panel-row-${ctx.nodeId}-${i}`, {
          text: row.text,
          x,
          y: rowsTop + i * rowHeight + rowHeight / 2,
          align,
          fill: ctx.bodyTextColor,
          fontSize: ctx.fontSize,
        })
      );
    });
  }

  // ── icon (corner overlay) ──────────────────────────────────────────────────
  if (panel.icon) {
    const size = panel.icon.size ?? DEFAULT_ICON_SIZE;
    const pos = cornerBox(panel.icon.corner ?? 'tl', width, height, size, size);
    const href = sanitizeAssetUrl(panel.icon.href);
    if (href) {
      out.push({
        type: 'image',
        key: `panel-icon-${ctx.nodeId}`,
        props: {
          x: pos.x,
          y: pos.y,
          width: size,
          height: size,
          href,
          preserveAspectRatio: 'xMidYMid meet',
          className: 'panel-icon',
          pointerEvents: 'none',
        },
      });
    } else if (panel.icon.glyph) {
      out.push(
        textVNode(`panel-icon-${ctx.nodeId}`, {
          text: panel.icon.glyph,
          x: pos.x + size / 2,
          y: pos.y + size / 2,
          align: 'middle',
          fill: ctx.bodyTextColor,
          fontSize: size,
        })
      );
    }
  }

  // ── badges (corner overlays, last so they sit on top) ──────────────────────
  if (panel.badges && panel.badges.length > 0) {
    // Group badges by corner so multiple badges on the same corner stack inward.
    const perCorner = new Map<PanelCorner, number>();
    panel.badges.forEach((badge, i) => {
      const corner = badge.corner ?? 'tr';
      const index = perCorner.get(corner) ?? 0;
      perCorner.set(corner, index + 1);

      const text = String(badge.text);
      const bw = Math.max(16, text.length * ctx.fontSize * 0.6 + 8);
      const bh = 16;
      const base = cornerBox(corner, width, height, bw, bh);
      // Stack additional same-corner badges toward the centre horizontally.
      const dir = corner === 'tr' || corner === 'br' ? -1 : 1;
      const x = base.x + dir * index * (bw + 4);

      out.push({
        type: 'rect',
        key: `panel-badge-bg-${ctx.nodeId}-${i}`,
        props: {
          x,
          y: base.y,
          width: bw,
          height: bh,
          rx: bh / 2,
          ry: bh / 2,
          fill: badge.fill ?? ctx.badgeFill,
          className: 'panel-badge',
          pointerEvents: 'none',
        },
      });
      out.push(
        textVNode(`panel-badge-text-${ctx.nodeId}-${i}`, {
          text,
          x: x + bw / 2,
          y: base.y + bh / 2,
          align: 'middle',
          fill: badge.textColor ?? ctx.badgeTextColor,
          fontSize: ctx.fontSize - 2,
          fontWeight: 600,
        })
      );
    });
  }

  return out;
}

/**
 * The body inner rect available to the node LABEL once the panel's header/image
 * (top) and rows (bottom) have taken their space. Keeps the label from
 * overlapping the panel bands. Given the shape's own inner rect.
 */
export function panelAdjustedInnerRect(
  node: NodeModel,
  inner: { x: number; y: number; w: number; h: number },
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  const panel = getNodePanel(node);
  if (!panel) return inner;

  const rowHeight = panel.rowHeight ?? DEFAULT_ROW_HEIGHT;
  let top = 0;
  let bottom = 0;
  if (panel.header) top += headerHeight(panel.header);
  if (panel.image) top += panel.image.height ?? DEFAULT_IMAGE_HEIGHT;
  if (panel.rows && panel.rows.length > 0) bottom += panel.rows.length * rowHeight;

  // Intersect the panel-reserved body band with the shape's own inner rect.
  const bandTop = Math.max(inner.y, top);
  const bandBottom = Math.min(inner.y + inner.h, height - bottom);
  const h = Math.max(0, bandBottom - bandTop);
  return { x: inner.x, y: bandTop, w: inner.w, h };
}

/** Position a `bw × bh` box in one of the four corners (2px inset) or centred. */
function cornerBox(
  corner: PanelCorner,
  width: number,
  height: number,
  bw: number,
  bh: number
): { x: number; y: number } {
  const inset = 2;
  const right = width - bw - inset;
  const bottom = height - bh - inset;
  switch (corner) {
    case 'tl':
      return { x: inset, y: inset };
    case 'tr':
      return { x: right, y: inset };
    case 'bl':
      return { x: inset, y: bottom };
    case 'br':
      return { x: right, y: bottom };
    case 'c':
      return { x: (width - bw) / 2, y: (height - bh) / 2 };
  }
}

interface TextSpec {
  text: string;
  x: number;
  y: number;
  align: 'start' | 'middle' | 'end';
  fill: string;
  fontSize: number;
  fontWeight?: number;
}

/**
 * A single-line <text> carrying user content via `textContent` (never
 * innerHTML). dominant-baseline centres it vertically on `y`.
 */
function textVNode(key: string, spec: TextSpec): VNode {
  return {
    type: 'text',
    key,
    props: {
      x: spec.x,
      y: spec.y,
      textAnchor: spec.align,
      dominantBaseline: 'middle',
      fontSize: spec.fontSize,
      fill: spec.fill,
      ...(spec.fontWeight ? { fontWeight: spec.fontWeight } : {}),
      pointerEvents: 'none',
      textContent: spec.text,
    },
  };
}
