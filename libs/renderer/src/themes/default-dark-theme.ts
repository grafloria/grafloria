import type { Theme } from '../types/theme.types';
import { LIGHT_THEME } from './default-light-theme';

/**
 * Dark Theme
 * Professional, accessible color palette optimized for dark backgrounds
 */
export const DARK_THEME: Theme = {
  name: 'Dark',
  version: '1.0.0',

  colors: {
    background: {
      default: '#111827',
      surface: '#1f2937',
      elevated: '#374151',
    },

    text: {
      primary: '#f9fafb',
      secondary: '#d1d5db',
      disabled: '#6b7280',
      inverse: '#111827',
    },

    node: {
      default: {
        fill: '#1f2937',
        stroke: '#6b7280',
      },
      selected: {
        fill: '#1e3a8a',
        stroke: '#60a5fa',
      },
      highlighted: {
        fill: '#78350f',
        stroke: '#f59e0b',
      },
      hovered: {
        fill: '#374151',
        stroke: '#6b7280',
      },
      disabled: {
        fill: '#1f2937',
        stroke: '#374151',
      },
      error: {
        fill: '#7f1d1d',
        stroke: '#f87171',
      },
    },

    link: {
      default: '#6b7280',
      selected: '#3b82f6',
      highlighted: '#f59e0b',
      hovered: '#9ca3af',
      disabled: '#4b5563',
    },

    port: {
      input: '#10b981',
      output: '#f59e0b',
      bi: '#8b5cf6',
    },

    primary: '#3b82f6',
    secondary: '#64748b',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#0ea5e9',
  },

  // Reuse typography from light theme (same values work for both)
  typography: LIGHT_THEME.typography,

  // Reuse spacing from light theme (same values work for both)
  spacing: LIGHT_THEME.spacing,

  effects: {
    shadow: {
      none: 'none',
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.5)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    },
    borderRadius: LIGHT_THEME.effects.borderRadius,
    opacity: LIGHT_THEME.effects.opacity,
  },

  nodes: {
    default: {
      fill: '#1f2937',
      stroke: '#6b7280',
      strokeWidth: 1,
      borderRadius: 4,
      shadow: false,
      opacity: 1,
    },
  },

  links: {
    default: {
      stroke: '#6b7280',
      strokeWidth: 2,
      opacity: 1,
    },
  },

  ports: {
    size: 8,
    strokeWidth: 2,
    colors: {
      input: '#10b981',
      output: '#f59e0b',
      bi: '#8b5cf6',
    },
  },

  // Card "Theme-bound properties": the SAME category NAMES as the light theme,
  // with values tuned for a dark surface (#1f2937) — that is the whole point. A
  // node bound with `fill: themeRef('category.critical')` paints the light
  // theme's deep red on white and this brighter red on the dark canvas, from ONE
  // unchanged model.
  categories: {
    critical: '#f87171',
    warning: '#fbbf24',
    success: '#34d399',
    info: '#38bdf8',
    neutral: '#9ca3af',
    accent: '#a78bfa',
  },

  numbers: LIGHT_THEME.numbers,
};
