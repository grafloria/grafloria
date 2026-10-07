/**
 * How wide a run of text will draw — for a layout that sizes boxes to their
 * words. The engine has no canvas, so the default is an ESTIMATE from per-glyph
 * widths of a UI sans face, deliberately a little wide: a box a few pixels too
 * roomy looks fine, a box a few pixels too tight cuts its name to "…". A host
 * that can measure (the renderer, with a canvas) passes its own `measureText`.
 */
export interface TextFont {
  /** px */
  size: number;
  weight?: string | number;
  family?: string;
  /** px added after every character (CSS letter-spacing) */
  letterSpacing?: number;
}

export type MeasureText = (text: string, font: TextFont) => number;

const NARROW = new Set(Array.from("il.,:;'|!`jI"));
const SLIM = new Set(Array.from('frt()[]{}-/\\"'));
const WIDE = new Set(Array.from('mwMW@%'));

function isBold(weight: TextFont['weight']): boolean {
  if (weight === undefined) return false;
  if (typeof weight === 'number') return weight >= 600;
  return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
}

/** Width in px of one line of `text` (no wrapping), estimated. */
export const estimateTextWidth: MeasureText = (text, font) => {
  const mono = /mono|courier|menlo|consolas/i.test(font.family ?? '');
  let em = 0;
  for (const ch of text) {
    if (mono) em += 0.62;
    else if (ch === ' ') em += 0.3;
    else if (NARROW.has(ch)) em += 0.28;
    else if (SLIM.has(ch)) em += 0.38;
    else if (WIDE.has(ch)) em += 0.88;
    else if (ch >= 'A' && ch <= 'Z') em += 0.68;
    else if (ch >= '0' && ch <= '9') em += 0.58;
    else if ((ch.codePointAt(0) ?? 0) > 0x2e80) em += 1.0; // CJK and wider scripts
    else em += 0.575;
  }
  // Calibrated against Chromium's Inter / system-ui: within ±4% for the
  // AI-diagram labels (regular 11 px ran 3% short at 0.55; bold 13 px 5% wide at 1.08).
  const spacing = (font.letterSpacing ?? 0) * Array.from(text).length;
  return em * font.size * (isBold(font.weight) && !mono ? 1.03 : 1) + spacing;
};

/** The widest of several lines. */
export function widestLine(lines: readonly string[], font: TextFont, measure: MeasureText): number {
  let w = 0;
  for (const line of lines) w = Math.max(w, measure(line, font));
  return w;
}
