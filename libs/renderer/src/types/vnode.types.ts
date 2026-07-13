/**
 * VNode element type
 *
 * Discriminated union of all supported SVG and HTML element types.
 * Using a union type enables better TypeScript type checking and autocomplete.
 */
export type VNodeType =
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'path'
  | 'text'
  | 'g'
  | 'svg'
  | 'foreignObject'
  | 'div'
  | 'span'
  | string; // Allow custom types for extensibility

/**
 * Virtual Node - Abstract representation of visual element
 * Framework-agnostic, serializable, diffable
 *
 * Supports both SVG and Canvas rendering modes, as well as HTML content
 * via foreignObject for embedding rich components.
 */
export interface VNode {
  /**
   * Element type: 'svg', 'g', 'rect', 'circle', 'path', 'text', 'foreignObject', etc.
   */
  type: VNodeType;

  /**
   * Element properties (attributes, styles, event handlers)
   */
  props: VNodeProps;

  /**
   * Optional children VNodes (for hierarchical structures)
   */
  children?: VNode[];

  /**
   * Optional unique key for diffing optimization
   * Used by renderers to efficiently update only changed nodes
   */
  key?: string;
}

/**
 * VNode properties supporting SVG attributes, styles, and event handlers
 */
export interface VNodeProps {
  // ============================================
  // SVG Geometry Attributes
  // ============================================

  /** X coordinate */
  x?: number;
  /** Y coordinate */
  y?: number;
  /** Width */
  width?: number;
  /** Height */
  height?: number;
  /** Border radius X (rounded corners) */
  rx?: number;
  /** Border radius Y (rounded corners) */
  ry?: number;

  // ============================================
  // Circle/Ellipse Attributes
  // ============================================

  /** Circle center X */
  cx?: number;
  /** Circle center Y */
  cy?: number;
  /** Circle radius */
  r?: number;

  // ============================================
  // Line Attributes
  // ============================================

  /** Line start X */
  x1?: number;
  /** Line start Y */
  y1?: number;
  /** Line end X */
  x2?: number;
  /** Line end Y */
  y2?: number;

  // ============================================
  // Path Attributes
  // ============================================

  /** SVG path data (d attribute) */
  d?: string;

  // ============================================
  // SVG Styling Attributes
  // ============================================

  /** Fill color */
  fill?: string;
  /** Stroke color */
  stroke?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Stroke dash array (dashed lines) */
  strokeDasharray?: string;
  /** Opacity (0-1) */
  opacity?: number;
  /** SVG transform attribute */
  transform?: string;

  // ============================================
  // Text Attributes
  // ============================================

  /** Text content */
  textContent?: string;
  /** Font size (in pixels) */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Text anchor (alignment) */
  textAnchor?: 'start' | 'middle' | 'end';

  // ============================================
  // CSS Classes
  // ============================================

  /** CSS class names (space-separated) */
  className?: string;

  // ============================================
  // foreignObject Attributes
  // ============================================

  /**
   * Container ID for foreignObject elements
   * Used by ComponentRenderer to target the specific foreignObject for Angular component injection
   */
  containerId?: string;

  /**
   * SVG foreignObject requiredExtensions attribute
   * Specifies SVG extensions required for rendering
   */
  requiredExtensions?: string;

  // ============================================
  // HTML Attributes (for foreignObject children)
  // ============================================

  /**
   * XML namespace (typically for XHTML in foreignObject)
   * Example: 'http://www.w3.org/1999/xhtml'
   */
  xmlns?: string;

  /**
   * Inline CSS styles (for HTML elements in foreignObject)
   */
  /**
   * Inline style: either a declaration map, or a raw CSS string.
   *
   * The string form is not a convenience — it is the ONLY form in which a shape
   * can carry a `var(--grafloria-*)` paint (a presentation attribute cannot hold a
   * variable), and the shape registry and link styles have always emitted it.
   * The type said object-only and got away with it purely because those values
   * arrive through `any`-typed prop bags; the runtime (`serializeStyle`, and the
   * patcher) has handled both all along. Typing it honestly is what lets the
   * cascade fixes type-check at all.
   */
  style?: Record<string, any> | string;

  // ============================================
  // Event Handlers (for Angular/React binding)
  // ============================================

  /** Click event handler */
  onClick?: (e: Event) => void;
  /** Mouse enter event handler */
  onMouseEnter?: (e: Event) => void;
  /** Mouse leave event handler */
  onMouseLeave?: (e: Event) => void;
  /** Mouse down event handler */
  onMouseDown?: (e: Event) => void;

  // ============================================
  // Custom Data (index signature)
  // Allows any additional properties (data-*, aria-*, etc.)
  // ============================================

  [key: string]: any;
}
