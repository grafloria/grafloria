// text-measure.ts
// Text measured with a real canvas, in the theme's faces.
//
// The framework-agnostic text engine (text-block.ts) estimates widths (0.6 em a
// glyph): stable, and roomy enough that a label never clips. Two things measure
// for real instead, where a canvas exists:
//   - a composing layout (the architecture layout, a Mermaid import) sizing its
//     boxes to the words as they will draw — Mermaid sizes its own boxes from
//     text measured in the page, so an import that estimates comes out wider
//     than Mermaid's and is fitted smaller;
//   - the renderer, wrapping the labels of a diagram an import sized that way
//     (MEASURED_TEXT_FLAG), so the lines it draws are the lines the boxes hold.
// Every other diagram keeps the estimate, and draws exactly as it always has.

import { MEASURED_TEXT_FLAG, type DiagramModel, type MeasureText, type TextFont } from '@grafloria/engine';

/** The theme's default face (LIGHT_THEME / DARK_THEME `typography.fontFamily.default`). */
const DEFAULT_FAMILY = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

let context: CanvasRenderingContext2D | null | undefined;
const byFamily = new Map<string, MeasureText>();

/**
 * Measure text with a real canvas, in the theme's faces, so a composing layout
 * sizes boxes to the words as they will actually draw. `family` is the face a
 * text that names none draws in (the theme's default). Undefined where there
 * is no canvas (a server, jsdom) — the layout then estimates.
 */
export function canvasTextMeasure(family: string = DEFAULT_FAMILY): MeasureText | undefined {
  const known = byFamily.get(family);
  if (known) return known;
  const c = canvasContext();
  if (!c) return undefined;
  const measure: MeasureText = (text, font) => {
    const face = /mono/i.test(font.family ?? '')
      ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      : font.family ?? family;
    c.font = `${font.weight ?? 400} ${font.size}px ${face}`;
    return c.measureText(text).width + (font.letterSpacing ?? 0) * Array.from(text).length;
  };
  byFamily.set(family, measure);
  return measure;
}

function canvasContext(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  context = null;
  if (typeof document === 'undefined') return null;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')) return null;
  try {
    context = document.createElement('canvas').getContext('2d');
  } catch {
    context = null;
  }
  return context;
}

/**
 * How a diagram's label of this font is measured: by the canvas when an import
 * sized the diagram to measured text (MEASURED_TEXT_FLAG), else undefined — the
 * text engine's estimate, as for every other diagram.
 */
export function labelMeasureFor(
  diagram: Pick<DiagramModel, 'getMetadata'> | null | undefined,
  font: TextFont
): ((text: string, size?: number) => number) | undefined {
  if (!diagram || diagram.getMetadata(MEASURED_TEXT_FLAG) !== true) return undefined;
  const measure = canvasTextMeasure();
  if (!measure) return undefined;
  return (text, size) => measure(text, size === undefined ? font : { ...font, size });
}
