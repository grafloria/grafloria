// Card "colorMode with system auto-detection" — the resolution rule + the
// media-query subscription.
//
// The renderer-side half (does an OS flip actually re-theme the DOM, and how much
// does it rebuild?) is pinned by svg-renderer.color-mode.spec.ts.

import {
  ColorModeController,
  MEDIA_FORCED_COLORS,
  MEDIA_PREFERS_CONTRAST,
  MEDIA_PREFERS_DARK,
  readColorPreferences,
  resolveThemeFromPrefs,
  type ThemeSet,
} from './color-mode';
import { LIGHT_THEME } from './default-light-theme';
import { DARK_THEME } from './default-dark-theme';
import { HIGH_CONTRAST_DARK_THEME, HIGH_CONTRAST_LIGHT_THEME } from './high-contrast-theme';
import type { Theme } from '../types/theme.types';

const THEMES: ThemeSet = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  highContrastLight: HIGH_CONTRAST_LIGHT_THEME,
  highContrastDark: HIGH_CONTRAST_DARK_THEME,
};

/** A ThemeSet with NO high-contrast entries — the "host never thought about it" case. */
const PLAIN: ThemeSet = { light: LIGHT_THEME, dark: DARK_THEME };

// ---------------------------------------------------------------------------
// A controllable matchMedia. jsdom's own stub reports `matches: false` forever
// and never fires, so an OS flip has to be simulated.
// ---------------------------------------------------------------------------

interface FakeQuery {
  media: string;
  matches: boolean;
  listeners: Array<() => void>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

class FakeMedia {
  readonly queries = new Map<string, FakeQuery>();

  constructor(initial: Record<string, boolean> = {}) {
    for (const media of [MEDIA_PREFERS_DARK, MEDIA_PREFERS_CONTRAST, MEDIA_FORCED_COLORS]) {
      const query: FakeQuery = {
        media,
        matches: initial[media] ?? false,
        listeners: [],
        addEventListener: (_type, listener) => query.listeners.push(listener),
        removeEventListener: (_type, listener) => {
          const index = query.listeners.indexOf(listener);
          if (index >= 0) query.listeners.splice(index, 1);
        },
      };
      this.queries.set(media, query);
    }
    (window as any).matchMedia = (media: string) => this.queries.get(media);
  }

  /** Flip a preference and fire, exactly as the OS would. */
  set(media: string, matches: boolean): void {
    const query = this.queries.get(media)!;
    query.matches = matches;
    query.listeners.forEach(listener => listener());
  }

  listenerCount(): number {
    return [...this.queries.values()].reduce((total, q) => total + q.listeners.length, 0);
  }
}

describe('colorMode', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    (window as any).matchMedia = originalMatchMedia;
  });

  // =========================================================================
  // The rule, as a pure function
  // =========================================================================
  describe('resolveThemeFromPrefs', () => {
    const NONE = { prefersDark: false, prefersContrast: false, forcedColors: false };

    it('light/dark are PINNED — the OS does not get a vote', () => {
      expect(resolveThemeFromPrefs('light', { ...NONE, prefersDark: true }, THEMES)).toBe(LIGHT_THEME);
      expect(resolveThemeFromPrefs('dark', { ...NONE, prefersDark: false }, THEMES)).toBe(DARK_THEME);
    });

    it("'system' follows prefers-color-scheme", () => {
      expect(resolveThemeFromPrefs('system', NONE, THEMES)).toBe(LIGHT_THEME);
      expect(resolveThemeFromPrefs('system', { ...NONE, prefersDark: true }, THEMES)).toBe(DARK_THEME);
    });

    it('prefers-contrast UPGRADES the resolved scheme — it does not replace it', () => {
      // A dark-mode user who wants more contrast gets high-contrast DARK. Handing
      // them a light theme would be a flashbang.
      expect(resolveThemeFromPrefs('dark', { ...NONE, prefersContrast: true }, THEMES)).toBe(
        HIGH_CONTRAST_DARK_THEME
      );
      expect(resolveThemeFromPrefs('light', { ...NONE, prefersContrast: true }, THEMES)).toBe(
        HIGH_CONTRAST_LIGHT_THEME
      );
    });

    it('forced-colors upgrades the same way', () => {
      expect(
        resolveThemeFromPrefs('system', { ...NONE, prefersDark: true, forcedColors: true }, THEMES)
      ).toBe(HIGH_CONTRAST_DARK_THEME);
    });

    it('an a11y preference outranks the aesthetic one, in every mode', () => {
      for (const mode of ['light', 'dark', 'system'] as const) {
        const theme = resolveThemeFromPrefs(mode, { ...NONE, prefersContrast: true }, THEMES);
        expect([HIGH_CONTRAST_LIGHT_THEME, HIGH_CONTRAST_DARK_THEME]).toContain(theme);
      }
    });

    it('degrades to plain light/dark when the host supplied no high-contrast theme', () => {
      expect(resolveThemeFromPrefs('dark', { ...NONE, prefersContrast: true }, PLAIN)).toBe(DARK_THEME);
      expect(resolveThemeFromPrefs('light', { ...NONE, forcedColors: true }, PLAIN)).toBe(LIGHT_THEME);
    });
  });

  // =========================================================================
  // Reading the OS
  // =========================================================================
  describe('readColorPreferences', () => {
    it('reads all three queries', () => {
      new FakeMedia({ [MEDIA_PREFERS_DARK]: true, [MEDIA_FORCED_COLORS]: true });
      expect(readColorPreferences()).toEqual({
        prefersDark: true,
        prefersContrast: false,
        forcedColors: true,
      });
    });

    it('assumes nothing when matchMedia is unavailable (SSR / Node)', () => {
      (window as any).matchMedia = undefined;
      expect(readColorPreferences()).toEqual({
        prefersDark: false,
        prefersContrast: false,
        forcedColors: false,
      });
    });
  });

  // =========================================================================
  // The live subscription — THE card
  // =========================================================================
  describe('ColorModeController', () => {
    it("'system' re-themes when the OS flips to dark", () => {
      const media = new FakeMedia();

      const seen: Theme[] = [];
      const controller = new ColorModeController('system', THEMES, theme => seen.push(theme));
      controller.prime(controller.resolve());
      expect(controller.resolve()).toBe(LIGHT_THEME);

      media.set(MEDIA_PREFERS_DARK, true);

      expect(seen).toEqual([DARK_THEME]);
      controller.dispose();
    });

    it('…and back again', () => {
      const media = new FakeMedia({ [MEDIA_PREFERS_DARK]: true });

      const seen: Theme[] = [];
      const controller = new ColorModeController('system', THEMES, theme => seen.push(theme));
      controller.prime(controller.resolve());

      media.set(MEDIA_PREFERS_DARK, false);
      media.set(MEDIA_PREFERS_DARK, true);

      expect(seen).toEqual([LIGHT_THEME, DARK_THEME]);
      controller.dispose();
    });

    it('a PINNED mode ignores the colour-scheme flip…', () => {
      const media = new FakeMedia();

      const seen: Theme[] = [];
      const controller = new ColorModeController('light', THEMES, theme => seen.push(theme));
      controller.prime(controller.resolve());

      media.set(MEDIA_PREFERS_DARK, true);

      expect(seen).toEqual([]);
      controller.dispose();
    });

    it('…but STILL honours a contrast preference (a11y is not opt-in)', () => {
      const media = new FakeMedia();

      const seen: Theme[] = [];
      const controller = new ColorModeController('light', THEMES, theme => seen.push(theme));
      controller.prime(controller.resolve());

      media.set(MEDIA_PREFERS_CONTRAST, true);

      expect(seen).toEqual([HIGH_CONTRAST_LIGHT_THEME]);
      controller.dispose();
    });

    it('does not re-theme when the OS changes but the ANSWER does not', () => {
      // No high-contrast theme supplied → a contrast flip resolves to the same
      // dark theme, so nothing should be re-themed.
      const media = new FakeMedia({ [MEDIA_PREFERS_DARK]: true });

      const seen: Theme[] = [];
      const controller = new ColorModeController('system', PLAIN, theme => seen.push(theme));
      controller.prime(controller.resolve());

      media.set(MEDIA_PREFERS_CONTRAST, true);

      expect(seen).toEqual([]);
      controller.dispose();
    });

    it('setMode() switches, and emits only on a real change', () => {
      new FakeMedia();

      const seen: Theme[] = [];
      const controller = new ColorModeController('light', THEMES, theme => seen.push(theme));
      controller.prime(controller.resolve());

      controller.setMode('dark');
      controller.setMode('dark'); // no-op
      expect(seen).toEqual([DARK_THEME]);
      expect(controller.getMode()).toBe('dark');

      controller.dispose();
    });

    it('dispose() removes every listener it added', () => {
      const media = new FakeMedia();

      const controller = new ColorModeController('system', THEMES, () => undefined);
      expect(media.listenerCount()).toBe(3); // dark + contrast + forced-colors

      controller.dispose();
      expect(media.listenerCount()).toBe(0);

      // …and a post-dispose OS change reaches nobody.
      const seen: Theme[] = [];
      const other = new ColorModeController('system', THEMES, theme => seen.push(theme));
      other.prime(other.resolve());
      controller.dispose(); // idempotent
      media.set(MEDIA_PREFERS_DARK, true);
      expect(seen).toEqual([DARK_THEME]);
      other.dispose();
    });

    it('survives an environment with no matchMedia at all', () => {
      (window as any).matchMedia = undefined;

      const controller = new ColorModeController('system', THEMES, () => undefined);
      expect(controller.resolve()).toBe(LIGHT_THEME);
      expect(() => controller.dispose()).not.toThrow();
    });
  });
});
