// Model type definitions for diagram entities

export interface SerializedEntity {
  id: string;
  uuid: string;
  type: string;
  version: number;
  metadata: Record<string, any>;
}

export interface NodeState {
  visible: boolean;
  locked: boolean;
  selected: boolean;
  hovered: boolean;
  /**
   * Draw attention to the node without selecting it (search hits, traversal
   * highlights, "related" emphasis). Independent of `selected`; when both are
   * set, `selected` wins in the renderer's state precedence.
   */
  highlighted?: boolean;
  focused: boolean;
  expanded: boolean;
  enabled: boolean;
  error?: string;
  warning?: string;
  // Phase 1: Status-based animations
  status?: 'idle' | 'pending' | 'running' | 'completed' | 'error' | 'warning';
  animateStatus?: boolean;  // Enable automatic status-based animations
}

export interface NodeBehavior {
  selectable: boolean;
  draggable: boolean;
  resizable: boolean;
  rotatable: boolean;
  deletable: boolean;
  editable: boolean;
  connectable: boolean;
  groupable: boolean;
  cloneable: boolean;
  dragHandler?: {
    isDragHandler: boolean;
    dragChildren?: boolean;
  };
}

export interface NodeStyle {
  shape?: string; // Shape type (rectangle, circle, diamond, etc.)
  /**
   * Extra CSS class(es) put verbatim on the rendered element, alongside
   * `diagram-node` and the state classes. Purely a hook for host CSS — the
   * renderer never reads it back (React Flow's "className on every element").
   */
  className?: string;
  /**
   * Name(s) of NAMED STYLES to apply — the classDef / linkStyle equivalent.
   * Space-separated (`'critical dashed'`, later names win). Defined with
   * `defineStyle(name, style)` and resolved by the renderer's cascade:
   *   theme < type-default < named-class < element-inline < state
   * so an own property on this style object always beats the named style.
   */
  styleClass?: string;
  // Phase 4 (styling & theming): fill/stroke accept a paint-server SPEC OBJECT
  // (gradient/pattern) as well as a plain colour string. When an object is
  // supplied the renderer materialises a deduped <defs> entry and references it
  // via url(#…). (Types declared later in this file.)
  fill?: string | LinearGradient | RadialGradient | Pattern;
  stroke?: string | LinearGradient | RadialGradient | Pattern;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  // `true` keeps the legacy always-on drop-shadow VNode; a Shadow SPEC OBJECT
  // materialises an SVG feDropShadow <filter> referenced via url(#…).
  shadow?: boolean | Shadow;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string; // normal, bold, etc.
  fontStyle?: string; // normal, italic, oblique
  textDecoration?: string; // underline, overline, line-through
  color?: string;
  padding?: number;
  zIndex?: number;
  // Phase 1: Border animations
  animatedBorder?: boolean;
  borderAnimationType?: 'gradient' | 'pulse' | 'breathe' | 'shimmer' | 'none';
  borderAnimationSpeed?: number;  // Duration in seconds
  borderAnimationColors?: string[];  // For gradient animations
}

export interface PortPosition {
  x: number; // 0-1 relative position
  y: number; // 0-1 relative position
}

export interface PortAlignment {
  side: 'left' | 'right' | 'top' | 'bottom';
  offset: number; // Pixels from edge
}

export interface LinkState {
  selected: boolean;
  hovered: boolean;
  highlighted: boolean;
  animated?: boolean;
}

// Phase 1.3: Jump point configuration
export interface JumpPointConfig {
  enabled: boolean;
  size?: number;          // Arc/gap size in pixels (default: 10)
  style?: 'arc' | 'gap' | 'bridge';  // Visual style (default: 'arc')
  detectMode?: 'all' | 'perpendicular' | 'threshold';  // Detection mode (default: 'all')
  threshold?: number;     // Angle threshold for perpendicular mode (default: 45 degrees)
}

export interface LinkStyle {
  /**
   * Extra CSS class(es) put verbatim on the rendered path, alongside
   * `diagram-link` and the state classes. Host-CSS hook; never read back.
   */
  className?: string;
  /**
   * Name(s) of NAMED STYLES to apply — the classDef / linkStyle equivalent.
   * Space-separated (later names win). See NodeStyle.styleClass; identical
   * cascade: theme < type-default < named-class < element-inline < state.
   */
  styleClass?: string;
  // Phase 4 (styling & theming): stroke accepts a paint-server SPEC OBJECT
  // (gradient/pattern) as well as a plain colour string — materialised as a
  // deduped <defs> entry and referenced via url(#…).
  stroke?: string | LinearGradient | RadialGradient | Pattern;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  arrowHead?: ArrowStyle;
  arrowTail?: ArrowStyle;
  /**
   * Wave 3 (Edges & links): smooth/bezier curve TIGHTNESS, as a multiplier of
   * the endpoint distance for the control-point offset. Default `0.5`
   * (unchanged legacy behaviour); `0` collapses the curve onto its chord,
   * larger values bulge harder. Honoured by both LinkModel.generateSmoothPath
   * and the SVG renderer's control-point maths, so a link looks the same
   * however its path was produced.
   */
  curvature?: number;
  /**
   * Wave 3 (Edges & links): PER-LINK orthogonal corner radius (px). Defaults to
   * the renderer's built-ins (5px for `orthogonal`, 12px for the rounded
   * fallback a `smooth` detour falls back to). `0` gives hard 90° corners.
   *
   * Safe at any size: every bend is clamped to half the shorter adjacent
   * segment. When the link also draws jump points, the radius is additionally
   * clamped (never below the built-in default) so the jump arcs keep a legal
   * window clear of the corners — jumps win over an oversized radius.
   */
  cornerRadius?: number;
  // Phase 1.3: Jump points
  jumpPoints?: JumpPointConfig;
  // Phase 4: Advanced styling
  gradient?: LinearGradient | RadialGradient;
  pattern?: Pattern;
  shadow?: Shadow;
  animation?: LinkAnimation;
  markers?: Marker[];  // Markers along the path
}

// Phase 4: Gradient types
export interface LinearGradient {
  type: 'linear';
  x1: number;  // 0-1 normalized
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

export interface RadialGradient {
  type: 'radial';
  cx: number;  // 0-1 normalized center
  cy: number;
  r: number;   // radius
  stops: GradientStop[];
}

export interface GradientStop {
  offset: number;  // 0-1
  color: string;
  opacity?: number;
}

// Phase 4: Pattern for fills
export interface Pattern {
  type: 'dots' | 'lines' | 'grid' | 'hatch' | 'crosshatch';
  color?: string;
  backgroundColor?: string;
  size?: number;
  spacing?: number;
}

// Phase 4: Shadow effect
export interface Shadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

// Phase 1 & 4: Animation
export interface LinkAnimation {
  // Phase 1: New animation types
  type: 'marching-ants' | 'flow' | 'pulse' | 'dash-flow' | 'none';
  duration?: number;  // milliseconds
  dashOffset?: number;
  // Phase 1: Animation control
  speed?: 'slow' | 'normal' | 'fast';
  direction?: 'forward' | 'reverse';
}

// Phase 4: Markers along path
export interface Marker {
  type: 'arrow' | 'circle' | 'square' | 'custom';
  position: number;  // 0-1 along path
  size?: number;
  color?: string;
}

export interface ArrowStyle {
  type: 'none' | 'arrow' | 'circle' | 'square' | 'diamond'
    // Phase 4: ERD-specific arrows
    | 'crow-foot'           // ERD many relationship (⋈)
    | 'one'                 // ERD one relationship (|)
    | 'zero-or-one'         // ERD optional relationship (O|)
    | 'zero-or-many'        // ERD optional many (O⋈)
    | 'one-or-many'         // ERD mandatory many (|⋈)
    // Phase 4: UML-specific arrows
    | 'hollow-diamond'      // UML aggregation (◇)
    | 'filled-diamond'      // UML composition (◆)
    | 'generalization'      // UML inheritance (△)
    | 'open-arrow'          // UML dependency/realization (⊳)
    | 'double-arrow'        // Bidirectional (⇄)
    // Phase 4: Additional arrows
    | 'cross'               // X mark
    | 'bar'                 // Perpendicular line (⊥)
    | 'dot'                 // Simple dot
    | 'oval';               // Oval shape
  size: number;
  filled: boolean;
  // Phase 4: Advanced arrow properties
  width?: number;           // Arrow width (independent of size)
  offset?: number;          // Distance from node edge
  color?: string;           // Override link color
}

export interface LinkLabel {
  id: string;
  text: string;
  position: number; // 0-1 along the link
  offset: Point;    // Offset from link
  style?: LabelStyle;
  // Phase 4: Advanced label features
  rotation?: 'auto' | number;        // Auto-rotate with path or fixed angle
  rotationOffset?: number;           // Additional rotation offset (degrees)
  keepUpright?: boolean;             // Flip label if upside down
  textAnchor?: 'start' | 'middle' | 'end';  // Horizontal alignment
  textBaseline?: 'top' | 'middle' | 'bottom';  // Vertical alignment
  textWrap?: boolean;                // Enable multi-line wrapping
  maxWidth?: number;                 // Maximum width before wrapping
  autoOffset?: boolean;              // Auto-position to avoid overlaps
  segmentIndex?: number;             // Place on specific segment
}

export interface LabelStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  background?: string;
  padding?: number;
  borderRadius?: number;
  // Phase 4: Advanced label styling
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  fontStyle?: 'normal' | 'italic' | 'oblique';
  textDecoration?: 'none' | 'underline' | 'overline' | 'line-through';
  border?: string;                   // Border style
  borderWidth?: number;
  shadow?: Shadow;
  opacity?: number;
  lineHeight?: number;               // For multi-line labels
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error';
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  severity: 'warning';
}

import { Point } from './geometry.types';
