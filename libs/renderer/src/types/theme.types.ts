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

  /**
   * SEMANTIC / CATEGORY PALETTE — the caller's OWN vocabulary of colours.
   *
   * Styling & theming, Card "Theme-bound properties". The palettes above are the
   * renderer's CHROME (what a node's default fill is, what selection looks like).
   * This one is the HOST's: "critical", "warning", "deprecated", "team-a" — the
   * meanings the caller assigns to its own nodes and links.
   *
   * Bind a property to one with `themeRef('category.critical')`; the value is
   * resolved against the ACTIVE theme, so a theme swap recolours it. Without
   * this a theme swap only repaints chrome and every semantic colour in the
   * caller's diagram stays frozen at whatever literal it was authored with.
   *
   * Every key is also published as `--grafloria-category-<key>` on the instance root.
   */
  categories?: SemanticPalette;

  /**
   * NAMED NUMERIC SCALE — the numeric analogue of {@link categories}.
   *
   * `themeRef('numbers.emphasis')` on a `strokeWidth` binds the weight to the
   * theme, so a high-contrast theme can thicken every emphasised stroke without
   * the caller touching a single element. Published as `--grafloria-numbers-<key>`.
   */
  numbers?: NumberScale;
}

/**
 * The host's semantic colour vocabulary (see {@link Theme.categories}).
 * Open-ended: the built-in themes ship the names below, and callers add theirs.
 */
export interface SemanticPalette {
  /** Blocking / fatal — the strongest attention colour. */
  critical?: string;
  /** Non-blocking problem. */
  warning?: string;
  /** Healthy / passing. */
  success?: string;
  /** Neutral information. */
  info?: string;
  /** De-emphasised / inactive. */
  neutral?: string;
  /** The host's brand accent. */
  accent?: string;
  [category: string]: string | undefined;
}

/**
 * A named numeric scale (see {@link Theme.numbers}). Values are unitless — they
 * are consumed as SVG lengths (`stroke-width`), which accept plain numbers.
 */
export interface NumberScale {
  hairline?: number;
  regular?: number;
  emphasis?: number;
  heavy?: number;
  [name: string]: number | undefined;
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
    /** Attention emphasis (independent of selection); selected wins when both. */
    highlighted: {
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
    /** Attention emphasis (independent of selection). */
    highlighted: string;
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
