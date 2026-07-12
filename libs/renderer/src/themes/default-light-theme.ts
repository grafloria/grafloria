import type { Theme } from '../types/theme.types';

/**
 * Light Theme (Default)
 * Professional, accessible color palette optimized for light backgrounds
 */
export const LIGHT_THEME: Theme = {
  name: 'Light',
  version: '1.0.0',

  colors: {
    background: {
      default: '#ffffff',
      surface: '#f9fafb',
      elevated: '#ffffff',
    },

    text: {
      primary: '#111827',
      secondary: '#6b7280',
      disabled: '#9ca3af',
      inverse: '#ffffff',
    },

    node: {
      default: {
        fill: '#ffffff',
        stroke: '#d1d5db',
      },
      selected: {
        fill: '#eff6ff',
        stroke: '#2563eb',
      },
      highlighted: {
        fill: '#fef3c7',
        stroke: '#f59e0b',
      },
      hovered: {
        fill: '#f9fafb',
        stroke: '#9ca3af',
      },
      disabled: {
        fill: '#f3f4f6',
        stroke: '#e5e7eb',
      },
      error: {
        fill: '#fee2e2',
        stroke: '#ef4444',
      },
    },

    link: {
      default: '#9ca3af',
      selected: '#2563eb',
      highlighted: '#f59e0b',
      hovered: '#6b7280',
      disabled: '#d1d5db',
    },

    port: {
      input: '#10b981',
      output: '#f59e0b',
      bi: '#8b5cf6',
    },

    primary: '#2563eb',
    secondary: '#64748b',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#0ea5e9',
  },

  typography: {
    fontFamily: {
      default: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: 'Monaco, Courier, monospace',
    },
    fontSize: {
      xs: 10,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 20,
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.8,
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },

  effects: {
    shadow: {
      none: 'none',
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    },
    borderRadius: {
      none: 0,
      sm: 2,
      md: 4,
      lg: 8,
      full: 9999,
    },
    opacity: {
      disabled: 0.5,
      ghost: 0.25,
      translucent: 0.75,
    },
  },

  nodes: {
    default: {
      fill: '#ffffff',
      stroke: '#d1d5db',
      strokeWidth: 1,
      borderRadius: 4,
      shadow: false,
      opacity: 1,
    },
  },

  links: {
    default: {
      stroke: '#9ca3af',
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
};
