// Export default themes
export { LIGHT_THEME } from './default-light-theme';
export { DARK_THEME } from './default-dark-theme';
export { HIGH_CONTRAST_LIGHT_THEME, HIGH_CONTRAST_DARK_THEME } from './high-contrast-theme';
export { DEFAULT_THEME_SET } from './default-theme-set';

// Card "colorMode": light | dark | system, with OS auto-detection.
export {
  ColorModeController,
  MEDIA_FORCED_COLORS,
  MEDIA_PREFERS_CONTRAST,
  MEDIA_PREFERS_DARK,
  readColorPreferences,
  resolveThemeFromPrefs,
} from './color-mode';
export type { ColorMode, ColorPreferences, ThemeSet } from './color-mode';

// Card "Theme-bound properties": `fill: themeRef('category.critical')`.
export {
  isThemeRef,
  resolveBindableVars,
  resolveThemeRef,
  themeRef,
  themeRefCssValue,
  themeRefToken,
  themeRefVar,
} from './theme-ref';
export type { ThemeRef } from './theme-ref';

// Card "design-token bridge + a11y theming": host tokens → --grafloria-*, and the
// WCAG machinery the high-contrast themes are validated with.
export {
  BRIDGEABLE_TOKENS,
  generateContrastPreferenceBlock,
  generateForcedColorsBlock,
  generateInstanceOverrideCSS,
  generateTokenBridgeBlock,
  muiBridge,
  shadcnBridge,
  tailwindBridge,
} from './token-bridge';
export type { TokenBridge } from './token-bridge';

export {
  WCAG,
  contrastRatio,
  ensureContrast,
  hslToRgb,
  lightnessOf,
  meetsContrast,
  parseColor,
  relativeLuminance,
  rgbToHsl,
  toHex,
  withLightness,
} from './contrast';
export type { Hsl, Rgb } from './contrast';

export { assertThemeContrast, auditThemeContrast, deriveTheme } from './theme-a11y';
export type { ContrastCheck, ContrastReport, DeriveThemeOptions } from './theme-a11y';

// Theme token → CSS custom property mapping (THE table every styling card reuses)
export {
  GRAFLORIA_INSTANCE_ATTR,
  GRAFLORIA_VAR_PREFIX,
  THEME_VARS,
  THEME_TOKENS,
  cssVarName,
  themeVar,
  themeVarValue,
  resolveThemeVars,
} from './theme-vars';
export type { ThemeToken, ThemeVarBinding } from './theme-vars';

// Stylesheet generation: shared var-based rules + per-instance variable block
export {
  BASE_STYLE_RULES,
  instanceScopeSelector,
  generateBaseStyleSheet,
  generateInstanceVarBlock,
} from './theme-css';
export type { StyleRule } from './theme-css';

// Named style classes (classDef / linkStyle equivalent)
export {
  defineStyle,
  defineStyles,
  getStyle,
  hasStyle,
  removeStyle,
  clearStyles,
  listStyles,
  getStyleRegistryVersion,
  onStyleRegistryChange,
  resolveStyleClasses,
} from './style-registry';
export type { NamedStyle } from './style-registry';

// The style cascade: theme < type-default < named-class < element-inline < state
export { CASCADE_ORDER, resolveNodeStyle, resolveLinkStyle, linkTypeKey } from './style-cascade';
export type { CascadeLayer, CascadeOptions } from './style-cascade';
