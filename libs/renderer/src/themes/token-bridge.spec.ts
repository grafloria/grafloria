/**
 * ============================================================================
 * Token bridges must FAIL SOFT — never to a black diagram. (Regression lock.)
 * ============================================================================
 *
 * A bridge maps Grafloria's variables onto the HOST's design-system variables. On
 * a host that never defined those variables, a bare `var(--color-slate-300)`
 * is invalid at computed-value time and SVG's initial fill — BLACK — wins:
 * the Tailwind bridge painted every node solid black on a page with no
 * Tailwind v4 theme variables (live report: "tailwind tokens doesn't work
 * good"; Tailwind v3 hosts have NO runtime variables at all, so this is the
 * common case, not the corner). Every bridge value now carries its
 * framework's canonical default as the var() fallback.
 */

import { shadcnBridge, muiBridge, tailwindBridge } from './token-bridge';

/** Every var() reference in a value must carry a fallback: `var(--x, <fallback>)`. */
const bareVarRefs = (value: string): string[] => {
  const bare: string[] = [];
  const re = /var\((--[^,)]+)(,)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    if (!m[2]) bare.push(m[1]);
  }
  return bare;
};

const allBare = (bridge: Record<string, string>): string[] =>
  Object.values(bridge).flatMap(bareVarRefs);

describe('token bridges fail soft to their stock palette', () => {
  test('tailwindBridge: every variable reference carries a canonical-hex fallback', () => {
    expect(allBare(tailwindBridge())).toEqual([]);
  });

  test('tailwindBridge: non-default ramps still carry fallbacks', () => {
    expect(allBare(tailwindBridge({ scale: 'zinc', accent: 'indigo' }))).toEqual([]);
    expect(allBare(tailwindBridge({ scale: 'stone', accent: 'emerald' }))).toEqual([]);
  });

  test('tailwindBridge: a ramp we carry no hexes for approximates to slate/blue, never bare', () => {
    expect(allBare(tailwindBridge({ scale: 'cyan', accent: 'fuchsia' }))).toEqual([]);
  });

  test('muiBridge: every variable reference carries a Material default fallback', () => {
    expect(allBare(muiBridge())).toEqual([]);
    expect(allBare(muiBridge('--md'))).toEqual([]); // custom prefix keeps them
  });

  test('shadcnBridge (hsl, the default): every reference carries the stock HSL triplet', () => {
    expect(allBare(shadcnBridge())).toEqual([]);
  });

  test('shadcnBridge (raw): hex fallbacks', () => {
    expect(allBare(shadcnBridge({ space: 'raw' }))).toEqual([]);
  });

  test('the fallbacks are real colours, not empty strings', () => {
    for (const bridge of [tailwindBridge(), muiBridge(), shadcnBridge()]) {
      for (const value of Object.values(bridge)) {
        const m = /var\(--[^,)]+,\s*([^)]*)\)/.exec(value);
        if (m) expect(m[1].trim().length).toBeGreaterThan(2);
      }
    }
  });
});
