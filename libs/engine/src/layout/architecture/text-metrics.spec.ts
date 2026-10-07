/**
 * The width estimate the architecture layout sizes boxes with, held to REAL
 * widths: every label of the AI-style HealthPay diagram as Chromium drew it
 * (SVGTextElement.getComputedTextLength, the theme's Inter / system-ui stack,
 * 2026-09-30). The estimate may be a little wide — a roomy box looks fine — but
 * never short by more than 5%: a box that is short cuts its name to "…"
 * ("keys, ledger, bank numbers" wrapped at 0.55 em for lowercase).
 */
import { estimateTextWidth } from './text-metrics';

const DRAWN: Array<[string, number, number | string, string, number]> = [
  // text, px size, weight, family, measured width
  ['HealthPay payment page', 13, 600, 'Inter, system-ui', 157.8],
  ['HealthPay wallets', 13, 600, 'Inter, system-ui', 112.6],
  ['Our database', 13, 600, 'Inter, system-ui', 85.2],
  ['Fake card page', 13, 600, 'Inter, system-ui', 95.8],
  ['Customer', 13, 600, 'Inter, system-ui', 62.0],
  ['Our API', 13, 600, 'Inter, system-ui', 48.2],
  ['keys, ledger, bank numbers', 11, 400, 'Inter, system-ui', 143.8],
  ["hold the customer's money", 11, 400, 'Inter, system-ui', 142.6],
  ['the card is typed here', 11, 400, 'Inter, system-ui', 114.8],
  ['phone or browser', 11, 400, 'Inter, system-ui', 92.0],
  ["not HealthPay's", 11, 400, 'Inter, system-ui', 82.4],
  ['sherkety-erp-api', 11, 400, 'ui-monospace, SFMono-Regular', 106.0],
  ['sends the payment link', 11, 400, 'Inter, system-ui', 121.1],
  ['asks HealthPay to move money', 11, 400, 'Inter, system-ui', 162.8],
  ['adds money', 11, 400, 'Inter, system-ui', 63.7],
  ['card number and CVV', 11, 700, 'Inter, system-ui', 121.7],
  ['if someone swaps the link, the customer lands here (M1)', 11, 700, 'Inter, system-ui', 314.4],
];

describe('estimateTextWidth, held to widths Chromium drew', () => {
  for (const [text, size, weight, family, real] of DRAWN) {
    it(`"${text}" (${size} px, ${weight}) — within -5% / +10% of ${real} px`, () => {
      const est = estimateTextWidth(text, { size, weight, family });
      expect(est).toBeGreaterThanOrEqual(real * 0.95);
      expect(est).toBeLessThanOrEqual(real * 1.1);
    });
  }

  it('letter-spacing adds its px after every character (a spaced-capitals caption)', () => {
    const plain = estimateTextWidth('OUR SIDE', { size: 11, weight: 700 });
    expect(estimateTextWidth('OUR SIDE', { size: 11, weight: 700, letterSpacing: 1 })).toBeCloseTo(plain + 8, 5);
  });
});
