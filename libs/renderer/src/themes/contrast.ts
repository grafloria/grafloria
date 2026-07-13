// WCAG contrast — the arithmetic the a11y theming card is built on.
//
// Styling & theming, Card "design-token bridge + accessibility-aware theming".
//
// Every function here is pure and colour-space-only: no DOM, no theme. The
// theme-level checks (audit / derive / assert) live in `theme-a11y.ts` and are
// written entirely in terms of these.
//
// WCAG 2.x contrast ratio: (L1 + 0.05) / (L2 + 0.05), L = relative luminance,
// ranging 1 (identical) … 21 (black on white).

/** WCAG 2.x conformance thresholds. */
export const WCAG = {
  /** Normal-size text, AA. */
  AA_TEXT: 4.5,
  /** Large text (>=18pt, or >=14pt bold), AA. */
  AA_LARGE: 3,
  /** Non-text UI: borders, focus rings, graphical objects (WCAG 1.4.11). */
  AA_NON_TEXT: 3,
  /** Normal-size text, AAA. */
  AAA_TEXT: 7,
  /** Large text, AAA. */
  AAA_LARGE: 4.5,
} as const;

/** sRGB channels, 0-255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** HSL — the space the light↔dark flip has to happen in (see below). */
export interface Hsl {
  /** 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  /** 0-1 */
  l: number;
}

const HEX_RE = /^#?([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

/**
 * Parse the colour forms a theme can actually hold: `#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`, `rgb()/rgba()`.
 *
 * `undefined` for anything else — a CSS system colour (`CanvasText`), a
 * `var(--x)`, a gradient spec. Callers must SKIP those rather than pretend a
 * ratio: a contrast claim about a value we cannot see is worse than no claim.
 */
export function parseColor(value: string): Rgb | undefined {
  const input = value.trim();

  const hex = HEX_RE.exec(input);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = digits.split('').map(d => d + d).join('');
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(input);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(n => Number.isFinite(n))) {
      return { r: clamp255(parts[0]), g: clamp255(parts[1]), b: clamp255(parts[2]) };
    }
  }

  return undefined;
}

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** `{r:255,g:0,b:0}` → `#ff0000`. */
export function toHex({ r, g, b }: Rgb): string {
  const pair = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(color: Rgb): number {
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/**
 * Contrast ratio between two colours, 1…21. `undefined` when either colour is
 * not one we can parse (see {@link parseColor}).
 */
export function contrastRatio(a: string, b: string): number | undefined {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return undefined;

  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Does this pair clear a threshold? Unparseable colours are NOT a pass. */
export function meetsContrast(a: string, b: string, minimum: number): boolean {
  const ratio = contrastRatio(a, b);
  return ratio !== undefined && ratio >= minimum - 1e-9;
}

// ---------------------------------------------------------------------------
// HSL — the space the light↔dark flip has to happen in
// ---------------------------------------------------------------------------
//
// NOT relative luminance. Mirroring luminance (`L' = 1 - L`) looks right and is
// wrong: to lift a saturated dark red to the mirrored luminance you have to blend
// it most of the way to white, and it arrives as a washed-out pink. Flipping HSL
// LIGHTNESS keeps hue and saturation exactly, so a dark red becomes a light red —
// which is what a dark theme actually wants.

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const m = l - c / 2;
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
  };
}

/** HSL lightness of a colour, 0-1. Undefined for unparseable input. */
export function lightnessOf(hex: string): number | undefined {
  const rgb = parseColor(hex);
  return rgb ? rgbToHsl(rgb).l : undefined;
}

/** Same hue and saturation, new lightness. The primitive the dark-flip is built on. */
export function withLightness(hex: string, lightness: number): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return toHex(hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, lightness)) }));
}

// ---------------------------------------------------------------------------
// Repair — used by the derive utility to make a generated theme actually pass
// ---------------------------------------------------------------------------

/** Scale a colour's channels toward black (`t<0`) or white (`t>0`), |t| in 0…1. */
function shift(color: Rgb, t: number): Rgb {
  const target = t > 0 ? 255 : 0;
  const amount = Math.abs(t);
  return {
    r: color.r + (target - color.r) * amount,
    g: color.g + (target - color.g) * amount,
    b: color.b + (target - color.b) * amount,
  };
}

/**
 * Push `foreground` away from `background` until it clears `minimum`.
 *
 * Walks in whichever direction the background is NOT (a light background darkens
 * the foreground, a dark one lightens it) in fixed steps, and takes the first
 * step that passes. Black/white are the endpoints, so on any real background
 * this terminates with a passing colour — that is why the derived themes can be
 * ASSERTED to conform rather than eyeballed.
 *
 * Returns the input untouched when it already passes, or when either colour is
 * unparseable (nothing sensible to do — the audit will report it).
 */
export function ensureContrast(foreground: string, background: string, minimum: number): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return foreground;
  if (meetsContrast(foreground, background, minimum)) return foreground;

  // Toward black on a light background, toward white on a dark one.
  const direction = relativeLuminance(bg) > 0.5 ? -1 : 1;

  for (let step = 1; step <= 20; step++) {
    const candidate = toHex(shift(fg, direction * (step / 20)));
    if (meetsContrast(candidate, background, minimum)) return candidate;
  }

  // Unreachable for a parseable background (step 20 IS pure black/white), but a
  // deterministic endpoint beats a silent near-miss.
  return direction < 0 ? '#000000' : '#ffffff';
}
