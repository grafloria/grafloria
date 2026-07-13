// The themes `colorMode` chooses between, out of the box.
//
// Its own module so that `color-mode.ts` (pure logic + media queries) never has
// to import a theme, and the theme files never have to know about colorMode.

import type { ThemeSet } from './color-mode';
import { LIGHT_THEME } from './default-light-theme';
import { DARK_THEME } from './default-dark-theme';
import { HIGH_CONTRAST_LIGHT_THEME, HIGH_CONTRAST_DARK_THEME } from './high-contrast-theme';

/**
 * Default set: our light/dark pair, plus the validated high-contrast pair the
 * ColorModeController upgrades to when the user asks for more contrast.
 *
 * The high-contrast entries are populated on purpose. A host that never thinks
 * about accessibility still gets a real high-contrast theme the moment its user
 * turns the OS preference on — an a11y default that is opt-OUT, not opt-in.
 */
export const DEFAULT_THEME_SET: ThemeSet = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  highContrastLight: HIGH_CONTRAST_LIGHT_THEME,
  highContrastDark: HIGH_CONTRAST_DARK_THEME,
};
