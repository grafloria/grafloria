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
  focused: boolean;
  expanded: boolean;
  enabled: boolean;
  error?: string;
  warning?: string;
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
}

export interface NodeStyle {
  shape?: string; // Shape type (rectangle, circle, diamond, etc.)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  shadow?: boolean;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string; // normal, bold, etc.
  fontStyle?: string; // normal, italic, oblique
  textDecoration?: string; // underline, overline, line-through
  color?: string;
  padding?: number;
  zIndex?: number;
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
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  arrowHead?: ArrowStyle;
  arrowTail?: ArrowStyle;
  curvature?: number;
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

// Phase 4: Animation
export interface LinkAnimation {
  type: 'dash-flow' | 'pulse' | 'none';
  duration?: number;  // milliseconds
  dashOffset?: number;
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
