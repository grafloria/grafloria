/**
 * Virtual Node - Abstract representation of visual element
 * Framework-agnostic, serializable, diffable
 *
 * Supports both SVG and Canvas rendering modes
 */
export interface VNode {
  /**
   * Element type: 'svg', 'g', 'rect', 'circle', 'path', 'text', 'foreignObject', etc.
   */
  type: string;

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
