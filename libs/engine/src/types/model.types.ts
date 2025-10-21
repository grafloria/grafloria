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
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  shadow?: boolean;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
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

export interface LinkStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  arrowHead?: ArrowStyle;
  arrowTail?: ArrowStyle;
  curvature?: number;
}

export interface ArrowStyle {
  type: 'none' | 'arrow' | 'circle' | 'square' | 'diamond';
  size: number;
  filled: boolean;
}

export interface LinkLabel {
  id: string;
  text: string;
  position: number; // 0-1 along the link
  offset: Point;    // Offset from link
  style?: LabelStyle;
}

export interface LabelStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  background?: string;
  padding?: number;
  borderRadius?: number;
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
