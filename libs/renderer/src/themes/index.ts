// Export default themes
export { LIGHT_THEME } from './default-light-theme';
export { DARK_THEME } from './default-dark-theme';

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
