import { LIGHT_THEME } from './default-light-theme';

describe('Light Theme', () => {
  test('should have correct name and version', () => {
    expect(LIGHT_THEME.name).toBe('Light');
    expect(LIGHT_THEME.version).toBe('1.0.0');
  });

  describe('Colors', () => {
    test('should have light background colors', () => {
      expect(LIGHT_THEME.colors.background.default).toBe('#ffffff');
      expect(LIGHT_THEME.colors.background.surface).toBe('#f9fafb');
    });

    test('should have dark text colors', () => {
      expect(LIGHT_THEME.colors.text.primary).toBe('#111827');
      expect(LIGHT_THEME.colors.text.secondary).toBe('#6b7280');
    });

    test('should have node state colors', () => {
      expect(LIGHT_THEME.colors.node.default.fill).toBe('#ffffff');
      expect(LIGHT_THEME.colors.node.selected.stroke).toBe('#2563eb');
    });

    test('should have semantic colors', () => {
      expect(LIGHT_THEME.colors.success).toBe('#10b981');
      expect(LIGHT_THEME.colors.error).toBe('#ef4444');
    });
  });

  describe('Typography', () => {
    test('should have font families', () => {
      expect(LIGHT_THEME.typography.fontFamily.default).toContain('Inter');
      expect(LIGHT_THEME.typography.fontFamily.mono).toContain('Monaco');
    });

    test('should have font sizes', () => {
      expect(LIGHT_THEME.typography.fontSize.md).toBe(14);
      expect(LIGHT_THEME.typography.fontSize.xl).toBe(20);
    });
  });

  describe('Node Defaults', () => {
    test('should have default node styles', () => {
      const defaultNode = LIGHT_THEME.nodes.default;

      expect(defaultNode.fill).toBe('#ffffff');
      expect(defaultNode.stroke).toBe('#6b7280'); // gray-500: 4.83:1 on white (WCAG 1.4.11)
      expect(defaultNode.strokeWidth).toBe(1);
      expect(defaultNode.borderRadius).toBe(4);
      expect(defaultNode.shadow).toBe(false);
      expect(defaultNode.opacity).toBe(1);
    });
  });

  describe('Link Defaults', () => {
    test('should have default link styles', () => {
      const defaultLink = LIGHT_THEME.links.default;

      expect(defaultLink.stroke).toBe('#6b7280'); // gray-500: 4.83:1 on white (WCAG 1.4.11)
      expect(defaultLink.strokeWidth).toBe(2);
      expect(defaultLink.opacity).toBe(1);
    });
  });

  describe('Port Configuration', () => {
    test('should have port configuration', () => {
      expect(LIGHT_THEME.ports.size).toBe(8);
      expect(LIGHT_THEME.ports.colors.input).toBe('#059669'); // emerald-600: 3.61:1 (WCAG 1.4.11)
      expect(LIGHT_THEME.ports.colors.output).toBe('#b45309'); // amber-700: 4.81:1 (WCAG 1.4.11)
    });
  });
});
