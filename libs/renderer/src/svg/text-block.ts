// text-block.ts
// Link-agnostic text-block engine (wrap / multi-line / ellipsis / shape-fit).
//
// This is the shared core that BOTH node labels (SVGRenderer.renderNode) and
// link labels (LabelRenderer) render through. It was factored out of
// LabelRenderer's renderText / renderWrappedText / wrapText so a single
// implementation owns line-breaking, vertical alignment and truncation.
//
// WIDTH APPROXIMATION (documented, intentional):
//   We have no DOM/canvas measureText in the framework-agnostic layer, so text
//   width is estimated as `text.length * fontSize * 0.6` — the average glyph is
//   ~0.6em. This over/under-estimates for very narrow ('l', 'i') or very wide
//   ('W', 'M') runs, but it is stable, cheap and good enough to (a) pick line
//   breaks and (b) decide when a label overflows its shape's inner rect. The
//   per-node <clipPath> (sized to the exact inner rect) is the hard backstop
//   that guarantees text never visibly escapes the silhouette, so the estimate
//   only needs to be approximately right.

import type { VNode } from '../types/vnode.types';

const DEFAULT_FONT_SIZE = 12;
const DEFAULT_LINE_HEIGHT = 1.2;
const ELLIPSIS = '…'; // …

export interface TextBlockOptions {
  /** The label text. Honors explicit '\n' as hard line breaks. */
  text: string;
  /** Anchor X in the local coordinate space of the returned <text>. */
  x: number;
  /** Anchor Y in the local coordinate space of the returned <text>. */
  y: number;
  /** Wrap width. Omit / Infinity → no wrapping (one line unless '\n' present). */
  maxWidth?: number;
  /** Horizontal text anchor. Default 'middle'. */
  align?: 'start' | 'middle' | 'end';
  /** Vertical alignment of the whole block around `y`. Default 'middle'. */
  valign?: 'top' | 'middle' | 'bottom';
  /** Font size in px used for BOTH measurement and (optionally) emission. */
  fontSize?: number;
  fontFamily?: string;
  /** Font weight, emitted only when defined. */
  fontWeight?: number | string;
  /** Fill color. Emitted only when defined (CSS-mode callers omit it). */
  color?: string;
  className?: string;
  /** When set, apply clip-path: url(#clipId) so overflow is hard-clipped. */
  clipId?: string;
  /** Max rendered lines; extra lines collapse into an ellipsis on the last. */
  maxLines?: number;
  /** Line-height multiplier. Default 1.2. */
  lineHeight?: number;
  /** Emit the numeric fontSize as an attribute. Default true (CSS mode: false). */
  emitFontSize?: boolean;
  /** Set pointer-events: none (node labels don't intercept the mouse). */
  nonInteractive?: boolean;
}

/** Average-glyph width estimate. See the module header for the rationale. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

/**
 * Break `text` into display lines: split on hard '\n', then greedily word-wrap
 * each paragraph to `maxWidth`. A single word wider than maxWidth breaks at its
 * HYPHENS first ("predefined-process" → "predefined-" + "process" — a hyphen is
 * a legitimate break point; a centred clip eats BOTH ends of the word and reads
 * as gibberish, which is exactly what the screenshot audit caught). A word with
 * no hyphen is kept whole (clipped, not broken) — the historical LabelRenderer
 * behavior for genuinely unbreakable runs.
 */
export function wrapText(text: string, maxWidth: number | undefined, fontSize: number): string[] {
  const wrap = typeof maxWidth === 'number' && isFinite(maxWidth) && maxWidth > 0;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!wrap) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .flatMap((w) => breakOversizedWord(w, maxWidth as number, fontSize));
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (estimateTextWidth(test, fontSize) > (maxWidth as number) && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [text];
}

/**
 * Split a word that cannot fit `maxWidth` at its hyphens, greedily packing
 * hyphen-terminated segments back together so we break as few times as
 * possible. Fitting words — and unbreakable oversized ones — pass through
 * unchanged. The greedy line-packer above treats the returned pieces as
 * ordinary words; a piece already ends in '-', so no artificial hyphen is
 * introduced.
 */
function breakOversizedWord(word: string, maxWidth: number, fontSize: number): string[] {
  if (estimateTextWidth(word, fontSize) <= maxWidth || !word.includes('-')) return [word];
  // "a-b-c" → ["a-", "b-", "c"], then greedily merge while they fit.
  const segments = word.split(/(?<=-)/);
  const pieces: string[] = [];
  let current = '';
  for (const seg of segments) {
    const test = current + seg;
    if (current && estimateTextWidth(test, fontSize) > maxWidth) {
      pieces.push(current);
      current = seg;
    } else {
      current = test;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Apply a maxLines cap: keep the first `maxLines` lines and fold the overflow
 * into a trailing ellipsis on the last kept line, trimming characters so the
 * ellipsized line still fits `maxWidth`.
 */
function truncateLines(
  lines: string[],
  maxLines: number | undefined,
  maxWidth: number | undefined,
  fontSize: number
): string[] {
  if (!maxLines || maxLines < 1 || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  const fits = (s: string) =>
    !(typeof maxWidth === 'number' && isFinite(maxWidth) && maxWidth > 0) ||
    estimateTextWidth(s + ELLIPSIS, fontSize) <= maxWidth;
  while (last.length > 0 && !fits(last)) {
    last = last.slice(0, -1).replace(/\s+$/, '');
  }
  kept[maxLines - 1] = last + ELLIPSIS;
  return kept;
}

function baselineOffset(
  valign: 'top' | 'middle' | 'bottom',
  lineCount: number,
  lineHeightPx: number
): number {
  const totalHeight = lineCount * lineHeightPx;
  if (valign === 'middle') return -totalHeight / 2 + lineHeightPx / 2;
  if (valign === 'bottom') return -totalHeight + lineHeightPx;
  return 0; // top: first line baseline sits ~one line below y
}

function mapDominantBaseline(valign: 'top' | 'middle' | 'bottom'): string {
  if (valign === 'top') return 'hanging';
  if (valign === 'bottom') return 'baseline';
  return 'middle';
}

/**
 * Render a text block as a single <text> VNode.
 *
 * - one line  → a <text> carrying `textContent` (+ dominant-baseline for
 *   vertical centering), preserving the historical single-line output.
 * - many lines → a <text> with one <tspan> per line, vertically aligned via
 *   per-line `dy` (first line offset by {@link baselineOffset}).
 */
export function renderTextBlock(opts: TextBlockOptions): VNode {
  const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
  const align = opts.align ?? 'middle';
  const valign = opts.valign ?? 'middle';
  const lineHeightPx = fontSize * (opts.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const emitFontSize = opts.emitFontSize !== false;

  const wrapped = wrapText(opts.text, opts.maxWidth, fontSize);
  const lines = truncateLines(wrapped, opts.maxLines, opts.maxWidth, fontSize);

  const baseProps: Record<string, unknown> = {
    x: opts.x,
    y: opts.y,
    textAnchor: align,
    ...(emitFontSize ? { fontSize } : {}),
    ...(opts.fontFamily ? { fontFamily: opts.fontFamily } : {}),
    ...(opts.fontWeight !== undefined ? { fontWeight: opts.fontWeight } : {}),
    ...(opts.color ? { fill: opts.color } : {}),
    ...(opts.className ? { className: opts.className } : {}),
    ...(opts.clipId ? { clipPath: `url(#${opts.clipId})` } : {}),
    ...(opts.nonInteractive ? { pointerEvents: 'none' } : {}),
  };

  // Single line: keep the compact textContent form (matches legacy output).
  if (lines.length === 1) {
    return {
      type: 'text',
      props: {
        ...baseProps,
        textContent: lines[0],
        dominantBaseline: mapDominantBaseline(valign),
      },
    };
  }

  // Multi-line: one tspan per line, offset from the anchor by dy.
  const first = baselineOffset(valign, lines.length, lineHeightPx);
  const tspans: VNode[] = lines.map((line, i) => ({
    type: 'tspan',
    props: {
      x: opts.x,
      dy: i === 0 ? first : lineHeightPx,
      textContent: line,
    },
  }));

  return { type: 'text', props: baseProps, children: tspans };
}
