/**
 * Complete theme definition
 * Supports both CSS Variables (SVG+HTML) and Programmatic (Canvas)
 */
export interface Theme {
  /**
   * Theme name (e.g., "Light", "Dark", "High Contrast")
   */
  name: string;

  /**
   * Theme version
   */
  version: string;

  /**
   * Color palette
   */
  colors: ColorPalette;

  /**
   * Typography settings
   */
  typography: Typography;

  /**
   * Spacing scale
   */
  spacing: Spacing;

  /**
   * Visual effects (shadows, border radius, opacity)
   */
  effects: Effects;

  /**
   * Node type defaults
   * - default: Base styles for all nodes
   * - [nodeType]: Type-specific overrides
   */
  nodes: {
    default: NodeStyleTheme;
    [nodeType: string]: Partial<NodeStyleTheme>;
  };

  /**
   * Link type defaults
   * - default: Base styles for all links
   * - [linkType]: Type-specific overrides
   */
  links: {
    default: LinkStyleTheme;
    [linkType: string]: Partial<LinkStyleTheme>;
  };

  /**
   * Port configuration
   */
  ports: PortThemeConfig;
}

/**
 * Color palette for theme
 */
export interface ColorPalette {
  /**
   * Background colors
   */
  background: {
    /** Main diagram background */
    default: string;
    /** Node/surface background */
    surface: string;
    /** Elevated surface (modals, popovers) */
    elevated: string;
  };

  /**
   * Text colors
   */
  text: {
    /** Primary text */
    primary: string;
    /** Secondary/muted text */
    secondary: string;
    /** Disabled text */
    disabled: string;
    /** Inverse text (for dark backgrounds) */
    inverse: string;
  };

  /**
   * State-based node colors
   */
  node: {
    default: {
      fill: string;
      stroke: string;
    };
    selected: {
      fill: string;
      stroke: string;
    };
    hovered: {
      fill: string;
      stroke: string;
    };
    disabled: {
      fill: string;
      stroke: string;
    };
    error: {
      fill: string;
      stroke: string;
    };
  };

  /**
   * State-based link colors
   */
  link: {
    default: string;
    selected: string;
    hovered: string;
    disabled: string;
  };

  /**
   * Port colors by type
   */
  port: {
    input: string;
    output: string;
    bi: string;
  };

  /**
   * Semantic colors
   */
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

/**
 * Typography theme
 */
export interface Typography {
  /**
   * Font families
   */
  fontFamily: {
    default: string;
    mono: string;
  };

  /**
   * Font sizes (in pixels)
   */
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };

  /**
   * Font weights
   */
  fontWeight: {
    normal: number;
    medium: number;
    bold: number;
  };

  /**
   * Line heights
   */
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

/**
 * Spacing theme (in pixels)
 */
export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/**
 * Effects theme (shadows, border radius, opacity)
 */
export interface Effects {
  /**
   * Shadow definitions (CSS box-shadow values)
   */
  shadow: {
    none: string;
    sm: string;
    md: string;
    lg: string;
  };

  /**
   * Border radius values (in pixels)
   */
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    full: number;
  };

  /**
   * Opacity values (0-1)
   */
  opacity: {
    disabled: number;
    ghost: number;
    translucent: number;
  };
}

/**
 * Node style from theme
 */
export interface NodeStyleTheme {
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  shadow: boolean;
  opacity: number;
}

/**
 * Link style from theme
 */
export interface LinkStyleTheme {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
}

/**
 * Port theme configuration
 */
export interface PortThemeConfig {
  size: number;
  strokeWidth: number;
  colors: {
    input: string;
    output: string;
    bi: string;
  };
}
