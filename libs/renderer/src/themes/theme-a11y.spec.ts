// Card "accessibility-aware theming" — the contrast maths, the VALIDATED
// high-contrast themes, and the derive utility that must prove its own output.

import {
  WCAG,
  contrastRatio,
  ensureContrast,
  lightnessOf,
  meetsContrast,
  parseColor,
  relativeLuminance,
  rgbToHsl,
  toHex,
  withLightness,
} from './contrast';
import { assertThemeContrast, auditThemeContrast, deriveTheme } from './theme-a11y';
import { LIGHT_THEME } from './default-light-theme';
import { DARK_THEME } from './default-dark-theme';
import { HIGH_CONTRAST_DARK_THEME, HIGH_CONTRAST_LIGHT_THEME } from './high-contrast-theme';
import type { Theme } from '../types/theme.types';

describe('contrast maths', () => {
  describe('parseColor', () => {
    it('parses the forms a theme can actually hold', () => {
      expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseColor('#2563eb')).toEqual({ r: 0x25, g: 0x63, b: 0xeb });
      expect(parseColor('rgb(37, 99, 235)')).toEqual({ r: 37, g: 99, b: 235 });
      expect(parseColor('rgba(37, 99, 235, 0.5)')).toEqual({ r: 37, g: 99, b: 235 });
    });

    it('REFUSES what it cannot see, rather than guessing', () => {
      // A system colour or a var() has no measurable luminance. Pretending it
      // does would produce a contrast claim that is simply false.
      expect(parseColor('CanvasText')).toBeUndefined();
      expect(parseColor('var(--grafloria-node-fill)')).toBeUndefined();
      expect(parseColor('url(#gradient-1)')).toBeUndefined();
    });
  });

  describe('contrastRatio', () => {
    it('matches the WCAG reference values', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
      expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
      // The canonical mid-grey: #767676 is the lightest grey that clears 4.5:1 on white.
      expect(contrastRatio('#767676', '#ffffff')!).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#777777', '#ffffff')!).toBeLessThan(4.5);
    });

    it('is symmetric', () => {
      expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456')!, 9);
    });

    it('is undefined — not 1, not 21 — when a colour is unmeasurable', () => {
      expect(contrastRatio('CanvasText', '#ffffff')).toBeUndefined();
      // …and an unmeasurable pair is never reported as a PASS.
      expect(meetsContrast('CanvasText', '#ffffff', WCAG.AA_TEXT)).toBe(false);
    });
  });

  describe('relativeLuminance', () => {
    it('anchors at black and white', () => {
      expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6);
      expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
    });
  });

  describe('HSL — the axis the light↔dark flip happens on', () => {
    it('round-trips hue and saturation through a lightness change', () => {
      const flipped = withLightness('#b91c1c', 0.58);
      const before = rgbToHsl(parseColor('#b91c1c')!);
      const after = rgbToHsl(parseColor(flipped)!);

      expect(after.h).toBeCloseTo(before.h, 0);
      expect(after.s).toBeCloseTo(before.s, 1);
      expect(after.l).toBeCloseTo(0.58, 2);
    });

    it('keeps a dark red RED when lightened (the bug that killed luminance-mirroring)', () => {
      // Blending toward white to hit a mirrored LUMINANCE produced #faf0f0 — a
      // pale pink. An HSL lightness flip keeps the hue and the saturation.
      const lightened = withLightness('#b91c1c', 0.58);
      const hsl = rgbToHsl(parseColor(lightened)!);
      expect(hsl.s).toBeGreaterThan(0.5); // still saturated, not washed out
      expect(lightnessOf(lightened)).toBeCloseTo(0.58, 2);
    });
  });

  describe('ensureContrast', () => {
    it('leaves a passing colour alone', () => {
      expect(ensureContrast('#000000', '#ffffff', WCAG.AA_TEXT)).toBe('#000000');
    });

    it('always terminates with a PASSING colour, for any background', () => {
      const backgrounds = ['#ffffff', '#000000', '#808080', '#2563eb', '#fef3c7'];
      for (const bg of backgrounds) {
        for (const fg of ['#888888', '#2563eb', '#10b981', '#ef4444']) {
          const fixed = ensureContrast(fg, bg, WCAG.AA_NON_TEXT);
          expect(meetsContrast(fixed, bg, WCAG.AA_NON_TEXT)).toBe(true);
        }
      }
    });

    it('cannot repair what it cannot measure, and says so by not changing it', () => {
      expect(ensureContrast('CanvasText', '#ffffff', WCAG.AA_TEXT)).toBe('CanvasText');
    });
  });

  it('toHex clamps and pads', () => {
    expect(toHex({ r: 0, g: 5, b: 300 })).toBe('#0005ff');
  });
});

// ===========================================================================
describe('auditThemeContrast', () => {
  it('checks text, selection, states, links, ports AND the semantic palette', () => {
    const report = auditThemeContrast(LIGHT_THEME);
    const kinds = new Set(report.checks.map(c => c.kind));
    expect(kinds).toEqual(new Set(['text', 'selection', 'state', 'link', 'port', 'category']));

    // The category palette is checked because a theme-bound fill is exactly the
    // thing that can make a diagram unreadable after a theme swap.
    expect(report.checks.some(c => c.id === 'category.critical on node.fill')).toBe(true);
  });

  it('exempts disabled (WCAG 1.4.3 does) — reported, never enforced', () => {
    const report = auditThemeContrast(LIGHT_THEME);
    expect(report.checks.filter(c => c.exempt).length).toBeGreaterThan(0);
    expect(report.failures.every(f => !f.exempt)).toBe(true);
  });

  it('holds text to 4.5:1 and non-text UI to 3:1', () => {
    const report = auditThemeContrast(LIGHT_THEME);
    expect(report.checks.find(c => c.kind === 'text')!.required).toBe(WCAG.AA_TEXT);
    expect(report.checks.find(c => c.kind === 'selection')!.required).toBe(WCAG.AA_NON_TEXT);
  });

  // -------------------------------------------------------------------------
  // A CHARACTERISATION test, not an aspiration.
  //
  // The default light/dark themes shipped in earlier waves DO NOT meet WCAG
  // 1.4.11 (3:1 for non-text UI) on several borders/links/ports — their palette
  // is the Tailwind grey ramp, chosen to look right rather than to measure right.
  // That is precisely why this card ships a validated high-contrast pair and
  // auto-upgrades to it on `prefers-contrast`.
  //
  // The exact failing set is pinned so it cannot silently GROW. Changing the
  // default palettes is a visual change to shipped themes and is deliberately
  // out of this card's scope.
  // -------------------------------------------------------------------------
  it('finds the known non-text gaps in the DEFAULT light theme (pinned, must not grow)', () => {
    const report = auditThemeContrast(LIGHT_THEME);
    expect(report.failures.map(f => f.id).sort()).toEqual(
      [
        'link.default on background',
        'link.highlighted on background',
        'node.default.stroke on background',
        'node.highlighted.stroke on node.highlighted.fill',
        'port.input on port fill',
        'port.output on port fill',
      ].sort()
    );
    // TEXT, at least, is compliant in both default themes.
    expect(report.checks.filter(c => c.kind === 'text' && !c.exempt).every(c => c.passes)).toBe(true);
  });

  it('finds the known non-text gaps in the DEFAULT dark theme (pinned, must not grow)', () => {
    const report = auditThemeContrast(DARK_THEME);
    expect(report.failures.map(f => f.id).sort()).toEqual(
      [
        'node.default.stroke on background',
        'node.error.stroke on node.error.fill',
        'node.selected.stroke on node.selected.fill',
      ].sort()
    );
    expect(report.checks.filter(c => c.kind === 'text' && !c.exempt).every(c => c.passes)).toBe(true);
  });
});

// ===========================================================================
describe('the built-in HIGH-CONTRAST themes are validated, not asserted', () => {
  it.each([
    ['High Contrast Light', HIGH_CONTRAST_LIGHT_THEME],
    ['High Contrast Dark', HIGH_CONTRAST_DARK_THEME],
  ])('%s clears WCAG AAA text and 3:1 non-text, with no exceptions', (_name, theme) => {
    const report = auditThemeContrast(theme as Theme, WCAG.AAA_TEXT);
    expect(report.failures).toEqual([]);
    expect(report.passes).toBe(true);
    expect(() => assertThemeContrast(theme as Theme, WCAG.AAA_TEXT)).not.toThrow();
  });

  it('every stroke clears 4.5:1 — well past the 3:1 floor for non-text UI', () => {
    for (const theme of [HIGH_CONTRAST_LIGHT_THEME, HIGH_CONTRAST_DARK_THEME]) {
      const report = auditThemeContrast(theme, WCAG.AAA_TEXT);
      const strokes = report.checks.filter(c => c.kind !== 'text' && !c.exempt && c.ratio !== undefined);
      expect(strokes.length).toBeGreaterThan(5);
      for (const check of strokes) {
        expect(check.ratio!).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      }
    }
  });

  it('WEIGHT too: hairlines are thickened (contrast alone is not accessibility)', () => {
    for (const theme of [HIGH_CONTRAST_LIGHT_THEME, HIGH_CONTRAST_DARK_THEME]) {
      expect(theme.nodes.default.strokeWidth).toBeGreaterThanOrEqual(2);
      expect(theme.links.default.strokeWidth).toBeGreaterThanOrEqual(3);
      expect(theme.numbers!.hairline!).toBeGreaterThanOrEqual(2);
    }
  });

  it('carries the SAME category names as the default themes (a swap must not lose one)', () => {
    const expected = Object.keys(LIGHT_THEME.categories ?? {}).sort();
    expect(Object.keys(HIGH_CONTRAST_LIGHT_THEME.categories ?? {}).sort()).toEqual(expected);
    expect(Object.keys(HIGH_CONTRAST_DARK_THEME.categories ?? {}).sort()).toEqual(expected);
  });
});

// ===========================================================================
describe('assertThemeContrast', () => {
  it('throws, naming the failing pairs and their ratios', () => {
    const broken: Theme = {
      ...LIGHT_THEME,
      colors: {
        ...LIGHT_THEME.colors,
        text: { ...LIGHT_THEME.colors.text, primary: '#eeeeee' }, // on a white node
      },
    };
    expect(() => assertThemeContrast(broken)).toThrow(/text\.primary on node\.fill/);
    expect(() => assertThemeContrast(broken)).toThrow(/needs 4\.5:1/);
  });
});

// ===========================================================================
describe('deriveTheme — auto-derive, then PROVE it', () => {
  describe('dark from light', () => {
    const derived = deriveTheme({ from: LIGHT_THEME, mode: 'dark' });

    it('is actually dark', () => {
      expect(lightnessOf(derived.colors.background.default)!).toBeLessThan(0.2);
      expect(lightnessOf(derived.colors.text.primary)!).toBeGreaterThan(0.5);
    });

    it('separates the node surface from the canvas by ELEVATION', () => {
      // A straight lightness flip collapses `#ffffff` (canvas) and `#f9fafb`
      // (surface) onto the same floor — the nodes disappear into the background.
      const canvas = lightnessOf(derived.colors.background.default)!;
      const surface = lightnessOf(derived.colors.node.default.fill)!;
      expect(surface).toBeGreaterThan(canvas);
    });

    it('KEEPS THE HUES of the semantic palette (the washed-out-pink bug)', () => {
      const critical = rgbToHsl(parseColor(derived.categories!.critical!)!);
      const success = rgbToHsl(parseColor(derived.categories!.success!)!);

      // Still a red and still a green — and still saturated, not four shades of
      // near-white (which is what mirroring relative luminance produced).
      expect(critical.s).toBeGreaterThan(0.3);
      expect(success.s).toBeGreaterThan(0.3);
      expect(
        Math.abs(critical.h - rgbToHsl(parseColor(LIGHT_THEME.categories!.critical!)!).h)
      ).toBeLessThan(20);
      expect(
        Math.abs(success.h - rgbToHsl(parseColor(LIGHT_THEME.categories!.success!)!).h)
      ).toBeLessThan(20);
    });

    it('derives the STATE and SECONDARY colours alongside the surfaces', () => {
      for (const state of ['selected', 'highlighted', 'hovered', 'error'] as const) {
        expect(derived.colors.node[state].fill).not.toBe(LIGHT_THEME.colors.node[state].fill);
        expect(derived.colors.node[state].stroke).toBeDefined();
      }
      expect(derived.colors.text.secondary).not.toBe(LIGHT_THEME.colors.text.secondary);
      expect(derived.colors.secondary).not.toBe(LIGHT_THEME.colors.secondary);
    });

    it('CONFORMS — which is the whole claim (and the default themes do not)', () => {
      const report = auditThemeContrast(derived);
      expect(report.failures).toEqual([]);
      // The very pairs the hand-made default themes fail are repaired here.
      expect(report.checks.find(c => c.id === 'node.default.stroke on background')!.passes).toBe(true);
      expect(report.checks.find(c => c.id === 'link.default on background')!.passes).toBe(true);
    });

    it('keeps everything a theme swap needs to answer for: the same category names', () => {
      expect(Object.keys(derived.categories ?? {}).sort()).toEqual(
        Object.keys(LIGHT_THEME.categories ?? {}).sort()
      );
    });
  });

  describe('high-contrast from light', () => {
    const derived = deriveTheme({ from: LIGHT_THEME, mode: 'high-contrast' });

    it('clears AAA text', () => {
      expect(auditThemeContrast(derived, WCAG.AAA_TEXT).failures).toEqual([]);
    });

    it('thickens the strokes too', () => {
      expect(derived.nodes.default.strokeWidth).toBeGreaterThanOrEqual(2);
      expect(derived.links.default.strokeWidth).toBeGreaterThanOrEqual(3);
      expect(derived.numbers!.emphasis!).toBeGreaterThanOrEqual(4);
    });

    it('stays in the LIGHT colour scheme (contrast is not a scheme flip)', () => {
      expect(lightnessOf(derived.colors.background.default)!).toBeGreaterThan(0.8);
    });
  });

  it('names the result, and lets the caller override the name', () => {
    expect(deriveTheme({ from: LIGHT_THEME, mode: 'dark' }).name).toBe('Light (Dark)');
    expect(deriveTheme({ from: LIGHT_THEME, mode: 'dark', name: 'Midnight' }).name).toBe('Midnight');
  });

  it('an UNMEASURABLE colour is never claimed to conform', () => {
    // A system colour has no luminance, so it cannot be repaired — and it is not
    // reported as a pass either. The guarantee is "every pair we CAN measure
    // conforms", and the report says exactly that by leaving `ratio` undefined.
    const unmeasurable: Theme = {
      ...LIGHT_THEME,
      colors: {
        ...LIGHT_THEME.colors,
        background: { ...LIGHT_THEME.colors.background, default: 'Canvas' },
      },
    };
    const derived = deriveTheme({ from: unmeasurable, mode: 'dark' });
    const report = auditThemeContrast(derived);

    expect(report.passes).toBe(true);
    expect(report.checks.some(c => c.ratio === undefined)).toBe(true);
  });
});
