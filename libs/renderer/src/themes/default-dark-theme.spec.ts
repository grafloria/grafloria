import { DARK_THEME } from './default-dark-theme';

describe('Dark Theme', () => {
  test('should have correct name and version', () => {
    expect(DARK_THEME.name).toBe('Dark');
    expect(DARK_THEME.version).toBe('1.0.0');
  });

  describe('Colors', () => {
    test('should have dark background colors', () => {
      expect(DARK_THEME.colors.background.default).toBe('#111827');
      expect(DARK_THEME.colors.background.surface).toBe('#1f2937');
    });

    test('should have light text colors', () => {
      expect(DARK_THEME.colors.text.primary).toBe('#f9fafb');
      expect(DARK_THEME.colors.text.secondary).toBe('#d1d5db');
    });

    test('should have dark node state colors', () => {
      expect(DARK_THEME.colors.node.default.fill).toBe('#1f2937');
      expect(DARK_THEME.colors.node.selected.stroke).toBe('#3b82f6');
    });

    test('should have semantic colors', () => {
      expect(DARK_THEME.colors.success).toBe('#10b981');
      expect(DARK_THEME.colors.error).toBe('#ef4444');
    });
  });

  describe('Typography', () => {
    test('should have same typography as light theme', () => {
      expect(DARK_THEME.typography.fontFamily.default).toContain('Inter');
      expect(DARK_THEME.typography.fontSize.md).toBe(14);
    });
  });

  describe('Effects', () => {
    test('should have darker shadows than light theme', () => {
      expect(DARK_THEME.effects.shadow.md).toContain('0.5'); // Higher alpha for dark theme
    });

    test('should have same border radius values', () => {
      expect(DARK_THEME.effects.borderRadius.md).toBe(4);
    });
  });

  describe('Node Defaults', () => {
    test('should have dark default node styles', () => {
      const defaultNode = DARK_THEME.nodes.default;

      expect(defaultNode.fill).toBe('#1f2937');
      expect(defaultNode.stroke).toBe('#4b5563');
    });
  });

  describe('Link Defaults', () => {
    test('should have dark default link styles', () => {
      const defaultLink = DARK_THEME.links.default;

      expect(defaultLink.stroke).toBe('#6b7280');
    });
  });

  describe('Port Configuration', () => {
    test('should have same port colors as light theme', () => {
      expect(DARK_THEME.ports.colors.input).toBe('#10b981');
      expect(DARK_THEME.ports.colors.output).toBe('#f59e0b');
    });
  });
});
