/**
 * Design Tokens
 *
 * Centralized design system tokens for consistent theming
 * across the Template Builder application.
 *
 * Usage:
 * import { DESIGN_TOKENS } from './design-system/design-tokens';
 * style: { color: DESIGN_TOKENS.colors.text.primary }
 */

export const DESIGN_TOKENS = {
  colors: {
    // Primary brand colors
    primary: {
      50: '#f5f7ff',
      100: '#ebf0ff',
      200: '#d4dfff',
      300: '#a5bfff',
      400: '#7a9fff',
      500: '#667eea',  // Main primary
      600: '#5568d3',
      700: '#4553b8',
      800: '#3a4798',
      900: '#2d3672'
    },

    secondary: {
      50: '#faf5ff',
      100: '#f3ebff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#764ba2',  // Main secondary
      600: '#6d3f92',
      700: '#5a3376',
      800: '#4a2a5f',
      900: '#3b2149'
    },

    // Semantic colors
    success: {
      light: '#d1fae5',
      main: '#10b981',
      dark: '#047857'
    },

    warning: {
      light: '#fef3c7',
      main: '#f59e0b',
      dark: '#d97706'
    },

    error: {
      light: '#fee2e2',
      main: '#ef4444',
      dark: '#dc2626'
    },

    info: {
      light: '#dbeafe',
      main: '#3b82f6',
      dark: '#1e40af'
    },

    // Background colors
    background: {
      primary: '#ffffff',
      secondary: '#f9fafb',
      tertiary: '#f3f4f6',
      elevated: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.5)'
    },

    // Text colors
    text: {
      primary: '#111827',
      secondary: '#6b7280',
      tertiary: '#9ca3af',
      disabled: '#d1d5db',
      inverse: '#ffffff'
    },

    // Border colors
    border: {
      primary: '#e5e7eb',
      secondary: '#d1d5db',
      tertiary: '#9ca3af',
      focus: '#667eea',
      error: '#ef4444'
    },

    // State colors
    state: {
      hover: 'rgba(102, 126, 234, 0.08)',
      active: 'rgba(102, 126, 234, 0.16)',
      selected: 'rgba(102, 126, 234, 0.12)',
      disabled: 'rgba(0, 0, 0, 0.38)'
    }
  },

  spacing: {
    '0': '0',
    'xs': '4px',
    'sm': '8px',
    'md': '12px',
    'lg': '16px',
    'xl': '24px',
    '2xl': '32px',
    '3xl': '48px',
    '4xl': '64px'
  },

  borderRadius: {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px'
  },

  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    focus: '0 0 0 3px rgba(102, 126, 234, 0.5)'
  },

  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    },

    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem'  // 36px
    },

    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700'
    },

    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75'
    }
  },

  transitions: {
    duration: {
      fast: '150ms',
      normal: '300ms',
      slow: '500ms'
    },

    timing: {
      ease: 'ease',
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out',
      linear: 'linear'
    }
  },

  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    fixed: 1200,
    modalBackdrop: 1300,
    modal: 1400,
    popover: 1500,
    tooltip: 1600
  },

  breakpoints: {
    mobile: '768px',
    tablet: '1024px',
    desktop: '1280px',
    wide: '1536px'
  }
} as const;

/**
 * Dark theme overrides
 */
export const DARK_THEME = {
  colors: {
    background: {
      primary: '#1f2937',
      secondary: '#111827',
      tertiary: '#374151',
      elevated: '#1f2937',
      overlay: 'rgba(0, 0, 0, 0.75)'
    },

    text: {
      primary: '#f9fafb',
      secondary: '#d1d5db',
      tertiary: '#9ca3af',
      disabled: '#6b7280',
      inverse: '#111827'
    },

    border: {
      primary: '#374151',
      secondary: '#4b5563',
      tertiary: '#6b7280',
      focus: '#667eea',
      error: '#ef4444'
    },

    state: {
      hover: 'rgba(102, 126, 234, 0.12)',
      active: 'rgba(102, 126, 234, 0.24)',
      selected: 'rgba(102, 126, 234, 0.18)',
      disabled: 'rgba(255, 255, 255, 0.38)'
    }
  }
} as const;

/**
 * Helper function to get responsive value
 */
export function responsive(
  mobile: string,
  tablet?: string,
  desktop?: string
): string {
  const rules = [`${mobile}`];

  if (tablet) {
    rules.push(`@media (min-width: ${DESIGN_TOKENS.breakpoints.mobile}) { ${tablet} }`);
  }

  if (desktop) {
    rules.push(`@media (min-width: ${DESIGN_TOKENS.breakpoints.tablet}) { ${desktop} }`);
  }

  return rules.join(' ');
}
