// colorMode — 'light' | 'dark' | 'system', with live OS auto-detection.
//
// Styling & theming, Card "colorMode with system auto-detection and hot-swap".
//
// We shipped a LIGHT theme and a DARK theme and no way to choose between them at
// runtime: the caller had to know which one the OS wanted, pass it in, and watch
// `prefers-color-scheme` itself. React Flow has had a `colorMode` prop (including
// `'system'`) for years; GoJS's ThemeManager the same.
//
// WHAT THIS OWNS. The media queries and NOTHING else — it is a pure, DOM-only
// subscription that reports "given the OS right now, which theme should be
// active?". Applying that theme is the renderer's job (see
// `SVGRenderer.applyThemeVariables`), which is what keeps this file testable and
// framework-free.
//
// ACCESSIBILITY IS PART OF THE RESOLUTION, not a separate switch (Card
// "design-token bridge + accessibility-aware theming"): a user who has asked for
// more contrast, or who is in a forced-colors mode, must get the HIGH-CONTRAST
// theme regardless of the colorMode the host requested — the a11y preference
// outranks the aesthetic one. That decision lives in `resolveThemeFromPrefs`
// below, so it is one pure function, unit-testable without a browser.

import type { Theme } from '../types/theme.types';

/** The prop. `'system'` follows the OS and re-themes when it changes. */
export type ColorMode = 'light' | 'dark' | 'system';

/**
 * The themes a renderer can switch BETWEEN. `light`/`dark` are required (they
 * are what `colorMode` selects); the high-contrast pair is optional and only
 * consulted when the user has actually asked for contrast.
 */
export interface ThemeSet {
  light: Theme;
  dark: Theme;
  highContrastLight?: Theme;
  highContrastDark?: Theme;
}

/** The OS-level preferences that decide which theme wins. */
export interface ColorPreferences {
  /** `prefers-color-scheme: dark` */
  prefersDark: boolean;
  /** `prefers-contrast: more` */
  prefersContrast: boolean;
  /** `forced-colors: active` — Windows High Contrast and friends. */
  forcedColors: boolean;
}

export const MEDIA_PREFERS_DARK = '(prefers-color-scheme: dark)';
export const MEDIA_PREFERS_CONTRAST = '(prefers-contrast: more)';
export const MEDIA_FORCED_COLORS = '(forced-colors: active)';

/**
 * THE resolution rule, as one pure function.
 *
 *   1. `colorMode` picks the light/dark AXIS ('system' → the OS's answer).
 *   2. An explicit contrast preference (`prefers-contrast: more`, or a forced-
 *      colors mode) then upgrades that axis to the high-contrast theme, when the
 *      caller supplied one. It is an UPGRADE, not a replacement: a user in dark
 *      mode who wants more contrast gets high-contrast DARK, not a light flash.
 *
 * Note `forced-colors` ALSO gets a pure-CSS treatment (the variable block emits a
 * system-colour override under `@media (forced-colors: active)`), because the OS
 * palette must win even for a host that never passed a high-contrast theme. The
 * two are complementary: this picks the best THEME we have; that guarantees the
 * floor.
 */
export function resolveThemeFromPrefs(
  mode: ColorMode,
  prefs: ColorPreferences,
  themes: ThemeSet
): Theme {
  const dark = mode === 'system' ? prefs.prefersDark : mode === 'dark';
  const wantsContrast = prefs.prefersContrast || prefs.forcedColors;

  if (wantsContrast) {
    const hc = dark ? themes.highContrastDark : themes.highContrastLight;
    if (hc) return hc;
  }
  return dark ? themes.dark : themes.light;
}

/** No `window` (SSR, Node tests): assume the plain light-mode defaults. */
const NO_PREFS: ColorPreferences = { prefersDark: false, prefersContrast: false, forcedColors: false };

function canQuery(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/** Read the three OS preferences right now. */
export function readColorPreferences(): ColorPreferences {
  if (!canQuery()) return { ...NO_PREFS };
  return {
    prefersDark: !!window.matchMedia(MEDIA_PREFERS_DARK)?.matches,
    prefersContrast: !!window.matchMedia(MEDIA_PREFERS_CONTRAST)?.matches,
    forcedColors: !!window.matchMedia(MEDIA_FORCED_COLORS)?.matches,
  };
}

/**
 * Watches the OS preferences and calls back with the theme that should now be
 * active. Owns its listeners; `dispose()` removes every one of them.
 *
 * It subscribes to the contrast/forced-colors queries even in explicit
 * light/dark mode — those are ACCESSIBILITY preferences, and a user who turns on
 * high contrast must be honoured whether or not the host let them choose a
 * colour scheme.
 */
export class ColorModeController {
  private mode: ColorMode;
  private themes: ThemeSet;
  private readonly onTheme: (theme: Theme) => void;

  /** [query, listener] pairs, so dispose() can undo exactly what it did. */
  private subscriptions: Array<[MediaQueryList, (e: MediaQueryListEvent) => void]> = [];

  /** Last theme handed to the callback — so a no-op change stays a no-op. */
  private current?: Theme;

  constructor(mode: ColorMode, themes: ThemeSet, onTheme: (theme: Theme) => void) {
    this.mode = mode;
    this.themes = themes;
    this.onTheme = onTheme;
    this.subscribe();
  }

  /** The theme the current mode + OS preferences resolve to. */
  resolve(): Theme {
    return resolveThemeFromPrefs(this.mode, readColorPreferences(), this.themes);
  }

  /** The mode this controller is following. */
  getMode(): ColorMode {
    return this.mode;
  }

  /** Switch modes. Emits immediately if the resolved theme actually changed. */
  setMode(mode: ColorMode): void {
    this.mode = mode;
    this.emit();
  }

  /** Swap the theme SET (e.g. the host shipped its own light/dark pair). */
  setThemes(themes: ThemeSet): void {
    this.themes = themes;
    this.emit();
  }

  /**
   * Push the current resolution to the callback. Deduped by identity: an OS
   * change that does not change the ANSWER (contrast toggled while a host
   * supplied no high-contrast theme) must not trigger a re-theme.
   */
  emit(): void {
    const next = this.resolve();
    if (next === this.current) return;
    this.current = next;
    this.onTheme(next);
  }

  /** Prime `current` without calling back — the renderer already has this theme. */
  prime(theme: Theme): void {
    this.current = theme;
  }

  dispose(): void {
    for (const [query, listener] of this.subscriptions) {
      // Safari < 14 only has the deprecated form; both are guarded because a
      // jsdom MediaQueryList stub may implement neither.
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', listener);
      } else if (typeof query.removeListener === 'function') {
        query.removeListener(listener);
      }
    }
    this.subscriptions = [];
  }

  private subscribe(): void {
    if (!canQuery()) return;

    for (const media of [MEDIA_PREFERS_DARK, MEDIA_PREFERS_CONTRAST, MEDIA_FORCED_COLORS]) {
      const query = window.matchMedia(media);
      if (!query) continue;

      const listener = () => this.emit();
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', listener);
      } else if (typeof query.addListener === 'function') {
        query.addListener(listener);
      } else {
        continue; // unusable stub — nothing to unsubscribe later either
      }
      this.subscriptions.push([query, listener]);
    }
  }
}
