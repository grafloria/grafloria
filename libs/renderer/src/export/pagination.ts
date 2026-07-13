// Multi-page pagination + print (Card 5).
//
// Slice a diagram too big for one sheet into a grid of pages — and put the breaks where
// they do not cut a node in half.
//
// THE GEOMETRY THAT MATTERS
// -------------------------
// A page has TWO rectangles, and conflating them is the bug this design exists to avoid:
//
//   rect   the world WINDOW mapped onto the paper. ALWAYS pageWidth × pageHeight, on
//          every page, so every page renders at the SAME SCALE. (Give pages variable
//          widths and each one fits-to-page at a different zoom — a printed poster whose
//          tiles do not line up.)
//   clip   what is actually PAINTED. Shrinks when a break has been pulled in to spare a
//          node, leaving white space at the page's edge instead of a sliced-in-half box.
//
// So snapping only ever moves a break EARLIER, never later: a page can paint less than its
// window, but it can never need to paint more than the paper holds.
//
// Pure and deterministic. `print()` at the bottom is the one browser-only function, and it
// touches `document` inside the call, never at module scope — the node-environment test
// imports this module and must not blow up.

import type { VNode } from '../types/vnode.types';
import type { Rectangle } from '../types/geometry.types';
import { vnodeBounds } from './bounds';

export interface Page {
  /** 0-based, reading order (left→right, top→bottom). */
  index: number;
  row: number;
  column: number;
  /** The world window mapped onto the paper. Always the full page size — see the header. */
  rect: Rectangle;
  /** The sub-rectangle actually painted. Equals `rect` unless a break was snapped in. */
  clip: Rectangle;
}

export interface PaginationOptions {
  /** One page's width in WORLD units. */
  pageWidth: number;
  /** One page's height in WORLD units. */
  pageHeight: number;

  /**
   * World units each page repeats from its neighbour — a bleed, so a printed poster can be
   * trimmed and taped without losing a strip. Default 0.
   */
  overlap?: number;

  /**
   * Pull a page break back so it does not slice through a node. Default true — a break
   * through the middle of a box is the thing that makes tiled printouts unusable.
   */
  snapToNodes?: boolean;

  /**
   * How far a break may be pulled back, as a fraction of the page. Default 0.25.
   *
   * A break is only worth moving if the page it leaves behind is still mostly full: pulling
   * a break back by 90% to spare one node would turn a 4-page print into a 9-page one. Past
   * this limit we accept the cut.
   */
  snapTolerance?: number;

  /** The region to paginate. Default: the tree's content bounds. */
  content?: Rectangle;

  /** Padding around the content bounds, in world units. Default 20. */
  padding?: number;
}

export interface PaginationResult {
  pages: Page[];
  columns: number;
  rows: number;
  /** The x break positions (page origins). */
  columnBreaks: number[];
  /** The y break positions. */
  rowBreaks: number[];
  /** Nodes we could NOT spare — a break had to cut them. */
  warnings: string[];
}

/** A node's world box — what a break must avoid slicing. */
interface Box {
  min: number;
  max: number;
}

/**
 * Collect the world boxes of the diagram's NODES.
 *
 * Nodes only. Links are lines: cutting one across a page boundary is normal and reads fine
 * (the line simply continues on the next tile). Cutting a NODE leaves half a box and half a
 * word, which is what makes a tiled print look broken.
 */
export function nodeBoxes(root: VNode): Array<{ x: Box; y: Box }> {
  const out: Array<{ x: Box; y: Box }> = [];

  const walk = (vnode: VNode): void => {
    if (!vnode || typeof vnode !== 'object') return;

    if (typeof vnode.key === 'string' && /^node-/.test(vnode.key)) {
      const bounds = vnodeBounds(vnode);
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        out.push({
          x: { min: bounds.x, max: bounds.x + bounds.width },
          y: { min: bounds.y, max: bounds.y + bounds.height },
        });
      }
      return; // a node's subtree is the node; do not recurse into it
    }

    for (const child of vnode.children ?? []) walk(child);
  };

  walk(root);
  return out;
}

/**
 * Choose the break positions along ONE axis.
 *
 * Walks left to right. At each naive break (`origin + pageSize`) it looks for boxes the
 * break would slice; if there are any, it tries pulling the break back to the leftmost
 * slicee's leading edge. That move is only taken when the page it leaves is still at least
 * `1 - tolerance` full — otherwise we would trade one cut node for a page count explosion.
 */
export function computeBreaks(
  start: number,
  end: number,
  pageSize: number,
  boxes: Box[],
  options: { snap: boolean; tolerance: number; overlap: number; warnings: string[]; axis: 'x' | 'y' }
): number[] {
  const breaks: number[] = [start];
  if (pageSize <= 0) return breaks;

  let origin = start;
  let guard = 0;

  while (origin + pageSize < end) {
    // Runaway guard: a snap that never advances would spin forever. Cannot happen given the
    // minimum-advance rule below, but a paginator that hangs the UI is not a risk worth taking.
    if (++guard > 10_000) break;

    const naive = origin + pageSize;
    let next = naive;

    if (options.snap) {
      const sliced = boxes.filter(box => box.min < naive - 1e-6 && box.max > naive + 1e-6);

      if (sliced.length > 0) {
        const leftmost = Math.min(...sliced.map(box => box.min));
        // The page must still be at least (1 - tolerance) full for the move to be worth it.
        const minAdvance = origin + pageSize * (1 - options.tolerance);

        if (leftmost > minAdvance) {
          next = leftmost;
        } else {
          // We are cutting something. Say so — a silent slice through a node is the exact
          // failure this option exists to prevent, so it must not fail quietly.
          const stillSliced = boxes.filter(box => box.min < next - 1e-6 && box.max > next + 1e-6);
          if (stillSliced.length > 0) {
            options.warnings.push(
              `a page break on ${options.axis} at ${Math.round(next)} cuts through ${stillSliced.length} ` +
                `node(s) — the node is wider than the tolerance allows the break to move ` +
                `(raise snapTolerance, or use a larger page).`
            );
          }
        }
      }
    }

    // The next page starts `overlap` earlier, so the tiles share a strip.
    origin = Math.max(next - options.overlap, origin + pageSize * 0.05);
    breaks.push(origin);
  }

  return breaks;
}

/**
 * Lay a diagram out across a grid of pages.
 */
export function paginate(root: VNode, options: PaginationOptions): PaginationResult {
  const warnings: string[] = [];
  const padding = options.padding ?? 20;

  const bounds =
    options.content ??
    (() => {
      const box = vnodeBounds(root);
      if (!box) return { x: 0, y: 0, width: 1, height: 1 };
      return { x: box.x - padding, y: box.y - padding, width: box.width + padding * 2, height: box.height + padding * 2 };
    })();

  const snap = options.snapToNodes !== false;
  const tolerance = Math.max(0, Math.min(0.9, options.snapTolerance ?? 0.25));
  const overlap = Math.max(0, options.overlap ?? 0);
  const boxes = snap ? nodeBoxes(root) : [];

  const columnBreaks = computeBreaks(
    bounds.x,
    bounds.x + bounds.width,
    options.pageWidth,
    boxes.map(b => b.x),
    { snap, tolerance, overlap, warnings, axis: 'x' }
  );

  const rowBreaks = computeBreaks(
    bounds.y,
    bounds.y + bounds.height,
    options.pageHeight,
    boxes.map(b => b.y),
    { snap, tolerance, overlap, warnings, axis: 'y' }
  );

  const contentRight = bounds.x + bounds.width;
  const contentBottom = bounds.y + bounds.height;

  const pages: Page[] = [];
  let index = 0;

  for (let row = 0; row < rowBreaks.length; row++) {
    for (let column = 0; column < columnBreaks.length; column++) {
      const x = columnBreaks[column];
      const y = rowBreaks[row];

      // The WINDOW is always a full page — every page therefore renders at the same scale.
      const rect: Rectangle = { x, y, width: options.pageWidth, height: options.pageHeight };

      // The CLIP stops at the next break (or the content edge), so a break pulled back to
      // spare a node leaves white space rather than half a box.
      const clipRight = column + 1 < columnBreaks.length ? columnBreaks[column + 1] + overlap : contentRight;
      const clipBottom = row + 1 < rowBreaks.length ? rowBreaks[row + 1] + overlap : contentBottom;

      const clip: Rectangle = {
        x,
        y,
        width: Math.max(0, Math.min(clipRight, x + options.pageWidth) - x),
        height: Math.max(0, Math.min(clipBottom, y + options.pageHeight) - y),
      };

      pages.push({ index: index++, row, column, rect, clip });
    }
  }

  return {
    pages,
    columns: columnBreaks.length,
    rows: rowBreaks.length,
    columnBreaks,
    rowBreaks,
    warnings: [...new Set(warnings)],
  };
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

export interface PrintOptions {
  /** Shown in the browser's print dialog and as the default filename. */
  title?: string;
  /** CSS page size, e.g. `'A4 landscape'`. Default `'auto'`. */
  pageSize?: string;
  /** CSS margin for @page. Default `'10mm'`. */
  margin?: string;
}

/**
 * Build a printable HTML document from already-exported SVG pages.
 *
 * PURE — it returns a string. That is deliberate: it keeps the page-building testable, and
 * leaves the one genuinely browser-side act (opening a print dialog) to `printDocument`.
 *
 * The `page-break-after` on every sheet but the last is what makes the browser emit one
 * physical page per tile instead of reflowing them all into a single column.
 */
export function buildPrintDocument(svgPages: string[], options: PrintOptions = {}): string {
  const title = escapeHtml(options.title ?? 'Diagram');
  const size = options.pageSize ?? 'auto';
  const margin = options.margin ?? '10mm';

  const sheets = svgPages
    .map(
      (svg, index) =>
        `<section class="sheet${index === svgPages.length - 1 ? ' last' : ''}">${svg}</section>`
    )
    .join('');

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>` +
    `@page { size: ${size}; margin: ${margin}; }` +
    `* { box-sizing: border-box; }` +
    `html, body { margin: 0; padding: 0; }` +
    `.sheet { page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; }` +
    // The LAST sheet must not force a break, or every print gets a trailing blank page.
    `.sheet.last { page-break-after: auto; break-after: auto; }` +
    `.sheet svg { max-width: 100%; max-height: 100%; height: auto; }` +
    `@media print { .sheet { width: 100%; height: 100vh; } }` +
    `</style></head><body>${sheets}</body></html>`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open the browser's print dialog for a document built by {@link buildPrintDocument}.
 *
 * Prints through a hidden IFRAME rather than `window.open`: a popup is blocked by default in
 * every browser unless the call is inside a user gesture, and a blocked popup means the
 * print button silently does nothing. An iframe always works, and it does not disturb the
 * page the user is on.
 *
 * Browser-only, and it says so rather than throwing something cryptic in Node.
 */
export function printDocument(html: string): Promise<void> {
  const globalAny = globalThis as any;
  const doc = globalAny.document;

  if (!doc) {
    return Promise.reject(
      new Error('[grafloria/export] printDocument needs a browser. In Node, export a PDF instead — export("pdf").')
    );
  }

  return new Promise<void>(resolve => {
    const frame: HTMLIFrameElement = doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';

    frame.onload = () => {
      const view = frame.contentWindow;
      if (view) {
        view.focus();
        view.print();
      }
      // Give the print dialog time to take its snapshot before the frame is torn down —
      // removing it synchronously cancels the print in Safari.
      globalAny.setTimeout(() => {
        frame.remove();
        resolve();
      }, 1000);
    };

    doc.body.appendChild(frame);

    const frameDoc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!frameDoc) {
      frame.remove();
      resolve();
      return;
    }
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
  });
}
