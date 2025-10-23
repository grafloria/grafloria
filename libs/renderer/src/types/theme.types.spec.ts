import type {
  Theme,
  ColorPalette,
  Typography,
  Spacing,
  Effects,
  NodeStyleTheme,
  LinkStyleTheme,
  PortThemeConfig
} from './theme.types';

describe('Theme Types', () => {
  describe('ColorPalette', () => {
    test('should have background colors', () => {
      const palette: ColorPalette = {
        background: {
          default: '#ffffff',
          surface: '#f9fafb',
          elevated: '#ffffff'
        },
        text: {
          primary: '#111827',
          secondary: '#6b7280',
          disabled: '#9ca3af',
          inverse: '#ffffff'
        },
        node: {
          default: { fill: '#ffffff', stroke: '#d1d5db' },
          selected: { fill: '#eff6ff', stroke: '#2563eb' },
          hovered: { fill: '#f9fafb', stroke: '#9ca3af' },
          disabled: { fill: '#f3f4f6', stroke: '#e5e7eb' },
          error: { fill: '#fee2e2', stroke: '#ef4444' }
        },
        link: {
          default: '#9ca3af',
          selected: '#2563eb',
          hovered: '#6b7280',
          disabled: '#d1d5db'
        },
        port: {
          input: '#10b981',
          output: '#f59e0b',
          bi: '#8b5cf6'
        },
        primary: '#2563eb',
        secondary: '#64748b',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#0ea5e9'
      };

      expect(palette.background.default).toBe('#ffffff');
      expect(palette.text.primary).toBe('#111827');
      expect(palette.node.default.fill).toBe('#ffffff');
      expect(palette.link.default).toBe('#9ca3af');
      expect(palette.port.input).toBe('#10b981');
    });

    test('should have all state-based node colors', () => {
      const palette: Partial<ColorPalette> = {
        node: {
          default: { fill: '#fff', stroke: '#ddd' },
          selected: { fill: '#eff6ff', stroke: '#2563eb' },
          hovered: { fill: '#f9f', stroke: '#9ca' },
          disabled: { fill: '#f3f', stroke: '#e5e' },
          error: { fill: '#fee', stroke: '#ef4' }
        }
      };

      expect(palette.node?.default).toBeDefined();
      expect(palette.node?.selected).toBeDefined();
      expect(palette.node?.hovered).toBeDefined();
      expect(palette.node?.disabled).toBeDefined();
      expect(palette.node?.error).toBeDefined();
    });
  });

  describe('Typography', () => {
    test('should have font families', () => {
      const typography: Typography = {
        fontFamily: {
          default: 'Inter, sans-serif',
          mono: 'Monaco, monospace'
        },
        fontSize: {
          xs: 10,
          sm: 12,
          md: 14,
          lg: 16,
          xl: 20
        },
        fontWeight: {
          normal: 400,
          medium: 500,
          bold: 700
        },
        lineHeight: {
          tight: 1.2,
          normal: 1.5,
          relaxed: 1.8
        }
      };

      expect(typography.fontFamily.default).toBe('Inter, sans-serif');
      expect(typography.fontSize.md).toBe(14);
      expect(typography.fontWeight.bold).toBe(700);
      expect(typography.lineHeight.normal).toBe(1.5);
    });
  });

  describe('Spacing', () => {
    test('should have all spacing scales', () => {
      const spacing: Spacing = {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24
      };

      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(12);
      expect(spacing.lg).toBe(16);
      expect(spacing.xl).toBe(24);
    });
  });

  describe('Effects', () => {
    test('should have shadow definitions', () => {
      const effects: Effects = {
        shadow: {
          none: 'none',
          sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
        },
        borderRadius: {
          none: 0,
          sm: 2,
          md: 4,
          lg: 8,
          full: 9999
        },
        opacity: {
          disabled: 0.5,
          ghost: 0.25,
          translucent: 0.75
        }
      };

      expect(effects.shadow.md).toContain('rgba');
      expect(effects.borderRadius.md).toBe(4);
      expect(effects.opacity.disabled).toBe(0.5);
    });
  });

  describe('NodeStyleTheme', () => {
    test('should have all style properties', () => {
      const style: NodeStyleTheme = {
        fill: '#ffffff',
        stroke: '#d1d5db',
        strokeWidth: 1,
        borderRadius: 4,
        shadow: false,
        opacity: 1
      };

      expect(style.fill).toBe('#ffffff');
      expect(style.stroke).toBe('#d1d5db');
      expect(style.strokeWidth).toBe(1);
      expect(style.borderRadius).toBe(4);
      expect(style.shadow).toBe(false);
      expect(style.opacity).toBe(1);
    });
  });

  describe('LinkStyleTheme', () => {
    test('should have all style properties', () => {
      const style: LinkStyleTheme = {
        stroke: '#9ca3af',
        strokeWidth: 2,
        strokeDasharray: '5,5',
        opacity: 1
      };

      expect(style.stroke).toBe('#9ca3af');
      expect(style.strokeWidth).toBe(2);
      expect(style.strokeDasharray).toBe('5,5');
      expect(style.opacity).toBe(1);
    });

    test('should support optional strokeDasharray', () => {
      const solidLine: LinkStyleTheme = {
        stroke: '#000',
        strokeWidth: 2,
        opacity: 1
      };

      expect(solidLine.strokeDasharray).toBeUndefined();
    });
  });

  describe('PortThemeConfig', () => {
    test('should have size and colors', () => {
      const config: PortThemeConfig = {
        size: 8,
        strokeWidth: 2,
        colors: {
          input: '#10b981',
          output: '#f59e0b',
          bi: '#8b5cf6'
        }
      };

      expect(config.size).toBe(8);
      expect(config.strokeWidth).toBe(2);
      expect(config.colors.input).toBe('#10b981');
    });
  });

  describe('Theme Interface', () => {
    test('should have all required properties', () => {
      const theme: Theme = {
        name: 'Light',
        version: '1.0.0',
        colors: {} as ColorPalette,
        typography: {} as Typography,
        spacing: {} as Spacing,
        effects: {} as Effects,
        nodes: {
          default: {} as NodeStyleTheme
        },
        links: {
          default: {} as LinkStyleTheme
        },
        ports: {} as PortThemeConfig
      };

      expect(theme.name).toBe('Light');
      expect(theme.version).toBe('1.0.0');
      expect(theme.colors).toBeDefined();
      expect(theme.typography).toBeDefined();
      expect(theme.spacing).toBeDefined();
      expect(theme.effects).toBeDefined();
      expect(theme.nodes.default).toBeDefined();
      expect(theme.links.default).toBeDefined();
      expect(theme.ports).toBeDefined();
    });

    test('should support type-specific node styles', () => {
      const theme: Partial<Theme> = {
        nodes: {
          default: {
            fill: '#fff',
            stroke: '#ddd',
            strokeWidth: 1,
            borderRadius: 4,
            shadow: false,
            opacity: 1
          },
          'table-node': {
            fill: '#f0f9ff',
            stroke: '#0ea5e9',
            strokeWidth: 2,
            borderRadius: 0
          },
          'process-node': {
            fill: '#f0fdf4',
            stroke: '#10b981'
          }
        }
      };

      expect(theme.nodes?.default).toBeDefined();
      expect(theme.nodes?.['table-node']).toBeDefined();
      expect(theme.nodes?.['process-node']).toBeDefined();
    });

    test('should support type-specific link styles', () => {
      const theme: Partial<Theme> = {
        links: {
          default: {
            stroke: '#9ca3af',
            strokeWidth: 2,
            opacity: 1
          },
          'dashed': {
            stroke: '#6b7280',
            strokeWidth: 1,
            strokeDasharray: '5,5',
            opacity: 0.8
          }
        }
      };

      expect(theme.links?.default).toBeDefined();
      expect(theme.links?.['dashed']).toBeDefined();
      expect(theme.links?.['dashed'].strokeDasharray).toBe('5,5');
    });
  });
});
