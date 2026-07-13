// High-contrast themes — the a11y ceiling, and the answer to `prefers-contrast: more`.
//
// Styling & theming, Card "design-token bridge + accessibility-aware theming".
//
// These are hand-authored rather than derived, for one reason: a *derived* theme
// is repaired until it PASSES, which produces a legal palette but not always a
// good-looking one. High contrast is the mode users actually depend on, so the
// colours are chosen, not computed.
//
// They are then CHECKED with exactly the machinery a caller would use —
// `assertThemeContrast(theme, WCAG.AAA_TEXT)` in high-contrast-theme.spec — so
// "validated high-contrast theme" is a fact the test suite enforces, not a claim
// in a comment. Text clears AAA (7:1); every stroke clears 4.5:1, well past
// WCAG 1.4.11's 3:1 floor for non-text UI.
//
// Weight matters as much as colour: strokes are 2-3x the default. A hairline
// border is not accessible however dark it is, which is why `numbers` is raised
// here too (so `themeRef('numbers.emphasis')` thickens automatically).

import type { Theme } from '../types/theme.types';
import { LIGHT_THEME } from './default-light-theme';

/** Pure black on pure white: the maximum-contrast light scheme (21:1 text). */
export const HIGH_CONTRAST_LIGHT_THEME: Theme = {
  name: 'High Contrast Light',
  version: '1.0.0',

  colors: {
    background: {
      default: '#ffffff',
      surface: '#ffffff',
      elevated: '#ffffff',
    },

    text: {
      primary: '#000000',
      secondary: '#1a1a1a',
      disabled: '#595959', // 7:1 on white — legible even though WCAG exempts it
      inverse: '#ffffff',
    },

    node: {
      default: { fill: '#ffffff', stroke: '#000000' },
      // Selection is our focus indicator: a saturated blue that still clears
      // 7.5:1 on its own (very pale) fill and on the canvas.
      selected: { fill: '#ffffff', stroke: '#0000cc' },
      highlighted: { fill: '#ffffff', stroke: '#8b4000' },
      hovered: { fill: '#f0f0f0', stroke: '#000000' },
      disabled: { fill: '#ffffff', stroke: '#767676' },
      error: { fill: '#ffffff', stroke: '#b30000' },
    },

    link: {
      default: '#000000',
      selected: '#0000cc',
      highlighted: '#8b4000',
      hovered: '#333333',
      disabled: '#767676',
    },

    port: {
      input: '#006600',
      output: '#8b4000',
      bi: '#5b21b6',
    },

    primary: '#0000cc',
    secondary: '#333333',
    success: '#006600',
    warning: '#8b4000',
    error: '#b30000',
    info: '#00538a',
  },

  typography: LIGHT_THEME.typography,
  spacing: LIGHT_THEME.spacing,

  effects: {
    // No soft shadows: a blur is a contrast reducer.
    shadow: { none: 'none', sm: 'none', md: 'none', lg: 'none' },
    borderRadius: LIGHT_THEME.effects.borderRadius,
    // A "disabled" element at 0.5 opacity halves its contrast. 0.85 keeps it
    // recessive without making it unreadable.
    opacity: { disabled: 0.85, ghost: 0.6, translucent: 0.9 },
  },

  nodes: {
    default: { fill: '#ffffff', stroke: '#000000', strokeWidth: 2, borderRadius: 4, shadow: false, opacity: 1 },
  },

  links: {
    default: { stroke: '#000000', strokeWidth: 3, opacity: 1 },
  },

  ports: {
    size: 10,
    strokeWidth: 3,
    colors: { input: '#006600', output: '#8b4000', bi: '#5b21b6' },
  },

  categories: {
    critical: '#b30000',
    warning: '#8b4000',
    success: '#006600',
    info: '#00538a',
    neutral: '#333333',
    accent: '#5b21b6',
  },

  numbers: { hairline: 2, regular: 3, emphasis: 4, heavy: 5 },
};

/** Pure white on pure black: the maximum-contrast dark scheme. */
export const HIGH_CONTRAST_DARK_THEME: Theme = {
  name: 'High Contrast Dark',
  version: '1.0.0',

  colors: {
    background: {
      default: '#000000',
      surface: '#000000',
      elevated: '#000000',
    },

    text: {
      primary: '#ffffff',
      secondary: '#e6e6e6',
      disabled: '#a6a6a6',
      inverse: '#000000',
    },

    node: {
      default: { fill: '#000000', stroke: '#ffffff' },
      selected: { fill: '#000000', stroke: '#4cc2ff' },
      highlighted: { fill: '#000000', stroke: '#ffd700' },
      hovered: { fill: '#1a1a1a', stroke: '#ffffff' },
      disabled: { fill: '#000000', stroke: '#8c8c8c' },
      error: { fill: '#000000', stroke: '#ff6b6b' },
    },

    link: {
      default: '#ffffff',
      selected: '#4cc2ff',
      highlighted: '#ffd700',
      hovered: '#cccccc',
      disabled: '#8c8c8c',
    },

    port: {
      input: '#3ff23f',
      output: '#ffd700',
      bi: '#c9a3ff',
    },

    primary: '#4cc2ff',
    secondary: '#cccccc',
    success: '#3ff23f',
    warning: '#ffd700',
    error: '#ff6b6b',
    info: '#4cc2ff',
  },

  typography: LIGHT_THEME.typography,
  spacing: LIGHT_THEME.spacing,

  effects: {
    shadow: { none: 'none', sm: 'none', md: 'none', lg: 'none' },
    borderRadius: LIGHT_THEME.effects.borderRadius,
    opacity: { disabled: 0.85, ghost: 0.6, translucent: 0.9 },
  },

  nodes: {
    default: { fill: '#000000', stroke: '#ffffff', strokeWidth: 2, borderRadius: 4, shadow: false, opacity: 1 },
  },

  links: {
    default: { stroke: '#ffffff', strokeWidth: 3, opacity: 1 },
  },

  ports: {
    size: 10,
    strokeWidth: 3,
    colors: { input: '#3ff23f', output: '#ffd700', bi: '#c9a3ff' },
  },

  categories: {
    critical: '#ff6b6b',
    warning: '#ffd700',
    success: '#3ff23f',
    info: '#4cc2ff',
    neutral: '#cccccc',
    accent: '#c9a3ff',
  },

  numbers: { hairline: 2, regular: 3, emphasis: 4, heavy: 5 },
};
