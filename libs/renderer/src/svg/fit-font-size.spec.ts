// E2 — shrink-to-fit for labels whose longest token cannot be wrapped.

import { fitFontSize } from './svg-renderer';

describe('fitFontSize', () => {
  const BASE = 14;

  it('leaves the base size alone when the text already fits', () => {
    // "Process" = 7 chars ≈ 7*14*0.6 = 58.8px, inner box of a 120-wide rect is ~104
    expect(fitFontSize('Process', 104, BASE)).toBe(BASE);
  });

  it('shrinks a single long word to fit a narrow shape', () => {
    // "Decision" (8) in a diamond's 50px inner box: 8*14*0.6 = 67px > 50
    const f = fitFontSize('Decision', 50, BASE);
    expect(f).toBeLessThan(BASE);
    expect(8 * f * 0.6).toBeLessThanOrEqual(50); // now it fits
  });

  it('measures the LONGEST token, not the whole string', () => {
    // wrapText can break on the space, so only "Operation" (9) must fit
    const f = fitFontSize('Manual Operation', 60, BASE);
    expect(9 * f * 0.6).toBeLessThanOrEqual(60);
    // and it must not over-shrink as if the full 16-char string had to fit
    expect(f).toBeGreaterThan(fitFontSize('ManualOperation!', 60, BASE) - 0.001);
  });

  it('treats a hyphen as a break point (wrapText does)', () => {
    // "Pre-defined" breaks to "defined" (7), not the full 11
    expect(fitFontSize('Pre-defined', 60, BASE)).toBeGreaterThan(fitFontSize('Predefinedx', 60, BASE));
  });

  it('never shrinks below the legibility floor', () => {
    expect(fitFontSize('Extraordinarily', 4, BASE)).toBe(8);
  });

  it('is safe on empty text and degenerate widths', () => {
    expect(fitFontSize('', 50, BASE)).toBe(BASE);
    expect(fitFontSize('x', 0, BASE)).toBe(BASE);
    expect(fitFontSize('x', Number.NaN, BASE)).toBe(BASE);
    expect(fitFontSize('   ', 50, BASE)).toBe(BASE);
  });
});
